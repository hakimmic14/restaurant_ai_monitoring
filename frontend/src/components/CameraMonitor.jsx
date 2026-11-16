import { useEffect, useRef, useState } from "react";
import { apiClient } from "../services/apiClient.js";

const CAPTURE_INTERVAL_MS = 2000;
const RETRY_INTERVAL_MS = 5000;

function getErrorMessage(error) {
  return error.response?.data?.detail ?? error.message ?? "Camera monitoring failed.";
}

function polygonPoints(points) {
  return points.map(([x, y]) => `${x * 1000},${y * 1000}`).join(" ");
}

export default function CameraMonitor({ tables, onTableUpdate }) {
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [error, setError] = useState("");
  const [detections, setDetections] = useState([]);
  const [objectDetectionAvailable, setObjectDetectionAvailable] = useState(true);
  const [roiByTable, setRoiByTable] = useState({});
  const [selectedTableId, setSelectedTableId] = useState("");
  const [editingTableId, setEditingTableId] = useState("");
  const [draftRoi, setDraftRoi] = useState([]);
  const [savingRoi, setSavingRoi] = useState(false);
  const [lastFrameAt, setLastFrameAt] = useState(null);

  useEffect(() => {
    setRoiByTable((current) => {
      const next = { ...current };
      for (const table of tables) {
        const tableId = table.id ?? table.table_id;
        if (!(tableId in next)) next[tableId] = table.roi ?? [];
      }
      return next;
    });
    if (!selectedTableId && tables.length) {
      setSelectedTableId(tables[0].id ?? tables[0].table_id);
    }
  }, [tables, selectedTableId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!cameraActive) return undefined;
    let cancelled = false;
    let timer;

    async function analyzeFrame() {
      let delay = CAPTURE_INTERVAL_MS;
      try {
        const video = videoRef.current;
        const canvas = captureCanvasRef.current;
        if (!video?.videoWidth || !canvas) throw new Error("Waiting for camera video.");

        const scale = Math.min(1, 1280 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
        if (!image) throw new Error("Unable to capture a camera frame.");

        const { data } = await apiClient.post("/api/v1/stream/detect", image, {
          headers: { "Content-Type": "image/jpeg" },
          timeout: 30000,
        });
        if (cancelled) return;
        setDetections(data.detections);
        setObjectDetectionAvailable(data.object_detection_available);
        setLastFrameAt(new Date());
        setError("");
        for (const update of data.tables) onTableUpdate(update);
      } catch (requestError) {
        if (cancelled) return;
        setError(getErrorMessage(requestError));
        delay = RETRY_INTERVAL_MS;
      } finally {
        if (!cancelled) timer = window.setTimeout(analyzeFrame, delay);
      }
    }

    analyzeFrame();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cameraActive, onTableUpdate]);

  async function startCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access requires HTTPS or localhost in a supported browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
    } catch (cameraError) {
      setError(getErrorMessage(cameraError));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setDetections([]);
    setLastFrameAt(null);
  }

  function addRoiPoint(event) {
    if (!editingTableId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setDraftRoi((current) => [
      ...current,
      [
        Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
        Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
      ],
    ]);
  }

  async function saveRoi() {
    if (draftRoi.length < 3) {
      setError("Add at least three points to define a table region.");
      return;
    }
    setSavingRoi(true);
    setError("");
    try {
      const { data } = await apiClient.patch(
        `/api/v1/tables/${encodeURIComponent(editingTableId)}/roi`,
        { roi: draftRoi },
      );
      setRoiByTable((current) => ({ ...current, [editingTableId]: data.roi }));
      setEditingTableId("");
      setDraftRoi([]);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSavingRoi(false);
    }
  }

  const detectionCounts = detections.reduce((counts, detection) => {
    counts[detection.category] = (counts[detection.category] ?? 0) + 1;
    return counts;
  }, {});
  const detectionSummary = [
    ["people", "People"],
    ["faces", "Faces"],
    ["tables", "Tables"],
    ["dishware", "Dishware"],
    ["food", "Food"],
    ["other", "Other"],
  ]
    .filter(([category]) => detectionCounts[category])
    .map(([category, label]) => `${label}: ${detectionCounts[category]}`)
    .join(" · ");

  return (
    <section className="panel camera-monitor" aria-labelledby="camera-monitor-title">
      <div className="camera-heading">
        <div>
          <h2 id="camera-monitor-title">Local camera monitor</h2>
          <p>Camera frames are analyzed on this app's backend and are not saved.</p>
        </div>
        <button
          className={`camera-button${cameraActive ? " stop" : ""}`}
          onClick={cameraActive ? stopCamera : startCamera}
        >
          {cameraActive ? "Stop camera" : "Start camera"}
        </button>
      </div>

      <div className="camera-controls">
        <label htmlFor="camera-table-select">Table region</label>
        <select
          id="camera-table-select"
          value={selectedTableId}
          onChange={(event) => setSelectedTableId(event.target.value)}
          disabled={!tables.length || Boolean(editingTableId)}
        >
          {tables.map((table) => {
            const tableId = table.id ?? table.table_id;
            return <option key={tableId} value={tableId}>{table.name ?? tableId}</option>;
          })}
        </select>
        {!editingTableId ? (
          <button
            className="camera-secondary-button"
            disabled={!cameraActive || !selectedTableId}
            onClick={() => {
              setDraftRoi([]);
              setEditingTableId(selectedTableId);
            }}
          >
            Draw table region
          </button>
        ) : (
          <>
            <span className="muted">Click at least three points around the table.</span>
            <button className="camera-secondary-button" onClick={() => setDraftRoi([])}>
              Clear points
            </button>
            <button
              className="camera-secondary-button"
              onClick={saveRoi}
              disabled={savingRoi || draftRoi.length < 3}
            >
              {savingRoi ? "Saving..." : "Save region"}
            </button>
            <button
              className="camera-secondary-button"
              onClick={() => {
                setEditingTableId("");
                setDraftRoi([]);
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <div className={`camera-video-shell${cameraActive ? " active" : ""}`}>
        <video ref={videoRef} autoPlay muted playsInline />
        {cameraActive && (
          <svg
            className={`camera-overlay${editingTableId ? " editing" : ""}`}
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            onClick={addRoiPoint}
            aria-label="Camera image with table regions and detected objects"
          >
            {tables.map((table) => {
              const tableId = table.id ?? table.table_id;
              const points = roiByTable[tableId] ?? [];
              if (!points.length) return null;
              return (
                <g key={tableId} className={tableId === editingTableId ? "camera-roi selected" : "camera-roi"}>
                  <polygon points={polygonPoints(points)} />
                  <text x={points[0][0] * 1000} y={points[0][1] * 1000}>{table.name ?? tableId}</text>
                </g>
              );
            })}
            {detections.map((detection, index) => {
              const [x1, y1, x2, y2] = detection.box;
              return (
                <g
                  key={`${detection.label}-${index}`}
                  className={`camera-detection camera-detection-${detection.category}`}
                >
                  <rect x={x1 * 1000} y={y1 * 1000} width={(x2 - x1) * 1000} height={(y2 - y1) * 1000} />
                  <text x={x1 * 1000} y={Math.max(20, y1 * 1000 - 8)}>
                    {detection.label}
                    {Number.isFinite(detection.confidence)
                      ? ` ${Math.round(detection.confidence * 100)}%`
                      : ""}
                  </text>
                </g>
              );
            })}
            {draftRoi.length > 0 && (
              <>
                <polyline className="camera-roi-draft" points={polygonPoints(draftRoi)} />
                {draftRoi.map(([x, y], index) => (
                  <circle key={index} cx={x * 1000} cy={y * 1000} r="7" />
                ))}
              </>
            )}
          </svg>
        )}
        {!cameraActive && (
          <div className="camera-placeholder">
            Allow camera access to start live table monitoring.
          </div>
        )}
      </div>
      <canvas ref={captureCanvasRef} className="camera-capture-canvas" />

      <div className="camera-status" aria-live="polite">
        <span>
          {cameraActive ? detectionSummary || "No objects detected" : "Camera stopped"}
        </span>
        {lastFrameAt && <span>Last analyzed {lastFrameAt.toLocaleTimeString()}</span>}
      </div>
      {tables.length === 0 && (
        <p className="muted">Create tables first, then draw a region around each table in the camera view.</p>
      )}
      {cameraActive && !objectDetectionAvailable && (
        <p className="muted" role="status">
          Face detection is active. Add YOLO model weights to enable other object detection.
        </p>
      )}
      {error && <p className="camera-error" role="alert">{error}</p>}
    </section>
  );
}
