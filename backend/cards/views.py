from django.db.models import F
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet
from unidecode import unidecode

from .filters import CardFilter
from .models import Card, Set, Type
from .ordering import CardOrderingFilter
from .serializers import CardDetailSerializer, CardListSerializer, SetSerializer, TypeSerializer


def scope_cards_by_set_or_series(queryset, request):
    """Narrows a Card queryset to `?set=<id>` or `?series=<name>` (an entire
    series, e.g. every Mega Evolution set — see docs/decisions.md #035),
    whichever the request provides. Neither present: the queryset passes
    through unscoped. Shared by the Rarity/Type/Supertype filter-option
    endpoints, which all narrow their choices the same way.
    """
    set_id = request.query_params.get("set")
    if set_id:
        return queryset.filter(set_id=set_id)
    series = request.query_params.get("series")
    if series:
        return queryset.filter(set__series__iexact=series)
    return queryset


class CardViewSet(ReadOnlyModelViewSet):
    queryset = (
        Card.objects.select_related("set")
        .prefetch_related("types", "attacks", "weaknesses__type", "resistances__type")
        # Alias for `set__release_date`, so `?ordering=release_date` can be
        # a plain ordering field rather than needing a `set__`-prefixed
        # query param — see docs/decisions.md #037.
        .annotate(release_date=F("set__release_date"))
        .order_by("name", "number")
    )
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, CardOrderingFilter]
    filterset_class = CardFilter
    # name_ascii alongside name (OR'd together by SearchFilter) so a search
    # typed without accents (e.g. "Poke") still matches a name that has them
    # ("Poké Vital A") — name_ascii has no accents to begin with, so the
    # typed term matches it directly with no extra normalization needed on
    # the query side. See docs/decisions.md #060.
    search_fields = ["name", "name_ascii"]
    ordering_fields = ["name", "number", "rarity", "release_date"]

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
    # `?set=<id>` or `?series=<name>` narrows to types actually used by at
    # least one matching card, so the frontend's Type filter only offers
    # choices that could possibly match something (see docs/decisions.md
    # #034, #035). Neither present: returns every type, unscoped.
    serializer_class = TypeSerializer
    permission_classes = [AllowAny]
    pagination_class = None

    def get_queryset(self):
        queryset = Type.objects.order_by("name")
        set_id = self.request.query_params.get("set")
        series = self.request.query_params.get("series")
        if set_id:
            queryset = queryset.filter(cards__set_id=set_id)
        elif series:
            queryset = queryset.filter(cards__set__series__iexact=series)
        return queryset.distinct()


class RarityListView(APIView):
    # `rarity` is a plain CharField on Card, not its own model (unlike
    # Type/Set) — there's no natural tier ordering in the data (see the
    # actual distinct values), so this returns the distinct real values,
    # alphabetically, rather than a hand-maintained list that could drift
    # from what's actually in the database. `?set=<id>`/`?series=<name>`
    # narrow to rarities actually present there — see docs/decisions.md
    # #034, #035.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = scope_cards_by_set_or_series(Card.objects.exclude(rarity=""), request)
        rarities = queryset.order_by("rarity").values_list("rarity", flat=True).distinct()
        return Response(list(rarities))


CANONICAL_SUPERTYPES = ["Pokémon", "Trainer", "Energy"]


class SupertypeListView(APIView):
    # Same shape as RarityListView, for the same reason — `supertype` is a
    # plain CharField, and `?set=<id>`/`?series=<name>` narrow to what's
    # actually present there (see docs/decisions.md #034, #035). Unlike
    # rarity, supertype has a small, fixed, well-known set of values with a
    # conventional display order (Pokémon, Trainer, Energy) that
    # alphabetical sorting would not preserve, so present values are
    # filtered from that canonical order rather than sorted from the
    # database.
    permission_classes = [AllowAny]

    def get(self, request):
        queryset = scope_cards_by_set_or_series(Card.objects.all(), request)
        present = set(queryset.values_list("supertype", flat=True).distinct())
        return Response([s for s in CANONICAL_SUPERTYPES if s in present])


class CardNameListView(APIView):
    # Powers the search box's typeahead suggestions — distinct card names
    # containing `?search=` anywhere, not just as a prefix (see
    # docs/decisions.md #046 — e.g. searching "Jigglypuff" now finds "Mega
    # Lopunny & Jigglypuff GX", not just a card named exactly "Jigglypuff"),
    # capped and unpaginated (a suggestion list needs to be short, not
    # paginated). `?set=`/`?series=` scope it the same way as
    # Rarities/Types/Supertypes; the Cards page uses that scoping, but the
    # Quiz page's guess-the-card input deliberately never sends either — a
    # global, answer-independent suggestion list can't leak which card a
    # given question is about, whereas one scoped to a question's small
    # eligible pool sometimes could. See docs/decisions.md #036.
    permission_classes = [AllowAny]
    MAX_RESULTS = 8
    # A search shorter than this is rejected outright, not just left to the
    # frontend's own minimum (NameAutocomplete's MIN_CHARS) — a substring
    # match on a single character is genuinely pathological against real
    # data (confirmed: "a" alone matches ~70% of all distinct card names),
    # unlike a prefix match of the same length. Matches the frontend's
    # MIN_CHARS so a directly-called API request behaves the same either
    # way.
    MIN_SEARCH_LENGTH = 2
    # Cap on the raw distinct-name fetch, before ranking — bounds cost for
    # a pathologically broad search. Sized well above the worst realistic
    # 2-character substring measured against real data (~760 distinct names
    # for "ar"), now that matching is substring-based rather than
    # prefix-based (a real prefix of the same length matches far fewer).
    MAX_CANDIDATES = 2000

    def get(self, request):
        search = request.query_params.get("search", "")
        if len(search) < self.MIN_SEARCH_LENGTH:
            return Response([])
        queryset = scope_cards_by_set_or_series(Card.objects.all(), request)
        # Matches against name_ascii (diacritic-stripped, kept in sync by
        # Card.save()), not name — so a search typed without accents (e.g.
        # "Poke") finds a card whose real name has them ("Poké Vital A").
        # The search term itself is unidecoded too, so the reverse (a user
        # who does type an accent) still matches consistently either way.
        # Returns the real, accented `name` regardless. See docs/decisions.md
        # #060.
        candidates = (
            queryset.filter(name_ascii__icontains=unidecode(search))
            .values_list("name", flat=True)
            .distinct()[: self.MAX_CANDIDATES]
        )
        # Shortest match first, alphabetical as a tiebreak — not purely
        # alphabetical. Real names cluster heavily around variant-suffixed
        # reprints of the same species (Pikachu, Pikachu ex, Pikachu V,
        # Pikachu VMAX, ...), so an alphabetical cap gets dominated by one
        # popular species' variants before ever reaching a different
        # species' plain name (confirmed against real data: alphabetical
        # capped at 8 for "pi" never reached "Pikachu" or "Piplup" at all).
        # The shortest match for a given prefix is usually the unadorned
        # species name, with no suffix-parsing required.
        names = sorted(set(candidates), key=lambda name: (len(name), name.lower()))
        return Response(names[: self.MAX_RESULTS])
