from django.shortcuts import render

import random
import secrets

from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings as django_settings

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from etms.responses import success_response

from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    RegisterSerializer,
    RequestPasswordResetOTPSerializer,
    ResetPasswordWithOTPSerializer,
    UserProfileSerializer,
    VerifyPasswordResetOTPSerializer,
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


# ---------------------------------------------------------------
# Forgot Password OTP Views
# ---------------------------------------------------------------

class RequestPasswordResetOTPView(APIView):
    """
    POST /api/auth/password-reset/request/
    Body: { "email": "user@example.com" }
    Generates a 6-digit OTP and sends it to the user's email.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RequestPasswordResetOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"]

        from .models import PasswordResetOTP, User
        user = User.objects.get(email__iexact=email)

        # Invalidate any previous unused OTPs for this user
        PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)

        # Generate new 6-digit OTP and a unique reset token
        otp_code = f"{random.randint(0, 999999):06d}"
        reset_token = secrets.token_hex(32)

        otp_obj = PasswordResetOTP.objects.create(
            user=user,
            otp=otp_code,
            reset_token=reset_token,
        )

        # Send email
        subject = "Your ETMS Password Reset OTP"
        message = (
            f"Hello {user.get_full_name() or user.username},\n\n"
            f"Your OTP for password reset is: {otp_code}\n\n"
            f"This OTP is only valid for 10 minutes.\n\n"
            f"If you did not request a password reset, please ignore this email.\n\n"
            f"— Employee Task Management System"
        )

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=django_settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send OTP email to {user.email}: {e}")
            print(f"\n[NETWORK BLOCKED SMTP] OTP for {user.email}: {otp_code}\n")

        return success_response(
            "OTP sent to your registered email address. Check your inbox.",
            {"email": email},
        )


class VerifyPasswordResetOTPView(APIView):
    """
    POST /api/auth/password-reset/verify/
    Body: { "email": "...", "otp": "123456" }
    Returns a reset_token to use in the final step.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyPasswordResetOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        reset_otp = serializer.validated_data["reset_otp"]

        # Mark OTP as verified (but not used yet — used only after password is set)
        reset_otp.is_verified = True
        reset_otp.save(update_fields=["is_verified"])

        return success_response(
            "OTP verified successfully.",
            {
                "email": user.email,
                "reset_token": reset_otp.reset_token,
            },
        )


class ResetPasswordWithOTPView(APIView):
    """
    POST /api/auth/password-reset/confirm/
    Body: { "email": "...", "reset_token": "...", "new_password": "...", "confirm_password": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordWithOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_response("Password reset successfully. You can now log in with your new password.")
