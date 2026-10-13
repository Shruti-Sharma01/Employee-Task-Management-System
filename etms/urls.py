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


from django.views.decorators.cache import never_cache
from django.views.generic import TemplateView
from django.views.static import serve

BASE_DIR = settings.BASE_DIR

urlpatterns = [
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
    path("index.html", TemplateView.as_view(template_name="index.html")),
    path("login.html", TemplateView.as_view(template_name="login.html")),
    path("register.html", TemplateView.as_view(template_name="register.html")),
    path("dashboard.html", never_cache(TemplateView.as_view(template_name="dashboard.html"))),
    path("tasks.html", never_cache(TemplateView.as_view(template_name="tasks.html"))),
    path("profile.html", never_cache(TemplateView.as_view(template_name="profile.html"))),
    path("forgot-password.html", TemplateView.as_view(template_name="forgot-password.html")),
    path("api/status/", api_root),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/employees/", include("employees.urls")),
    path("api/tasks/", include("tasks.urls")),
    path("api/", include("tasks.item_urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/dashboard/", include("tasks.dashboard_urls")),
    path("css/<path:path>", serve, {"document_root": BASE_DIR / "css"}),
    path("js/<path:path>", serve, {"document_root": BASE_DIR / "js"}),
    path("images/<path:path>", serve, {"document_root": BASE_DIR / "images"}),
]

# In development only, let Django serve uploaded files from /media/.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)