from datetime import datetime

from .api_client import iter_all
from .models import Attack, Card, Resistance, Set, Type, Weakness

SET_DETAIL_KEYS = ("ptcgoCode", "legalities", "printedTotal", "total", "updatedAt")

CARD_DETAIL_KEYS = (
    "retreatCost",
    "convertedRetreatCost",
    "legalities",
    "rules",
)


def _parse_date(value):
    if not value:
        return None
    return datetime.strptime(value, "%Y/%m/%d").date()


def sync_sets(session):
    for set_data in iter_all(session, "/sets"):
        images = set_data.get("images", {})
        Set.objects.update_or_create(
            tcg_id=set_data["id"],
            defaults={
                "name": set_data["name"],
                "series": set_data["series"],
                "release_date": _parse_date(set_data.get("releaseDate")),
                "image_symbol": images.get("symbol", ""),
                "image_logo": images.get("logo", ""),
                "details": {k: set_data[k] for k in SET_DETAIL_KEYS if k in set_data},
            },
        )


def sets_to_sync(target_tcg_id=None, force=False):
    if target_tcg_id:
        return Set.objects.filter(tcg_id=target_tcg_id).order_by("tcg_id")
    if force:
        return Set.objects.all().order_by("tcg_id")
    return Set.objects.filter(imported=False).order_by("tcg_id")


def get_type_cache():
    return {t.name: t for t in Type.objects.all()}


def resolve_types(names, type_cache):
    result = []
    for name in names:
        if name not in type_cache:
            type_cache[name] = Type.objects.create(name=name)
        result.append(type_cache[name])
    return result


def sync_cards_for_set(session, set_obj, type_cache):
    for card_data in iter_all(session, "/cards", query=f"set.id:{set_obj.tcg_id}"):
        images = card_data.get("images", {})
        tcgplayer_url = card_data.get("tcgplayer", {}).get("url", "")
        cardmarket_url = card_data.get("cardmarket", {}).get("url", "")

        card, _ = Card.objects.update_or_create(
            tcg_id=card_data["id"],
            defaults={
                "set": set_obj,
                "name": card_data["name"],
                "number": card_data["number"],
                "rarity": card_data.get("rarity", ""),
                "hp": card_data.get("hp", ""),
                "supertype": card_data["supertype"],
                "image_small": images.get("small", ""),
                "image_large": images.get("large", ""),
                "artist": card_data.get("artist", ""),
                "national_pokedex_numbers": card_data.get("nationalPokedexNumbers", []),
                "subtypes": card_data.get("subtypes", []),
                "evolves_from": card_data.get("evolvesFrom") or "",
                "evolves_to": card_data.get("evolvesTo", []),
                "tcgplayer_url": tcgplayer_url,
                "cardmarket_url": cardmarket_url,
                "details": {k: card_data[k] for k in CARD_DETAIL_KEYS if k in card_data},
            },
        )

        card.types.set(resolve_types(card_data.get("types", []), type_cache))

        card.attacks.all().delete()
        Attack.objects.bulk_create(
            [
                Attack(
                    card=card,
                    name=attack["name"],
                    cost=attack.get("cost", []),
                    converted_energy_cost=attack.get("convertedEnergyCost"),
                    damage=attack.get("damage", ""),
                    text=attack.get("text", ""),
                    order=order,
                )
                for order, attack in enumerate(card_data.get("attacks", []))
            ]
        )

        card.weaknesses.all().delete()
        Weakness.objects.bulk_create(
            [
                Weakness(
                    card=card,
                    type=resolve_types([weakness["type"]], type_cache)[0],
                    value=weakness["value"],
                )
                for weakness in card_data.get("weaknesses", [])
            ]
        )

        card.resistances.all().delete()
        Resistance.objects.bulk_create(
            [
                Resistance(
                    card=card,
                    type=resolve_types([resistance["type"]], type_cache)[0],
                    value=resistance["value"],
                )
                for resistance in card_data.get("resistances", [])
            ]
        )

    set_obj.imported = True
    set_obj.save(update_fields=["imported"])
