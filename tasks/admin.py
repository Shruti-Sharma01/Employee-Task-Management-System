from django.contrib import admin
from .models import Task, TaskComment, TaskAttachment, TaskActivity, TimeEntry

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "assigned_to", "assigned_by", "priority", "status", "deadline"]
    list_filter = ["status", "priority", "category"]
    search_fields = ["title", "description"]

@admin.register(TimeEntry)
class TimeEntryAdmin(admin.ModelAdmin):
    list_display = ["id", "task", "user", "start_time", "end_time", "duration_seconds", "created_at"]
    list_filter = ["user", "start_time"]
    search_fields = ["task__title", "description", "user__username"]

admin.site.register(TaskComment)
admin.site.register(TaskAttachment)
admin.site.register(TaskActivity)
