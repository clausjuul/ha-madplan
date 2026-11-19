"""Shared base: every Madplan entity belongs to one "Madplan" service device."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_SLUG, DOMAIN
from .coordinator import MadplanCoordinator


class MadplanEntity(CoordinatorEntity[MadplanCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coordinator: MadplanCoordinator, key: str) -> None:
        super().__init__(coordinator)
        entry = coordinator.config_entry
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        slug = entry.data.get(CONF_SLUG)
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Madplan",
            manufacturer="Madplan",
            entry_type=DeviceEntryType.SERVICE,
            sw_version=str(coordinator.data.info.get("version", "")) or None,
            # Opens the app's panel from the device page.
            configuration_url=f"homeassistant://hassio/ingress/{slug}" if slug else None,
        )
