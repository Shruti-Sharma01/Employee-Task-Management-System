import os

from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser

from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated

from accounts.models import User
from accounts.permissions import IsAdmin, IsAdminOrManager
from etms.responses import success_response

from .filters import TaskFilter
from .models import Task
from .serializers import TaskSerializer, TaskStatusSerializer, TaskWriteSerializer

from .models import Task, TaskAttachment, TaskComment
from .serializers import (
    TaskAttachmentSerializer,
    TaskCommentSerializer,
    TaskSerializer,
    TaskStatusSerializer,
    TaskWriteSerializer,
)

def visible_tasks_for(user):
    """The single place that decides which tasks a user is allowed to see."""
    tasks = Task.objects.select_related("assigned_to", "assigned_by")

    if user.role == User.Role.ADMIN:
        return tasks

    from django.db.models import Q
    profile = getattr(user, "employee_profile", None)  # None if no Employee record

    if user.role == User.Role.MANAGER:
        if profile is None:
            return tasks.filter(assigned_by=user)
        return tasks.filter(Q(assigned_to__manager=profile) | Q(assigned_by=user))

    # EMPLOYEE: tasks assigned to them OR tasks created by them
    if profile:
        return tasks.filter(Q(assigned_to=profile) | Q(assigned_by=user))
    return tasks.filter(assigned_by=user)


class BaseTaskListView(generics.ListAPIView):
    """Shared behaviour for all the task list endpoints."""

    serializer_class = TaskSerializer
    filterset_class = TaskFilter
    search_fields = ["title"]
    ordering_fields = ["deadline", "priority", "status", "created_at"]
    list_message = "Tasks fetched successfully"

    def get_queryset(self):
        return visible_tasks_for(self.request.user)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)  # paginated + filtered
        return success_response(self.list_message, response.data)


class TaskListCreateView(BaseTaskListView):
    """GET /api/tasks/  and  POST /api/tasks/"""

    def get_permissions(self):
        return [IsAuthenticated()]

    def post(self, request, *args, **kwargs):
        serializer = TaskWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(assigned_by=request.user)  # who created it is set to request.user

        # Auto-create notification for assigned employee (only if assigned to someone else)
        try:
            if task.assigned_to and task.assigned_to.user and task.assigned_to.user != request.user:
                from notifications.models import Notification
                Notification.objects.create(
                    user=task.assigned_to.user,
                    title="New Task Assigned",
                    message=f"You have been assigned a new task: \"{task.title}\" "
                            f"by {request.user.get_full_name() or request.user.email}. "
                            f"Deadline: {task.deadline or 'Not set'}.",
                    notification_type=Notification.NotificationType.TASK_ASSIGNED,
                )
        except Exception:
            pass  # Never let notification failure break task creation

        return success_response("Task created successfully",
                                TaskSerializer(task).data, status.HTTP_201_CREATED)


class MyTasksView(BaseTaskListView):
    """GET /api/tasks/my-tasks/ - tasks assigned to me (any role that has an Employee profile)."""
    list_message = "My tasks fetched successfully"

    def get_queryset(self):
        profile = getattr(self.request.user, "employee_profile", None)
        tasks = Task.objects.select_related("assigned_to", "assigned_by")
        return tasks.filter(assigned_to=profile) if profile else tasks.none()


class OverdueTasksView(BaseTaskListView):
    """GET /api/tasks/overdue/"""
    list_message = "Overdue tasks fetched successfully"

    def get_queryset(self):
        return super().get_queryset().overdue()


class CompletedTasksView(BaseTaskListView):
    """GET /api/tasks/completed/"""
    list_message = "Completed tasks fetched successfully"

    def get_queryset(self):
        return super().get_queryset().completed()


class PendingTasksView(BaseTaskListView):
    """GET /api/tasks/pending/"""
    list_message = "Pending tasks fetched successfully"

    def get_queryset(self):
        return super().get_queryset().pending()


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET / PUT / PATCH / DELETE  /api/tasks/<id>/"""

    serializer_class = TaskSerializer

    def get_queryset(self):
        # Unauthorised tasks simply don't exist for this user (404), which
        # also hides whether the task exists at all.
        return visible_tasks_for(self.request.user)

    def get_permissions(self):
        return [IsAuthenticated()]

    def retrieve(self, request, *args, **kwargs):
        return success_response("Task fetched successfully", TaskSerializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        task = self.get_object()

        is_creator = task.assigned_by_id == request.user.id
        if request.user.role == User.Role.EMPLOYEE and not is_creator:
            if set(request.data.keys()) - {"status"}:
                raise PermissionDenied("Employees can only update the task status.")
            serializer = TaskStatusSerializer(task, data=request.data)
        else:
            serializer = TaskWriteSerializer(
                task, data=request.data, partial=partial, context={"request": request}
            )

        serializer.is_valid(raise_exception=True)
        old_status = task.status  # capture before save
        task = serializer.save()

        # Auto-create notifications after update
        try:
            from notifications.models import Notification
            new_status = task.status

            # Notify creator when employee marks task completed
            if old_status != "COMPLETED" and new_status == "COMPLETED":
                if task.assigned_by and task.assigned_by != request.user:
                    Notification.objects.create(
                        user=task.assigned_by,
                        title="Task Completed ✅",
                        message=f"\"{task.title}\" has been marked as completed by "
                                f"{request.user.get_full_name() or request.user.email}.",
                        notification_type=Notification.NotificationType.TASK_COMPLETED,
                    )

            # Notify assigned employee when their task is updated by someone else
            elif task.assigned_to and task.assigned_to.user and task.assigned_to.user != request.user:
                Notification.objects.create(
                    user=task.assigned_to.user,
                    title="Task Updated",
                    message=f"Your task \"{task.title}\" has been updated by "
                            f"{request.user.get_full_name() or request.user.email}.",
                    notification_type=Notification.NotificationType.TASK_UPDATED,
                )
        except Exception:
            pass  # Never let notification failure break task update

        return success_response("Task updated successfully", TaskSerializer(task).data)

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        is_creator = task.assigned_by_id == request.user.id
        if request.user.role == User.Role.EMPLOYEE and not is_creator and request.user.role != User.Role.ADMIN:
            raise PermissionDenied("You can only delete tasks you created.")
        task.delete()
        return success_response("Task deleted successfully", status_code=status.HTTP_204_NO_CONTENT)
    
    # ---------------------------------------------------------------
# Comments
# ---------------------------------------------------------------
class TaskCommentListCreateView(generics.ListCreateAPIView):
    """GET / POST  /api/tasks/<task_id>/comments/"""

    serializer_class = TaskCommentSerializer

    def get_task(self):
        # 404 if the task doesn't exist OR this user isn't allowed to see it.
        return get_object_or_404(visible_tasks_for(self.request.user), pk=self.kwargs["task_id"])

    def get_queryset(self):
        return TaskComment.objects.filter(task=self.get_task()).select_related("user")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return success_response("Comments fetched successfully", response.data)

    def create(self, request, *args, **kwargs):
        task = self.get_task()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(task=task, user=request.user)

        # Notify the other party about the new comment
        try:
            from notifications.models import Notification
            recipient = None
            if task.assigned_to and task.assigned_to.user == request.user:
                if task.assigned_by and task.assigned_by != request.user:
                    recipient = task.assigned_by
            else:
                if task.assigned_to and task.assigned_to.user and task.assigned_to.user != request.user:
                    recipient = task.assigned_to.user

            if recipient:
                sender_name = request.user.get_full_name() or request.user.username
                comment_preview = comment.comment[:80] + ("..." if len(comment.comment) > 80 else "")
                Notification.objects.create(
                    user=recipient,
                    title=f"New comment on: {task.title}",
                    message=f"{sender_name}: \"{comment_preview}\"",
                    notification_type=Notification.NotificationType.TASK_UPDATED,
                )
        except Exception:
            pass  # Never let notification failure break comment creation

        return success_response("Comment added successfully",
                                TaskCommentSerializer(comment).data, status.HTTP_201_CREATED)


class CommentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """PUT / DELETE  /api/comments/<id>/  (PATCH also works; GET is switched off)"""

    serializer_class = TaskCommentSerializer
    http_method_names = ["put", "patch", "delete", "options"]

    def get_queryset(self):
        # Only comments on tasks this user is allowed to see.
        return TaskComment.objects.filter(
            task__in=visible_tasks_for(self.request.user)
        ).select_related("user")

    def update(self, request, *args, **kwargs):
        comment = self.get_object()
        if comment.user_id != request.user.id:
            raise PermissionDenied("You can only edit your own comments.")
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(comment, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save()
        return success_response("Comment updated successfully", TaskCommentSerializer(comment).data)

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        if comment.user_id != request.user.id and request.user.role != User.Role.ADMIN:
            raise PermissionDenied("You can only delete your own comments.")
        comment.delete()
        return success_response("Comment deleted successfully", status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------
# Attachments
# ---------------------------------------------------------------
class TaskAttachmentListCreateView(generics.ListCreateAPIView):
    """GET / POST  /api/tasks/<task_id>/attachments/"""

    serializer_class = TaskAttachmentSerializer
    parser_classes = [MultiPartParser, FormParser]  # needed for file uploads

    def get_task(self):
        return get_object_or_404(visible_tasks_for(self.request.user), pk=self.kwargs["task_id"])

    def get_queryset(self):
        return TaskAttachment.objects.filter(task=self.get_task()).select_related("uploaded_by")

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        return success_response("Attachments fetched successfully", response.data)

    def create(self, request, *args, **kwargs):
        task = self.get_task()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)  # runs the type + size validator
        original_name = os.path.basename(serializer.validated_data["file"].name)
        attachment = serializer.save(task=task, uploaded_by=request.user, file_name=original_name[:255])
        return success_response(
            "Attachment uploaded successfully",
            self.get_serializer(attachment).data,
            status.HTTP_201_CREATED,
        )


class AttachmentDeleteView(generics.DestroyAPIView):
    """DELETE /api/attachments/<id>/"""

    def get_queryset(self):
        return TaskAttachment.objects.filter(task__in=visible_tasks_for(self.request.user))

    def destroy(self, request, *args, **kwargs):
        attachment = self.get_object()
        if attachment.uploaded_by_id != request.user.id and request.user.role != User.Role.ADMIN:
            raise PermissionDenied("You can only delete attachments you uploaded.")
        attachment.file.delete(save=False)  # remove the actual file from the media folder
        attachment.delete()                 # then remove the database row
        return success_response("Attachment deleted successfully", status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------
# CSV Export
# ---------------------------------------------------------------
import csv
from django.http import HttpResponse
from rest_framework.views import APIView


class TaskExportCSVView(APIView):
    """GET /api/tasks/export/
    Returns a CSV of all tasks visible to the current user.
    Supports the same query params as TaskListCreateView:
      ?status=PENDING&priority=HIGH&search=...
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = visible_tasks_for(request.user).select_related(
            "assigned_to__user", "assigned_by"
        )

        # ── Apply optional filters ─────────────────────────────────────────
        status_param   = request.query_params.get("status")
        priority_param = request.query_params.get("priority")
        search_param   = request.query_params.get("search")

        if status_param and status_param.upper() in [c[0] for c in Task.Status.choices]:
            qs = qs.filter(status=status_param.upper())

        if priority_param and priority_param.upper() in [c[0] for c in Task.Priority.choices]:
            qs = qs.filter(priority=priority_param.upper())

        if search_param:
            qs = qs.filter(title__icontains=search_param)

        # ── Build CSV ──────────────────────────────────────────────────────
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="etms_tasks.csv"'

        writer = csv.writer(response)
        writer.writerow([
            "Task ID", "Title", "Description", "Category",
            "Priority", "Status",
            "Assigned To", "Assigned By",
            "Start Date", "Deadline", "Completed At",
            "Created At",
        ])

        for task in qs:
            assigned_to_name = ""
            if task.assigned_to:
                assigned_to_name = task.assigned_to.full_name or getattr(
                    task.assigned_to.user, "get_full_name", lambda: ""
                )()

            assigned_by_name = ""
            if task.assigned_by:
                assigned_by_name = task.assigned_by.get_full_name() or task.assigned_by.username

            writer.writerow([
                task.pk,
                task.title,
                task.description,
                task.category,
                task.get_priority_display(),
                task.get_status_display(),
                assigned_to_name,
                assigned_by_name,
                task.start_date or "",
                task.deadline or "",
                task.completed_at.strftime("%Y-%m-%d %H:%M") if task.completed_at else "",
                task.created_at.strftime("%Y-%m-%d %H:%M"),
            ])

        return response