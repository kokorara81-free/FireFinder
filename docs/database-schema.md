# FireFinder Database Contract

This document is the semantic contract for SQLite data and for future AI-generated SQL. The SQLAlchemy comments in `backend/app/db/models.py` repeat these definitions at the code level.

## Time Rules

- `screening_runs.screening_date` is the New York market date. Group daily screening observations by this column.
- `screening_runs.generated_at`, `started_at`, and `completed_at` are UTC timestamps.
- `daily_prices.trading_date` and `screening_returns.target_date` are trading dates. Weekends and US market holidays do not have rows.
- `screening_results` has one row per `(screening_runs.id, symbols.id)`. Failed results are intentionally retained.
- `screening_returns.horizon_sessions` is a trading-session count: `10` = 2 weeks, `21` = 1 month, `30` = 1.5 months, `42` = 2 months, and `63` = 3 months.

## Relationships

```text
symbols 1 ─── * screening_results * ─── 1 screening_runs
symbols 1 ─── * daily_prices
screening_results 1 ─── * screening_returns
```

Join keys:

- `screening_results.symbol_id = symbols.id`
- `screening_results.run_id = screening_runs.id`
- `daily_prices.symbol_id = symbols.id`
- `screening_returns.screening_result_id = screening_results.id`

## Analysis Rules

- Use `screening_results.passed = 1` to select SEPA-passed observations.
- Use `screening_results.passed = 0` as the comparison group; do not remove failed results when measuring selection effect.
- `screening_results.score` is the number of passed SEPA conditions, and `max_score` is the available maximum for that strategy version.
- `screening_results.conditions_json` and `vcp_json` are JSON text for detailed fields. `raw_result_json` preserves the original full result.
- `screening_returns.return_percent` is calculated as `(target_price / screening_results.current_price - 1) * 100`.
- Ignore `screening_returns` rows with `status = 'pending'` when calculating realized performance.
- Always report sample size, average, median, and win rate together. A small group is descriptive, not conclusive.

## Example Questions

### Sector performance after 21 sessions

```sql
SELECT
    s.sector,
    COUNT(*) AS sample_count,
    AVG(sr.return_percent) AS average_return_percent,
    SUM(CASE WHEN sr.return_percent > 0 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) AS win_rate
FROM screening_returns AS sr
JOIN screening_results AS r ON r.id = sr.screening_result_id
JOIN symbols AS s ON s.id = r.symbol_id
WHERE sr.horizon_sessions = 21
  AND sr.status = 'complete'
  AND r.passed = 1
GROUP BY s.sector
ORDER BY average_return_percent DESC;
```

### SEPA pass versus fail

```sql
SELECT
    r.passed,
    COUNT(*) AS sample_count,
    AVG(sr.return_percent) AS average_return_percent
FROM screening_returns AS sr
JOIN screening_results AS r ON r.id = sr.screening_result_id
WHERE sr.horizon_sessions = 21
  AND sr.status = 'complete'
GROUP BY r.passed;
```

Future AI SQL should include the relevant horizon, `status = 'complete'`, `screening_date` range, and sample count. Do not use `listing_history` fields as a replacement for the event-level tables: History is a presentation summary, while `screening_results` is the analysis fact table.