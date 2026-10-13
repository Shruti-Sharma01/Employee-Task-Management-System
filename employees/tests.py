"""
Tests for the `employees` app.

Covers:
- Employee model (__str__, relationships)
- EmployeeListCreateView  (list, create — admin only for writes, all authenticated for reads)
- EmployeeDetailView      (retrieve, update, delete)
"""

import datetime

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from employees.models import Employee


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(username, email, password="StrongPass1!", role=User.Role.EMPLOYEE):
    return User.objects.create_user(
        username=username, email=email, password=password, role=role
    )


def make_employee(user, emp_id="EMP0001", department="Engineering", designation="Developer"):
    return Employee.objects.get_or_create(
        user=user,
        defaults={
            "employee_id": emp_id,
            "full_name": user.username,
            "email": user.email,
            "department": department,
            "designation": designation,
            "joining_date": datetime.date(2023, 1, 1),
        },
    )[0]


def auth_client(user):
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class EmployeeModelTest(TestCase):

    def test_str(self):
        user = make_user("emp_str", "emp_str@test.com")
        emp = make_employee(user, emp_id="EMP0099")
        self.assertIn("EMP0099", str(emp))
        self.assertIn(emp.full_name, str(emp))

    def test_manager_relationship(self):
        mgr_user = make_user("mgr", "mgr@test.com", role=User.Role.MANAGER)
        emp_user = make_user("emp", "emp@test.com")
        manager = make_employee(mgr_user, emp_id="EMP0010", designation="Manager")
        emp = make_employee(emp_user, emp_id="EMP0011")
        emp.manager = manager
        emp.save()
        self.assertEqual(emp.manager, manager)
        self.assertIn(emp, manager.team_members.all())

    def test_deleting_user_deletes_employee(self):
        user = make_user("cascadeuser", "cascade@test.com")
        make_employee(user, emp_id="EMP0020")
        user.delete()
        self.assertFalse(Employee.objects.filter(employee_id="EMP0020").exists())


# ---------------------------------------------------------------------------
# EmployeeListCreateView  GET/POST  /api/employees/
# ---------------------------------------------------------------------------

class EmployeeListCreateViewTest(TestCase):

    URL = "/api/employees/"

    def setUp(self):
        self.admin = make_user("admin", "admin@test.com", role=User.Role.ADMIN)
        self.employee_user = make_user("emp1", "emp1@test.com")
        self.admin_client = auth_client(self.admin)
        self.emp_client = auth_client(self.employee_user)

    def _new_payload(self, emp_id="EMP9001", username="newuser", email="new@test.com"):
        """Payload for creating a fresh employee (also creates a linked user)."""
        return {
            "employee_id": emp_id,
            "full_name": "New Employee",
            "email": email,
            "phone": "1234567890",
            "department": "QA",
            "designation": "Tester",
            "joining_date": "2024-01-01",
            "username": username,
            "user_email": email,
        }

    def test_authenticated_employee_can_list(self):
        make_employee(self.employee_user, emp_id="EMP0030")
        resp = self.emp_client.get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_unauthenticated_cannot_list(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_cannot_create_employee(self):
        resp = self.emp_client.post(self.URL, self._new_payload(), format="json")
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])


# ---------------------------------------------------------------------------
# EmployeeDetailView  GET/PUT/PATCH/DELETE  /api/employees/<id>/
# ---------------------------------------------------------------------------

class EmployeeDetailViewTest(TestCase):

    def setUp(self):
        self.admin = make_user("adm2", "adm2@test.com", role=User.Role.ADMIN)
        self.user = make_user("detailemp", "detailemp@test.com")
        self.emp = make_employee(self.user, emp_id="EMP0050", department="HR")
        self.admin_client = auth_client(self.admin)
        self.emp_client = auth_client(self.user)
        self.url = f"/api/employees/{self.emp.id}/"

    def test_retrieve_employee(self):
        resp = self.emp_client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["data"]["employee_id"], "EMP0050")

    def test_admin_can_update_employee(self):
        resp = self.admin_client.patch(self.url, {"department": "Finance"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.emp.refresh_from_db()
        self.assertEqual(self.emp.department, "Finance")

    def test_non_admin_cannot_update_employee(self):
        resp = self.emp_client.patch(self.url, {"department": "Finance"}, format="json")
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])

    def test_admin_can_delete_employee(self):
        resp = self.admin_client.delete(self.url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Employee.objects.filter(pk=self.emp.pk).exists())

    def test_non_admin_cannot_delete_employee(self):
        resp = self.emp_client.delete(self.url)
        self.assertIn(resp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED])

    def test_retrieve_nonexistent_returns_404(self):
        resp = self.admin_client.get("/api/employees/99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
