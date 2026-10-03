import django.contrib.auth.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_backfill_username"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="username",
            field=models.CharField(
                max_length=150,
                unique=True,
                validators=[django.contrib.auth.validators.UnicodeUsernameValidator()],
            ),
        ),
    ]
