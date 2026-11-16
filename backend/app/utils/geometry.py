def point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    """Return whether a point is inside a polygon using ray casting."""
    x, y = point
    inside = False
    previous = len(polygon) - 1
    for current, (x1, y1) in enumerate(polygon):
        x2, y2 = polygon[previous]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
        previous = current
    return inside
