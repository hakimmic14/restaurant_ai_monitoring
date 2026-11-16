from dataclasses import dataclass, field
from datetime import datetime, timezone


VALID_STATES = {"GREEN", "RED", "YELLOW", "BLUE"}


@dataclass
class TableStateMachine:
    table_id: str
    state: str = "GREEN"
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def transition(self, state: str) -> dict:
        normalized = state.upper()
        if normalized not in VALID_STATES:
            raise ValueError(f"Unsupported table state: {state}")
        self.state = normalized
        self.updated_at = datetime.now(timezone.utc)
        return {"table_id": self.table_id, "state": self.state, "updated_at": self.updated_at.isoformat()}
