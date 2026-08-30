import os
import smtplib
from email.message import EmailMessage
from pathlib import Path


def required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} environment variable is required")
    return value


def latest_csv(export_directory: Path) -> Path:
    csv_files = list(export_directory.glob("sepa_screening_*.csv"))
    if not csv_files:
        raise RuntimeError(f"No screening CSV found in {export_directory}")
    return max(csv_files, key=lambda file_path: file_path.stat().st_mtime)


def main() -> None:
    sender = required_environment("GMAIL_USERNAME")
    app_password = required_environment("GMAIL_APP_PASSWORD")
    recipients = [address.strip() for address in required_environment("REPORT_RECIPIENT").split(",") if address.strip()]
    report_path = latest_csv(Path(os.getenv("SCREENING_EXPORT_DIR", "data/exports")))

    message = EmailMessage()
    message["Subject"] = "FireFinder Nasdaq SEPA screening report"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content("Attached is the latest FireFinder Nasdaq SEPA screening CSV report.")
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