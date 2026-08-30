from dataclasses import dataclass
from statistics import mean

from app.core.config import settings
from app.strategy.base import ScreeningStrategy


@dataclass(frozen=True)
class SepaRules:
    min_score: int = settings.sepa_min_score
    min_volume_ratio: float = settings.sepa_min_volume_ratio
    max_distance_from_high: float = 0.25
    min_rise_from_low: float = 0.30
    min_rs_score: float = 50.0
    rs_1_month_weight: float = settings.rs_1_month_weight
    rs_3_month_weight: float = settings.rs_3_month_weight
    rs_6_month_weight: float = settings.rs_6_month_weight


class SepaStrategy(ScreeningStrategy):
    name = "SEPA Trend Template"
    version = "0.5"

    condition_labels = {
        "price_above_150_day_average": ("현재가 > 150일 이동평균", "현재가가 150일 이동평균 위인지 확인"),
        "price_above_200_day_average": ("현재가 > 200일 이동평균", "현재가가 200일 이동평균 위인지 확인"),
        "average_50_above_150": ("50일선 > 150일선", "50일 이동평균이 150일 이동평균 위인지 확인"),
        "average_150_above_200": ("150일선 > 200일선", "150일 이동평균이 200일 이동평균 위인지 확인"),
        "average_200_rising": ("200일선 상승", "200일 이동평균이 이전 구간보다 상승 중인지 확인"),
        "near_52_week_high": ("52주 고가 근접", "현재가가 52주 고가의 75% 이상인지 확인"),
        "above_52_week_low": ("52주 저가 대비 상승", "현재가가 52주 저가보다 30% 이상 높은지 확인"),
        "volume_support": ("거래량 지지", "최근 거래량이 50일 평균 이상인지 확인"),
        "relative_strength_vs_spy": ("시장 지수 대비 RS 강세", "SPY 대비 최근 6개월 수익률이 강한지 확인"),
    }

    def __init__(self, rules: SepaRules | None = None):
        self.rules = rules or SepaRules()

    def evaluate(self, prices: list[dict], benchmark_prices: list[dict] | None = None) -> dict:
        if len(prices) < 200:
            return {
                "passed": False,
                "score": 0,
                "max_score": 9,
                "conditions": {"enough_history": False},
                "error": "At least 200 trading sessions are required",
            }

        closes = [row["close"] for row in prices]
        volumes = [row["volume"] for row in prices]
        average_50 = mean(closes[-50:])
        average_150 = mean(closes[-150:])
        average_200 = mean(closes[-200:])
        current_price = closes[-1]
        high_52_week = max(closes[-252:]) if len(closes) >= 252 else max(closes)
        low_52_week = min(closes[-252:]) if len(closes) >= 252 else min(closes)
        previous_200_average = mean(closes[-220:-200])
        current_volume_ratio = volumes[-1] / mean(volumes[-50:]) if mean(volumes[-50:]) else 0
        rs_score, rs_periods = self._relative_strength_score(prices, benchmark_prices, self.rules)
        conditions = {
            "price_above_150_day_average": current_price > average_150,
            "price_above_200_day_average": current_price > average_200,
            "average_50_above_150": average_50 > average_150,
            "average_150_above_200": average_150 > average_200,
            "average_200_rising": average_200 > previous_200_average,
            "near_52_week_high": current_price >= high_52_week * (1 - self.rules.max_distance_from_high),
            "above_52_week_low": current_price >= low_52_week * (1 + self.rules.min_rise_from_low),
            "volume_support": current_volume_ratio >= self.rules.min_volume_ratio,
            "relative_strength_vs_spy": rs_score >= self.rules.min_rs_score,
        }
        score = sum(conditions.values())
        condition_table = [
            {
                "key": key,
                "condition": self.condition_labels[key][0],
                "기준": self.condition_labels[key][1],
                "status": "통과" if passed else "미달",
                "passed": passed,
            }
            for key, passed in conditions.items()
        ]
        return {
            "passed": score >= self.rules.min_score,
            "score": score,
            "max_score": len(conditions),
            "current_price": current_price,
            "average_50": round(average_50, 2),
            "average_150": round(average_150, 2),
            "average_200": round(average_200, 2),
            "volume_ratio": round(current_volume_ratio, 2),
            "rs_score": round(rs_score, 2),
            "rs_periods": rs_periods,
            "failed_conditions": [name for name, passed in conditions.items() if not passed],
            "conditions": conditions,
            "condition_table": condition_table,
        }

    @staticmethod
    def _relative_strength_score(
        prices: list[dict], benchmark_prices: list[dict] | None, rules: SepaRules
    ) -> tuple[float, dict]:
        if not benchmark_prices or len(prices) < 127 or len(benchmark_prices) < 127:
            return 0.0, {}

        periods = {"1m": 21, "3m": 63, "6m": 126}
        weights = {"1m": rules.rs_1_month_weight, "3m": rules.rs_3_month_weight, "6m": rules.rs_6_month_weight}
        relative_returns = {}
        for name, sessions in periods.items():
            stock_return = prices[-1]["close"] / prices[-sessions - 1]["close"] - 1
            benchmark_return = benchmark_prices[-1]["close"] / benchmark_prices[-sessions - 1]["close"] - 1
            relative_returns[name] = stock_return - benchmark_return

        weight_total = sum(weights.values())
        weighted_relative_return = sum(relative_returns[name] * weights[name] for name in periods) / weight_total
        score = max(0.0, min(100.0, 50.0 + weighted_relative_return * 100.0))
        return score, {
            name: {
                "weight": weights[name],
                "relative_return_percent": round(relative_returns[name] * 100, 2),
            }
            for name in periods
        }
