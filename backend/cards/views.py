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
    # `?set=<id>` narrows to types actually used by at least one card in
    # that set, so the frontend's Type filter only offers choices that
    # could possibly match something (see docs/decisions.md #034). Omitted
    # (or invalid), returns every type — the pre-existing, unscoped
    # behavior.
    serializer_class = TypeSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Type.objects.order_by("name")
        set_id = self.request.query_params.get("set")
        if set_id:
            queryset = queryset.filter(cards__set_id=set_id).distinct()
        return queryset


class RarityListView(APIView):
    # `rarity` is a plain CharField on Card, not its own model (unlike
    # Type/Set) — there's no natural tier ordering in the data (see the
    # actual distinct values), so this returns the distinct real values,
    # alphabetically, rather than a hand-maintained list that could drift
    # from what's actually in the database. `?set=<id>` narrows to rarities
    # actually present in that set — see docs/decisions.md #034.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = Card.objects.exclude(rarity="")
        set_id = request.query_params.get("set")
        if set_id:
            queryset = queryset.filter(set_id=set_id)
        rarities = queryset.order_by("rarity").values_list("rarity", flat=True).distinct()
        return Response(list(rarities))


CANONICAL_SUPERTYPES = ["Pokémon", "Trainer", "Energy"]


class SupertypeListView(APIView):
    # Same shape as RarityListView, for the same reason — `supertype` is a
    # plain CharField, and `?set=<id>` narrows to what's actually present
    # in that set (see docs/decisions.md #034). Unlike rarity, supertype
    # has a small, fixed, well-known set of values with a conventional
    # display order (Pokémon, Trainer, Energy) that alphabetical sorting
    # would not preserve, so present values are filtered from that
    # canonical order rather than sorted from the database.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = Card.objects.all()
        set_id = request.query_params.get("set")
        if set_id:
            queryset = queryset.filter(set_id=set_id)
        present = set(queryset.values_list("supertype", flat=True).distinct())
        return Response([s for s in CANONICAL_SUPERTYPES if s in present])
