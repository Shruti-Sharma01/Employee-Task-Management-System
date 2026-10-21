from rest_framework import serializers

from accounts.models import User
from employees.models import Employee

from .models import Task, TaskActivity, TaskAttachment, TaskComment


class TaskSerializer(serializers.ModelSerializer):
    """Read-only output with readable nested info."""

    assigned_to = serializers.SerializerMethodField()
    assigned_by = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "assigned_to", "assigned_by",
            "priority", "status", "category", "start_date", "deadline",
            "accepted_at", "completed_at",
            "is_overdue", "created_at", "updated_at",
        ]

    def get_assigned_to(self, obj):
        e = obj.assigned_to
        return {
            "id": e.id,
            "employee_id": e.employee_id,
            "full_name": e.full_name,
            "user_id": e.user_id if e else None,
        } if e else None

    def get_assigned_by(self, obj):
        u = obj.assigned_by
        return {"id": u.id, "username": u.username, "role": u.role} if u else None

    def get_is_overdue(self, obj):
        from django.utils import timezone
        return bool(
            obj.deadline
            and obj.deadline < timezone.localdate()
            and obj.status in (Task.Status.PENDING, Task.Status.IN_PROGRESS)
        )


class TaskWriteSerializer(serializers.ModelSerializer):
    """Input for create and update."""

    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Task
        fields = [
            "title", "description", "assigned_to", "priority",
            "status", "category", "start_date", "deadline"
        ]

    def validate_assigned_to(self, employee):
        if employee is None:
            return employee
        if not employee.is_active:
            raise serializers.ValidationError("Cannot assign a task to an inactive employee.")

        request = self.context.get("request")
        if request and request.user:
            user = request.user
            # EMPLOYEE cannot assign tasks at all
            if user.role == User.Role.EMPLOYEE:
                raise serializers.ValidationError(
                    "Employees are not permitted to create or assign tasks."
                )
            elif user.role == User.Role.MANAGER:
                profile = getattr(user, "employee_profile", None)
                if profile is None:
                    from employees.models import Employee
                    from django.utils import timezone
                    emp_id = f"EMP{user.id:04d}"
                    full_name = f"{user.first_name} {user.last_name}".strip() or user.username
                    profile, _ = Employee.objects.get_or_create(
                        user=user,
                        defaults={
                            "employee_id": emp_id,
                            "full_name": full_name,
                            "email": user.email or f"{user.username}@company.com",
                            "department": "Management",
                            "designation": "Manager",
                            "joining_date": timezone.localdate(),
                        }
                    )
                # Manager cannot assign tasks to Admins or other Managers
                if employee.user and employee.user.role in (User.Role.ADMIN, User.Role.MANAGER) and employee.pk != profile.pk:
                    raise serializers.ValidationError(
                        "Managers can only assign tasks to employees, not to other managers or admins."
                    )
                # Team check: employee must belong to this manager's team
                if employee.manager_id != profile.pk:
                    raise serializers.ValidationError(
                        "You can only assign tasks to employees in your team."
                    )
        return employee

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user if request else None

        # Manager must select an employee when creating a new task
        if not self.instance and user and user.role == User.Role.MANAGER:
            if "assigned_to" not in attrs or attrs.get("assigned_to") is None:
                raise serializers.ValidationError({"assigned_to": "Please select an employee to assign this task to."})

        # Transition guards on update
        if self.instance and "status" in attrs:
            new_status = attrs["status"]
            cur_status = self.instance.status
            if cur_status == Task.Status.PENDING and new_status == Task.Status.COMPLETED:
                raise serializers.ValidationError({"status": "Pending tasks must be accepted before they can be marked completed."})
            if user and user.role == User.Role.EMPLOYEE:
                if cur_status == Task.Status.PENDING and new_status != Task.Status.PENDING:
                    raise serializers.ValidationError({"status": "Pending tasks must be accepted first before status can be changed."})
                if new_status == Task.Status.PENDING and cur_status != Task.Status.PENDING:
                    raise serializers.ValidationError({"status": "Cannot move task backwards to pending."})
                if new_status == Task.Status.CANCELLED:
                    raise serializers.ValidationError({"status": "Only managers and admins can cancel a task."})

        # On PATCH, fall back to the values already saved on the task.
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if start and deadline and deadline < start:
            raise serializers.ValidationError({"deadline": "Deadline cannot be before the start date."})
        return attrs

    def create(self, validated_data):
        # Force status to PENDING on task creation
        validated_data["status"] = Task.Status.PENDING
        return super().create(validated_data)


class TaskStatusSerializer(serializers.ModelSerializer):
    """Input for EMPLOYEE: the only thing they may change is the status."""

    class Meta:
        model = Task
        fields = ["status"]

    def validate_status(self, value):
        cur_status = self.instance.status if self.instance else None
        request = self.context.get("request")
        user = request.user if request else None

        # 1. pending -> can only change via the accept endpoint
        if cur_status == Task.Status.PENDING:
            raise serializers.ValidationError("Pending tasks must be accepted before status can be changed.")

        # 2. Cannot move backwards to pending
        if value == Task.Status.PENDING and cur_status != Task.Status.PENDING:
            raise serializers.ValidationError("Cannot move task backwards to pending.")

        # 3. Cancelled can only be set by manager/admin
        if value == Task.Status.CANCELLED:
            raise serializers.ValidationError("Employees cannot cancel a task. Only managers and admins can cancel.")

        if cur_status == Task.Status.CANCELLED:
            raise serializers.ValidationError("This task was cancelled and can't be changed.")

        # 4. in_progress -> completed is allowed for assigned employee
        if cur_status == Task.Status.IN_PROGRESS and value not in (Task.Status.IN_PROGRESS, Task.Status.COMPLETED):
            raise serializers.ValidationError("From In Progress, you can only move the task to Completed.")

        # 5. Completed cannot move backwards
        if cur_status == Task.Status.COMPLETED and value != Task.Status.COMPLETED:
            raise serializers.ValidationError("Completed tasks cannot be moved backwards.")

        return value
    
class TaskCommentSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()  # read-only by nature

    class Meta:
        model = TaskComment
        fields = ["id", "task", "user", "comment", "created_at", "updated_at"]
        read_only_fields = ["id", "task", "created_at", "updated_at"]

    def get_user(self, obj):
        u = obj.user
        return {"id": u.id, "username": u.username, "role": u.role} if u else None


class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.SerializerMethodField()

    class Meta:
        model = TaskAttachment
        fields = ["id", "task", "uploaded_by", "file", "file_name", "uploaded_at"]
        read_only_fields = ["id", "task", "file_name", "uploaded_at"]

    def get_uploaded_by(self, obj):
        u = obj.uploaded_by
        return {"id": u.id, "username": u.username, "role": u.role} if u else None


class TaskActivitySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()

    class Meta:
        model = TaskActivity
        fields = ["id", "task", "user", "action", "message", "created_at"]
        read_only_fields = ["id", "task", "user", "action", "message", "created_at"]

    def get_user(self, obj):
        u = obj.user
        if not u:
            return None
        full_name = f"{u.first_name} {u.last_name}".strip() or u.username
        return {
            "id": u.id,
            "username": u.username,
            "full_name": full_name,
            "role": u.role,
        }