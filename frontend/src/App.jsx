import { useFloorState } from "./hooks/useFloorState.js";
import { useTableSocket } from "./hooks/useTableSocket.js";
import AlertNotification from "./components/AlertNotification.jsx";
import CameraMonitor from "./components/CameraMonitor.jsx";
import FloorMapCanvas from "./components/FloorMapCanvas.jsx";
import FileSystemExplorer from "./components/FileSystemExplorer.jsx";
import Header from "./components/Header.jsx";
import IoTHardwarePanel from "./components/IoTHardwarePanel.jsx";
import MqttTelemetryLog from "./components/MqttTelemetryLog.jsx";
import SimulatorControls from "./components/SimulatorControls.jsx";
import TableStatusGrid from "./components/TableStatusGrid.jsx";

export default function App() {
  const { tables, updateTable } = useFloorState();
  const { connected, latest, messages } = useTableSocket(updateTable);

  return (
    <main className="dashboard">
      <Header connected={connected} />
      <AlertNotification table={latest?.state === "RED" ? latest : null} />
      <SimulatorControls connected={connected} />
      <section className="table-count panel" aria-label="Restaurant table count">
        <div className="table-count-value">
          <strong>{tables.length}</strong>
          <span>{tables.length === 1 ? "table" : "tables"}</span>
        </div>
        <p>In this restaurant</p>
      </section>
      <section className="panel">
        <h2>Floor overview</h2>
        <FloorMapCanvas tables={tables} />
      </section>
      <CameraMonitor tables={tables} onTableUpdate={updateTable} />
      <section className="panel">
        <h2>Table status</h2>
        <TableStatusGrid tables={tables} />
      </section>
      <section className="panel">
        <div className="inspector-section-heading">
          <div>
            <h2>Live payload inspector</h2>
            <p>Inspect the JSON emitted with every table telemetry event.</p>
          </div>
          <span className="inspector-protocol-tag">WebSocket · MQTT</span>
        </div>
        <MqttTelemetryLog messages={messages} connected={connected} />
      </section>
      <IoTHardwarePanel />
      <FileSystemExplorer />
    </main>
  );
}
