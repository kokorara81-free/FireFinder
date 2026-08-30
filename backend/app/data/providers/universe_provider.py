import json
from urllib.request import Request, urlopen


class NasdaqUniverseProvider:
    endpoint = "https://api.nasdaq.com/api/screener/stocks"

    def get_stocks(self, limit: int = 10000) -> list[dict]:
        rows = []
        page_size = 500
        for offset in range(0, limit, page_size):
            url = f"{self.endpoint}?tableonly=true&limit={page_size}&offset={offset}"
            request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
            with urlopen(request, timeout=30) as response:
                payload = json.load(response)
            data = payload.get("data") or {}
            batch = data.get("rows") or (data.get("table") or {}).get("rows") or []
            rows.extend(batch)
            if len(batch) < page_size:
                break
        return rows

    @staticmethod
    def filter_stocks(stocks: list[dict], min_price: float, min_volume: int) -> list[str]:
        symbols = []
        for stock in stocks:
            symbol = str(stock.get("symbol") or "").strip().upper()
            price = NasdaqUniverseProvider._number(stock.get("lastsale"))
            volume = NasdaqUniverseProvider._number(stock.get("volume"))
            if symbol and price is not None and price >= min_price and (volume is None or volume >= min_volume):
                symbols.append(symbol)
        return sorted(set(symbols))

    @staticmethod
    def filter_common_stocks(
        stocks: list[dict], min_price: float, min_market_cap: float, max_market_cap: float
    ) -> list[str]:
        symbols = []
        excluded_terms = ("etf", "etn", "warrant", "right", "unit", "preferred", "depositary")
        for stock in stocks:
            symbol = str(stock.get("symbol") or "").strip().upper()
            name = str(stock.get("name") or "").lower()
            exchange = str(stock.get("exchange") or stock.get("exchangeName") or "").lower()
            url = str(stock.get("url") or "").lower()
            price = NasdaqUniverseProvider._number(stock.get("lastsale"))
            market_cap = NasdaqUniverseProvider._number(stock.get("marketCap"))
            is_otc = "otc" in exchange or "otc" in url or "pink" in exchange
            is_non_common = any(term in name for term in excluded_terms) or any(
                suffix in symbol for suffix in ("-P", "/P", "-W", "/W", "-U", "/U", "-R", "/R")
            )
            if (
                symbol
                and price is not None
                and market_cap is not None
                and price >= min_price
                and market_cap >= min_market_cap
                and market_cap < max_market_cap
                and not is_otc
                and not is_non_common
            ):
                symbols.append(symbol)
        return sorted(set(symbols))

    @staticmethod
    def _number(value):
        if value is None:
            return None
        try:
            return float(str(value).replace("$", "").replace(",", "").strip())
        except (TypeError, ValueError):
            return None
