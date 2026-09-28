"""Detects cards whose synced image URLs 404 on the upstream image host.

`image_small`/`image_large` are copied verbatim from the Pokémon TCG API
at sync time; that API doesn't guarantee every URL it hands out is still
reachable, and a small number genuinely aren't (confirmed via a real HTTP
HEAD request against images.pokemontcg.io, not assumed — see
docs/decisions.md #039). A broken `image_small` can't be detected from the
browser: the CDN returns a real, decodable placeholder image on a 404
status, so the `<img>` element's `error` event never fires. Checking here,
server-side, with a client that actually looks at the status code, is the
only way to find these.
"""

from concurrent.futures import ThreadPoolExecutor

import requests

DEFAULT_WORKERS = 40
REQUEST_TIMEOUT_SECONDS = 10


def _url_is_reachable(session, url):
    if not url:
        return False
    try:
        response = session.head(url, timeout=REQUEST_TIMEOUT_SECONDS, allow_redirects=True)
        return response.status_code == 200
    except requests.RequestException:
        return False


def check_and_fix_card_images(queryset, workers=DEFAULT_WORKERS):
    """For every card in `queryset`: leaves it alone if `image_small` is
    reachable; sets `image_small` to `image_large`'s URL if only the large
    one is reachable; blanks both (there's nothing to show) if neither is.

    Returns {"ok": int, "fallback": [Card], "unavailable": [Card]} — the
    two lists are the cards actually changed (unsaved copies with the new
    field values), for the caller to report on.
    """
    session = requests.Session()
    cards = list(queryset)

    def classify(card):
        if _url_is_reachable(session, card.image_small):
            return (card, "ok")
        if _url_is_reachable(session, card.image_large):
            return (card, "fallback")
        return (card, "unavailable")

    results = {"ok": 0, "fallback": [], "unavailable": []}
    to_update = []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        for card, status in executor.map(classify, cards):
            if status == "ok":
                results["ok"] += 1
            elif status == "fallback":
                card.image_small = card.image_large
                to_update.append(card)
                results["fallback"].append(card)
            else:
                card.image_small = ""
                card.image_large = ""
                to_update.append(card)
                results["unavailable"].append(card)

    if to_update:
        queryset.model.objects.bulk_update(to_update, ["image_small", "image_large"])

    return results
