from django.contrib import admin

from .models import HoroscopeCard, HoroscopePull


class HoroscopeCardInline(admin.TabularInline):
    model = HoroscopeCard
    extra = 0


@admin.register(HoroscopePull)
class HoroscopePullAdmin(admin.ModelAdmin):
    list_display = ("user", "pull_date", "pulled_at")
    search_fields = ("user__username",)
    inlines = [HoroscopeCardInline]
