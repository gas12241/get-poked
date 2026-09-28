from rest_framework import serializers

from .models import Attack, Card, Resistance, Set, Type, Weakness


class TypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Type
        fields = ["id", "name"]


class SetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Set
        fields = [
            "id",
            "tcg_id",
            "name",
            "series",
            "release_date",
            "language",
            "image_symbol",
            "image_logo",
        ]


class SetNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Set
        fields = ["id", "name", "series", "release_date"]


class AttackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attack
        fields = ["name", "cost", "converted_energy_cost", "damage", "text", "order"]


class WeaknessSerializer(serializers.ModelSerializer):
    type = TypeSerializer(read_only=True)

    class Meta:
        model = Weakness
        fields = ["type", "value"]


class ResistanceSerializer(serializers.ModelSerializer):
    type = TypeSerializer(read_only=True)

    class Meta:
        model = Resistance
        fields = ["type", "value"]


class CardListSerializer(serializers.ModelSerializer):
    set = SetNestedSerializer(read_only=True)
    types = TypeSerializer(many=True, read_only=True)

    class Meta:
        model = Card
        fields = [
            "id",
            "name",
            "number",
            "rarity",
            "supertype",
            "image_small",
            "image_large",
            "artist",
            "set",
            "types",
        ]


class CardDetailSerializer(serializers.ModelSerializer):
    set = SetNestedSerializer(read_only=True)
    types = TypeSerializer(many=True, read_only=True)
    attacks = AttackSerializer(many=True, read_only=True)
    weaknesses = WeaknessSerializer(many=True, read_only=True)
    resistances = ResistanceSerializer(many=True, read_only=True)

    class Meta:
        model = Card
        fields = [
            "id",
            "name",
            "number",
            "rarity",
            "hp",
            "supertype",
            "language",
            "image_small",
            "image_large",
            "artist",
            "national_pokedex_numbers",
            "subtypes",
            "evolves_from",
            "evolves_to",
            "tcgplayer_url",
            "cardmarket_url",
            "details",
            "set",
            "types",
            "attacks",
            "weaknesses",
            "resistances",
        ]
