from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image

AVATAR_SIZE = 256


def process_avatar(uploaded_file) -> ContentFile:
    """Center-crop to a square and resize, so every avatar is the same
    size on disk and in the UI regardless of what was uploaded."""
    image = Image.open(uploaded_file).convert("RGB")
    width, height = image.size
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    image = image.crop((left, top, left + side, top + side))
    image = image.resize((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return ContentFile(buffer.getvalue(), name="avatar.jpg")
