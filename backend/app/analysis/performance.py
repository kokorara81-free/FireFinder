from datetime import date, datetime


PERIOD_SESSIONS = {
    "weekly": 5,
    "monthly": 21,
    "quarterly": 63,
}


def parse_generated_date(value: str) -> date:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()


def find_forward_close(prices: list[dict], start_date: date, sessions: int) -> tuple[date, float] | None:
    eligible = [row for row in prices if row["date"] >= start_date]
    if len(eligible) <= sessions:
        return None
    target = eligible[sessions]
    return target["date"], float(target["close"])


def analyze_result(result: dict, generated_date: date, prices: list[dict]) -> dict:
    baseline_price = float(result["current_price"])
    analysis = {
        "symbol": result["symbol"],
        "screening_date": generated_date.isoformat(),
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