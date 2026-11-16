from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Restaurant AI Monitoring System"
    database_url: str = "sqlite+aiosqlite:///./restaurant.db"
    cors_origins: list[str] = ["http://localhost:5173"]
    api_key: str | None = None
    jwt_secret: str = "change-me-before-deployment"
    jwt_algorithm: str = "HS256"
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "restaurant/tables"
    mqtt_enabled: bool = False
    rtsp_streams: list[str] = []
    model_path: str = "models/yolov8_restaurant_custom.pt"
    file_explorer_backend_root: Path | None = None
    file_explorer_frontend_root: Path | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
