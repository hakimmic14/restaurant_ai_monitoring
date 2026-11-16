import { useEffect, useState } from "react";

const socketUrl = `${import.meta.env.VITE_WS_URL ?? "ws://localhost:8000"}/ws/floor-stream`;

export function useTableSocket(onUpdate) {
  const [connected, setConnected] = useState(false);
  const [latest, setLatest] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    let socket;
    let reconnectTimeout;
    let disposed = false;

    function connect() {
      socket = new WebSocket(socketUrl);
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) reconnectTimeout = window.setTimeout(connect, 2000);
      };
      socket.onerror = () => setConnected(false);
      socket.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data);
          setLatest(update);
          setMessages((current) => [...current.slice(-49), update]);
          onUpdate(update);
        } catch (error) {
          console.error("Unable to parse telemetry WebSocket payload", error);
        }
      };
    }

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, [onUpdate]);

  return { connected, latest, messages };
}
