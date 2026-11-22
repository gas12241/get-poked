from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from cards.models import Card, Set
from cards.serializers import CardListSerializer, SetSerializer

from .models import QuizAttempt, QuizAttemptAnswer, QuizShare
from .questions import check_answer
from .sets_quiz import GUESS_SET_ICON, check_set_icon_answer


class QuizAttemptAnswerCreateSerializer(serializers.ModelSerializer):
    # select_related("set") — check_answer touches card.set.name for
    # guess_set, otherwise every such answer is an extra query.
    card = serializers.PrimaryKeyRelatedField(
        queryset=Card.objects.select_related("set"), required=False
    )
    # Populated instead of card for guess_set_icon — the question is about
    # a Set directly, not any particular card. Exactly one of the two is
    # ever present, enforced by the model's own CheckConstraint.
    set = serializers.PrimaryKeyRelatedField(queryset=Set.objects.all(), required=False)

    class Meta:
        model = QuizAttemptAnswer
        fields = ["card", "set", "guess", "is_correct", "time_taken_seconds", "order"]
        read_only_fields = ["is_correct"]


class QuizAttemptCreateSerializer(serializers.ModelSerializer):
    answers = QuizAttemptAnswerCreateSerializer(many=True)
    # Present only when this attempt was saved from a shared quiz link —
    # see QuizShareDetailView/docs/decisions.md #101. Write-only: the
    # client never needs it echoed back, and it's resolved into shared_by
    # below rather than stored verbatim.
    shared_token = serializers.UUIDField(required=False, write_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            "id",
            "quiz_mode",
            "difficulty",
            "score",
            "total_questions",
            "answers",
            "shared_token",
        ]
        read_only_fields = ["id", "score", "total_questions"]

    @transaction.atomic
    def create(self, validated_data):
        answers_data = validated_data.pop("answers")
        # A stale or unknown token is ignored rather than failing the save
        # — losing the "shared by" attribution is a much smaller problem
        # than losing the score.
        shared_token = validated_data.pop("shared_token", None)
        shared_by = None
        if shared_token:
            share = (
                QuizShare.objects.filter(token=shared_token).select_related("attempt__user").first()
            )
            if share:
                shared_by = share.attempt.user
        quiz_mode = validated_data["quiz_mode"]
        # Re-derived here, not trusted from the client (see docs/decisions.md
        # #088) — a client could otherwise POST a fake perfect score, and
        # since only is_correct (not the raw guess) used to be stored, there
        # was no way to catch or even retroactively verify this later.
        for answer in answers_data:
            if quiz_mode == GUESS_SET_ICON:
                correct, _ = check_set_icon_answer(answer["set"], answer["guess"])
            else:
                correct, _ = check_answer(answer["card"], quiz_mode, answer["guess"])
            answer["is_correct"] = correct
        score = sum(1 for answer in answers_data if answer["is_correct"])
        attempt = QuizAttempt.objects.create(
            user=self.context["request"].user,
            quiz_mode=quiz_mode,
            difficulty=validated_data["difficulty"],
            score=score,
            total_questions=len(answers_data),
            shared_by=shared_by,
        )
        QuizAttemptAnswer.objects.bulk_create(
            QuizAttemptAnswer(quiz_attempt=attempt, **answer) for answer in answers_data
        )
        return attempt


class QuizAttemptAnswerDetailSerializer(serializers.ModelSerializer):
    # The real, fully unmasked card — not the quiz's masked question image
    # (see docs/decisions.md #088) — so "what was I looking at" is answerable
    # at a glance, with a real id to link to its own detail page. For
    # guess_set_icon, `set` is populated instead — there's no card to show,
    # no set detail page to link to, just the set's own icon + name.
    card = CardListSerializer(read_only=True)
    set = SetSerializer(read_only=True)
    correct_answer = serializers.SerializerMethodField()

    class Meta:
        model = QuizAttemptAnswer
        fields = [
            "card",
            "set",
            "guess",
            "correct_answer",
            "is_correct",
            "time_taken_seconds",
            "order",
        ]

    def get_correct_answer(self, obj):
        # Always derivable from the card/set + mode — no need to store it
        # separately. The guess passed in doesn't affect this half of
        # either check function's return value.
        if obj.set_id:
            _, answer = check_set_icon_answer(obj.set, "")
        else:
            _, answer = check_answer(obj.card, obj.quiz_attempt.quiz_mode, "")
        return answer


class SharedBySerializer(serializers.ModelSerializer):
    # Username only — the public, non-credential display identity (see
    # core/models.py), never email. Nulls through automatically on read
    # when an attempt has no shared_by.
    class Meta:
        model = get_user_model()
        fields = ["id", "username"]


class QuizAttemptDetailSerializer(serializers.ModelSerializer):
    answers = QuizAttemptAnswerDetailSerializer(many=True, read_only=True)
    shared_by = SharedBySerializer(read_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            "id",
            "quiz_mode",
            "difficulty",
            "score",
            "total_questions",
            "completed_at",
            "answers",
            "shared_by",
        ]


class QuizAttemptSummarySerializer(serializers.ModelSerializer):
    shared_by = SharedBySerializer(read_only=True)

    class Meta:
        model = QuizAttempt
        fields = [
            "id",
            "quiz_mode",
            "difficulty",
            "score",
            "total_questions",
            "completed_at",
            "shared_by",
        ]
