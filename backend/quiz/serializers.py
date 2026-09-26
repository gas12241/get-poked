from django.db import transaction
from rest_framework import serializers

from cards.models import Card

from .models import QuizAttempt, QuizAttemptAnswer


class QuizAttemptAnswerSerializer(serializers.ModelSerializer):
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = QuizAttemptAnswer
        fields = ["card", "is_correct", "time_taken_seconds", "order"]


class QuizAttemptSerializer(serializers.ModelSerializer):
    answers = QuizAttemptAnswerSerializer(many=True, write_only=True)

    class Meta:
        model = QuizAttempt
        fields = ["id", "quiz_mode", "score", "total_questions", "completed_at", "answers"]
        read_only_fields = ["id", "score", "total_questions", "completed_at"]

    @transaction.atomic
    def create(self, validated_data):
        answers_data = validated_data.pop("answers")
        # Score is computed server-side from the submitted per-question results,
        # not trusted as a client-provided total.
        score = sum(1 for answer in answers_data if answer["is_correct"])
        attempt = QuizAttempt.objects.create(
            user=self.context["request"].user,
            quiz_mode=validated_data["quiz_mode"],
            score=score,
            total_questions=len(answers_data),
        )
        QuizAttemptAnswer.objects.bulk_create(
            QuizAttemptAnswer(quiz_attempt=attempt, **answer) for answer in answers_data
        )
        return attempt
