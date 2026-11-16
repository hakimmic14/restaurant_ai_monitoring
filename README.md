# Restaurant AI Monitoring System

A starter monorepo for monitoring restaurant tables with computer vision, a FastAPI backend, and a React dashboard.

## Requirements

- Docker and Docker Compose, or Python 3.11+ and Node.js 20+
- Optional: trained YOLO weights in `backend/models/` to enable inference
- Optional: an MQTT broker and camera streams for live integrations

## Run with Docker Compose

```powershell
docker compose up --build
```

The API is available at <http://localhost:8000>, its OpenAPI docs at <http://localhost:8000/docs>, and the dashboard at <http://localhost:5173>.

The dashboard includes a read-only project file explorer for the backend and frontend source. Docker Compose mounts those source directories read-only for previews. The explorer only lists supported text/code files up to 128 KiB; hidden files, database files, model weights, and dependency/build directories are not exposed.

Use **Start simulation** in the dashboard to generate camera-detection, guest-seating, waiter-countdown, arrival, service, and departure events for exactly 20 tables. Configured tables are used first, and temporary demo tables fill any remaining slots; configured tables beyond the first 20 are not included. With no configured tables, 20 temporary demo tables are generated. Simulated tables follow Green → Red → Yellow → Blue, then reset to Green. The simulation runs only while enabled and does not persist events or table changes.

The live payload inspector shows WebSocket events as formatted JSON, with event filters, pause/resume, selection, and copy controls. MQTT publishing is disabled by default. To publish simulator telemetry to the configured MQTT broker as well, set `MQTT_ENABLED=true` and configure `MQTT_HOST`, `MQTT_PORT`, and `MQTT_TOPIC`; each WebSocket payload indicates whether MQTT accepted the event.

Use **Local camera monitor** to grant the browser access to a webcam on the PC running the dashboard. The browser sends a JPEG frame to the backend every two seconds; OpenCV detects faces and the YOLO model detects its trained object classes. Face detection uses OpenCV's frontal-face cascade and does not identify people. Video/audio and face images are not stored. Faces are outlined in the live camera view; face detections do not change table occupancy. Other detected objects are grouped in the overlay as people, tables, dishware, food, or other; labels and accuracy depend on the authorized model weights at `backend/models/yolov8_restaurant_custom.pt`. Face detection works without YOLO weights; add those weights to enable other object detection. Draw and save a polygon around each table in the live camera view: table detections are visual only and do not create or configure table records. ROI points are normalized to the camera image, so they remain valid if the camera resolution changes. Detected `person`, `guest`, `customer`, or `diner` objects inside a table's ROI mark it RED, and an empty ROI marks it GREEN. Camera access requires a secure browser context (localhost or HTTPS). When using Docker, webcam permission is granted by the browser, not to the backend container.

The **IoT light pod wiring** panel provides interactive ESP32 DevKit V1 and Arduino Uno + W5500 pin maps, LED GPIO assignment, JSON configuration, and downloadable MQTT firmware sketches. Pin maps are simplified; verify GPIO labels against the exact board revision before wiring. Install the board package and `PubSubClient` in Arduino IDE; ESP32 firmware also needs Wi-Fi credentials, and the Uno requires a W5500 Ethernet shield. Set the broker host to an address reachable from the device (not `localhost`) and match its table ID/topic to telemetry. The current backend publisher and generated sketches use unauthenticated MQTT, so use only a trusted private network and do not expose the broker to the internet. Use only low-voltage indicator LEDs with one current-limiting resistor per LED; never connect GPIO directly to mains-powered fixtures or other high-power loads.

## Run locally

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend (Node.js 20.19+):

```powershell
cd frontend
npm install
npm run dev
```

Set `VITE_API_URL` and `VITE_WS_URL` if the API is not at its local default. Backend settings are read from environment variables; see `backend/app/core/config.py`.

When running outside Docker, the explorer locates `backend/` from the backend application and expects the sibling `frontend/` directory to be present. Override `FILE_EXPLORER_BACKEND_ROOT` or `FILE_EXPLORER_FRONTEND_ROOT` when using a different layout.

The simulator can also be controlled through `POST /api/v1/simulator/start` and `POST /api/v1/simulator/stop`; query `GET /api/v1/simulator/status` for its current state.

## Models and integrations

The model weight files shown in the proposed layout are not included. Place authorized YOLO weights at `backend/models/yolov8n.pt` and/or `backend/models/yolov8_restaurant_custom.pt` before enabling inference. MQTT publishing, persistence migrations, and production authentication need environment-specific configuration before deployment.
