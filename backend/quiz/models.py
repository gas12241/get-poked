from django.conf import settings
from django.db import models

from cards.models import Card


class QuizMode(models.TextChoices):
    GUESS_CARD = "guess_card", "Guess the Card"
    GUESS_SET = "guess_set", "Guess the Set"
    GUESS_HP = "guess_hp", "Guess the HP"


class QuizAttempt(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts"
    )
    quiz_mode = models.CharField(max_length=20, choices=QuizMode.choices)
    score = models.PositiveSmallIntegerField()
    total_questions = models.PositiveSmallIntegerField()
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.user} — {self.quiz_mode} ({self.score}/{self.total_questions})"


class QuizAttemptAnswer(models.Model):
    quiz_attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name="quiz_answers")
    is_correct = models.BooleanField()
    time_taken_seconds = models.FloatField()
    order = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.card.name} ({'correct' if self.is_correct else 'incorrect'})"
