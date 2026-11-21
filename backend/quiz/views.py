import datetime
import random

from django.db.models.functions import TruncDate
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from cards.models import Card

from .eligibility import DIFFICULTIES, GUESS_CARD, GUESS_HP, GUESS_SET, eligible_card_ids
from .models import QuizAttempt
from .questions import build_question, check_answer
from .serializers import (
    QuizAttemptCreateSerializer,
    QuizAttemptDetailSerializer,
    QuizAttemptSummarySerializer,
)

VALID_MODES = (GUESS_CARD, GUESS_SET, GUESS_HP)
DEFAULT_QUESTION_COUNT = 5
MAX_QUESTION_COUNT = 20


class QuizQuestionsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        mode = request.query_params.get("mode")
        if mode not in VALID_MODES:
            return Response(
                {"detail": f"mode must be one of: {', '.join(VALID_MODES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rarities_param = request.query_params.get("rarities")
        rarities = [r for r in rarities_param.split(",") if r] if rarities_param else None

        difficulty = request.query_params.get("difficulty")
        if difficulty is not None and difficulty not in DIFFICULTIES:
            return Response(
                {"detail": f"difficulty must be one of: {', '.join(DIFFICULTIES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            count = int(request.query_params.get("count", DEFAULT_QUESTION_COUNT))
        except ValueError:
            count = DEFAULT_QUESTION_COUNT
        count = max(1, min(count, MAX_QUESTION_COUNT))

        ids = eligible_card_ids(mode, rarities, difficulty)
        sample_ids = random.sample(ids, min(count, len(ids)))
        cards_by_id = {
            card.id: card
            for card in Card.objects.filter(id__in=sample_ids)
            .select_related("set")
            .prefetch_related("types")
        }
        questions = [build_question(cards_by_id[card_id], mode, request) for card_id in sample_ids]

        return Response({"questions": questions})


class QuizCheckView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        mode = request.data.get("mode")
        if mode not in VALID_MODES:
            return Response(
                {"detail": f"mode must be one of: {', '.join(VALID_MODES)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        card = get_object_or_404(Card, id=request.data.get("card"))
        correct, answer = check_answer(card, mode, request.data.get("guess", ""))

        return Response({"correct": correct, "answer": answer})


class QuizAttemptCreateView(generics.CreateAPIView):
    serializer_class = QuizAttemptCreateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attempt = serializer.save()
        # The response uses the richer detail shape (real, unmasked card
        # images included) rather than echoing back the input — the
        # frontend's post-quiz breakdown screen renders directly from this,
        # see docs/decisions.md #088.
        output = QuizAttemptDetailSerializer(attempt, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)


class QuizAttemptDatesView(APIView):
    # Powers the history calendar's "which days this month have an attempt"
    # check — bare date strings only, same cheapness reasoning as
    # HoroscopePullDatesView. completed_at is a DateTimeField (not a plain
    # date like Horoscope's pull_date), so TruncDate+distinct collapses
    # multiple same-day attempts to one date each.
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        month_param = request.query_params.get("month", "")
        try:
            year_str, month_str = month_param.split("-")
            year, month = int(year_str), int(month_str)
            if not 1 <= month <= 12:
                raise ValueError
        except ValueError:
            return Response(
                {"detail": "month must be in YYYY-MM format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        dates = (
            QuizAttempt.objects.filter(
                user=request.user, completed_at__year=year, completed_at__month=month
            )
            .annotate(date=TruncDate("completed_at"))
            .values_list("date", flat=True)
            .distinct()
            .order_by("date")
        )
        return Response({"dates": [d.isoformat() for d in dates]})


class QuizAttemptsByDateView(APIView):
    # Unlike a Horoscope pull, there's no one-per-day constraint on quiz
    # attempts, so this returns a list (possibly empty — not a 404) rather
    # than a single object.
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, date):
        try:
            date_obj = datetime.date.fromisoformat(date)
        except ValueError as e:
            raise Http404 from e

        attempts = QuizAttempt.objects.filter(user=request.user, completed_at__date=date_obj)
        return Response(QuizAttemptSummarySerializer(attempts, many=True).data)


class QuizAttemptDetailView(generics.RetrieveAPIView):
    serializer_class = QuizAttemptDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Scoped to the requesting user — another account's attempt id 404s,
        # same pattern as every other per-user detail view in this app.
        return QuizAttempt.objects.filter(user=self.request.user).prefetch_related(
            "answers__card__set", "answers__card__types"
        )
