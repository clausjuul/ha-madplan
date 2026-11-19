"""The shopping list as a to-do list.

Items from the meal plan come from recipes: they can be ticked off, while renaming one is refused
and deleting one ticks it off instead. Own extras behave like any to-do item.
"""

from __future__ import annotations

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import MadplanError
from .coordinator import MadplanConfigEntry, MadplanCoordinator
from .entity import MadplanEntity


async def async_setup_entry(hass: HomeAssistant, entry: MadplanConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([MadplanShoppingList(entry.runtime_data)])


def _description(item: dict) -> str | None:
    parts = [str(item.get("quantity") or "").strip(), ", ".join(item.get("dishes") or [])]
    text = " · ".join(part for part in parts if part)
    return text or None


class MadplanShoppingList(MadplanEntity, TodoListEntity):
    _attr_translation_key = "shopping"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM | TodoListEntityFeature.UPDATE_TODO_ITEM | TodoListEntityFeature.DELETE_TODO_ITEM
    )

    def __init__(self, coordinator: MadplanCoordinator) -> None:
        super().__init__(coordinator, "shopping")

    @property
    def todo_items(self) -> list[TodoItem]:
        return [
            TodoItem(
                uid=item["id"],
                summary=item["label"],
                status=TodoItemStatus.COMPLETED if item.get("checked") else TodoItemStatus.NEEDS_ACTION,
                description=_description(item),
            )
            for item in self.coordinator.data.shopping.get("items", [])
        ]

    def _find(self, uid: str | None) -> dict | None:
        return next((item for item in self.coordinator.data.shopping.get("items", []) if item["id"] == uid), None)

    async def async_create_todo_item(self, item: TodoItem) -> None:
        await self._call(self.coordinator.client.add_item(item.summary or ""))

    async def async_update_todo_item(self, item: TodoItem) -> None:
        current = self._find(item.uid)
        if current is None:
            raise HomeAssistantError("Varen findes ikke længere på indkøbslisten.")
        label = item.summary if item.summary and item.summary != current["label"] else None
        checked = item.status == TodoItemStatus.COMPLETED if item.status is not None else None
        if checked == bool(current.get("checked")):
            checked = None
        if label is None and checked is None:
            return
        await self._call(self.coordinator.client.update_item(current["id"], label=label, checked=checked))

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            await self._call(self.coordinator.client.delete_item(uid))

    async def _call(self, request) -> None:
        try:
            await request
        except MadplanError as err:
            raise HomeAssistantError(str(err)) from err
        finally:
            await self.coordinator.async_request_refresh()
