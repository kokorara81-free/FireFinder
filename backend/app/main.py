from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from app.api.routes.health import router as health_router
from app.api.routes.screening import router as screening_router

app = FastAPI(title="FireFinder", version="0.1.0")

app.include_router(health_router, prefix="/api")
app.include_router(screening_router, prefix="/api")


@app.get("/", response_class=HTMLResponse)
def screening_dashboard():
		return """
		<!doctype html>
		<html lang="ko">
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1">
			<title>FireFinder SEPA 스크리닝</title>
			<style>
				body { font-family: Arial, sans-serif; margin: 24px; color: #17202a; }
				h1 { margin-bottom: 6px; }
				.meta { color: #5d6d7e; margin-bottom: 18px; }
				.status { margin: 12px 0; min-height: 24px; }
				table { border-collapse: collapse; width: 100%; min-width: 1050px; }
				th, td { border: 1px solid #d5d8dc; padding: 8px; text-align: center; white-space: nowrap; }
				th { background: #1f618d; color: white; }
				td:first-child, th:first-child { position: sticky; left: 0; background: #f4f6f7; color: #17202a; font-weight: bold; }
				th:first-child { background: #1f618d; color: white; }
				.pass { color: #117a65; font-weight: bold; }
				.fail { color: #c0392b; font-weight: bold; }
				.table-wrap { overflow-x: auto; }
			</style>
		</head>
		<body>
			<h1>FireFinder SEPA 스크리닝</h1>
			<div class="meta">실제 Yahoo Finance 데이터 · 9개 조건 중 7개 이상 통과</div>
			<div id="status" class="status">데이터를 불러오는 중...</div>
			<div class="table-wrap">
				<table id="results"><thead><tr>
					<th>종목</th><th>점수</th><th>판정</th><th>현재가</th><th>RS 점수</th>
					<th>150일선 위</th><th>200일선 위</th><th>50일선 > 150일선</th>
					<th>150일선 > 200일선</th><th>200일선 상승</th><th>52주 고가 근접</th>
					<th>52주 저가 대비 상승</th><th>거래량 지지</th>
					<th>시장 지수 대비 RS 강세</th>
				</tr></thead><tbody></tbody></table>
			</div>
			<script>
				const conditionKeys = [
					'price_above_150_day_average', 'price_above_200_day_average',
					'average_50_above_150', 'average_150_above_200', 'average_200_rising',
					'near_52_week_high', 'above_52_week_low', 'volume_support'
					, 'relative_strength_vs_spy'
				];
				async function loadResults() {
					const response = await fetch('/api/screening/preview?symbols=AAPL&symbols=MSFT&symbols=NVDA&symbols=AMZN&symbols=META&symbols=TSLA&symbols=GOOGL&symbols=LLY&symbols=NOW&symbols=CMG&symbols=SMCI');
					if (!response.ok) throw new Error('HTTP ' + response.status);
					const payload = await response.json();
					const body = document.querySelector('#results tbody');
					body.innerHTML = payload.results.map(result => {
						const status = value => value ? '<span class="pass">통과</span>' : '<span class="fail">미달</span>';
						const conditions = result.conditions || {};
						return '<tr><td>' + result.symbol + '</td><td>' + result.score + '/' + result.max_score +
							'</td><td class="' + (result.passed ? 'pass' : 'fail') + '">' + (result.passed ? '통과' : '미달') +
							'</td><td>' + (result.current_price ? '$' + result.current_price.toFixed(2) : '-') + '</td><td>' +
							(result.rs_score !== undefined ? result.rs_score.toFixed(2) : '-') + '</td>' +
							conditionKeys.map(key => '<td>' + status(conditions[key]) + '</td>').join('') + '</tr>';
					}).join('');
					document.querySelector('#status').textContent = payload.provider + ' 조회 완료';
				}
				loadResults().catch(error => document.querySelector('#status').textContent = '조회 실패: ' + error.message);
			</script>
		</body>
		</html>
		"""
