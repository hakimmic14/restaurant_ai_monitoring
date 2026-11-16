from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    badge_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
