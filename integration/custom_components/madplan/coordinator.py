"""Keeps the shopping list and the meal plan from the Madplan app up to date."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import MadplanAuthError, MadplanClient, MadplanError
from .const import DOMAIN, SUPPORTED_API_VERSION, UPDATE_INTERVAL

_LOGGER = logging.getLogger(__name__)


@dataclass
class MadplanData:
    info: dict[str, Any]
    shopping: dict[str, Any]
    meals: dict[str, Any]


type MadplanConfigEntry = ConfigEntry[MadplanCoordinator]


class MadplanCoordinator(DataUpdateCoordinator[MadplanData]):
    """Fetches everything in one go; pushed changes from the app trigger a refresh."""

    config_entry: MadplanConfigEntry

    def __init__(self, hass: HomeAssistant, entry: MadplanConfigEntry, client: MadplanClient) -> None:
        super().__init__(
            hass,
            _LOGGER,
            config_entry=entry,
            name=DOMAIN,
            update_interval=UPDATE_INTERVAL,
            # Several changes in a row (a whole plan saved) become one refresh.
            request_refresh_debouncer=Debouncer(hass, _LOGGER, cooldown=1.0, immediate=True),
        )
        self.client = client

    async def _async_update_data(self) -> MadplanData:
        try:
            info = await self.client.info()
            shopping = await self.client.shopping()
            meals = await self.client.meals()
        except MadplanAuthError as err:
            raise UpdateFailed("Madplan afviste nøglen. Genstart Madplan-appen, så den melder sig igen.") from err
        except MadplanError as err:
            raise UpdateFailed(str(err)) from err
        self._check_api_version(info)
        return MadplanData(info=info, shopping=shopping, meals=meals)

    def _check_api_version(self, info: dict[str, Any]) -> None:
        """A newer app than this integration usually means Home Assistant has not been restarted yet."""
        api_version = info.get("api_version")
        if isinstance(api_version, int) and api_version > SUPPORTED_API_VERSION:
            ir.async_create_issue(
                self.hass,
                DOMAIN,
                "restart_required",
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="restart_required",
                translation_placeholders={"version": str(info.get("version", "?"))},
            )
        else:
            ir.async_delete_issue(self.hass, DOMAIN, "restart_required")
