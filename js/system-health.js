/* ==========================================================================
   DCIM Sunum — Sistem Sağlığı (SystemHealthComponent, operatör görünümü)
   AyxdbHealthService mantığının vanilla karşılığı: 5 sn'lik yoklama, sayaç geçmişi,
   çalışma bileşeni teşhisi (diagnoseRuntimeNode), özet, sorun grupları, genel önem.
   Ham satırlar: DCIM.data.health.sample(tick) (js/mock-data.js)
   Derin bağlantı: ?state=fresh|partial|stale|disconnected (kaynak durumu gösterimi)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, statusBadge, button } = DCIM.ui;
  const kit = DCIM.kit;
  const H = DCIM.data.health;
  DCIM.shell.init({ active: 'health' });

  const POLL_INTERVAL_MS = H.pollIntervalMs || 5000;
  const LOAD_WARNING_PERCENT = 80;
  const LATENCY_CRITICAL_US = 1000000;
  const WINDOW_LATE_MS = 2000;

  const params = new URLSearchParams(window.location.search);
  const forcedState = ['fresh', 'partial', 'stale', 'disconnected'].indexOf(params.get('state')) >= 0 ? params.get('state') : 'fresh';

  // ---------------------------------------------------------------------------
  // Servis mantığı (ayxdb-health.service.ts)
  // ---------------------------------------------------------------------------
  const HEALTHY_DIAGNOSIS = { code: 'healthy', severity: 'healthy', title: 'Normal', detail: 'Kuyruk, gecikme ve aşım sinyalleri normal.', action: 'İşlem gerekmiyor.' };
  const numberValue = v => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };
  const textValue = v => (v === null || v === undefined ? '' : String(v).trim());
  const nz = v => (v == null ? 0 : v);
  const formatNumber = v => v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  const formatLatency = us => (us >= 1000000 ? formatNumber(us / 1000000) + ' sn' : us >= 1000 ? formatNumber(us / 1000) + ' ms' : formatNumber(us) + ' µs');
  const formatDurationMs = ms => (ms >= 1000 ? formatNumber(ms / 1000) + ' sn' : formatNumber(ms) + ' ms');

  function classifyEngineState(sta) {
    if (sta === null) return 'unknown';
    const engineState = sta & 0x0003;
    const valueState = sta & 0x000c;
    if (engineState === 0) return 'disabled';
    if (engineState === 1 || engineState === 2) return 'offline';
    if (valueState === 0x0004) return 'warning';
    if (valueState === 0x0008 || valueState === 0x000c) return 'critical';
    return engineState === 3 ? 'online' : 'unknown';
  }
  function severityRank(s) {
    return s === 'critical' ? 4 : s === 'warning' ? 3 : s === 'unknown' ? 2 : s === 'info' ? 1 : 0;
  }
  const LOAD_FIELDS = ['thr_win_ms', 'thr_que_aps', 'thr_que_rps', 'thr_tot_lps', 'thr_lat_us', 'thr_lat_max_us', 'thr_cyc_ovr', 'wrk_que_aps', 'wrk_que_rps', 'wrk_tot_lps', 'wrk_lat_us', 'wrk_lat_max_us', 'wrk_tot_lps_max', 'wrk_cyc_ovr'];
  const hasLoadMetrics = row => LOAD_FIELDS.some(f => numberValue(row[f]) !== null);

  function diagnoseRuntimeNode(node, queueGrowthSamples) {
    if (node.status === 'offline') return { code: 'not-running', severity: 'critical', title: 'Bileşen çalışmıyor', detail: 'AyXDB çalışma durumu normal koşumda değil.', action: 'Bileşen logunu, bağlantısını ve başlatma durumunu inceleyin.' };
    if (node.status === 'critical') return { code: 'runtime-alarm', severity: 'critical', title: 'Çalışma durumu alarmda', detail: 'Bileşen çalışıyor ancak değer durum bitleri alarm veya acil durum bildiriyor.', action: 'İlgili bileşenin alarm kaynağını ve çalışma logunu inceleyin.' };
    if (node.status === 'warning') return { code: 'runtime-warning', severity: 'warning', title: 'Çalışma durumu uyarıda', detail: 'Bileşen çalışıyor ancak değer durum bitleri uyarı bildiriyor.', action: 'Gecikme, kuyruk ve bileşen logunu birlikte inceleyin.' };
    if (node.status === 'unknown') return { code: 'runtime-unknown', severity: 'unknown', title: 'Çalışma durumu bilinmiyor', detail: 'Bileşenin sta alanı okunamadı veya geçersiz.', action: 'Snapshot kaynağını ve element durum alanını doğrulayın.' };
    if (node.status === 'disabled') return { code: 'disabled', severity: 'info', title: 'Devre dışı', detail: 'Bileşen yapılandırma ile devre dışı bırakılmış.', action: 'Planlı değilse yapılandırmayı kontrol edin.' };

    const sessionCount = nz(node.sessionCount);
    const sessionCapacity = nz(node.sessionCapacity);
    if (sessionCapacity > 0 && sessionCount >= sessionCapacity) {
      return { code: 'session-capacity', severity: 'critical', title: 'Oturum kapasitesi dolu', detail: sessionCount + '/' + sessionCapacity + ' oturum kullanılıyor; yeni bağlantılar reddedilebilir.', action: 'Bağlantı havuzunu ve con_ses kapasitesini inceleyin.' };
    }
    const queueDepth = Math.max(nz(node.threadQueue), nz(node.workerQueue));
    if (queueDepth > 0 && queueGrowthSamples >= 2) {
      return { code: 'backlog', severity: 'critical', title: 'İş kuyruğu birikiyor', detail: queueDepth + ' iş bekliyor ve kuyruk ardışık snapshotlarda büyüyor.', action: 'thr_per azaltma, thr_wrk artırma veya işi bölme seçeneklerini birlikte değerlendirin.' };
    }
    if (nz(node.skippedPerSecond) > 0) {
      return { code: 'trigger-drop', severity: 'warning', title: 'Tetiklemeler düşürülüyor', detail: 'Yaklaşık ' + formatNumber(nz(node.skippedPerSecond)) + ' tetikleme/sn servis edilmeden düşüyor.', action: 'evt_per ihtiyacını, worker sayısını veya round-robin dağılımını inceleyin.' };
    }
    if (!node.metricsAvailable) {
      return { code: 'metrics-unavailable', severity: 'unknown', title: 'Yük ölçümü yok', detail: 'Yük alanları bulunamadı; bu durum boşta çalışan sistem anlamına gelmez.', action: 'Motor sürümünü ve AY_LOAD_STATS derleme seçeneğini doğrulayın.' };
    }
    if (nz(node.windowMs) >= WINDOW_LATE_MS) {
      return { code: 'measurement-late', severity: 'critical', title: 'Ölçüm penceresi gecikiyor', detail: 'Thread ölçüm penceresini ' + formatDurationMs(nz(node.windowMs)) + ' içinde kapatabildi.', action: 'Aynı thread üzerindeki uzun süren fonksiyon veya bloke I/O çağrısını bulun.' };
    }
    const maxLatencyUs = Math.max(nz(node.threadLatencyUs), nz(node.threadMaxLatencyUs), nz(node.workerLatencyUs), nz(node.workerMaxLatencyUs));
    const cycleOverrun = nz(node.threadCycleOverrun) + nz(node.workerCycleOverrun);
    if (queueDepth > 0 && (maxLatencyUs >= LATENCY_CRITICAL_US || cycleOverrun > 0)) {
      return { code: 'backlog', severity: 'critical', title: 'İş kuyruğu birikiyor', detail: queueDepth + ' iş bekliyor; tepe gecikme ' + formatLatency(maxLatencyUs) + '.', action: 'thr_per azaltma, thr_wrk artırma veya işi bölme seçeneklerini birlikte değerlendirin.' };
    }
    if (cycleOverrun > 0) {
      return { code: 'cycle-overrun', severity: 'warning', title: 'Çevrim bütçesi aşılıyor', detail: formatNumber(cycleOverrun) + ' çevrim bütçesi kuyruk bitmeden doldu.', action: 'Thread bütçesini ve iş maliyetini inceleyin.' };
    }
    const workerLoad = nz(node.workerLoad);
    const workerMaxLoad = nz(node.workerMaxLoad);
    if (workerMaxLoad >= LOAD_WARNING_PERCENT && workerLoad < LOAD_WARNING_PERCENT) {
      return { code: 'worker-imbalance', severity: 'warning', title: 'Worker yükü dengesiz', detail: 'Havuz ortalaması %' + formatNumber(workerLoad) + ', en yoğun worker %' + formatNumber(workerMaxLoad) + '.', action: 'Yoğun worker üzerindeki evt_thr dağılımını inceleyin.' };
    }
    if (sessionCapacity > 0 && sessionCount / sessionCapacity >= 0.9) {
      return { code: 'session-near-capacity', severity: 'warning', title: 'Oturum kapasitesi sınıra yakın', detail: sessionCount + '/' + sessionCapacity + ' oturum kullanılıyor.', action: 'Bağlantı kapasitesi ve oturum yaşam döngüsünü izleyin.' };
    }
    const maxLoad = Math.max(nz(node.threadLoad), workerLoad, workerMaxLoad);
    if (maxLoad >= LOAD_WARNING_PERCENT) {
      return { code: 'busy-healthy', severity: 'info', title: 'Dolu, yetişiyor', detail: 'Yük %' + formatNumber(maxLoad) + '; kuyruk ve gecikme birikme göstermiyor.', action: 'Alarm üretmeyin; gecikme ve kuyruk trendini izlemeye devam edin.' };
    }
    return HEALTHY_DIAGNOSIS;
  }

  // Sayaç geçmişi (tmr_skp farkından tetikleme düşme hızı, kuyruk büyüme sayısı)
  const history = new Map();
  function toRuntimeNode(row, kind, sampledAt, updateHistory) {
    const id = textValue(row.rid) || textValue(row.id) || 'unknown';
    const document = textValue(row.qry_doc);
    const key = document + '/' + kind + '/' + id;
    const timerSkipped = numberValue(row.tmr_skp);
    const threadQueue = numberValue(row.thr_que_cnt);
    const workerQueue = numberValue(row.wrk_que_cnt);
    const queueDepth = Math.max(nz(threadQueue), nz(workerQueue));
    const stored = history.get(key);
    const isNewSample = updateHistory && (!stored || sampledAt > stored.sampledAt);
    const previous = isNewSample && stored && sampledAt - stored.sampledAt <= POLL_INTERVAL_MS * 3 ? stored : undefined;
    const queueGrowthSamples = previous && queueDepth > previous.queueDepth ? previous.queueGrowthSamples + 1 : isNewSample ? 0 : stored ? stored.queueGrowthSamples : 0;
    const elapsed = previous ? Math.max((sampledAt - previous.sampledAt) / 1000, 0.001) : 0;
    const skippedPerSecond = previous && timerSkipped !== null && previous.timerSkipped !== null ? Math.max(timerSkipped - previous.timerSkipped, 0) / elapsed : null;
    const node = {
      key, id, document, description: textValue(row.desc), kind,
      status: classifyEngineState(numberValue(row.sta)),
      metricsAvailable: hasLoadMetrics(row),
      windowMs: numberValue(row.thr_win_ms),
      threadLoad: numberValue(row.thr_tot_lps),
      workerLoad: numberValue(row.wrk_tot_lps),
      workerMaxLoad: numberValue(row.wrk_tot_lps_max),
      threadQueue, workerQueue,
      threadLatencyUs: numberValue(row.thr_lat_us),
      threadMaxLatencyUs: numberValue(row.thr_lat_max_us),
      workerLatencyUs: numberValue(row.wrk_lat_us),
      workerMaxLatencyUs: numberValue(row.wrk_lat_max_us),
      threadCycleOverrun: numberValue(row.thr_cyc_ovr),
      workerCycleOverrun: numberValue(row.wrk_cyc_ovr),
      timerSkipped, skippedPerSecond,
      sessionCount: numberValue(row.ses_cnt),
      sessionCapacity: numberValue(row.con_ses)
    };
    node.diagnosis = diagnoseRuntimeNode(node, queueGrowthSamples);
    if (isNewSample) history.set(key, { sampledAt, timerSkipped, queueDepth, queueGrowthSamples });
    return node;
  }

  function entityStatusRank(s) {
    return s === 'critical' ? 5 : s === 'offline' ? 4 : s === 'warning' ? 3 : s === 'unknown' ? 2 : s === 'disabled' ? 1 : 0;
  }
  function toDevice(row) {
    const id = textValue(row.rid) || textValue(row.id) || 'unknown';
    const document = textValue(row.qry_doc);
    return { key: document + '/device/' + id, id, document, description: textValue(row.desc) || textValue(row.dev_nfo) || id, className: textValue(row.xdb_cls), status: classifyEngineState(numberValue(row.sta)) };
  }

  function buildSnapshot(raw, sampledAt, sourceState) {
    const upd = sourceState === 'fresh' || sourceState === 'partial';
    const runtimeNodes = []
      .concat(raw.roots.map(r => toRuntimeNode(r, 'xdb', sampledAt, upd)))
      .concat(raw.threads.map(r => toRuntimeNode(r, 'thread', sampledAt, upd)))
      .concat(raw.connections.map(r => toRuntimeNode(r, 'connection', sampledAt, upd)))
      .sort((a, b) => severityRank(b.diagnosis.severity) - severityRank(a.diagnosis.severity) || a.document.localeCompare(b.document) || a.id.localeCompare(b.id));
    const devices = raw.devices.map(toDevice)
      .sort((a, b) => entityStatusRank(b.status) - entityStatusRank(a.status) || a.document.localeCompare(b.document) || a.description.localeCompare(b.description, 'tr'));
    const cnt = (arr, fn) => arr.filter(fn).length;
    const summary = {
      runtimeTotal: runtimeNodes.length,
      runtimeCritical: cnt(runtimeNodes, n => n.diagnosis.severity === 'critical'),
      runtimeWarning: cnt(runtimeNodes, n => n.diagnosis.severity === 'warning'),
      runtimeUnknown: cnt(runtimeNodes, n => n.diagnosis.severity === 'unknown'),
      runtimeBusyHealthy: cnt(runtimeNodes, n => n.diagnosis.code === 'busy-healthy'),
      deviceTotal: devices.length,
      deviceOnline: cnt(devices, d => d.status === 'online'),
      deviceWarning: cnt(devices, d => d.status === 'warning'),
      deviceCritical: cnt(devices, d => d.status === 'critical'),
      deviceOffline: cnt(devices, d => d.status === 'offline'),
      deviceDisabled: cnt(devices, d => d.status === 'disabled'),
      deviceUnknown: cnt(devices, d => d.status === 'unknown')
    };
    const groups = new Map();
    runtimeNodes.forEach(n => {
      if (n.diagnosis.severity === 'healthy' || n.diagnosis.severity === 'info') return;
      const cur = groups.get(n.diagnosis.code);
      if (cur) { cur.count++; return; }
      groups.set(n.diagnosis.code, Object.assign({}, n.diagnosis, { count: 1 }));
    });
    const issueGroups = Array.from(groups.values()).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.count - a.count);
    let overall = 'healthy';
    if (summary.runtimeCritical > 0 || summary.deviceCritical > 0) overall = 'critical';
    else if (summary.runtimeWarning > 0 || summary.deviceWarning > 0 || summary.deviceOffline > 0) overall = 'warning';
    else if (summary.runtimeUnknown > 0 || summary.deviceUnknown > 0) overall = 'unknown';
    else if (sourceState !== 'fresh' || summary.runtimeTotal === 0) overall = 'unknown';
    return { sourceState, overallSeverity: overall, sampledAt: new Date(sampledAt), runtimeNodes, devices, issueGroups, summary };
  }

  // ---------------------------------------------------------------------------
  // Görünüm yardımcıları (system-health.component.ts)
  // ---------------------------------------------------------------------------
  const overallLabel = s => (s === 'critical' ? 'Kritik müdahale gerekli' : s === 'warning' ? 'Dikkat gerektiren durumlar var' : s === 'healthy' ? 'Sistem sağlıklı' : 'Durum doğrulanamıyor');
  const sourceLabel = s => (s.sourceState === 'fresh' ? 'Veri güncel' : s.sourceState === 'partial' ? 'Veri kısmi' : s.sourceState === 'disconnected' ? 'Bağlantı yok' : 'Veri bayat');
  const deviceStatusLabel = d => (d.status === 'critical' ? 'Alarm' : d.status === 'warning' ? 'Uyarı' : d.status === 'offline' ? 'Haberleşme yok' : d.status === 'disabled' ? 'Devre dışı' : d.status === 'online' ? 'Çevrimiçi' : 'Bilinmiyor');
  const operatorDeviceName = d => (d.description && d.description !== d.id ? d.description : 'Adlandırılmamış saha cihazı');
  const severityIcon = s => (s === 'critical' ? 'pi pi-times-circle' : s === 'warning' ? 'pi pi-exclamation-triangle' : s === 'unknown' ? 'pi pi-question-circle' : 'pi pi-check-circle');
  function severityPanelClass(s) {
    if (s === 'critical') return 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200';
    if (s === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200';
    if (s === 'unknown') return 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  }
  const problemDevices = s => s.devices.filter(d => d.status === 'critical' || d.status === 'offline' || d.status === 'warning' || d.status === 'unknown').slice(0, 30);

  // ---------------------------------------------------------------------------
  // Çizim
  // ---------------------------------------------------------------------------
  const root = document.getElementById('sh-root');
  let snapshot = null;
  let refreshing = false;

  function headerHtml() {
    const badge = snapshot
      ? statusBadge(snapshot.sourceState === 'fresh' ? 'normal' : snapshot.sourceState === 'partial' ? 'warning' : 'lost', sourceLabel(snapshot))
      : '';
    return kit.pageHeader({
      title: 'Sistem Sağlığı',
      breadcrumbs: [{ label: 'İzleme' }, { label: 'Sistem Sağlığı' }],
      actions: '<div class="flex items-center gap-2">' + badge +
        button({ variant: 'secondary', icon: refreshing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh', label: 'Yenile', attrs: 'data-refresh' + (refreshing ? ' disabled' : '') }) + '</div>'
    });
  }

  function render() {
    if (!snapshot) {
      root.innerHTML = headerHtml() +
        '<div class="flex min-h-64 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-sm text-slate-500 dark:border-border-subtle dark:bg-surface-card dark:text-slate-400"><i class="pi pi-spin pi-spinner mr-2"></i> Sistem durumu okunuyor...</div>';
      return;
    }
    const data = snapshot;
    const s = data.summary;
    const devs = problemDevices(data);
    root.innerHTML = headerHtml() +
      (data.sourceState !== 'fresh'
        ? '<section class="rounded-[2px] border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-800 dark:text-orange-200" aria-live="polite"><div class="flex items-start gap-2"><i class="pi pi-exclamation-triangle mt-0.5"></i><div>' +
            '<div class="font-black">Canlı veri doğrulanamadı</div><div class="mt-0.5 text-[10px] opacity-80">Eski yeşil durumlar korunmadı. Bağlantı geri gelene kadar aşağıdaki sayılar eksik olabilir.</div></div></div></section>'
        : '') +
      '<section class="grid grid-cols-2 gap-2 xl:grid-cols-4">' +
        '<article class="rounded-[2px] border p-3 ' + severityPanelClass(data.overallSeverity) + '">' +
          '<div class="flex items-center justify-between gap-2"><span class="text-[10px] font-black uppercase tracking-wider">Genel durum</span><i class="' + severityIcon(data.overallSeverity) + ' text-base"></i></div>' +
          '<div class="mt-2 text-sm font-black leading-tight">' + esc(overallLabel(data.overallSeverity)) + '</div>' +
          '<div class="mt-1 text-[9px] opacity-75">Son deneme: ' + fmtDateTime(data.sampledAt) + '</div>' +
        '</article>' +
        '<article class="rounded-[2px] border border-slate-200 bg-white p-3 dark:border-border-subtle dark:bg-surface-card">' +
          '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400"><span class="text-[10px] font-black uppercase tracking-wider">Cihaz iletişimi</span><i class="pi pi-wifi text-sky-500"></i></div>' +
          '<div class="mt-1 flex items-end gap-1.5"><span class="text-2xl font-black text-slate-900 dark:text-slate-100">' + s.deviceOnline + '</span><span class="pb-1 text-[10px] font-bold text-slate-500">/ ' + s.deviceTotal + ' çevrimiçi</span></div>' +
          '<div class="mt-1 text-[9px] font-bold text-rose-600 dark:text-rose-300">' + (s.deviceOffline + s.deviceCritical) + ' erişilemeyen/alarm · ' + s.deviceWarning + ' uyarı · ' + s.deviceUnknown + ' belirsiz</div>' +
        '</article>' +
        '<article class="rounded-[2px] border border-slate-200 bg-white p-3 dark:border-border-subtle dark:bg-surface-card">' +
          '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400"><span class="text-[10px] font-black uppercase tracking-wider">İşleme riski</span><i class="pi pi-gauge text-amber-500"></i></div>' +
          '<div class="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">' + (s.runtimeCritical + s.runtimeWarning) + '</div>' +
          '<div class="mt-1 text-[9px] text-slate-500 dark:text-slate-400">' + s.runtimeBusyHealthy + ' bileşen dolu ama yetişiyor</div>' +
        '</article>' +
        '<article class="rounded-[2px] border border-slate-200 bg-white p-3 dark:border-border-subtle dark:bg-surface-card">' +
          '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400"><span class="text-[10px] font-black uppercase tracking-wider">Ölçüm kapsamı</span><i class="pi pi-database text-purple-500"></i></div>' +
          '<div class="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">' + (s.runtimeTotal - s.runtimeUnknown) + '</div>' +
          '<div class="mt-1 text-[9px] text-slate-500 dark:text-slate-400">' + s.runtimeUnknown + ' bileşende ölçüm doğrulanamadı</div>' +
        '</article>' +
      '</section>' +
      '<section class="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">' +
        '<article class="rounded-[2px] border border-slate-200 bg-white dark:border-border-subtle dark:bg-surface-card">' +
          '<header class="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-border-subtle"><div>' +
            '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100">Operasyon özeti</h2><p class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Teknik sayaçlar yerine müdahale gerektiren desenler</p></div>' +
            '<span class="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">' + data.issueGroups.length + '</span>' +
          '</header>' +
          (data.issueGroups.length === 0
            ? '<div class="flex min-h-44 flex-col items-center justify-center p-6 text-center"><i class="pi pi-verified text-3xl text-emerald-500"></i><div class="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">İşleme sorunu görünmüyor</div><div class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Yüksek yüzdeler, kuyruk ve gecikme yoksa alarm sayılmaz.</div></div>'
            : '<div class="divide-y divide-slate-100 dark:divide-slate-800">' +
              data.issueGroups.map(issue =>
                '<div class="p-3"><div class="flex items-start gap-2">' +
                  '<span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ' + severityPanelClass(issue.severity) + '"><i class="' + severityIcon(issue.severity) + ' text-xs"></i></span>' +
                  '<div class="min-w-0 flex-1">' +
                    '<div class="flex flex-wrap items-center gap-2"><h3 class="text-xs font-black text-slate-900 dark:text-slate-100">' + esc(issue.title) + '</h3>' +
                      '<span class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">' + issue.count + ' bileşen</span></div>' +
                    '<p class="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">' + esc(issue.detail) + '</p>' +
                    '<p class="mt-1.5 text-[10px] font-bold text-sky-700 dark:text-sky-300"><i class="pi pi-arrow-right mr-1 text-[8px]"></i>' + esc(issue.action) + '</p>' +
                  '</div>' +
                '</div></div>').join('') +
              '</div>') +
        '</article>' +
        '<article class="rounded-[2px] border border-slate-200 bg-white dark:border-border-subtle dark:bg-surface-card">' +
          '<header class="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-border-subtle"><div>' +
            '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100">Etkilenen saha cihazları</h2><p class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Operatörün aksiyon alabileceği iletişim durumları</p></div>' +
            '<span class="rounded-full bg-rose-500/10 px-2 py-1 text-[9px] font-black text-rose-700 dark:text-rose-300">' + devs.length + '</span>' +
          '</header>' +
          (devs.length === 0
            ? '<div class="flex min-h-44 flex-col items-center justify-center p-6 text-center"><i class="pi pi-wifi text-3xl text-emerald-500"></i><div class="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">Cihaz iletişimi normal</div></div>'
            : '<div class="max-h-[460px] overflow-auto"><table class="w-full border-collapse text-left text-xs">' +
                '<thead class="sticky top-0 z-10 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:bg-surface-panel dark:text-slate-400"><tr><th class="px-3 py-2">Cihaz</th><th class="px-3 py-2 text-right">Durum</th></tr></thead>' +
                '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
                devs.map(d =>
                  '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50">' +
                    '<td class="px-3 py-2"><div class="font-bold text-slate-900 dark:text-slate-100">' + esc(operatorDeviceName(d)) + '</div><div class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Saha cihazı</div></td>' +
                    '<td class="px-3 py-2 text-right">' + statusBadge(d.status === 'critical' ? 'critical' : d.status === 'warning' ? 'warning' : 'lost', deviceStatusLabel(d)) + '</td>' +
                  '</tr>').join('') +
                '</tbody></table></div>') +
        '</article>' +
      '</section>';
  }

  // ---------------------------------------------------------------------------
  // Yoklama döngüsü (POLL_INTERVAL_MS) + manuel yenileme
  // ---------------------------------------------------------------------------
  let tick = 1;
  let lastRaw = null;
  function poll() {
    const raw = H.sample(tick++);
    // Kısmi/bayat/bağlantısız gösterimde kanal satırları son başarılı yanıttan korunur
    if (forcedState === 'partial' && lastRaw) raw.devices = lastRaw.devices;
    if ((forcedState === 'stale' || forcedState === 'disconnected') && lastRaw) Object.assign(raw, lastRaw);
    lastRaw = raw;
    snapshot = buildSnapshot(raw, Date.now(), forcedState);
    render();
  }

  root.addEventListener('click', e => {
    if (!e.target.closest('[data-refresh]') || refreshing) return;
    refreshing = true;
    render();
    setTimeout(() => { refreshing = false; poll(); timer = restartTimer(); }, 700);
  });
  const restartTimer = () => { clearInterval(timer); return setInterval(poll, POLL_INTERVAL_MS); };
  let timer = null;

  render();
  // İlk döngü: sayaç geçmişi için bir önceki örnek (5 sn önce) sessizce işlenir
  buildSnapshot(H.sample(0), Date.now() - POLL_INTERVAL_MS, 'fresh');
  setTimeout(() => { poll(); timer = restartTimer(); }, 600);
})();
