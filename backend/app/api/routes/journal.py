from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.user_database import get_user_db, initialize_user_database
from app.db.user_models import TradeJournal

router = APIRouter(prefix="/journal", tags=["journal"])


class JournalPayload(BaseModel):
    ticker: str = Field(min_length=1, max_length=16)
    side: str = Field(pattern="^(Buy|Sell)$")
    entry_price: float = Field(gt=0)
    exit_price: float | None = Field(default=None, gt=0)
    quantity: float = Field(gt=0)
    note: str = ""


@router.get("")
def list_journal(database: Session = Depends(get_user_db)):
    initialize_user_database()
    entries = database.scalars(select(TradeJournal).order_by(desc(TradeJournal.created_at))).all()
    return {"items": [_serialize(entry) for entry in entries]}


@router.post("")
def create_journal(payload: JournalPayload, database: Session = Depends(get_user_db)):
    initialize_user_database()
    entry = TradeJournal(
        ticker=payload.ticker.strip().upper(),
        side=payload.side,
        entry_price=payload.entry_price,
        exit_price=payload.exit_price,
        quantity=payload.quantity,
        note=payload.note.strip(),
    )
    database.add(entry)
    database.commit()
    database.refresh(entry)
    return _serialize(entry)


@router.delete("/{entry_id}")
def delete_journal(entry_id: int, database: Session = Depends(get_user_db)):
    initialize_user_database()
    entry = database.get(TradeJournal, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    database.delete(entry)
    database.commit()
    return {"deleted": entry_id}


def _serialize(entry: TradeJournal) -> dict:
    return {
        "id": entry.id,
        "date": entry.created_at.date().isoformat() if entry.created_at else datetime.utcnow().date().isoformat(),
        "ticker": entry.ticker,
        "side": entry.side,
        "entryPrice": entry.entry_price,
        "exitPrice": entry.exit_price,
        "quantity": entry.quantity,
        "note": entry.note,
    }
