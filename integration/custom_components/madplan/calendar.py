"""The meal plan as a calendar: one all-day event per planned dinner (days marked "ikke spist" are left out)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from .api import MadplanError
from .coordinator import MadplanConfigEntry, MadplanCoordinator
from .entity import MadplanEntity


async def async_setup_entry(hass: HomeAssistant, entry: MadplanConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([MadplanCalendar(entry.runtime_data)])


def to_event(day: dict[str, Any]) -> CalendarEvent | None:
    if day.get("skipped"):
        return None
    start = date.fromisoformat(day["date"])
    details = []
    if day.get("prep_minutes"):
        details.append(f"Tilberedning: {day['prep_minutes']} min.")
    if day.get("note"):
        details.append(str(day["note"]))
    return CalendarEvent(
        start=start,
        end=start + timedelta(days=1),
        summary=str(day.get("dish") or "Aftensmad"),
        description="\n".join(details) or None,
        uid=f"madplan-{day['date']}",
    )


def events_from(days: list[dict[str, Any]]) -> list[CalendarEvent]:
    return [event for event in (to_event(day) for day in days) if event is not None]


class MadplanCalendar(MadplanEntity, CalendarEntity):
    # "Madplan Aftensmad" (calendar.madplan_aftensmad): its own name, so it never clashes with a
    # calendar the family already calls "Madplan".
    _attr_translation_key = "dinner"

    def __init__(self, coordinator: MadplanCoordinator) -> None:
        super().__init__(coordinator, "calendar")

    @property
    def event(self) -> CalendarEvent | None:
        """Today's dinner, else the next planned one."""
        today = dt_util.now().date()
        upcoming = [event for event in events_from(self.coordinator.data.meals.get("days", [])) if event.end > today]
        return min(upcoming, key=lambda event: event.start, default=None)

    async def async_get_events(self, hass: HomeAssistant, start_date: datetime, end_date: datetime) -> list[CalendarEvent]:
        start = dt_util.as_local(start_date).date()
        end = dt_util.as_local(end_date).date()
        try:
            meals = await self.coordinator.client.meals(start, end)
        except MadplanError as err:
            raise HomeAssistantError(str(err)) from err
        return events_from(meals.get("days", []))
