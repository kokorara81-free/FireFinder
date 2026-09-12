import json
from datetime import date, datetime

from sqlalchemy import select

from app.db.database import SessionLocal, initialize_database
from app.db.models import DailyPrice, ScreeningResult, ScreeningReturn, ScreeningRun, Symbol


def _number(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def _date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    return None


def persist_screening_results(
    results: list[dict],
    generated_at: datetime,
    provider_name: str,
    strategy_name: str,
    strategy_version: str,
    trigger_type: str = "scheduled",
) -> None:
    initialize_database()
    screening_date = generated_at.date()
    with SessionLocal.begin() as session:
        run = session.scalar(
            select(ScreeningRun).where(
                ScreeningRun.generated_at == generated_at,
                ScreeningRun.strategy_name == strategy_name,
            )
        )
        if run is None:
            run = ScreeningRun(
                started_at=generated_at,
                completed_at=generated_at,
                screening_date=screening_date,
                generated_at=generated_at,
                provider=provider_name,
                trigger_type=trigger_type,
                strategy_name=strategy_name,
                strategy_version=strategy_version,
                status="completed",
            )
            session.add(run)
            session.flush()

        for result in results:
            ticker = str(result.get("symbol") or "").strip().upper()
            if not ticker:
                continue
            symbol = session.scalar(select(Symbol).where(Symbol.ticker == ticker))
            if symbol is None:
                symbol = Symbol(ticker=ticker, company_name=ticker)
                session.add(symbol)
                session.flush()
            symbol.sector = result.get("sector") or symbol.sector
            symbol.industry = result.get("industry") or symbol.industry
            stored = session.scalar(
                select(ScreeningResult).where(
                    ScreeningResult.run_id == run.id,
                    ScreeningResult.symbol_id == symbol.id,
                )
            )
            if stored is None:
                stored = ScreeningResult(run_id=run.id, symbol_id=symbol.id)
                session.add(stored)
            stored.score = _number(result.get("score"))
            stored.max_score = _number(result.get("max_score"))
            stored.passed = bool(result.get("passed", False))
            stored.current_price = _number(result.get("current_price"))
            stored.volume_ratio = _number(result.get("volume_ratio"))
            stored.rs_score = _number(result.get("rs_score"))
            stored.vcp_found = result.get("vcp", {}).get("found")
            stored.conditions_json = json.dumps(result.get("conditions", {}), ensure_ascii=False)
            stored.vcp_json = json.dumps(result.get("vcp", {}), ensure_ascii=False, default=str)
            stored.raw_result_json = json.dumps(result, ensure_ascii=False, default=str)


def persist_daily_prices(price_data: dict[str, list[dict]], source: str = "YahooFinanceProvider") -> None:
    initialize_database()
    with SessionLocal.begin() as session:
        for ticker, rows in price_data.items():
            symbol = session.scalar(select(Symbol).where(Symbol.ticker == ticker.upper()))
            if symbol is None:
                symbol = Symbol(ticker=ticker.upper(), company_name=ticker.upper())
                session.add(symbol)
                session.flush()
            for row in rows:
                trading_date = _date(row.get("date"))
                if trading_date is None:
                    continue
                existing = session.scalar(
                    select(DailyPrice).where(
                        DailyPrice.symbol_id == symbol.id,
                        DailyPrice.trading_date == trading_date,
                    )
                )
                if existing is None:
                    existing = DailyPrice(symbol_id=symbol.id, trading_date=trading_date)
                    session.add(existing)
                existing.open = float(row["open"])
                existing.high = float(row["high"])
                existing.low = float(row["low"])
                existing.close = float(row["close"])
                existing.adjusted_close = float(row.get("adjusted_close", row["close"]))
                existing.volume = int(row["volume"])
                existing.source = source


def persist_performance_analysis(analyses: list[dict]) -> None:
    initialize_database()
    with SessionLocal.begin() as session:
        for analysis in analyses:
            screening_date = _date(analysis.get("screening_generated_at"))
            if screening_date is None:
                continue
            run = session.scalar(
                select(ScreeningRun).where(ScreeningRun.screening_date == screening_date).order_by(ScreeningRun.id.desc())
            )
            if run is None:
                continue
            for result in analysis.get("results", []):
                symbol = session.scalar(select(Symbol).where(Symbol.ticker == result.get("symbol")))
                if symbol is None:
                    continue
                stored = session.scalar(
                    select(ScreeningResult).where(
                        ScreeningResult.run_id == run.id,
                        ScreeningResult.symbol_id == symbol.id,
                    )
                )
                if stored is None:
                    continue
                for period in result.values():
                    if not isinstance(period, dict):
                        continue
                    sessions = int(period.get("sessions", 0))
                    if not sessions:
                        continue
                    row = session.scalar(
                        select(ScreeningReturn).where(
                            ScreeningReturn.screening_result_id == stored.id,
                            ScreeningReturn.horizon_sessions == sessions,
                        )
                    )
                    if row is None:
                        row = ScreeningReturn(
                            screening_result_id=stored.id,
                            horizon_sessions=sessions,
                        )
                        session.add(row)
                    row.status = period.get("status", "pending")
                    row.target_date = _date(period.get("date"))
                    row.target_price = _number(period.get("price"))
                    row.return_percent = _number(period.get("return_percent"))

