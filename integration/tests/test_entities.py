"""The shopping list as a to-do list and the meal plan as a calendar."""

from datetime import date
from unittest.mock import patch

import pytest

from homeassistant.components.todo import DOMAIN as TODO_DOMAIN
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from custom_components.madplan.calendar import events_from

from .conftest import BASE, MEALS, SHOPPING

TODO = "todo.madplan_shopping_list"
CALENDAR = "calendar.madplan_dinner"


async def _setup(hass: HomeAssistant, entry) -> None:
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


async def test_items_and_states(hass, fake_app, entry):
    await _setup(hass, entry)
    # One open item: the ticked Mælk is completed.
    assert hass.states.get(TODO).state == "1"
    result = await hass.services.async_call(TODO_DOMAIN, "get_items", {}, target={"entity_id": TODO}, blocking=True, return_response=True)
    items = result[TODO]["items"]
    assert items[0] == {"uid": "hakket oksekød", "summary": "hakket oksekød", "status": "needs_action", "description": "500 g · Lasagne"}
    assert items[1]["status"] == "completed"
    assert hass.states.get(CALENDAR) is not None


async def test_add_tick_and_remove_go_to_the_app(hass, fake_app, entry):
    await _setup(hass, entry)
    fake_app.post(f"{BASE}/shopping/items", json={"outcome": "added", **SHOPPING})
    fake_app.patch(f"{BASE}/shopping/items/hakket%20oksek%C3%B8d", json=SHOPPING)
    fake_app.delete(f"{BASE}/shopping/items/extra%3Am%C3%A6lk", json={"outcome": "removed", **SHOPPING})

    await hass.services.async_call(TODO_DOMAIN, "add_item", {"item": "Kaffe"}, target={"entity_id": TODO}, blocking=True)
    await hass.services.async_call(TODO_DOMAIN, "update_item", {"item": "hakket oksekød", "status": "completed"}, target={"entity_id": TODO}, blocking=True)
    await hass.services.async_call(TODO_DOMAIN, "remove_item", {"item": "Mælk"}, target={"entity_id": TODO}, blocking=True)

    sent = [(method, str(url), body) for method, url, body, _ in fake_app.mock_calls if method != "GET"]
    assert sent[0] == ("POST", f"{BASE}/shopping/items", {"label": "Kaffe"})
    assert sent[1] == ("PATCH", f"{BASE}/shopping/items/hakket%20oksek%C3%B8d", {"checked": True})
    assert sent[2][0] == "DELETE"


async def test_the_apps_message_reaches_the_user(hass, fake_app, entry):
    await _setup(hass, entry)
    fake_app.patch(
        f"{BASE}/shopping/items/hakket%20oksek%C3%B8d",
        status=422,
        json={"error": "unprocessable", "message": "Varer fra madplanen kan ikke omdøbes. Ret opskriften i Madplan."},
    )
    with pytest.raises(HomeAssistantError, match="kan ikke omdøbes"):
        await hass.services.async_call(
            TODO_DOMAIN, "update_item", {"item": "hakket oksekød", "rename": "Oksekød"}, target={"entity_id": TODO}, blocking=True
        )


async def test_calendar_shows_dinners_but_not_skipped_days(hass, fake_app, entry):
    events = events_from(MEALS["days"])
    assert [event.summary for event in events] == ["Lasagne", "Tacos"]
    assert events[0].start == date(2026, 11, 9) and events[0].end == date(2026, 11, 10)
    assert events[1].description == "Tilberedning: 20 min.\nFredagshygge"

    await _setup(hass, entry)
    result = await hass.services.async_call(
        "calendar",
        "get_events",
        {"start_date_time": "2026-11-09T00:00:00", "end_date_time": "2026-11-12T00:00:00"},
        target={"entity_id": CALENDAR},
        blocking=True,
        return_response=True,
    )
    assert [event["summary"] for event in result[CALENDAR]["events"]] == ["Lasagne", "Tacos"]


async def test_unreachable_app_retries_setup(hass, aioclient_mock, entry):
    aioclient_mock.get(f"{BASE}/info", exc=TimeoutError())
    assert not await hass.config_entries.async_setup(entry.entry_id)
    assert entry.state.name == "SETUP_RETRY"
