import time

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

BASE_URL = "https://api.pokemontcg.io/v2"
PAGE_SIZE = 250


def build_session():
    session = requests.Session()
    if settings.POKEMON_TCG_API_KEY:
        session.headers["X-Api-Key"] = settings.POKEMON_TCG_API_KEY
    retry = Retry(
        total=5,
        backoff_factor=settings.SYNC_RETRY_BACKOFF_FACTOR,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET"]),
        respect_retry_after_header=True,
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def fetch_page(session, path, params):
    time.sleep(settings.SYNC_REQUEST_DELAY_SECONDS)
    response = session.get(f"{BASE_URL}{path}", params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def iter_all(session, path, query=None):
    page = 1
    while True:
        params = {"page": page, "pageSize": PAGE_SIZE}
        if query:
            params["q"] = query
        payload = fetch_page(session, path, params)
        yield from payload["data"]
        if page * PAGE_SIZE >= payload["totalCount"]:
            return
        page += 1
