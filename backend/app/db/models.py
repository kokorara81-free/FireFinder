"""SQLAlchemy schema for FireFinder's historical screening dataset.

The comments on tables and columns are part of the data contract used by
future analytics and AI-generated SQL. Dates are market dates, not calendar
periods, and return horizons are measured in trading sessions.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Symbol(Base):
    __tablename__ = "symbols"
    __table_args__ = {"comment": "Master data for one tradable ticker. One row per ticker; sector and industry describe the latest known classification."}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal surrogate key used by foreign keys.")
    ticker: Mapped[str] = mapped_column(String(16), unique=True, index=True, comment="Uppercase market ticker, for example NVDA.")
    company_name: Mapped[str] = mapped_column(String(200), comment="Company display name. May initially equal ticker when unavailable.")
    exchange: Mapped[str | None] = mapped_column(String(32), nullable=True, comment="Exchange or market identifier when available.")
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="Latest provider classification sector; NULL means unavailable at ingestion time.")
    industry: Mapped[str | None] = mapped_column(String(150), nullable=True, comment="Latest provider classification industry; NULL means unavailable at ingestion time.")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="Whether this ticker should be considered active in future collection jobs.")


class DailyPrice(Base):
    __tablename__ = "daily_prices"
    __table_args__ = (
        UniqueConstraint("symbol_id", "trading_date", name="uq_daily_price_symbol_date"),
        {"comment": "Historical OHLCV observations used to calculate forward returns. One row represents one ticker on one trading date."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal price row identifier.")
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.id"), index=True, comment="Foreign key to symbols.id.")
    trading_date: Mapped[datetime] = mapped_column(Date, index=True, comment="NYSE trading date represented by this observation; weekends and holidays are absent.")
    open: Mapped[float] = mapped_column(Float, comment="Unadjusted session opening price in USD.")
    high: Mapped[float] = mapped_column(Float, comment="Unadjusted session high price in USD.")
    low: Mapped[float] = mapped_column(Float, comment="Unadjusted session low price in USD.")
    close: Mapped[float] = mapped_column(Float, comment="Unadjusted session closing price in USD.")
    adjusted_close: Mapped[float] = mapped_column(Float, comment="Split/dividend-adjusted closing price used for total-return style analysis.")
    volume: Mapped[int] = mapped_column(Integer, comment="Reported share volume for the trading session.")
    source: Mapped[str] = mapped_column(String(50), comment="Data provider name, normally YahooFinanceProvider.")


class ScreeningRun(Base):
    __tablename__ = "screening_runs"
    __table_args__ = {"comment": "One completed or attempted screening execution. Join screening_results.run_id to analyze a specific run."}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal screening run identifier.")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, comment="UTC timestamp when this run started.")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="UTC completion timestamp; NULL for an unfinished run.")
    screening_date: Mapped[date] = mapped_column(Date, index=True, comment="New York market date assigned to this screening; use this for daily grouping.")
    generated_at: Mapped[datetime] = mapped_column(DateTime, index=True, comment="UTC timestamp used to identify the source result archive.")
    provider: Mapped[str] = mapped_column(String(100), comment="Market data provider used for this run.")
    trigger_type: Mapped[str] = mapped_column(String(30), comment="How the run started, for example scheduled, manual, or import.")
    strategy_name: Mapped[str] = mapped_column(String(100), comment="Screening strategy name, currently SEPA Trend Template.")
    strategy_version: Mapped[str] = mapped_column(String(20), comment="Strategy version used to calculate the result.")
    status: Mapped[str] = mapped_column(String(20), default="running", comment="Run state, normally completed or running.")


class ScreeningResult(Base):
    __tablename__ = "screening_results"
    __table_args__ = (
        UniqueConstraint("run_id", "symbol_id", name="uq_screening_result_run_symbol"),
        {"comment": "Full result for one ticker in one screening run. This table intentionally includes passed and failed results for unbiased comparisons."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal screening result identifier.")
    run_id: Mapped[int] = mapped_column(ForeignKey("screening_runs.id"), index=True, comment="Foreign key to the screening execution.")
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.id"), index=True, comment="Foreign key to the ticker master row.")
    score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="SEPA conditions passed count for this ticker.")
    max_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Maximum available SEPA score for this strategy version.")
    passed: Mapped[bool] = mapped_column(Boolean, default=False, comment="Whether the ticker passed the configured SEPA threshold.")
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Price observed at screening time in USD.")
    volume_ratio: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Recent volume divided by the strategy's comparison average.")
    rs_score: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Relative-strength score versus SPY calculated at screening time.")
    vcp_found: Mapped[bool | None] = mapped_column(Boolean, nullable=True, comment="Whether the VCP analyzer found a valid volatility contraction pattern.")
    conditions_json: Mapped[str | None] = mapped_column(Text, nullable=True, comment="JSON object of named SEPA condition booleans. Do not parse as numeric data.")
    vcp_json: Mapped[str | None] = mapped_column(Text, nullable=True, comment="JSON object containing VCP metrics and reasons.")
    raw_result_json: Mapped[str] = mapped_column(Text, comment="Original complete screening result JSON for fields not normalized into columns.")


class ScreeningReturn(Base):
    __tablename__ = "screening_returns"
    __table_args__ = (
        UniqueConstraint("screening_result_id", "horizon_sessions", name="uq_screening_return_horizon"),
        {"comment": "Forward performance calculated from one screening result. Horizon is measured in trading sessions, not calendar days."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal return row identifier.")
    screening_result_id: Mapped[int] = mapped_column(ForeignKey("screening_results.id"), index=True, comment="Foreign key to the screening result being evaluated.")
    horizon_sessions: Mapped[int] = mapped_column(Integer, comment="Number of trading sessions after screening, including 7, 15, 21, 30, 42, 63, and longer monthly horizons.")
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="Actual trading date reached at the requested horizon; NULL while pending.")
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Price at target_date in USD; NULL while pending.")
    return_percent: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Forward return percentage: (target_price / screening_price - 1) * 100.")
    status: Mapped[str] = mapped_column(String(20), comment="complete when target data exists, otherwise pending.")


class TradeJournal(Base):
    __tablename__ = "trade_journal"
    __table_args__ = {"comment": "Optional user-managed trade journal; not used as an input to historical screening performance analysis unless explicitly requested."}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="Internal journal entry identifier.")
    symbol_id: Mapped[int] = mapped_column(ForeignKey("symbols.id"), index=True, comment="Foreign key to the ticker master row.")
    status: Mapped[str] = mapped_column(String(20), default="planned", comment="Journal state such as planned, open, or closed.")
    setup_type: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="User-defined setup category.")
    thesis: Mapped[str | None] = mapped_column(Text, nullable=True, comment="User's investment thesis; not an automated signal.")
    entry_reason: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Reason the user recorded for entering the trade.")
    planned_entry: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Planned entry price in USD.")
    stop_loss: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Planned stop price in USD.")
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True, comment="Planned target price in USD.")
    risk_amount: Mapped[float | None] = mapped_column(Float, nullable=True, comment="User-defined monetary risk amount.")
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="User-recorded UTC open timestamp.")
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="User-recorded UTC close timestamp.")
    result: Mapped[float | None] = mapped_column(Float, nullable=True, comment="User-recorded realized result; semantics depend on the user's journal entry.")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True, comment="Free-form user notes.")
