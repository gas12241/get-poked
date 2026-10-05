import shutil
import tempfile
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework.test import APITestCase

from core.avatars import AVATAR_SIZE

User = get_user_model()


def make_image_file(size=(600, 300), color=(200, 60, 60), fmt="JPEG", name="photo.jpg"):
    buffer = BytesIO()
    Image.new("RGB", size, color=color).save(buffer, format=fmt)
    content_type = "image/jpeg" if fmt == "JPEG" else f"image/{fmt.lower()}"
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=content_type)


class AvatarUploadTests(APITestCase):
    def setUp(self):
        media_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_dir, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media_dir)
        override.enable()
        self.addCleanup(override.disable)

        self.user = User.objects.create_user(
            email="tester@example.com",
            password="s3cret-pass!",
            username="ash",
            is_verified=True,
        )
        self.client.force_authenticate(self.user)

    def test_no_avatar_by_default(self):
        response = self.client.get(reverse("me"))

        self.assertIsNone(response.data["avatar"])

    def test_upload_returns_absolute_url(self):
        response = self.client.patch(
            reverse("me"), {"avatar": make_image_file()}, format="multipart"
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["avatar"].startswith("http"))

    def test_non_square_upload_is_center_cropped_to_a_fixed_square(self):
        # Source is a 600x300 rectangle — a naive resize would squash it.
        self.client.patch(
            reverse("me"), {"avatar": make_image_file(size=(600, 300))}, format="multipart"
        )

        self.user.refresh_from_db()
        with Image.open(self.user.avatar) as stored:
            self.assertEqual(stored.size, (AVATAR_SIZE, AVATAR_SIZE))

    @override_settings(MAX_AVATAR_UPLOAD_SIZE=10)
    def test_oversized_file_is_rejected(self):
        response = self.client.patch(
            reverse("me"), {"avatar": make_image_file()}, format="multipart"
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar)

    def test_disallowed_content_type_is_rejected(self):
        bad_file = SimpleUploadedFile("note.txt", b"not an image", content_type="text/plain")

        response = self.client.patch(reverse("me"), {"avatar": bad_file}, format="multipart")

        self.assertEqual(response.status_code, 400)

    def test_clearing_avatar(self):
        self.client.patch(reverse("me"), {"avatar": make_image_file()}, format="multipart")

        response = self.client.patch(reverse("me"), {"avatar": None}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["avatar"])
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar)
