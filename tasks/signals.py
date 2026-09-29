from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from notifications.models import Notification

from .models import Task


@receiver(pre_save, sender=Task)
def stash_previous_task_state(sender, instance, **kwargs):
    """Before a Task is saved, remember what it looked like before —
    so post_save can tell what actually changed."""
    if instance.pk is None:
        instance._previous = None  # brand-new task, nothing to compare
        return
    try:
        instance._previous = Task.objects.get(pk=instance.pk)
    except Task.DoesNotExist:
        instance._previous = None


def _notify(user, title, message, notification_type):
    if user is None:
        return  # e.g. assigned_to was left blank, or the employee has no linked user
    Notification.objects.create(
        user=user, title=title, message=message, notification_type=notification_type
    )


@receiver(post_save, sender=Task)
def notify_on_task_changes(sender, instance, created, **kwargs):
    task = instance
    previous = getattr(task, "_previous", None)
    assignee_user = task.assigned_to.user if task.assigned_to else None

    if created:
        _notify(
            assignee_user,
            "New task assigned",
            f'You have been assigned a new task: "{task.title}"',
            Notification.NotificationType.TASK_ASSIGNED,
        )
        return

    if previous is None:
        return  # can't compare; nothing more we can safely say

    # Reassigned to a different employee
    if previous.assigned_to_id != task.assigned_to_id:
        _notify(
            assignee_user,
            "Task reassigned to you",
            f'The task "{task.title}" has been reassigned to you.',
            Notification.NotificationType.TASK_REASSIGNED,
        )
        if previous.assigned_to and previous.assigned_to.user:
            _notify(
                previous.assigned_to.user,
                "Task reassigned",
                f'The task "{task.title}" has been reassigned to someone else.',
                Notification.NotificationType.TASK_REASSIGNED,
            )

    # Completed
    elif previous.status != Task.Status.COMPLETED and task.status == Task.Status.COMPLETED:
        _notify(
            task.assigned_by,
            "Task completed",
            f'The task "{task.title}" has been marked as completed.',
            Notification.NotificationType.TASK_COMPLETED,
        )

    # Any other status change (not reassignment, not completion)
    elif previous.status != task.status:
        _notify(
            assignee_user,
            "Task status updated",
            f'The status of "{task.title}" changed to {task.get_status_display()}.',
            Notification.NotificationType.TASK_UPDATED,
        )