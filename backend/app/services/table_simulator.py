import asyncio
import logging
from asyncio import sleep

from app.core.config import settings
from app.services.mqtt_service import mqtt_service
from app.services.state_machine import TableStateMachine
from app.services.websocket_manager import websocket_manager

logger = logging.getLogger(__name__)

WAITER_RESPONSE_SECONDS = 5
SERVICE_SECONDS = 3
TABLE_RESET_SECONDS = 2
CAMERA_INTERVAL_SECONDS = 1
WAITER_TIMER_INTERVAL_SECONDS = 1


class TableSimulator:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._table_count = 0

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def status(self) -> dict:
        return {"running": self.is_running, "table_count": self._table_count}

    async def start(self, tables: list[dict]) -> dict:
        if self.is_running:
            return self.status()
        if not tables:
            raise ValueError("At least one table is required to start the simulator")
        self._table_count = len(tables)
        self._task = asyncio.create_task(self._run(tables), name="table-state-simulator")
        return self.status()

    async def stop(self) -> dict:
        task = self._task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._table_count = 0
        return self.status()

    async def _run(self, tables: list[dict]) -> None:
        await asyncio.gather(
            *(self._run_table(table, index) for index, table in enumerate(tables))
        )

    async def _run_table(self, table: dict, index: int) -> None:
        table_id = table["id"]
        table_name = table["name"]
        state_machine = TableStateMachine(table_id)
        guest_count = index % 3 + 1
        while True:
            await self._emit(
                state_machine,
                table_id,
                table_name,
                "GREEN",
                "camera_detection",
                f"Camera detected {guest_count} guest(s) approaching {table_name}.",
                detected_guest_count=guest_count,
            )
            await sleep(CAMERA_INTERVAL_SECONDS)
            await self._emit(
                state_machine,
                table_id,
                table_name,
                "RED",
                "guest_seated",
                f"{guest_count} guest(s) seated at {table_name}; waiter requested.",
                guest_count=guest_count,
                waiter_eta_seconds=WAITER_RESPONSE_SECONDS,
            )
            for seconds_remaining in range(WAITER_RESPONSE_SECONDS - 1, 0, -1):
                await sleep(WAITER_TIMER_INTERVAL_SECONDS)
                await self._emit(
                    state_machine,
                    table_id,
                    table_name,
                    "RED",
                    "waiter_timer",
                    f"Waiter arriving at {table_name} in {seconds_remaining}s.",
                    guest_count=guest_count,
                    waiter_eta_seconds=seconds_remaining,
                )
            await sleep(WAITER_TIMER_INTERVAL_SECONDS)
            await self._emit(
                state_machine,
                table_id,
                table_name,
                "YELLOW",
                "waiter_arrival",
                f"Waiter arrived at {table_name}.",
                guest_count=guest_count,
                waiter_eta_seconds=0,
            )
            await sleep(SERVICE_SECONDS)
            await self._emit(
                state_machine,
                table_id,
                table_name,
                "BLUE",
                "service_completed",
                f"Service completed at {table_name}.",
                guest_count=guest_count,
            )
            await sleep(TABLE_RESET_SECONDS)
            await self._emit(
                state_machine,
                table_id,
                table_name,
                "GREEN",
                "guest_departure",
                f"Guests departed {table_name}; table is available.",
                guest_count=0,
            )
            await sleep(CAMERA_INTERVAL_SECONDS)

    async def _emit(
        self,
        state_machine: TableStateMachine,
        table_id: str,
        table_name: str,
        state: str,
        event_type: str,
        message: str,
        **details: int,
    ) -> None:
        transition = state_machine.transition(state)
        payload = {
            "table_id": table_id,
            "name": table_name,
            "state": transition["state"],
            "event_type": event_type,
            "message": message,
            "updated_at": transition["updated_at"],
            "simulated": True,
            **details,
        }
        mqtt_published = False
        if mqtt_service.is_started:
            try:
                mqtt_published = mqtt_service.publish(payload)
            except (OSError, RuntimeError):
                logger.exception("Unable to publish table telemetry to MQTT")
            if not mqtt_published:
                logger.error("MQTT broker did not accept table telemetry for %s", table_id)
        payload["transports"] = {
            "websocket": True,
            "mqtt": mqtt_published,
            "mqtt_topic": settings.mqtt_topic if mqtt_service.is_started else None,
        }
        await websocket_manager.broadcast(payload)


table_simulator = TableSimulator()
