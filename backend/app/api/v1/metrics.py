from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models_db.alert import Alert

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/summary")
async def metrics_summary(db: AsyncSession = Depends(get_db)):
    count, average = (
        await db.execute(select(func.count(Alert.id), func.avg(Alert.response_seconds)))
    ).one()
    return {"alert_count": count, "average_response_seconds": average}
