import django_filters

from .models import Card


class CardFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(field_name="types__name", lookup_expr="iexact")
    # Cards across every set in a series (e.g. all Mega Evolution sets),
    # rather than one specific set — see docs/decisions.md #035. `set` and
    # `series` are independent filters; the frontend only ever sends one.
    series = django_filters.CharFilter(field_name="set__series", lookup_expr="iexact")

    class Meta:
        model = Card
        fields = ["rarity", "supertype", "set", "type", "series"]
