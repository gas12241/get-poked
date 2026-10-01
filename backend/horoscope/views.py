from django.db import IntegrityError
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HoroscopePull
from .selection import build_daily_pull
from .serializers import HoroscopePullSerializer


class HoroscopeTodayView(APIView):
    # No explicit permission_classes — DEFAULT_PERMISSION_CLASSES is already
    # IsAuthenticated, same as QuizAttemptListCreateView relies on.

    def post(self, request):
        today = timezone.now().date()
        pull = HoroscopePull.objects.filter(user=request.user, pull_date=today).first()
        created = False
        if pull is None:
            try:
                pull = build_daily_pull(request.user, today)
                created = True
            except IntegrityError:
                # Race: a concurrent request for the same user/day won first.
                pull = HoroscopePull.objects.get(user=request.user, pull_date=today)
        serializer = HoroscopePullSerializer(pull)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class HoroscopePullListView(generics.ListAPIView):
    serializer_class = HoroscopePullSerializer

    def get_queryset(self):
        return HoroscopePull.objects.filter(user=self.request.user).prefetch_related(
            "cards__card__set", "cards__card__types"
        )
