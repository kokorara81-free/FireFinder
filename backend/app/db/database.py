from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.analysis_database_url.startswith("sqlite") else {}
engine = create_engine(settings.analysis_database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)


def get_db():
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
