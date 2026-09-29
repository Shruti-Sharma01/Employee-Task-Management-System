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

    profile = getattr(user, "employee_profile", None)  # None if no Employee record

    if user.role == User.Role.MANAGER:
        from django.db.models import Q
        if profile is None:
            return tasks.filter(assigned_by=user)
        return tasks.filter(Q(assigned_to__manager=profile) | Q(assigned_by=user))

    # EMPLOYEE: only their own tasks
    return tasks.filter(assigned_to=profile) if profile else tasks.none()


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
        if self.request.method == "POST":
            return [IsAdminOrManager()]
        return [IsAuthenticated()]

    def post(self, request, *args, **kwargs):
        serializer = TaskWriteSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(assigned_by=request.user)  # who created it is never trusted from input
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
        if self.request.method == "DELETE":
            return [IsAdmin()]
        if self.request.method == "PUT":
            return [IsAdminOrManager()]
        return [IsAuthenticated()]  # GET and PATCH; PATCH is limited inside update()

    def retrieve(self, request, *args, **kwargs):
        return success_response("Task fetched successfully", TaskSerializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        task = self.get_object()

        if request.user.role == User.Role.EMPLOYEE:
            if set(request.data.keys()) - {"status"}:
                raise PermissionDenied("Employees can only update the task status.")
            serializer = TaskStatusSerializer(task, data=request.data)  # status required
        else:
            serializer = TaskWriteSerializer(
                task, data=request.data, partial=partial, context={"request": request}
            )

        serializer.is_valid(raise_exception=True)
        task = serializer.save()
        return success_response("Task updated successfully", TaskSerializer(task).data)

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
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