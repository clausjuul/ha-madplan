"""Diagnostics: connection and app version, never the token."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from .const import CONF_TOKEN
from .coordinator import MadplanConfigEntry


async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: MadplanConfigEntry) -> dict[str, Any]:
    coordinator = entry.runtime_data
    data = coordinator.data
    return {
        "entry": async_redact_data(dict(entry.data), {CONF_TOKEN}),
        "info": data.info,
        "shopping_items": len(data.shopping.get("items", [])),
        "planned_days": len(data.meals.get("days", [])),
        "last_update_success": coordinator.last_update_success,
    }
