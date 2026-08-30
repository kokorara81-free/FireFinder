from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class VcpRules:
    lookback_weeks: int = 20
    trading_days_per_week: int = 5
    minimum_contractions: int = 3
    minimum_contraction_percent: float = 3.0
    decreasing_tolerance_percent: float = 0.15
    pivot_lookback_days: int = 5
    volume_dry_up_ratio: float = 0.80
    breakout_volume_ratio: float = 1.40
    minimum_contraction_days: int = 5


class VcpAnalyzer:
    name = "Volatility Contraction Pattern"
    version = "0.1"

    def __init__(self, rules: VcpRules | None = None):
        self.rules = rules or VcpRules()

    def analyze(self, prices: list[dict]) -> dict:
        lookback = self.rules.lookback_weeks * self.rules.trading_days_per_week
        window = prices[-lookback:]
        if len(window) < lookback:
            return self._not_found(f"At least {lookback} trading sessions are required")

        pivots = self._find_swings(window)
        contractions = []
        for index in range(len(pivots) - 1):
            peak = pivots[index]
            trough = pivots[index + 1]
            if peak["type"] != "high" or trough["type"] != "low":
                continue
            decline = (peak["price"] - trough["price"]) / peak["price"] * 100
            if decline >= self.rules.minimum_contraction_percent:
                duration_days = trough["index"] - peak["index"] + 1
                average_volume = sum(
                    prices[row_index]["volume"] for row_index in range(peak["index"], trough["index"] + 1)
                ) / duration_days
                contractions.append({
                    "peak_price": round(peak["price"], 2),
                    "trough_price": round(trough["price"], 2),
                    "contraction_percent": round(decline, 2),
                    "peak_date": peak["date"],
                    "trough_date": trough["date"],
                    "duration_days": duration_days,
                    "average_volume": round(average_volume),
                })

        contractions = contractions[-self.rules.minimum_contractions:]
        decreasing = self._is_decreasing(contractions)
        volume_dry_up = self._volume_dry_up(contractions)
        durations_valid = all(
            item["duration_days"] >= self.rules.minimum_contraction_days for item in contractions
        )
        found = len(contractions) >= self.rules.minimum_contractions and decreasing and durations_valid
        result = {
            "found": found,
            "lookback_weeks": self.rules.lookback_weeks,
            "contraction_count": len(contractions),
            "contractions": contractions,
            "decreasing_contractions": decreasing,
            "volume_dry_up": volume_dry_up,
            "contraction_durations_valid": durations_valid,
            "breakout_volume_ratio": None,
            "breakout_volume_confirmed": False,
            "pivot_breakout": False,
            "pivot_price": None,
            "pivot_date": None,
            "pivot_distance_percent": None,
            "reason": "",
        }
        if not found:
            result["reason"] = "Three or more progressively smaller contractions with valid durations were not found"
            return result

        final_trough_date = contractions[-1]["trough_date"]
        final_trough_index = max(
            index for index, row in enumerate(window) if row["date"] == final_trough_date
        )
        right_side = window[final_trough_index:-1]
        if not right_side:
            result["reason"] = "No completed right-side base exists after the final contraction"
            return result
        pivot = max(right_side, key=lambda row: row["high"])
        current_price = window[-1]["close"]
        average_volume_50 = sum(row["volume"] for row in window[-50:]) / 50
        breakout_volume_ratio = window[-1]["volume"] / average_volume_50 if average_volume_50 else 0
        result["pivot_price"] = round(pivot["high"], 2)
        result["pivot_date"] = pivot["date"]
        result["pivot_distance_percent"] = round((current_price / pivot["high"] - 1) * 100, 2)
        result["breakout_volume_ratio"] = round(breakout_volume_ratio, 2)
        result["breakout_volume_confirmed"] = breakout_volume_ratio >= self.rules.breakout_volume_ratio
        result["pivot_breakout"] = current_price > pivot["high"]
        result["reason"] = "Progressively smaller contractions detected"
        return result

    def _find_swings(self, prices: list[dict]) -> list[dict]:
        swings = []
        radius = self.rules.pivot_lookback_days
        for index in range(radius, len(prices) - radius):
            current = prices[index]
            highs = [row["high"] for row in prices[index - radius:index + radius + 1]]
            lows = [row["low"] for row in prices[index - radius:index + radius + 1]]
            if current["high"] == max(highs):
                swings.append({"type": "high", "price": current["high"], "date": current["date"], "index": index})
            elif current["low"] == min(lows):
                swings.append({"type": "low", "price": current["low"], "date": current["date"], "index": index})
        return self._alternating_swings(swings)

    @staticmethod
    def _alternating_swings(swings: list[dict]) -> list[dict]:
        result = []
        for swing in swings:
            if result and result[-1]["type"] == swing["type"]:
                if swing["type"] == "high" and swing["price"] > result[-1]["price"]:
                    result[-1] = swing
                elif swing["type"] == "low" and swing["price"] < result[-1]["price"]:
                    result[-1] = swing
            else:
                result.append(swing)
        return result

    def _is_decreasing(self, contractions: list[dict]) -> bool:
        if len(contractions) < self.rules.minimum_contractions:
            return False
        values = [item["contraction_percent"] for item in contractions]
        return all(
            current <= previous * (1 - self.rules.decreasing_tolerance_percent / 100)
            for previous, current in zip(values, values[1:])
        )

    def _volume_dry_up(self, contractions: list[dict]) -> bool:
        if len(contractions) < self.rules.minimum_contractions:
            return False
        return contractions[-1]["average_volume"] <= contractions[0]["average_volume"] * self.rules.volume_dry_up_ratio

    @staticmethod
    def _not_found(reason: str) -> dict:
        return {
            "found": False,
            "lookback_weeks": 20,
            "contraction_count": 0,
            "contractions": [],
            "decreasing_contractions": False,
            "volume_dry_up": False,
            "contraction_durations_valid": False,
            "breakout_volume_ratio": None,
            "breakout_volume_confirmed": False,
            "pivot_breakout": False,
            "pivot_price": None,
            "pivot_date": None,
            "pivot_distance_percent": None,
            "reason": reason,
        }
