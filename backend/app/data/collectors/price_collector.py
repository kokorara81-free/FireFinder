from app.data.providers.base import MarketDataProvider


class PriceCollector:
    def __init__(self, provider: MarketDataProvider):
        self.provider = provider

    def collect(self, symbols: list[str], periods: int = 260) -> dict:
        collected = {}
        errors = {}
        for raw_symbol in symbols:
            symbol = raw_symbol.strip().upper()
            if not symbol:
                continue
            try:
                collected[symbol] = self.provider.get_daily_prices(symbol, periods)
            except (RuntimeError, ValueError, OSError) as error:
                errors[symbol] = str(error)
        return {"data": collected, "errors": errors}
