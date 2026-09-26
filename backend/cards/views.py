from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny
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
    queryset = Type.objects.order_by("name")
    serializer_class = TypeSerializer
    permission_classes = [AllowAny]
    pagination_class = None
