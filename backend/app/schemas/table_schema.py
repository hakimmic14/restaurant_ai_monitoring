from pydantic import BaseModel, ConfigDict, Field, field_validator


class TableCreate(BaseModel):
    id: str
    name: str
    roi: list[list[float]] = Field(default_factory=list)


class TableRead(TableCreate):
    state: str
    model_config = ConfigDict(from_attributes=True)


class TableRoiUpdate(BaseModel):
    roi: list[tuple[float, float]] = Field(default_factory=list)

    @field_validator("roi")
    @classmethod
    def validate_roi(cls, value: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if value and len(value) < 3:
            raise ValueError("A table region must have at least three points")
        if any(not 0 <= coordinate <= 1 for point in value for coordinate in point):
            raise ValueError("ROI points must use normalized coordinates between 0 and 1")
        return value
