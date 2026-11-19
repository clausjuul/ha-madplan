"""Set-up: one click after Supervisor discovery, or host, port and token by hand."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from .api import MadplanAuthError, MadplanClient, MadplanError
from .const import CONF_SLUG, CONF_TOKEN, DEFAULT_PORT, DOMAIN


class MadplanConfigFlow(ConfigFlow, domain=DOMAIN):
    """There is one Madplan app per Home Assistant, so one entry."""

    VERSION = 1

    def __init__(self) -> None:
        self._discovered: dict[str, Any] = {}

    async def _validate(self, data: dict[str, Any]) -> str | None:
        client = MadplanClient(async_get_clientsession(self.hass), data[CONF_HOST], data[CONF_PORT], data[CONF_TOKEN])
        try:
            await client.info()
        except MadplanAuthError:
            return "invalid_auth"
        except MadplanError:
            return "cannot_connect"
        return None

    async def async_step_hassio(self, discovery_info: HassioServiceInfo) -> ConfigFlowResult:
        config = discovery_info.config
        self._discovered = {
            CONF_HOST: config["host"],
            CONF_PORT: int(config.get("port", DEFAULT_PORT)),
            CONF_TOKEN: config["token"],
            CONF_SLUG: discovery_info.slug,
        }
        await self.async_set_unique_id(DOMAIN)
        # A new token or hostname (reinstalled app) updates the existing entry and reloads it.
        self._abort_if_unique_id_configured(updates=self._discovered)
        return await self.async_step_hassio_confirm()

    async def async_step_hassio_confirm(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            error = await self._validate(self._discovered)
            if error is None:
                return self.async_create_entry(title="Madplan", data=self._discovered)
            errors["base"] = error
        self._set_confirm_only()
        return self.async_show_form(step_id="hassio_confirm", errors=errors)

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            data = {
                CONF_HOST: user_input[CONF_HOST].strip(),
                CONF_PORT: int(user_input[CONF_PORT]),
                CONF_TOKEN: user_input[CONF_TOKEN].strip(),
            }
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            error = await self._validate(data)
            if error is None:
                return self.async_create_entry(title="Madplan", data=data)
            errors["base"] = error
        schema = vol.Schema(
            {
                vol.Required(CONF_HOST): str,
                vol.Required(CONF_PORT, default=DEFAULT_PORT): int,
                vol.Required(CONF_TOKEN): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
