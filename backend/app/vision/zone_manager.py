from app.utils.geometry import point_in_polygon


class ZoneManager:
    def __init__(self, zones: dict[str, list[tuple[float, float]]] | None = None) -> None:
        self.zones = zones or {}

    def locate(self, point: tuple[float, float]) -> str | None:
        return next(
            (zone_id for zone_id, polygon in self.zones.items() if point_in_polygon(point, polygon)),
            None,
        )
