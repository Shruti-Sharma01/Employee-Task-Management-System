from rest_framework import serializers

from accounts.models import User
from employees.models import Employee

from .models import Task, TaskActivity, TaskAttachment, TaskComment, TimeEntry


class TaskSerializer(serializers.ModelSerializer):
    """Read-only output with readable nested info."""

    assigned_to = serializers.SerializerMethodField()
    assigned_by = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    completed_duration_seconds = serializers.SerializerMethodField()
    total_duration_seconds = serializers.SerializerMethodField()
    active_timer = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "assigned_to", "assigned_by",
            "priority", "status", "status_reason", "category", "start_date", "deadline",
            "accepted_at", "completed_at", "rejected_at", "aborted_at",
            "is_overdue", "completed_duration_seconds", "total_duration_seconds", "active_timer",
            "created_at", "updated_at",
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

    def get_completed_duration_seconds(self, obj):
        from django.db.models import Sum
        return obj.time_entries.filter(end_time__isnull=False).aggregate(total=Sum("duration_seconds"))["total"] or 0

    def get_total_duration_seconds(self, obj):
        from django.db.models import Sum
        from django.utils import timezone
        completed = obj.time_entries.filter(end_time__isnull=False).aggregate(total=Sum("duration_seconds"))["total"] or 0
        now = timezone.now()
        active_secs = 0
        for ae in obj.time_entries.filter(end_time__isnull=True):
            if ae.start_time:
                active_secs += max(0, int((now - ae.start_time).total_seconds()))
        return completed + active_secs

    def get_active_timer(self, obj):
        request = self.context.get("request")
        user = request.user if request and request.user.is_authenticated else None
        active = None
        if user:
            active = obj.time_entries.filter(user=user, end_time__isnull=True).first()
        if not active:
            active = obj.time_entries.filter(end_time__isnull=True).first()
        if active:
            return {
                "id": active.id,
                "start_time": active.start_time.isoformat(),
                "description": active.description,
                "user_id": active.user_id,
            }
        return None


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
                # Team check: employee must belong to this manager's team (either direct reporting or same department)
                is_same_team = (
                    employee.manager_id == profile.pk or
                    (
                        employee.department and profile.department and
                        employee.department.strip().lower() == profile.department.strip().lower()
                    )
                )
                if not is_same_team:
                    raise serializers.ValidationError(
                        "You can only assign tasks to employees in your team."
                    )
                # Automatically link employee to manager if not already linked
                if employee.manager_id is None and employee.pk != profile.pk:
                    employee.manager = profile
                    employee.save(update_fields=["manager"])
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
                if cur_status in (Task.Status.COMPLETED, Task.Status.REJECTED, Task.Status.ABORTED, Task.Status.CANCELLED):
                    raise serializers.ValidationError({"status": f"This task is locked ({self.instance.get_status_display()}) and cannot be modified."})
                if cur_status == Task.Status.PENDING:
                    raise serializers.ValidationError({"status": "Pending tasks must be accepted or rejected before status can be changed."})
                if cur_status == Task.Status.IN_PROGRESS and new_status != Task.Status.COMPLETED:
                    raise serializers.ValidationError({"status": "From In Progress, employees can only transition the task to Completed."})
                if new_status == Task.Status.CANCELLED:
                    raise serializers.ValidationError({"status": "Only managers and admins can cancel a task."})
                if new_status in (Task.Status.REJECTED, Task.Status.ABORTED):
                    raise serializers.ValidationError({"status": f"Employees cannot set {new_status} via normal status update."})

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

    def validate(self, attrs):
        cur_status = self.instance.status if self.instance else None
        if cur_status in (Task.Status.COMPLETED, Task.Status.REJECTED, Task.Status.ABORTED, Task.Status.CANCELLED):
            raise serializers.ValidationError({"status": f"This task is locked ({self.instance.get_status_display()}) and cannot be modified."})
        return super().validate(attrs)

    def validate_status(self, value):
        cur_status = self.instance.status if self.instance else None

        # 1. Locked terminal statuses
        if cur_status in (Task.Status.COMPLETED, Task.Status.REJECTED, Task.Status.ABORTED, Task.Status.CANCELLED):
            raise serializers.ValidationError(f"This task is locked ({self.instance.get_status_display()}) and cannot be modified.")

        # 2. Pending tasks cannot transition via generic update
        if cur_status == Task.Status.PENDING:
            raise serializers.ValidationError("Pending tasks must be accepted or rejected before status can be changed.")

        # 3. In the generic task update endpoint, for employees allow only IN_PROGRESS -> COMPLETED
        if cur_status == Task.Status.IN_PROGRESS:
            if value != Task.Status.COMPLETED:
                raise serializers.ValidationError("From In Progress, employees can only transition the task to Completed.")
            return value

        raise serializers.ValidationError("Invalid status transition for employee.")
    
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


class TimeEntrySerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    task_title = serializers.CharField(source="task.title", read_only=True)

    class Meta:
        model = TimeEntry
        fields = [
            "id", "task", "task_title", "user", "start_time", "end_time",
            "duration_seconds", "description", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "task", "user", "duration_seconds", "created_at", "updated_at"]

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


class TimeEntryUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeEntry
        fields = ["description", "start_time", "end_time", "duration_seconds"]

    def validate(self, attrs):
        start = attrs.get("start_time", getattr(self.instance, "start_time", None))
        end = attrs.get("end_time", getattr(self.instance, "end_time", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_time": "End time cannot be earlier than start time."})
        if start and end:
            attrs["duration_seconds"] = max(0, int((end - start).total_seconds()))
        return attrs
