from django.shortcuts import render

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from etms.responses import success_response

from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserProfileSerializer,
)


class RegisterView(APIView):
    """POST /api/auth/register/ - open to everyone, but only creates EMPLOYEE
    accounts unless the caller is a logged-in ADMIN."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)  # 400 if invalid
        user = serializer.save()
        return success_response(
            "User registered successfully",
            UserProfileSerializer(user).data,
            status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """POST /api/auth/login/ - returns access + refresh tokens."""

    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        response.data = {"success": True, "message": "Login successful", "data": response.data}
        return response


class TokenRefreshAPIView(TokenRefreshView):
    """POST /api/auth/token/refresh/ - exchange a refresh token for a new access token."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        response.data = {"success": True, "message": "Token refreshed", "data": response.data}
        return response


class ProfileView(APIView):
    """GET /api/auth/profile/ - the logged-in user's own details."""

    def get(self, request):
        return success_response("Profile fetched successfully",
                                UserProfileSerializer(request.user).data)


class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response("Password changed successfully")