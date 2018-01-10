from django.conf import settings
from django.db import models


class Grant(models.Model):
    scope = models.TextField()
    client = models.TextField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        indexes = [
            models.Index(fields=['scope', 'client']),
        ]
