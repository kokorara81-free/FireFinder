from collections import defaultdict
from datetime import date, datetime


PERIOD_SESSIONS = {
    "weekly": 5,
    "monthly": 21,
    "quarterly": 63,
}


def analyze_listing_history(payloads: list[tuple[object, dict]]) -> list[dict]:
    observations_by_symbol = defaultdict(dict)
    for _, payload in payloads:
        screening_date = parse_generated_date(payload["generated_at"]).isoformat()
        for result in payload.get("results", []):
            symbol = result.get("symbol")
            if not symbol:
                continue
            observations_by_symbol[symbol][screening_date] = {
                "date": screening_date,
                "score": result.get("score"),
                "passed": bool(result.get("passed", False)),
                "error": result.get("error"),
            }

    histories = []
    for symbol, observations_by_date in sorted(observations_by_symbol.items()):
        observations = [observations_by_date[screening_date] for screening_date in sorted(observations_by_date)]
        listed_dates = [observation["date"] for observation in observations if observation["passed"]]
        streaks = []
        current_streak = 0
        for observation in observations:
            if observation["passed"]:
                current_streak += 1
            elif current_streak:
                streaks.append(current_streak)
                current_streak = 0
        if current_streak:
            streaks.append(current_streak)

        score_changes = []
        dropouts = []
        for previous, current in zip(observations, observations[1:]):
            if previous["score"] != current["score"]:
                score_changes.append({
                    "from_date": previous["date"],
                    "to_date": current["date"],
                    "from_score": previous["score"],
                    "to_score": current["score"],
                    "change": _score_change(previous["score"], current["score"]),
                })
            if previous["passed"] and not current["passed"]:
                dropouts.append({
                    "date": current["date"],
                    "previous_score": previous["score"],
                    "score": current["score"],
                    "error": current["error"],
                })

        reentries = sum(
            1
            for previous, current in zip(observations, observations[1:])
            if not previous["passed"] and current["passed"]
        )
        histories.append({
            "symbol": symbol,
            "first_listed_date": listed_dates[0] if listed_dates else None,
            "last_listed_date": listed_dates[-1] if listed_dates else None,
            "listed_count": len(listed_dates),
            "current_streak": current_streak,
            "longest_streak": max(streaks, default=0),
            "reentries": reentries,
            "dropouts": dropouts,
            "score_changes": score_changes,
            "observations": observations,
        })
    return histories


def _score_change(previous_score: object, current_score: object) -> int | None:
    if not isinstance(previous_score, (int, float)) or not isinstance(current_score, (int, float)):
        return None
    return current_score - previous_score


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