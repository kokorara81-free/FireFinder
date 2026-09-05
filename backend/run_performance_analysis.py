import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from app.analysis.performance import analyze_result, parse_generated_date
from app.data.providers.yahoo_provider import YahooFinanceProvider


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Analyze forward performance of archived SEPA results")
    parser.add_argument("input", type=Path, help="Archived JSON file or directory containing sepa_screening_all_*.json files")
    parser.add_argument("--output", type=Path, help="Output JSON path")
    parser.add_argument("--output-dir", type=Path, help="Output directory when input is a directory")
    return parser.parse_args()


def load_payloads(input_path: Path) -> list[tuple[Path, dict]]:
    paths = [input_path] if input_path.is_file() else sorted(input_path.glob("sepa_screening_all_*.json"))
    if not paths:
        raise FileNotFoundError(f"No archived screening files found in {input_path}")
    return [(path, json.loads(path.read_text(encoding="utf-8"))) for path in paths]


def run_analysis(input_path: Path, provider: YahooFinanceProvider) -> list[dict]:
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
    return analyses


def main() -> int:
    args = parse_args()
    analyses = run_analysis(args.input, YahooFinanceProvider(period="2y"))
    output_dir = args.output_dir or args.input.parent
    output_dir.mkdir(parents=True, exist_ok=True)
    for analysis in analyses:
        source_path = Path(analysis["source_file"])
        output_path = args.output or output_dir / f"performance_{source_path.stem}.json"
        payload = {**analysis, "generated_at": datetime.now(timezone.utc).isoformat()}
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"분석 결과 저장: {output_path.resolve()}")
        print(f"분석 종목 수: {len(payload['results'])}, 오류: {len(payload['errors'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())