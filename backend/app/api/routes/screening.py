from fastapi import APIRouter, Query

from app.data.collectors.price_collector import PriceCollector
from app.data.providers.factory import create_market_data_provider
from app.screening.screening_service import ScreeningService
from app.strategy.sepa_strategy import SepaStrategy

router = APIRouter(prefix="/screening", tags=["screening"])


def create_screening_service() -> ScreeningService:
    return ScreeningService(create_market_data_provider(), SepaStrategy())


@router.get("/preview")
def preview_screening(
    symbols: list[str] = Query(default=["AAPL", "MSFT", "NVDA", "AMZN"]),
):
    service = create_screening_service()
    return {
        "strategy": service.strategy.name,
        "strategy_version": service.strategy.version,
        "provider": service.provider.__class__.__name__,
        "results": service.screen(symbols),
    }


@router.get("/collect")
def collect_prices(
    symbols: list[str] = Query(default=["AAPL", "MSFT", "NVDA", "AMZN"]),
):
    provider = create_market_data_provider()
    result = PriceCollector(provider).collect(symbols)
    return {
        "provider": provider.__class__.__name__,
        "collected_symbols": list(result["data"]),
        "session_counts": {symbol: len(rows) for symbol, rows in result["data"].items()},
        "errors": result["errors"],
    }
