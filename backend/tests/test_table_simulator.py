import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import PropertyMock, patch

from app.api.v1.simulator import build_simulator_tables
from app.services.state_machine import TableStateMachine
from app.services.table_simulator import TableSimulator, table_simulator


class TableSimulatorTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        await table_simulator.stop()

    async def test_cycles_table_state_and_emits_guest_and_waiter_events(self):
        simulator = TableSimulator()
        events = []
        cycle_completed = asyncio.Event()

        async def collect(payload):
            events.append(payload)
            if payload["event_type"] == "guest_departure":
                cycle_completed.set()

        async def yield_control(_delay):
            await asyncio.sleep(0)

        with (
            patch("app.services.table_simulator.websocket_manager.broadcast", new=collect),
            patch("app.services.table_simulator.sleep", new=yield_control),
            patch("app.services.table_simulator.CAMERA_INTERVAL_SECONDS", 0),
            patch("app.services.table_simulator.WAITER_TIMER_INTERVAL_SECONDS", 0),
            patch("app.services.table_simulator.SERVICE_SECONDS", 0),
            patch("app.services.table_simulator.TABLE_RESET_SECONDS", 0),
        ):
            await simulator.start([{"id": "table-1", "name": "Table 1"}])
            await asyncio.wait_for(cycle_completed.wait(), timeout=1)
            status = await simulator.stop()

        cycle_events = events[:9]
        self.assertEqual(
            [event["event_type"] for event in cycle_events],
            [
                "camera_detection",
                "guest_seated",
                "waiter_timer",
                "waiter_timer",
                "waiter_timer",
                "waiter_timer",
                "waiter_arrival",
                "service_completed",
                "guest_departure",
            ],
        )
        self.assertEqual(
            [event["state"] for event in cycle_events],
            ["GREEN", "RED", "RED", "RED", "RED", "RED", "YELLOW", "BLUE", "GREEN"],
        )
        self.assertTrue(all(event["simulated"] for event in cycle_events))
        self.assertTrue(all(event["updated_at"] for event in cycle_events))
        self.assertTrue(all(event["transports"]["websocket"] for event in cycle_events))
        self.assertTrue(all(not event["transports"]["mqtt"] for event in cycle_events))
        self.assertEqual(status, {"running": False, "table_count": 0})

    async def test_mqtt_publish_result_is_included_in_websocket_payload(self):
        simulator = TableSimulator()
        payloads = []

        async def collect(payload):
            payloads.append(payload)

        with (
            patch("app.services.mqtt_service.MQTTService.is_started", new_callable=PropertyMock, return_value=True),
            patch("app.services.table_simulator.mqtt_service.publish", return_value=True),
            patch("app.services.table_simulator.websocket_manager.broadcast", new=collect),
        ):
            await simulator._emit(
                TableStateMachine("table-1"),
                "table-1",
                "Table 1",
                "RED",
                "guest_seated",
                "Guests seated.",
                guest_count=2,
            )

        self.assertEqual(len(payloads), 1)
        self.assertEqual(
            payloads[0]["transports"],
            {
                "websocket": True,
                "mqtt": True,
                "mqtt_topic": "restaurant/tables",
            },
        )

    def test_builds_exactly_twenty_demo_tables_when_none_are_configured(self):
        tables = build_simulator_tables([])

        self.assertEqual(len(tables), 20)
        self.assertEqual(tables[0], {"id": "demo-1", "name": "Demo table 1"})
        self.assertEqual(tables[-1], {"id": "demo-20", "name": "Demo table 20"})

    def test_fills_to_twenty_without_replacing_configured_tables_or_ids(self):
        records = [
            SimpleNamespace(id="demo-1", name="Configured table"),
            SimpleNamespace(id="table-2", name="Dining room"),
        ]

        tables = build_simulator_tables(records)

        self.assertEqual(len(tables), 20)
        self.assertEqual(tables[:2], [
            {"id": "demo-1", "name": "Configured table"},
            {"id": "table-2", "name": "Dining room"},
        ])
        self.assertEqual(len({table["id"] for table in tables}), 20)
        self.assertEqual(tables[2]["id"], "demo-2")

    def test_caps_configured_tables_at_twenty(self):
        records = [
            SimpleNamespace(id=f"table-{index}", name=f"Table {index}")
            for index in range(25)
        ]

        tables = build_simulator_tables(records)

        self.assertEqual(len(tables), 20)
        self.assertEqual(tables[-1]["id"], "table-19")


if __name__ == "__main__":
    unittest.main()
