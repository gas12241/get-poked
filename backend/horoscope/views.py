import datetime

from django.db import IntegrityError
from django.http import Http404
from django.shortcuts import get_object_or_404
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


class HoroscopePullDatesView(APIView):
    # Powers the calendar's "which days in this month have a pull" check —
    # deliberately returns only bare date strings, not nested card data, so
    # it stays cheap regardless of how much history a user accumulates.
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
            HoroscopePull.objects.filter(
                user=request.user, pull_date__year=year, pull_date__month=month
            )
            .values_list("pull_date", flat=True)
            .order_by("pull_date")
        )
        return Response({"dates": [d.isoformat() for d in dates]})


class HoroscopePullDetailView(generics.RetrieveAPIView):
    # A single pull, looked up by date rather than id — powers both "does
    # today already have a pull" (checked read-only, no side effect, unlike
    # the idempotent-but-creating POST /horoscope/pull/ above) and "show me
    # this calendar day's cards." Scoped to the requesting user via the same
    # filter HoroscopeTodayView already uses, so one user can never probe
    # another user's dates.
    serializer_class = HoroscopePullSerializer

    def get_object(self):
        try:
            pull_date = datetime.date.fromisoformat(self.kwargs["date"])
        except ValueError as e:
            raise Http404 from e
        return get_object_or_404(HoroscopePull, user=self.request.user, pull_date=pull_date)
