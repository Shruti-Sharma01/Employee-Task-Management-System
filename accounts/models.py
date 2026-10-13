from django.contrib.auth.models import AbstractUser, UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    """Makes `createsuperuser` automatically give the ADMIN role."""

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", "ADMIN")
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    """Django's built-in user, plus a role and a unique email."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Admin"
        MANAGER = "MANAGER", "Manager"
        EMPLOYEE = "EMPLOYEE", "Employee"

    email = models.EmailField("email address", unique=True)
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.EMPLOYEE,
        db_index=True,  # we will filter by role often
    )

    objects = UserManager()

    def __str__(self):
        return f"{self.username} ({self.role})"


class PasswordResetOTP(models.Model):
    """Stores OTP codes for forgot password verification."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_otps")
    otp = models.CharField(max_length=6)
    reset_token = models.CharField(max_length=64, unique=True, db_index=True)
    is_verified = models.BooleanField(default=False)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def is_expired(self):
        from datetime import timedelta
        from django.utils import timezone
        return (timezone.now() - self.created_at) > timedelta(minutes=10)

    def is_valid(self):
        return not self.is_used and not self.is_expired()

    def __str__(self):
        return f"OTP for {self.user.email} [{self.otp}]"