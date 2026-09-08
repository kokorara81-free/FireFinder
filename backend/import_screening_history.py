import argparse
import json
from datetime import datetime
from pathlib import Path

from app.db.database import initialize_database
from app.db.repository import persist_performance_analysis, persist_screening_results


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import archived screening and performance JSON into SQLite")
    parser.add_argument("input_dir", type=Path, help="Directory containing screening JSON files")
    parser.add_argument("--performance-dir", type=Path, help="Directory containing performance JSON files")
    return parser.parse_args()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    args = parse_args()
    initialize_database()
    screening_paths = sorted(args.input_dir.glob("sepa_screening_all_*.json"))
    for path in screening_paths:
        payload = load_json(path)
        generated_at = datetime.fromisoformat(payload["generated_at"].replace("Z", "+00:00"))
        persist_screening_results(
            payload.get("results", []),
            generated_at,
            payload.get("provider", "unknown"),
            payload.get("strategy", "unknown"),
            payload.get("strategy_version", "unknown"),
            trigger_type="import",
        )
    performance_dir = args.performance_dir or args.input_dir
    performance_paths = sorted(performance_dir.glob("performance_*.json"))
    for path in performance_paths:
        persist_performance_analysis([load_json(path)])
    print(f"Imported screening files: {len(screening_paths)}")
    print(f"Imported performance files: {len(performance_paths)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())