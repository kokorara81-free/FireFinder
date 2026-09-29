from datetime import date

from sqlalchemy import select

from app.analysis.performance import PERIOD_SESSIONS, find_forward_close
from app.db.database import SessionLocal, initialize_database
from app.db.models import DailyPrice, ScreeningResult, ScreeningReturn, ScreeningRun, Symbol


def main() -> int:
    initialize_database()
    updated = 0
    with SessionLocal.begin() as session:
        existing = {
            (return_row.screening_result_id, return_row.horizon_sessions): return_row
            for return_row in session.scalars(select(ScreeningReturn)).all()
        }
        rows = session.execute(
            select(ScreeningResult, ScreeningRun, Symbol)
            .join(ScreeningRun, ScreeningRun.id == ScreeningResult.run_id)
            .join(Symbol, Symbol.id == ScreeningResult.symbol_id)
        ).all()
        prices_by_symbol: dict[int, list[dict]] = {}
        for result, run, symbol in rows:
            prices = prices_by_symbol.get(symbol.id)
            if prices is None:
                prices = [
                    {"date": price.trading_date, "close": price.close}
                    for price in session.scalars(
                        select(DailyPrice)
                        .where(DailyPrice.symbol_id == symbol.id)
                        .order_by(DailyPrice.trading_date)
                    )
                    if price.close is not None
                ]
                prices_by_symbol[symbol.id] = prices
            for sessions in PERIOD_SESSIONS.values():
                return_row = existing.get((result.id, sessions))
                if return_row is None:
                    return_row = ScreeningReturn(
                        screening_result_id=result.id,
                        horizon_sessions=sessions,
                        status="pending",
                    )
                    session.add(return_row)
                    existing[(result.id, sessions)] = return_row
                if return_row.status == "complete":
                    continue
                target = find_forward_close(prices, run.screening_date, sessions)
                if target is None or result.current_price is None:
                    continue
                target_date, target_price = target
                return_row.status = "complete"
                return_row.target_date = target_date
                return_row.target_price = target_price
                return_row.return_percent = round((target_price / result.current_price - 1) * 100, 2)
                updated += 1
    print(f"Updated screening returns: {updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())