from django.db.models import Count, Sum
from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from cards.models import Set

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


class CollectionStatsView(APIView):
    """Summary numbers plus a per-set completion and per-rarity breakdown
    for the requesting user's own collection. The codebase's first
    Count/annotate-based endpoint — see docs/decisions.md #078."""

    def get(self, request):
        entries = CollectionEntry.objects.filter(user=request.user)

        owned_by_set = entries.values("card__set").annotate(owned=Count("card", distinct=True))
        set_totals = {
            row["id"]: row
            for row in Set.objects.filter(id__in=[r["card__set"] for r in owned_by_set])
            .annotate(total=Count("cards"))
            .values("id", "name", "total")
        }
        by_set = sorted(
            (
                {
                    "set_id": row["card__set"],
                    "set_name": set_totals[row["card__set"]]["name"],
                    "owned": row["owned"],
                    "total": set_totals[row["card__set"]]["total"],
                }
                for row in owned_by_set
            ),
            key=lambda s: (-(s["owned"] / s["total"]), s["set_name"]),
        )

        by_rarity = [
            {"rarity": row["card__rarity"], "count": row["count"]}
            for row in entries.values("card__rarity")
            .annotate(count=Count("card", distinct=True))
            .order_by("-count")
        ]

        return Response(
            {
                "total_unique_cards": entries.count(),
                "total_quantity": entries.aggregate(total=Sum("quantity"))["total"] or 0,
                "total_favorites": Favorite.objects.filter(user=request.user).count(),
                "by_set": by_set,
                "by_rarity": by_rarity,
            }
        )
