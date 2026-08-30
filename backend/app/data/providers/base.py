from abc import ABC, abstractmethod


class MarketDataProvider(ABC):
    @abstractmethod
    def get_daily_prices(self, symbol: str, periods: int = 250) -> list[dict]:
        raise NotImplementedError

