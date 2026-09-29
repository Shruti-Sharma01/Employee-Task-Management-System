from django.urls import path

from .views import (
    CompletedTasksView,
    MyTasksView,
    OverdueTasksView,
    PendingTasksView,
    TaskAttachmentListCreateView,
    TaskCommentListCreateView,
    TaskDetailView,
    TaskListCreateView,
)

urlpatterns = [
    path("", TaskListCreateView.as_view(), name="task-list-create"),
    path("my-tasks/", MyTasksView.as_view(), name="task-my-tasks"),
    path("overdue/", OverdueTasksView.as_view(), name="task-overdue"),
    path("completed/", CompletedTasksView.as_view(), name="task-completed"),
    path("pending/", PendingTasksView.as_view(), name="task-pending"),
    path("<int:pk>/", TaskDetailView.as_view(), name="task-detail"),
    path("<int:task_id>/comments/", TaskCommentListCreateView.as_view(), name="task-comments"),
    path("<int:task_id>/attachments/", TaskAttachmentListCreateView.as_view(), name="task-attachments"),
]

from .views import (
    CompletedTasksView,
    MyTasksView,
    OverdueTasksView,
    PendingTasksView,
    TaskDetailView,
    TaskListCreateView,
)

urlpatterns = [
    path("", TaskListCreateView.as_view(), name="task-list-create"),
    path("my-tasks/", MyTasksView.as_view(), name="task-my-tasks"),
    path("overdue/", OverdueTasksView.as_view(), name="task-overdue"),
    path("completed/", CompletedTasksView.as_view(), name="task-completed"),
    path("pending/", PendingTasksView.as_view(), name="task-pending"),
    path("<int:pk>/", TaskDetailView.as_view(), name="task-detail"),
]