import os
import smtplib
from collections import Counter
from email.message import EmailMessage
import json
from pathlib import Path


def required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} environment variable is required")
    return value


def analysis_csv(analysis_directory: Path) -> Path:
    report_path = analysis_directory / "listing_history.csv"
    if not report_path.is_file():
        raise RuntimeError(f"No listing history CSV found in {analysis_directory}")
    return report_path


def listing_summary(analysis_directory: Path) -> str:
    history_path = analysis_directory / "listing_history.json"
    if not history_path.is_file():
        return "SEPA 통과 종목 요약을 계산할 History JSON이 없습니다."

    history = json.loads(history_path.read_text(encoding="utf-8"))
    latest_date = max(
        (
            observation.get("date")
            for symbol_history in history.get("symbols", [])
            for observation in symbol_history.get("observations", [])
            if observation.get("date")
        ),
        default=None,
    )
    if not latest_date:
        return "SEPA 통과 종목 요약: 데이터 없음"

    latest_passed = []
    for symbol_history in history.get("symbols", []):
        observation = next(
            (
                item for item in symbol_history.get("observations", [])
                if item.get("date") == latest_date
            ),
            None,
        )
        if observation and observation.get("passed") is True:
            latest_passed.append(observation)

    sector_counts = Counter(observation.get("sector") or "미분류" for observation in latest_passed)
    industry_counts = Counter(observation.get("industry") or "미분류" for observation in latest_passed)

    def format_counts(counts: Counter[str]) -> str:
        if not counts:
            return "없음"
        return ", ".join(
            f"{name}: {count}개"
            for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        )

    return "\n".join([
        f"최신 스크리닝 날짜: {latest_date}",
        f"SEPA 통과 종목: {len(latest_passed)}개",
        f"섹터별 통과 수: {format_counts(sector_counts)}",
        f"산업군별 통과 수: {format_counts(industry_counts)}",
    ])


def main() -> None:
    sender = required_environment("GMAIL_USERNAME")
    app_password = "".join(required_environment("GMAIL_APP_PASSWORD").split())
    recipients = [
        address.strip()
        for address in required_environment("REPORT_RECIPIENT").split(",")
        if address.strip()
    ]
    if not recipients:
        raise RuntimeError("REPORT_RECIPIENT must contain at least one email address")
    analysis_directory = Path(os.getenv("ANALYSIS_EXPORT_DIR", "data/performance-analysis"))
    report_path = analysis_csv(analysis_directory)

    message = EmailMessage()
    message["Subject"] = "FireFinder screening analysis report"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content(
        "FireFinder 스크리닝 분석 리포트입니다.\n\n"
        f"{listing_summary(analysis_directory)}\n\n"
        "상세 History는 첨부된 CSV 파일을 확인해 주세요."
    )
    message.add_attachment(
        report_path.read_bytes(),
        maintype="text",
        subtype="csv",
        filename=report_path.name,
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(sender, app_password)
        refused_recipients = smtp.send_message(message)
    if refused_recipients:
        raise RuntimeError(f"Gmail rejected recipient(s): {', '.join(refused_recipients)}")
    print(f"Gmail accepted analysis CSV for: {', '.join(recipients)} ({report_path.name})")


if __name__ == "__main__":
    main()
