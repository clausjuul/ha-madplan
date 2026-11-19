"""Set-up through Supervisor discovery and by hand."""

from homeassistant.config_entries import SOURCE_HASSIO, SOURCE_USER
from homeassistant.const import CONF_HOST, CONF_PORT
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.helpers.service_info.hassio import HassioServiceInfo

from custom_components.madplan.const import CONF_TOKEN, DOMAIN

from .conftest import BASE

DISCOVERY = HassioServiceInfo(
    config={"host": "local-madplan", "port": 8100, "token": "t" * 64},
    name="Madplan",
    slug="local_madplan",
    uuid="1234",
)


async def test_discovery_asks_once_and_creates_the_entry(hass, fake_app):
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_HASSIO}, data=DISCOVERY)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "hassio_confirm"
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {CONF_HOST: "local-madplan", CONF_PORT: 8100, CONF_TOKEN: "t" * 64, "slug": "local_madplan"}


async def test_new_discovery_updates_the_existing_entry(hass, fake_app, entry):
    changed = HassioServiceInfo(config={"host": "other-madplan", "port": 8100, "token": "n" * 64}, name="Madplan", slug="local_madplan", uuid="1234")
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_HASSIO}, data=changed)
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "already_configured"
    assert entry.data[CONF_HOST] == "other-madplan"
    assert entry.data[CONF_TOKEN] == "n" * 64


async def test_manual_setup_reports_a_wrong_token(hass, aioclient_mock):
    aioclient_mock.get(f"{BASE}/info", status=401, json={"error": "unauthorized"})
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_HOST: "local-madplan", CONF_PORT: 8100, CONF_TOKEN: "forkert"}
    )
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}
