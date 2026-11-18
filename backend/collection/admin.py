from django.contrib import admin

from .models import CollectionEntry, Favorite


@admin.register(CollectionEntry)
class CollectionEntryAdmin(admin.ModelAdmin):
    list_display = ("user", "card", "quantity", "date_added")
    search_fields = ("user__email", "card__name")


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ("user", "card", "date_added")
    search_fields = ("user__email", "card__name")
