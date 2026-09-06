import os
import smtplib
from email.message import EmailMessage
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
    report_path = analysis_csv(Path(os.getenv("ANALYSIS_EXPORT_DIR", "data/performance-analysis")))

    message = EmailMessage()
    message["Subject"] = "FireFinder screening analysis report"
    message["From"] = sender
    message["To"] = ", ".join(recipients)
    message.set_content("Attached is the latest FireFinder screening analysis CSV report.")
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
