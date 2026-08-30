from app.core.config import settings
from app.data.providers.base import MarketDataProvider
from app.data.providers.mock_provider import MockMarketDataProvider
from app.data.providers.yahoo_provider import YahooFinanceProvider


def create_market_data_provider() -> MarketDataProvider:
    if settings.data_provider == "yahoo":
        return YahooFinanceProvider()
    if settings.data_provider == "mock":
        return MockMarketDataProvider()
    raise ValueError(f"Unsupported DATA_PROVIDER: {settings.data_provider}")
