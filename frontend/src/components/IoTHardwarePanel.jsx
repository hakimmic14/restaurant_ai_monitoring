import { useMemo, useState } from "react";

const STATES = [
  { key: "GREEN", label: "Available", color: "#22c55e" },
  { key: "RED", label: "Needs service", color: "#ef4444" },
  { key: "YELLOW", label: "Waiter arrived", color: "#eab308" },
  { key: "BLUE", label: "Service complete", color: "#3b82f6" },
];

const BOARD_PINS = {
  esp32: ["18", "19", "21", "22", "23", "25", "26", "27", "32", "33"],
  uno: ["2", "3", "5", "6", "7", "8", "9"],
};

const DEFAULT_PINS = { GREEN: "18", RED: "19", YELLOW: "21", BLUE: "22" };
const UNO_DEFAULT_PINS = { GREEN: "2", RED: "3", YELLOW: "5", BLUE: "6" };

function cppString(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

function makeSketch({ board, pins, activeHigh, host, port, topic, tableId }) {
  const isEsp32 = board === "esp32";
  const safePort = Math.min(65535, Math.max(1, Number(port) || 1883));
  const pinConstants = STATES.map(
    ({ key }) => `const uint8_t PIN_${key} = ${pins[key]};`,
  ).join("\n");
  const ledUpdate = STATES.map(
    ({ key }) => `  digitalWrite(PIN_${key}, strcmp(state, "${key}") == 0 ? LED_ON : LED_OFF);`,
  ).join("\n");
  const networkIncludes = isEsp32
    ? `#include <WiFi.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
WiFiClient networkClient;`
    : `#include <SPI.h>
#include <Ethernet.h>
#include <PubSubClient.h>

// Use a unique MAC address for every controller on your LAN.
byte macAddress[] = { 0x02, 0x52, 0x41, 0x49, 0x00, 0x01 };
EthernetClient networkClient;`;
  const connectNetwork = isEsp32
    ? `void connectNetwork() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}`
    : `void connectNetwork() {
  if (Ethernet.begin(macAddress) == 0) {
    while (true) delay(1000);
  }
  delay(1000);
}`;

  return `// Restaurant AI table light pod
// Requires PubSubClient (Arduino Library Manager).
#include <stdio.h>
#include <string.h>
${networkIncludes}
PubSubClient mqttClient(networkClient);

const char* MQTT_HOST = "${cppString(host)}";
const uint16_t MQTT_PORT = ${safePort};
const char* MQTT_TOPIC = "${cppString(topic)}";
const char* TABLE_ID = "${cppString(tableId)}";
const uint8_t LED_ON = ${activeHigh ? "HIGH" : "LOW"};
const uint8_t LED_OFF = ${activeHigh ? "LOW" : "HIGH"};
${pinConstants}

bool readJsonString(const char* json, const char* key, char* output, size_t capacity) {
  char searchKey[32];
  snprintf(searchKey, sizeof(searchKey), "\\"%s\\"", key);
  const char* value = strstr(json, searchKey);
  if (value == nullptr) return false;
  value = strchr(value + strlen(searchKey), ':');
  if (value == nullptr) return false;
  value++;
  while (*value == ' ' || *value == '\\t') value++;
  if (*value++ != '"') return false;
  size_t index = 0;
  while (*value != '\\0' && *value != '"' && index + 1 < capacity) {
    if (*value == '\\\\' && value[1] != '\\0') value++;
    output[index++] = *value++;
  }
  output[index] = '\\0';
  return *value == '"';
}

void setLightState(const char* state) {
${ledUpdate}
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  (void)topic;
  char json[480];
  if (length >= sizeof(json)) return;
  memcpy(json, payload, length);
  json[length] = '\\0';

  char tableId[64];
  char state[16];
  if (!readJsonString(json, "table_id", tableId, sizeof(tableId))) return;
  if (strcmp(tableId, TABLE_ID) != 0) return;
  if (readJsonString(json, "state", state, sizeof(state))) setLightState(state);
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect(TABLE_ID)) mqttClient.subscribe(MQTT_TOPIC);
    else delay(2000);
  }
}

${connectNetwork}

void setup() {
  ${STATES.map(({ key }) => `pinMode(PIN_${key}, OUTPUT);`).join("\n  ")}
  setLightState("GREEN");
  connectNetwork();
  if (!mqttClient.setBufferSize(512)) {
    while (true) delay(1000);
  }
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(onMessage);
}

void loop() {
  if (!mqttClient.connected()) connectMqtt();
  mqttClient.loop();
}
`;
}

function makePinoutSvg(board, pins, selectedState, onAssignPin) {
  const boardName = board === "esp32" ? "ESP32 DEVKIT" : "ARDUINO UNO";
  const sidePins = board === "esp32"
    ? {
        left: ["3V3", "GND", "15", "2", "4", "16", "17", "5", "18", "19", "21", "22", "23"],
        right: ["5V", "GND", "13", "12", "14", "27", "26", "25", "33", "32", "RX0", "TX0", "EN"],
      }
    : {
        left: ["RESET", "3.3V", "5V", "GND", "GND", "VIN", "2", "3", "5"],
        right: ["AREF", "GND", "13", "12", "11", "10", "6", "7", "8", "9", "A0"],
      };
  const pinRows = Math.max(sidePins.left.length, sidePins.right.length);
  const boardTop = 42;
  const rowGap = 25;
  const boardHeight = Math.max(170, pinRows * rowGap + 24);
  const leftX = 44;
  const rightX = 316;
  const pinWidth = 72;
  const boardLeft = 104;
  const boardRight = 256;
  const boardCenter = 180;
  const button = (pin, side, row) => {
    const output = BOARD_PINS[board].includes(pin);
    const assignedState = output
      ? STATES.find(({ key }) => pins[key] === pin)?.key
      : null;
    const x = side === "left" ? leftX : rightX;
    const y = boardTop + 18 + row * rowGap;
    const isSelected = output && selectedState && !assignedState;
    const fill = assignedState
      ? STATES.find(({ key }) => key === assignedState).color
      : isSelected
        ? "#1d4ed8"
        : output
          ? "#1e293b"
          : "#111c2e";
    return (
      <g
        key={`${side}-${row}-${pin}`}
        onClick={() => output && onAssignPin(pin)}
        onKeyDown={(event) => {
          if (output && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onAssignPin(pin);
          }
        }}
        role={output ? "button" : undefined}
        tabIndex={output ? 0 : undefined}
        aria-label={output ? `Assign GPIO ${pin} to ${selectedState}` : undefined}
        className={output ? "pinout-clickable" : ""}
      >
        <line x1={side === "left" ? x + pinWidth : boardRight} y1={y + 10} x2={side === "left" ? boardLeft : x} y2={y + 10} stroke={assignedState ? fill : "#475569"} strokeWidth="2" />
        <rect x={x} y={y} width={pinWidth} height="20" rx="4" fill={fill} stroke={output ? "#475569" : "#334155"} />
        <text x={x + pinWidth / 2} y={y + 14} textAnchor="middle" fill={output || assignedState ? "#f8fafc" : "#64748b"} fontSize="10" fontFamily="monospace">
          {assignedState ? `${pin} · ${assignedState}` : pin}
        </text>
      </g>
    );
  };

  return (
    <svg className="pinout-svg" viewBox={`0 0 432 ${boardHeight + 70}`} role="group" aria-label={`${boardName} interactive pinout`}>
      <text x="216" y="20" textAnchor="middle" fill="#94a3b8" fontSize="11" fontFamily="sans-serif">{boardName} · SELECT AN AVAILABLE GPIO</text>
      {sidePins.left.map((pin, row) => button(pin, "left", row))}
      {sidePins.right.map((pin, row) => button(pin, "right", row))}
      <rect x={boardLeft} y={boardTop + 4} width={boardRight - boardLeft} height={boardHeight - 2} rx="12" fill="#172338" stroke="#334155" strokeWidth="2" />
      <rect x={boardCenter - 25} y={boardTop + boardHeight / 2 - 20} width="50" height="40" rx="5" fill="#0b1220" stroke="#475569" />
      <text x={boardCenter} y={boardTop + boardHeight / 2 + 4} textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">MCU</text>
      <text x={boardCenter} y={boardTop + boardHeight - 10} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="monospace">{board === "esp32" ? "ESP-WROOM-32" : "ATmega328P"}</text>
      <text x="216" y={boardHeight + 60} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="sans-serif">Click an available GPIO pin to assign it to the selected light.</text>
    </svg>
  );
}

export default function IoTHardwarePanel() {
  const [board, setBoard] = useState("esp32");
  const [pins, setPins] = useState(DEFAULT_PINS);
  const [selectedState, setSelectedState] = useState("GREEN");
  const [activeHigh, setActiveHigh] = useState(true);
  const [host, setHost] = useState("192.168.1.10");
  const [port, setPort] = useState("1883");
  const [topic, setTopic] = useState("restaurant/tables");
  const [tableId, setTableId] = useState("demo-1");
  const [copyStatus, setCopyStatus] = useState("");

  const sketch = useMemo(
    () => makeSketch({ board, pins, activeHigh, host, port, topic, tableId }),
    [board, pins, activeHigh, host, port, topic, tableId],
  );
  const configJson = useMemo(
    () => JSON.stringify({
      board: board === "esp32" ? "esp32-devkit-v1" : "arduino-uno-w5500",
      table_id: tableId,
      mqtt: { host, port: Number(port) || 1883, topic },
      led_active_level: activeHigh ? "HIGH" : "LOW",
      pins: Object.fromEntries(STATES.map(({ key }) => [key, Number(pins[key])])),
    }, null, 2),
    [board, pins, activeHigh, host, port, topic, tableId],
  );

  function chooseBoard(nextBoard) {
    setBoard(nextBoard);
    setPins(nextBoard === "esp32" ? DEFAULT_PINS : UNO_DEFAULT_PINS);
  }

  function assignPin(pin) {
    if (Object.entries(pins).some(([state, assigned]) => assigned === pin && state !== selectedState)) {
      setCopyStatus(`GPIO ${pin} is already assigned. Choose another pin.`);
      return;
    }
    setPins((current) => ({ ...current, [selectedState]: pin }));
    setCopyStatus("");
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(`${label} copied`);
    } catch {
      setCopyStatus("Clipboard is unavailable in this browser.");
    }
  }

  function downloadSketch() {
    const blob = new Blob([sketch], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `restaurant-light-pod-${tableId || "table"}.ino`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCopyStatus("Arduino sketch downloaded");
  }

  return (
    <section className="panel iot-panel">
      <div className="inspector-section-heading">
        <div>
          <h2>IoT light pod wiring</h2>
          <p>Map table status lights to GPIO pins and generate an MQTT-ready firmware sketch.</p>
        </div>
        <span className="inspector-protocol-tag">LOW VOLTAGE · MQTT</span>
      </div>

      <div className="iot-controls">
        <label className="iot-field">
          <span>Controller board</span>
          <select value={board} onChange={(event) => chooseBoard(event.target.value)}>
            <option value="esp32">ESP32 DevKit V1</option>
            <option value="uno">Arduino Uno + W5500 Ethernet</option>
          </select>
        </label>
        <label className="iot-field">
          <span>MQTT broker host (LAN address)</span>
          <input value={host} onChange={(event) => setHost(event.target.value)} maxLength={253} />
        </label>
        <label className="iot-field">
          <span>Broker port</span>
          <input type="number" min="1" max="65535" value={port} onChange={(event) => setPort(event.target.value)} />
        </label>
        <label className="iot-field">
          <span>MQTT topic</span>
          <input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={128} />
        </label>
        <label className="iot-field">
          <span>Table ID (matches telemetry)</span>
          <input value={tableId} onChange={(event) => setTableId(event.target.value)} maxLength={63} />
        </label>
        <label className="iot-field">
          <span>LED wiring polarity</span>
          <select value={activeHigh ? "high" : "low"} onChange={(event) => setActiveHigh(event.target.value === "high")}>
            <option value="high">Common cathode / active HIGH</option>
            <option value="low">Common anode / active LOW</option>
          </select>
        </label>
      </div>

      <div className="iot-pinout-layout">
        <div className="iot-diagram-card">
          <div className="iot-card-heading">
            <div>
              <strong>Interactive pinout</strong>
              <span>Select a light, then click an available GPIO. Simplified pin map; verify your board revision.</span>
            </div>
            <span className="pinout-legend"><i /> Assigned</span>
          </div>
          <div className="pinout-graphic">
            {makePinoutSvg(board, pins, selectedState, assignPin)}
          </div>
          <div className="led-pin-list" aria-label="LED output assignments">
            {STATES.map(({ key, label, color }) => (
              <button
                type="button"
                key={key}
                className={`led-pin-chip ${selectedState === key ? "selected" : ""}`}
                style={{ "--led-color": color }}
                onClick={() => setSelectedState(key)}
                aria-pressed={selectedState === key}
              >
                <i />
                <span>{label}</span>
                <code>GPIO {pins[key]}</code>
              </button>
            ))}
          </div>
        </div>

        <div className="iot-diagram-card wiring-card">
          <div className="iot-card-heading">
            <div>
              <strong>LED wiring</strong>
              <span>One resistor per LED; wire to low-voltage GPIO only.</span>
            </div>
          </div>
          <div className="led-wiring-list">
            {STATES.map(({ key, label, color }) => (
              <div className="led-wiring-row" key={key}>
                <span className="wiring-gpio">GPIO {pins[key]}</span>
                <span className="wiring-line" />
                <span className="wiring-resistor">220–330 Ω</span>
                <span className="wiring-line" />
                <span className="wiring-led" style={{ "--led-color": color }}>
                  <i />
                  {key}
                </span>
                <span className="wiring-line" />
                <span className="wiring-return">{activeHigh ? "GND" : "3V3"}</span>
              </div>
            ))}
          </div>
          <p className="wiring-note">
            {activeHigh
              ? "Active HIGH: GPIO → resistor → LED anode (+); LED cathode (−) → GND."
              : "Active LOW: 3V3 → resistor → LED anode (+); LED cathode (−) → GPIO."}
          </p>
        </div>
      </div>

      <div className="iot-safety-note" role="note">
        <strong>Hardware safety:</strong> Use a current-limiting resistor for each indicator LED.
        This generator is for low-voltage indicator LEDs only; do not connect mains-powered
        fixtures, relays, LED strips, or other loads directly to GPIO. Use a properly rated,
        isolated driver for higher-power lighting.
      </div>

      <div className="iot-output-heading">
        <div>
          <strong>Generated deployment files</strong>
          <span>Firmware listens for this table’s state in the MQTT JSON payload.</span>
        </div>
        {copyStatus && <span className="copy-feedback-static" role="status">{copyStatus}</span>}
      </div>
      <div className="iot-output-grid">
        <div className="iot-output-card">
          <div className="iot-output-toolbar">
            <strong>Arduino sketch</strong>
            <div>
              <button className="inspector-button" type="button" onClick={() => copyText(sketch, "Sketch")}>Copy</button>
              <button className="inspector-button" type="button" onClick={downloadSketch}>Download .ino</button>
            </div>
          </div>
          <pre className="iot-code-preview"><code>{sketch}</code></pre>
        </div>
        <div className="iot-output-card">
          <div className="iot-output-toolbar">
            <strong>Pod configuration</strong>
            <button className="inspector-button" type="button" onClick={() => copyText(configJson, "Configuration")}>Copy JSON</button>
          </div>
          <pre className="iot-code-preview config-preview"><code>{configJson}</code></pre>
          <p className="iot-library-note">
            Install <code>PubSubClient</code> from Arduino Library Manager. The ESP32 sketch also
            needs its board package; the Uno sketch expects a W5500 Ethernet shield.
          </p>
        </div>
      </div>
    </section>
  );
}
