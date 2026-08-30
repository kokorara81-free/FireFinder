import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "FireFinder")
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./firefinder.db")
    timezone: str = os.getenv("TIMEZONE", "America/New_York")
    market_open_report_time: str = os.getenv("MARKET_OPEN_REPORT_TIME", "09:35")
    market_close_report_time: str = os.getenv("MARKET_CLOSE_REPORT_TIME", "16:10")
    data_provider: str = os.getenv("DATA_PROVIDER", "mock")
    sepa_min_score: int = int(os.getenv("SEPA_MIN_SCORE", "7"))
    sepa_min_volume_ratio: float = float(os.getenv("SEPA_MIN_VOLUME_RATIO", "1.0"))
    rs_1_month_weight: float = float(os.getenv("RS_1_MONTH_WEIGHT", "0.50"))
    rs_3_month_weight: float = float(os.getenv("RS_3_MONTH_WEIGHT", "0.30"))
    rs_6_month_weight: float = float(os.getenv("RS_6_MONTH_WEIGHT", "0.20"))


settings = Settings()
