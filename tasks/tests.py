"""
Tests for the `tasks` app.

Covers:
- Task model        (save auto-sets completed_at, QuerySet.overdue/completed/pending)
- validate_attachment (allowed/disallowed types, size limit)
- TaskListCreateView  (list visibility per role, create)
- MyTasksView, OverdueTasksView, CompletedTasksView, PendingTasksView
- TaskDetailView      (retrieve, update, delete, employee permission guard)
- TaskCommentListCreateView / CommentDetailView
- Signal: notifications created on task events
"""

import datetime
import io

from django.test import TestCase
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from employees.models import Employee
from notifications.models import Notification
from tasks.models import Task, TaskComment
from tasks.validators import validate_attachment


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(username, email, password="StrongPass1!", role=User.Role.EMPLOYEE):
    return User.objects.create_user(
        username=username, email=email, password=password, role=role
    )


def make_employee(user, emp_id, department="Engineering", designation="Developer", manager=None):
    return Employee.objects.get_or_create(
        user=user,
        defaults={
            "employee_id": emp_id,
            "full_name": user.username,
            "email": user.email,
            "department": department,
            "designation": designation,
            "joining_date": datetime.date(2023, 1, 1),
            "manager": manager,
        },
    )[0]


def make_task(title="Test Task", assigned_to=None, assigned_by=None,
              status=Task.Status.PENDING, deadline=None):
    return Task.objects.create(
        title=title,
        assigned_to=assigned_to,
        assigned_by=assigned_by,
        status=status,
        deadline=deadline,
    )


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ---------------------------------------------------------------------------
# Task model tests
# ---------------------------------------------------------------------------

class TaskModelTest(TestCase):

    def setUp(self):
        self.user = make_user("modeluser", "model@test.com")
        self.emp = make_employee(self.user, "EMP1001")

    def test_str_includes_title_and_status(self):
        task = make_task("My Task", assigned_to=self.emp, assigned_by=self.user)
        self.assertIn("My Task", str(task))
        self.assertIn("PENDING", str(task))

    def test_completing_task_sets_completed_at(self):
        task = make_task("Complete Me", assigned_to=self.emp, assigned_by=self.user)
        self.assertIsNone(task.completed_at)
        task.status = Task.Status.COMPLETED
        task.save()
        self.assertIsNotNone(task.completed_at)

    def test_reopening_task_clears_completed_at(self):
        task = make_task("Reopen Me", assigned_to=self.emp, assigned_by=self.user,
                         status=Task.Status.COMPLETED)
        # Django calls save() in make_task so completed_at is set; reload:
        task.refresh_from_db()
        self.assertIsNotNone(task.completed_at)
        task.status = Task.Status.PENDING
        task.save()
        task.refresh_from_db()
        self.assertIsNone(task.completed_at)

    def test_default_ordering_is_newest_first(self):
        t1 = make_task("First", assigned_to=self.emp, assigned_by=self.user)
        t2 = make_task("Second", assigned_to=self.emp, assigned_by=self.user)
        tasks = list(Task.objects.all())
        self.assertEqual(tasks[0], t2)  # newest first

    # QuerySet custom methods
    def test_queryset_overdue(self):
        past = datetime.date.today() - datetime.timedelta(days=1)
        overdue_task = make_task("Overdue", assigned_to=self.emp, assigned_by=self.user,
                                 deadline=past)
        future = datetime.date.today() + datetime.timedelta(days=1)
        ok_task = make_task("On time", assigned_to=self.emp, assigned_by=self.user,
                            deadline=future)
        overdue_qs = Task.objects.overdue()
        self.assertIn(overdue_task, overdue_qs)
        self.assertNotIn(ok_task, overdue_qs)

    def test_queryset_completed(self):
        c = make_task("Done", assigned_to=self.emp, assigned_by=self.user,
                      status=Task.Status.COMPLETED)
        p = make_task("Pending", assigned_to=self.emp, assigned_by=self.user,
                      status=Task.Status.PENDING)
        self.assertIn(c, Task.objects.completed())
        self.assertNotIn(p, Task.objects.completed())

    def test_queryset_pending(self):
        p = make_task("Pending", assigned_to=self.emp, assigned_by=self.user,
                      status=Task.Status.PENDING)
        c = make_task("Done", assigned_to=self.emp, assigned_by=self.user,
                      status=Task.Status.COMPLETED)
        self.assertIn(p, Task.objects.pending())
        self.assertNotIn(c, Task.objects.pending())


# ---------------------------------------------------------------------------
# validate_attachment tests
# ---------------------------------------------------------------------------

class FakeFile:
    def __init__(self, name, size):
        self.name = name
        self.size = size


class ValidateAttachmentTest(TestCase):

    def test_allowed_extension_passes(self):
        for ext in [".pdf", ".png", ".jpg", ".txt", ".csv", ".docx"]:
            f = FakeFile(f"file{ext}", 1024)
            validate_attachment(f)  # Should not raise

    def test_disallowed_extension_raises(self):
        f = FakeFile("virus.exe", 1024)
        with self.assertRaises(ValidationError):
            validate_attachment(f)

    def test_oversized_file_raises(self):
        f = FakeFile("big.pdf", 6 * 1024 * 1024)  # 6 MB > 5 MB limit
        with self.assertRaises(ValidationError):
            validate_attachment(f)

    def test_file_at_size_limit_passes(self):
        f = FakeFile("edge.pdf", 5 * 1024 * 1024)  # exactly 5 MB
        validate_attachment(f)  # Should not raise


# ---------------------------------------------------------------------------
# TaskListCreateView  GET /api/tasks/  POST /api/tasks/
# ---------------------------------------------------------------------------

class TaskListCreateViewTest(TestCase):

    URL = "/api/tasks/"

    def setUp(self):
        # Admin user
        self.admin = make_user("admin_t", "admin_t@test.com", role=User.Role.ADMIN)
        self.admin_emp = make_employee(self.admin, "EMP2000", designation="Admin")
        # Manager user
        self.mgr_user = make_user("mgr_t", "mgr_t@test.com", role=User.Role.MANAGER)
        self.mgr_emp = make_employee(self.mgr_user, "EMP2001", designation="Manager")
        # Employee user (under manager)
        self.emp_user = make_user("emp_t", "emp_t@test.com")
        self.emp = make_employee(self.emp_user, "EMP2002", manager=self.mgr_emp)

    def test_unauthenticated_returns_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_sees_all_tasks(self):
        make_task("Task A", assigned_to=self.emp, assigned_by=self.mgr_user)
        make_task("Task B", assigned_to=self.admin_emp, assigned_by=self.admin)
        resp = auth_client(self.admin).get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Admin sees both
        self.assertGreaterEqual(resp.data["data"]["count"], 2)

    def test_employee_sees_only_own_tasks(self):
        make_task("My Task", assigned_to=self.emp, assigned_by=self.mgr_user)
        make_task("Other Task", assigned_to=self.admin_emp, assigned_by=self.admin)
        resp = auth_client(self.emp_user).get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [t["title"] for t in resp.data["data"]["results"]]
        self.assertIn("My Task", titles)
        self.assertNotIn("Other Task", titles)

    def test_admin_can_create_task(self):
        payload = {
            "title": "Admin Task",
            "assigned_to": self.emp.pk,
            "priority": "HIGH",
            "status": "PENDING",
        }
        resp = auth_client(self.admin).post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Task.objects.filter(title="Admin Task").exists())

    def test_deadline_before_start_returns_400(self):
        payload = {
            "title": "Bad Dates",
            "assigned_to": self.emp.pk,
            "start_date": "2025-01-10",
            "deadline": "2025-01-01",
        }
        resp = auth_client(self.admin).post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_manager_cannot_assign_task_to_non_team_member(self):
        outsider_user = make_user("outsider", "outsider@test.com")
        outsider_emp = make_employee(outsider_user, "EMP9999")  # no manager
        payload = {
            "title": "Illegal Task",
            "assigned_to": outsider_emp.pk,
        }
        resp = auth_client(self.mgr_user).post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_cannot_create_task(self):
        other_user = make_user("other_emp", "other_emp@test.com")
        other_emp = make_employee(other_user, "EMP8888")
        payload = {"title": "Sneaky Task", "assigned_to": other_emp.pk}
        resp = auth_client(self.emp_user).post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# Filtered task views
# ---------------------------------------------------------------------------

class FilteredTaskViewsTest(TestCase):

    def setUp(self):
        self.admin = make_user("adm3", "adm3@test.com", role=User.Role.ADMIN)
        self.admin_emp = make_employee(self.admin, "EMP3000")
        self.emp_user = make_user("emp3", "emp3@test.com")
        self.emp = make_employee(self.emp_user, "EMP3001")
        self.client = auth_client(self.admin)

    def test_my_tasks_view_returns_only_assigned_to_user(self):
        make_task("My Task", assigned_to=self.emp, assigned_by=self.admin)
        make_task("Admin Task", assigned_to=self.admin_emp, assigned_by=self.admin)
        resp = auth_client(self.emp_user).get("/api/tasks/my-tasks/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [t["title"] for t in resp.data["data"]["results"]]
        self.assertIn("My Task", titles)
        self.assertNotIn("Admin Task", titles)

    def test_overdue_tasks_view(self):
        past = datetime.date.today() - datetime.timedelta(days=2)
        make_task("Overdue!", assigned_to=self.admin_emp, assigned_by=self.admin,
                  deadline=past)
        resp = self.client.get("/api/tasks/overdue/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        titles = [t["title"] for t in resp.data["data"]["results"]]
        self.assertIn("Overdue!", titles)

    def test_completed_tasks_view(self):
        make_task("Done!", assigned_to=self.admin_emp, assigned_by=self.admin,
                  status=Task.Status.COMPLETED)
        resp = self.client.get("/api/tasks/completed/")
        titles = [t["title"] for t in resp.data["data"]["results"]]
        self.assertIn("Done!", titles)

    def test_pending_tasks_view(self):
        make_task("Todo", assigned_to=self.admin_emp, assigned_by=self.admin,
                  status=Task.Status.PENDING)
        resp = self.client.get("/api/tasks/pending/")
        titles = [t["title"] for t in resp.data["data"]["results"]]
        self.assertIn("Todo", titles)


# ---------------------------------------------------------------------------
# TaskDetailView  GET / PATCH / DELETE  /api/tasks/<id>/
# ---------------------------------------------------------------------------

class TaskDetailViewTest(TestCase):

    def setUp(self):
        self.admin = make_user("adm4", "adm4@test.com", role=User.Role.ADMIN)
        self.admin_emp = make_employee(self.admin, "EMP4000")
        self.emp_user = make_user("emp4", "emp4@test.com")
        self.emp = make_employee(self.emp_user, "EMP4001")
        self.task = make_task("Detail Task", assigned_to=self.emp, assigned_by=self.admin)
        self.task_url = f"/api/tasks/{self.task.id}/"

    def test_retrieve_task(self):
        resp = auth_client(self.admin).get(self.task_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["data"]["title"], "Detail Task")

    def test_admin_can_update_task(self):
        resp = auth_client(self.admin).patch(
            self.task_url, {"title": "Updated Title"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.task.refresh_from_db()
        self.assertEqual(self.task.title, "Updated Title")

    def test_employee_can_update_status_only(self):
        self.task.status = Task.Status.IN_PROGRESS
        self.task.save()
        resp = auth_client(self.emp_user).patch(
            self.task_url, {"status": "COMPLETED"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.task.refresh_from_db()
        self.assertEqual(self.task.status, Task.Status.COMPLETED)

    def test_employee_cannot_update_title(self):
        resp = auth_client(self.emp_user).patch(
            self.task_url, {"title": "Hack Title", "status": "IN_PROGRESS"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_employee_cannot_cancel_task(self):
        resp = auth_client(self.emp_user).patch(
            self.task_url, {"status": "CANCELLED"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_delete_task(self):
        resp = auth_client(self.admin).delete(self.task_url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Task.objects.filter(pk=self.task.pk).exists())

    def test_retrieve_nonexistent_task_returns_404(self):
        resp = auth_client(self.admin).get("/api/tasks/99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_task_invisible_to_unrelated_user(self):
        stranger = make_user("stranger", "stranger@test.com")
        make_employee(stranger, "EMP9990")
        resp = auth_client(stranger).get(self.task_url)
        # 404 hides existence of task
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------

class TaskCommentTest(TestCase):

    def setUp(self):
        self.admin = make_user("adm5", "adm5@test.com", role=User.Role.ADMIN)
        self.admin_emp = make_employee(self.admin, "EMP5000")
        self.emp_user = make_user("emp5", "emp5@test.com")
        self.emp = make_employee(self.emp_user, "EMP5001")
        self.task = make_task("Commented Task", assigned_to=self.emp, assigned_by=self.admin)
        self.comments_url = f"/api/tasks/{self.task.id}/comments/"

    def test_add_comment(self):
        resp = auth_client(self.emp_user).post(
            self.comments_url, {"comment": "Hello!"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(TaskComment.objects.filter(comment="Hello!").exists())

    def test_list_comments(self):
        TaskComment.objects.create(task=self.task, user=self.admin, comment="Hi")
        resp = auth_client(self.emp_user).get(self.comments_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_user_can_edit_own_comment(self):
        comment = TaskComment.objects.create(task=self.task, user=self.emp_user, comment="Original")
        url = f"/api/comments/{comment.id}/"
        resp = auth_client(self.emp_user).patch(url, {"comment": "Edited"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        comment.refresh_from_db()
        self.assertEqual(comment.comment, "Edited")

    def test_user_cannot_edit_others_comment(self):
        comment = TaskComment.objects.create(task=self.task, user=self.admin, comment="Admin comment")
        url = f"/api/comments/{comment.id}/"
        resp = auth_client(self.emp_user).patch(url, {"comment": "Hijacked"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_can_delete_own_comment(self):
        comment = TaskComment.objects.create(task=self.task, user=self.emp_user, comment="Delete me")
        url = f"/api/comments/{comment.id}/"
        resp = auth_client(self.emp_user).delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_admin_can_delete_any_comment(self):
        comment = TaskComment.objects.create(task=self.task, user=self.emp_user, comment="Naughty")
        url = f"/api/comments/{comment.id}/"
        resp = auth_client(self.admin).delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Signals – notification creation
# ---------------------------------------------------------------------------

class TaskSignalTest(TestCase):

    def setUp(self):
        self.admin = make_user("adm6", "adm6@test.com", role=User.Role.ADMIN)
        self.emp_user = make_user("emp6", "emp6@test.com")
        self.emp = make_employee(self.emp_user, "EMP6001")

    def test_notification_created_when_task_assigned(self):
        initial_count = Notification.objects.count()
        make_task("Assigned Task", assigned_to=self.emp, assigned_by=self.admin)
        self.assertGreater(Notification.objects.count(), initial_count)

    def test_notification_type_is_task_assigned(self):
        make_task("Notif Task", assigned_to=self.emp, assigned_by=self.admin)
        notif = Notification.objects.filter(
            user=self.emp_user,
            notification_type=Notification.NotificationType.TASK_ASSIGNED,
        ).first()
        self.assertIsNotNone(notif)

    def test_notification_on_task_completion(self):
        task = make_task("Finish Me", assigned_to=self.emp, assigned_by=self.admin)
        task.status = Task.Status.COMPLETED
        task.save()
        notif = Notification.objects.filter(
            user=self.admin,
            notification_type=Notification.NotificationType.TASK_COMPLETED,
        ).first()
        self.assertIsNotNone(notif)

    def test_notification_on_status_change(self):
        task = make_task("Status Change", assigned_to=self.emp, assigned_by=self.admin)
        task.status = Task.Status.IN_PROGRESS
        task.save()
        notif = Notification.objects.filter(
            user=self.emp_user,
            notification_type=Notification.NotificationType.TASK_UPDATED,
        ).first()
        self.assertIsNotNone(notif)

    def test_notification_on_reassignment(self):
        emp2_user = make_user("emp6b", "emp6b@test.com")
        emp2 = make_employee(emp2_user, "EMP6002")
        task = make_task("Reassign Me", assigned_to=self.emp, assigned_by=self.admin)
        task.assigned_to = emp2
        task.save()
        notif = Notification.objects.filter(
            user=emp2_user,
            notification_type=Notification.NotificationType.TASK_REASSIGNED,
        ).first()
        self.assertIsNotNone(notif)


# ---------------------------------------------------------------------------
# Acceptance Criteria: Task Workflow Tests
# ---------------------------------------------------------------------------

class TaskWorkflowTests(TestCase):

    def setUp(self):
        self.manager_user = make_user("wf_mgr", "wf_mgr@test.com", role=User.Role.MANAGER)
        self.manager_emp = make_employee(self.manager_user, "EMP_MGR1", designation="Manager")

        self.emp1_user = make_user("wf_emp1", "wf_emp1@test.com", role=User.Role.EMPLOYEE)
        self.emp1 = make_employee(self.emp1_user, "EMP_WF1", manager=self.manager_emp)

        self.emp2_user = make_user("wf_emp2", "wf_emp2@test.com", role=User.Role.EMPLOYEE)
        self.emp2 = make_employee(self.emp2_user, "EMP_WF2", manager=self.manager_emp)

    def test_1_employee_cannot_create_task(self):
        payload = {"title": "Employee Task", "assigned_to": self.emp1.pk}
        resp = auth_client(self.emp1_user).post("/api/tasks/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_2_manager_assigns_task_starts_pending_and_notifies(self):
        payload = {
            "title": "Manager Assigned Task",
            "assigned_to": self.emp1.pk,
            "status": "COMPLETED",  # Should be ignored and forced to PENDING
        }
        resp = auth_client(self.manager_user).post("/api/tasks/", payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        task_id = resp.data["data"]["id"]
        task = Task.objects.get(pk=task_id)
        self.assertEqual(task.status, Task.Status.PENDING)
        self.assertIsNone(task.accepted_at)

        # Employee gets notification
        notif = Notification.objects.filter(
            user=self.emp1_user,
            notification_type=Notification.NotificationType.TASK_ASSIGNED,
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn("Manager Assigned Task", notif.message)

    def test_3_employee_accept_flow(self):
        task = make_task("To Accept", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, Task.Status.IN_PROGRESS)
        self.assertIsNotNone(task.accepted_at)

        # Manager gets notification
        notif = Notification.objects.filter(
            user=self.manager_user,
            message__icontains="accepted the task",
        ).first()
        self.assertIsNotNone(notif)

    def test_4_setting_pending_task_directly_to_completed_returns_400(self):
        task = make_task("Direct Complete", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/", {"status": "COMPLETED"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_5_different_employee_accept_returns_403(self):
        task = make_task("Emp1 Task", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp2_user).patch(f"/api/tasks/{task.pk}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_6_accepting_already_accepted_task_returns_400(self):
        task = make_task("Already Accepted", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        resp = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/accept/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_7_legacy_todo_tasks_are_pending(self):
        task = make_task("Pending Legacy Task", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp1_user).get(f"/api/tasks/{task.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["data"]["status"], "PENDING")

    def test_reject_with_reason(self):
        task = make_task("Reject Task", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp1_user).patch(
            f"/api/tasks/{task.pk}/reject/",
            {"reason": "Not enough bandwidth for this task"},
            format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, Task.Status.REJECTED)
        self.assertEqual(task.status_reason, "Not enough bandwidth for this task")
        self.assertIsNotNone(task.rejected_at)
        notif = Notification.objects.filter(
            user=self.manager_user,
            message__icontains="Not enough bandwidth"
        ).first()
        self.assertIsNotNone(notif)

    def test_reject_without_reason_returns_400(self):
        task = make_task("Reject No Reason", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp1 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/reject/", {}, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)
        resp2 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/reject/", {"reason": "short"}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_after_accept_returns_400(self):
        task = make_task("Reject After Accept", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        resp = auth_client(self.emp1_user).patch(
            f"/api/tasks/{task.pk}/reject/",
            {"reason": "Cannot reject once accepted and in progress"},
            format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_abort_with_reason(self):
        task = make_task("Abort Task", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        resp = auth_client(self.emp1_user).patch(
            f"/api/tasks/{task.pk}/abort/",
            {"reason": "Blocked by external system outage"},
            format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, Task.Status.ABORTED)
        self.assertEqual(task.status_reason, "Blocked by external system outage")
        self.assertIsNotNone(task.aborted_at)
        notif = Notification.objects.filter(
            user=self.manager_user,
            message__icontains="Blocked by external system outage"
        ).first()
        self.assertIsNotNone(notif)

    def test_abort_without_reason_returns_400(self):
        task = make_task("Abort No Reason", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        resp1 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/abort/", {}, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)
        resp2 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/abort/", {"reason": "too short"}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_abort_on_pending_returns_400(self):
        task = make_task("Abort Pending", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        resp = auth_client(self.emp1_user).patch(
            f"/api/tasks/{task.pk}/abort/",
            {"reason": "Trying to abort pending task"},
            format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completed_task_locked(self):
        task = make_task("Completed Locked", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.COMPLETED)
        # Attempt generic update
        resp1 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/", {"status": "IN_PROGRESS"}, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)
        # Attempt accept
        resp2 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/accept/")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        # Attempt reject
        resp3 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/reject/", {"reason": "Reason for reject with enough chars"}, format="json")
        self.assertEqual(resp3.status_code, status.HTTP_400_BAD_REQUEST)
        # Attempt abort
        resp4 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/abort/", {"reason": "Reason for abort with enough chars"}, format="json")
        self.assertEqual(resp4.status_code, status.HTTP_400_BAD_REQUEST)
        # Attempt complete
        resp5 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/complete/")
        self.assertEqual(resp5.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_cannot_set_rejected_or_cancelled_via_normal_update(self):
        task = make_task("In Progress Task", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        # Cannot set REJECTED via normal update
        resp1 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/", {"status": "REJECTED"}, format="json")
        self.assertEqual(resp1.status_code, status.HTTP_400_BAD_REQUEST)
        # Cannot set CANCELLED via normal update
        resp2 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/", {"status": "CANCELLED"}, format="json")
        self.assertEqual(resp2.status_code, status.HTTP_400_BAD_REQUEST)
        # Cannot set ABORTED via normal update
        resp3 = auth_client(self.emp1_user).patch(f"/api/tasks/{task.pk}/", {"status": "ABORTED"}, format="json")
        self.assertEqual(resp3.status_code, status.HTTP_400_BAD_REQUEST)

    def test_other_employee_gets_403(self):
        pending_task = make_task("Emp1 Pending", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.PENDING)
        in_progress_task = make_task("Emp1 Progress", assigned_to=self.emp1, assigned_by=self.manager_user, status=Task.Status.IN_PROGRESS)
        # emp2 attempts to reject emp1's task -> 403
        resp1 = auth_client(self.emp2_user).patch(
            f"/api/tasks/{pending_task.pk}/reject/",
            {"reason": "Not my task to reject here"},
            format="json"
        )
        self.assertEqual(resp1.status_code, status.HTTP_403_FORBIDDEN)
        # emp2 attempts to abort emp1's task -> 403
        resp2 = auth_client(self.emp2_user).patch(
            f"/api/tasks/{in_progress_task.pk}/abort/",
            {"reason": "Not my task to abort here"},
            format="json"
        )
        self.assertEqual(resp2.status_code, status.HTTP_403_FORBIDDEN)
