from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class UserBase(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if settings.user_database_url.startswith("sqlite") else {}
user_engine = create_engine(settings.user_database_url, connect_args=connect_args)
UserSessionLocal = sessionmaker(bind=user_engine, autocommit=False, autoflush=False)


def initialize_user_database() -> None:
    UserBase.metadata.create_all(bind=user_engine)
    if user_engine.dialect.name == "sqlite":
        columns = {column["name"] for column in inspect(user_engine).get_columns("symbol_annotations")}
        with user_engine.begin() as connection:
            if "company_description" not in columns:
                connection.execute(text("ALTER TABLE symbol_annotations ADD COLUMN company_description TEXT"))
            if "investment_strategy" not in columns:
                connection.execute(text("ALTER TABLE symbol_annotations ADD COLUMN investment_strategy TEXT"))


def get_user_db():
    database = UserSessionLocal()
    try:
        yield database
    finally:
        database.close()