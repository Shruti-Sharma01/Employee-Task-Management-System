from django.shortcuts import render
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, generics, status
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrReadOnly
from etms.responses import success_response

from .models import Employee
from .serializers import EmployeeSerializer, EmployeeWriteSerializer


class EmployeeListCreateView(generics.ListCreateAPIView):
    """GET /api/employees/  and  POST /api/employees/"""

    queryset = Employee.objects.select_related("user", "manager").all()
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["department", "designation", "manager", "is_active"]
    search_fields = ["full_name", "employee_id", "email", "department", "designation"]
    ordering_fields = ["full_name", "joining_date", "created_at"]

    def get_serializer_class(self):
        return EmployeeSerializer if self.request.method == "GET" else EmployeeWriteSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save()
        return success_response(
            "Employee created successfully",
            EmployeeSerializer(employee).data,
            status.HTTP_201_CREATED,
        )

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # response.data already has DRF's pagination shape: count/next/previous/results
        return success_response("Employees fetched successfully", response.data)


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET / PUT / PATCH / DELETE  /api/employees/<id>/"""

    queryset = Employee.objects.select_related("user", "manager").all()
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        return EmployeeSerializer if self.request.method == "GET" else EmployeeWriteSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        return success_response("Employee fetched successfully", EmployeeSerializer(instance).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        employee = serializer.save()
        return success_response("Employee updated successfully", EmployeeSerializer(employee).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        return success_response("Employee deleted successfully", status_code=status.HTTP_204_NO_CONTENT)