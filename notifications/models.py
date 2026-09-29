from django.conf import settings
from django.db import models


class Notification(models.Model):
    class NotificationType(models.TextChoices):
        TASK_ASSIGNED = "TASK_ASSIGNED", "Task Assigned"
        TASK_UPDATED = "TASK_UPDATED", "Task Updated"
        TASK_COMPLETED = "TASK_COMPLETED", "Task Completed"
        TASK_DEADLINE = "TASK_DEADLINE", "Task Deadline"
        TASK_REASSIGNED = "TASK_REASSIGNED", "Task Reassigned"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,   # notifications are meaningless without their owner
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    notification_type = models.CharField(max_length=20, choices=NotificationType.choices)
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_read"])]

    def __str__(self):
        return f"{self.notification_type} -> {self.user}"