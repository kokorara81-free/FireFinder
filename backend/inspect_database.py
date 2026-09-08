import argparse

from sqlalchemy import func, select

from app.db.database import SessionLocal, initialize_database
from app.db.models import DailyPrice, ScreeningResult, ScreeningReturn, ScreeningRun, Symbol


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect FireFinder SQLite data health")
    parser.add_argument("--fail-on-empty", action="store_true", help="Exit with code 1 when no screening result exists")
    return parser.parse_args()


def count(session, model) -> int:
    return session.scalar(select(func.count()).select_from(model)) or 0


def main() -> int:
    args = parse_args()
    initialize_database()
    with SessionLocal() as session:
        run_count = count(session, ScreeningRun)
        result_count = count(session, ScreeningResult)
        return_count = count(session, ScreeningReturn)
        symbol_count = count(session, Symbol)
        price_count = count(session, DailyPrice)
        passed_count = session.scalar(
            select(func.count()).select_from(ScreeningResult).where(ScreeningResult.passed.is_(True))
        ) or 0
        missing_metadata_count = session.scalar(
            select(func.count())
            .select_from(ScreeningResult)
            .join(Symbol, ScreeningResult.symbol_id == Symbol.id)
            .where((Symbol.sector.is_(None)) | (Symbol.industry.is_(None)))
        ) or 0
        latest_run = session.scalar(select(ScreeningRun).order_by(ScreeningRun.screening_date.desc(), ScreeningRun.id.desc()))
        horizon_rows = session.execute(
            select(ScreeningReturn.horizon_sessions, ScreeningReturn.status, func.count())
            .group_by(ScreeningReturn.horizon_sessions, ScreeningReturn.status)
            .order_by(ScreeningReturn.horizon_sessions, ScreeningReturn.status)
        ).all()

    print("FireFinder SQLite health")
    print(f"symbols: {symbol_count}")
    print(f"daily_prices: {price_count}")
    print(f"screening_runs: {run_count}")
    print(f"screening_results: {result_count} (passed: {passed_count})")
    print(f"screening_returns: {return_count}")
    print(f"results missing sector or industry: {missing_metadata_count}")
    if latest_run:
        print(f"latest screening date: {latest_run.screening_date}")
        print(f"latest run status: {latest_run.status}")
    else:
        print("latest screening date: none")
    print("return horizons:")
    for horizon, status, rows in horizon_rows:
        print(f"  {horizon} sessions / {status}: {rows}")

    if args.fail_on_empty and result_count == 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())