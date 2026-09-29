import django_filters

from .models import Task


class TaskFilter(django_filters.FilterSet):
    employee = django_filters.NumberFilter(field_name="assigned_to")            # ?employee=2
    manager = django_filters.NumberFilter(field_name="assigned_to__manager")    # ?manager=1
    deadline = django_filters.DateFilter(field_name="deadline")                 # exact date
    deadline_before = django_filters.DateFilter(field_name="deadline", lookup_expr="lte")
    deadline_after = django_filters.DateFilter(field_name="deadline", lookup_expr="gte")

    class Meta:
        model = Task
        fields = ["status", "priority"]