"""Madplan: the family meal planner's shopping list as a to-do list and the meal plan as a calendar.

The data lives in the Madplan app; this integration only talks to the app's internal API
(set up through Supervisor discovery). It is installed and updated by the app itself.
"""

from __future__ import annotations

from homeassistant.const import CONF_HOST, CONF_PORT, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import MadplanClient
from .const import CONF_TOKEN
from .coordinator import MadplanConfigEntry, MadplanCoordinator

PLATFORMS: list[Platform] = [Platform.CALENDAR, Platform.TODO]


async def async_setup_entry(hass: HomeAssistant, entry: MadplanConfigEntry) -> bool:
    client = MadplanClient(
        async_get_clientsession(hass),
        entry.data[CONF_HOST],
        entry.data[CONF_PORT],
        entry.data[CONF_TOKEN],
    )
    coordinator = MadplanCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    async def changed() -> None:
        await coordinator.async_request_refresh()

    # Push updates: the app sends a change event whenever anything is saved (web, voice or here).
    entry.async_create_background_task(hass, client.listen(changed, changed), "madplan_events")
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: MadplanConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
