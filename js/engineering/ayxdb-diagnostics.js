/* ==========================================================================
   DCIM Sunum — AyXDB Tanılama (AyxdbDiagnosticsComponent, Kas 2026 yeniden tasarımı)
   Kaynak: new-ui/pages/engineering/ayxdb-diagnostics/ayxdb-diagnostics.component.{html,ts}
           core/services/ayxdb-health.service.ts, ayxdb-performance.service.ts (eşik kuralı)
   - Başlık: "AyXDB Tanılama" [Engineer], kaynak rozeti (Canlı snapshot), "Snapshot al", "Rapor al"
     (Bu sekme: … × PDF/Excel/CSV, kayıt sınırı)
   - KPI: Runtime bileşenleri · Kritik / uyarı · Query Processing · Cihaz iletişimi
   - Sekmeler: Genel Bakış (öncelikli teknik bulgular + okuma sırası + ölçüm notları), Performans Eşiği
     (eşik kuralı kartı, Kırılma/Bozulma/Kısa tepe sayıları, bileşen tablosu + gecikme eğrisi), Yük ve Kuyruklar,
     Bağlantılar, Cihazlar (varsayılan "Yalnız sorunlular")
   - Eşikler (ayxdb-performance.service.ts): Bozulma = gecikme ≥ 1 sn · cyc_ovr > 0 · tmr_skp artıyor ·
     thr_win_ms ≥ 2000 · oturum ≥ %90, 30 sn kesintisiz; Kırılma = gecikme ≥ 30 sn yoklama periyodu.
   - 5 sn canlı yenileme (AyxdbHealthService 'engineer' akışı); destroy'da durur.
   Veri: DCIM.data.engSystem (js/mock/eng-home.data.js) — ana sayfa ile aynı snapshot. Kuyruk, pencere,
     cyc_ovr, düşen/sn, gönderilen/alınan sayaçları ve cihaz → bağlantı eşlemesi bu modülde tohumlu türetilir.
     Seviye (Kırılma/Bozulma/...) engSystem.perf ile aynıdır (ana sayfadaki "Performans" KPI'sı ile tutarlı).
   Sunum eki: Performans Eşiği sekmesinde seçili bileşenin son 10 dk gecikme eğrisi (Chart.js, log ölçek,
     Bozulma 1 sn / Kırılma 30 sn eşik çizgileri); satıra tıklayınca seçilir. Orijinalde satır içi kıvılcım eğrisi vardır
     (o da korunur).
   Derin bağlantılar (engineering.html#ayxdb-diagnostics?...):
     ?tab=overview|performance|runtime|connections|devices
     ?node=CMR/T01/SNMP_PDU_3     Performans Eşiği sekmesi + bileşen seçili (eğri)
     ?doc=CMR/T01                 Aramayı dokümana daraltır (Yük ve Kuyruklar varsayılan sekme)
     ?q=B7                        Etkin sekmede arama;  ?problems=1|0  "Yalnız …" süzgeci
     ?report=1                    Rapor menüsünü açık getirir;  ?live=0  canlı yenilemeyi durdurur
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, statusBadge, buttonClasses, toast } = DCIM.ui;
  const kit = DCIM.kit;

  const TABS = [
    { id: 'overview', label: 'Genel Bakış', icon: 'pi pi-chart-bar' },
    { id: 'performance', label: 'Performans Eşiği', icon: 'pi pi-stopwatch' },
    { id: 'runtime', label: 'Yük ve Kuyruklar', icon: 'pi pi-gauge' },
    { id: 'connections', label: 'Bağlantılar', icon: 'pi pi-link' },
    { id: 'devices', label: 'Cihazlar', icon: 'pi pi-server' }
  ];
  const LIVE_MS = 5000;
  const WINDOW_SAMPLES = 120;               // 10 dk / 5 sn
  const LIMIT_US = 1000000;                 // PERF_LATENCY_LIMIT_US
  const PERIOD_S = 30;                      // PERF_POLL_PERIOD_S
  const PERSIST_S = 30;                     // PERF_PERSIST_MS / 1000

  const rngOf = k => DCIM.data.rng(DCIM.data.hash(String(k)));
  const nf = (v, d) => (v == null || !isFinite(v)) ? '-' : Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 1 : d });
  const pct = v => v == null ? '-' : '%' + nf(v);
  const fmtSec = us => (us / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' sn';
  const fmtLat = us => us == null ? '-' : us >= 1e6 ? fmtSec(us) : us >= 1000 ? (us / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ms' : us.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' µs';
  const pad = n => String(n).padStart(2, '0');
  const hms = d => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const dmyhms = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + hms(d);

  const PERF_LABEL = l => DCIM.data.engSystem.perfLabel(l);
  const PERF_BADGE = { kirilma: 'critical', bozulma: 'warning', gecici: 'info', bilinmiyor: 'lost', toplu: 'inactive', saglikli: 'normal' };
  const PERF_STROKE = l => l === 'kirilma' ? '#e11d48' : l === 'bozulma' ? '#d97706' : '#0284c7';
  const KIND_LABEL = n => n.kind === 'document' ? 'XDB' : n.kind === 'thread' ? 'Thread' : 'Bağlantı';
  const STATUS_LABEL = { online: 'Çalışıyor', warning: 'Uyarı', critical: 'Alarm', offline: 'Durdu/Bekliyor', disabled: 'Devre dışı', unknown: 'Bilinmiyor' };
  const STATUS_BADGE = { critical: 'critical', warning: 'warning', offline: 'lost', unknown: 'lost', disabled: 'disabled', online: 'normal' };
  const SEV_BADGE = { critical: 'critical', warning: 'warning', unknown: 'lost', info: 'info', healthy: 'normal' };
  const SEARCH_CLS = 'h-8 w-full rounded-[2px] border border-slate-300 bg-white pl-7 pr-2 text-xs outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-surface-panel';
  const TH = 'px-2 py-2';
  const CARD = 'rounded-[2px] border border-slate-200 bg-white dark:border-border-subtle dark:bg-surface-card';

  // ---------------------------------------------------------------------------
  // Snapshot zenginleştirme: AyxdbRuntimeNode / AyxdbDevice alanlarının türetilmesi
  // ---------------------------------------------------------------------------
  function enrich(snap, perfView, tick) {
    const levelOf = {};
    perfView.nodes.forEach(v => { levelOf[v.node.id] = v.level; });
    const devByNode = {};
    // cihaz → bağlantı: aynı dokümanda protokole göre sıra ile (eng-home.data.js bölümlemesiyle uyumlu)
    const conns = snap.runtimeNodes.filter(n => n.kind === 'connection');
    const counters = {};
    snap.devices.forEach(d => {
      const same = conns.filter(c => c.document === d.document && c.proto === d.proto);
      const pref = same.filter(c => /SENSOR/.test(c.name) === (d.kind === 'Sensör'));
      const pool = pref.length ? pref : same;
      const key = d.document + '|' + d.proto + '|' + (d.kind === 'Sensör' ? 'S' : 'X');
      const i = counters[key] = (counters[key] || 0) + 1;
      const c = pool.length ? pool[(i - 1) % pool.length] : null;
      d.connectionId = c ? c.name : '';
      d.className = d.kind;
      const r = rngOf(d.id + ':cnt');
      // Gönderilen sayaç: oturum başından beri (tick 5 sn'lik dilim; gün içindeki dilim kadar artar)
      const sent = Math.round(18000 + r() * 9000 + (tick % 17280) * 3);
      d.sentCount = sent;
      d.receivedCount = d.status === 'offline' ? Math.round(sent * (0.62 + r() * 0.2)) : d.status === 'disabled' ? 0 : sent - Math.round(r() * 4);
      if (c) (devByNode[c.id] = devByNode[c.id] || []).push(d);
    });
    snap.runtimeNodes.forEach(n => {
      const r = rngOf(n.id + ':' + tick);
      const hot = n.workerLoad != null && n.workerLoad >= 80;
      const devs = devByNode[n.id] || [];
      const off = devs.filter(d => d.status === 'offline').length;
      n.level = levelOf[n.id] || 'bilinmiyor';
      n.description = n.kind === 'document' ? 'AyXDB doküman kökü' : n.kind === 'thread' ? 'Olay işleyici (evt_per)' : (n.proto + ' sorgu bağlantısı · ' + n.deviceCount + ' cihaz');
      n.status = 'online';
      n.windowMs = n.kind === 'document' ? null : Math.round(1000 + r() * 40 + (hot ? 260 : 0));
      n.workerMaxLoad = n.workerLoad == null ? null : Math.min(100, n.workerLoad + Math.round(4 + r() * 9));
      n.threadQueue = Math.round(r() * (hot ? 4 : 1));
      n.workerQueue = n.workerCount ? (hot ? 6 + Math.round(r() * 7) : Math.round(r() * 1.4)) : null;
      n.cycleOverrun = hot ? 2 + Math.round(r() * 3) : 0;
      n.skippedPerSecond = n.kind === 'connection' ? (hot ? Math.round(r() * 20) / 10 + 0.3 : 0) : null;
      n.timerCount = n.kind === 'connection' ? Math.max(1, Math.ceil(n.deviceCount / 16)) : 0;
      n.latencyUs = n.latencyMs * 1000;
      n.offlineDevices = off;
      // Teşhis (diagnosis)
      if (hot) {
        n.diagnosis = { severity: 'warning', title: 'Worker kapasitesi sınırda',
          detail: 'Worker yükü ' + pct(n.workerLoad) + ', kuyruk ' + n.workerQueue + ', son pencerede ' + n.cycleOverrun + ' cyc_ovr; tmr_skp artıyor.',
          action: 'Cihazların bir kısmını aynı dokümandaki daha az yüklü bağlantılara taşıyın ya da thr_wrk değerini artırın.' };
      } else if (off) {
        n.diagnosis = { severity: 'warning', title: 'Cevapsız cihaz',
          detail: off + ' cihaz zaman aşımına düşüyor; bağlantı thread\'i sağlıklı, worker yükü ' + pct(n.workerLoad) + '.',
          action: 'Cihazlar sekmesinde IP/port ve ağ erişimini kontrol edin.' };
      } else if (n.level === 'gecici') {
        n.diagnosis = { severity: 'info', title: 'Kısa tepe', detail: 'Gecikme kısa süre yükseldi; 30 sn sürmediği için eşik aşılmadı.', action: '' };
      } else if (n.workerLoad != null && n.workerLoad >= 55) {
        n.diagnosis = { severity: 'healthy', title: 'Yoğun, sağlıklı', detail: 'Yük yüksek ama gecikme ve kuyruk normal.', action: '', busy: true };
      } else {
        n.diagnosis = { severity: 'healthy', title: 'Normal', detail: '', action: '' };
      }
    });
    const s = snap.summary;
    s.runtimeWarning = snap.runtimeNodes.filter(n => n.diagnosis.severity === 'warning').length;
    s.runtimeCritical = snap.runtimeNodes.filter(n => n.diagnosis.severity === 'critical').length;
    s.runtimeBusyHealthy = snap.runtimeNodes.filter(n => n.diagnosis.busy).length;
    s.deviceUnknown = 0;
    return snap;
  }

  // PerfNodeView: seviye, nedenler, gecikme, pencere tepe, eşik dışı payı, kıvılcım eğrisi
  function perfViews(snap, tick, liveTicks) {
    return snap.runtimeNodes.map(n => {
      const series = DCIM.data.engSystem.latency(n.id, WINDOW_SAMPLES, tick).map(ms => ms * 1000);
      const reasons = [];
      if (n.level === 'kirilma') reasons.push('gecikme ' + fmtSec(n.latencyUs) + ' ≥ ' + PERIOD_S + ' sn periyot');
      if (n.level === 'bozulma') {
        if (n.latencyUs >= LIMIT_US) reasons.push('gecikme ' + fmtSec(n.latencyUs));
        if (n.cycleOverrun > 0) reasons.push('iş yarım kalıyor (cyc_ovr)');
        if (n.skippedPerSecond > 0) reasons.push('sorgu düşürülüyor (tmr_skp)');
      }
      if (n.level === 'gecici') reasons.push('kısa gecikme tepesi');
      const peak = Math.max.apply(null, series);
      const bad = n.level === 'bozulma' || n.level === 'kirilma' ? 100 : n.level === 'gecici' ? 4 : 0;
      const max = Math.max(peak, 1);
      const pts = series.filter((_, i) => i % 3 === 0 || i === series.length - 1);
      const spark = pts.map((v, i) => (i * 120 / (pts.length - 1)).toFixed(1) + ',' + (26 - (v / max) * 24).toFixed(1)).join(' ');
      return {
        key: n.id, path: n.id, node: n, level: n.level, reasons, latencyUs: n.latencyUs, windowPeakLatencyUs: peak,
        queue: (n.threadQueue || 0) + (n.workerQueue || 0), badSharePercent: n.kind === 'document' ? null : bad,
        sampleCount: Math.min(WINDOW_SAMPLES, liveTicks + 1), sparkPoints: spark,
        sparkThresholdY: LIMIT_US <= max ? (26 - (LIMIT_US / max) * 24) : null
      };
    });
  }

  DCIM.engRegistry['ayxdb-diagnostics'] = {
    mount(el, params) {
      const ES = DCIM.data.engSystem;
      const startedAt = Date.now();
      const tick0 = Math.floor(startedAt / LIVE_MS);
      const qDoc = params.get('doc') || '';
      const qNode = params.get('node') || '';
      const tabParam = params.get('tab');
      const st = {
        tick: tick0,
        liveTicks: 0,
        tab: TABS.some(t => t.id === tabParam) ? tabParam : qNode ? 'performance' : qDoc ? 'runtime' : 'overview',
        perfSearch: '', runtimeSearch: qDoc, deviceSearch: qDoc,
        onlyPerf: false, onlyRuntime: false, onlyDevice: true,
        selectedNode: qNode,
        snap: null, perfView: null, views: []
      };
      const q = params.get('q');
      if (q) { st.perfSearch = q; st.runtimeSearch = q; st.deviceSearch = q; }
      const pr = params.get('problems');
      if (pr === '1' || pr === '0') { const v = pr === '1'; st.onlyPerf = v; st.onlyRuntime = v; st.onlyDevice = v; }

      el.innerHTML =
        '<div class="flex flex-1 min-h-0 flex-col gap-2 overflow-hidden p-4">' +
          kit.pageHeader({
            title: 'AyXDB Tanılama', badge: 'Engineer', compact: true,
            breadcrumbs: [{ label: 'Mühendislik', href: 'engineering.html#home' }, { label: 'AyXDB Tanılama' }],
            actions: '<div class="flex items-center gap-2"><span data-source></span>' +
              '<button type="button" data-act="refresh" class="' + buttonClasses('secondary', 'md') + '"><i class="pi pi-refresh text-current shrink-0"></i><span>Snapshot al</span></button>' +
              '<div data-report></div></div>'
          }) +
          '<section data-kpis class="shrink-0 grid grid-cols-2 gap-2 2xl:grid-cols-4"></section>' +
          '<nav data-tabs class="shrink-0 flex gap-1 overflow-x-auto rounded-[2px] border border-slate-200 bg-white p-1 dark:border-border-subtle dark:bg-surface-card" role="tablist" aria-label="AyXDB tanılama bölümleri"></nav>' +
          '<div data-body class="flex-1 min-h-0 overflow-hidden"></div>' +
        '</div>';
      const $ = s => el.querySelector(s);
      const body = $('[data-body]');
      let chart = null;

      const reportMenu = DCIM.report.menu($('[data-report]'), {
        label: 'Rapor al', scopes: scopes(), options: 'limit', unit: unit(), total: null, defaultLimit: 50, onExport: exportReport
      });
      function scopes() { return [{ id: 'tab', label: 'Bu sekme: ' + TABS.find(t => t.id === st.tab).label, hint: 'Ekrandaki arama ve filtrelerle' }]; }
      function unit() { return st.tab === 'overview' ? 'bulgu' : st.tab === 'connections' ? 'bağlantı' : st.tab === 'devices' ? 'cihaz' : 'bileşen'; }

      // --- Veri ---
      function sample() {
        const snap = ES.snapshot(st.tick);
        const pv = ES.perf(st.tick);
        enrich(snap, pv, st.tick);
        st.snap = snap;
        st.perfView = pv;
        st.views = perfViews(snap, st.tick, st.liveTicks);
        if (!st.selectedNode || !snap.runtimeNodes.some(n => n.id === st.selectedNode)) {
          const worst = st.views.slice().sort((a, b) => rank(b.level) - rank(a.level) || b.latencyUs - a.latencyUs)[0];
          st.selectedNode = worst ? worst.key : '';
        }
      }
      const rank = l => ({ kirilma: 5, bozulma: 4, gecici: 3, saglikli: 2, toplu: 1, bilinmiyor: 0 }[l] || 0);

      // --- Süzgeçler ---
      const lc = s => String(s || '').toLocaleLowerCase('tr-TR');
      const isProblem = n => n.diagnosis.severity === 'critical' || n.diagnosis.severity === 'warning' || n.diagnosis.severity === 'unknown';
      const runtimeRows = () => st.snap.runtimeNodes.filter(n => (!st.onlyRuntime || isProblem(n)) &&
        (!st.runtimeSearch.trim() || lc(n.document + ' ' + n.id + ' ' + n.description + ' ' + n.diagnosis.title).includes(lc(st.runtimeSearch.trim()))));
      const connRows = () => runtimeRows().filter(n => n.kind === 'connection');
      const deviceRows = () => st.snap.devices.filter(d => {
        const p = d.status === 'critical' || d.status === 'warning' || d.status === 'offline' || d.status === 'unknown';
        const s = lc(st.deviceSearch.trim());
        return (!st.onlyDevice || p) && (!s || lc(d.document + ' ' + d.id + ' ' + d.description + ' ' + d.className + ' ' + d.connectionId + ' ' + d.host).includes(s));
      });
      const perfRows = () => st.views.filter(v => {
        const p = v.level === 'kirilma' || v.level === 'bozulma' || v.level === 'gecici';
        const s = lc(st.perfSearch.trim());
        return (!st.onlyPerf || p) && (!s || lc(v.path + ' ' + v.reasons.join(' ') + ' ' + PERF_LABEL(v.level)).includes(s));
      });
      const sevRank = n => ({ critical: 3, warning: 2, unknown: 1 }[n.diagnosis.severity] || 0) + (n.cycleOverrun ? 0.5 : 0);
      const topIssues = () => st.snap.runtimeNodes.filter(isProblem).sort((a, b) => sevRank(b) - sevRank(a)).slice(0, 12);
      function reportRows() {
        if (st.tab === 'performance') return perfRows();
        if (st.tab === 'runtime') return runtimeRows();
        if (st.tab === 'connections') return connRows();
        if (st.tab === 'devices') return deviceRows();
        return topIssues();
      }

      // --- Başlık / KPI / sekmeler ---
      function renderTop() {
        const s = st.snap.summary;
        $('[data-source]').innerHTML = statusBadge('normal', 'Canlı snapshot');
        $('[data-kpis]').innerHTML =
          '<article class="' + CARD + ' p-2.5"><div class="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Runtime bileşenleri</div>' +
            '<div class="mt-1 flex items-end gap-2"><span class="text-xl font-black">' + s.runtimeTotal + '</span><span class="pb-0.5 text-[9px] text-slate-500">XDB + thread + con</span></div></article>' +
          '<article class="rounded-[2px] border border-rose-500/30 bg-white p-2.5 dark:bg-surface-card"><div class="text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-300">Kritik / uyarı</div>' +
            '<div class="mt-1 flex items-end gap-2"><span class="text-xl font-black text-rose-700 dark:text-rose-200">' + s.runtimeCritical + '</span><span class="pb-0.5 text-[9px] text-amber-600 dark:text-amber-300">' + s.runtimeWarning + ' uyarı</span></div></article>' +
          '<article class="rounded-[2px] border border-sky-500/30 bg-white p-2.5 dark:bg-surface-card"><div class="text-[9px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">Query Processing</div>' +
            '<div class="mt-1 flex items-end gap-2"><span class="text-xl font-black text-sky-700 dark:text-sky-200">' + s.runtimeBusyHealthy + '</span><span class="pb-0.5 text-[9px] text-slate-500">alarm üretilmedi</span></div></article>' +
          '<article class="' + CARD + ' p-2.5"><div class="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Cihaz iletişimi</div>' +
            '<div class="mt-1 flex items-end gap-2"><span class="text-xl font-black">' + nf(s.deviceOnline, 0) + '/' + nf(s.deviceTotal, 0) + '</span><span class="pb-0.5 text-[9px] text-rose-600 dark:text-rose-300">' + (s.deviceOffline + s.deviceCritical + s.deviceWarning + s.deviceUnknown) + ' sorunlu/belirsiz</span></div></article>';
        $('[data-tabs]').innerHTML = TABS.map(t => {
          const on = st.tab === t.id;
          return '<button type="button" role="tab" data-tab="' + t.id + '" aria-selected="' + on + '" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[2px] border px-3 text-[10px] font-black transition-colors ' +
            (on ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800') + '"><i class="' + t.icon + ' text-xs"></i>' + esc(t.label) + '</button>';
        }).join('') +
          '<span class="ml-auto hidden items-center px-2 text-[9px] font-mono text-slate-400 lg:inline-flex">' + dmyhms(st.snap.sampledAt) + '</span>';
        reportMenu.update({ total: reportRows().length });
      }

      // --- Sekme iskeletleri (araç çubuğu kalıcı, veri alanı her örnekte yenilenir) ---
      function toolbar(searchKey, placeholder, onlyKey, onlyLabel) {
        return '<div class="shrink-0 flex flex-wrap items-center gap-2 rounded-[2px] border border-slate-200 bg-white p-2 dark:border-border-subtle dark:bg-surface-card">' +
          '<div class="relative min-w-0 flex-1 sm:max-w-sm"><i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
            '<input type="search" data-search="' + searchKey + '" value="' + esc(st[searchKey]) + '" class="' + SEARCH_CLS + '" placeholder="' + esc(placeholder) + '"></div>' +
          (onlyKey ? '<button type="button" data-only="' + onlyKey + '" class="h-8 rounded-[2px] border px-2 text-[10px] font-black ' +
            (st[onlyKey] ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300') + '"><i class="pi pi-filter mr-1"></i>' + esc(onlyLabel) + '</button>' : '') +
          '<span data-count class="text-[9px] font-bold text-slate-500"></span></div>';
      }
      const tableWrap = (minW, head) => '<div class="flex-1 min-h-0 overflow-auto ' + CARD + '"><table class="w-full ' + minW + ' border-collapse text-left text-[10px]">' +
        '<thead class="sticky top-0 z-10 bg-slate-100 font-black uppercase tracking-wider text-slate-500 dark:bg-surface-panel dark:text-slate-400"><tr>' + head + '</tr></thead>' +
        '<tbody data-rows class="divide-y divide-slate-100 dark:divide-slate-800"></tbody></table></div>';
      const th = (l, r) => '<th class="' + TH + (r ? ' text-right' : '') + '">' + esc(l) + '</th>';

      function renderTabShell() {
        if (chart) { chart.destroy(); chart = null; }
        if (st.tab === 'overview') {
          body.innerHTML = '<section class="h-full overflow-y-auto"><div class="grid grid-cols-1 gap-3 pb-3 2xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">' +
            '<article class="' + CARD + '"><header class="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-border-subtle">' +
              '<div><h2 class="text-xs font-black">Öncelikli teknik bulgular</h2><p class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Gecikme, kuyruk, aşım ve düşen tetikleme birlikte değerlendirilir</p></div>' +
              '<span data-count class="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black dark:bg-slate-800"></span></header>' +
              '<div data-rows></div></article>' +
            '<aside class="space-y-3">' +
              '<article class="' + CARD + ' p-3"><h2 class="text-xs font-black">Doğru okuma sırası</h2><ol class="mt-3 space-y-2 text-[10px] text-slate-600 dark:text-slate-300">' +
                '<li class="flex gap-2"><b class="text-sky-600">1</b><span><b>thr_win_ms:</b> ölçüm penceresi zamanında kapanıyor mu?</span></li>' +
                '<li class="flex gap-2"><b class="text-sky-600">2</b><span><b>lat + que_cnt:</b> sistem geride mi ve iş birikiyor mu?</span></li>' +
                '<li class="flex gap-2"><b class="text-sky-600">3</b><span><b>tot_lps:</b> sistem ne kadar meşgul? Tek başına alarm değildir.</span></li>' +
                '<li class="flex gap-2"><b class="text-sky-600">4</b><span><b>cyc_ovr + tmr_skp:</b> iş birikiyor mu, yoksa tetikleme mi düşüyor?</span></li></ol></article>' +
              '<article class="' + CARD + ' p-3"><h2 class="text-xs font-black">Ölçüm notları</h2><div class="mt-2 space-y-2 text-[10px] text-slate-600 dark:text-slate-300">' +
                '<p><i class="pi pi-info-circle mr-1 text-sky-500"></i><b>thr_</b> thread\'i, <b>wrk_</b> worker havuzunu ölçer.</p>' +
                '<p><i class="pi pi-info-circle mr-1 text-sky-500"></i><b>tmr_skp</b> kümülatiftir; ekranda iki snapshot farkı hız olarak gösterilir.</p>' +
                '<p><i class="pi pi-info-circle mr-1 text-sky-500"></i>Yük alanı yoksa değer sıfır kabul edilmez; AY_LOAD_STATS kapalı olabilir.</p>' +
                '<p><i class="pi pi-info-circle mr-1 text-sky-500"></i>Bu ölçümler yereldir; replike edilmiş node görünümü değildir.</p></div></article>' +
            '</aside></div></section>';
        } else if (st.tab === 'performance') {
          body.innerHTML = '<section class="flex h-full min-h-0 flex-col gap-2">' +
            '<div class="shrink-0 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.6fr)]">' +
              '<article class="' + CARD + ' p-3"><h2 class="text-xs font-black">Eşik kuralı (yük testi aracıyla aynı)</h2>' +
                '<div class="mt-2 grid grid-cols-1 gap-1.5 text-[10px] text-slate-600 dark:text-slate-300 md:grid-cols-3">' +
                  '<div class="rounded-[2px] border border-emerald-500/40 bg-emerald-500/5 p-2"><b class="text-emerald-700 dark:text-emerald-300">Sağlıklı</b><br>Aşağıdaki koşulların hiçbiri yok.</div>' +
                  '<div class="rounded-[2px] border border-amber-500/40 bg-amber-500/5 p-2"><b class="text-amber-700 dark:text-amber-300">Bozulma</b><br>Gecikme ≥ ' + fmtLat(LIMIT_US) + ' · cyc_ovr &gt; 0 · tmr_skp artıyor · thr_win_ms ≥ 2000 · oturum ≥ %90; <b>' + PERSIST_S + ' sn kesintisiz</b>.</div>' +
                  '<div class="rounded-[2px] border border-rose-500/40 bg-rose-500/5 p-2"><b class="text-rose-700 dark:text-rose-300">Kırılma</b><br>Gecikme ≥ ' + PERIOD_S + ' sn yoklama periyodu; ' + PERSIST_S + ' sn kesintisiz.</div>' +
                '</div>' +
                '<p class="mt-2 text-[9px] text-slate-500">Gecikme: worker\'ı olan bileşende <b>wrk_lat_us</b>, olmayanda <b>thr_lat_us</b> (ortalama). Daha kısa süren kötü örnek <b>Kısa tepe</b> olarak gösterilir. TH_SUM saatlik toplu iştir, eşik dışıdır. Dayanak: Yük Ölçümleri §2, §7; Zamanlayıcılar ve Kuyruklar §8.</p></article>' +
              '<article data-perfcounts class="grid grid-cols-3 gap-1.5 ' + CARD + ' p-3 text-center"></article>' +
            '</div>' +
            '<article class="shrink-0 ' + CARD + ' p-3">' +
              '<div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="text-xs font-black">Gecikme eğrisi</h2>' +
                '<p class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Seçili bileşenin son 10 dk gecikmesi (log ölçek) · satıra tıklayarak değiştirin</p></div>' +
                '<span data-chart-title class="flex items-center gap-2 text-[10px] font-black text-slate-700 dark:text-slate-200"></span></div>' +
              '<div class="relative mt-2 h-32"><canvas data-chart></canvas></div></article>' +
            toolbar('perfSearch', 'Bileşen veya neden ara', 'onlyPerf', 'Yalnız eşik dışı') +
            tableWrap('min-w-[1320px]', th('Bileşen') + th('Işık') + th('Anlık nedenler') + th('Gecikme', 1) + th('Pencere tepe', 1) + th('Kuyruk', 1) + th('Düşen/sn', 1) + th('Oturum', 1) + th('Eşik dışı', 1) + th('Gecikme eğrisi')) +
          '</section>';
          buildChart();
        } else if (st.tab === 'runtime') {
          body.innerHTML = '<section class="flex h-full min-h-0 flex-col gap-2">' + toolbar('runtimeSearch', 'Doküman, thread veya teşhis ara', 'onlyRuntime', 'Yalnız bulgular') +
            tableWrap('min-w-[1320px]', th('Bileşen') + th('Durum') + th('Pencere', 1) + th('Thread yük', 1) + th('Worker ort/max', 1) + th('Kuyruk T/W', 1) + th('Tepe gecikme', 1) + th('Düşen/sn', 1) + th('Aşım', 1) + th('Teşhis')) + '</section>';
        } else if (st.tab === 'connections') {
          body.innerHTML = '<section class="flex h-full min-h-0 flex-col gap-2">' + toolbar('runtimeSearch', 'Bağlantı veya doküman ara') +
            tableWrap('min-w-[1080px]', th('Bağlantı') + th('Durum') + th('Oturum', 1) + th('Thread yük', 1) + th('Worker ort/max', 1) + th('Kuyruk', 1) + th('Gecikme', 1) + th('Teşhis')) + '</section>';
        } else {
          body.innerHTML = '<section class="flex h-full min-h-0 flex-col gap-2">' + toolbar('deviceSearch', 'Cihaz, IP, sınıf veya bağlantı ara', 'onlyDevice', 'Yalnız sorunlular') +
            tableWrap('min-w-[1180px]', th('Cihaz') + th('Doküman / sınıf') + th('Bağlantı') + th('IP / host') + th('Gönderilen', 1) + th('Alınan', 1) + th('Durum')) + '</section>';
        }
      }

      // --- Veri alanları ---
      const mono = (v, r) => '<td class="' + TH + (r ? ' text-right' : '') + ' font-mono">' + v + '</td>';
      const pathCell = n => '<td class="max-w-72 ' + TH + '"><div class="truncate font-mono font-black" title="' + esc(n.id) + '">' + esc(n.id) + '</div>' +
        '<div class="mt-0.5 text-[8px] text-slate-400">' + KIND_LABEL(n) + (n.workerCount ? ' · ' + n.workerCount + ' worker' : '') + (n.timerCount ? ' · ' + n.timerCount + ' zamanlayıcı' : '') + '</div></td>';
      const sevB = n => statusBadge(SEV_BADGE[n.diagnosis.severity] || 'normal', n.diagnosis.title);
      const staB = s => statusBadge(STATUS_BADGE[s] || 'lost', STATUS_LABEL[s] || 'Bilinmiyor');
      const rowCls = 'hover:bg-slate-50 dark:hover:bg-slate-800/40';

      function renderData() {
        if (!st.snap) return;
        renderTop();
        const rowsEl = body.querySelector('[data-rows]');
        const countEl = body.querySelector('[data-count]');
        if (st.tab === 'overview') {
          const list = topIssues();
          countEl.textContent = list.length;
          rowsEl.innerHTML = !list.length
            ? '<div class="flex min-h-52 flex-col items-center justify-center p-6 text-center"><i class="pi pi-verified text-3xl text-emerald-500"></i><div class="mt-2 text-sm font-black">Aktif teknik bulgu yok</div><div class="mt-1 text-[10px] text-slate-500">Yük yüzdesi tek başına arıza kabul edilmedi.</div></div>'
            : '<div class="divide-y divide-slate-100 dark:divide-slate-800">' + list.map(n =>
              '<div class="p-3"><div class="flex flex-col gap-2 lg:flex-row lg:items-start">' + sevB(n) +
                '<div class="min-w-0 flex-1"><div class="truncate font-mono text-[10px] font-black text-slate-900 dark:text-slate-100" title="' + esc(n.id) + '">' + esc(n.id) + '</div>' +
                  '<div class="mt-1 text-[10px] text-slate-600 dark:text-slate-300">' + esc(n.diagnosis.detail) + '</div>' +
                  '<div class="mt-1 text-[9px] font-bold text-sky-700 dark:text-sky-300">' + esc(n.diagnosis.action) + '</div></div>' +
                '<div class="grid shrink-0 grid-cols-3 gap-1 text-center text-[9px] lg:w-64">' +
                  '<div class="rounded-[2px] bg-slate-100 px-2 py-1 dark:bg-slate-800"><div class="text-slate-400">Kuyruk</div><b>' + ((n.threadQueue || 0) + (n.workerQueue || 0)) + '</b></div>' +
                  '<div class="rounded-[2px] bg-slate-100 px-2 py-1 dark:bg-slate-800"><div class="text-slate-400">Gecikme</div><b>' + fmtLat(n.latencyUs) + '</b></div>' +
                  '<div class="rounded-[2px] bg-slate-100 px-2 py-1 dark:bg-slate-800"><div class="text-slate-400">Max yük</div><b>' + pct(n.workerMaxLoad != null ? n.workerMaxLoad : n.threadLoad) + '</b></div>' +
                '</div></div></div>').join('') + '</div>';
          return;
        }
        if (st.tab === 'performance') {
          const c = st.perfView.counts;
          body.querySelector('[data-perfcounts]').innerHTML =
            '<div class="rounded-[2px] bg-rose-500/10 p-2"><div class="text-[9px] font-black uppercase text-rose-700 dark:text-rose-300">Kırılma</div><div class="text-xl font-black">' + c.kirilma + '</div></div>' +
            '<div class="rounded-[2px] bg-amber-500/10 p-2"><div class="text-[9px] font-black uppercase text-amber-700 dark:text-amber-300">Bozulma</div><div class="text-xl font-black">' + c.bozulma + '</div></div>' +
            '<div class="rounded-[2px] bg-sky-500/10 p-2"><div class="text-[9px] font-black uppercase text-sky-700 dark:text-sky-300">Kısa tepe</div><div class="text-xl font-black">' + c.gecici + '</div></div>' +
            '<div class="col-span-3 text-[9px] text-slate-500">Pencere: son 10 dk · izleme başlangıcı ' + hms(new Date(startedAt)) + '</div>';
          const list = perfRows();
          countEl.textContent = list.length + ' kayıt';
          rowsEl.innerHTML = list.map(v => {
            const n = v.node;
            const sel = v.key === st.selectedNode;
            return '<tr data-node="' + esc(v.key) + '" class="cursor-pointer ' + rowCls + (sel ? ' bg-sky-500/10' : '') + '">' + pathCell(n) +
              '<td class="' + TH + '">' + statusBadge(PERF_BADGE[v.level], PERF_LABEL(v.level)) + '</td>' +
              '<td class="max-w-80 ' + TH + ' text-slate-600 dark:text-slate-300">' + esc(v.reasons.length ? v.reasons.join(' · ') : '-') + '</td>' +
              mono(fmtLat(v.latencyUs), 1) + mono(fmtLat(v.windowPeakLatencyUs), 1) + mono(v.queue, 1) +
              mono(n.skippedPerSecond == null ? '-' : nf(n.skippedPerSecond), 1) +
              mono((n.sessionCapacity ? n.sessionCount : '-') + ' / ' + (n.sessionCapacity || '-'), 1) +
              '<td class="' + TH + ' text-right font-mono">' + (v.badSharePercent == null ? '-' : '%' + nf(v.badSharePercent)) + '<div class="text-[8px] text-slate-400">' + v.sampleCount + ' örnek</div></td>' +
              '<td class="' + TH + '"><svg viewBox="0 0 120 28" width="128" height="24" preserveAspectRatio="none" class="block h-6 w-32" role="img" aria-label="Gecikme eğrisi">' +
                (v.sparkThresholdY != null ? '<line x1="0" x2="120" y1="' + v.sparkThresholdY + '" y2="' + v.sparkThresholdY + '" stroke="#94a3b8" stroke-width="0.4" stroke-dasharray="2 2"></line>' : '') +
                '<polyline points="' + v.sparkPoints + '" fill="none" stroke="' + PERF_STROKE(v.level) + '" stroke-width="1.2" vector-effect="non-scaling-stroke"></polyline></svg></td></tr>';
          }).join('');
          updateChart();
          return;
        }
        if (st.tab === 'runtime') {
          const list = runtimeRows();
          countEl.textContent = list.length + ' kayıt';
          rowsEl.innerHTML = list.map(n => '<tr class="' + rowCls + '">' + pathCell(n) + '<td class="' + TH + '">' + staB(n.status) + '</td>' +
            mono(n.windowMs == null ? '-' : nf(n.windowMs, 0) + ' ms', 1) + mono(pct(n.threadLoad), 1) + mono(pct(n.workerLoad) + ' / ' + pct(n.workerMaxLoad), 1) +
            mono((n.threadQueue == null ? '-' : n.threadQueue) + ' / ' + (n.workerQueue == null ? '-' : n.workerQueue), 1) + mono(fmtLat(n.latencyUs), 1) +
            mono(n.skippedPerSecond == null ? '-' : nf(n.skippedPerSecond), 1) + mono(n.cycleOverrun, 1) + '<td class="' + TH + '">' + sevB(n) + '</td></tr>').join('');
          return;
        }
        if (st.tab === 'connections') {
          const list = connRows();
          countEl.textContent = list.length + ' bağlantı';
          rowsEl.innerHTML = list.map(n => '<tr class="' + rowCls + '"><td class="' + TH + '"><div class="font-mono font-black">' + esc(n.id) + '</div><div class="text-[8px] text-slate-400">' + esc(n.description || 'Açıklama yok') + '</div></td>' +
            '<td class="' + TH + '">' + staB(n.status) + '</td>' + mono(n.sessionCount + ' / ' + n.sessionCapacity, 1) + mono(pct(n.threadLoad), 1) +
            mono(pct(n.workerLoad) + ' / ' + pct(n.workerMaxLoad), 1) + mono((n.threadQueue || 0) + (n.workerQueue || 0), 1) + mono(fmtLat(n.latencyUs), 1) +
            '<td class="' + TH + '">' + sevB(n) + '</td></tr>').join('');
          return;
        }
        const list = deviceRows();
        countEl.textContent = list.length + ' / ' + st.snap.devices.length + ' cihaz';
        rowsEl.innerHTML = list.length ? list.map(d => '<tr class="' + rowCls + '"><td class="max-w-80 ' + TH + '"><div class="truncate font-black" title="' + esc(d.description) + '">' + esc(d.description) + '</div>' +
            '<div class="truncate font-mono text-[8px] text-slate-400" title="' + esc(d.id) + '">' + esc(d.id) + (d.note ? ' · ' + esc(d.note) : '') + '</div></td>' +
          '<td class="' + TH + '"><div class="font-mono">' + esc(d.document) + '</div><div class="text-[8px] text-slate-400">' + esc(d.className || '-') + '</div></td>' +
          mono(esc(d.connectionId || '-')) + mono(esc(d.host || '-')) + mono(nf(d.sentCount, 0), 1) + mono(nf(d.receivedCount, 0), 1) +
          '<td class="' + TH + '">' + staB(d.status) + '</td></tr>').join('')
          : '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">Eşleşen cihaz yok.</td></tr>';
      }

      // --- Gecikme eğrisi (Chart.js) ---
      function chartSeries() {
        const lat = DCIM.data.engSystem.latency(st.selectedNode, WINDOW_SAMPLES, st.tick);
        const now = Date.now();
        const labels = lat.map((_, i) => hms(new Date(now - (lat.length - 1 - i) * LIVE_MS)).slice(0, 5));
        return { labels, lat };
      }
      function buildChart() {
        const cv = body.querySelector('[data-chart]');
        if (!cv || !window.Chart) return;
        const c = kit.chartColors();
        const s = chartSeries();
        chart = new window.Chart(cv.getContext('2d'), {
          type: 'line',
          data: {
            labels: s.labels,
            datasets: [
              { label: 'Gecikme (ms)', data: s.lat, borderColor: '#0284c7', backgroundColor: 'rgba(2,132,199,0.12)', borderWidth: 1.5, pointRadius: 0, fill: true, tension: 0.25 },
              { label: 'Bozulma eşiği 1 sn', data: s.lat.map(() => LIMIT_US / 1000), borderColor: '#d97706', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false },
              { label: 'Kırılma eşiği 30 sn', data: s.lat.map(() => PERIOD_S * 1000), borderColor: '#e11d48', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false }
            ]
          },
          options: {
            responsive: true, maintainAspectRatio: false, animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } },
              tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + fmtLat(ctx.parsed.y * 1000) } } },
            scales: {
              x: { ticks: { maxTicksLimit: 10, font: { size: 9 } }, grid: { color: c.grid } },
              y: { type: 'logarithmic', min: 5, max: 60000, grid: { color: c.grid },
                ticks: { font: { size: 9 }, callback: v => [10, 100, 1000, 10000].indexOf(v) >= 0 ? fmtLat(v * 1000) : '' } }
            }
          }
        });
        updateChart();
      }
      function updateChart() {
        const t = body.querySelector('[data-chart-title]');
        const v = st.views.find(x => x.key === st.selectedNode);
        if (t) t.innerHTML = v ? '<span class="font-mono">' + esc(v.path) + '</span>' + statusBadge(PERF_BADGE[v.level], PERF_LABEL(v.level)) : '';
        if (!chart) return;
        const s = chartSeries();
        chart.data.labels = s.labels;
        chart.data.datasets[0].data = s.lat;
        chart.data.datasets[0].borderColor = v ? PERF_STROKE(v.level) : '#0284c7';
        chart.data.datasets[1].data = s.lat.map(() => LIMIT_US / 1000);
        chart.data.datasets[2].data = s.lat.map(() => PERIOD_S * 1000);
        chart.update('none');
      }

      // --- Rapor ---
      function exportReport(req) {
        const tabLabel = TABS.find(t => t.id === st.tab).label;
        const rows = DCIM.report.applyLimit(reportRows(), req);
        const s = st.snap.summary;
        const kpis = [
          { label: 'Runtime bileşenleri', value: s.runtimeTotal },
          { label: 'Kritik / uyarı', value: s.runtimeCritical + ' / ' + s.runtimeWarning, tone: s.runtimeWarning ? 'warning' : 'normal' },
          { label: 'Cihaz iletişimi', value: s.deviceOnline + '/' + s.deviceTotal, tone: s.deviceOffline ? 'lost' : 'normal' }
        ];
        const sevTone = sev => sev === 'critical' ? 'alarm' : sev === 'warning' ? 'warning' : sev === 'unknown' ? 'lost' : sev === 'info' ? 'info' : 'normal';
        let columns, data;
        if (st.tab === 'performance') {
          columns = [{ key: 'path', label: 'Bileşen' }, { key: 'kind', label: 'Tür' }, { key: 'lvl', label: 'Işık' }, { key: 'why', label: 'Anlık nedenler' }, { key: 'lat', label: 'Gecikme', align: 'right' },
            { key: 'peak', label: 'Pencere tepe', align: 'right' }, { key: 'q', label: 'Kuyruk', align: 'right' }, { key: 'bad', label: 'Eşik dışı', align: 'right' }];
          data = rows.map(v => ({ path: v.path, kind: KIND_LABEL(v.node), lvl: PERF_LABEL(v.level), why: v.reasons.join(' · ') || '-', lat: fmtLat(v.latencyUs), peak: fmtLat(v.windowPeakLatencyUs), q: v.queue,
            bad: v.badSharePercent == null ? '-' : '%' + nf(v.badSharePercent), tone: v.level === 'kirilma' ? 'alarm' : v.level === 'bozulma' ? 'warning' : v.level === 'gecici' ? 'info' : 'normal' }));
        } else if (st.tab === 'devices') {
          columns = [{ key: 'desc', label: 'Cihaz' }, { key: 'id', label: 'Kimlik' }, { key: 'doc', label: 'Doküman' }, { key: 'cls', label: 'Sınıf' }, { key: 'con', label: 'Bağlantı' }, { key: 'host', label: 'IP / host' },
            { key: 'sent', label: 'Gönderilen', align: 'right' }, { key: 'recv', label: 'Alınan', align: 'right' }, { key: 'sta', label: 'Durum' }];
          data = rows.map(d => ({ desc: d.description, id: d.id, doc: d.document, cls: d.className, con: d.connectionId, host: d.host, sent: d.sentCount, recv: d.receivedCount, sta: STATUS_LABEL[d.status],
            tone: d.status === 'critical' ? 'alarm' : d.status === 'warning' ? 'warning' : d.status === 'offline' ? 'lost' : 'normal' }));
        } else {
          columns = [{ key: 'path', label: st.tab === 'connections' ? 'Bağlantı' : 'Bileşen' }, { key: 'kind', label: 'Tür' }, { key: 'sta', label: 'Durum' }, { key: 'tl', label: 'Thread yük', align: 'right' },
            { key: 'wl', label: 'Worker ort/max', align: 'right' }, { key: 'q', label: 'Kuyruk', align: 'right' }, { key: 'lat', label: 'Gecikme', align: 'right' }, { key: 'dx', label: 'Teşhis' }, { key: 'act', label: 'Öneri' }];
          data = rows.map(n => ({ path: n.id, kind: KIND_LABEL(n), sta: STATUS_LABEL[n.status], tl: pct(n.threadLoad), wl: pct(n.workerLoad) + ' / ' + pct(n.workerMaxLoad),
            q: (n.threadQueue || 0) + (n.workerQueue || 0), lat: fmtLat(n.latencyUs), dx: n.diagnosis.title, act: n.diagnosis.action || '-', tone: sevTone(n.diagnosis.severity) }));
        }
        DCIM.report.generate({
          title: 'AyXDB Tanılama — ' + tabLabel,
          subtitle: 'AyXDB çalışma zamanı · Canlı snapshot · snapshot ' + dmyhms(st.snap.sampledAt) + ' · ' + data.length + ' ' + unit(),
          filename: 'AyXDB_Tanilama_' + st.tab,
          kpis,
          sections: [{ title: tabLabel, columns, rows: data, toneKey: 'tone' }],
          notes: st.tab === 'performance' ? ['Bozulma: gecikme ≥ 1 sn, cyc_ovr > 0, tmr_skp artıyor, thr_win_ms ≥ 2000 veya oturum ≥ %90; 30 sn kesintisiz. Kırılma: gecikme ≥ 30 sn yoklama periyodu.'] : []
        }, req.format);
      }

      // --- Olaylar ---
      function selectTab(id) {
        st.tab = id;
        reportMenu.update({ scopes: scopes(), unit: unit() });
        renderTabShell();
        renderData();
      }
      el.addEventListener('click', e => {
        const tb = e.target.closest('[data-tab]');
        if (tb) { selectTab(tb.getAttribute('data-tab')); return; }
        const only = e.target.closest('[data-only]');
        if (only) { const k = only.getAttribute('data-only'); st[k] = !st[k]; renderTabShell(); renderData(); return; }
        const row = e.target.closest('[data-node]');
        if (row) { st.selectedNode = row.getAttribute('data-node'); renderData(); return; }
        if (e.target.closest('[data-act="refresh"]')) { st.tick++; st.liveTicks++; sample(); renderData(); toast('Yeni snapshot alındı.', 'info'); }
      });
      el.addEventListener('input', e => {
        const k = e.target.getAttribute('data-search');
        if (!k) return;
        st[k] = e.target.value;
        renderData();
      });

      // --- Başlat ---
      sample();
      renderTabShell();
      renderData();
      const live = params.get('live') === '0' ? null : setInterval(() => { st.tick++; st.liveTicks++; sample(); renderData(); }, LIVE_MS);
      if (params.get('report') === '1') setTimeout(() => { const b = el.querySelector('[data-report] button'); if (b) b.click(); }, 50);

      return {
        destroy() {
          if (live) clearInterval(live);
          if (chart) chart.destroy();
          reportMenu.destroy();
        }
      };
    }
  };
})();
