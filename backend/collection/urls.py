from django.urls import path

from .views import (
    CollectionEntriesByCardView,
    CollectionEntryDetailView,
    CollectionEntryListCreateView,
    CollectionStatsView,
    FavoriteDestroyView,
    FavoriteIdsByCardView,
    FavoriteListCreateView,
)

urlpatterns = [
    path("favorites/", FavoriteListCreateView.as_view(), name="favorite-list"),
    path("favorites/by-card/", FavoriteIdsByCardView.as_view(), name="favorite-ids-by-card"),
    path("favorites/<int:pk>/", FavoriteDestroyView.as_view(), name="favorite-detail"),
    path("collections/", CollectionEntryListCreateView.as_view(), name="collection-list"),
    path(
        "collections/by-card/",
        CollectionEntriesByCardView.as_view(),
        name="collection-entries-by-card",
    ),
    path("collections/stats/", CollectionStatsView.as_view(), name="collection-stats"),
    path(
        "collections/<int:pk>/",
        CollectionEntryDetailView.as_view(),
        name="collection-detail",
    ),
]
