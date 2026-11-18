from django.urls import path

from .views import (
    CollectionEntryDetailView,
    CollectionEntryListCreateView,
    CollectionQuantitiesView,
    FavoriteCardIdsView,
    FavoriteDestroyView,
    FavoriteListCreateView,
)

urlpatterns = [
    path("favorites/", FavoriteListCreateView.as_view(), name="favorite-list"),
    path("favorites/card-ids/", FavoriteCardIdsView.as_view(), name="favorite-card-ids"),
    path("favorites/<int:pk>/", FavoriteDestroyView.as_view(), name="favorite-detail"),
    path("collections/", CollectionEntryListCreateView.as_view(), name="collection-list"),
    path(
        "collections/quantities/",
        CollectionQuantitiesView.as_view(),
        name="collection-quantities",
    ),
    path(
        "collections/<int:pk>/",
        CollectionEntryDetailView.as_view(),
        name="collection-detail",
    ),
]
