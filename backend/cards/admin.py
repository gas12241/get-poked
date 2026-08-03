from django.contrib import admin

from .models import Attack, Card, Resistance, Set, Type, Weakness


class AttackInline(admin.TabularInline):
    model = Attack
    extra = 0


class WeaknessInline(admin.TabularInline):
    model = Weakness
    extra = 0


class ResistanceInline(admin.TabularInline):
    model = Resistance
    extra = 0


@admin.register(Set)
class SetAdmin(admin.ModelAdmin):
    list_display = ("name", "series", "release_date", "imported")
    list_filter = ("imported", "series")
    search_fields = ("name", "tcg_id")


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ("name", "set", "number", "supertype", "rarity")
    list_filter = ("supertype", "rarity", "set")
    search_fields = ("name", "tcg_id")
    inlines = [AttackInline, WeaknessInline, ResistanceInline]


@admin.register(Type)
class TypeAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)
