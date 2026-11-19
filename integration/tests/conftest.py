"""Shared fixtures: a fake Madplan app behind aioclient_mock."""

from unittest.mock import patch

import pytest

from homeassistant.const import CONF_HOST, CONF_PORT

from custom_components.madplan.const import CONF_SLUG, CONF_TOKEN, DOMAIN
from pytest_homeassistant_custom_component.common import MockConfigEntry

BASE = "http://local-madplan:8100/internal/v1"

SHOPPING = {
    "from": "2026-11-09",
    "to": "2026-11-15",
    "items": [
        {"id": "hakket oksekød", "label": "hakket oksekød", "quantity": "500 g", "dishes": ["Lasagne"], "category": "kød", "extra": False, "checked": False},
        {"id": "extra:mælk", "label": "Mælk", "quantity": "", "dishes": [], "category": "andet", "extra": True, "checked": True},
    ],
}
MEALS = {
    "today": "2026-11-09",
    "from": "2026-11-02",
    "to": "2027-01-08",
    "days": [
        {"date": "2026-11-09", "dish_id": "lasagne", "dish": "Lasagne", "prep_minutes": 45, "note": "", "skipped": False},
        {"date": "2026-11-10", "dish_id": "tacos", "dish": "Tacos", "prep_minutes": 20, "note": "Fredagshygge", "skipped": False},
        {"date": "2026-11-11", "dish_id": "tacos", "dish": "Tacos", "prep_minutes": 20, "note": "", "skipped": True},
    ],
}
INFO = {"name": "Madplan", "version": "0.20.0", "api_version": 1}


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    yield


@pytest.fixture(autouse=True)
def no_event_stream():
    """The push stream is a long-running request; tests trigger refreshes themselves."""

    async def idle(self, on_change, on_connected=None):
        return None

    with patch("custom_components.madplan.api.MadplanClient.listen", idle):
        yield


@pytest.fixture
def fake_app(aioclient_mock):
    aioclient_mock.get(f"{BASE}/info", json=INFO)
    aioclient_mock.get(f"{BASE}/shopping", json=SHOPPING)
    aioclient_mock.get(f"{BASE}/meals", json=MEALS)
    return aioclient_mock


@pytest.fixture
def entry(hass):
    entry = MockConfigEntry(
        domain=DOMAIN,
        unique_id=DOMAIN,
        title="Madplan",
        data={CONF_HOST: "local-madplan", CONF_PORT: 8100, CONF_TOKEN: "t" * 64, CONF_SLUG: "local_madplan"},
    )
    entry.add_to_hass(hass)
    return entry
