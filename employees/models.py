from django.conf import settings
from django.db import models


class Employee(models.Model):
    """Extra profile information for a User, linked one-to-one."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,   # deleting the User deletes this profile too
        related_name="employee_profile",
    )
    employee_id = models.CharField(max_length=20, unique=True, db_index=True)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=15, blank=True)
    department = models.CharField(max_length=100, db_index=True)
    designation = models.CharField(max_length=100, db_index=True)
    manager = models.ForeignKey(
        "self",                     # a manager is also an Employee
        on_delete=models.SET_NULL,  # if the manager is deleted, don't delete their team
        null=True,
        blank=True,
        related_name="team_members",
    )
    joining_date = models.DateField()
    profile_image = models.ImageField(upload_to="profile_images/", null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return f"{self.full_name} ({self.employee_id})"