from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.views import APIView

from etms.responses import success_response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationListView(generics.ListAPIView):
    """GET /api/notifications/ - the logged-in user's own notifications.
    ?is_read=false narrows to unread ones."""

    serializer_class = NotificationSerializer

    def get_queryset(self):
        queryset = Notification.objects.filter(user=self.request.user)
        is_read = self.request.query_params.get("is_read")
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read.lower() == "true")
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        response.data["unread_count"] = unread_count
        return success_response("Notifications fetched successfully", response.data)


class MarkNotificationReadView(APIView):
    """PATCH /api/notifications/<id>/read/"""

    def patch(self, request, pk):
        # filter(user=request.user) means you can only ever touch your own notification;
        # anyone else's id here just returns 404.
        notification = get_object_or_404(Notification.objects.filter(user=request.user), pk=pk)
        notification.is_read = True
        notification.save(update_fields=["is_read"])
        return success_response("Notification marked as read", NotificationSerializer(notification).data)


class MarkAllNotificationsReadView(APIView):
    """PATCH /api/notifications/read-all/"""

    def patch(self, request):
        updated = Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return success_response(f"{updated} notification(s) marked as read")