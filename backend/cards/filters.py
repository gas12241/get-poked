import django_filters

from .models import Card


class CardFilter(django_filters.FilterSet):
    type = django_filters.CharFilter(field_name="types__name", lookup_expr="iexact")
    # Cards across every set in a series (e.g. all Mega Evolution sets),
    # rather than one specific set — see docs/decisions.md #035. `set` and
    # `series` are independent filters; the frontend only ever sends one.
    series = django_filters.CharFilter(field_name="set__series", lookup_expr="iexact")
    # `collection_entries`/`favorited_by` are reverse accessors created by
    # the ForeignKeys already defined on collection.CollectionEntry/
    # Favorite — no import from the `collection` app needed here, Django's
    # app registry wires the relation up on Card regardless of which app
    # declared it. See docs/decisions.md #079. `UniqueConstraint(user,
    # card)` on both models already guarantees at most one matching row
    # per card, so no `.distinct()` is needed to avoid duplicate results.
    owned = django_filters.BooleanFilter(method="filter_owned")
    favorited = django_filters.BooleanFilter(method="filter_favorited")

    class Meta:
        model = Card
        fields = ["rarity", "supertype", "set", "type", "series"]

    def filter_owned(self, queryset, name, value):
        if not value:
            return queryset
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        return queryset.filter(collection_entries__user=user)

    def filter_favorited(self, queryset, name, value):
        if not value:
            return queryset
        user = self.request.user
        if not user.is_authenticated:
            return queryset.none()
        return queryset.filter(favorited_by__user=user)
