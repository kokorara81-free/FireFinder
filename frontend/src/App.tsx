import { Fragment, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Activity,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  ChevronDown,
  GripVertical,
  History,
  LayoutDashboard,
  LineChart,
  Menu,
  MoreHorizontal,
  Search,
  Sparkles,
  Plus,
  Star,
  Settings2,
  TrendingUp,
  Trash2,
} from "lucide-react";

type View = "dashboard" | "screening" | "analysis-report" | "watchlist" | "market-flow" | "journal" | "history";
type ScreeningResult = { symbol: string; company_name?: string; sector?: string | null; industry?: string | null; score: number; max_score: number; passed: boolean; is_new_entry?: boolean; is_dropout?: boolean; sepa_streak_days?: number; screening_date?: string | null; current_price?: number | null; trailing_pe?: number | null; forward_pe?: number | null; average_50?: number | null; average_150?: number | null; average_200?: number | null; volume_ratio?: number | null; rs_score?: number | null; vcp_found?: boolean | null; conditions?: Record<string, boolean>; vcp?: Record<string, unknown>; raw_result?: Record<string, unknown> };
type ScreeningFilter = "passed" | "new" | "dropout" | null;
type DashboardData = { screening_date: string | null; total_symbols: number; passed_count: number; scanned_count?: number; new_entries: number; dropouts: number; important_count: number; provider?: string | null; strategy?: string | null; };
type TrendPoint = { date: string; sectors: Record<string, number>; passed_count: number };
type MarketFlowPoint = { date: string; passed_count: number; scanned_count: number; pass_rate: number; new_entries: number; dropouts: number; sectors: Record<string, { passed_count: number; scanned_count: number; pass_rate: number }>; industries: Record<string, { sector: string; industry: string; passed_count: number; scanned_count: number; pass_rate: number }> };
type MarketEvent = { id: number; date: string; title: string; description: string; category: string };
type MarketFlowData = { days: number; market_status: string; pass_rate_change: number; benchmark: { symbol: string; available: boolean; points: { date: string; close: number; normalized: number }[] }; points: MarketFlowPoint[]; sectors: string[]; industries: { sector: string; industry: string }[]; events: MarketEvent[] };
type InterestState = "rising" | "falling" | "none";
type WatchlistItem = { ticker: string; is_important: boolean; is_watched: boolean; memo?: string | null; score?: number | null; passed?: boolean | null };
type Run = { id: number; screening_date: string; generated_at: string; provider: string; strategy: string; status: string };
type JournalEntry = { id: number; date: string; ticker: string; side: "Buy" | "Sell"; entryPrice: number; exitPrice: number | null; quantity: number; note: string };
type AnalysisReturn = { target_date: string | null; target_price: number | null; return_percent: number | null; status: string };
type AnalysisRow = { symbol: string; screening_date: string | null; sector: string | null; industry: string | null; score: number | null; max_score: number | null; passed: boolean; screening_price: number | null; trailing_pe: number | null; forward_pe: number | null; volume_ratio: number | null; rs_score: number | null; vcp_found: boolean | null; conditions: Record<string, boolean>; vcp: Record<string, unknown>; is_watchlisted: boolean; interest_state?: InterestState; average_returns: Record<string, number | null>; horizon_returns: Record<string, AnalysisReturn>; target_date?: string | null; target_price?: number | null; return_percent?: number | null; status?: string };
type AnalysisReport = { horizons: number[]; horizon: number; horizon_label: string; filters: { passed_only: boolean; sector: string | null; status: string; min_score: number }; summary: { sample_count: number; row_count: number; average_return: number | null; median_return: number | null; win_rate: number | null }; sectors: string[]; rows: AnalysisRow[] };
const analysisHorizonLabels: Record<number, string> = { 7: "7일", 15: "15일", 21: "1개월", 30: "6주", 42: "2개월", 63: "3개월", 84: "4개월", 105: "5개월", 126: "6개월" };
type ColumnKey = "symbol" | "sector" | "score" | "price" | "trailingPE" | "forwardPE" | "volume" | "rs" | "vcp" | "pivotPrice" | "pivotDate" | "pivotDistance" | "streak" | "status";
const defaultColumns: ColumnKey[] = ["symbol", "sector", "score", "price", "trailingPE", "forwardPE", "volume", "rs", "vcp", "pivotPrice", "pivotDate", "pivotDistance", "streak", "status"];
const columnLabels: Record<ColumnKey, string> = { symbol: "종목", sector: "섹터", score: "점수", price: "현재가", trailingPE: "Trailing P/E", forwardPE: "Forward P/E", volume: "거래량비", rs: "RS 강도", vcp: "VCP", pivotPrice: "피벗가", pivotDate: "피벗일", pivotDistance: "피벗 거리", streak: "SEPA 연속", status: "판정" };

const fallbackResults: ScreeningResult[] = [
  { symbol: "NVDA", sector: "Technology", industry: "Semiconductors", score: 9, max_score: 9, passed: true, current_price: 177.42, rs_score: 98.4 },
  { symbol: "META", sector: "Communication", industry: "Internet Content", score: 8, max_score: 9, passed: true, current_price: 742.18, rs_score: 94.1 },
  { symbol: "LLY", sector: "Healthcare", industry: "Drug Manufacturers", score: 7, max_score: 9, passed: true, current_price: 816.53, rs_score: 91.7 },
  { symbol: "TSLA", sector: "Consumer Cyclical", industry: "Auto Manufacturers", score: 5, max_score: 9, passed: false, current_price: 341.09, rs_score: 76.2 },
];
const fallbackTrend: TrendPoint[] = [
  { date: "2026-08-22", sectors: { Technology: 18, Healthcare: 11, Communication: 8, Industrials: 5 }, passed_count: 42 },
  { date: "2026-08-25", sectors: { Technology: 21, Healthcare: 12, Communication: 9, Industrials: 6 }, passed_count: 48 },
  { date: "2026-08-28", sectors: { Technology: 20, Healthcare: 12, Communication: 8, Industrials: 6 }, passed_count: 46 },
  { date: "2026-09-02", sectors: { Technology: 28, Healthcare: 15, Communication: 12, Industrials: 9 }, passed_count: 64 },
  { date: "2026-09-05", sectors: { Technology: 34, Healthcare: 17, Communication: 13, Industrials: 11 }, passed_count: 75 },
  { date: "2026-09-09", sectors: { Technology: 44, Healthcare: 19, Communication: 15, Industrials: 10 }, passed_count: 88 },
];

function App() {
  const [view, setView] = useState<View>(() => getInitialView());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [results, setResults] = useState<ScreeningResult[]>([]);
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [marketFlow, setMarketFlow] = useState<MarketFlowData | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState("");
  const [passedOnly, setPassedOnly] = useState(false);
  const [screeningFilter, setScreeningFilter] = useState<ScreeningFilter>(null);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => loadColumns());
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() => loadVisibleColumns());
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      fetch("/api/analytics/dashboard").then(readJson<DashboardData>),
      fetch("/api/analytics/screening?passed_only=false&limit=2000").then(readJson<{ screening_date: string | null; total_count: number; passed_count: number; results: ScreeningResult[] }>),
      fetch("/api/analytics/trend?days=20").then(readJson<{ points: TrendPoint[] }>),
      fetch("/api/analytics/market-flow?days=31").then(readJson<MarketFlowData>),
      fetch("/api/analytics/watchlist").then(readJson<{ items: WatchlistItem[] }>),
      fetch("/api/analytics/runs?limit=50").then(readJson<{ runs: Run[] }>),
      fetch("/api/analytics/analysis-report?horizon=21&passed_only=true&status=all&min_score=0").then(readJson<{ rows: AnalysisRow[] }>),
    ]).then(([summary, screening, trendResponse, marketFlowResponse, saved, runResponse, analysisResponse]) => {
      if (summary.status === "fulfilled") setDashboard(summary.value);
      if (screening.status === "fulfilled") setResults(screening.value.results.map((result) => ({ ...result, screening_date: screening.value.screening_date })));
      if (trendResponse.status === "fulfilled") setTrend(trendResponse.value.points);
      if (marketFlowResponse.status === "fulfilled") setMarketFlow(marketFlowResponse.value);
      if (saved.status === "fulfilled") setWatchlist(saved.value.items);
      if (runResponse.status === "fulfilled") setRuns(runResponse.value.runs);
      if (analysisResponse.status === "fulfilled") setAnalysisRows(analysisResponse.value.rows);
      if ([summary, screening, trendResponse, marketFlowResponse, saved, runResponse, analysisResponse].some((result) => result.status === "rejected")) setError("일부 분석 데이터만 불러왔습니다.");
    });
  }, []);

  const liveResults = results.length ? results : fallbackResults;
  const dateLabel = dashboard?.screening_date?.replace(/-/g, ".") ?? "2026.09.11";
  const passedCount = dashboard ? dashboard.passed_count : liveResults.filter((result) => result.passed).length;
  const searchableResults = liveResults.filter((result) => result.symbol.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => { localStorage.setItem("firefinder.screening.columnOrder", JSON.stringify(columnOrder)); }, [columnOrder]);
  useEffect(() => { localStorage.setItem("firefinder.screening.visibleColumns", JSON.stringify(visibleColumns)); }, [visibleColumns]);
  async function toggleWatch(ticker: string) {
    const current = watchlist.find((item) => item.ticker === ticker);
    const currentState = getInterestState(current);
    const nextState: InterestState = currentState === "none" ? "rising" : currentState === "rising" ? "falling" : "none";
    const response = await fetch(`/api/annotations/${ticker}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_important: nextState === "rising", is_watched: nextState === "falling" }) }).catch(() => null);
    if (!response?.ok) return;
    const updated = await response.json() as { is_important: boolean; is_watched: boolean };
    setWatchlist((items) => {
      if (!updated.is_important && !updated.is_watched) {
        return items.filter((item) => item.ticker !== ticker);
      }
      return current
        ? items.map((item) => item.ticker === ticker ? { ...item, is_important: updated.is_important, is_watched: updated.is_watched } : item)
        : [...items, { ticker, is_important: updated.is_important, is_watched: updated.is_watched }];
    });
  }

  return <main className={`app-shell ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
    <aside className="sidebar" aria-label="주요 메뉴">
      <div className="brand"><span className="brand-mark">FF</span><span className="brand-copy"><strong>FireFinder</strong><small>Analysis workspace</small></span></div>
      <nav className="nav">
        <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" number="01" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon={<Activity size={18} />} label="Market Flow" number="02" active={view === "market-flow"} onClick={() => setView("market-flow")} />
        <NavItem icon={<Search size={18} />} label="Screening" number="03" active={view === "screening"} onClick={() => setView("screening")} />
        <NavItem icon={<LineChart size={18} />} label="Analysis report" number="04" active={view === "analysis-report"} onClick={() => setView("analysis-report")} />
        <NavItem icon={<Bookmark size={18} />} label="Watchlist" number="05" active={view === "watchlist"} onClick={() => setView("watchlist")} />
        <NavItem icon={<History size={18} />} label="History" number="06" active={view === "history"} onClick={() => setView("history")} />
      </nav>
      <div className="sidebar-note"><span className="live-dot" /> Data feed connected</div><div className="sidebar-footer"><span>POWERED BY HM</span><small>v0.1.0 · SEPA ENGINE</small></div>
      <button className="sidebar-toggle" onClick={() => setIsSidebarOpen((current) => !current)} aria-label={isSidebarOpen ? "메뉴 접기" : "메뉴 펼치기"}>{isSidebarOpen ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}</button>
    </aside>

    <section className={`workspace ${view === "dashboard" ? "" : "subpage"}`}>
      <header className={`page-header ${view === "dashboard" ? "" : "compact"}`}><div className="mobile-menu"><Menu size={19} /></div><div><span className="section-label">MARKET INTELLIGENCE / 0{view === "dashboard" ? "1" : view === "screening" ? "2" : view === "analysis-report" ? "3" : view === "watchlist" ? "4" : view === "market-flow" ? "5" : "6"}</span>{view === "dashboard" && <h1>{viewTitle(view)}</h1>}</div><div className="header-actions"><span className="last-update"><i className="live-dot" /> Updated {dateLabel}</span><button className="icon-button" aria-label="알림"><Bell size={17} /><i /></button></div></header>
      {error && <div className="notice"><CircleAlert size={15} /> {error}</div>}
      {view === "dashboard" && <DashboardView dashboard={dashboard} results={liveResults} analysisRows={analysisRows} trend={trend} watchlist={watchlist} passedCount={passedCount} onOpenWatchlist={() => setView("watchlist")} onOpenAnalysis={() => setView("analysis-report")} onOpenScreening={(filter) => { setScreeningFilter(filter); setPassedOnly(filter === "passed"); setView("screening"); }} />}
      {view === "screening" && <ScreeningView results={searchableResults} analysisRows={analysisRows} query={query} passedOnly={passedOnly} screeningFilter={screeningFilter} setQuery={setQuery} setPassedOnly={(value) => { setPassedOnly(value); setScreeningFilter(value ? "passed" : null); }} setScreeningFilter={setScreeningFilter} watchlist={watchlist} onToggleWatch={toggleWatch} columnOrder={columnOrder} setColumnOrder={setColumnOrder} visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} />}
      {view === "analysis-report" && <AnalysisReportViewWithSorting watchlist={watchlist} />}
      {view === "watchlist" && <WatchlistView items={watchlist} results={liveResults} onToggleWatch={toggleWatch} />}
      {view === "market-flow" && <MarketFlowView data={marketFlow} onOpenScreening={(filter) => { setScreeningFilter(filter); setPassedOnly(filter === "passed"); setView("screening"); }} />}
      {view === "journal" && <JournalView />}
      {view === "history" && <HistoryView runs={runs} />}
    </section>
    <ScreeningPopupHost results={liveResults} analysisRows={analysisRows} />
  </main>;
        <section className={`workspace ${view === "dashboard" ? "" : "subpage"}`}>
          <header className={`page-header ${view === "dashboard" ? "" : "compact"}`}><div className="mobile-menu"><Menu size={19} /></div><div><span className="section-label">MARKET INTELLIGENCE / 0{view === "dashboard" ? "1" : view === "screening" ? "2" : view === "analysis-report" ? "3" : view === "watchlist" ? "4" : "5"}</span>{view === "dashboard" && <h1>{viewTitle(view)}</h1>}</div><div className="header-actions"><span className="last-update"><i className="live-dot" /> Updated {dateLabel}</span><button className="icon-button" aria-label="알림"><Bell size={17} /><i /></button></div></header>
          {error && <div className="notice"><CircleAlert size={15} /> {error}</div>}
          {view === "dashboard" && <DashboardView dashboard={dashboard} results={liveResults} analysisRows={analysisRows} trend={trend} watchlist={watchlist} passedCount={passedCount} onOpenWatchlist={() => setView("watchlist")} onOpenAnalysis={() => setView("analysis-report")} onOpenScreening={(filter) => { setScreeningFilter(filter); setPassedOnly(filter === "passed"); setView("screening"); }} />}
          {view === "screening" && <ScreeningView results={searchableResults} analysisRows={analysisRows} query={query} passedOnly={passedOnly} screeningFilter={screeningFilter} setQuery={setQuery} setPassedOnly={(value) => { setPassedOnly(value); setScreeningFilter(value ? "passed" : null); }} setScreeningFilter={setScreeningFilter} watchlist={watchlist} onToggleWatch={toggleWatch} columnOrder={columnOrder} setColumnOrder={setColumnOrder} visibleColumns={visibleColumns} setVisibleColumns={setVisibleColumns} />}
          {view === "analysis-report" && <AnalysisReportViewWithSorting watchlist={watchlist} />}
          {view === "watchlist" && <WatchlistView items={watchlist} results={liveResults} onToggleWatch={toggleWatch} />}
          {view === "history" && <HistoryView runs={runs} />}
        </section>
}

function NavItem({ icon, label, number, active, onClick }: { icon: React.ReactNode; label: string; number: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span><b>{number}</b></button>;
}

function getInterestState(item: Pick<WatchlistItem, "is_important" | "is_watched"> | undefined): InterestState { return item?.is_important ? "rising" : item?.is_watched ? "falling" : "none"; }
function InterestStar({ state, size = 15 }: { state: InterestState; size?: number }) { return <Star className={`interest-star ${state}`} size={size} fill={state === "none" ? "none" : "currentColor"} />; }

function getSignedTrend(value: number) {
  if (value > 0) return { text: `+${value}`, tone: "positive" as const, label: "상승" };
  if (value < 0) return { text: `${value}`, tone: "negative" as const, label: "하락" };
  return { text: "0", tone: "neutral" as const, label: "보합" };
}

function DashboardView({ dashboard, results, analysisRows, trend, watchlist, passedCount, onOpenWatchlist, onOpenAnalysis, onOpenScreening }: { dashboard: DashboardData | null; results: ScreeningResult[]; analysisRows: AnalysisRow[]; trend: TrendPoint[]; watchlist: WatchlistItem[]; passedCount: number; onOpenWatchlist: () => void; onOpenAnalysis: () => void; onOpenScreening: (filter: Exclude<ScreeningFilter, null>) => void }) {
  const trendPoints = trend.length ? trend : fallbackTrend;
  const sectors = [...new Set(trendPoints.flatMap((point) => Object.keys(point.sectors)))];
  const isSample = dashboard === null;
  const totalSymbols = isSample ? 1756 : dashboard.total_symbols;
  const sepaPassed = isSample ? 685 : dashboard.passed_count;
  const newEntries = isSample ? 4 : dashboard.new_entries;
  const dropouts = isSample ? 3 : dashboard.dropouts;
  const savedIdeas = watchlist.length;
  const passedDelta = newEntries - dropouts;
  const passedTrend = getSignedTrend(passedDelta);
  const passedTone = passedTrend.tone === "negative" ? "coral" : passedTrend.tone === "positive" ? "green" : "blue";

  return <>
    <div className="welcome-row"><div><p className="welcome-kicker">Good morning, investor</p><h2>오늘의 시장 흐름을 확인하세요.</h2></div><div className="strategy-chip"><Sparkles size={14} /> {dashboard?.strategy ?? "SEPA Trend Template"} <span>v0.5</span></div></div>
    <section className="metrics" aria-label="대시보드 핵심 지표"><MetricCard label="전체 종목" value={totalSymbols} note="DB universe" tone="blue" /><MetricCard label="SEPA 통과" value={sepaPassed} note={`${passedCount ? Math.round((passedCount / Math.max(dashboard?.scanned_count || passedCount, 1)) * 100) : 0}% of scanned`} tone={passedTone} trend={passedTrend.text} trendTone={passedTrend.tone} onClick={() => onOpenScreening("passed")} /><MetricCard label="신규 진입" value={newEntries} note="since last scan" tone="mint" onClick={() => onOpenScreening("new")} /><MetricCard label="이탈" value={dropouts} note="needs attention" tone="coral" onClick={() => onOpenScreening("dropout")} /><MetricCard label="관심 종목" value={savedIdeas} note="saved ideas" tone="gold" onClick={onOpenWatchlist} /></section>
    <section className="dashboard-grid"><article className="panel trend-panel"><PanelTitle eyebrow="SIGNAL MOMENTUM" title="SEPA 통과 섹터별 추이" action={<MoreHorizontal size={18} />} /><div className="trend-summary"><strong>{passedCount.toLocaleString()}</strong><span><TrendingUp size={14} /> 오늘 통과 종목</span></div><TrendChart points={trendPoints} sectors={sectors} /><div className="sector-legend">{sectors.map((sector, index) => <span key={sector}><i className={`legend-dot sector-${index % 6}`} />{sector}</span>)}</div><div className="panel-caption"><span><i className="legend-dot" /> Passed candidates by sector</span></div></article><aside className="panel attention-panel"><PanelTitle eyebrow="YOUR SIGNALS" title="오늘의 관찰" action={<Star size={17} className="gold-icon" fill="currentColor" />} /><div className="attention-intro">스크리닝 결과에서 저장한 아이디어입니다.</div>{watchlist.length ? watchlist.slice(0, 3).map((item, index) => <SignalRow key={item.ticker} ticker={item.ticker} score={results.find((result) => result.symbol === item.ticker)?.score ? `${results.find((result) => result.symbol === item.ticker)?.score}/9` : "-"} color={index === 0 ? "green" : index === 1 ? "blue" : "gold"} />) : <div className="empty-state">등록된 관심 종목이 없습니다.</div>}<button className="text-button" onClick={onOpenWatchlist}>관심 종목 전체 보기 ({watchlist.length}) <ArrowUpRight size={14} /></button></aside></section>
    <RecentTable results={results} analysisRows={analysisRows} onOpenAnalysis={onOpenAnalysis} />
  </>;
}

function MarketFlowView({ data, onOpenScreening }: { data: MarketFlowData | null; onOpenScreening: (filter: Exclude<ScreeningFilter, null>) => void }) {
  const [selectedSectors, setSelectedSectors] = useState<string[] | null>(null);
  const [events, setEvents] = useState<MarketEvent[]>(data?.events ?? []);
  useEffect(() => setEvents(data?.events ?? []), [data?.events]);
  const sectors = data?.sectors ?? [];
  const activeSectors = selectedSectors ?? sectors;
  const latestPoint = data?.points[data.points.length - 1];
  const firstPoint = data?.points[0];
  const benchmarkValues = data?.benchmark.points.map((point) => point.normalized) ?? [];
  const breadthValues = data?.points.map((point) => point.pass_rate) ?? [];
  const visibleIndustries = data?.industries.filter((item) => activeSectors.includes(item.sector)).map((item) => item.industry) ?? [];
  const industryKeys = [...new Set(visibleIndustries)].slice(0, 12);
  const marketStatus = data?.market_status ?? "No data";
  const statusLabel: Record<string, string> = { Improving: "개선 중", Deteriorating: "악화 중", Healthy: "건강한 시장", Neutral: "중립", "No data": "데이터 없음" };
  const toggleSector = (sector: string) => {
    const current = selectedSectors ?? sectors;
    setSelectedSectors(current.includes(sector) ? current.filter((item) => item !== sector) : [...current, sector]);
  };
  return <>
    <ViewIntro eyebrow="MARKET BREADTH" title="Market Flow" copy="S&P 500의 방향과 SEPA 시장 폭을 함께 보고, 시장을 이끄는 섹터와 산업군을 찾습니다." />
    <section className="flow-summary">
      <article className="flow-status-card"><span className="section-label">MARKET REGIME</span><strong>{statusLabel[marketStatus] ?? marketStatus}</strong><small>{data ? `최근 ${data.days}개 스크리닝 기준` : "분석 데이터 대기 중"}</small></article>
      <MetricCard label="SEPA 통과율" value={latestPoint?.pass_rate ?? 0} note={`${latestPoint?.passed_count ?? 0} / ${latestPoint?.scanned_count ?? 0} 종목`} tone="green" trend={data ? `${data.pass_rate_change >= 0 ? "+" : ""}${data.pass_rate_change}%p` : undefined} trendTone={data?.pass_rate_change && data.pass_rate_change < 0 ? "negative" : "positive"} />
      <MetricCard label="신규 진입" value={latestPoint?.new_entries ?? 0} note="최근 스크리닝" tone="mint" onClick={() => onOpenScreening("new")} />
      <MetricCard label="이탈 종목" value={latestPoint?.dropouts ?? 0} note="최근 스크리닝" tone="coral" onClick={() => onOpenScreening("dropout")} />
    </section>
    <section className="flow-chart-grid">
      <article className="panel flow-panel"><PanelTitle eyebrow="BENCHMARK" title="S&P 500 · 1개월" action={<span className="flow-chip">{data?.benchmark.available ? "SPY" : "조회 대기"}</span>} />{benchmarkValues.length ? <FlowChart values={benchmarkValues} labels={data?.benchmark.points.map((point) => point.date) ?? []} suffix="" events={events} /> : <div className="empty-state">SPY 데이터를 불러오지 못했습니다.</div>}<div className="flow-footnote">시작일을 100으로 환산한 상대 추이</div></article>
      <article className="panel flow-panel"><PanelTitle eyebrow="SEPA BREADTH" title="SEPA 통과율 · 1개월" action={<span className="flow-chip">{latestPoint ? `${latestPoint.pass_rate}%` : "-"}</span>} />{breadthValues.length ? <FlowChart values={breadthValues} labels={data?.points.map((point) => point.date) ?? []} suffix="%" events={events} /> : <div className="empty-state">스크리닝 이력이 없습니다.</div>}<div className="flow-footnote">전체 스크리닝 종목 대비 통과 비율</div></article>
    </section>
    <MarketEventStrip events={events} />
    <section className="panel flow-section"><div className="flow-section-header"><div><span className="section-label">SECTOR LEADERSHIP</span><h3>섹터별 통과율 추이</h3></div><div className="flow-selection-actions"><button className="filter-button" onClick={() => setSelectedSectors(null)}>전체 선택</button><button className="filter-button" onClick={() => setSelectedSectors([])}>전체 해제</button></div></div><div className="flow-checks">{sectors.map((sector) => <label key={sector} title={`${sector} 섹터 그래프 표시`}><input type="checkbox" checked={activeSectors.includes(sector)} onChange={() => toggleSector(sector)} />{sector}</label>)}</div>{data?.points.length && activeSectors.length ? <MultiFlowChart points={data.points} keys={activeSectors} events={events} getValue={(point, key) => point.sectors[key]?.pass_rate ?? 0} /> : <div className="empty-state">표시할 섹터를 선택하세요.</div>}</section>
    <section className="panel flow-section"><div className="flow-section-header"><div><span className="section-label">INDUSTRY DETAIL</span><h3>선택 섹터의 산업군</h3></div><span className="flow-count">상위 {industryKeys.length}개 표시</span></div>{industryKeys.length ? <FlowGroupChart points={data?.points ?? []} keys={industryKeys} events={events} getValue={(point, key) => Object.values(point.industries).find((item) => item.industry === key)?.pass_rate ?? 0} suffix="%" /> : <div className="empty-state">위에서 하나 이상의 섹터를 선택하세요.</div>}<div className="flow-footnote">산업군은 최근 통과 종목 수 기준 상위 항목을 표시합니다.</div></section>
    <section className="flow-insights"><div><strong>{firstPoint && latestPoint ? `${latestPoint.pass_rate - firstPoint.pass_rate >= 0 ? "+" : ""}${(latestPoint.pass_rate - firstPoint.pass_rate).toFixed(1)}%p` : "-"}</strong><span>1개월 시장 폭 변화</span></div><div><strong>{latestPoint?.new_entries ?? 0}</strong><span>최근 신규 리더</span></div><div><strong>{activeSectors.length}/{sectors.length}</strong><span>표시 중인 섹터</span></div></section><MarketEventEditor events={events} onEventsChange={setEvents} />
  </>;
}

function MarketEventStrip({ events }: { events: MarketEvent[] }) {
  return <section className="market-event-strip"><span className="section-label">MARKET EVENTS</span>{events.length ? events.map((event) => <article key={event.id}><time>{event.date}</time><div><strong>{event.title}</strong><small>{event.category}{event.description ? ` · ${event.description}` : ""}</small></div></article>) : <span className="market-event-strip-empty">등록된 시장 이벤트가 없습니다.</span>}</section>;
}

function FlowChart({ values, labels, suffix, events = [] }: { values: number[]; labels: string[]; suffix: string; events?: MarketEvent[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, 1);
  const yFor = (value: number) => 92 - ((value - min) / spread) * 78;
  const xFor = (index: number) => values.length === 1 ? 50 : 3 + (index / (values.length - 1)) * 94;
  const coordinates = values.map((value, index) => `${xFor(index)},${yFor(value)}`).join(" ");
  const latestValue = values[values.length - 1] ?? 0;
  const latestLabel = labels[labels.length - 1] ?? "-";
  const guideValues = [max, min + spread / 2, min];
  const eventMarkers = events.map((event) => ({ event, index: labels.indexOf(event.date) })).filter((marker) => marker.index >= 0);
  return <div className="flow-chart"><div className="flow-chart-value">{latestValue.toFixed(1)}{suffix}</div><div className="flow-chart-scale">{guideValues.map((value) => <span key={value}>{value.toFixed(1)}{suffix}</span>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="시장 추이 그래프"><line x1="0" x2="100" y1="92" y2="92" /><line x1="0" x2="100" y1="53" y2="53" /><line x1="0" x2="100" y1="14" y2="14" />{eventMarkers.map(({ event, index }) => <g key={event.id}><line className="market-event-line" x1={xFor(index)} x2={xFor(index)} y1="5" y2="94" /><line className="market-event-dot" x1={xFor(index)} x2={xFor(index)} y1="7" y2="7" /><title>{event.date} · {event.title}{event.description ? ` · ${event.description}` : ""}</title></g>)}<polyline points={coordinates} /><line className="flow-latest-dot" x1={xFor(values.length - 1)} x2={xFor(values.length - 1)} y1={yFor(latestValue)} y2={yFor(latestValue)} /><title>{labels[0] ?? "-"}부터 {latestLabel}까지 추이</title></svg><div className="flow-axis"><span>{labels[0] ?? "-"}</span><span>{latestLabel}</span></div></div>;
}
function MultiFlowChart({ points, keys, events = [], getValue }: { points: MarketFlowPoint[]; keys: string[]; events?: MarketEvent[]; getValue: (point: MarketFlowPoint, key: string) => number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [scaleMode, setScaleMode] = useState<"absolute" | "zoom" | "manual">("zoom");
  const [manualMin, setManualMin] = useState("0");
  const [manualMax, setManualMax] = useState("100");
  const values = keys.flatMap((key) => points.map((point) => getValue(point, key)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const rawSpread = Math.max(rawMax - rawMin, 1);
  const zoomPadding = Math.max(rawSpread * 0.12, 1);
  const requestedMin = Math.max(0, Math.min(100, Number(manualMin) || 0));
  const requestedMax = Math.max(requestedMin + 1, Math.min(100, Number(manualMax) || 100));
  const min = scaleMode === "zoom" ? Math.max(0, rawMin - zoomPadding) : scaleMode === "manual" ? requestedMin : 0;
  const max = scaleMode === "zoom" ? Math.min(100, rawMax + zoomPadding) : scaleMode === "manual" ? requestedMax : Math.max(100, rawMax);
  const spread = Math.max(max - min, 1);
  const xFor = (index: number) => points.length === 1 ? 50 : 3 + (index / (points.length - 1)) * 94;
  const yFor = (value: number) => {
    const boundedValue = Math.max(min, Math.min(max, value));
    return 94 - ((boundedValue - min) / spread) * 84;
  };
  const colors = ["#5574a8", "#7fa1c7", "#d4775d", "#c3a45a", "#8b7eae", "#8795a9"];
  const hoveredValue = hoveredKey ? getValue(points[points.length - 1], hoveredKey) : null;
  const guideValues = [max, min + spread / 2, min];
  const eventMarkers = events.map((event) => ({ event, index: points.findIndex((point) => point.date === event.date) })).filter((marker) => marker.index >= 0);
  return <div className="multi-flow-chart"><div className="multi-flow-chart-toolbar"><div className="multi-flow-hover-label">{hoveredKey ? <><b>{hoveredKey}</b><span>최근 {hoveredValue?.toFixed(1)}%</span></> : "선 또는 범례에 마우스를 올려보세요"}</div><div className="flow-scale-toggle" role="group" aria-label="그래프 축 범위"><button className={scaleMode === "absolute" ? "selected" : ""} onClick={() => setScaleMode("absolute")}>절대값</button><button className={scaleMode === "zoom" ? "selected" : ""} onClick={() => setScaleMode("zoom")}>변화 확대</button><button className={scaleMode === "manual" ? "selected" : ""} onClick={() => setScaleMode("manual")}>수동</button></div></div>{scaleMode === "manual" && <div className="flow-manual-range"><label>최소 <input type="number" min="0" max="99" value={manualMin} onChange={(event) => setManualMin(event.target.value)} />%</label><span>~</span><label>최대 <input type="number" min="1" max="100" value={manualMax} onChange={(event) => setManualMax(event.target.value)} />%</label></div>}<div className="multi-flow-range">표시 범위 {min.toFixed(1)}% ~ {max.toFixed(1)}%</div><div className="multi-flow-plot"><div className="multi-flow-scale">{guideValues.map((value) => <span key={value}>{value.toFixed(1)}%</span>)}</div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="섹터별 통과율 비교 그래프"><line x1="0" x2="100" y1="94" y2="94" /><line x1="0" x2="100" y1="52" y2="52" /><line x1="0" x2="100" y1="10" y2="10" />{eventMarkers.map(({ event, index }) => <g key={event.id}><line className="market-event-line" x1={xFor(index)} x2={xFor(index)} y1="5" y2="94" /><line className="market-event-dot" x1={xFor(index)} x2={xFor(index)} y1="7" y2="7" /><title>{event.date} · {event.title}{event.description ? ` · ${event.description}` : ""}</title></g>)}{keys.map((key, index) => { const pointsString = points.map((point, pointIndex) => `${xFor(pointIndex)},${yFor(getValue(point, key))}`).join(" "); return <g key={key} onMouseEnter={() => setHoveredKey(key)} onMouseLeave={() => setHoveredKey(null)}><polyline className="trend-hit-area" points={pointsString} fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><polyline className={hoveredKey && hoveredKey !== key ? "flow-line-dimmed" : ""} points={pointsString} stroke={colors[index % colors.length]} onFocus={() => setHoveredKey(key)} onBlur={() => setHoveredKey(null)} tabIndex={0} aria-label={`${key} 섹터 통과율 추이`} /></g>; })}</svg><div className="multi-flow-axis"><span>{points[0]?.date ?? "-"}</span><span>{points[points.length - 1]?.date ?? "-"}</span></div></div><div className="multi-flow-legend">{keys.map((key, index) => <span key={key} className={hoveredKey && hoveredKey !== key ? "flow-legend-dimmed" : ""} onMouseEnter={() => setHoveredKey(key)} onMouseLeave={() => setHoveredKey(null)}><i style={{ background: colors[index % colors.length] }} />{key}</span>)}</div></div>;
}

function MarketFlowSectorChart({ points, keys, events, getValue }: { points: MarketFlowPoint[]; keys: string[]; events: MarketEvent[]; getValue: (point: MarketFlowPoint, key: string) => number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<MarketEvent | null>(null);
  const values = keys.flatMap((key) => points.map((point) => getValue(point, key)));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max((rawMax - rawMin) * 0.12, 1);
  const min = Math.max(0, rawMin - padding);
  const max = Math.min(100, rawMax + padding);
  const spread = Math.max(max - min, 1);
  const xFor = (index: number) => points.length === 1 ? 50 : 3 + (index / (points.length - 1)) * 94;
  const yFor = (value: number) => 94 - ((Math.max(min, Math.min(max, value)) - min) / spread) * 84;
  const colors = ["#5574a8", "#7fa1c7", "#d4775d", "#c3a45a", "#8b7eae", "#8795a9"];
  const eventMarkers = events.map((event) => ({ event, index: points.findIndex((point) => point.date === event.date) })).filter((marker) => marker.index >= 0);
  const handlePlotMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const pointIndex = Math.min(points.length - 1, Math.round(ratio * (points.length - 1)));
    const pointerRatio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const pointerValue = max - pointerRatio * spread;
    const nearestKey = keys.reduce((best, key) => Math.abs(getValue(points[pointIndex], key) - pointerValue) < Math.abs(getValue(points[pointIndex], best) - pointerValue) ? key : best, keys[0]);
    setHoveredKey(nearestKey);
  };
  return <div className="multi-flow-chart" onMouseLeave={() => { setHoveredKey(null); setHoveredEvent(null); }}><div className="multi-flow-hover-label">{hoveredEvent ? <><b>{hoveredEvent.title}</b><span>{hoveredEvent.date}{hoveredEvent.description ? ` · ${hoveredEvent.description}` : ""}</span></> : hoveredKey ? <><b>{hoveredKey}</b><span>최근 {getValue(points[points.length - 1], hoveredKey).toFixed(1)}%</span></> : "그래프 또는 이벤트 점선에 마우스를 올려보세요"}</div><div className="multi-flow-range">표시 범위 {min.toFixed(1)}% ~ {max.toFixed(1)}%</div><div className="multi-flow-plot" onMouseMove={handlePlotMove}><div className="multi-flow-scale"><span>{max.toFixed(1)}%</span><span>{(min + spread / 2).toFixed(1)}%</span><span>{min.toFixed(1)}%</span></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="섹터별 통과율 비교 그래프"><line x1="0" x2="100" y1="94" y2="94" /><line x1="0" x2="100" y1="52" y2="52" /><line x1="0" x2="100" y1="10" y2="10" />{eventMarkers.map(({ event, index }) => <g key={event.id} onMouseEnter={() => setHoveredEvent(event)} onMouseLeave={() => setHoveredEvent(null)}><line className="market-event-hover-line" x1={xFor(index)} x2={xFor(index)} y1="5" y2="94" /><line className="market-event-line" x1={xFor(index)} x2={xFor(index)} y1="5" y2="94" /><line className="market-event-dot" x1={xFor(index)} x2={xFor(index)} y1="7" y2="7" /></g>)}{keys.map((key, index) => { const pointsString = points.map((point, pointIndex) => `${xFor(pointIndex)},${yFor(getValue(point, key))}`).join(" "); const dimmed = hoveredKey !== null && hoveredKey !== key; return <g key={key}><polyline className="market-flow-hit-line" points={pointsString} /><polyline className={dimmed ? "flow-line-dimmed" : ""} points={pointsString} stroke={colors[index % colors.length]} /></g>; })}</svg><div className="multi-flow-axis"><span>{points[0]?.date ?? "-"}</span><span>{points[points.length - 1]?.date ?? "-"}</span></div></div><div className="multi-flow-legend">{keys.map((key, index) => <span key={key} className={hoveredKey && hoveredKey !== key ? "flow-legend-dimmed" : ""} onMouseEnter={() => setHoveredKey(key)} onMouseLeave={() => setHoveredKey(null)}><i style={{ background: colors[index % colors.length] }} />{key}</span>)}</div></div>;
}

function FlowGroupChart({ points, keys, events = [], getValue, suffix }: { points: MarketFlowPoint[]; keys: string[]; events?: MarketEvent[]; getValue: (point: MarketFlowPoint, key: string) => number; suffix: string }) {
  const latestPoint = points[points.length - 1];
  return <div className="flow-group-chart">{keys.map((key, index) => <div className="flow-group-row" key={key}><div className="flow-group-label"><i className={`flow-dot sector-${index % 6}`} /><span>{key}</span><b>{latestPoint ? getValue(latestPoint, key).toFixed(1) : "-"}{suffix}</b></div><div className="flow-spark"><FlowChart values={points.map((point) => getValue(point, key))} labels={points.map((point) => point.date)} suffix={suffix} events={events} /></div></div>)}</div>;
}

function MarketEventEditor({ events, onEventsChange }: { events: MarketEvent[]; onEventsChange: (events: MarketEvent[]) => void }) {
  const [items, setItems] = useState(events);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("시장 이벤트");
  useEffect(() => setItems(events), [events]);
  async function addEvent(event: React.FormEvent) {
    event.preventDefault();
    if (!date || !title.trim()) return;
    const response = await fetch("/api/analytics/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, title, description, category }) });
    if (!response.ok) return;
    const created = await response.json() as MarketEvent;
    setItems((current) => [...current, created].sort((left, right) => left.date.localeCompare(right.date)));
    onEventsChange([...items, created].sort((left, right) => left.date.localeCompare(right.date)));
    setDate("");
    setTitle("");
    setDescription("");
  }
  async function removeEvent(id: number) {
    const response = await fetch(`/api/analytics/events/${id}`, { method: "DELETE" });
    if (response.ok) {
      const next = items.filter((item) => item.id !== id);
      setItems(next);
      onEventsChange(next);
    }
  }
  return <section className="panel market-event-panel"><div className="flow-section-header"><div><span className="section-label">CHART ANNOTATIONS</span><h3>시장 이벤트 표시</h3></div><span className="flow-count">그래프 점선으로 표시</span></div><form className="market-event-form" onSubmit={addEvent}><label>날짜<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>분류<select value={category} onChange={(event) => setCategory(event.target.value)}><option>시장 이벤트</option><option>금리</option><option>경제지표</option><option>실적</option><option>기타</option></select></label><label className="market-event-title">제목<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="market-event-description">내용<input value={description} onChange={(event) => setDescription(event.target.value)} /></label><button className="filter-button selected" type="submit">이벤트 추가</button></form>{items.length ? <div className="market-event-list">{items.map((item) => <div className="market-event-item" key={item.id}><span className="market-event-date">{item.date}</span><div><strong>{item.title}</strong><small>{item.category}{item.description ? ` · ${item.description}` : ""}</small></div><button className="market-event-delete" onClick={() => removeEvent(item.id)} aria-label={`${item.title} 이벤트 삭제`}>삭제</button></div>)}</div> : <div className="market-event-empty">등록된 이벤트가 없습니다.</div>}</section>;
}

function ScreeningView({ results, analysisRows, query, passedOnly, screeningFilter, setQuery, setPassedOnly, setScreeningFilter, watchlist, onToggleWatch, columnOrder, setColumnOrder, visibleColumns, setVisibleColumns }: { results: ScreeningResult[]; analysisRows: AnalysisRow[]; query: string; passedOnly: boolean; screeningFilter: ScreeningFilter; setQuery: (value: string) => void; setPassedOnly: (value: boolean) => void; setScreeningFilter: (value: ScreeningFilter) => void; watchlist: WatchlistItem[]; onToggleWatch: (ticker: string) => void; columnOrder: ColumnKey[]; setColumnOrder: (value: ColumnKey[]) => void; visibleColumns: ColumnKey[]; setVisibleColumns: (value: ColumnKey[]) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string[]>([]);
  const [sectorMenuOpen, setSectorMenuOpen] = useState(false);
  const [vcpFilter, setVcpFilter] = useState("all");
  const [minimumScore, setMinimumScore] = useState(0);
  const [sortColumn, setSortColumn] = useState<ColumnKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const displayedColumns = columnOrder.filter((column) => visibleColumns.includes(column));
  const sectors = [...new Set(results.map((result) => result.sector).filter((sector): sector is string => Boolean(sector)))].sort();
  const visibleResults = results.filter((result) => (!passedOnly || result.passed) && (screeningFilter !== "new" || result.is_new_entry === true) && (screeningFilter !== "dropout" || result.is_dropout === true) && (!sectorFilter.length || sectorFilter.includes(result.sector ?? "")) && (vcpFilter === "all" || (vcpFilter === "found" ? result.vcp_found === true : result.vcp_found === false)) && result.score >= minimumScore);
  const sortedResults = [...visibleResults].sort((left, right) => {
    const valueFor = (result: ScreeningResult): string | number | null => {
      if (sortColumn === "symbol") return result.symbol;
      if (sortColumn === "sector") return result.sector ?? null;
      if (sortColumn === "score") return result.score;
      if (sortColumn === "price") return result.current_price ?? null;
      if (sortColumn === "trailingPE") return result.trailing_pe ?? null;
      if (sortColumn === "forwardPE") return result.forward_pe ?? null;
      if (sortColumn === "volume") return result.volume_ratio ?? null;
      if (sortColumn === "rs") return result.rs_score ?? null;
      if (sortColumn === "vcp") return result.vcp_found == null ? null : Number(result.vcp_found);
      if (sortColumn === "pivotPrice") return typeof result.vcp?.pivot_price === "number" ? result.vcp.pivot_price : null;
      if (sortColumn === "pivotDate") return typeof result.vcp?.pivot_date === "string" ? result.vcp.pivot_date : null;
      if (sortColumn === "pivotDistance") return typeof result.vcp?.pivot_distance_percent === "number" ? result.vcp.pivot_distance_percent : null;
      if (sortColumn === "streak") return result.sepa_streak_days ?? null;
      return Number(result.passed);
    };
    const leftValue = valueFor(left);
    const rightValue = valueFor(right);
    if (leftValue == null) return rightValue == null ? 0 : 1;
    if (rightValue == null) return -1;
    const comparison = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue));
    return sortDirection === "asc" ? comparison : -comparison;
  });
  const changeSort = (column: ColumnKey) => {
    setSortDirection(sortColumn === column && sortDirection === "asc" ? "desc" : "asc");
    setSortColumn(column);
  };
  function moveColumn(target: ColumnKey) {
    if (!draggedColumn || draggedColumn === target) return;
    const next = [...columnOrder];
    const from = next.indexOf(draggedColumn);
    const to = next.indexOf(target);
    next.splice(from, 1);
    next.splice(to, 0, draggedColumn);
    setColumnOrder(next);
  }
  return <><ViewIntro eyebrow="SCREENING LAB" title="SEPA Screening" copy="가장 최근 스크리닝 결과를 조건별로 확인하고 관심 종목을 저장하세요." /><section className="panel full-panel"><div className="screening-toolbar"><label className="search-input"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="티커 또는 종목 검색" /></label><div className="filter-group" role="group" aria-label="스크리닝 결과 필터"><button className={!passedOnly ? "selected" : ""} onClick={() => setPassedOnly(false)}>전체 항목 <span>{results.length}</span></button><button className={passedOnly ? "selected" : ""} onClick={() => setPassedOnly(true)}><Check size={14} /> 통과 항목 <span>{results.filter((result) => result.passed).length}</span></button></div><div className="filter-popover"><button className={`filter-button ${sectorFilter.length ? "selected" : ""}`} onClick={() => setSectorMenuOpen((open) => !open)} aria-expanded={sectorMenuOpen}>섹터 {sectorFilter.length ? `(${sectorFilter.length})` : ""}<ChevronDown size={14} /></button>{sectorMenuOpen && <div className="sector-menu"><strong>섹터 선택</strong>{sectors.map((sector) => <label key={sector}><input type="checkbox" checked={sectorFilter.includes(sector)} onChange={() => setSectorFilter(sectorFilter.includes(sector) ? sectorFilter.filter((item) => item !== sector) : [...sectorFilter, sector])} />{sector}</label>)}<button onClick={() => setSectorFilter([])}>전체 섹터</button></div>}</div><label className="score-filter">최소 점수<input type="number" min="0" max="9" value={minimumScore || ""} placeholder="0" onChange={(event) => setMinimumScore(Math.max(0, Number(event.target.value) || 0))} /></label><label className="select-filter">VCP<select value={vcpFilter} onChange={(event) => setVcpFilter(event.target.value)}><option value="all">전체</option><option value="found">발견</option><option value="not-found">미발견</option></select></label><button className="filter-button reset-filter" onClick={() => { setSectorFilter([]); setVcpFilter("all"); setMinimumScore(0); setQuery(""); setPassedOnly(false); }}>필터 초기화</button><div className="column-settings"><button className="filter-button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}><Settings2 size={14} /> 열 설정 <ChevronDown size={14} /></button>{settingsOpen && <div className="column-menu"><strong>표시할 열</strong>{columnOrder.map((column) => <label key={column}><input type="checkbox" checked={visibleColumns.includes(column)} disabled={column === "symbol"} onChange={() => setVisibleColumns(visibleColumns.includes(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column])} />{columnLabels[column]}</label>)}<small><GripVertical size={12} /> 열 제목을 끌어 순서를 변경하세요.</small></div>}</div></div><div className="screening-result-count">현재 조건에 맞는 종목 <strong>{visibleResults.length.toLocaleString()}</strong>개</div><div className="table-wrap"><table className="screening-table"><thead><tr><th className="sticky-col">관심</th>{displayedColumns.map((column) => <th key={column} draggable onDragStart={() => setDraggedColumn(column)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveColumn(column)}><button className="table-sort-button draggable-heading" onClick={() => changeSort(column)} aria-label={`${columnLabels[column]} 정렬`}><GripVertical size={12} />{columnLabels[column]}{sortColumn === column ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}</button></th>)}</tr></thead><tbody>{sortedResults.map((result) => { const isExpanded = expanded === result.symbol; const interestState = getInterestState(watchlist.find((item) => item.ticker === result.symbol)); return <Fragment key={result.symbol}><tr className={isExpanded ? "expanded-row" : ""}><td className="sticky-col"><button className={`save-button interest-${interestState}`} onClick={() => onToggleWatch(result.symbol)} aria-label={`${result.symbol} 관심 표시`}><InterestStar state={interestState} /></button></td>{displayedColumns.map((column) => <td key={column}>{renderScreeningCell(column, result, () => setExpanded(isExpanded ? null : result.symbol))}</td>)}</tr>{isExpanded && <tr className="details-row"><td colSpan={displayedColumns.length + 1}><ScreeningDetails result={result} /></td></tr>}</Fragment>})}</tbody></table>{!visibleResults.length && <div className="empty-state">조건에 맞는 스크리닝 결과가 없습니다.</div>}</div></section></>;
}

function ScreeningPopupHost({ results, analysisRows }: { results: ScreeningResult[]; analysisRows: AnalysisRow[] }) {
  const [selected, setSelected] = useState<ScreeningResult | null>(null);

  useEffect(() => {
    const openPopup = (event: Event) => {
      const symbol = (event as CustomEvent<string>).detail;
      setSelected(results.find((result) => result.symbol === symbol) ?? null);
    };
    window.addEventListener("firefinder:screening-popup", openPopup);
    return () => window.removeEventListener("firefinder:screening-popup", openPopup);
  }, [results]);

  if (!selected) return null;
  const history = analysisRows.filter((row) => row.symbol === selected.symbol).slice(0, 8);
  return <div className="screening-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="screening-modal" role="dialog" aria-modal="true" aria-labelledby="screening-modal-title"><div className="screening-modal-header"><div><span className="section-label">ANALYSIS REPORT</span><h2 id="screening-modal-title">{selected.symbol} 분석</h2></div><button className="modal-close" onClick={() => setSelected(null)} aria-label="팝업 닫기">×</button></div><ScreeningDetails result={selected} /><div className="screening-modal-history"><strong>분석 이력 · 거래일 기준</strong>{history.length ? <div className="modal-history-list"><div className="modal-history-heading"><span>스크리닝일</span><b>점수</b><em>7일</em><em>15일</em><em>1개월</em></div>{history.map((row) => <div key={`${row.symbol}-${row.screening_date}`}><span>{row.screening_date ?? "-"}</span><b>{row.score ?? "-"}/{row.max_score ?? "-"}</b><em>{formatHorizonReturn(row, 7)}</em><em>{formatHorizonReturn(row, 15)}</em><em>{formatHorizonReturn(row, 21)}</em></div>)}</div> : <p>저장된 분석 이력이 없습니다.</p>}</div></section></div>;
}

function formatHorizonReturn(row: AnalysisRow, period: number) {
  const result = row.horizon_returns[String(period)];
  if (result?.return_percent == null) return result?.status === "pending" ? "대기" : "-";
  return `${result.return_percent.toFixed(2)}%`;
}

function renderScreeningCell(column: ColumnKey, result: ScreeningResult, toggleDetails: () => void) {
  if (column === "symbol") return <button className="ticker-button" onClick={() => window.dispatchEvent(new CustomEvent("firefinder:screening-popup", { detail: result.symbol }))} aria-label={`${result.symbol} 분석 팝업 열기`}><strong>{result.symbol}</strong><small>{result.company_name ?? result.industry ?? "분석 팝업 열기"}</small><small>{result.screening_date ?? "날짜 없음"}</small></button>;
  if (column === "sector") return <><strong>{result.sector ?? "-"}</strong><small>{result.industry ?? "-"}</small></>;
  if (column === "score") return <button className="score-detail-button" onClick={toggleDetails} aria-label={`${result.symbol} 점수 상세 보기`}>{result.score}<em>/{result.max_score}</em></button>;
  if (column === "price") return result.current_price ? `$${result.current_price.toFixed(2)}` : "-";
  if (column === "trailingPE") return result.trailing_pe?.toFixed(2) ?? "-";
  if (column === "forwardPE") return result.forward_pe?.toFixed(2) ?? "-";
  if (column === "volume") return result.volume_ratio == null ? "-" : `${result.volume_ratio.toFixed(2)}x`;
  if (column === "rs") return <span className="rs-score">{result.rs_score?.toFixed(1) ?? "-"}</span>;
  if (column === "vcp") return <span className={`status-pill ${result.vcp_found ? "passed" : "watch"}`}>{result.vcp_found == null ? "-" : result.vcp_found ? "발견" : "미발견"}</span>;
  if (column === "pivotPrice") return formatVcpNumber(result.vcp?.pivot_price, "price");
  if (column === "pivotDate") return typeof result.vcp?.pivot_date === "string" ? result.vcp.pivot_date : "-";
  if (column === "pivotDistance") return formatVcpNumber(result.vcp?.pivot_distance_percent, "percent");
  if (column === "streak") return result.sepa_streak_days ? `${result.sepa_streak_days}일` : "-";
  return <span className={`status-pill ${result.passed ? "passed" : "watch"}`}>{result.passed ? "통과" : "미달"}</span>;
}

function formatVcpNumber(value: unknown, format: "price" | "percent") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return format === "price" ? `$${value.toFixed(2)}` : `${value.toFixed(1)}%`;
}

function getInitialView(): View {
  const requestedView = new URLSearchParams(window.location.search).get("view");
  return requestedView === "screening" || requestedView === "analysis-report" || requestedView === "watchlist" || requestedView === "market-flow" || requestedView === "journal" || requestedView === "history" ? requestedView : "dashboard";
}

function getInitialAnalysisSymbol(): string | null {
  return new URLSearchParams(window.location.search).get("symbol");
}

function ScreeningDetails({ result }: { result: ScreeningResult }) {
  const labels: Record<string, string> = { price_above_150_day_average: "현재가 > 150일선", price_above_200_day_average: "현재가 > 200일선", average_50_above_150: "50일선 > 150일선", average_150_above_200: "150일선 > 200일선", average_200_rising: "200일선 상승", near_52_week_high: "52주 고가 근접", above_52_week_low: "52주 저가 대비 상승", volume_support: "거래량 지지", relative_strength_vs_spy: "시장 대비 RS 강세" };
  return <div className="screening-details"><div className="detail-heading"><strong>{result.symbol} 상세 분석</strong><span>{result.screening_date ?? "날짜 없음"}</span></div><div className="detail-metrics"><span>50일선 <b>{formatMetric(result.average_50)}</b></span><span>150일선 <b>{formatMetric(result.average_150)}</b></span><span>200일선 <b>{formatMetric(result.average_200)}</b></span><span>거래량비 <b>{formatMetric(result.volume_ratio)}x</b></span><span>RS <b>{formatMetric(result.rs_score)}</b></span></div><div className="criteria-grid">{Object.entries(result.conditions ?? {}).map(([key, passed]) => <span key={key} className={passed ? "criterion-pass" : "criterion-fail"}><b>{passed ? "True" : "False"}</b>{labels[key] ?? key}</span>)}</div></div>;
}

function formatMetric(value: number | null | undefined) { return value == null ? "-" : value.toFixed(2); }
function loadColumns(): ColumnKey[] { try { const saved = JSON.parse(localStorage.getItem("firefinder.screening.columnOrder") ?? "null"); return Array.isArray(saved) && saved.every((value) => defaultColumns.includes(value)) ? [...saved, ...defaultColumns.filter((column) => !saved.includes(column))] : defaultColumns; } catch { return defaultColumns; } }
function loadVisibleColumns(): ColumnKey[] { try { const saved = JSON.parse(localStorage.getItem("firefinder.screening.visibleColumns") ?? "null"); if (!Array.isArray(saved)) return defaultColumns; const stored = saved.filter((value): value is ColumnKey => defaultColumns.includes(value) && value !== "symbol"); return ["symbol", ...stored, ...defaultColumns.filter((column) => column !== "symbol" && !stored.includes(column))]; } catch { return defaultColumns; } }

function WatchlistView({ items, results, onToggleWatch }: { items: WatchlistItem[]; results: ScreeningResult[]; onToggleWatch: (ticker: string) => void }) {
  return <><ViewIntro eyebrow="YOUR IDEAS" title="Watchlist" copy="상승 관심과 하락 관심 종목을 별 색상으로 구분해 관리합니다." /><section className="watch-grid">{items.length ? items.map((item) => { const result = results.find((entry) => entry.symbol === item.ticker); const state = getInterestState(item); return <article className="watch-card" key={item.ticker}><div className="watch-card-header"><span className={`signal-mark ${state}`}><InterestStar state={state} size={14} /></span><button className={`save-button interest-${state}`} onClick={() => onToggleWatch(item.ticker)} aria-label={`${item.ticker} 관심 상태 변경`}><InterestStar state={state} size={15} /></button></div><h3>{item.ticker}</h3><p>{result?.industry ?? "Saved idea"}</p><div className="watch-card-footer"><span>{result?.score ? `${result.score}/${result.max_score}` : "No latest score"}</span><span className={`status-pill ${state}`}>{state === "rising" ? "상승 관심" : "하락 관심"}</span></div></article>; }) : <div className="empty-state panel">아직 저장한 관심 종목이 없습니다.<br /><span>스크리닝 화면에서 별표를 눌러 상승 관심과 하락 관심을 지정하세요.</span></div>}</section></>;
}

function HistoryView({ runs }: { runs: Run[] }) {
  return <><ViewIntro eyebrow="SCREENING ARCHIVE" title="History" copy="실행된 스크리닝과 전략 버전을 시간순으로 확인합니다." /><section className="panel full-panel"><div className="history-list">{runs.length ? runs.map((run) => <div className="history-row" key={run.id}><span className="history-icon"><Clock3 size={16} /></span><div><strong>{run.screening_date}</strong><small>{run.strategy} · {run.provider}</small></div><span className={`status-pill ${run.status === "completed" ? "passed" : "watch"}`}>{run.status}</span><ArrowUpRight size={16} /></div>) : <div className="empty-state">아직 저장된 스크리닝 실행 기록이 없습니다.</div>}</div></section></>;
}

function JournalView() {
  const [entries, setEntriesState] = useState<JournalEntry[]>([]);
  const setEntries = (update: ((current: JournalEntry[]) => JournalEntry[]) | JournalEntry[]) => { setEntriesState((current) => { const next = typeof update === "function" ? update(current) : update; const removed = current.find((entry) => !next.some((item) => item.id === entry.id)); if (removed) void fetch(`/api/journal/${removed.id}`, { method: "DELETE" }); return next; }); };
  const [ticker, setTicker] = useState("");
  const [side, setSide] = useState<JournalEntry["side"]>("Buy");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");

  useEffect(() => { fetch("/api/journal").then(readJson<{ items: JournalEntry[] }>).then((payload) => setEntries(payload.items)).catch(() => setEntries([])); }, []);
  const realized = entries.reduce((total, item) => total + (item.exitPrice == null ? 0 : (item.exitPrice - item.entryPrice) * item.quantity * (item.side === "Buy" ? 1 : -1)), 0);
  const openCount = entries.filter((item) => item.exitPrice == null).length;
  async function addEntry(event: React.FormEvent) { event.preventDefault(); const price = Number(entryPrice); const size = Number(quantity); if (!ticker.trim() || !Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) return; const response = await fetch("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, side, entry_price: price, exit_price: exitPrice ? Number(exitPrice) : null, quantity: size, note }) }); if (!response.ok) return; const created = await response.json() as JournalEntry; setEntries((current) => [created, ...current]); setTicker(""); setEntryPrice(""); setExitPrice(""); setQuantity("1"); setNote(""); }
  return <><ViewIntro eyebrow="TRADE JOURNAL" title="Trade Journal" copy="Capture your trade rationale, outcomes, and recurring patterns in one place." /><section className="journal-summary"><MetricCard label="Total trades" value={entries.length} note="saved trades" tone="blue" /><MetricCard label="Open positions" value={openCount} note="currently open" tone="mint" /><article className="metric-card coral"><span className="metric-label">Realized P&L</span><div className={`metric-value ${realized >= 0 ? "journal-positive" : "journal-negative"}`}>{realized >= 0 ? "+" : ""}${realized.toFixed(2)}</div><small>closed trades</small></article></section><section className="journal-layout"><form className="panel journal-form" onSubmit={addEntry}><div className="panel-header"><div><span className="section-label">NEW ENTRY</span><h3>Log a trade</h3></div><Plus size={18} /></div><div className="journal-fields"><label>Ticker<input value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="NVDA" /></label><label>Side<select value={side} onChange={(event) => setSide(event.target.value as JournalEntry["side"])}><option>Buy</option><option>Sell</option></select></label><label>Entry price<input type="number" min="0" step="0.01" value={entryPrice} onChange={(event) => setEntryPrice(event.target.value)} placeholder="0.00" /></label><label>Exit price<input type="number" min="0" step="0.01" value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} placeholder="Open" /></label><label>Quantity<input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label className="journal-note">Notes<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Entry rationale, review notes" rows={3} /></label></div><button className="journal-submit" type="submit">Save trade <Plus size={14} /></button></form><section className="panel journal-history"><div className="panel-header"><div><span className="section-label">RECENT TRADES</span><h3>Recent trades</h3></div></div>{entries.length ? <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th>Date</th><th>Ticker</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>P&L</th><th>Delete</th></tr></thead><tbody>{entries.map((item) => { const pnl = item.exitPrice == null ? null : (item.exitPrice - item.entryPrice) * item.quantity * (item.side === "Buy" ? 1 : -1); return <tr key={item.id}><td>{item.date}</td><td><strong>{item.ticker}</strong><small>{item.note || "No notes"}</small></td><td><span className={`journal-side ${item.side === "Buy" ? "buy" : "sell"}`}>{item.side}</span></td><td>${item.entryPrice.toFixed(2)}</td><td>{item.exitPrice == null ? "-" : `$${item.exitPrice.toFixed(2)}`}</td><td>{item.quantity}</td><td className={pnl == null ? "" : pnl >= 0 ? "return-positive" : "return-negative"}>{pnl == null ? "Open" : `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`}</td><td><button className="journal-delete" onClick={() => setEntries((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`Delete ${item.ticker} trade`}><Trash2 size={14} /></button></td></tr>; })}</tbody></table></div> : <div className="journal-empty"><BookOpen size={22} /><strong>No trades logged yet.</strong><span>Use the form to record your first trade.</span></div>}</section></section></>;
}


function RecentTable({ results, analysisRows, onOpenAnalysis }: { results: ScreeningResult[]; analysisRows: AnalysisRow[]; onOpenAnalysis: () => void }) { const latestByTicker = [...new Map(analysisRows.map((row) => [row.symbol, row])).values()].sort((left, right) => (right.average_returns["21"] ?? Number.NEGATIVE_INFINITY) - (left.average_returns["21"] ?? Number.NEGATIVE_INFINITY)); const rows = latestByTicker.length ? latestByTicker.slice(0, 5) : results.slice(0, 5).map((result) => ({ symbol: result.symbol, sector: result.sector, industry: result.industry, score: result.score, max_score: result.max_score, screening_price: result.current_price, rs_score: result.rs_score, average_returns: { "21": null }, is_watchlisted: false } as unknown as AnalysisRow)); return <section className="panel activity-panel"><PanelTitle eyebrow="LATEST ANALYSIS" title="최근 분석 결과" action={<button className="text-button" onClick={onOpenAnalysis}>전체 기록 <ArrowUpRight size={14} /></button>} /><div className="table-wrap"><table><thead><tr><th>종목</th><th>섹터</th><th>점수</th><th>현재가</th><th>RS 강도</th><th>1개월 평균 수익률</th></tr></thead><tbody>{rows.map((row) => <tr key={row.symbol}><td><strong>{row.symbol}</strong><small>{row.industry ?? "-"}</small></td><td>{row.sector ?? "-"}</td><td><span className="table-score">{row.score ?? "-"}<em>/{row.max_score ?? "-"}</em></span></td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td><td><span className="rs-score">{row.rs_score?.toFixed(1) ?? "-"}</span></td><td className={row.average_returns["21"] != null && row.average_returns["21"] >= 0 ? "return-positive" : "return-negative"}>{row.average_returns["21"] == null ? "-" : `${row.average_returns["21"]}%`}</td></tr>)}</tbody></table></div></section>; }
function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action: React.ReactNode }) { return <div className="panel-header"><div><span className="section-label">{eyebrow}</span><h3>{title}</h3></div><div className="panel-action">{action}</div></div>; }
function TrendChart({ points, sectors }: { points: TrendPoint[]; sectors: string[] }) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const colors = ["#2f7d4a", "#3d9270", "#4d78a8", "#b28b25", "#b85c48", "#7c5a98"];
  const largestValue = Math.max(1, ...points.flatMap((point) => Object.values(point.sectors)));
  const maximum = Math.max(10, Math.ceil(largestValue / 25) * 25);
  const axisValues = Array.from({ length: 5 }, (_, index) => Math.round(maximum - (maximum * index) / 4));
  const xFor = (index: number) => points.length === 1 ? 50 : 4 + (index / (points.length - 1)) * 92;
  const yFor = (value: number) => 96 - (Math.min(value, maximum) / maximum) * 92;
  const hoveredValue = hoveredSector ? points[points.length - 1]?.sectors[hoveredSector] ?? 0 : null;
  const middleDate = points.length > 2 ? points[Math.floor(points.length / 2)]?.date : null;
  return <div className="chart-area"><div className="chart-y-axis">{axisValues.map((value) => <span key={value}>{value}</span>)}</div><div className="chart-plot"><div className="grid-lines"><i /><i /><i /><i /><i /></div><div className="line-hover-label">{hoveredSector ? <><b>{hoveredSector}</b><span>최근 {hoveredValue}개 통과</span></> : "선에 마우스를 올리면 섹터가 표시됩니다."}</div><div className="line-chart-wrap"><svg className="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="섹터별 SEPA 통과 종목 수 추이">{sectors.map((sector, sectorIndex) => { const color = colors[sectorIndex % colors.length]; const coordinates = points.map((point, index) => `${xFor(index)},${yFor(point.sectors[sector] ?? 0)}`).join(" "); const isDimmed = hoveredSector !== null && hoveredSector !== sector; const markerSize = hoveredSector === sector ? 3.4 : 2.7; return <g key={sector} className={isDimmed ? "trend-line dimmed" : "trend-line"} onMouseEnter={() => setHoveredSector(sector)} onMouseLeave={() => setHoveredSector(null)}><polyline className="trend-hit-area" points={coordinates} fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /><polyline className="trend-visible-line" points={coordinates} fill="none" stroke={color} strokeWidth={hoveredSector === sector ? "3.8" : "2.8"} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />{points.map((point, index) => { const x = xFor(index); const y = yFor(point.sectors[sector] ?? 0); return <g key={`${sector}-${point.date}`} className="dashboard-point" transform={`translate(${x} ${y}) scale(.25 1)`}><circle r={markerSize} fill="#f7f8f4" stroke={color} strokeWidth={hoveredSector === sector ? "2" : "1.7"} vectorEffect="non-scaling-stroke"><title>{`${point.date} · ${sector}: ${point.sectors[sector] ?? 0}`}</title></circle></g>; })}</g>; })}</svg></div><div className={`chart-x-axis ${middleDate ? "" : "two-dates"}`}><span>{points[0]?.date ?? "20일 전"}</span>{middleDate && <span>{middleDate}</span>}<span>{points[points.length - 1]?.date ?? "오늘"}</span></div></div></div>;
}
function SignalRow({ ticker, score, color }: { ticker: string; score: string; color: string }) { return <div className="signal-row"><span className={`signal-mark ${color}`}><Star size={13} fill="currentColor" /></span><div><strong>{ticker}</strong><small>Latest SEPA result</small></div><span className="signal-score">{score}<small>Strong</small></span></div>; }
function MetricCard({ label, value, note, tone, trend, trendTone = "neutral", onClick }: { label: string; value: number; note: string; tone: string; trend?: string; trendTone?: "positive" | "negative" | "neutral"; onClick?: () => void }) { return <article className={`metric-card ${tone} ${onClick ? "clickable" : ""}`} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}><span className="metric-label">{label}</span><div className="metric-value">{value.toLocaleString()}{trend !== undefined && trend !== null && <em className={trendTone}>{trend}</em>}</div><small>{note}</small></article>; }
function ViewIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div className="view-intro"><span className="section-label">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>; }
function LegacyAnalysisReportViewCurrent() {
  const [horizon, setHorizon] = useState(21);
  const [passedOnly, setPassedOnly] = useState(true);
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: String(horizon), passed_only: String(passedOnly), status, min_score: String(minScore) });
    if (sector) params.set("sector", sector);
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [horizon, passedOnly, sector, status, minScore]);

  const summary = report?.summary;
  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  return <>
    <ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="SEPA 통과 종목의 수익률과 스크리닝 세부 지표를 함께 분석합니다." />
    <section className="analysis-controls"><label>요약 기준 기간<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{periods.map((period) => <option key={period} value={period}>{analysisHorizonLabels[period] ?? `${period}일`}</option>)}</select></label><label>섹터<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="complete">완료</option><option value="pending">대기</option></select></label><label>최소 점수<input type="number" min="0" max="9" value={minScore || ""} placeholder="0" onChange={(event) => setMinScore(Math.max(0, Number(event.target.value) || 0))} /></label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => setPassedOnly(event.target.checked)} /> SEPA 통과만</label></section>
    <section className="analysis-summary"><MetricCard label="분석 표본" value={summary?.sample_count ?? 0} note="선택 기간 완료 수익률" tone="blue" /><AnalysisMetric label="평균 수익률" value={summary?.average_return} suffix="%" tone="green" /><AnalysisMetric label="중앙값 수익률" value={summary?.median_return} suffix="%" tone="gold" /><AnalysisMetric label="승률" value={summary?.win_rate} suffix="%" tone="mint" /></section>
    <section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>기간별 수익률 비교</strong><span>{loading ? "불러오는 중..." : `${report?.summary.row_count ?? 0}개 종목`}</span></div><div className="table-wrap"><table className="analysis-table"><thead><tr><th>티커</th><th>스크리닝일</th><th>섹터</th><th>점수</th><th>VCP</th><th>RS 강도</th><th>거래량비</th><th>진입 가격</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{report?.rows.map((row) => { const expanded = expandedSymbol === `${row.symbol}-${row.screening_date}`; return <Fragment key={`${row.symbol}-${row.screening_date}`}><tr className={expanded ? "expanded-row" : ""}><td><button className="ticker-button" onClick={() => setExpandedSymbol(expanded ? null : `${row.symbol}-${row.screening_date}`)}><strong>{row.symbol}</strong><small>{row.industry ?? "상세 보기"}</small></button></td><td>{row.screening_date ?? "-"}</td><td>{row.sector ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.vcp_found == null ? "-" : row.vcp_found ? "발견" : "미발견"}</td><td>{row.rs_score == null ? "-" : row.rs_score.toFixed(1)}</td><td>{row.volume_ratio == null ? "-" : `${row.volume_ratio.toFixed(2)}x`}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>{expanded && <tr className="details-row"><td colSpan={8 + periods.length}><ScreeningDetails result={{ symbol: row.symbol, company_name: row.industry ?? undefined, sector: row.sector, industry: row.industry, score: row.score ?? 0, max_score: row.max_score ?? 0, passed: row.passed, current_price: row.screening_price, volume_ratio: row.volume_ratio, rs_score: row.rs_score, vcp_found: row.vcp_found, conditions: row.conditions, vcp: row.vcp }} /></td></tr>}</Fragment>; })}</tbody></table>{!loading && !report?.rows.length && <div className="empty-state">선택한 조건의 분석 데이터가 없습니다.</div>}</div></section>
  </>;
}

function LegacyAnalysisReportViewOld() {
  const [horizon, setHorizon] = useState(21);
  const [passedOnly, setPassedOnly] = useState(true);
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [minAvgReturn, setMinAvgReturn] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: String(horizon), passed_only: String(passedOnly), status, min_score: String(minScore) });
    if (sector) params.set("sector", sector);
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [horizon, passedOnly, sector, status, minScore]);

  const summary = report?.summary;
  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="SEPA 통과 종목의 미래 수익률을 기간별 칼럼으로 비교 분석합니다." /><section className="analysis-controls"><label>요약 기준 기간<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{periods.map((period) => <option key={period} value={period}>{analysisHorizonLabels[period] ?? `${period}일`}</option>)}</select></label><label>섹터<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="complete">완료</option><option value="pending">대기</option></select></label><label>최소 점수<input type="number" min="0" max="9" value={minScore || ""} placeholder="0" onChange={(event) => setMinScore(Math.max(0, Number(event.target.value) || 0))} /></label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => setPassedOnly(event.target.checked)} /> SEPA 통과만</label></section><section className="analysis-summary"><MetricCard label="분석 표본" value={summary?.sample_count ?? 0} note="선택 기간 완료 수익률" tone="blue" /><AnalysisMetric label="평균 수익률" value={summary?.average_return} suffix="%" tone="green" /><AnalysisMetric label="중앙값 수익률" value={summary?.median_return} suffix="%" tone="gold" /><AnalysisMetric label="승률" value={summary?.win_rate} suffix="%" tone="mint" /></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>기간별 수익률 비교</strong><span>{loading ? "불러오는 중..." : `${report?.summary.row_count ?? 0}개 종목`}</span></div><div className="table-wrap"><table className="analysis-table"><thead><tr><th>종목</th><th>스크리닝일</th><th>섹터</th><th>점수</th><th>진입 가격</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{report?.rows.map((row) => <tr key={`${row.symbol}-${row.screening_date}`}><td><strong>{row.symbol}</strong><small>{row.industry ?? "-"}</small></td><td>{row.screening_date ?? "-"}</td><td>{row.sector ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>)}</tbody></table>{!loading && !report?.rows.length && <div className="empty-state">선택한 조건의 분석 데이터가 없습니다.</div>}</div></section></>;
}

function LegacyAnalysisReportViewCurrent2() {
  const [horizon, setHorizon] = useState(21);
  const [passedOnly, setPassedOnly] = useState(true);
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [minAvgReturn, setMinAvgReturn] = useState("");
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(() => getInitialAnalysisSymbol());
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: String(horizon), passed_only: String(passedOnly), status, min_score: String(minScore) });
    if (sector) params.set("sector", sector);
    if (minAvgReturn) params.set("min_avg_return", minAvgReturn);
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [horizon, passedOnly, sector, status, minScore, minAvgReturn]);

  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  const allRows = report?.rows ?? [];
  const industries = [...new Set(allRows.map((row) => row.industry).filter((value): value is string => Boolean(value)))].sort();
  const filteredRows = allRows.filter((row) => (!industry || row.industry === industry) && (!tickerQuery || row.symbol.toLowerCase().includes(tickerQuery.toLowerCase())));
  const symbols = [...new Map(filteredRows.map((row) => [row.symbol, row])).values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const detailRows = selectedSymbol ? allRows.filter((row) => row.symbol === selectedSymbol && (!industry || row.industry === industry)) : [];
  const summary = report?.summary;
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="상단에서 종목을 선택하면 하단에서 날짜별 수익률과 스크리닝 상세를 확인합니다." /><section className="analysis-controls"><label>요약 기준 기간<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}>{periods.map((period) => <option key={period} value={period}>{analysisHorizonLabels[period] ?? `${period}일`}</option>)}</select></label><label>티커 검색<input value={tickerQuery} onChange={(event) => setTickerQuery(event.target.value)} placeholder="AAPL" /></label><label>섹터<select value={sector} onChange={(event) => { setSector(event.target.value); setSelectedSymbol(null); }}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>산업군<select value={industry} onChange={(event) => { setIndustry(event.target.value); setSelectedSymbol(null); }}><option value="">전체 산업군</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="complete">완료</option><option value="pending">대기</option></select></label><label>최소 점수<input type="number" min="0" max="9" value={minScore || ""} placeholder="0" onChange={(event) => setMinScore(Math.max(0, Number(event.target.value) || 0))} /></label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => { setPassedOnly(event.target.checked); setSelectedSymbol(null); }} /> SEPA 통과만</label></section><section className="analysis-summary"><MetricCard label="조회 종목" value={symbols.length} note="최근 6개월 내 스크리닝" tone="blue" /><AnalysisMetric label="평균 수익률" value={summary?.average_return} suffix="%" tone="green" /><AnalysisMetric label="중앙값 수익률" value={summary?.median_return} suffix="%" tone="gold" /><AnalysisMetric label="승률" value={summary?.win_rate} suffix="%" tone="mint" /></section><section className="panel full-panel analysis-symbol-panel"><div className="analysis-report-meta"><strong>스크리닝 종목 목록</strong><span>{loading ? "불러오는 중..." : `${symbols.length}개 티커`}</span></div><div className="table-wrap"><table className="analysis-symbol-table"><thead><tr><th>티커</th><th>섹터</th><th>산업군</th></tr></thead><tbody>{symbols.map((row) => <tr key={row.symbol} className={selectedSymbol === row.symbol ? "selected-row" : ""} onClick={() => setSelectedSymbol(row.symbol)}><td><button className="ticker-button"><strong>{row.symbol}</strong></button></td><td>{row.sector ?? "-"}</td><td>{row.industry ?? "-"}</td></tr>)}</tbody></table>{!loading && !symbols.length && <div className="empty-state">조건에 맞는 스크리닝 종목이 없습니다.</div>}</div></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>{selectedSymbol ? `${selectedSymbol} 기간별 수익률 비교` : "기간별 수익률 비교"}</strong><span>{selectedSymbol ? `${detailRows.length}개 스크리닝 기록` : "상단에서 티커를 선택하세요"}</span></div>{selectedSymbol && <div className="table-wrap"><table className="analysis-table"><thead><tr><th>스크리닝일</th><th>점수</th><th>VCP</th><th>RS 강도</th><th>거래량비</th><th>진입 가격</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{detailRows.map((row) => <tr key={`${row.symbol}-${row.screening_date}`}><td>{row.screening_date ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.vcp_found == null ? "-" : row.vcp_found ? "발견" : "미발견"}</td><td>{row.rs_score == null ? "-" : row.rs_score.toFixed(1)}</td><td>{row.volume_ratio == null ? "-" : `${row.volume_ratio.toFixed(2)}x`}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>)}</tbody></table></div>}</section></>;
}

function AnalysisReportView() {
  const [passedOnly, setPassedOnly] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [minAvgReturn, setMinAvgReturn] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: "21", passed_only: String(passedOnly), status: "all", min_score: "0" });
    if (sector) params.set("sector", sector);
    if (minAvgReturn) params.set("min_avg_return", minAvgReturn);
    if (watchlistOnly) params.set("watchlist_only", "true");
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [passedOnly, sector, minAvgReturn, watchlistOnly]);

  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  const allRows = report?.rows ?? [];
  const industries = [...new Set(allRows.map((row) => row.industry).filter((value): value is string => Boolean(value)))].sort();
  const filteredRows = allRows.filter((row) => (!industry || row.industry === industry) && (!tickerQuery || row.symbol.toLowerCase().includes(tickerQuery.toLowerCase())));
  const symbols = [...new Map(filteredRows.map((row) => [row.symbol, row])).values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const detailRows = selectedSymbol ? allRows.filter((row) => row.symbol === selectedSymbol) : [];
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="상단 종목 목록에서 티커를 선택하면 하단에 날짜별 분석이 표시됩니다." /><section className="analysis-controls"><label>티커 검색<input value={tickerQuery} onChange={(event) => setTickerQuery(event.target.value)} placeholder="AAPL" /></label><label>섹터<select value={sector} onChange={(event) => { setSector(event.target.value); setSelectedSymbol(null); }}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>산업군<select value={industry} onChange={(event) => { setIndustry(event.target.value); setSelectedSymbol(null); }}><option value="">전체 산업군</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>평균 수익률 ≥<input type="number" min="-100" max="1000" value={minAvgReturn} placeholder="예: 5" onChange={(event) => { setMinAvgReturn(event.target.value); setSelectedSymbol(null); }} /></label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => { setPassedOnly(event.target.checked); setSelectedSymbol(null); }} /> SEPA 통과만</label></section><section className="analysis-summary"><MetricCard label="조회 종목" value={symbols.length} note="최근 6개월 내 스크리닝" tone="blue" /></section><section className="panel full-panel analysis-symbol-panel"><div className="analysis-report-meta"><strong>스크리닝 종목 목록</strong><span>{loading ? "불러오는 중..." : `${symbols.length}개 티커`}</span></div><div className="table-wrap"><table className="analysis-symbol-table"><thead><tr><th>티커</th><th>섹터</th><th>산업군</th><th>관심목록</th><th>7일 평균</th><th>15일 평균</th><th>1개월 평균</th><th>6주 평균</th></tr></thead><tbody>{symbols.map((row) => <tr key={row.symbol} className={selectedSymbol === row.symbol ? "selected-row" : ""} onClick={() => setSelectedSymbol(row.symbol)}><td><button className="ticker-button"><strong>{row.symbol}</strong></button></td><td>{row.sector ?? "-"}</td><td>{row.industry ?? "-"}</td><td>{row.is_watchlisted ? "등록" : "-"}</td>{[7, 15, 21, 30].map((period) => <td key={period}>{row.average_returns[String(period)] == null ? "-" : `${row.average_returns[String(period)]?.toFixed(2)}%`}</td>)}</tr>)}</tbody></table>{!loading && !symbols.length && <div className="empty-state">조건에 맞는 스크리닝 종목이 없습니다.</div>}</div></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>{selectedSymbol ? `${selectedSymbol} 기간별 수익률 비교` : "기간별 수익률 비교"}</strong><span>{selectedSymbol ? `${detailRows.length}개 기록` : "상단에서 티커를 선택하세요"}</span></div>{selectedSymbol && <div className="table-wrap"><table className="analysis-table"><thead><tr><th>스크리닝일</th><th>점수</th><th>VCP</th><th>RS 강도</th><th>거래량비</th><th>진입 가격</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{detailRows.map((row) => <tr key={`${row.symbol}-${row.screening_date}`}><td>{row.screening_date ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.vcp_found == null ? "-" : row.vcp_found ? "발견" : "미발견"}</td><td>{row.rs_score == null ? "-" : row.rs_score.toFixed(1)}</td><td>{row.volume_ratio == null ? "-" : `${row.volume_ratio.toFixed(2)}x`}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>)}</tbody></table></div>}</section></>;
}

function AnalysisReportViewWithWatchlistFilter() {
  const [passedOnly, setPassedOnly] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [minAvgReturn, setMinAvgReturn] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: "21", passed_only: String(passedOnly), status: "all", min_score: "0" });
    if (sector) params.set("sector", sector);
    if (minAvgReturn) params.set("min_avg_return", minAvgReturn);
    if (watchlistOnly) params.set("watchlist_only", "true");
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [passedOnly, watchlistOnly, sector, minAvgReturn]);

  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  const rows = report?.rows ?? [];
  const industries = [...new Set(rows.map((row) => row.industry).filter((value): value is string => Boolean(value)))].sort();
  const filteredRows = rows.filter((row) => (!industry || row.industry === industry) && (!tickerQuery || row.symbol.toLowerCase().includes(tickerQuery.toLowerCase())));
  const symbols = [...new Map(filteredRows.map((row) => [row.symbol, row])).values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const details = selectedSymbol
    ? [...new Map(rows.filter((row) => row.symbol === selectedSymbol).map((row) => [row.screening_date ?? `${row.symbol}-unknown`, row])).values()]
    : [];
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="상단 종목 목록에서 티커를 선택하면 하단에 날짜별 분석이 표시됩니다." /><section className="analysis-controls"><label>티커 검색<input value={tickerQuery} onChange={(event) => setTickerQuery(event.target.value)} placeholder="AAPL" /></label><label>섹터<select value={sector} onChange={(event) => { setSector(event.target.value); setSelectedSymbol(null); }}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>산업군<select value={industry} onChange={(event) => { setIndustry(event.target.value); setSelectedSymbol(null); }}><option value="">전체 산업군</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>평균 수익률 ≥<input type="number" value={minAvgReturn} placeholder="예: 5" onChange={(event) => { setMinAvgReturn(event.target.value); setSelectedSymbol(null); }} /></label><label className="analysis-check"><input type="checkbox" checked={watchlistOnly} onChange={(event) => { setWatchlistOnly(event.target.checked); setSelectedSymbol(null); }} /> 관심종목만</label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => { setPassedOnly(event.target.checked); setSelectedSymbol(null); }} /> SEPA 통과만</label></section><section className="panel full-panel analysis-symbol-panel"><div className="analysis-report-meta"><strong>스크리닝 종목 목록</strong><span>{loading ? "불러오는 중..." : `${symbols.length}개 티커`}</span></div><div className="table-wrap"><table className="analysis-symbol-table"><thead><tr><th>티커</th><th>섹터</th><th>산업군</th><th>관심목록</th><th>7일 평균</th><th>15일 평균</th><th>1개월 평균</th><th>6주 평균</th></tr></thead><tbody>{symbols.map((row) => <tr key={row.symbol} className={selectedSymbol === row.symbol ? "selected-row" : ""} onClick={() => setSelectedSymbol(row.symbol)}><td><button className="ticker-button"><strong>{row.symbol}</strong></button></td><td>{row.sector ?? "-"}</td><td>{row.industry ?? "-"}</td><td>{row.is_watchlisted ? "등록" : "-"}</td>{[7, 15, 21, 30].map((period) => <td key={period}>{row.average_returns[String(period)] == null ? "-" : `${row.average_returns[String(period)]?.toFixed(2)}%`}</td>)}</tr>)}</tbody></table>{!loading && !symbols.length && <div className="empty-state">조건에 맞는 스크리닝 종목이 없습니다.</div>}</div></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>{selectedSymbol ? `${selectedSymbol} 기간별 수익률 비교` : "기간별 수익률 비교"}</strong><span>{selectedSymbol ? `${details.length}개 기록` : "상단에서 티커를 선택하세요"}</span></div>{selectedSymbol && <div className="table-wrap"><table className="analysis-table"><thead><tr><th>스크리닝일</th><th>점수</th><th>VCP</th><th>RS 강도</th><th>거래량비</th><th>진입 가격</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{details.map((row) => <tr key={`${row.symbol}-${row.screening_date}`}><td>{row.screening_date ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.vcp_found == null ? "-" : row.vcp_found ? "발견" : "미발견"}</td><td>{row.rs_score == null ? "-" : row.rs_score.toFixed(1)}</td><td>{row.volume_ratio == null ? "-" : `${row.volume_ratio.toFixed(2)}x`}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>)}</tbody></table></div>}</section></>;
}

function AnalysisReportViewWithSorting({ watchlist }: { watchlist: WatchlistItem[] }) {
  const [passedOnly, setPassedOnly] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [minAvgReturn, setMinAvgReturn] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(() => getInitialAnalysisSymbol());
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"symbol" | "sector" | "industry" | "watchlist" | "trailing_pe" | "forward_pe" | "average_returns.7" | "average_returns.15" | "average_returns.21" | "average_returns.30">("symbol");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: "21", passed_only: String(passedOnly), status: "all", min_score: "0" });
    if (sector) params.set("sector", sector);
    if (minAvgReturn) params.set("min_avg_return", minAvgReturn);
    if (watchlistOnly) params.set("watchlist_only", "true");
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [passedOnly, watchlistOnly, sector, minAvgReturn]);

  const periods = report?.horizons ?? Object.keys(analysisHorizonLabels).map(Number);
  const rows = report?.rows ?? [];
  const industries = [...new Set(rows.map((row) => row.industry).filter((value): value is string => Boolean(value)))].sort();
  const filteredRows = rows.filter((row) => (!industry || row.industry === industry) && (!tickerQuery || row.symbol.toLowerCase().includes(tickerQuery.toLowerCase())));
  const symbols = [...new Map(filteredRows.map((row) => [row.symbol, row])).values()];
  const interestStateFor = (ticker: string) => getInterestState(watchlist.find((item) => item.ticker === ticker));
  function changeSort(nextKey: typeof sortKey) { setSortDirection(sortKey === nextKey && sortDirection === "asc" ? "desc" : "asc"); setSortKey(nextKey); }
  function sortValue(row: AnalysisRow) { if (sortKey === "watchlist") return interestStateFor(row.symbol) === "none" ? 0 : 1; if (sortKey === "trailing_pe") return row.trailing_pe ?? Number.NEGATIVE_INFINITY; if (sortKey === "forward_pe") return row.forward_pe ?? Number.NEGATIVE_INFINITY; if (sortKey.startsWith("average_returns.")) return row.average_returns[sortKey.split(".")[1]] ?? Number.NEGATIVE_INFINITY; if (sortKey === "symbol") return row.symbol; if (sortKey === "sector") return row.sector ?? ""; return row.industry ?? ""; }
  symbols.sort((left, right) => { const a = sortValue(left); const b = sortValue(right); const result = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? "")); return sortDirection === "asc" ? result : -result; });
  const details = selectedSymbol
    ? [...new Map(rows.filter((row) => row.symbol === selectedSymbol).map((row) => [row.screening_date ?? `${row.symbol}-unknown`, row])).values()]
    : [];
  const sortIndicator = (key: typeof sortKey) => sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : "";
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="상단 종목 목록을 정렬하고 하단에서 티커별 날짜 상세를 확인합니다." /><section className="analysis-controls"><label>티커 검색<input value={tickerQuery} onChange={(event) => setTickerQuery(event.target.value)} placeholder="AAPL" /></label><label>섹터<select value={sector} onChange={(event) => { setSector(event.target.value); setSelectedSymbol(null); }}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>산업군<select value={industry} onChange={(event) => { setIndustry(event.target.value); setSelectedSymbol(null); }}><option value="">전체 산업군</option>{industries.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>평균 수익률 ≥<input type="number" value={minAvgReturn} placeholder="예: 5" onChange={(event) => { setMinAvgReturn(event.target.value); setSelectedSymbol(null); }} /></label><label className="analysis-check"><input type="checkbox" checked={watchlistOnly} onChange={(event) => { setWatchlistOnly(event.target.checked); setSelectedSymbol(null); }} /> 관심종목만</label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => { setPassedOnly(event.target.checked); setSelectedSymbol(null); }} /> SEPA 통과만</label></section><section className="panel full-panel analysis-symbol-panel"><div className="analysis-report-meta"><strong>스크리닝 종목 목록</strong><span>{loading ? "불러오는 중..." : `${symbols.length}개 티커`}</span></div><div className="table-wrap"><table className="analysis-symbol-table"><thead><tr><th><button className="table-sort-button" onClick={() => changeSort("symbol")}>티커{sortIndicator("symbol")}</button></th><th><button className="table-sort-button" onClick={() => changeSort("sector")}>섹터{sortIndicator("sector")}</button></th><th><button className="table-sort-button" onClick={() => changeSort("industry")}>산업군{sortIndicator("industry")}</button></th><th><button className="table-sort-button" onClick={() => changeSort("watchlist")}>관심목록{sortIndicator("watchlist")}</button></th><th><button className="table-sort-button" onClick={() => changeSort("trailing_pe")}>Trailing P/E{sortIndicator("trailing_pe")}</button></th><th><button className="table-sort-button" onClick={() => changeSort("forward_pe")}>Forward P/E{sortIndicator("forward_pe")}</button></th>{[7, 15, 21, 30].map((period) => <th key={period}><button className="table-sort-button" onClick={() => changeSort(`average_returns.${period}` as typeof sortKey)}>{analysisHorizonLabels[period]} 평균{sortIndicator(`average_returns.${period}` as typeof sortKey)}</button></th>)}</tr></thead><tbody>{symbols.map((row) => { const interestState = interestStateFor(row.symbol); return <tr key={row.symbol} className={selectedSymbol === row.symbol ? "selected-row" : ""} onClick={() => setSelectedSymbol(row.symbol)}><td><button className="ticker-button"><strong>{row.symbol}</strong></button></td><td>{row.sector ?? "-"}</td><td>{row.industry ?? "-"}</td><td className={`interest-cell ${interestState}`}><InterestStar state={interestState} /></td><td>{formatMetric(row.trailing_pe)}</td><td>{formatMetric(row.forward_pe)}</td>{[7, 15, 21, 30].map((period) => <td key={period}>{row.average_returns[String(period)] == null ? "-" : `${row.average_returns[String(period)]?.toFixed(2)}%`}</td>)}</tr>; })}</tbody></table>{!loading && !symbols.length && <div className="empty-state">조건에 맞는 스크리닝 종목이 없습니다.</div>}</div></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>{selectedSymbol ? `${selectedSymbol} 기간별 수익률 비교` : "기간별 수익률 비교"}</strong><span>{selectedSymbol ? `${details.length}개 기록` : "상단에서 티커를 선택하세요"}</span></div>{selectedSymbol && <div className="table-wrap"><table className="analysis-table"><thead><tr><th>스크리닝일</th><th>점수</th><th>VCP</th><th>RS 강도</th><th>거래량비</th><th>진입 가격</th><th>피벗 가격</th><th>피벗일</th><th>피벗 거리</th><th>Trailing P/E</th><th>Forward P/E</th>{periods.map((period) => <th key={period}>{analysisHorizonLabels[period] ?? `${period}일`}</th>)}</tr></thead><tbody>{details.map((row) => { const detailKey = `${row.symbol}-${row.screening_date}`; const isExpanded = expandedDetail === detailKey; return <Fragment key={detailKey}><tr><td>{row.screening_date ?? "-"}</td><td><button className="score-detail-button" onClick={() => setExpandedDetail(isExpanded ? null : detailKey)}>{row.score ?? "-"}/{row.max_score ?? "-"}</button></td><td>{row.vcp_found == null ? "-" : row.vcp_found ? "발견" : "미발견"}</td><td>{row.rs_score == null ? "-" : row.rs_score.toFixed(1)}</td><td>{row.volume_ratio == null ? "-" : `${row.volume_ratio.toFixed(2)}x`}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td><td>{formatVcpNumber(row.vcp?.pivot_price, "price")}</td><td>{typeof row.vcp?.pivot_date === "string" ? row.vcp.pivot_date : "-"}</td><td>{formatVcpNumber(row.vcp?.pivot_distance_percent, "percent")}</td><td>{formatMetric(row.trailing_pe)}</td><td>{formatMetric(row.forward_pe)}</td>{periods.map((period) => { const item = row.horizon_returns[String(period)]; return <td key={period} className={item?.return_percent != null && item.return_percent >= 0 ? "return-positive" : "return-negative"}>{item?.return_percent == null ? (item?.status === "pending" ? "대기" : "-") : `${item.return_percent.toFixed(2)}%`}</td>; })}</tr>{isExpanded && <tr className="details-row"><td colSpan={11 + periods.length}><ScreeningDetails result={{ symbol: row.symbol, company_name: row.industry ?? undefined, sector: row.sector, industry: row.industry, score: row.score ?? 0, max_score: row.max_score ?? 0, passed: row.passed, current_price: row.screening_price, trailing_pe: row.trailing_pe, forward_pe: row.forward_pe, volume_ratio: row.volume_ratio, rs_score: row.rs_score, vcp_found: row.vcp_found, conditions: row.conditions, vcp: row.vcp }} /></td></tr>}</Fragment>; })}</tbody></table></div>}</section></>;
}

function LegacyAnalysisReportViewOld2() {
  const [horizon, setHorizon] = useState(21);
  const [passedOnly, setPassedOnly] = useState(true);
  const [sector, setSector] = useState("");
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ horizon: String(horizon), passed_only: String(passedOnly), status, min_score: String(minScore) });
    if (sector) params.set("sector", sector);
    fetch(`/api/analytics/analysis-report?${params}`).then(readJson<AnalysisReport>).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [horizon, passedOnly, sector, status, minScore]);

  const summary = report?.summary;
  return <><ViewIntro eyebrow="PERFORMANCE LAB" title="Analysis report" copy="SEPA 통과 종목의 미래 수익률을 기간과 조건별로 비교 분석합니다." /><section className="analysis-controls"><label>분석 기간<select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value="10">2주 (10거래일)</option><option value="21">1개월 (21거래일)</option><option value="30">6주 (30거래일)</option><option value="42">2개월 (42거래일)</option><option value="63">3개월 (63거래일)</option><option value="126">6개월 (126거래일)</option><option value="252">12개월 (252거래일)</option></select></label><label>섹터<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">전체 섹터</option>{(report?.sectors ?? []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="complete">완료</option><option value="pending">대기</option></select></label><label>최소 점수<input type="number" min="0" max="9" value={minScore || ""} placeholder="0" onChange={(event) => setMinScore(Math.max(0, Number(event.target.value) || 0))} /></label><label className="analysis-check"><input type="checkbox" checked={passedOnly} onChange={(event) => setPassedOnly(event.target.checked)} /> SEPA 통과만</label></section><section className="analysis-summary"><MetricCard label="분석 표본" value={summary?.sample_count ?? 0} note="완료된 수익률" tone="blue" /><AnalysisMetric label="평균 수익률" value={summary?.average_return} suffix="%" tone="green" /><AnalysisMetric label="중앙값 수익률" value={summary?.median_return} suffix="%" tone="gold" /><AnalysisMetric label="승률" value={summary?.win_rate} suffix="%" tone="mint" /></section><section className="panel full-panel analysis-table-panel"><div className="analysis-report-meta"><strong>{report?.horizon_label ?? "분석 결과"}</strong><span>{loading ? "불러오는 중..." : `${report?.summary.row_count ?? 0}개 행`}</span></div><div className="table-wrap"><table className="analysis-table"><thead><tr><th>종목</th><th>스크리닝일</th><th>섹터</th><th>점수</th><th>진입 가격</th><th>목표일</th><th>목표 가격</th><th>수익률</th><th>상태</th></tr></thead><tbody>{report?.rows.map((row) => <tr key={`${row.symbol}-${row.screening_date}`}><td><strong>{row.symbol}</strong><small>{row.industry ?? "-"}</small></td><td>{row.screening_date ?? "-"}</td><td>{row.sector ?? "-"}</td><td>{row.score ?? "-"}/{row.max_score ?? "-"}</td><td>{row.screening_price == null ? "-" : `$${row.screening_price.toFixed(2)}`}</td><td>{row.target_date ?? "-"}</td><td>{row.target_price == null ? "-" : `$${row.target_price.toFixed(2)}`}</td><td className={row.return_percent != null && row.return_percent >= 0 ? "return-positive" : "return-negative"}>{row.return_percent == null ? "-" : `${row.return_percent.toFixed(2)}%`}</td><td>{row.status === "complete" ? "완료" : "대기"}</td></tr>)}</tbody></table>{!loading && !report?.rows.length && <div className="empty-state">선택한 조건의 분석 데이터가 없습니다.</div>}</div></section></>;
}

function AnalysisMetric({ label, value, suffix, tone }: { label: string; value: number | null | undefined; suffix: string; tone: string }) { return <article className={`metric-card ${tone}`}><span className="metric-label">{label}</span><div className="metric-value">{value == null ? "-" : `${value.toFixed(2)}${suffix}`}</div><small>완료 표본 기준</small></article>; }

function viewTitle(view: View) { return { dashboard: "Dashboard", screening: "Screening", "analysis-report": "Analysis report", watchlist: "Watchlist", "market-flow": "Market Flow", journal: "Trade Journal", history: "History" }[view]; }
async function readJson<T>(response: Response): Promise<T> { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<T>; }

export default App;
