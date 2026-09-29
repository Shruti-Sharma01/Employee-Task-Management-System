from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    """Turn DRF errors into {"success": false, "message": ..., "errors": {...}}."""
    response = exception_handler(exc, context)  # DRF's default handling first
    if response is None:
        return None  # unexpected server error, let Django handle it (500)

    data = response.data
    if isinstance(data, dict) and "detail" in data:
        # e.g. 401 "Authentication credentials were not provided."
        message, errors = str(data["detail"]), {}
    else:
        # e.g. 400 validation errors
        message = "Invalid request"
        errors = data if isinstance(data, dict) else {"non_field_errors": data}

    response.data = {"success": False, "message": message, "errors": errors}
    return response