from django.db.models import F, Func, IntegerField, Value
from django.db.models.functions import Cast, NullIf
from rest_framework.filters import OrderingFilter


class RegexpReplace(Func):
    function = "REGEXP_REPLACE"


class CardOrderingFilter(OrderingFilter):
    """Sorts `number` numerically rather than lexicographically.

    `Card.number` is a CharField, not every printed number is purely numeric
    (e.g. "TG01", "SWSH001"), so a plain string sort puts "10" before "2".
    Non-numeric numbers (e.g. bare-letter puzzle cards) sort last regardless
    of direction, via the digits-only annotation coming back NULL. See
    docs/decisions.md #032.
    """

    def filter_queryset(self, request, queryset, view):
        ordering = self.get_ordering(request, queryset, view)
        if not ordering:
            return queryset

        if not any(field.lstrip("-") == "number" for field in ordering):
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
        return queryset.order_by(*order_by)
