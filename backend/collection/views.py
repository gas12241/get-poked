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


class FavoriteIdsByCardView(APIView):
    """{card_id: favorite_id} for the requesting user, unpaginated — lets
    card-browsing pages render per-tile favorited state (and know which
    Favorite row to DELETE to unfavorite) without paging through the main
    (paginated) list endpoint above. See docs/decisions.md #077."""

    def get(self, request):
        entries = Favorite.objects.filter(user=request.user).values("card_id", "id")
        return Response({entry["card_id"]: entry["id"] for entry in entries})


class CollectionEntryListCreateView(generics.ListCreateAPIView):
    serializer_class = CollectionEntrySerializer

    def get_queryset(self):
        return CollectionEntry.objects.filter(user=self.request.user).select_related("card__set")


class CollectionEntryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CollectionEntrySerializer

    def get_queryset(self):
        return CollectionEntry.objects.filter(user=self.request.user)


class CollectionEntriesByCardView(APIView):
    """{card_id: {id, quantity}} for every card the requesting user owns,
    unpaginated — same reasoning as FavoriteIdsByCardView above. The row id
    is what a quantity update/removal PATCHes or DELETEs, not the card id."""

    def get(self, request):
        entries = CollectionEntry.objects.filter(user=request.user).values(
            "card_id", "id", "quantity"
        )
        return Response(
            {
                entry["card_id"]: {"id": entry["id"], "quantity": entry["quantity"]}
                for entry in entries
            }
        )
