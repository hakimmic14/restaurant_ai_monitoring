from app.core.config import settings


class MQTTService:
    """Explicitly started MQTT publisher; no broker connection is made on import."""

    def __init__(self) -> None:
        self._client = None

    @property
    def is_started(self) -> bool:
        return self._client is not None

    def start(self) -> None:
        import paho.mqtt.client as mqtt

        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self._client.connect(settings.mqtt_host, settings.mqtt_port)
        self._client.loop_start()

    def publish(self, payload: dict) -> bool:
        if self._client is None:
            raise RuntimeError("MQTT service has not been started")
        import json

        result = self._client.publish(settings.mqtt_topic, json.dumps(payload), qos=1)
        return result.rc == 0

    def stop(self) -> None:
        if self._client is not None:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None


mqtt_service = MQTTService()
