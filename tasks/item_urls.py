from django.urls import path

from .views import AttachmentDeleteView, CommentDetailView

urlpatterns = [
    path("comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),
    path("attachments/<int:pk>/", AttachmentDeleteView.as_view(), name="attachment-detail"),
]