import unittest
from types import SimpleNamespace

import numpy as np

from app.api.v1.stream import detect_faces, format_detections, table_guest_counts


class FakeTensor:
    def __init__(self, values):
        self.values = values

    def cpu(self):
        return self

    def tolist(self):
        return self.values


class FakeFaceCascade:
    def detectMultiScale(self, image, **kwargs):
        return [(10, 20, 30, 40)]


class CameraMonitoringTests(unittest.TestCase):
    def test_detects_faces_and_returns_normalized_boxes(self):
        frame = np.zeros((100, 100, 3), dtype=np.uint8)

        detections = detect_faces(frame, cascade=FakeFaceCascade())

        self.assertEqual(
            detections,
            [{
                "label": "face",
                "category": "faces",
                "confidence": None,
                "box": [0.1, 0.2, 0.4, 0.6],
            }],
        )

    def test_formats_supported_restaurant_object_categories(self):
        result = SimpleNamespace(
            boxes=SimpleNamespace(
                xyxy=FakeTensor([[10, 20, 30, 40]] * 5),
                conf=FakeTensor([0.9] * 5),
                cls=FakeTensor([0, 1, 2, 3, 4]),
            ),
            names={0: "person", 1: "dining table", 2: "bowl", 3: "pizza", 4: "chair"},
        )

        detections = format_detections(result, width=100, height=100)

        self.assertEqual(
            [detection["category"] for detection in detections],
            ["people", "tables", "dishware", "food", "other"],
        )
        self.assertEqual(detections[0]["box"], [0.1, 0.2, 0.3, 0.4])

    def test_counts_only_person_detections_inside_each_table_roi(self):
        tables = [
            SimpleNamespace(id="table-1", roi=[[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]]),
            SimpleNamespace(id="table-2", roi=[[0.5, 0.5], [0.9, 0.5], [0.9, 0.9], [0.5, 0.9]]),
            SimpleNamespace(id="table-3", roi=[]),
        ]
        detections = [
            {"label": "person", "box": [0.2, 0.2, 0.3, 0.3]},
            {"label": "guest", "box": [0.6, 0.6, 0.7, 0.7]},
            {"label": "chair", "box": [0.2, 0.2, 0.3, 0.3]},
            {"label": "person", "box": [0.7, 0.1, 0.8, 0.2]},
        ]

        self.assertEqual(table_guest_counts(detections, tables), {"table-1": 1, "table-2": 1})


if __name__ == "__main__":
    unittest.main()
