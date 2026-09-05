import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.data.providers.yahoo_provider import YahooFinanceProvider
from app.data.providers.universe_provider import NasdaqUniverseProvider
from app.screening.screening_service import ScreeningService
from app.strategy.sepa_strategy import SepaStrategy


DEFAULT_SYMBOLS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA", "GOOGL",
    "LLY", "NOW", "CMG", "SMCI",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run SEPA screening with live Yahoo Finance data")
    parser.add_argument("symbols", nargs="*", default=DEFAULT_SYMBOLS)
    parser.add_argument("--output-dir", default="../data/exports", help="Directory for JSON and CSV output")
    parser.add_argument("--universe", action="store_true", help="Scan the Nasdaq stock universe instead of named symbols")
    parser.add_argument("--min-price", type=float, default=10.0, help="Minimum latest price for universe mode")
    parser.add_argument("--min-volume", type=int, default=250_000, help="Minimum 15-day average volume for universe mode")
    parser.add_argument("--min-market-cap", type=float, default=300_000_000, help="Minimum market capitalization")
    parser.add_argument("--max-market-cap", type=float, default=30_000_000_000, help="Exclusive maximum market capitalization")
    parser.add_argument("--max-symbols", type=int, default=0, help="Optional cap for testing (0 means no cap)")
    parser.add_argument("--history-period", choices=["1y", "2y"], default="2y", help="Yahoo historical download period")
    return parser.parse_args()


def write_outputs(results: list[dict], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_json_path = output_dir / f"sepa_screening_all_{timestamp}.json"
    archive_csv_path = output_dir / f"sepa_screening_all_{timestamp}.csv"
    json_path = output_dir / f"sepa_screening_{timestamp}.json"
    csv_path = output_dir / f"sepa_screening_{timestamp}.csv"
    vcp_results = [
        result for result in results
        if result.get("passed") is True
        and result.get("vcp", {}).get("found") is True
        and result.get("vcp", {}).get("volume_dry_up") is True
    ]

    archive_payload = {
        "provider": "YahooFinanceProvider",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "strategy": "SEPA Trend Template",
        "strategy_version": SepaStrategy.version,
        "result_count": len(results),
        "candidate_count": len(vcp_results),
        "results": results,
    }
    archive_json_path.write_text(json.dumps(archive_payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    candidate_payload = {**archive_payload, "results": vcp_results}
    json_path.write_text(json.dumps(candidate_payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")

    condition_keys = list(SepaStrategy.condition_labels)
    fieldnames = ["symbol", "score", "max_score", "passed", "current_price", "volume_ratio", "rs_score", "vcp_found", "vcp_contraction_count", "vcp_volume_dry_up", "vcp_breakout_volume_ratio", "vcp_breakout_volume_confirmed", "vcp_pivot_breakout", "vcp_pivot_price", "vcp_pivot_date", *condition_keys, "error"]
    def write_csv(path: Path, rows: list[dict]) -> None:
        with path.open("w", newline="", encoding="utf-8-sig") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            for result in rows:
                row = {key: result.get(key, "") for key in fieldnames}
                vcp = result.get("vcp", {})
                row.update({
                    "vcp_found": "발견" if vcp.get("found") else "미발견",
                    "vcp_contraction_count": vcp.get("contraction_count", ""),
                    "vcp_volume_dry_up": "통과" if vcp.get("volume_dry_up") else "미달",
                    "vcp_breakout_volume_ratio": vcp.get("breakout_volume_ratio", ""),
                    "vcp_breakout_volume_confirmed": "통과" if vcp.get("breakout_volume_confirmed") else "미달",
                    "vcp_pivot_breakout": "돌파" if vcp.get("pivot_breakout") else "미돌파",
                    "vcp_pivot_price": vcp.get("pivot_price", ""),
                    "vcp_pivot_date": vcp.get("pivot_date", ""),
                })
                row.update({key: "통과" if result.get("conditions", {}).get(key) else "미달" for key in condition_keys})
                writer.writerow(row)

    write_csv(archive_csv_path, results)
    write_csv(csv_path, vcp_results)
    return json_path, csv_path


def print_results(results: list[dict]) -> None:
    print("\n실제 Yahoo Finance 데이터 기반 SEPA 스크리닝")
    print("조건: 9개 중 7개 이상 통과 (Yahoo Finance 호출 제한 시 해당 종목은 오류로 기록)")
    print("=" * 110)
    print(f"{'종목':<7} {'점수':<7} {'판정':<7} {'현재가':>12} {'거래량비':>9} {'RS':>7} {'VCP':>7} {'피벗':>10}  미충족 조건")
    print("-" * 110)
    for result in results:
        failed = ", ".join(result.get("failed_conditions", [])) or "없음"
        price = result.get("current_price", "-")
        price_text = f"{price:.2f}" if isinstance(price, (int, float)) else str(price)
        vcp = result.get("vcp", {})
        pivot_text = f"{vcp['pivot_price']:.2f}" if isinstance(vcp.get("pivot_price"), (int, float)) else "-"
        print(
            f"{result['symbol']:<7} {result['score']}/{result.get('max_score', 9):<5} "
            f"{'통과' if result.get('passed') else '미달':<7} {price_text:>12} "
            f"{str(result.get('volume_ratio', '-')):>9} {str(result.get('rs_score', '-')):>7} "
            f"{'발견' if vcp.get('found') else '-':>7} {pivot_text:>10}  {failed}"
        )
        if vcp.get("found"):
            print(f"         - VCP: {vcp['contraction_count']}회 수축, 거래량 감소 {'통과' if vcp.get('volume_dry_up') else '미달'}, 수축 기간 {'통과' if vcp.get('contraction_durations_valid') else '미달'}")
            print(f"         - 피벗일 {vcp['pivot_date']}, 피벗 대비 현재가 {vcp['pivot_distance_percent']}%, 돌파 {'통과' if vcp.get('pivot_breakout') else '미돌파'}, 돌파 거래량 {vcp.get('breakout_volume_ratio', '-')}배")
        for condition in result.get("condition_table", []):
            print(f"         - {condition['condition']}: {condition['status']}")
    print("=" * 110)


def main() -> int:
    args = parse_args()
    if args.universe:
        universe = NasdaqUniverseProvider().get_stocks()
        price_symbols = NasdaqUniverseProvider.filter_common_stocks(
            universe, args.min_price, args.min_market_cap, args.max_market_cap
        )
        latest_metrics = YahooFinanceProvider().get_latest_metrics(price_symbols)
        symbols = sorted(
            symbol for symbol, metrics in latest_metrics.items()
            if metrics["price"] >= args.min_price and metrics["average_volume_15"] >= args.min_volume
        )
        if args.max_symbols:
            symbols = symbols[:args.max_symbols]
        print(f"전체 종목 목록: {len(universe)}개")
        print(
            f"시가총액 ${args.min_market_cap:,.0f} 이상 ${args.max_market_cap:,.0f} 미만 및 "
            f"가격 ${args.min_price:.2f} 이상: {len(price_symbols)}개"
        )
        print(f"15일 평균 거래량 {args.min_volume:,} 이상: {len(symbols)}개")
    else:
        symbols = args.symbols
    service = ScreeningService(YahooFinanceProvider(period=args.history_period), SepaStrategy())
    results = service.screen(symbols)
    print_results(results)
    json_path, csv_path = write_outputs(results, Path(args.output_dir))
    print(f"\nJSON 저장: {json_path.resolve()}")
    print(f"CSV 저장:  {csv_path.resolve()}")
    return 0 if results else 1


if __name__ == "__main__":
    sys.exit(main())
