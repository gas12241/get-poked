from django.conf import settings
from django.db import models

from cards.models import Card

from .eligibility import DIFFICULTIES


class QuizMode(models.TextChoices):
    GUESS_CARD = "guess_card", "Guess the Card"
    GUESS_SET = "guess_set", "Guess the Set"
    GUESS_HP = "guess_hp", "Guess the HP"


class QuizAttempt(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="quiz_attempts"
    )
    quiz_mode = models.CharField(max_length=20, choices=QuizMode.choices)
    # Same values QuizQuestionsView already accepts (eligibility.DIFFICULTIES) —
    # not captured here until now even though the frontend always knew it.
    # Needed for the history list (see docs/decisions.md #088); default exists
    # only so pre-existing rows migrate cleanly.
    difficulty = models.CharField(
        max_length=10, choices=[(d, d.capitalize()) for d in DIFFICULTIES], default="medium"
    )
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
    # The user's actual raw guess — re-checked server-side at save time rather
    # than trusting a client-submitted is_correct (see docs/decisions.md #088).
    # blank/default exist only so pre-existing rows migrate cleanly; every new
    # row going forward always has a real one (enforced by the serializer).
    guess = models.CharField(max_length=255, default="", blank=True)
    is_correct = models.BooleanField()
    time_taken_seconds = models.FloatField()
    order = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.card.name} ({'correct' if self.is_correct else 'incorrect'})"
