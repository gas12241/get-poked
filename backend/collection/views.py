from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CollectionEntry, Favorite
from .serializers import CollectionEntrySerializer, FavoriteSerializer


class FavoriteListCreateView(generics.ListCreateAPIView):
    serializer_class = FavoriteSerializer

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user).select_related("card__set")


class FavoriteDestroyView(generics.DestroyAPIView):
    serializer_class = FavoriteSerializer

    def get_queryset(self):
        return Favorite.objects.filter(user=self.request.user)


class FavoriteCardIdsView(APIView):
    """Every favorited card id for the requesting user, unpaginated — lets
    card-browsing pages render per-tile state without paging through the
    main (paginated) list endpoint above. See docs/decisions.md #077."""

    def get(self, request):
        ids = Favorite.objects.filter(user=request.user).values_list("card_id", flat=True)
        return Response(list(ids))


class CollectionEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = CollectionEntrySerializer

    def get_queryset(self):
        return CollectionEntry.objects.filter(user=self.request.user).select_related("card__set")


class CollectionEntryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CollectionEntrySerializer

    def get_queryset(self):
        return CollectionEntry.objects.filter(user=self.request.user)


class CollectionQuantitiesView(APIView):
    """{card_id: quantity} for every card the requesting user owns,
    unpaginated — same reasoning as FavoriteCardIdsView above."""

    def get(self, request):
        entries = CollectionEntry.objects.filter(user=request.user).values("card_id", "quantity")
        return Response({entry["card_id"]: entry["quantity"] for entry in entries})
