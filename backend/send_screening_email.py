import os
import smtplib
from collections import Counter
import csv
from email.message import EmailMessage
from pathlib import Path


def required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} environment variable is required")
    return value


def latest_csv(export_directory: Path) -> Path:
    csv_files = [
        path for path in export_directory.glob("sepa_screening_*.csv")
        if "_all_" not in path.name
    ]
    if not csv_files:
        raise RuntimeError(f"No screening CSV found in {export_directory}")
    return max(csv_files, key=lambda file_path: file_path.stat().st_mtime)


def sector_summary(report_path: Path) -> str:
    with report_path.open(encoding="utf-8-sig", newline="") as file:
        rows = csv.DictReader(file)
        sector_counts = Counter(
            row.get("sector") or "미분류"
            for row in rows
            if row.get("passed", "").strip().lower() == "true"
        )
    if not sector_counts:
        return "SEPA 통과 종목이 없습니다."
    return "\n".join(
        f"{sector}: {count}개"
        for sector, count in sorted(sector_counts.items(), key=lambda item: (-item[1], item[0]))
    )


def main() -> None:
    sender = required_environment("GMAIL_USERNAME")
    app_password = required_environment("GMAIL_APP_PASSWORD")
    recipients = [address.strip() for address in required_environment("REPORT_RECIPIENT").split(",") if address.strip()]
    report_path = latest_csv(Path(os.getenv("SCREENING_EXPORT_DIR", "data/exports")))

    message = EmailMessage()
    message["Subject"] = "FireFinder Nasdaq SEPA screening report"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content(sector_summary(report_path))
    message.add_attachment(
        report_path.read_bytes(),
        maintype="text",
        subtype="csv",
        filename=report_path.name,
    )

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(sender, app_password)
        smtp.send_message(message)


if __name__ == "__main__":
    main()