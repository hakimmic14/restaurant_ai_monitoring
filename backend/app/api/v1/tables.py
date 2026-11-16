from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models_db.table import RestaurantTable
from app.schemas.table_schema import TableCreate, TableRead, TableRoiUpdate

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("", response_model=list[TableRead])
async def list_tables(db: AsyncSession = Depends(get_db)):
    result = await db.scalars(select(RestaurantTable).order_by(RestaurantTable.id))
    return list(result)


@router.post("", response_model=TableRead, status_code=201)
async def create_table(table: TableCreate, db: AsyncSession = Depends(get_db)):
    if await db.get(RestaurantTable, table.id):
        raise HTTPException(status_code=409, detail="Table already exists")
    record = RestaurantTable(**table.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.patch("/{table_id}/roi", response_model=TableRead)
async def update_table_roi(
    table_id: str,
    update: TableRoiUpdate,
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(RestaurantTable, table_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Table not found")
    record.roi = [list(point) for point in update.roi]
    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/{table_id}", status_code=204)
async def delete_table(table_id: str, db: AsyncSession = Depends(get_db)):
    record = await db.get(RestaurantTable, table_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Table not found")
    await db.delete(record)
    await db.commit()
