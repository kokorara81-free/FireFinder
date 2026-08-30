from datetime import date, timedelta
import random

from app.data.providers.base import MarketDataProvider


class MockMarketDataProvider(MarketDataProvider):
    def get_daily_prices(self, symbol: str, periods: int = 250) -> list[dict]:
        generator = random.Random(symbol)
        price = 100.0
        rows = []
        for offset in range(periods, 0, -1):
            price *= 1 + generator.uniform(-0.018, 0.022)
            volume = int(generator.uniform(800_000, 3_000_000))
            rows.append({
                "date": date.today() - timedelta(days=offset),
                "open": round(price * 0.99, 2),
                "high": round(price * 1.02, 2),
                "low": round(price * 0.97, 2),
                "close": round(price, 2),
                "volume": volume,
            })
        return rows
