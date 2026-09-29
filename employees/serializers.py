from rest_framework import serializers

from accounts.models import User
from accounts.serializers import UserProfileSerializer

from .models import Employee


class EmployeeSerializer(serializers.ModelSerializer):
    """Used for reading (list/retrieve) - shows nested, readable info."""

    user = UserProfileSerializer(read_only=True)
    manager_name = serializers.CharField(source="manager.full_name", read_only=True, default=None)

    class Meta:
        model = Employee
        fields = [
            "id", "user", "employee_id", "full_name", "email", "phone",
            "department", "designation", "manager", "manager_name",
            "joining_date", "profile_image", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class EmployeeWriteSerializer(serializers.ModelSerializer):
    """Used for create/update. Accepts the linked user's id directly."""

    user = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = Employee
        fields = [
            "user", "employee_id", "full_name", "email", "phone",
            "department", "designation", "manager", "joining_date",
            "profile_image", "is_active",
        ]

    def validate_user(self, value):
        # Enforce the one-to-one relationship with a clear error message.
        is_update = self.instance is not None
        already_linked = Employee.objects.filter(user=value).exclude(
            pk=self.instance.pk if is_update else None
        ).exists()
        if already_linked:
            raise serializers.ValidationError("This user already has an employee profile.")
        return value

    def validate_manager(self, value):
        if value and self.instance and value.pk == self.instance.pk:
            raise serializers.ValidationError("An employee cannot be their own manager.")
        return value