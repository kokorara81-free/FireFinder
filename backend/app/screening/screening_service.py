from app.data.providers.base import MarketDataProvider
from app.strategy.sepa_strategy import SepaStrategy
from app.strategy.vcp import VcpAnalyzer


class ScreeningService:
    def __init__(self, provider: MarketDataProvider, strategy: SepaStrategy, vcp_analyzer: VcpAnalyzer | None = None):
        self.provider = provider
        self.strategy = strategy
        self.vcp_analyzer = vcp_analyzer or VcpAnalyzer()

    def screen(self, symbols: list[str]) -> list[dict]:
        results = []
        batch_method = getattr(self.provider, "get_daily_prices_batch", None)
        request_symbols = [*symbols, "SPY"]
        try:
            batch_data = batch_method(request_symbols, periods=260) if batch_method else None
            benchmark_prices = batch_data.get("SPY", []) if batch_data is not None else self.provider.get_daily_prices("SPY", periods=260)
        except (RuntimeError, ValueError, OSError) as error:
            return [{"symbol": symbol.strip().upper(), "passed": False, "score": 0, "error": str(error)} for symbol in symbols if symbol.strip()]
        for raw_symbol in symbols:
            symbol = raw_symbol.strip().upper()
            if not symbol:
                continue
            try:
                prices = batch_data.get(symbol, []) if batch_data is not None else self.provider.get_daily_prices(symbol, periods=260)
                if not prices:
                    raise ValueError(f"No daily price data returned for {symbol}")
                evaluation = self.strategy.evaluate(prices, benchmark_prices)
                evaluation["vcp"] = self.vcp_analyzer.analyze(prices) if evaluation["passed"] else {
                    "found": False,
                    "reason": "SEPA 기준 미통과로 VCP 분석 생략",
                }
                results.append({"symbol": symbol, **evaluation})
            except (RuntimeError, ValueError, OSError) as error:
                results.append({"symbol": symbol, "passed": False, "score": 0, "error": str(error)})
        return sorted(results, key=lambda result: result["score"], reverse=True)
