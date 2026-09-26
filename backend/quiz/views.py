import random

from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from cards.models import Card

from .eligibility import GUESS_CARD, GUESS_HP, GUESS_SET, eligible_card_ids
from .models import QuizAttempt
from .questions import build_question, check_answer
from .serializers import QuizAttemptSerializer

VALID_MODES = (GUESS_CARD, GUESS_SET, GUESS_HP)
DEFAULT_QUESTION_COUNT = 10
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

        try:
            count = int(request.query_params.get("count", DEFAULT_QUESTION_COUNT))
        except ValueError:
            count = DEFAULT_QUESTION_COUNT
        count = max(1, min(count, MAX_QUESTION_COUNT))

        ids = eligible_card_ids(mode, rarities)
        sample_ids = random.sample(ids, min(count, len(ids)))
        cards_by_id = {
            card.id: card
            for card in Card.objects.filter(id__in=sample_ids)
            .select_related("set")
            .prefetch_related("types")
        }
        questions = [build_question(cards_by_id[card_id], mode) for card_id in sample_ids]

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


class QuizAttemptListCreateView(generics.ListCreateAPIView):
    serializer_class = QuizAttemptSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return QuizAttempt.objects.filter(user=self.request.user)
