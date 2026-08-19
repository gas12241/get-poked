import django_filters

from .models import Card


class CardFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(field_name="types__name", lookup_expr="iexact")

    class Meta:
        model = Card
        fields = ["rarity", "supertype", "set", "type"]
