import os

from django.core.exceptions import ValidationError

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".png", ".jpg", ".jpeg",
}
MAX_FILE_SIZE_MB = 5


def validate_attachment(file):
    """Reject dangerous file types and files that are too big."""
    extension = os.path.splitext(file.name)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ValidationError(f"File type '{extension}' is not allowed. Allowed types: {allowed}")

    if file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise ValidationError(f"File is too large. Maximum size is {MAX_FILE_SIZE_MB} MB.")