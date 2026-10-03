import re

from django.db import migrations


def _generate_username(User, email):
    base = re.sub(r"[^\w.@+-]", "", email.split("@")[0].lower()) or "user"
    username = base
    suffix = 0
    while User.objects.filter(username=username).exists():
        suffix += 1
        username = f"{base}{suffix}"
    return username


def backfill_usernames(apps, schema_editor):
    User = apps.get_model("core", "User")
    for user in User.objects.filter(username__isnull=True):
        user.username = _generate_username(User, user.email)
        user.save(update_fields=["username"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_user_username"),
    ]

    operations = [
        migrations.RunPython(backfill_usernames, noop),
    ]
