from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from accounts.models import User
from employees.models import Employee
from etms.responses import success_response

from .models import Task


def _status_counts(tasks):
    """One query that returns counts for every status at once,
    instead of four separate .filter().count() calls."""
    counts = tasks.aggregate(
        total=Count("id"),
        pending=Count("id", filter=Q(status=Task.Status.PENDING)),
        in_progress=Count("id", filter=Q(status=Task.Status.IN_PROGRESS)),
        completed=Count("id", filter=Q(status=Task.Status.COMPLETED)),
        cancelled=Count("id", filter=Q(status=Task.Status.CANCELLED)),
    )
    counts["overdue"] = tasks.overdue().count()
    return counts


class EmployeeDashboardView(APIView):
    """GET /api/dashboard/employee/"""

    def get(self, request):
        profile = getattr(request.user, "employee_profile", None)
        if profile is None:
            raise PermissionDenied("You don't have an employee profile.")

        tasks = Task.objects.filter(assigned_to=profile)
        data = _status_counts(tasks)

        today = timezone.localdate()
        upcoming = tasks.filter(
            deadline__gte=today,
            deadline__lte=today + timezone.timedelta(days=7),
            status__in=[Task.Status.PENDING, Task.Status.IN_PROGRESS],
        ).order_by("deadline").values("id", "title", "deadline", "priority")

        data.update({
            "total_tasks": data.pop("total"),
            "pending_tasks": data.pop("pending"),
            "in_progress_tasks": data.pop("in_progress"),
            "completed_tasks": data.pop("completed"),
            "overdue_tasks": data.pop("overdue"),
            "upcoming_deadlines": list(upcoming),
        })
        data.pop("cancelled", None)  # not part of the spec for this dashboard
        return success_response("Employee dashboard fetched successfully", data)


class ManagerDashboardView(APIView):
    """GET /api/dashboard/manager/"""

    def get(self, request):
        if request.user.role not in (User.Role.MANAGER, User.Role.ADMIN):
            raise PermissionDenied("Only managers or admins can view this dashboard.")

        profile = getattr(request.user, "employee_profile", None)
        if request.user.role == User.Role.MANAGER and profile is None:
            raise PermissionDenied("You don't have an employee profile.")

        team = Employee.objects.filter(manager=profile) if profile else Employee.objects.none()
        tasks = Task.objects.filter(assigned_to__in=team)

        data = _status_counts(tasks)
        data = {
            "total_team_members": team.count(),
            "total_tasks": data["total"],
            "pending_tasks": data["pending"],
            "in_progress_tasks": data["in_progress"],
            "completed_tasks": data["completed"],
            "overdue_tasks": data["overdue"],
        }

        # One query for every team member's task counts, grouped by employee.
        employee_stats = (
            team.annotate(
                total_tasks=Count("tasks", distinct=True),
                completed_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.COMPLETED), distinct=True),
                pending_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.PENDING), distinct=True),
            )
            .values("id", "employee_id", "full_name", "total_tasks", "pending_tasks", "completed_tasks")
            .order_by("full_name")
        )
        data["employee_wise_statistics"] = list(employee_stats)
        return success_response("Manager dashboard fetched successfully", data)


class AdminDashboardView(APIView):
    """GET /api/dashboard/admin/"""

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Only admins can view this dashboard.")

        tasks = Task.objects.all()
        counts = _status_counts(tasks)

        data = {
            "total_employees": Employee.objects.count(),
            "total_managers": User.objects.filter(role=User.Role.MANAGER).count(),
            "total_tasks": counts["total"],
            "pending_tasks": counts["pending"],
            "completed_tasks": counts["completed"],
            "overdue_tasks": counts["overdue"],
        }

        department_stats = (
            Employee.objects.values("department")
            .annotate(
                total_employees=Count("id", distinct=True),
                total_tasks=Count("tasks", distinct=True),
                completed_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.COMPLETED), distinct=True),
            )
            .order_by("department")
        )
        data["department_wise_statistics"] = list(department_stats)

        employee_stats = (
            Employee.objects.annotate(
                total_tasks=Count("tasks", distinct=True),
                completed_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.COMPLETED), distinct=True),
                pending_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.PENDING), distinct=True),
            )
            .values("id", "employee_id", "full_name", "department", "total_tasks", "pending_tasks", "completed_tasks")
            .order_by("full_name")
        )
        data["employee_wise_statistics"] = list(employee_stats)

        return success_response("Admin dashboard fetched successfully", data)