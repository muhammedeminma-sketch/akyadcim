/* ==========================================================================
   DCIM Sunum — Sistem Sağlığı (SystemHealthComponent, operatör görünümü)
   Sekmeler: Genel (AyxdbHealthService) · Performans (AyxdbPerformanceService)
   - Genel: 5 sn'lik yoklama, sayaç geçmişi, çalışma bileşeni teşhisi (diagnoseRuntimeNode), özet,
     sorun grupları, genel önem.
   - Performans: "Saha verisi vaktinde mi?" — her bileşenin örneği Sağlıklı / Bozulma / Kırılma diye
     sınıflanır (classifyPerfSample), sınıf 30 sn kesintisiz sürerse ışık yanar, daha kısası "Kısa tepe".
     Son 10 dk'lık gecikme eğrisi, eşik üstü payı, worker doluluğu, oturum doluluğu; Saha bağlantıları
     (zamanlayıcı taşıyan bağlantılar) ve Altyapı işleri ayrı listelenir.
   - Rapor al (app-report-export-menu): Genel / Performans, "İlk N satır" seçeneği; Genel raporu ekrandaki
     30 satırla kesilmeden TÜM sorunlu cihazları içerir.
   Ham satırlar: DCIM.data.healthPerf.sample(rel) (js/mock/system-health.data.js → DCIM.data.health.sample)
   Sunum: izleme penceresi sayfa açılışında son 10 dk'lık geçmişle doldurulur (orijinalde sayfa açıkken birikir).
   Not: css/components.css'teki genel "svg { height:100% }" kuralı .h-10'u ezdiği için eğri yüksekliği satır içi verilir.
   Derin bağlantılar:
     ?state=fresh|partial|stale|disconnected   kaynak durumu (stale: son geçerli ölçüm ≈2 dk önce, değerlendirme durur)
     ?tab=overview|performance                 açılış sekmesi
     ?report=1                                 rapor menüsünü açık başlat
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtTime, statusBadge, button } = DCIM.ui;
  const kit = DCIM.kit;
  const HP = DCIM.data.healthPerf;
  DCIM.shell.init({ active: 'health' });

  const POLL_INTERVAL_MS = DCIM.data.health.pollIntervalMs || 5000;
  const LOAD_WARNING_PERCENT = 80;
  const LATENCY_CRITICAL_US = 1000000;
  const WINDOW_LATE_MS = 2000;

  const params = new URLSearchParams(window.location.search);
  const forcedState = ['fresh', 'partial', 'stale', 'disconnected'].indexOf(params.get('state')) >= 0 ? params.get('state') : 'fresh';
  let activeTab = params.get('tab') === 'performance' ? 'performance' : 'overview';

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
      workerCount: numberValue(row.thr_wrk),
      timerCount: numberValue(row.tmr_cnt),
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

  const COLLATOR_TR = new Intl.Collator('tr');
  function buildSnapshot(raw, sampledAt, sourceState) {
    const upd = sourceState === 'fresh' || sourceState === 'partial';
    const runtimeNodes = []
      .concat(raw.roots.map(r => toRuntimeNode(r, 'xdb', sampledAt, upd)))
      .concat(raw.threads.map(r => toRuntimeNode(r, 'thread', sampledAt, upd)))
      .concat(raw.connections.map(r => toRuntimeNode(r, 'connection', sampledAt, upd)))
      .sort((a, b) => severityRank(b.diagnosis.severity) - severityRank(a.diagnosis.severity) || a.document.localeCompare(b.document) || a.id.localeCompare(b.id));
    const devices = raw.devices.map(toDevice)
      .sort((a, b) => entityStatusRank(b.status) - entityStatusRank(a.status) || a.document.localeCompare(b.document) || COLLATOR_TR.compare(a.description, b.description));
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
  // Performans eşiği (ayxdb-performance.service.ts)
  //   kirilma  gecikme >= yoklama periyodu (veri, toplanma aralığından bayat)
  //   bozulma  gecikme >= 1 sn | cyc_ovr > 0 | tmr_skp artıyor | thr_win_ms >= 2000 | oturum >= %90
  //   Işık, sınıf PERF_PERSIST_MS boyunca sürerse yanar; kısa tepeler "geçici" kalır.
  // ---------------------------------------------------------------------------
  const PERF_POLL_PERIOD_S = 30;
  const PERF_LATENCY_LIMIT_US = 1000000;
  const PERF_WINDOW_LATE_MS = 2000;
  const PERF_SESSION_RATIO = 0.9;
  const PERF_PERSIST_MS = 30000;
  const PERF_WINDOW_MS = 10 * 60000;
  const PERF_GAP_RESET_MS = 20000;
  const BATCH_PREFIXES = ['TH_SUM'];
  const SPARK_W = 120;
  const SPARK_H = 28;

  const formatSeconds = us => (us / 1000000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' sn';
  function formatLatencyShort(us) {
    if (us === null || us === undefined) return '-';
    if (us >= 1000000) return formatSeconds(us);
    if (us >= 1000) return (us / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ms';
    return us.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' µs';
  }
  const perfLatencyUs = node => (nz(node.workerCount) > 0 ? node.workerLatencyUs : node.threadLatencyUs);

  function classifyPerfSample(node) {
    if (BATCH_PREFIXES.some(p => node.id.indexOf(p) === 0)) return { cls: 'toplu', reasons: ['saatlik toplu iş; tepe tasarım gereği'] };
    const running = node.status === 'online' || node.status === 'warning' || node.status === 'critical';
    if (!node.metricsAvailable || !running) return { cls: 'bilinmiyor', reasons: node.metricsAvailable ? ['bileşen koşmuyor'] : ['yük ölçümü yok'] };
    const latency = perfLatencyUs(node);
    if (latency !== null && latency >= PERF_POLL_PERIOD_S * 1000000) {
      return { cls: 'kirilma', reasons: ['gecikme ' + formatSeconds(latency) + ' ≥ ' + PERF_POLL_PERIOD_S + ' sn periyot'] };
    }
    const reasons = [];
    if (latency !== null && latency >= PERF_LATENCY_LIMIT_US) reasons.push('gecikme ' + formatSeconds(latency));
    const overrun = nz(node.threadCycleOverrun) + nz(node.workerCycleOverrun);
    if (overrun > 0) reasons.push('iş yarım kalıyor (cyc_ovr)');
    if (nz(node.skippedPerSecond) > 0) reasons.push('sorgu düşürülüyor (tmr_skp)');
    if (nz(node.windowMs) >= PERF_WINDOW_LATE_MS) reasons.push('ölçüm penceresi gecikti');
    const capacity = nz(node.sessionCapacity);
    if (capacity > 0 && nz(node.sessionCount) >= capacity * PERF_SESSION_RATIO) reasons.push('oturum doluluğu ≥ %90');
    return { cls: reasons.length ? 'bozulma' : 'saglikli', reasons };
  }

  const perfState = { startedAt: Date.now(), lastSampledAt: 0, history: new Map(), snapshot: null };

  function perfAccumulate(snapshot) {
    const state = perfState;
    const at = snapshot.sampledAt.getTime();
    state.snapshot = snapshot;
    // Bayat ya da kopuk snapshot ölçüm sayılmaz; eski yeşil korunmaz ama yeni örnek de eklenmez.
    if (snapshot.sourceState !== 'fresh' || at <= state.lastSampledAt) return;
    state.lastSampledAt = at;
    const seen = new Set();
    snapshot.runtimeNodes.forEach(node => {
      seen.add(node.key);
      const cls = classifyPerfSample(node).cls;
      const h = state.history.get(node.key) || { samples: [], badSince: null, brokenSince: null };
      const last = h.samples[h.samples.length - 1];
      if (last && at - last.at > PERF_GAP_RESET_MS) { h.samples = []; h.badSince = null; h.brokenSince = null; }
      h.samples.push({ at, cls, latencyUs: perfLatencyUs(node) });
      while (h.samples.length && at - h.samples[0].at > PERF_WINDOW_MS) h.samples.shift();
      const bad = cls === 'bozulma' || cls === 'kirilma';
      h.badSince = bad ? (h.badSince != null ? h.badSince : at) : null;
      h.brokenSince = cls === 'kirilma' ? (h.brokenSince != null ? h.brokenSince : at) : null;
      state.history.set(node.key, h);
    });
    Array.from(state.history.keys()).forEach(k => { if (!seen.has(k)) state.history.delete(k); });
  }

  function levelOf(cls, h, now) {
    if (cls === 'toplu' || cls === 'bilinmiyor') return cls;
    if (cls === 'saglikli' || !h) return cls === 'saglikli' ? 'saglikli' : 'gecici';
    if (h.brokenSince !== null && now - h.brokenSince >= PERF_PERSIST_MS) return 'kirilma';
    if (h.badSince !== null && now - h.badSince >= PERF_PERSIST_MS) return 'bozulma';
    return 'gecici';
  }

  function sparkline(samples) {
    const values = samples.map(s => (s.latencyUs == null ? 0 : s.latencyUs));
    if (values.length < 2) return { sparkPoints: '', sparkThresholdY: null };
    const top = Math.max.apply(null, values.concat([PERF_LATENCY_LIMIT_US * 1.25]));
    const step = SPARK_W / (values.length - 1);
    const y = v => (SPARK_H - (v / top) * SPARK_H).toFixed(1);
    return { sparkPoints: values.map((v, i) => (i * step).toFixed(1) + ',' + y(v)).join(' '), sparkThresholdY: Number(y(PERF_LATENCY_LIMIT_US)) };
  }

  function toNodeView(node, h, now) {
    const c = classifyPerfSample(node);
    const samples = h ? h.samples : [];
    const judged = samples.filter(s => s.cls !== 'toplu' && s.cls !== 'bilinmiyor');
    const bad = judged.filter(s => s.cls === 'bozulma' || s.cls === 'kirilma').length;
    const latencies = samples.map(s => s.latencyUs).filter(v => v !== null);
    return Object.assign({
      key: node.key,
      node,
      path: node.document ? node.document + '/' + node.id : node.id,
      name: node.description || (node.document ? node.document + ' · ' + node.id : node.id),
      // Zamanlayıcı taşıyan bağlantı = sahayı yoklayan bağlantı
      isPolling: node.kind === 'connection' && nz(node.timerCount) > 0,
      level: levelOf(c.cls, h, now),
      sampleClass: c.cls,
      reasons: c.reasons,
      latencyUs: perfLatencyUs(node),
      windowPeakLatencyUs: latencies.length ? Math.max.apply(null, latencies) : null,
      queue: Math.max(nz(node.threadQueue), nz(node.workerQueue)),
      badSharePercent: judged.length ? (100 * bad) / judged.length : null,
      sampleCount: samples.length,
      badSinceMs: h ? h.badSince : null
    }, sparkline(samples));
  }

  const LEVEL_RANK = { kirilma: 5, bozulma: 4, gecici: 3, bilinmiyor: 2, toplu: 1, saglikli: 0 };
  function buildPerfView() {
    const state = perfState;
    const snapshot = state.snapshot;
    if (!snapshot) return null;
    const now = state.lastSampledAt || snapshot.sampledAt.getTime();
    const nodes = snapshot.runtimeNodes.map(n => toNodeView(n, state.history.get(n.key), now))
      .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || nz(b.latencyUs) - nz(a.latencyUs) || a.path.localeCompare(b.path));
    const counts = { saglikli: 0, gecici: 0, bozulma: 0, kirilma: 0, toplu: 0, bilinmiyor: 0 };
    nodes.forEach(v => { counts[v.level]++; });
    return {
      snapshot, nodes,
      polling: nodes.filter(v => v.isPolling),
      infrastructure: nodes.filter(v => !v.isPolling),
      counts,
      windowMinutes: PERF_WINDOW_MS / 60000,
      trackedSinceMs: state.startedAt,
      lastSampledAt: state.lastSampledAt
    };
  }

  function perfLevelLabel(l) {
    return l === 'kirilma' ? 'Kırılma' : l === 'bozulma' ? 'Bozulma' : l === 'gecici' ? 'Kısa tepe' : l === 'toplu' ? 'Toplu iş' : l === 'bilinmiyor' ? 'Ölçüm yok' : 'Sağlıklı';
  }
  function perfLevelBadge(l) {
    return l === 'kirilma' ? 'critical' : l === 'bozulma' ? 'warning' : l === 'gecici' ? 'info' : l === 'bilinmiyor' ? 'lost' : l === 'toplu' ? 'inactive' : 'normal';
  }
  /** Yöneticiye tek cümle: veri vaktinde mi, ne kadar geç? */
  function perfSentence(v) {
    const latency = v.latencyUs;
    if (v.level === 'kirilma') return 'Veri ' + PERF_POLL_PERIOD_S + " sn'lik toplama aralığından daha bayat (" + formatSeconds(nz(latency)) + ' geç).';
    if (v.level === 'bozulma') return latency !== null && latency >= PERF_LATENCY_LIMIT_US
      ? 'Veri ' + formatSeconds(latency) + ' geç geliyor.'
      : 'Veri vaktinde ama kapasite sınırda: ' + v.reasons.join(', ') + '.';
    if (v.level === 'gecici') return 'Kısa bir tepe var; 30 sn sürmediği için eşik aşılmadı.';
    if (v.level === 'toplu') return 'Saatlik toplu iş; saat başı tepe yapması normal.';
    if (v.level === 'bilinmiyor') return v.reasons[0] ? 'Değerlendirilemedi: ' + v.reasons[0] + '.' : 'Değerlendirilemedi.';
    return latency !== null ? 'Veri vaktinde (' + formatLatencyShort(latency) + ').' : 'Veri vaktinde.';
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
  const isProblemDevice = d => d.status === 'critical' || d.status === 'offline' || d.status === 'warning' || d.status === 'unknown';
  const problemDevices = s => s.devices.filter(isProblemDevice).slice(0, 30);
  function perfCardClass(l) {
    if (l === 'kirilma') return 'border-rose-500/50 bg-rose-500/5';
    if (l === 'bozulma') return 'border-amber-500/50 bg-amber-500/5';
    if (l === 'saglikli') return 'border-emerald-500/40 bg-white dark:bg-surface-card';
    return 'border-slate-200 bg-white dark:border-border-subtle dark:bg-surface-card';
  }
  const perfStroke = l => (l === 'kirilma' ? '#e11d48' : l === 'bozulma' ? '#d97706' : '#0284c7');
  const percent = v => (v === null || v === undefined ? '-' : '%' + v.toLocaleString('tr-TR', { maximumFractionDigits: 0 }));
  const sessionPercent = v => (nz(v.node.sessionCapacity) > 0 ? (100 * nz(v.node.sessionCount)) / v.node.sessionCapacity : null);
  const workerLoadOf = v => (v.node.workerLoad != null ? v.node.workerLoad : v.node.threadLoad);
  // AppStatusBadgeComponent 'inactive' (gri) — shell statusBadge'de ayrı sınıf yok
  function badge(status, label) {
    if (status !== 'inactive') return statusBadge(status, label);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse bg-slate-400"></span>' + esc(label) + '</span>';
  }

  // ---------------------------------------------------------------------------
  // Çizim — başlık (rapor menüsü kalıcı), sekmeler, içerik (her yoklamada)
  // ---------------------------------------------------------------------------
  const root = document.getElementById('sh-root');
  let snapshot = null;
  let perf = null;
  let refreshing = false;

  const TABS = [
    { id: 'overview', label: 'Genel', icon: 'pi pi-heart' },
    { id: 'performance', label: 'Performans', icon: 'pi pi-gauge' }
  ];
  const REPORT_SCOPES = [
    { id: 'overview', label: 'Genel', hint: 'Operasyon özeti ve etkilenen saha cihazları' },
    { id: 'performance', label: 'Performans', hint: 'Saha bağlantıları ve altyapı işleri' }
  ];

  root.innerHTML =
    kit.pageHeader({
      title: 'Sistem Sağlığı',
      breadcrumbs: [{ label: 'İzleme' }, { label: 'Sistem Sağlığı' }],
      actions: '<div class="flex flex-wrap items-center gap-2"><span data-source-badge class="[&>span]:h-8"></span><span data-refresh-slot></span><div data-report-menu></div></div>'
    }) +
    '<nav class="flex gap-1 overflow-x-auto rounded-[2px] border border-slate-200 bg-white p-1 dark:border-border-subtle dark:bg-surface-card" role="tablist" aria-label="Sistem sağlığı bölümleri" data-tabs></nav>' +
    '<div class="flex flex-col gap-3" data-content></div>';
  const $ = sel => root.querySelector(sel);

  const reportMenu = DCIM.report.menu($('[data-report-menu]'), {
    label: 'Rapor al', scopes: REPORT_SCOPES, options: 'limit', unit: 'satır', disabled: true, onExport: exportReport
  });

  function renderHeaderBits() {
    $('[data-source-badge]').innerHTML = snapshot
      ? statusBadge(snapshot.sourceState === 'fresh' ? 'normal' : snapshot.sourceState === 'partial' ? 'warning' : 'lost', sourceLabel(snapshot))
      : '';
    $('[data-refresh-slot]').innerHTML = button({ variant: 'secondary', icon: refreshing ? 'pi pi-spin pi-spinner' : 'pi pi-refresh', label: 'Yenile', attrs: 'data-refresh' + (refreshing ? ' disabled' : '') });
  }

  function renderTabs() {
    $('[data-tabs]').innerHTML = TABS.map(t =>
      '<button type="button" role="tab" aria-selected="' + (activeTab === t.id) + '" data-tab="' + t.id + '" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[2px] border px-3 text-[10px] font-black transition-colors ' +
        (activeTab === t.id ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800') + '">' +
        '<i class="' + t.icon + ' text-xs"></i>' + t.label + '</button>').join('');
  }

  const STALE_BANNER =
    '<section class="rounded-[2px] border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-800 dark:text-orange-200" aria-live="polite"><div class="flex items-start gap-2"><i class="pi pi-exclamation-triangle mt-0.5"></i><div>' +
      '<div class="font-black">Canlı veri doğrulanamadı</div><div class="mt-0.5 text-[10px] opacity-80">Eski yeşil durumlar korunmadı. Bağlantı geri gelene kadar aşağıdaki sayılar eksik olabilir.</div></div></div></section>';

  function overviewHtml(data) {
    const s = data.summary;
    const devs = problemDevices(data);
    return (data.sourceState !== 'fresh' ? STALE_BANNER : '') +
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

  function perfCardHtml(v, p) {
    return '<article class="flex flex-col gap-2 rounded-[2px] border p-3 ' + perfCardClass(v.level) + '">' +
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<div class="truncate text-xs font-black text-slate-900 dark:text-slate-100" title="' + esc(v.name) + '">' + esc(v.name) + '</div>' +
          '<div class="truncate font-mono text-[9px] text-slate-500" title="' + esc(v.path) + '">' + esc(v.path) + ' · ' + nz(v.node.timerCount) + ' sorgu bloğu · ' + nz(v.node.workerCount) + ' işçi</div>' +
        '</div>' +
        badge(perfLevelBadge(v.level), perfLevelLabel(v.level)) +
      '</div>' +
      '<p class="text-sm font-black leading-snug text-slate-900 dark:text-slate-100">' + esc(perfSentence(v)) + '</p>' +
      (v.sparkPoints
        ? '<svg viewBox="0 0 120 28" preserveAspectRatio="none" class="h-10 w-full" style="height:2.5rem" role="img" aria-label="Son ' + p.windowMinutes + ' dakikanın gecikme eğrisi">' +
            (v.sparkThresholdY !== null ? '<line x1="0" x2="120" y1="' + v.sparkThresholdY + '" y2="' + v.sparkThresholdY + '" stroke="#94a3b8" stroke-width="0.4" stroke-dasharray="2 2"></line>' : '') +
            '<polyline points="' + v.sparkPoints + '" fill="none" stroke="' + perfStroke(v.level) + '" stroke-width="1.2" vector-effect="non-scaling-stroke"></polyline></svg>'
        : '<div class="flex h-10 items-center text-[9px] text-slate-400">Eğri için birkaç ölçüm bekleniyor…</div>') +
      '<div class="grid grid-cols-4 gap-1 text-center text-[9px]">' +
        '<div class="rounded-[2px] bg-slate-100 px-1 py-1 dark:bg-slate-800"><div class="text-slate-500">Gecikme</div><b>' + formatLatencyShort(v.latencyUs) + '</b></div>' +
        '<div class="rounded-[2px] bg-slate-100 px-1 py-1 dark:bg-slate-800"><div class="text-slate-500">' + p.windowMinutes + ' dk eşik üstü</div><b>' + percent(v.badSharePercent) + '</b></div>' +
        '<div class="rounded-[2px] bg-slate-100 px-1 py-1 dark:bg-slate-800"><div class="text-slate-500">İşçi doluluğu</div><b>' + percent(workerLoadOf(v)) + '</b></div>' +
        '<div class="rounded-[2px] bg-slate-100 px-1 py-1 dark:bg-slate-800"><div class="text-slate-500">Oturum</div><b>' + percent(sessionPercent(v)) + '</b></div>' +
      '</div>' +
    '</article>';
  }

  function performanceHtml(p) {
    const kpi = (cls, labelCls, label, value, hint) =>
      '<article class="rounded-[2px] border ' + cls + ' bg-white p-3 dark:bg-surface-card">' +
        '<div class="text-[10px] font-black uppercase tracking-wider ' + labelCls + '">' + label + '</div>' +
        '<div class="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">' + value + '</div>' +
        '<div class="text-[9px] text-slate-500">' + hint + '</div></article>';
    const stale = p.snapshot.sourceState !== 'fresh';
    return (stale ? STALE_BANNER : '') +
      '<section class="rounded-[2px] border border-slate-200 bg-white px-3 py-2 dark:border-border-subtle dark:bg-surface-card">' +
        '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100">Saha verisi vaktinde mi?</h2>' +
        '<p class="mt-1 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">Her saha bağlantısı için motorun kendi ölçümü okunur. Sorgu <b>30 sn boyunca 1 sn\'den geç</b> başlıyorsa ya da iş kaybı varsa <b>Bozulma</b>, ' +
          "veri 30 sn'lik toplama aralığından daha bayatsa <b>Kırılma</b>. Daha kısa tepeler alarm sayılmaz. Yüzdeye değil gecikmeye bakılır.</p>" +
      '</section>' +
      '<section class="grid grid-cols-2 gap-2 xl:grid-cols-4">' +
        kpi('border-emerald-500/40', 'text-emerald-700 dark:text-emerald-300', 'Sağlıklı', p.counts.saglikli, 'bileşen, veri vaktinde') +
        kpi('border-sky-500/40', 'text-sky-700 dark:text-sky-300', 'Kısa tepe', p.counts.gecici, "30 sn'den kısa; izleniyor") +
        kpi('border-amber-500/50', 'text-amber-700 dark:text-amber-300', 'Bozulma', p.counts.bozulma, 'veri gecikiyor') +
        kpi('border-rose-500/50', 'text-rose-700 dark:text-rose-300', 'Kırılma', p.counts.kirilma, 'veri toplama aralığından bayat') +
      '</section>' +
      '<section>' +
        '<h2 class="mb-2 text-xs font-black text-slate-900 dark:text-slate-100">Saha bağlantıları</h2>' +
        (p.polling.length === 0 ? '<div class="rounded-[2px] border border-slate-200 bg-white p-6 text-center text-[10px] text-slate-500 dark:border-border-subtle dark:bg-surface-card">Sahayı yoklayan bağlantı bulunamadı.</div>' : '') +
        '<div class="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">' + p.polling.map(v => perfCardHtml(v, p)).join('') + '</div>' +
      '</section>' +
      '<section class="rounded-[2px] border border-slate-200 bg-white dark:border-border-subtle dark:bg-surface-card">' +
        '<header class="border-b border-slate-200 px-3 py-2 dark:border-border-subtle">' +
          '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100">Altyapı işleri</h2>' +
          '<p class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">Veritabanı, arayüz kanalları ve zamanlanmış işler</p>' +
        '</header>' +
        '<div class="max-h-[420px] overflow-auto"><table class="w-full border-collapse text-left text-[10px]">' +
          '<thead class="sticky top-0 bg-slate-50 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:bg-surface-panel dark:text-slate-400">' +
            '<tr><th class="px-3 py-2">Bileşen</th><th class="px-3 py-2">Durum</th><th class="px-3 py-2">Bir cümle</th><th class="px-3 py-2 text-right">' + p.windowMinutes + ' dk eşik üstü</th></tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
            p.infrastructure.map(v =>
              '<tr><td class="px-3 py-1.5"><div class="font-bold text-slate-900 dark:text-slate-100">' + esc(v.name) + '</div><div class="font-mono text-[8px] text-slate-400">' + esc(v.path) + '</div></td>' +
                '<td class="px-3 py-1.5">' + badge(perfLevelBadge(v.level), perfLevelLabel(v.level)) + '</td>' +
                '<td class="px-3 py-1.5 text-slate-600 dark:text-slate-300">' + esc(perfSentence(v)) + '</td>' +
                '<td class="px-3 py-1.5 text-right font-mono">' + percent(v.badSharePercent) + '</td></tr>').join('') +
          '</tbody></table></div>' +
      '</section>' +
      '<p class="text-[9px] text-slate-500 dark:text-slate-400"><i class="pi pi-info-circle mr-1"></i>Ekran, sayfa açık olduğu sürece son ' + p.windowMinutes + ' dakikayı izler (izleme başlangıcı ' + fmtTime(new Date(p.trackedSinceMs)).slice(0, 5) + '). ' +
        'Günlük ve haftalık değerlendirme aynı kuralı motor loglarına uygulayan yük testi raporundadır.' +
        (stale && p.lastSampledAt ? ' <b class="text-orange-600 dark:text-orange-300">Son geçerli ölçüm ' + fmtTime(new Date(p.lastSampledAt)) + '; canlı veri gelene kadar değerlendirme durdu.</b>' : '') +
      '</p>';
  }

  function render() {
    renderHeaderBits();
    renderTabs();
    const content = $('[data-content]');
    if (!snapshot) {
      content.innerHTML = '<div class="flex min-h-64 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-sm text-slate-500 dark:border-border-subtle dark:bg-surface-card dark:text-slate-400"><i class="pi pi-spin pi-spinner mr-2"></i> Sistem durumu okunuyor...</div>';
      return;
    }
    content.innerHTML = activeTab === 'performance' ? (perf ? performanceHtml(perf) : '') : overviewHtml(snapshot);
  }

  // ---------------------------------------------------------------------------
  // Rapor (exportReport) — "İlk N" seçilirse her tabloya uygulanır
  // ---------------------------------------------------------------------------
  function exportReport(req) {
    if (!snapshot) return;
    const data = snapshot;
    const scopeLabel = (REPORT_SCOPES.find(s => s.id === req.scope) || {}).label || '';
    const limitText = req.limit ? 'tablo başına ilk ' + req.limit + ' satır' : 'tüm satırlar';
    const dataTime = data.sampledAt.toLocaleString('tr-TR');
    let doc;
    if (req.scope === 'performance') {
      const p = perf;
      if (!p) return;
      const perfTone = v => (v.level === 'kirilma' ? 'critical' : v.level === 'bozulma' ? 'warning' : v.level === 'gecici' ? 'info' : v.level === 'saglikli' ? 'normal' : '');
      const row = v => ({ name: v.name, path: v.path, level: perfLevelLabel(v.level), sentence: perfSentence(v), latency: formatLatencyShort(v.latencyUs), bad: percent(v.badSharePercent), load: percent(workerLoadOf(v)), ses: percent(sessionPercent(v)), tone: perfTone(v) });
      const win = p.windowMinutes + ' dk eşik üstü';
      doc = {
        title: 'Sistem Sağlığı Raporu',
        subtitle: scopeLabel + ' · İzleme · ' + limitText + ' · veri ' + dataTime,
        filename: 'Sistem_Sagligi_Performans',
        kpis: [
          { label: 'Sağlıklı', value: p.counts.saglikli, tone: 'normal' },
          { label: 'Kısa tepe', value: p.counts.gecici, tone: 'info' },
          { label: 'Bozulma', value: p.counts.bozulma, tone: p.counts.bozulma ? 'warning' : 'normal' },
          { label: 'Kırılma', value: p.counts.kirilma, tone: p.counts.kirilma ? 'critical' : 'normal' }
        ],
        sections: [
          { title: 'Saha bağlantıları', toneKey: 'tone', rows: DCIM.report.applyLimit(p.polling, req).map(row),
            columns: [{ key: 'name', label: 'Bağlantı' }, { key: 'path', label: 'Yol' }, { key: 'level', label: 'Durum' }, { key: 'sentence', label: 'Bir cümle' },
              { key: 'latency', label: 'Gecikme', align: 'right' }, { key: 'bad', label: win, align: 'right' }, { key: 'load', label: 'İşçi doluluğu', align: 'right' }, { key: 'ses', label: 'Oturum', align: 'right' }] },
          { title: 'Altyapı işleri', toneKey: 'tone', rows: DCIM.report.applyLimit(p.infrastructure, req).map(row),
            columns: [{ key: 'name', label: 'Bileşen' }, { key: 'path', label: 'Yol' }, { key: 'level', label: 'Durum' }, { key: 'sentence', label: 'Bir cümle' }, { key: 'bad', label: win, align: 'right' }] }
        ],
        notes: ["Sorgu 30 sn boyunca 1 sn'den geç başlıyorsa ya da iş kaybı varsa Bozulma, veri 30 sn'lik toplama aralığından daha bayatsa Kırılma. Pencere: son " + p.windowMinutes + ' dakika.']
      };
    } else {
      const s = data.summary;
      const sevTone = sv => (sv === 'critical' ? 'critical' : sv === 'warning' ? 'warning' : sv === 'healthy' ? 'normal' : '');
      // Ekrandaki liste 30 satırla kesilir; raporda tamamı yer alır
      const devices = DCIM.report.applyLimit(data.devices.filter(isProblemDevice), req);
      doc = {
        title: 'Sistem Sağlığı Raporu',
        subtitle: scopeLabel + ' · İzleme · ' + limitText + ' · veri ' + dataTime,
        filename: 'Sistem_Sagligi_Genel',
        kpis: [
          { label: 'Genel durum', value: overallLabel(data.overallSeverity), tone: sevTone(data.overallSeverity) },
          { label: 'Çevrimiçi cihaz', value: s.deviceOnline + ' / ' + s.deviceTotal, tone: 'normal' },
          { label: 'Erişilemeyen / alarm', value: s.deviceOffline + s.deviceCritical, tone: s.deviceOffline + s.deviceCritical ? 'critical' : 'normal' },
          { label: 'İşleme riski', value: s.runtimeCritical + s.runtimeWarning, tone: s.runtimeCritical ? 'critical' : s.runtimeWarning ? 'warning' : 'normal' },
          { label: 'Ölçüm kapsamı', value: s.runtimeTotal - s.runtimeUnknown, hint: s.runtimeUnknown + ' bileşende doğrulanamadı' }
        ],
        sections: [
          { title: 'Operasyon özeti', toneKey: 'tone',
            rows: DCIM.report.applyLimit(data.issueGroups, req).map(i => ({ title: i.title, count: i.count, detail: i.detail, action: i.action, tone: sevTone(i.severity) })),
            columns: [{ key: 'title', label: 'Başlık' }, { key: 'count', label: 'Bileşen', align: 'right' }, { key: 'detail', label: 'Açıklama' }, { key: 'action', label: 'Yapılacak' }] },
          { title: 'Etkilenen saha cihazları', toneKey: 'tone',
            rows: devices.map(d => ({ name: operatorDeviceName(d), status: deviceStatusLabel(d), tone: d.status === 'critical' || d.status === 'offline' ? 'critical' : d.status === 'warning' ? 'warning' : '' })),
            columns: [{ key: 'name', label: 'Cihaz' }, { key: 'status', label: 'Durum' }] }
        ],
        notes: [overallLabel(data.overallSeverity) + ' · ' + sourceLabel(data) + ' · son deneme ' + dataTime]
      };
    }
    DCIM.report.generate(doc, req.format);
  }

  // ---------------------------------------------------------------------------
  // Yoklama döngüsü (POLL_INTERVAL_MS) + manuel yenileme
  // ---------------------------------------------------------------------------
  const pageOpenedAt = Date.now();
  let rel = 0;
  let lastRaw = null;
  let menuEnabled = false;

  function ingest(raw, sampledAt, sourceState) {
    snapshot = buildSnapshot(raw, sampledAt, sourceState);
    perfAccumulate(snapshot);
    perf = buildPerfView();
  }

  function poll() {
    const raw = HP.sample(rel++);
    // Kısmi/bayat/bağlantısız gösterimde kanal satırları son başarılı yanıttan korunur
    if (forcedState === 'partial' && lastRaw) raw.devices = lastRaw.devices;
    if ((forcedState === 'stale' || forcedState === 'disconnected') && lastRaw) Object.assign(raw, lastRaw);
    lastRaw = raw;
    ingest(raw, Date.now(), forcedState);
    if (!menuEnabled) { menuEnabled = true; reportMenu.update({ disabled: false }); }
    render();
  }

  root.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) { activeTab = tab.getAttribute('data-tab'); render(); return; }
    if (!e.target.closest('[data-refresh]') || refreshing) return;
    refreshing = true;
    render();
    setTimeout(() => { refreshing = false; poll(); timer = restartTimer(); }, 700);
  });
  const restartTimer = () => { clearInterval(timer); return setInterval(poll, POLL_INTERVAL_MS); };
  let timer = null;

  render();
  // Sunum: izleme penceresi (son 10 dk) sayfa açılışında geçmiş örneklerle doldurulur.
  // Bayat senaryoda son geçerli ölçüm HP.staleAfter yoklama öncesidir; sonrası değerlendirmeye girmez.
  const firstRel = -HP.warmSamples;
  const lastFreshRel = forcedState === 'fresh' ? -1 : -HP.staleAfter;
  perfState.startedAt = pageOpenedAt + firstRel * POLL_INTERVAL_MS;
  for (let r = firstRel; r <= lastFreshRel; r++) {
    const raw = HP.sample(r);
    // Geçmiş örneklerde yalnız çalışma bileşenleri gerekir (cihaz listesi son örnekte)
    ingest(r < lastFreshRel ? Object.assign({}, raw, { devices: [] }) : raw, pageOpenedAt + r * POLL_INTERVAL_MS, 'fresh');
    lastRaw = raw;
  }
  snapshot = null; perf = null;
  setTimeout(() => {
    poll();
    timer = restartTimer();
    if (params.get('report') === '1') { const b = root.querySelector('[data-report-menu] [data-rk-btn]'); if (b) b.click(); }
  }, 600);
})();
