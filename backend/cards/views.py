from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from .filters import CardFilter
from .models import Card, Set, Type
from .ordering import CardOrderingFilter
from .serializers import CardDetailSerializer, CardListSerializer, SetSerializer, TypeSerializer


def scope_cards_by_set_or_series(queryset, request):
    """Narrows a Card queryset to `?set=<id>` or `?series=<name>` (an entire
    series, e.g. every Mega Evolution set — see docs/decisions.md #035),
    whichever the request provides. Neither present: the queryset passes
    through unscoped. Shared by the Rarity/Type/Supertype filter-option
    endpoints, which all narrow their choices the same way.
    """
    set_id = request.query_params.get("set")
    if set_id:
        return queryset.filter(set_id=set_id)
    series = request.query_params.get("series")
    if series:
        return queryset.filter(set__series__iexact=series)
    return queryset


class CardViewSet(ReadOnlyModelViewSet):
    queryset = (
        Card.objects.select_related("set")
        .prefetch_related("types", "attacks", "weaknesses__type", "resistances__type")
        .order_by("name", "number")
    )
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, CardOrderingFilter]
    filterset_class = CardFilter
    search_fields = ["name"]
    ordering_fields = ["name", "number", "rarity"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CardDetailSerializer
        return CardListSerializer


class SetViewSet(ReadOnlyModelViewSet):
    # Unpaginated, same reasoning as TypeViewSet: a few hundred sets at most,
    # and the frontend needs the full list at once to populate a filter dropdown.
    queryset = Set.objects.order_by("name")
    serializer_class = SetSerializer
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends = [OrderingFilter]
    ordering_fields = ["name", "release_date"]


class TypeViewSet(ReadOnlyModelViewSet):
    # `?set=<id>` or `?series=<name>` narrows to types actually used by at
    # least one matching card, so the frontend's Type filter only offers
    # choices that could possibly match something (see docs/decisions.md
    # #034, #035). Neither present: returns every type, unscoped.
    serializer_class = TypeSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Type.objects.order_by("name")
        set_id = self.request.query_params.get("set")
        series = self.request.query_params.get("series")
        if set_id:
            queryset = queryset.filter(cards__set_id=set_id)
        elif series:
            queryset = queryset.filter(cards__set__series__iexact=series)
        return queryset.distinct()


class RarityListView(APIView):
    # `rarity` is a plain CharField on Card, not its own model (unlike
    # Type/Set) — there's no natural tier ordering in the data (see the
    # actual distinct values), so this returns the distinct real values,
    # alphabetically, rather than a hand-maintained list that could drift
    # from what's actually in the database. `?set=<id>`/`?series=<name>`
    # narrow to rarities actually present there — see docs/decisions.md
    # #034, #035.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = scope_cards_by_set_or_series(Card.objects.exclude(rarity=""), request)
        rarities = queryset.order_by("rarity").values_list("rarity", flat=True).distinct()
        return Response(list(rarities))


CANONICAL_SUPERTYPES = ["Pokémon", "Trainer", "Energy"]


class SupertypeListView(APIView):
    # Same shape as RarityListView, for the same reason — `supertype` is a
    # plain CharField, and `?set=<id>`/`?series=<name>` narrow to what's
    # actually present there (see docs/decisions.md #034, #035). Unlike
    # rarity, supertype has a small, fixed, well-known set of values with a
    # conventional display order (Pokémon, Trainer, Energy) that
    # alphabetical sorting would not preserve, so present values are
    # filtered from that canonical order rather than sorted from the
    # database.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = scope_cards_by_set_or_series(Card.objects.all(), request)
        present = set(queryset.values_list("supertype", flat=True).distinct())
        return Response([s for s in CANONICAL_SUPERTYPES if s in present])
