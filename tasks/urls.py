from django.urls import path

from .views import (
    AttachmentDeleteView,
    CompletedTasksView,
    MyTasksView,
    OverdueTasksView,
    PendingTasksView,
    TaskAttachmentListCreateView,
    TaskCommentListCreateView,
    TaskDetailView,
    TaskExportCSVView,
    TaskExportExcelView,
    TaskExportPDFView,
    TaskListCreateView,
)

urlpatterns = [
    path("", TaskListCreateView.as_view(), name="task-list-create"),
    path("export/csv/",   TaskExportCSVView.as_view(),   name="task-export-csv"),
    path("export/excel/", TaskExportExcelView.as_view(), name="task-export-excel"),
    path("export/pdf/",   TaskExportPDFView.as_view(),   name="task-export-pdf"),
    path("my-tasks/", MyTasksView.as_view(), name="task-my-tasks"),
    path("overdue/", OverdueTasksView.as_view(), name="task-overdue"),
    path("completed/", CompletedTasksView.as_view(), name="task-completed"),
    path("pending/", PendingTasksView.as_view(), name="task-pending"),
    path("<int:pk>/", TaskDetailView.as_view(), name="task-detail"),
    path("<int:task_id>/comments/", TaskCommentListCreateView.as_view(), name="task-comments"),
    path("<int:task_id>/attachments/", TaskAttachmentListCreateView.as_view(), name="task-attachments"),
]