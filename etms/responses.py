from rest_framework import status
from rest_framework.response import Response


def success_response(message, data=None, status_code=status.HTTP_200_OK):
    """Every successful API answer uses this shape."""
    return Response(
        {"success": True, "message": message, "data": data if data is not None else {}},
        status=status_code,
    )