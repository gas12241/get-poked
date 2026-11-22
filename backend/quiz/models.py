import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from cards.models import Card, Set

from .eligibility import DIFFICULTIES


class QuizMode(models.TextChoices):
    GUESS_CARD = "guess_card", "Guess the Card"
    GUESS_SET = "guess_set", "Guess the Set"
    GUESS_HP = "guess_hp", "Guess the HP"
    # A question about a Set directly (its icon), not a masked card — see
    # QuizAttemptAnswer.set below. Deliberately a different mode from
    # GUESS_SET, which is about a card and happens to blur out its symbol.
    GUESS_SET_ICON = "guess_set_icon", "Guess the Set by Symbol"


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
    # Set only when this attempt was saved from someone else's shared quiz
    # link (see QuizShare below) — SET_NULL, not CASCADE, so the attempt
    # itself never disappears just because the original sharer's account
    # later goes away; it only loses the attribution. See
    # docs/decisions.md #101.
    shared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="shared_quiz_attempts",
    )

    class Meta:
        ordering = ["-completed_at"]

    def __str__(self):
        return f"{self.user} — {self.quiz_mode} ({self.score}/{self.total_questions})"


class QuizAttemptAnswer(models.Model):
    quiz_attempt = models.ForeignKey(QuizAttempt, on_delete=models.CASCADE, related_name="answers")
    # Exactly one of card/set is ever populated, enforced by the
    # CheckConstraint below — every mode except GUESS_SET_ICON is about a
    # card; GUESS_SET_ICON is about a set directly (its icon), with no
    # particular card involved at all. See docs/decisions.md #096.
    card = models.ForeignKey(
        Card, on_delete=models.PROTECT, related_name="quiz_answers", null=True, blank=True
    )
    set = models.ForeignKey(
        Set, on_delete=models.PROTECT, related_name="quiz_answers", null=True, blank=True
    )
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
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(card__isnull=False, set__isnull=True)
                    | Q(card__isnull=True, set__isnull=False)
                ),
                name="quizattemptanswer_card_xor_set",
            )
        ]

    def __str__(self):
        subject = self.card.name if self.card_id else self.set.name
        return f"{subject} ({'correct' if self.is_correct else 'incorrect'})"


class QuizShare(models.Model):
    """A shareable link to replay someone else's completed quiz. One per
    attempt — get_or_create on `attempt` is what makes repeat "Share this
    quiz" clicks idempotent (same link every time) rather than minting a
    new one per click. Mode, difficulty, length, and the exact ordered
    card/set targets all already live on `attempt`/`attempt.answers`, so
    nothing about the quiz itself is duplicated here. See
    docs/decisions.md #101.
    """

    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    attempt = models.OneToOneField(QuizAttempt, on_delete=models.CASCADE, related_name="share")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Share of {self.attempt}"
