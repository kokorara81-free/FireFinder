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
    if not sector_counts:
        return "SEPA 통과 종목이 없습니다."
    return "\n".join(
        f"{sector}: {count}개"
        for sector, count in sorted(sector_counts.items(), key=lambda item: (-item[1], item[0]))
    )


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
    message.set_content(listing_summary(analysis_directory))
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
