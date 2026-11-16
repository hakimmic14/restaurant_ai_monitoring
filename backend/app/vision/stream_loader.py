import threading

import cv2


class VideoStream:
    """Threaded reader for a camera index or stream URL."""

    def __init__(self, source: str | int) -> None:
        self.capture = cv2.VideoCapture(source)
        if not self.capture.isOpened():
            raise RuntimeError(f"Unable to open video source: {source}")
        self._lock = threading.Lock()
        self._frame = None
        self._stopped = threading.Event()
        self._thread = threading.Thread(target=self._read, daemon=True)
        self._thread.start()

    def _read(self) -> None:
        while not self._stopped.is_set():
            ok, frame = self.capture.read()
            if not ok:
                self._stopped.set()
                break
            with self._lock:
                self._frame = frame

    def read(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def close(self) -> None:
        self._stopped.set()
        self._thread.join(timeout=2)
        self.capture.release()
