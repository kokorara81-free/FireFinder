import json
from datetime import date, timedelta
from statistics import mean, median

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import ScreeningResult, ScreeningReturn, ScreeningRun, Symbol
from app.db.user_database import get_user_db
from app.db.user_models import SymbolAnnotation
from app.analysis.performance import PERIOD_SESSIONS

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard(database: Session = Depends(get_db)):
    recent_runs = database.scalars(
        select(ScreeningRun).order_by(desc(ScreeningRun.generated_at)).limit(2)
    ).all()
    latest_run = recent_runs[0] if recent_runs else None
    total_symbols = database.scalar(select(func.count(Symbol.id))) or 0
    important_count = 0
    if latest_run is None:
        return {
            "screening_date": None,
            "total_symbols": total_symbols,
            "passed_count": 0,
            "new_entries": 0,
            "dropouts": 0,
            "important_count": important_count,
            "provider": None,
            "strategy": None,
        }

    result_count = database.scalar(
        select(func.count(ScreeningResult.id)).where(ScreeningResult.run_id == latest_run.id)
    ) or 0
    passed_count = database.scalar(
        select(func.count(ScreeningResult.id)).where(
            ScreeningResult.run_id == latest_run.id,
            ScreeningResult.passed.is_(True),
        )
    ) or 0
    new_entries = 0
    dropouts = 0
    if len(recent_runs) > 1:
        latest_passed = _passed_tickers(database, recent_runs[0].id)
        previous_passed = _passed_tickers(database, recent_runs[1].id)
        new_entries = len(latest_passed - previous_passed)
        dropouts = len(previous_passed - latest_passed)
    return {
        "screening_date": _date_value(latest_run.screening_date),
        "total_symbols": total_symbols,
        "scanned_count": result_count,
        "passed_count": passed_count,
        "new_entries": new_entries,
        "dropouts": dropouts,
        "important_count": important_count,
        "provider": latest_run.provider,
        "strategy": latest_run.strategy_name,
        "strategy_version": latest_run.strategy_version,
    }


@router.get("/screening")
def screening_results(
    passed_only: bool = False,
    limit: int = Query(default=50, ge=1, le=5000),
    database: Session = Depends(get_db),
):
    latest_run = database.scalar(select(ScreeningRun).order_by(desc(ScreeningRun.generated_at)).limit(1))
    if latest_run is None:
        return {"screening_date": None, "results": []}
    previous_run = database.scalar(
        select(ScreeningRun)
        .where(ScreeningRun.id != latest_run.id)
        .order_by(desc(ScreeningRun.generated_at))
        .limit(1)
    )
    latest_passed = _passed_tickers(database, latest_run.id)
    previous_passed = _passed_tickers(database, previous_run.id) if previous_run else set()
    new_entries = latest_passed - previous_passed
    dropouts = previous_passed - latest_passed
    statement = select(ScreeningResult, Symbol).join(Symbol, Symbol.id == ScreeningResult.symbol_id).where(
        ScreeningResult.run_id == latest_run.id
    )
    if passed_only:
        statement = statement.where(ScreeningResult.passed.is_(True))
    statement = statement.order_by(
        desc(ScreeningResult.passed), desc(ScreeningResult.score), Symbol.ticker
    ).limit(limit)
    rows = database.execute(statement).all()
    recent_runs = database.scalars(
        select(ScreeningRun)
        .order_by(desc(ScreeningRun.generated_at))
        .limit(30)
    ).all()
    recent_run_ids = [run.id for run in recent_runs]
    passed_rows = database.execute(
        select(ScreeningResult.run_id, Symbol.ticker)
        .join(Symbol, Symbol.id == ScreeningResult.symbol_id)
        .where(
            ScreeningResult.run_id.in_(recent_run_ids or [-1]),
            ScreeningResult.passed.is_(True),
        )
    ).all()
    passed_tickers_by_run: dict[int, set[str]] = {}
    for run_id, ticker in passed_rows:
        passed_tickers_by_run.setdefault(run_id, set()).add(ticker)

    def streak_for(ticker: str) -> int:
        streak = 0
        counted_dates: set[date] = set()
        for run in recent_runs:
            if run.screening_date in counted_dates:
                continue
            counted_dates.add(run.screening_date)
            if ticker not in passed_tickers_by_run.get(run.id, set()):
                break
            streak += 1
        return streak

    current_streaks = {symbol.ticker: streak_for(symbol.ticker) for _, symbol in rows}
    total_count = database.scalar(
        select(func.count(ScreeningResult.id)).where(ScreeningResult.run_id == latest_run.id)
    ) or 0
    passed_count = database.scalar(
        select(func.count(ScreeningResult.id)).where(
            ScreeningResult.run_id == latest_run.id,
            ScreeningResult.passed.is_(True),
        )
    ) or 0
    return {
        "screening_date": _date_value(latest_run.screening_date),
        "run_id": latest_run.id,
        "total_count": total_count,
        "passed_count": passed_count,
        "results": [
            {
                **_serialize_result(result, symbol),
                "is_new_entry": symbol.ticker in new_entries,
                "is_dropout": symbol.ticker in dropouts,
                "sepa_streak_days": current_streaks.get(symbol.ticker, 0),
            }
            for result, symbol in rows
        ],
    }


@router.get("/trend")
def screening_trend(
    days: int = Query(default=20, ge=5, le=90),
    database: Session = Depends(get_db),
):
    rows = database.execute(
        select(
            ScreeningRun.screening_date,
            Symbol.sector,
            func.count(ScreeningResult.id).label("passed_count"),
        )
        .join(ScreeningResult, ScreeningResult.run_id == ScreeningRun.id)
        .join(Symbol, Symbol.id == ScreeningResult.symbol_id)
        .where(ScreeningResult.passed.is_(True))
        .group_by(ScreeningRun.screening_date)
        .group_by(Symbol.sector)
        .order_by(desc(ScreeningRun.screening_date))
    ).all()
    grouped: dict[str, dict[str, int]] = {}
    for row in rows:
        date_key = _date_value(row.screening_date)
        if date_key is None:
            continue
        grouped.setdefault(date_key, {})[row.sector or "Unknown"] = row.passed_count or 0
    selected_dates = sorted(grouped)[-days:]
    sectors = sorted({sector for date_key in selected_dates for sector in grouped[date_key]})
    points = [
        {
            "date": date_key,
            "sectors": grouped[date_key],
            "passed_count": sum(grouped[date_key].values()),
        }
        for date_key in selected_dates
    ]
    return {"days": days, "sectors": sectors, "points": points}


@router.get("/runs")
def screening_runs(
    limit: int = Query(default=30, ge=1, le=100),
    database: Session = Depends(get_db),
):
    runs = database.scalars(
        select(ScreeningRun).order_by(desc(ScreeningRun.generated_at)).limit(limit)
    ).all()
    return {
        "runs": [
            {
                "id": run.id,
                "screening_date": _date_value(run.screening_date),
                "generated_at": run.generated_at.isoformat() if run.generated_at else None,
                "provider": run.provider,
                "strategy": run.strategy_name,
                "status": run.status,
            }
            for run in runs
        ]
    }


@router.get("/analysis-report")
def analysis_report(
    horizon: int = Query(default=21, ge=1, le=126),
    passed_only: bool = True,
    sector: str | None = None,
    status: str = Query(default="all", pattern="^(all|complete|pending)$"),
    min_score: float = Query(default=0, ge=0, le=9),
    min_avg_return: float | None = Query(default=None, ge=-100, le=1000),
    watchlist_only: bool = False,
    database: Session = Depends(get_db),
    user_database: Session = Depends(get_user_db),
):
    report_horizons = [7, 15, 21, 30, 42, 63, 84, 105, 126]
    average_horizons = [7, 15, 21, 30]
    latest_screening_date = database.scalar(select(ScreeningRun.screening_date).order_by(desc(ScreeningRun.screening_date)).limit(1))
    if latest_screening_date is None:
        return {"horizons": report_horizons, "horizon": horizon, "horizon_label": f"{horizon} sessions", "filters": {}, "summary": {"sample_count": 0, "row_count": 0, "average_return": None, "median_return": None, "win_rate": None}, "sectors": [], "rows": []}
    first_screening_date = latest_screening_date - timedelta(days=183)
    statement = (
        select(ScreeningResult, ScreeningRun, Symbol)
        .join(ScreeningRun, ScreeningRun.id == ScreeningResult.run_id)
        .join(Symbol, Symbol.id == ScreeningResult.symbol_id)
        .where(ScreeningRun.screening_date >= first_screening_date)
    )
    if passed_only:
        statement = statement.where(ScreeningResult.passed.is_(True))
    if sector:
        statement = statement.where(Symbol.sector == sector)
    base_rows = database.execute(statement.order_by(ScreeningRun.screening_date.desc(), Symbol.ticker)).all()
    result_ids = [result.id for result, _, _ in base_rows]
    returns = database.scalars(
        select(ScreeningReturn).where(
            ScreeningReturn.screening_result_id.in_(result_ids or [-1]),
            ScreeningReturn.horizon_sessions.in_(report_horizons),
        )
    ).all()
    returns_by_result = {(return_row.screening_result_id, return_row.horizon_sessions): return_row for return_row in returns}
    average_values_by_ticker: dict[str, dict[int, list[float]]] = {}
    for result, _, symbol in base_rows:
        ticker_values = average_values_by_ticker.setdefault(symbol.ticker, {})
        for period in average_horizons:
            return_row = returns_by_result.get((result.id, period))
            if return_row and return_row.status == "complete" and return_row.return_percent is not None:
                ticker_values.setdefault(period, []).append(float(return_row.return_percent))
    average_returns_by_ticker = {
        ticker: {
            period: round(mean(values), 2) if values else None
            for period, values in period_values.items()
        }
        for ticker, period_values in average_values_by_ticker.items()
    }
    if status != "all":
        base_rows = [
            row for row in base_rows
            if returns_by_result.get((row[0].id, horizon), None) is not None
            and returns_by_result[(row[0].id, horizon)].status == status
        ]
    average_threshold = min_avg_return if min_avg_return is not None else (min_score if min_score > 0 else None)
    if average_threshold is not None:
        base_rows = [
            row for row in base_rows
            if any(
                value is not None and value >= average_threshold
                for value in average_returns_by_ticker.get(row[2].ticker, {}).values()
            )
        ]
    watchlist_tickers = set(user_database.scalars(
        select(SymbolAnnotation.ticker).where(
            (SymbolAnnotation.is_important.is_(True))
            | (SymbolAnnotation.is_watched.is_(True))
        )
    ).all())
    annotations = user_database.scalars(select(SymbolAnnotation)).all()
    interest_states = {
        annotation.ticker: "rising" if annotation.is_important else "falling" if annotation.is_watched else "none"
        for annotation in annotations
    }
    if watchlist_only:
        base_rows = [row for row in base_rows if row[2].ticker in watchlist_tickers]
    values = [
        float(return_row.return_percent)
        for return_row in returns
        if return_row.horizon_sessions == horizon and return_row.status == "complete" and return_row.return_percent is not None
    ]
    wins = sum(value > 0 for value in values)
    report_rows = [
        {
            "symbol": symbol.ticker,
            "screening_date": _date_value(run.screening_date),
            "sector": symbol.sector,
            "industry": symbol.industry,
            "score": result.score,
            "max_score": result.max_score,
            "passed": result.passed,
            "screening_price": result.current_price,
            "volume_ratio": result.volume_ratio,
            "rs_score": result.rs_score,
            "vcp_found": result.vcp_found,
            "conditions": _json_object(result.conditions_json),
            "vcp": _json_object(result.vcp_json),
            "is_watchlisted": symbol.ticker in watchlist_tickers,
            "interest_state": interest_states.get(symbol.ticker, "none"),
            "average_returns": {
                str(period): average_returns_by_ticker.get(symbol.ticker, {}).get(period)
                for period in average_horizons
            },
            "horizon_returns": {
                str(period): {
                    "target_date": _date_value(return_row.target_date),
                    "target_price": return_row.target_price,
                    "return_percent": return_row.return_percent,
                    "status": return_row.status,
                } if (return_row := returns_by_result.get((result.id, period))) else {"target_date": None, "target_price": None, "return_percent": None, "status": "pending"}
                for period in report_horizons
            },
        }
        for result, run, symbol in base_rows
    ]
    sectors = database.scalars(select(Symbol.sector).where(Symbol.sector.is_not(None)).distinct().order_by(Symbol.sector)).all()
    return {
        "horizons": report_horizons,
        "horizon": horizon,
        "horizon_label": next((label.replace("_", " ") for label, sessions in PERIOD_SESSIONS.items() if sessions == horizon), f"{horizon} sessions"),
        "filters": {"passed_only": passed_only, "sector": sector, "status": status, "min_score": min_score, "min_avg_return": min_avg_return},
        "summary": {
            "sample_count": len(values),
            "row_count": len(report_rows),
            "average_return": round(sum(values) / len(values), 2) if values else None,
            "median_return": round(float(median(values)), 2) if values else None,
            "win_rate": round(wins / len(values) * 100, 2) if values else None,
        },
        "sectors": sectors,
        "rows": report_rows,
    }


@router.get("/watchlist")
def watchlist(
    database: Session = Depends(get_db),
    user_database: Session = Depends(get_user_db),
):
    annotations = user_database.scalars(
        select(SymbolAnnotation).where(
            (SymbolAnnotation.is_important.is_(True))
            | (SymbolAnnotation.is_watched.is_(True))
        ).order_by(desc(SymbolAnnotation.updated_at))
    ).all()
    latest_run = database.scalar(select(ScreeningRun).order_by(desc(ScreeningRun.generated_at)).limit(1))
    latest_results = {}
    if latest_run is not None:
        rows = database.execute(
            select(ScreeningResult, Symbol)
            .join(Symbol, Symbol.id == ScreeningResult.symbol_id)
            .where(ScreeningResult.run_id == latest_run.id)
        ).all()
        latest_results = {symbol.ticker: result for result, symbol in rows}
    return {
        "items": [
            {
                "ticker": annotation.ticker,
                "is_important": annotation.is_important,
                "is_watched": annotation.is_watched,
                "memo": annotation.memo,
                "score": latest_results.get(annotation.ticker).score if latest_results.get(annotation.ticker) else None,
                "passed": latest_results.get(annotation.ticker).passed if latest_results.get(annotation.ticker) else None,
            }
            for annotation in annotations
        ]
    }


def _serialize_result(result: ScreeningResult, symbol: Symbol) -> dict:
    raw_result = _json_object(result.raw_result_json)
    return {
        "symbol": symbol.ticker,
        "company_name": symbol.company_name,
        "sector": symbol.sector,
        "industry": symbol.industry,
        "score": result.score,
        "max_score": result.max_score,
        "passed": result.passed,
        "current_price": result.current_price,
        "volume_ratio": result.volume_ratio,
        "rs_score": result.rs_score,
        "vcp_found": result.vcp_found,
        "average_50": raw_result.get("average_50"),
        "average_150": raw_result.get("average_150"),
        "average_200": raw_result.get("average_200"),
        "conditions": _json_object(result.conditions_json),
        "vcp": _json_object(result.vcp_json),
    }


def _passed_tickers(database: Session, run_id: int) -> set[str]:
    return set(database.scalars(
        select(Symbol.ticker)
        .join(ScreeningResult, ScreeningResult.symbol_id == Symbol.id)
        .where(
            ScreeningResult.run_id == run_id,
            ScreeningResult.passed.is_(True),
        )
    ).all())


def _date_value(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _json_object(value: str | None) -> dict:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}