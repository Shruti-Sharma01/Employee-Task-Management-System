from django.urls import path

from .views import (
    ChangePasswordView,
    LoginView,
    ProfileView,
    RegisterView,
    TokenRefreshAPIView,
    RequestPasswordResetOTPView,
    VerifyPasswordResetOTPView,
    ResetPasswordWithOTPView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshAPIView.as_view(), name="token-refresh"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("change-password/", ChangePasswordView.as_view(), name="change-password"),
    # Forgot password OTP flow
    path("password-reset/request/", RequestPasswordResetOTPView.as_view(), name="password-reset-request"),
    path("password-reset/verify/", VerifyPasswordResetOTPView.as_view(), name="password-reset-verify"),
    path("password-reset/confirm/", ResetPasswordWithOTPView.as_view(), name="password-reset-confirm"),
]