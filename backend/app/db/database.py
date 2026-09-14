from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.analysis_database_url.startswith("sqlite") else {}
engine = create_engine(settings.analysis_database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    if engine.dialect.name != "sqlite":
        return
    existing_columns = {column["name"] for column in inspect(engine).get_columns("screening_results")}
    with engine.begin() as connection:
        for column_name in ("trailing_pe", "forward_pe"):
            if column_name not in existing_columns:
                connection.execute(text(f"ALTER TABLE screening_results ADD COLUMN {column_name} FLOAT"))


def get_db():
    database = SessionLocal()
    try:
        yield database
    finally:
        database.close()
