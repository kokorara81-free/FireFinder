from datetime import date
import math
import time

from app.data.providers.base import MarketDataProvider


class YahooFinanceProvider(MarketDataProvider):
    def __init__(self, period: str = "2y"):
        self.period = period

    @staticmethod
    def to_yahoo_symbol(symbol: str) -> str:
        return symbol.strip().upper().replace("/", "-")

    def get_daily_prices(self, symbol: str, periods: int = 250) -> list[dict]:
        try:
            import yfinance as yf
        except ImportError as error:
            raise RuntimeError("yfinance is required for YahooFinanceProvider") from error

        yahoo_symbol = self.to_yahoo_symbol(symbol)
        frame = self._download_with_retry(yf, yahoo_symbol, self.period, group_by="ticker")
        if frame.empty:
            raise ValueError(f"No daily price data returned for {symbol} ({yahoo_symbol})")
        if hasattr(frame.columns, "levels"):
            frame.columns = frame.columns.get_level_values(0)

        required_columns = {"Open", "High", "Low", "Close", "Volume"}
        if not required_columns.issubset(frame.columns):
            raise ValueError(f"Incomplete daily price data returned for {symbol} ({yahoo_symbol})")

        return self._frame_to_rows(frame, periods)

    def get_daily_prices_batch(self, symbols: list[str], periods: int = 250) -> dict[str, list[dict]]:
        try:
            import yfinance as yf
        except ImportError as error:
            raise RuntimeError("yfinance is required for YahooFinanceProvider") from error

        source_to_yahoo = {symbol: self.to_yahoo_symbol(symbol) for symbol in symbols}
        yahoo_symbols = list(source_to_yahoo.values())
        frame = self._download_with_retry(yf, yahoo_symbols, self.period, group_by="ticker")
        if frame.empty:
            return {}

        result = {}
        for source_symbol, yahoo_symbol in source_to_yahoo.items():
            try:
                result[source_symbol] = self._frame_to_rows(frame[yahoo_symbol], periods)
            except (KeyError, TypeError, ValueError):
                continue
        return result

    @staticmethod
    def _frame_to_rows(frame, periods: int) -> list[dict]:
        if hasattr(frame.columns, "levels"):
            frame.columns = frame.columns.get_level_values(0)
        required_columns = {"Open", "High", "Low", "Close", "Volume"}
        if not required_columns.issubset(frame.columns):
            raise ValueError("Incomplete daily price data")
        rows = []
        for timestamp, values in frame.tail(periods).iterrows():
            trading_date = timestamp.date() if hasattr(timestamp, "date") else date.fromisoformat(str(timestamp))
            numeric_values = [values[column] for column in ("Open", "High", "Low", "Close", "Volume")]
            if not all(math.isfinite(float(value)) for value in numeric_values):
                continue
            rows.append({
                "date": trading_date,
                "open": float(values["Open"]),
                "high": float(values["High"]),
                "low": float(values["Low"]),
                "close": float(values["Close"]),
                "volume": int(values["Volume"]),
            })
        if not rows:
            raise ValueError("Yahoo Finance returned no complete OHLCV rows")
        return rows

    @staticmethod
    def _download_with_retry(yf, symbols, period, attempts: int = 3, group_by: str = "ticker"):
        for attempt in range(attempts):
            try:
                return yf.download(
                    symbols,
                    period=period,
                    interval="1d",
                    auto_adjust=False,
                    progress=False,
                    threads=False,
                    group_by=group_by,
                )
            except Exception as error:
                message = str(error).lower()
                is_rate_limit = "rate limit" in message or "too many requests" in message
                if not is_rate_limit or attempt == attempts - 1:
                    raise RuntimeError(f"Yahoo Finance download failed for {symbols}: {error}") from error
                time.sleep(2 ** attempt * 3)

        raise RuntimeError(f"Yahoo Finance download failed for {symbols}")

    def get_latest_metrics(self, symbols: list[str]) -> dict[str, dict]:
        try:
            import yfinance as yf
        except ImportError as error:
            raise RuntimeError("yfinance is required for YahooFinanceProvider") from error

        metrics = {}
        for start in range(0, len(symbols), 100):
            chunk = symbols[start:start + 100]
            yahoo_symbols = [self.to_yahoo_symbol(symbol) for symbol in chunk]
            yahoo_to_source = dict(zip(yahoo_symbols, chunk))
            try:
                frame = self._download_with_retry(yf, yahoo_symbols, "1mo", group_by="ticker")
            except RuntimeError:
                continue
            for yahoo_symbol in yahoo_symbols:
                try:
                    values = frame[yahoo_symbol].dropna(subset=["Close", "Volume"])
                    if not values.empty:
                        latest = values.iloc[-1]
                        source_symbol = yahoo_to_source[yahoo_symbol]
                        metrics[source_symbol] = {
                            "price": float(latest["Close"]),
                            "volume": int(latest["Volume"]),
                            "average_volume_15": float(values["Volume"].tail(15).mean()),
                        }
                except (KeyError, TypeError, ValueError):
                    continue
        return metrics
