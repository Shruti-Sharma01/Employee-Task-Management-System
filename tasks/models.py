import os
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from .validators import validate_attachment


def task_attachment_path(instance, filename):
    """Save uploads under a random name so files can't overwrite each other
    or be guessed from the original name."""
    extension = os.path.splitext(filename)[1].lower()
    return f"task_attachments/task_{instance.task_id}/{uuid.uuid4().hex}{extension}"


class TaskQuerySet(models.QuerySet):
    """Reusable filters. Phase 7 (dashboards) will use these too."""

    def overdue(self):
        """Past its deadline and still not finished."""
        return self.filter(
            deadline__lt=timezone.localdate(),
            status__in=[
                Task.Status.PENDING,
                Task.Status.IN_PROGRESS,
            ],
        )

    def completed(self):
        """Return completed tasks."""
        return self.filter(
            status=Task.Status.COMPLETED
        )

    def pending(self):
        """Return pending tasks."""
        return self.filter(
            status=Task.Status.PENDING
        )


class Task(models.Model):
    class Priority(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    title = models.CharField(
        max_length=200
    )

    description = models.TextField(
        blank=True
    )

    assigned_to = models.ForeignKey(
        "employees.Employee",
        on_delete=models.SET_NULL,
        null=True,
        related_name="tasks",
    )

    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="assigned_tasks",
    )

    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )

    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.PENDING,
    )

    start_date = models.DateField(
        null=True,
        blank=True,
    )

    deadline = models.DateField(
        null=True,
        blank=True,
    )

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    objects = TaskQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]

        indexes = [
            models.Index(
                fields=["status"]
            ),
            models.Index(
                fields=["priority"]
            ),
            models.Index(
                fields=["deadline"]
            ),
            models.Index(
                fields=["assigned_to", "status"]
            ),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}]"

    def save(self, *args, **kwargs):
        """
        Keep completed_at correct no matter where the change
        comes from (API, admin, shell).
        """

        if (
            self.status == self.Status.COMPLETED
            and self.completed_at is None
        ):
            self.completed_at = timezone.now()

        elif self.status != self.Status.COMPLETED:
            self.completed_at = None

        super().save(*args, **kwargs)


class TaskComment(models.Model):
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="comments",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="task_comments",
    )

    comment = models.TextField()

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        ordering = ["created_at"]

        indexes = [
            models.Index(
                fields=["task", "created_at"]
            )
        ]

    def __str__(self):
        return f"Comment by {self.user} on task {self.task_id}"


class TaskAttachment(models.Model):
    task = models.ForeignKey(
        Task,
        on_delete=models.CASCADE,
        related_name="attachments",
    )

    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="task_attachments",
    )

    file = models.FileField(
        upload_to=task_attachment_path,
        max_length=255,
        validators=[validate_attachment],
    )

    file_name = models.CharField(
        max_length=255,
        blank=True,
    )

    uploaded_at = models.DateTimeField(
        auto_now_add=True
    )

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return self.file_name or self.file.name