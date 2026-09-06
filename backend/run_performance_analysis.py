import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.analysis.performance import analyze_listing_history, analyze_result, merge_listing_history, parse_generated_date
from app.data.providers.yahoo_provider import YahooFinanceProvider


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze forward performance of archived SEPA results")
    parser.add_argument("input", type=Path, nargs="?", help="Archived JSON file or directory containing screening result files")
    parser.add_argument("--output", type=Path, help="Output JSON path")
    parser.add_argument("--output-dir", type=Path, help="Output directory when input is a directory")
    parser.add_argument("--history-file", type=Path, help="Previous listing_history.json for incremental history updates")
    parser.add_argument("--screening-file", type=Path, help="Latest sepa_screening_all_*.json for incremental history updates")
    return parser.parse_args()


def load_payloads(input_path: Path) -> list[tuple[Path, dict]]:
    if input_path.is_file():
        paths = [input_path]
    else:
        paths = sorted(input_path.glob("sepa_screening_all_*.json"))
        if not paths:
            paths = sorted(
                path for path in input_path.glob("sepa_screening_*.json")
                if "_all_" not in path.name
            )
            if paths:
                print("경고: 전체 결과 파일이 없어 구형 후보 리포트로 제한 분석합니다.")
    if not paths:
        raise FileNotFoundError(f"No archived screening files found in {input_path}")
    return [(path, json.loads(path.read_text(encoding="utf-8"))) for path in paths]


def run_analysis(input_path: Path, provider: YahooFinanceProvider) -> tuple[list[dict], dict[str, list[dict]]]:
    payloads = load_payloads(input_path)
    symbols = sorted({
        result["symbol"]
        for _, payload in payloads
        for result in payload.get("results", [])
        if result.get("current_price") is not None
    })
    price_data = provider.get_daily_prices_batch(symbols, periods=260) if symbols else {}
    analyses = []
    for source_path, payload in payloads:
        generated_date = parse_generated_date(payload["generated_at"])
        results = []
        errors = {}
        for result in payload.get("results", []):
            symbol = result.get("symbol")
            if not symbol or result.get("current_price") is None:
                continue
            prices = price_data.get(symbol, [])
            if not prices:
                errors[symbol] = "No daily price data returned"
                continue
            results.append(analyze_result(result, generated_date, prices))
        analyses.append({
            "source_file": str(source_path),
            "screening_generated_at": payload["generated_at"],
            "periods": {"weekly": 5, "monthly": 21, "quarterly": 63},
            "results": results,
            "errors": errors,
        })
    return analyses, price_data


def current_returns_since_last_listed(listing_history: dict, price_data: dict[str, list[dict]]) -> dict[str, float | None]:
    returns = {}
    for symbol_history in listing_history["symbols"]:
        symbol = symbol_history["symbol"]
        last_listed_date = symbol_history.get("last_listed_date")
        prices = price_data.get(symbol, [])
        baseline_prices = [row for row in prices if str(row["date"]) <= (last_listed_date or "")]
        if not last_listed_date or not baseline_prices or not prices:
            returns[symbol] = None
            continue
        baseline = max(baseline_prices, key=lambda row: row["date"])
        latest = max(prices, key=lambda row: row["date"])
        baseline_close = float(baseline["close"])
        returns[symbol] = round((float(latest["close"]) / baseline_close - 1) * 100, 2) if baseline_close else None
    return returns


def write_listing_history(
    listing_history: dict,
    output_dir: Path,
    current_returns: dict[str, float | None],
) -> None:
    listing_history_path = output_dir / "listing_history.json"
    listing_history_path.write_text(json.dumps(listing_history, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"리스트업 이력 저장: {listing_history_path.resolve()}")
    print(f"리스트업 이력 종목 수: {len(listing_history['symbols'])}")
    listing_history_csv_path = output_dir / "listing_history.csv"
    fieldnames = [
        "symbol", "first_seen_date", "first_listed_date", "last_listed_date", "return_since_last_listed_percent", "listed_count",
        "current_streak", "longest_streak", "reentries", "latest_date", "latest_score", "latest_volume_ratio",
        "latest_rs_score", "latest_passed",
        "vcp_analyzed", "vcp_found", "vcp_contraction_count", "vcp_volume_dry_up",
        "vcp_breakout_volume_ratio", "vcp_breakout_volume_confirmed", "vcp_pivot_breakout",
        "vcp_pivot_price", "vcp_pivot_date", "vcp_pivot_distance_percent", "vcp_reason",
        "dropout_count", "dropout_dates", "score_history", "score_changes",
    ]
    with listing_history_csv_path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writerow({
            "symbol": "티커",
            "first_seen_date": "스크리닝 결과에 처음 등장한 날짜",
            "first_listed_date": "SEPA 통과가 처음 기록된 날짜",
            "last_listed_date": "SEPA 통과가 가장 최근 기록된 날짜",
            "return_since_last_listed_percent": "last_listed_date 종가 대비 분석 시점 최신 종가 수익률(%)",
            "listed_count": "SEPA 통과 횟수",
            "current_streak": "현재 연속 통과 횟수",
            "longest_streak": "최장 연속 통과 횟수",
            "reentries": "탈락 후 재진입 횟수",
            "latest_date": "가장 최근 스크리닝 날짜",
            "latest_score": "가장 최근 SEPA 점수",
            "latest_volume_ratio": "가장 최근 거래량 대 평균 거래량 비율",
            "latest_rs_score": "가장 최근 SPY 대비 상대강도 점수",
            "latest_passed": "가장 최근 SEPA 통과 여부",
            "vcp_analyzed": "최신 결과에서 VCP 분석을 수행했는지 여부",
            "vcp_found": "최신 VCP 발견 여부",
            "vcp_contraction_count": "최신 VCP 수축 횟수",
            "vcp_volume_dry_up": "최신 VCP 거래량 감소 여부",
            "vcp_breakout_volume_ratio": "최신 VCP 돌파 거래량 비율",
            "vcp_breakout_volume_confirmed": "최신 VCP 돌파 거래량 확인 여부",
            "vcp_pivot_breakout": "최신 VCP 피벗 돌파 여부",
            "vcp_pivot_price": "최신 VCP 피벗 가격",
            "vcp_pivot_date": "최신 VCP 피벗 날짜",
            "vcp_pivot_distance_percent": "현재가의 피벗 대비 거리(%)",
            "vcp_reason": "최신 VCP 판정 사유",
            "dropout_count": "SEPA 탈락 횟수",
            "dropout_dates": "SEPA 탈락 날짜 목록",
            "score_history": "날짜별 SEPA 점수",
            "score_changes": "SEPA 점수 변경 이력",
        })
        writer.writeheader()
        for symbol_history in listing_history["symbols"]:
            observations = symbol_history["observations"]
            latest_vcp = symbol_history.get("latest_vcp") or {}
            writer.writerow({
                "symbol": symbol_history["symbol"],
                "first_seen_date": symbol_history.get("first_seen_date") or "",
                "first_listed_date": symbol_history["first_listed_date"] or "",
                "last_listed_date": symbol_history["last_listed_date"] or "",
                "return_since_last_listed_percent": current_returns.get(symbol_history["symbol"], ""),
                "listed_count": symbol_history["listed_count"],
                "current_streak": symbol_history["current_streak"],
                "longest_streak": symbol_history["longest_streak"],
                "reentries": symbol_history["reentries"],
                "latest_date": observations[-1]["date"] if observations else "",
                "latest_score": observations[-1]["score"] if observations else "",
                "latest_volume_ratio": observations[-1].get("volume_ratio", "") if observations else "",
                "latest_rs_score": observations[-1].get("rs_score", "") if observations else "",
                "latest_passed": observations[-1]["passed"] if observations else "",
                "vcp_analyzed": bool(latest_vcp) and latest_vcp.get("reason") != "SEPA 기준 미통과로 VCP 분석 생략",
                "vcp_found": latest_vcp.get("found", ""),
                "vcp_contraction_count": latest_vcp.get("contraction_count", ""),
                "vcp_volume_dry_up": latest_vcp.get("volume_dry_up", ""),
                "vcp_breakout_volume_ratio": latest_vcp.get("breakout_volume_ratio", ""),
                "vcp_breakout_volume_confirmed": latest_vcp.get("breakout_volume_confirmed", ""),
                "vcp_pivot_breakout": latest_vcp.get("pivot_breakout", ""),
                "vcp_pivot_price": latest_vcp.get("pivot_price", ""),
                "vcp_pivot_date": latest_vcp.get("pivot_date", ""),
                "vcp_pivot_distance_percent": latest_vcp.get("pivot_distance_percent", ""),
                "vcp_reason": latest_vcp.get("reason", ""),
                "dropout_count": len(symbol_history["dropouts"]),
                "dropout_dates": ";".join(dropout["date"] for dropout in symbol_history["dropouts"]),
                "score_history": ";".join(
                    f"{observation['date']}:{observation['score']}" for observation in observations
                ),
                "score_changes": ";".join(
                    f"{change['from_date']}->{change['to_date']}:{change['change']}"
                    for change in symbol_history["score_changes"]
                ),
            })
    print(f"리스트업 CSV 저장: {listing_history_csv_path.resolve()}")


def main() -> int:
    args = parse_args()
    if args.screening_file:
        if not args.screening_file.is_file():
            raise FileNotFoundError(f"Screening file not found: {args.screening_file}")
        payload = json.loads(args.screening_file.read_text(encoding="utf-8"))
        previous = (
            json.loads(args.history_file.read_text(encoding="utf-8"))
            if args.history_file and args.history_file.is_file()
            else {"symbols": []}
        )
        listing_history = merge_listing_history(previous, payload)
        analyses, price_data = run_analysis(args.screening_file, YahooFinanceProvider(period="2y"))
        output_dir = args.output_dir or args.screening_file.parent
    else:
        if not args.input:
            raise ValueError("input or --screening-file is required")
        analyses, price_data = run_analysis(args.input, YahooFinanceProvider(period="2y"))
        output_dir = args.output_dir or args.input.parent
        payloads = load_payloads(args.input)
        listing_history = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source": str(args.input),
            "listing_definition": "result.passed == true",
            "symbols": analyze_listing_history(payloads),
        }
    output_dir.mkdir(parents=True, exist_ok=True)
    for analysis in analyses:
        source_path = Path(analysis["source_file"])
        output_path = args.output or output_dir / f"performance_{source_path.stem}.json"
        payload = {**analysis, "generated_at": datetime.now(timezone.utc).isoformat()}
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"분석 결과 저장: {output_path.resolve()}")
        print(f"분석 종목 수: {len(payload['results'])}, 오류: {len(payload['errors'])}")
    write_listing_history(listing_history, output_dir, current_returns_since_last_listed(listing_history, price_data))
    return 0


if __name__ == "__main__":
    sys.exit(main())