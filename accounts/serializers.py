from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserProfileSerializer(serializers.ModelSerializer):
    """Safe, read-only view of a user. Never includes the password."""

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name",
                  "role", "is_active", "date_joined"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    confirm_password = serializers.CharField(write_only=True, style={"input_type": "password"})
    role = serializers.ChoiceField(choices=User.Role.choices, default=User.Role.EMPLOYEE)
    department = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name",
                  "password", "confirm_password", "role", "department"]

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_role(self, value):
        # ADMIN accounts can only be created via Django admin panel or createsuperuser.
        # Anyone can register as EMPLOYEE or MANAGER from the frontend.
        if value == User.Role.ADMIN:
            raise serializers.ValidationError(
                "Admin accounts cannot be created from the registration page. "
                "Please contact your system administrator."
            )
        allowed = [User.Role.EMPLOYEE, User.Role.MANAGER]
        if value not in allowed:
            raise serializers.ValidationError(
                f"Invalid role. Choose from: {', '.join(allowed)}"
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        # Run Django's password rules (length, common passwords, similarity to username...)
        candidate = User(username=attrs.get("username"), email=attrs.get("email"),
                         first_name=attrs.get("first_name", ""),
                         last_name=attrs.get("last_name", ""))
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)})
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        department = validated_data.pop("department", "General") or "General"
        password = validated_data.pop("password")
        # create_user hashes the password. We never store it as plain text.
        user = User.objects.create_user(password=password, **validated_data)

        # Automatically create linked Employee profile
        from employees.models import Employee
        from django.utils import timezone
        emp_id = f"EMP{user.id:04d}"
        full_name = f"{user.first_name} {user.last_name}".strip() or user.username
        Employee.objects.get_or_create(
            user=user,
            defaults={
                "employee_id": emp_id,
                "full_name": full_name,
                "email": user.email,
                "department": department,
                "designation": user.role.capitalize(),
                "joining_date": timezone.localdate(),
            }
        )
        return user


class LoginSerializer(TokenObtainPairSerializer):
    """SimpleJWT login, plus the user's details and role in the answer."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role          # the frontend can read the role from the token
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)     # checks username/password, builds tokens
        data["user"] = UserProfileSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    confirm_new_password = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Old password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_new_password"]:
            raise serializers.ValidationError({"confirm_new_password": "Passwords do not match."})
        try:
            validate_password(attrs["new_password"], user=self.context["request"].user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": list(error.messages)})
        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save()
        return user


class RequestPasswordResetOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        value = value.strip().lower()
        if not User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("No account found with this email address.")
        return value


class VerifyPasswordResetOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(max_length=6, min_length=6)

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        otp = attrs.get("otp", "").strip()

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({"email": "No account found with this email address."})

        from .models import PasswordResetOTP
        reset_otp = (
            PasswordResetOTP.objects.filter(user=user, otp=otp, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if not reset_otp:
            raise serializers.ValidationError({"otp": "Invalid OTP code."})

        if reset_otp.is_expired():
            raise serializers.ValidationError({"otp": "OTP code has expired. Please request a new one."})

        attrs["user"] = user
        attrs["reset_otp"] = reset_otp
        return attrs


class ResetPasswordWithOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    reset_token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        token = attrs.get("reset_token", "").strip()
        new_password = attrs.get("new_password")
        confirm_password = attrs.get("confirm_password")

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({"email": "No account found with this email address."})

        from .models import PasswordResetOTP
        try:
            reset_otp = PasswordResetOTP.objects.get(
                user=user, reset_token=token, is_verified=True, is_used=False
            )
        except PasswordResetOTP.DoesNotExist:
            raise serializers.ValidationError({"reset_token": "Invalid or expired reset session. Please request OTP again."})

        if reset_otp.is_expired():
            raise serializers.ValidationError({"reset_token": "Reset session expired. Please request a new OTP."})

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": list(error.messages)})

        attrs["user"] = user
        attrs["reset_otp"] = reset_otp
        return attrs

    def save(self):
        user = self.validated_data["user"]
        reset_otp = self.validated_data["reset_otp"]
        user.set_password(self.validated_data["new_password"])
        user.save()
        reset_otp.is_used = True
        reset_otp.save(update_fields=["is_used"])
        return user