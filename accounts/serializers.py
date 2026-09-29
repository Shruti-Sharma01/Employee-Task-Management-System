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

    class Meta:
        model = User
        fields = ["username", "email", "first_name", "last_name",
                  "password", "confirm_password", "role"]

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate_role(self, value):
        # Security: strangers must not be able to make themselves ADMIN.
        request = self.context.get("request")
        requester_is_admin = (
            request is not None
            and request.user.is_authenticated
            and request.user.role == User.Role.ADMIN
        )
        if value != User.Role.EMPLOYEE and not requester_is_admin:
            raise serializers.ValidationError(
                "Only an admin can create ADMIN or MANAGER accounts."
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
        password = validated_data.pop("password")
        # create_user hashes the password. We never store it as plain text.
        return User.objects.create_user(password=password, **validated_data)


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