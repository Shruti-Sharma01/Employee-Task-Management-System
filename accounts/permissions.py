from rest_framework.permissions import BasePermission

from .models import User


class HasRole(BasePermission):
    """Base class: allow only logged-in users whose role is in `allowed_roles`."""

    allowed_roles = ()
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.allowed_roles)


class IsAdmin(HasRole):
    allowed_roles = (User.Role.ADMIN,)


class IsManager(HasRole):
    allowed_roles = (User.Role.MANAGER,)


class IsEmployee(HasRole):
    allowed_roles = (User.Role.EMPLOYEE,)


class IsAdminOrManager(HasRole):
    allowed_roles = (User.Role.ADMIN, User.Role.MANAGER)
    
class IsAdminOrReadOnly(HasRole):
    """Admins can write. Everyone authenticated can read (list/retrieve)."""

    allowed_roles = (User.Role.ADMIN,)

    def has_permission(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)