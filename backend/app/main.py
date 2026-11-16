from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import websockets
from app.api.v1 import explorer, metrics, simulator, stream, tables
from app.core.config import settings
from app.core.database import engine, init_db
from app.services.mqtt_service import mqtt_service
from app.services.table_simulator import table_simulator


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    if settings.mqtt_enabled:
        mqtt_service.start()
    yield
    await table_simulator.stop()
    mqtt_service.stop()
    await engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(tables.router, prefix="/api/v1")
app.include_router(metrics.router, prefix="/api/v1")
app.include_router(stream.router, prefix="/api/v1")
app.include_router(explorer.router, prefix="/api/v1")
app.include_router(simulator.router, prefix="/api/v1")
app.include_router(websockets.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
