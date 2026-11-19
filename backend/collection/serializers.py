from rest_framework import serializers

from cards.models import Card
from cards.serializers import CardListSerializer

from .models import CollectionEntry, Favorite


class FavoriteSerializer(serializers.ModelSerializer):
    card = CardListSerializer(read_only=True)
    card_id = serializers.PrimaryKeyRelatedField(
        queryset=Card.objects.all(), source="card", write_only=True
    )

    class Meta:
        model = Favorite
        fields = ["id", "card", "card_id", "date_added"]
        read_only_fields = ["id", "date_added"]

    def validate_card_id(self, card):
        user = self.context["request"].user
        if Favorite.objects.filter(user=user, card=card).exists():
            raise serializers.ValidationError("This card is already in your favorites.")
        return card

    def create(self, validated_data):
        return Favorite.objects.create(user=self.context["request"].user, **validated_data)


class CollectionEntrySerializer(serializers.ModelSerializer):
    card = CardListSerializer(read_only=True)
    card_id = serializers.PrimaryKeyRelatedField(
        queryset=Card.objects.all(), source="card", write_only=True, required=False
    )

    class Meta:
        model = CollectionEntry
        fields = ["id", "card", "card_id", "quantity", "date_added"]
        read_only_fields = ["id", "date_added"]

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value

    def validate(self, attrs):
        # card_id is only required on create — PATCHing just the quantity
        # of an existing entry doesn't (and shouldn't) resend it.
        if self.instance is None and "card" not in attrs:
            raise serializers.ValidationError({"card_id": "This field is required."})
        if self.instance is None:
            user = self.context["request"].user
            if CollectionEntry.objects.filter(user=user, card=attrs["card"]).exists():
                raise serializers.ValidationError(
                    {"card_id": "This card is already in your collection."}
                )
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        entry = CollectionEntry.objects.create(user=user, **validated_data)
        # Opt-in per-user setting — see docs/decisions.md #084. Off by
        # default, so Favorites and the collection stay fully independent
        # (#077) unless the user has explicitly asked for this.
        if user.auto_remove_favorite_on_collect:
            Favorite.objects.filter(user=user, card=entry.card).delete()
        return entry
