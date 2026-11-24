from django.urls import path

from .views import AttachmentDeleteView, CommentDetailView, TimeEntryDetailView

urlpatterns = [
    path("comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),
    path("attachments/<int:pk>/", AttachmentDeleteView.as_view(), name="attachment-detail"),
    path("time-entries/<int:pk>/", TimeEntryDetailView.as_view(), name="time-entry-detail"),
]
