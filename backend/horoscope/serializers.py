from rest_framework import serializers

from cards.serializers import CardListSerializer

from .models import HoroscopeCard, HoroscopePull


class HoroscopeCardSerializer(serializers.ModelSerializer):
    card = CardListSerializer(read_only=True)

    class Meta:
        model = HoroscopeCard
        fields = ["card", "supertype", "rarity_tier", "order"]


class HoroscopePullSerializer(serializers.ModelSerializer):
    # Entirely server-computed and read-only — unlike QuizAttemptSerializer,
    # there's no client-submitted payload to validate; the whole pull is
    # generated server-side in one shot by HoroscopeTodayView.
    cards = HoroscopeCardSerializer(many=True, read_only=True)

    class Meta:
        model = HoroscopePull
        fields = ["id", "pull_date", "pulled_at", "cards"]
