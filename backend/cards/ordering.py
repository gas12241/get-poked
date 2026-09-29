from django.db.models import F, Func, IntegerField, Value
from django.db.models.functions import Cast, NullIf
from rest_framework.filters import OrderingFilter


class RegexpReplace(Func):
    function = "REGEXP_REPLACE"


class CardOrderingFilter(OrderingFilter):
    """Sorts `number` numerically rather than lexicographically, and gives
    `name`/`number` sorts a `release_date` tiebreak (and vice versa).

    `Card.number` is a CharField, not every printed number is purely numeric
    (e.g. "TG01", "SWSH001"), so a plain string sort puts "10" before "2".
    Non-numeric numbers (e.g. bare-letter puzzle cards) sort last regardless
    of direction, via the digits-only annotation coming back NULL. See
    docs/decisions.md #032.

    `release_date` (an annotated alias for `set__release_date`, see
    docs/decisions.md #037) needs the same numeric tiebreak: every card in
    the same set shares that set's release date, so without it they'd come
    back in arbitrary database order instead of the set's own checklist
    order.

    Sorting by `name` or `number` has the same gap in reverse: every card
    named "Abra", or every card printed as "#1" across different sets,
    would otherwise come back in arbitrary order too. Both tiebreak by
    `release_date` — oldest print first by default, independent of the
    primary sort's own direction (same as `release_date` sort's own
    tiebreak above always being ascending by number) — or newest print
    first if `?newest_first=true` is given. See docs/decisions.md #038.
    """

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset

        has_number = any(field.lstrip("-") == "number" for field in ordering)
        has_release_date = any(field.lstrip("-") == "release_date" for field in ordering)
        has_name = any(field.lstrip("-") == "name" for field in ordering)
        if not has_number and not has_release_date and not has_name:
            return queryset.order_by(*ordering)

        queryset = queryset.annotate(
            number_numeric=Cast(
                NullIf(
                    RegexpReplace(F("number"), Value(r"\D"), Value(""), Value("g")),
                    Value(""),
                ),
                output_field=IntegerField(),
            )
        )

        order_by = []
        for field in ordering:
            if field.lstrip("-") == "number":
                descending = field.startswith("-")
                order_by.append(
                    F("number_numeric").desc(nulls_last=True)
                    if descending
                    else F("number_numeric").asc(nulls_last=True)
                )
                order_by.append("-number" if descending else "number")
            else:
                order_by.append(field)

        if has_release_date and not has_number:
            order_by.append(F("number_numeric").asc(nulls_last=True))
            order_by.append("number")
        elif (has_name or has_number) and not has_release_date:
            newest_first = request.query_params.get("newest_first") in (
                "true",
                "1",
            )
            order_by.append("-release_date" if newest_first else "release_date")

        return queryset.order_by(*order_by)
