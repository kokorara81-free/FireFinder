# FireFinder

미국 주식 시장 데이터를 수집하고 SEPA 관점의 후보 종목을 선별하며, 투자 판단과 매매 결과를 기록하기 위한 프로젝트입니다.

## 현재 포함된 기능

- FastAPI 기반 백엔드
- SQLite용 SQLAlchemy 모델
- 교체 가능한 시장 데이터 공급자 인터페이스
- 외부 API 없이 실행 가능한 모의 데이터 공급자
- 기본 SEPA 추세 템플릿 평가
- 종목 스크리닝 미리보기 API
- 설정 가능한 모의/Yahoo Finance 데이터 공급자
- 가격 데이터 수집 상태 API
- 9개 SEPA 조건별 통과/미달 결과
- SEPA 통과 종목에 대한 VCP 분석 및 피벗 가격
- 장 시작·마감 리포트 시간 설정의 기본값

## 실행

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

브라우저에서 다음 주소를 확인할 수 있습니다.

- `http://127.0.0.1:8000/api/health`
- `http://127.0.0.1:8000/api/screening/preview`
- `http://127.0.0.1:8000/api/screening/collect`
- `http://127.0.0.1:8000/docs`

## 실제 데이터 일괄 실행

백엔드 폴더에서 다음 PowerShell 명령으로 Yahoo Finance 데이터를 조회하고 SEPA 결과를 출력할 수 있습니다. 기본 종목은 주요 미국 주식 11개이며, 실행 결과는 `data/exports` 아래 JSON과 CSV로 저장됩니다.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
.\run_live_screening.ps1
```

미국 전체 종목 중 시가총액 3억 달러 이상, 가격 10달러 이상, ETF·비일반주식·OTC 제외 조건을 먼저 적용합니다. 이후 Yahoo Finance 최근 1개월 데이터에서 계산한 15일 평균 거래량이 250K 이상인 종목만 기본 2년 데이터로 SEPA 분석합니다. 2년 데이터는 장기 추세 확인과 향후 분석 확장에 사용합니다. 실행할 때 `sepa_screening_all_*.csv/json`에는 전체 스크리닝 결과가 저장되고, `sepa_screening_*.csv/json`에는 이메일용 VCP 후보만 저장됩니다. 두 종류의 파일은 모두 GitHub Actions에서 GCS로 업로드됩니다.

```powershell
python .\run_live_screening.py --universe
```

빠른 실행을 위해 과거 1년 데이터만 사용할 때는 다음처럼 선택합니다.

```powershell
python .\run_live_screening.py --universe --history-period 2y
```

테스트로 앞에서부터 20개만 실행하려면:

```powershell
python .\run_live_screening.py --universe --max-symbols 20
```

기준을 변경하려면:

```powershell
python .\run_live_screening.py --universe --min-price 10 --min-market-cap 300000000 --min-volume 250000
```

## GitHub Actions 클라우드 배치

GitHub Actions 워크플로는 매일 한국 시간 오전 6시와 오후 8시에 나스닥 유니버스 스크리닝을 실행합니다. GitHub Actions의 cron은 UTC 기준이므로 `21:00 UTC`(오전 6시 KST)와 `11:00 UTC`(오후 8시 KST)로 설정되어 있습니다. 실행 결과는 Git에 커밋하지 않고 Google Cloud Storage에 보관하며, CSV는 Gmail로 첨부 발송합니다. 성과 분석은 별도의 `SEPA Performance Analysis` 워크플로가 매일 실행하며, GCS의 과거 전체 스크리닝 결과를 내려받아 주간·월간·분기별 성과를 계산한 뒤 `performance-analysis/` 경로에 저장합니다. 과거에 생성된 `sepa_screening_*.json`만 있는 경우에는 구형 후보 리포트를 사용해 제한 분석하고 경고를 출력합니다. 이후 스크리닝 실행부터는 `sepa_screening_all_*.json`이 생성되어 전체 결과가 분석됩니다.

GitHub 저장소의 Settings > Secrets and variables > Actions에 다음 값을 등록합니다.

- Variable `GCS_BUCKET`: 결과를 저장할 Cloud Storage 버킷 이름
- Secret `GCP_WORKLOAD_IDENTITY_PROVIDER`: Google Cloud Workload Identity Provider 리소스 이름
- Secret `GCP_SERVICE_ACCOUNT`: Storage Object Creator 권한을 가진 Google Cloud 서비스 계정 이메일
- Secret `GMAIL_USERNAME`: 발송에 사용할 Gmail 주소
- Secret `GMAIL_APP_PASSWORD`: 해당 Gmail 계정의 2단계 인증 기반 앱 비밀번호
- Secret `REPORT_RECIPIENT`: CSV를 받을 이메일 주소. 여러 주소는 쉼표로 구분

Google Cloud 인증은 GitHub OIDC Workload Identity Federation을 사용하므로 서비스 계정 키 파일을 저장소나 GitHub Secret에 저장하지 않습니다. 서비스 계정에는 대상 버킷에 대한 `Storage Object Creator` 역할을 부여해야 합니다. GitHub Actions 화면의 `Run workflow`로 수동 실행해 인증과 이메일 설정을 먼저 확인할 수 있습니다.

Yahoo Finance의 호출 제한이 발생하면 프로그램은 해당 요청을 최대 3회 재시도하고, 계속 실패한 종목은 오류로 남긴 뒤 다음 종목을 계속 처리합니다. `Too Many Requests`가 반복되면 잠시 기다렸다가 다시 실행하고, 전체 시장 테스트 시에는 `--max-symbols 20`으로 먼저 연결 상태를 확인합니다.

웹 화면으로 보려면 별도 PowerShell 창에서 실행합니다.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
.\run_web.ps1
```

그다음 브라우저에서 `http://127.0.0.1:8000/`을 엽니다. 웹 화면은 실제 Yahoo Finance 데이터를 조회하여 종목별 점수와 8개 조건의 통과/미달을 표로 표시합니다. 서버를 종료하려면 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

특정 종목만 실행하려면 다음과 같이 입력합니다.

```powershell
.\run_live_screening.ps1 AAPL NVDA LLY NOW
```

Python으로 직접 실행할 수도 있습니다.

```powershell
$env:PYTHONPATH = "."
python .\run_live_screening.py AAPL NVDA LLY NOW
```

기본값은 모의 데이터를 사용합니다. 실제 Yahoo Finance 데이터를 사용하려면 `.env` 또는 환경 변수에서 `DATA_PROVIDER=yahoo`로 설정합니다. Yahoo Finance 공급자를 사용할 때는 `pip install -r requirements.txt`로 `yfinance`를 설치해야 합니다. SEPA는 기본적으로 9개 조건 중 7개 이상이면 통과하며, `SEPA_MIN_SCORE`로 변경할 수 있습니다. RS 점수는 SPY 대비 최근 1개월·3개월·6개월 상대수익률을 각각 50%·30%·20%로 가중하여 계산합니다. SEPA 통과 종목에만 최근 20주를 대상으로 VCP를 분석하며, 3회 이상 수축폭이 점진적으로 작고 각 수축 기간이 5거래일 이상일 때 VCP로 판정합니다. VCP 결과에는 수축별 평균 거래량 감소, 50일 평균 대비 돌파 거래량, 피벗 돌파 여부와 피벗 가격이 포함됩니다.

보관된 전체 결과 하나의 성과를 분석하려면 다음처럼 실행합니다. 여러 보관 결과가 있는 디렉터리를 입력하면 파일을 일괄 분석할 수도 있습니다. `weekly`, `monthly`, `quarterly`는 각각 5·21·63 거래일 뒤의 수익률이며, 아직 해당 기간이 지나지 않은 결과는 `pending`으로 표시됩니다.

```powershell
cd backend
$env:PYTHONPATH = "."
python .\run_performance_analysis.py `
	..\data\exports\verification\sepa_screening_all_YYYYMMDDTHHMMSSZ.json
```

```powershell
python .\run_performance_analysis.py `
	..\data\exports\verification `
	--output-dir ..\data\exports\verification\performance
```

분석 결과는 입력 파일 옆에 `performance_sepa_screening_all_*.json` 이름으로 저장됩니다. 현재 분석기는 Yahoo Finance에서 분석 대상 티커의 최신 일봉을 다시 조회하므로 인터넷 연결이 필요합니다.
