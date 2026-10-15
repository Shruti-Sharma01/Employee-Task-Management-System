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
            "priority", "status", "category", "start_date", "deadline", "completed_at",
            "is_overdue", "created_at", "updated_at",
        ]

    def get_assigned_to(self, obj):
        e = obj.assigned_to
        return {"id": e.id, "employee_id": e.employee_id, "full_name": e.full_name} if e else None

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
            # EMPLOYEE can only assign tasks to themselves
            if user.role == User.Role.EMPLOYEE:
                profile = getattr(user, "employee_profile", None)
                if profile is None or employee.pk != profile.pk:
                    raise serializers.ValidationError(
                        "Employees can only assign tasks to themselves."
                    )
            elif user.role == User.Role.MANAGER:
                profile = getattr(user, "employee_profile", None)
                if profile is None or (employee.manager_id != profile.pk and employee.pk != profile.pk):
                    raise serializers.ValidationError(
                        "Managers can only assign tasks to their team members or themselves."
                    )
        return employee

    def validate(self, attrs):
        # On PATCH, fall back to the values already saved on the task.
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        deadline = attrs.get("deadline", getattr(self.instance, "deadline", None))
        if start and deadline and deadline < start:
            raise serializers.ValidationError({"deadline": "Deadline cannot be before the start date."})
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        user = request.user if request else None
        if user and ("assigned_to" not in validated_data or validated_data["assigned_to"] is None):
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
                        "department": "General",
                        "designation": user.role.capitalize(),
                        "joining_date": timezone.localdate(),
                    }
                )
            validated_data["assigned_to"] = profile
        return super().create(validated_data)


class TaskStatusSerializer(serializers.ModelSerializer):
    """Input for EMPLOYEE: the only thing they may change is the status."""

    class Meta:
        model = Task
        fields = ["status"]

    def validate_status(self, value):
        if value == Task.Status.CANCELLED:
            raise serializers.ValidationError("Employees cannot cancel a task.")
        if self.instance.status == Task.Status.CANCELLED:
            raise serializers.ValidationError("This task was cancelled and can't be changed.")
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