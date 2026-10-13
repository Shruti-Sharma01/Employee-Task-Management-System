"""
Tests for the `accounts` app.

Covers:
- User model (roles, __str__, UserManager.create_superuser)
- RegisterView  (success, password mismatch, duplicate email, role enforcement)
- LoginView     (success, bad credentials)
- ProfileView   (authenticated / unauthenticated)
- ChangePasswordView (success, wrong old password, mismatched new passwords)
- Permissions   (IsAdmin, IsManager, IsEmployee, IsAdminOrManager, IsAdminOrReadOnly)
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from accounts.permissions import (
    IsAdmin,
    IsAdminOrManager,
    IsAdminOrReadOnly,
    IsEmployee,
    IsManager,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def make_user(username, email, password="StrongPass1!", role=User.Role.EMPLOYEE, **kw):
    return User.objects.create_user(
        username=username, email=email, password=password, role=role, **kw
    )


def auth_client(user):
    """Return an APIClient already authenticated with a JWT access token."""
    client = APIClient()
    refresh = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")
    return client


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class UserModelTest(TestCase):

    def test_default_role_is_employee(self):
        user = make_user("alice", "alice@example.com")
        self.assertEqual(user.role, User.Role.EMPLOYEE)

    def test_str_includes_username_and_role(self):
        user = make_user("bob", "bob@example.com", role=User.Role.MANAGER)
        self.assertIn("bob", str(user))
        self.assertIn("MANAGER", str(user))

    def test_create_superuser_gets_admin_role(self):
        su = User.objects.create_superuser("admin", "admin@example.com", "Admin1234!")
        self.assertEqual(su.role, User.Role.ADMIN)
        self.assertTrue(su.is_superuser)

    def test_email_is_unique(self):
        make_user("u1", "unique@example.com")
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            make_user("u2", "unique@example.com")

    def test_role_choices(self):
        roles = {r[0] for r in User.Role.choices}
        self.assertEqual(roles, {"ADMIN", "MANAGER", "EMPLOYEE"})


# ---------------------------------------------------------------------------
# RegisterView  POST /api/auth/register/
# ---------------------------------------------------------------------------

class RegisterViewTest(TestCase):

    URL = "/api/auth/register/"

    def setUp(self):
        self.client = APIClient()

    def _payload(self, **overrides):
        base = {
            "username": "newuser",
            "email": "newuser@example.com",
            "first_name": "New",
            "last_name": "User",
            "password": "StrongPass1!",
            "confirm_password": "StrongPass1!",
        }
        base.update(overrides)
        return base

    def test_register_success(self):
        resp = self.client.post(self.URL, self._payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["success"])
        self.assertTrue(User.objects.filter(username="newuser").exists())

    def test_register_creates_employee_profile(self):
        self.client.post(self.URL, self._payload(), format="json")
        user = User.objects.get(username="newuser")
        self.assertTrue(hasattr(user, "employee_profile"))

    def test_password_mismatch_returns_400(self):
        payload = self._payload(confirm_password="wrong")
        resp = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_duplicate_email_returns_400(self):
        self.client.post(self.URL, self._payload(), format="json")
        payload = self._payload(username="other")  # same email
        resp = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_admin_cannot_create_admin_account(self):
        payload = self._payload(role="ADMIN")
        resp = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_create_manager_account(self):
        admin = make_user("adm", "adm@example.com", role=User.Role.ADMIN)
        client = auth_client(admin)
        payload = self._payload(
            username="mgr", email="mgr@example.com", role="MANAGER"
        )
        resp = client.post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username="mgr").role, User.Role.MANAGER)

    def test_weak_password_returns_400(self):
        payload = self._payload(password="123", confirm_password="123")
        resp = self.client.post(self.URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_required_fields_returns_400(self):
        resp = self.client.post(self.URL, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# LoginView  POST /api/auth/login/
# ---------------------------------------------------------------------------

class LoginViewTest(TestCase):

    URL = "/api/auth/login/"

    def setUp(self):
        self.user = make_user("loginuser", "login@example.com", password="Pass1234!")
        self.client = APIClient()

    def test_valid_credentials_return_tokens(self):
        resp = self.client.post(
            self.URL,
            {"username": "loginuser", "password": "Pass1234!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("access", resp.data["data"])
        self.assertIn("refresh", resp.data["data"])

    def test_wrong_password_returns_401(self):
        resp = self.client.post(
            self.URL,
            {"username": "loginuser", "password": "wrong"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_nonexistent_user_returns_401(self):
        resp = self.client.post(
            self.URL,
            {"username": "nobody", "password": "Pass1234!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# ProfileView  GET /api/auth/profile/
# ---------------------------------------------------------------------------

class ProfileViewTest(TestCase):

    URL = "/api/auth/profile/"

    def test_authenticated_user_gets_profile(self):
        user = make_user("profuser", "prof@example.com")
        resp = auth_client(user).get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["data"]["username"], "profuser")

    def test_unauthenticated_returns_401(self):
        resp = APIClient().get(self.URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# ChangePasswordView  POST /api/auth/change-password/
# ---------------------------------------------------------------------------

class ChangePasswordViewTest(TestCase):

    URL = "/api/auth/change-password/"

    def setUp(self):
        self.user = make_user("chpass", "chpass@example.com", password="OldPass1!")
        self.client = auth_client(self.user)

    def test_change_password_success(self):
        resp = self.client.post(
            self.URL,
            {"old_password": "OldPass1!", "new_password": "NewPass2@", "confirm_new_password": "NewPass2@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass2@"))

    def test_wrong_old_password_returns_400(self):
        resp = self.client.post(
            self.URL,
            {"old_password": "WRONG", "new_password": "NewPass2@", "confirm_new_password": "NewPass2@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mismatched_new_passwords_returns_400(self):
        resp = self.client.post(
            self.URL,
            {"old_password": "OldPass1!", "new_password": "NewPass2@", "confirm_new_password": "Different2@"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Permission class unit tests
# ---------------------------------------------------------------------------

class PermissionsTest(TestCase):

    def _mock_request(self, role, authenticated=True):
        """Return a minimal mock with .user.role and .user.is_authenticated."""
        class FakeUser:
            is_authenticated = authenticated
            def __init__(self, r): self.role = r
        class FakeRequest:
            user = FakeUser(role)
            method = "GET"
        return FakeRequest()

    def test_is_admin_allows_admin_only(self):
        p = IsAdmin()
        self.assertTrue(p.has_permission(self._mock_request(User.Role.ADMIN), None))
        self.assertFalse(p.has_permission(self._mock_request(User.Role.MANAGER), None))
        self.assertFalse(p.has_permission(self._mock_request(User.Role.EMPLOYEE), None))

    def test_is_manager_allows_manager_only(self):
        p = IsManager()
        self.assertTrue(p.has_permission(self._mock_request(User.Role.MANAGER), None))
        self.assertFalse(p.has_permission(self._mock_request(User.Role.ADMIN), None))

    def test_is_employee_allows_employee_only(self):
        p = IsEmployee()
        self.assertTrue(p.has_permission(self._mock_request(User.Role.EMPLOYEE), None))
        self.assertFalse(p.has_permission(self._mock_request(User.Role.ADMIN), None))

    def test_is_admin_or_manager(self):
        p = IsAdminOrManager()
        self.assertTrue(p.has_permission(self._mock_request(User.Role.ADMIN), None))
        self.assertTrue(p.has_permission(self._mock_request(User.Role.MANAGER), None))
        self.assertFalse(p.has_permission(self._mock_request(User.Role.EMPLOYEE), None))

    def test_is_admin_or_readonly_allows_read_for_any_authenticated(self):
        p = IsAdminOrReadOnly()
        req = self._mock_request(User.Role.EMPLOYEE)
        req.method = "GET"
        self.assertTrue(p.has_permission(req, None))

    def test_is_admin_or_readonly_blocks_write_for_non_admin(self):
        p = IsAdminOrReadOnly()
        req = self._mock_request(User.Role.EMPLOYEE)
        req.method = "POST"
        self.assertFalse(p.has_permission(req, None))

    def test_unauthenticated_denied(self):
        p = IsAdmin()
        req = self._mock_request(User.Role.ADMIN, authenticated=False)
        self.assertFalse(p.has_permission(req, None))
