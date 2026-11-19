"""Small client for the Madplan app's internal API (/internal/v1)."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import date
import logging
from typing import Any
from urllib.parse import quote

import aiohttp

_LOGGER = logging.getLogger(__name__)

REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=15)


class MadplanError(Exception):
    """The app could not be reached or answered with an error."""


class MadplanAuthError(MadplanError):
    """The app refused the token."""


class MadplanApiError(MadplanError):
    """The app refused the request; the message is Danish and meant for the user."""


class MadplanClient:
    """Talks to the app on the Supervisor network."""

    def __init__(self, session: aiohttp.ClientSession, host: str, port: int, token: str) -> None:
        self._session = session
        self._base = f"http://{host}:{port}/internal/v1"
        self._headers = {"Authorization": f"Bearer {token}"}

    async def _request(self, method: str, path: str, json: Any | None = None, params: dict[str, str] | None = None) -> Any:
        try:
            async with self._session.request(
                method,
                f"{self._base}{path}",
                json=json,
                params=params,
                headers=self._headers,
                timeout=REQUEST_TIMEOUT,
            ) as response:
                body: Any = await response.json(content_type=None)
                if response.status == 401:
                    raise MadplanAuthError("Madplan afviste nøglen")
                if response.status >= 400:
                    message = body.get("message") if isinstance(body, dict) else None
                    raise MadplanApiError(message or f"Madplan svarede HTTP {response.status}")
                return body
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as err:
            raise MadplanError(f"Kunne ikke kontakte Madplan: {err}") from err

    async def info(self) -> dict[str, Any]:
        return await self._request("GET", "/info")

    async def shopping(self) -> dict[str, Any]:
        return await self._request("GET", "/shopping")

    async def meals(self, start: date | None = None, end: date | None = None) -> dict[str, Any]:
        params: dict[str, str] = {}
        if start is not None:
            params["from"] = start.isoformat()
        if end is not None:
            params["to"] = end.isoformat()
        return await self._request("GET", "/meals", params=params or None)

    async def add_item(self, label: str) -> dict[str, Any]:
        return await self._request("POST", "/shopping/items", json={"label": label})

    async def update_item(self, item_id: str, *, label: str | None = None, checked: bool | None = None) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if label is not None:
            body["label"] = label
        if checked is not None:
            body["checked"] = checked
        return await self._request("PATCH", f"/shopping/items/{quote(item_id, safe='')}", json=body)

    async def delete_item(self, item_id: str) -> dict[str, Any]:
        return await self._request("DELETE", f"/shopping/items/{quote(item_id, safe='')}")

    async def listen(self, on_change: Callable[[], Awaitable[None]], on_connected: Callable[[], Awaitable[None]] | None = None) -> None:
        """Follows /events until cancelled, reconnecting with back-off; calls on_change for every change."""
        delay = 5
        while True:
            try:
                async with self._session.get(
                    f"{self._base}/events",
                    headers=self._headers,
                    timeout=aiohttp.ClientTimeout(total=None, sock_read=90),
                ) as response:
                    if response.status != 200:
                        raise MadplanError(f"HTTP {response.status}")
                    delay = 5
                    if on_connected is not None:
                        await on_connected()
                    async for raw in response.content:
                        if raw.decode("utf-8", "replace").strip() == "event: change":
                            await on_change()
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001 - keep listening whatever went wrong
                _LOGGER.debug("Madplan-forbindelsen blev afbrudt (%s); prøver igen om %s s", err, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 300)
