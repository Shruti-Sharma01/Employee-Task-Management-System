from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def api_root(request):
    """Simple health-check so http://127.0.0.1:8000/ shows something."""
    return JsonResponse({
        "success": True,
        "message": "ETMS API is running",
        "data": {"admin": "/admin/"},
    })


urlpatterns = [
    path("", api_root),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/employees/", include("employees.urls")),
    path("api/tasks/", include("tasks.urls")),
    path("api/", include("tasks.item_urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/dashboard/", include("tasks.dashboard_urls")),
]

# In development only, let Django serve uploaded files from /media/.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)