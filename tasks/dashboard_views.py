from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.views import APIView

from accounts.models import User
from employees.models import Employee
from etms.responses import success_response

from .models import Task, TimeEntry


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

        # Time tracking metrics
        user_entries = TimeEntry.objects.filter(user=request.user, end_time__isnull=False)
        total_time_secs = user_entries.aggregate(s=Sum("duration_seconds"))["s"] or 0
        today_time_secs = user_entries.filter(start_time__date=today).aggregate(s=Sum("duration_seconds"))["s"] or 0
        week_start = today - timezone.timedelta(days=today.weekday())
        week_time_secs = user_entries.filter(start_time__date__gte=week_start).aggregate(s=Sum("duration_seconds"))["s"] or 0

        data.update({
            "total_tasks": data.pop("total"),
            "pending_tasks": data.pop("pending"),
            "in_progress_tasks": data.pop("in_progress"),
            "completed_tasks": data.pop("completed"),
            "overdue_tasks": data.pop("overdue"),
            "upcoming_deadlines": list(upcoming),
            "total_hours_tracked": round(total_time_secs / 3600.0, 2),
            "today_hours_tracked": round(today_time_secs / 3600.0, 2),
            "week_hours_tracked": round(week_time_secs / 3600.0, 2),
        })
        data.pop("cancelled", None)
        return success_response("Employee dashboard fetched successfully", data)


class ManagerDashboardView(APIView):
    """GET /api/dashboard/manager/"""

    def get(self, request):
        if request.user.role not in (User.Role.MANAGER, User.Role.ADMIN):
            raise PermissionDenied("Only managers or admins can view this dashboard.")

        profile = getattr(request.user, "employee_profile", None)
        if request.user.role == User.Role.MANAGER and profile is None:
            raise PermissionDenied("You don't have an employee profile.")

        if profile:
            team = Employee.objects.filter(
                Q(manager=profile) |
                Q(department__iexact=profile.department.strip() if profile.department else "")
            ).exclude(pk=profile.pk)
        else:
            team = Employee.objects.none()
        tasks = Task.objects.filter(assigned_to__in=team)

        data = _status_counts(tasks)

        # Team time tracking metrics
        team_user_ids = list(team.values_list("user_id", flat=True))
        team_entries = TimeEntry.objects.filter(user_id__in=team_user_ids, end_time__isnull=False)
        total_team_secs = team_entries.aggregate(s=Sum("duration_seconds"))["s"] or 0

        today = timezone.localdate()
        week_start = today - timezone.timedelta(days=today.weekday())
        week_team_secs = team_entries.filter(start_time__date__gte=week_start).aggregate(s=Sum("duration_seconds"))["s"] or 0

        data = {
            "total_team_members": team.count(),
            "total_tasks": data["total"],
            "pending_tasks": data["pending"],
            "in_progress_tasks": data["in_progress"],
            "completed_tasks": data["completed"],
            "overdue_tasks": data["overdue"],
            "total_team_hours_tracked": round(total_team_secs / 3600.0, 2),
            "week_team_hours_tracked": round(week_team_secs / 3600.0, 2),
        }

        # Calculate time spent per employee
        emp_time_map = {}
        for entry in team_entries:
            emp_time_map[entry.user_id] = emp_time_map.get(entry.user_id, 0) + entry.duration_seconds

        employee_stats = list(
            team.annotate(
                total_tasks=Count("tasks", distinct=True),
                completed_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.COMPLETED), distinct=True),
                pending_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.PENDING), distinct=True),
            )
            .values("id", "employee_id", "full_name", "user_id", "total_tasks", "pending_tasks", "completed_tasks")
            .order_by("full_name")
        )

        for emp in employee_stats:
            uid = emp.get("user_id")
            secs = emp_time_map.get(uid, 0)
            emp["hours_tracked"] = round(secs / 3600.0, 2)

        data["employee_wise_statistics"] = employee_stats
        return success_response("Manager dashboard fetched successfully", data)


class AdminDashboardView(APIView):
    """GET /api/dashboard/admin/"""

    def get(self, request):
        if request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Only admins can view this dashboard.")

        tasks = Task.objects.all()
        counts = _status_counts(tasks)

        all_entries = TimeEntry.objects.filter(end_time__isnull=False)
        total_company_secs = all_entries.aggregate(s=Sum("duration_seconds"))["s"] or 0

        data = {
            "total_employees": Employee.objects.count(),
            "total_managers": User.objects.filter(role=User.Role.MANAGER).count(),
            "total_tasks": counts["total"],
            "pending_tasks": counts["pending"],
            "in_progress_tasks": counts["in_progress"],
            "completed_tasks": counts["completed"],
            "overdue_tasks": counts["overdue"],
            "total_hours_tracked": round(total_company_secs / 3600.0, 2),
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

        # Calculate time per employee
        emp_time_map = {}
        for entry in all_entries:
            emp_time_map[entry.user_id] = emp_time_map.get(entry.user_id, 0) + entry.duration_seconds

        employee_stats = list(
            Employee.objects.annotate(
                total_tasks=Count("tasks", distinct=True),
                completed_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.COMPLETED), distinct=True),
                pending_tasks=Count("tasks", filter=Q(tasks__status=Task.Status.PENDING), distinct=True),
            )
            .values("id", "employee_id", "full_name", "department", "user_id", "total_tasks", "pending_tasks", "completed_tasks")
            .order_by("full_name")
        )

        for emp in employee_stats:
            uid = emp.get("user_id")
            secs = emp_time_map.get(uid, 0)
            emp["hours_tracked"] = round(secs / 3600.0, 2)

        data["employee_wise_statistics"] = employee_stats

        return success_response("Admin dashboard fetched successfully", data)
