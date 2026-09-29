from django.urls import path

from .dashboard_views import AdminDashboardView, EmployeeDashboardView, ManagerDashboardView

urlpatterns = [
    path("employee/", EmployeeDashboardView.as_view(), name="dashboard-employee"),
    path("manager/", ManagerDashboardView.as_view(), name="dashboard-manager"),
    path("admin/", AdminDashboardView.as_view(), name="dashboard-admin"),
]