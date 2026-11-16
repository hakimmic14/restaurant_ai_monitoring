import threading
from pathlib import Path

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models_db.table import RestaurantTable
from app.services.websocket_manager import websocket_manager
from app.utils.geometry import point_in_polygon
from app.vision.detector import Detector

router = APIRouter(prefix="/stream", tags=["stream"])
MAX_FRAME_BYTES = 2_000_000
PERSON_LABELS = {"person", "guest", "customer", "diner"}
DETECTION_CATEGORIES = {
    "people": PERSON_LABELS | {"waiter", "waitress", "staff", "employee"},
    "tables": {"table", "dining table", "restaurant table"},
    "dishware": {
        "bowl", "cup", "wine glass", "glass", "fork", "knife", "spoon", "plate",
        "dish", "tray",
    },
    "food": {
        "food", "pizza", "sandwich", "cake", "apple", "banana", "orange", "broccoli",
        "carrot", "hot dog", "donut",
    },
}
detector = Detector()
detector_lock = threading.Lock()
face_cascade_lock = threading.Lock()
face_cascade = None


def detect_frame(frame):
    with detector_lock:
        return detector.detect(frame)


def detect_faces(frame, cascade=None) -> list[dict]:
    global face_cascade
    height, width = frame.shape[:2]
    if cascade is None:
        with face_cascade_lock:
            if face_cascade is None:
                cascade_path = (
                    Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
                )
                if not cascade_path.is_file():
                    raise FileNotFoundError(
                        f"OpenCV face cascade not found: {cascade_path}"
                    )
                loaded_cascade = cv2.CascadeClassifier(str(cascade_path))
                if loaded_cascade.empty():
                    raise RuntimeError(f"Unable to load OpenCV face cascade: {cascade_path}")
                face_cascade = loaded_cascade
            cascade = face_cascade

    grayscale = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    with face_cascade_lock:
        boxes = cascade.detectMultiScale(
            grayscale,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
        )
    return [
        {
            "label": "face",
            "category": "faces",
            "confidence": None,
            "box": [
                max(0.0, min(1.0, x / width)),
                max(0.0, min(1.0, y / height)),
                max(0.0, min(1.0, (x + box_width) / width)),
                max(0.0, min(1.0, (y + box_height) / height)),
            ],
        }
        for x, y, box_width, box_height in boxes
    ]


def detection_category(class_name: str) -> str:
    normalized_name = class_name.strip().lower().replace("_", " ")
    for category, labels in DETECTION_CATEGORIES.items():
        if normalized_name in labels:
            return category
    return "other"


def format_detections(result, width: int, height: int) -> list[dict]:
    boxes = result.boxes
    if boxes is None:
        return []

    coordinates = boxes.xyxy.cpu().tolist()
    confidences = boxes.conf.cpu().tolist()
    class_ids = boxes.cls.cpu().tolist()
    names = result.names
    detections = []
    for box, confidence, class_id in zip(coordinates, confidences, class_ids, strict=True):
        x1, y1, x2, y2 = box
        class_name = str(names[int(class_id)]).strip().lower()
        detections.append({
            "label": class_name,
            "category": detection_category(class_name),
            "confidence": float(confidence),
            "box": [
                max(0.0, min(1.0, x1 / width)),
                max(0.0, min(1.0, y1 / height)),
                max(0.0, min(1.0, x2 / width)),
                max(0.0, min(1.0, y2 / height)),
            ],
        })
    return detections


def table_guest_counts(detections: list[dict], tables: list[RestaurantTable]) -> dict[str, int]:
    polygons = {
        table.id: [(float(x), float(y)) for x, y in table.roi]
        for table in tables
        if len(table.roi) >= 3
    }
    counts = dict.fromkeys(polygons, 0)
    for detection in detections:
        if detection["label"] not in PERSON_LABELS:
            continue
        x1, y1, x2, y2 = detection["box"]
        center = ((x1 + x2) / 2, (y1 + y2) / 2)
        for table_id, polygon in polygons.items():
            if point_in_polygon(center, polygon):
                counts[table_id] += 1
    return counts


@router.post("/detect")
async def detect_camera_frame(request: Request, db: AsyncSession = Depends(get_db)):
    if request.headers.get("content-type", "").split(";", maxsplit=1)[0] != "image/jpeg":
        raise HTTPException(status_code=415, detail="Expected a JPEG camera frame")

    image_bytes = await request.body()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Camera frame is empty")
    if len(image_bytes) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Camera frame exceeds the 2 MB limit")

    frame = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Camera frame is not a valid JPEG image")

    height, width = frame.shape[:2]
    object_detection_available = True
    try:
        result = await run_in_threadpool(detect_frame, frame)
        detections = format_detections(result, width, height)
    except FileNotFoundError:
        object_detection_available = False
        detections = []
    try:
        detections.extend(await run_in_threadpool(detect_faces, frame))
    except (FileNotFoundError, RuntimeError) as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    tables = list(await db.scalars(select(RestaurantTable).order_by(RestaurantTable.id)))
    guest_counts = table_guest_counts(detections, tables)
    updates = []
    for table in tables:
        if table.id not in guest_counts:
            continue
        guest_count = guest_counts[table.id]
        state = "RED" if guest_count else "GREEN"
        table.state = state
        updates.append({
            "table_id": table.id,
            "state": state,
            "guest_count": guest_count,
            "event_type": "camera_detection",
            "simulated": False,
        })

    if updates:
        await db.commit()
        for update in updates:
            await websocket_manager.broadcast(update)

    return {
        "detections": detections,
        "tables": updates,
        "image_size": {"width": width, "height": height},
        "object_detection_available": object_detection_available,
    }
