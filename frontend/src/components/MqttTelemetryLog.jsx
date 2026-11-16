import { useEffect, useMemo, useState } from "react";

const JSON_TOKEN = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?|[\{\}\[\],:])/g;

function messageKey(message) {
  return `${message.table_id}-${message.updated_at}-${message.event_type}`;
}

function renderJsonLine(line) {
  let offset = 0;
  return line.split(JSON_TOKEN).map((token, index) => {
    if (!token) return null;
    let className = "";
    if (/^"/.test(token)) {
      const remainder = line.slice(offset + token.length);
      className = remainder.trimStart().startsWith(":")
        ? "json-key"
        : "json-string";
    } else if (/^(true|false|null)$/.test(token)) {
      className = "json-boolean";
    } else if (/^-?\d/.test(token)) {
      className = "json-number";
    } else if (/^[{}\[\],:]$/.test(token)) {
      className = "json-punctuation";
    }
    offset += token.length;
    return className
      ? <span className={className} key={index}>{token}</span>
      : token;
  });
}

export default function MqttTelemetryLog({ messages = [], connected = false }) {
  const [filter, setFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [paused, setPaused] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const visibleMessages = useMemo(() => {
    if (filter === "states") {
      return messages.filter((message) => message.event_type !== "waiter_timer");
    }
    if (filter === "waiter") {
      return messages.filter((message) =>
        ["guest_seated", "waiter_timer", "waiter_arrival"].includes(message.event_type),
      );
    }
    return messages;
  }, [filter, messages]);

  useEffect(() => {
    if (paused || !visibleMessages.length) return;
    setSelectedKey(messageKey(visibleMessages[visibleMessages.length - 1]));
  }, [paused, visibleMessages]);

  const selectedMessage = visibleMessages.find(
    (message) => messageKey(message) === selectedKey,
  ) ?? visibleMessages[visibleMessages.length - 1];
  const payloadText = selectedMessage
    ? JSON.stringify(selectedMessage, null, 2)
    : "";
  const payloadLines = payloadText.split("\n");
  const mqttPublished = selectedMessage?.transports?.mqtt;

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payloadText);
      setCopyMessage("Payload copied");
    } catch {
      setCopyMessage("Clipboard is unavailable in this browser");
    }
  }

  return (
    <div className="payload-inspector">
      <div className="inspector-toolbar">
        <div className="inspector-filters" role="group" aria-label="Filter telemetry">
          {[
            ["all", "All"],
            ["states", "State changes"],
            ["waiter", "Guest & waiter"],
          ].map(([value, label]) => (
            <button
              className={filter === value ? "active" : ""}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
              aria-pressed={filter === value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="inspector-actions">
          <span className={`inspector-connection ${connected ? "connected" : ""}`}>
            <span />
            {connected ? "WebSocket live" : "WebSocket offline"}
          </span>
          <button
            className="inspector-button"
            type="button"
            onClick={() => setPaused((current) => !current)}
            disabled={!messages.length}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>
      <div className="inspector-layout">
        <div className="inspector-feed" aria-label="Live telemetry events">
          <div className="inspector-feed-heading">
            <span>Recent events</span>
            <span>{visibleMessages.length} / {messages.length}</span>
          </div>
          {!visibleMessages.length ? (
            <p className="muted inspector-empty">
              {connected ? "Waiting for telemetry…" : "Connect to the WebSocket to receive events."}
            </p>
          ) : (
            <ol className="telemetry-list">
              {[...visibleMessages].reverse().map((message) => {
                const key = messageKey(message);
                return (
                  <li key={key}>
                    <button
                      className={`telemetry-event ${selectedMessage && messageKey(selectedMessage) === key ? "selected" : ""}`}
                      onClick={() => {
                        setPaused(true);
                        setSelectedKey(key);
                      }}
                      type="button"
                      aria-pressed={selectedMessage && messageKey(selectedMessage) === key}
                    >
                      <span className={`telemetry-state state-${message.state}`}>
                        {message.state}
                      </span>
                      <span className="telemetry-description">
                        <strong>{message.name ?? message.table_id}</strong>
                        <span>{message.event_type ?? "table_update"}</span>
                      </span>
                      <time dateTime={message.updated_at}>
                        {message.updated_at
                          ? new Date(message.updated_at).toLocaleTimeString()
                          : ""}
                      </time>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="inspector-payload">
          <div className="payload-heading">
            <div className="payload-source">
              <span className={`payload-source-dot ${mqttPublished ? "mqtt" : ""}`} />
              <span>{mqttPublished ? "WebSocket + MQTT" : "WebSocket payload"}</span>
              {selectedMessage?.transports?.mqtt_topic && (
                <code>{selectedMessage.transports.mqtt_topic}</code>
              )}
            </div>
            <div className="payload-tools">
              <span>{selectedMessage ? "JSON" : "—"}</span>
              <button
                className="inspector-button"
                type="button"
                onClick={copyPayload}
                disabled={!selectedMessage}
              >
                Copy JSON
              </button>
            </div>
          </div>
          {copyMessage && <span className="copy-feedback" role="status">{copyMessage}</span>}
          {selectedMessage ? (
            <pre className="payload-json" aria-label="Selected telemetry JSON payload">
              <code>
                {payloadLines.map((line, index) => (
                  <span className="payload-json-line" key={index}>
                    <span className="payload-line-number">{index + 1}</span>
                    <span>{renderJsonLine(line)}</span>
                  </span>
                ))}
              </code>
            </pre>
          ) : (
            <p className="muted inspector-empty">A payload will appear here when an event arrives.</p>
          )}
        </div>
      </div>
    </div>
  );
}
