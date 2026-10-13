"""
Tests for the `notifications` app.

Covers:
- Notification model (__str__, ordering)
- NotificationListView      (list all, filter by is_read)
- MarkNotificationReadView  (own notification, other user's notification)
- MarkAllNotificationsReadView
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from notifications.models import Notification


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(username, email, password="StrongPass1!", role=User.Role.EMPLOYEE):
    return User.objects.create_user(
        username=username, email=email, password=password, role=role
    )


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


def make_notification(user, title="Test", message="Msg",
                      ntype=Notification.NotificationType.TASK_ASSIGNED, is_read=False):
    return Notification.objects.create(
        user=user, title=title, message=message,
        notification_type=ntype, is_read=is_read,
    )


# ---------------------------------------------------------------------------
# Notification model tests
# ---------------------------------------------------------------------------

class NotificationModelTest(TestCase):

    def test_str_contains_type_and_user(self):
        user = make_user("nu1", "nu1@test.com")
        n = make_notification(user)
        self.assertIn("TASK_ASSIGNED", str(n))
        self.assertIn(user.username, str(n))

    def test_default_is_read_false(self):
        user = make_user("nu2", "nu2@test.com")
        n = make_notification(user)
        self.assertFalse(n.is_read)

    def test_ordering_newest_first(self):
        user = make_user("nu3", "nu3@test.com")
        n1 = make_notification(user, title="First")
        n2 = make_notification(user, title="Second")
        notifs = list(Notification.objects.filter(user=user))
        # Newest first
        self.assertEqual(notifs[0], n2)

    def test_deleting_user_deletes_notifications(self):
        user = make_user("nu4", "nu4@test.com")
        make_notification(user)
        user_id = user.id
        user.delete()
        self.assertFalse(Notification.objects.filter(user_id=user_id).exists())


# ---------------------------------------------------------------------------
# NotificationListView  GET /api/notifications/
# ---------------------------------------------------------------------------

class NotificationListViewTest(TestCase):

    URL = "/api/notifications/"

    def setUp(self):
        self.user = make_user("nlist", "nlist@test.com")
        self.other = make_user("other", "other@test.com")
        self.client = auth_client(self.user)

    def test_unauthenticated_returns_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_sees_only_own_notifications(self):
        make_notification(self.user, title="Mine")
        make_notification(self.other, title="Theirs")
        resp = self.client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [n["title"] for n in resp.data["data"]["results"]]
        self.assertIn("Mine", titles)
        self.assertNotIn("Theirs", titles)

    def test_unread_count_is_included(self):
        make_notification(self.user, is_read=False)
        make_notification(self.user, is_read=True)
        resp = self.client.get(self.URL)
        self.assertEqual(resp.data["data"]["unread_count"], 1)

    def test_filter_unread(self):
        make_notification(self.user, title="Unread", is_read=False)
        make_notification(self.user, title="Read", is_read=True)
        resp = self.client.get(self.URL + "?is_read=false")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [n["title"] for n in resp.data["data"]["results"]]
        self.assertIn("Unread", titles)
        self.assertNotIn("Read", titles)

    def test_filter_read(self):
        make_notification(self.user, title="Unread", is_read=False)
        make_notification(self.user, title="Read", is_read=True)
        resp = self.client.get(self.URL + "?is_read=true")
        titles = [n["title"] for n in resp.data["data"]["results"]]
        self.assertIn("Read", titles)
        self.assertNotIn("Unread", titles)


# ---------------------------------------------------------------------------
# MarkNotificationReadView  PATCH /api/notifications/<id>/read/
# ---------------------------------------------------------------------------

class MarkNotificationReadViewTest(TestCase):

    def setUp(self):
        self.user = make_user("nmark", "nmark@test.com")
        self.other = make_user("nother", "nother@test.com")
        self.notif = make_notification(self.user)
        self.url = f"/api/notifications/{self.notif.id}/read/"

    def test_mark_own_notification_read(self):
        resp = auth_client(self.user).patch(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.notif.refresh_from_db()
        self.assertTrue(self.notif.is_read)

    def test_cannot_mark_other_users_notification(self):
        resp = auth_client(self.other).patch(self.url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_nonexistent_notification_returns_404(self):
        resp = auth_client(self.user).patch("/api/notifications/99999/read/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# MarkAllNotificationsReadView  PATCH /api/notifications/read-all/
# ---------------------------------------------------------------------------

class MarkAllNotificationsReadViewTest(TestCase):

    URL = "/api/notifications/read-all/"

    def setUp(self):
        self.user = make_user("nall", "nall@test.com")
        self.client = auth_client(self.user)

    def test_marks_all_unread_as_read(self):
        make_notification(self.user, title="A", is_read=False)
        make_notification(self.user, title="B", is_read=False)
        make_notification(self.user, title="C", is_read=True)
        resp = self.client.patch(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        unread = Notification.objects.filter(user=self.user, is_read=False).count()
        self.assertEqual(unread, 0)

    def test_unauthenticated_returns_401(self):
        resp = APIClient().patch(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_does_not_affect_other_users_notifications(self):
        other = make_user("other_nall", "other_nall@test.com")
        notif = make_notification(other, is_read=False)
        self.client.patch(self.URL)
        notif.refresh_from_db()
        self.assertFalse(notif.is_read)
