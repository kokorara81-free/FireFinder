from datetime import date, datetime


PERIOD_SESSIONS = {
    "weekly": 5,
    "monthly": 21,
    "quarterly": 63,
}


def parse_generated_date(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def find_forward_close(prices: list[dict], start_date: date, sessions: int) -> tuple[date, float] | None:
    ordered_prices = sorted(prices, key=lambda row: row["date"])
    baseline_indexes = [index for index, row in enumerate(ordered_prices) if row["date"] <= start_date]
    if not baseline_indexes:
        return None
    target_index = baseline_indexes[-1] + sessions
    if target_index >= len(ordered_prices):
        return None
    target = ordered_prices[target_index]
    return target["date"], float(target["close"])


def analyze_result(result: dict, generated_date: date, prices: list[dict]) -> dict:
    baseline_price = float(result["current_price"])
    baseline_dates = [row["date"] for row in prices if row["date"] <= generated_date]
    analysis = {
        "symbol": result["symbol"],
        "screening_date": generated_date.isoformat(),
        "baseline_date": max(baseline_dates).isoformat() if baseline_dates else None,
        "screening_price": baseline_price,
        "screening_score": result.get("score"),
        "screening_passed": result.get("passed", False),
    }
    for period, sessions in PERIOD_SESSIONS.items():
        target = find_forward_close(prices, generated_date, sessions)
        if target is None:
            analysis[period] = {"status": "pending", "sessions": sessions}
            continue
        target_date, target_price = target
        analysis[period] = {
            "status": "complete",
            "sessions": sessions,
            "date": target_date.isoformat(),
            "price": round(target_price, 4),
            "return_percent": round((target_price / baseline_price - 1) * 100, 2),
        }
    return analysis