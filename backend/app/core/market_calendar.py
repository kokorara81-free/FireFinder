from datetime import date, datetime
from zoneinfo import ZoneInfo

import pandas_market_calendars as mcal


def is_us_trading_day(day: date) -> bool:
    calendar = mcal.get_calendar("NYSE")
    schedule = calendar.schedule(start_date=day, end_date=day)
    return not schedule.empty


if __name__ == "__main__":
    new_york_date = datetime.now(ZoneInfo("America/New_York")).date()
    print("open" if is_us_trading_day(new_york_date) else "closed")