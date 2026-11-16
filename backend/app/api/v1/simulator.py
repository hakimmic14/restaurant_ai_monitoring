from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models_db.table import RestaurantTable
from app.services.table_simulator import table_simulator

router = APIRouter(prefix="/simulator", tags=["simulator"])

SIMULATED_TABLE_COUNT = 20


def build_simulator_tables(records: list) -> list[dict[str, str]]:
    tables = [{"id": record.id, "name": record.name} for record in records]
    tables = tables[:SIMULATED_TABLE_COUNT]
    table_ids = {table["id"] for table in tables}
    demo_index = 1
    while len(tables) < SIMULATED_TABLE_COUNT:
        table_id = f"demo-{demo_index}"
        demo_index += 1
        if table_id in table_ids:
            continue
        tables.append({"id": table_id, "name": f"Demo table {demo_index - 1}"})
        table_ids.add(table_id)
    return tables


@router.get("/status")
async def get_simulator_status():
    return table_simulator.status()


@router.post("/start")
async def start_simulator(db: AsyncSession = Depends(get_db)):
    if table_simulator.is_running:
        return table_simulator.status()

    records = await db.scalars(select(RestaurantTable).order_by(RestaurantTable.id))
    tables = build_simulator_tables(list(records))
    await table_simulator.start(tables)
    return table_simulator.status()


@router.post("/stop")
async def stop_simulator():
    return await table_simulator.stop()
