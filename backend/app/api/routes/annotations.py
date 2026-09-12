from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.user_database import get_user_db, initialize_user_database
from app.db.user_models import SymbolAnnotation

router = APIRouter(prefix="/annotations", tags=["annotations"])


class AnnotationUpdate(BaseModel):
    is_important: bool | None = None
    is_watched: bool | None = None
    is_excluded: bool | None = None
    memo: str | None = None


@router.get("/{ticker}")
def get_annotation(ticker: str, database: Session = Depends(get_user_db)):
    initialize_user_database()
    annotation = database.scalar(
        select(SymbolAnnotation).where(SymbolAnnotation.ticker == ticker.upper())
    )
    if annotation is None:
        return {"ticker": ticker.upper(), "is_important": False, "is_watched": False, "is_excluded": False, "memo": None}
    return _serialize(annotation)


@router.get("")
def list_annotations(database: Session = Depends(get_user_db)):
    initialize_user_database()
    annotations = database.scalars(
        select(SymbolAnnotation).order_by(SymbolAnnotation.ticker)
    ).all()
    return {"items": [_serialize(annotation) for annotation in annotations]}


@router.put("/{ticker}")
def update_annotation(
    ticker: str,
    payload: AnnotationUpdate,
    database: Session = Depends(get_user_db),
):
    initialize_user_database()
    normalized_ticker = ticker.upper()
    annotation = database.scalar(
        select(SymbolAnnotation).where(SymbolAnnotation.ticker == normalized_ticker)
    )
    if annotation is None:
        annotation = SymbolAnnotation(ticker=normalized_ticker)
        database.add(annotation)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(annotation, field, value)
    annotation.updated_at = datetime.utcnow()
    database.commit()
    database.refresh(annotation)
    return _serialize(annotation)


def _serialize(annotation: SymbolAnnotation) -> dict:
    return {
        "ticker": annotation.ticker,
        "is_important": annotation.is_important,
        "is_watched": annotation.is_watched,
        "is_excluded": annotation.is_excluded,
        "memo": annotation.memo,
    }