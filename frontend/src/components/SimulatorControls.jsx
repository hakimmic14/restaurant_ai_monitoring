import { useEffect, useState } from "react";
import { apiClient } from "../services/apiClient.js";

export default function SimulatorControls({ connected }) {
  const [status, setStatus] = useState({ running: false, table_count: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.get("/api/v1/simulator/status")
      .then(({ data }) => {
        if (active) setStatus(data);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError.response?.data?.detail ?? "Unable to check simulator status.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleSimulator() {
    setBusy(true);
    setError("");
    try {
      const action = status.running ? "stop" : "start";
      const { data } = await apiClient.post(`/api/v1/simulator/${action}`);
      setStatus(data);
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ?? "Unable to update the simulator.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel simulator-panel" aria-label="Table state simulator">
      <div className="simulator-copy">
        <div className="simulator-title-row">
          <span className={`simulator-indicator ${status.running ? "running" : ""}`} />
          <h2>Table state simulator</h2>
          <span className={`simulator-badge ${status.running ? "running" : ""}`}>
            {status.running ? "Running" : "Stopped"}
          </span>
        </div>
        <p>
          Simulate camera detections, guest seating, waiter arrival timers, and
          the Green → Red → Yellow → Blue light cycle.
        </p>
        {status.running && (
          <span className="simulator-table-count">
            Simulating {status.table_count} {status.table_count === 1 ? "table" : "tables"}
          </span>
        )}
        {error && <p className="simulator-error" role="alert">{error}</p>}
      </div>
      <button
        className={`simulator-button ${status.running ? "stop" : ""}`}
        type="button"
        onClick={toggleSimulator}
        disabled={busy || (!status.running && !connected)}
      >
        {busy ? "Please wait…" : status.running ? "Stop simulation" : "Start simulation"}
      </button>
    </section>
  );
}
