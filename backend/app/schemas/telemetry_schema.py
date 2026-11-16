from datetime import datetime

from pydantic import BaseModel


class TableTelemetry(BaseModel):
    table_id: str
    state: str
    updated_at: datetime
