from pathlib import Path

from app.core.config import settings


class Detector:
    """Lazy YOLO wrapper; model weights are deliberately not bundled."""

    def __init__(self, model_path: str | Path = settings.model_path) -> None:
        self.model_path = Path(model_path)
        self._model = None

    def load(self) -> None:
        if not self.model_path.is_file():
            raise FileNotFoundError(f"YOLO weights not found: {self.model_path}")
        from ultralytics import YOLO

        self._model = YOLO(str(self.model_path))

    def detect(self, frame):
        if self._model is None:
            self.load()
        return self._model.predict(frame, verbose=False)[0]
