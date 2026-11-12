/* ==========================================================================
   DCIM Sunum — Genel Bakış / Operasyon Merkezi (dashboard.html)
   Kaynak: new-ui/pages/dashboard (DashboardComponent, dashboard.component.html)
   - KPI kartları: Aktif alarmlar (seviye dağılımı, Acil mor), Cihaz durumu, Anlık PUE & CUE + dış ortam,
     Toplam IT tüketimi + soğutma / trafo yükü, Kabin doluluk oranı
   - Günlük PUE trendi (bugün, saatlik; orijinaldeki gibi SVG çizim + üzerine gelince ipucu)
   - Destek talepleri (tüm müşteriler), Kapasite ve Soğutma (eşikli göstergeler), Açık iş emirleri
   - "Ayarlar" → Dashboard Yönetimi: modül görünürlüğü localStorage 'dcim.dashboard.modules'
   - Başlıktaki rapor menüsü (page-report): PDF / Excel / CSV — saha özeti + trend + talepler + iş emirleri
   Derin bağlantılar: ?settings=1 (Dashboard Yönetimi açık), ?hide=tickets,orders,pue,capacity,kpi (yalnız bu açılış için)
   Veri: js/mock/dashboard.data.js (DCIM.data.dashboard.snapshot)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const ui = DCIM.ui;
  const esc = ui.esc;
  DCIM.shell.init({ active: 'dashboard' });

  const MODULE_STORAGE_KEY = 'dcim.dashboard.modules';
  const POLL_MS = 30000;
  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------------------
  // Biçim yardımcıları (Angular number pipe, tr)
  // ---------------------------------------------------------------------------
  const num = (v, min, max) => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max === undefined ? min : max });
  const pad = n => String(n).padStart(2, '0');
  const dmyhm = ts => { const d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  const SEV_ORDER = [
    { key: 'acil', label: 'Acil', filter: 'acil' },
    { key: 'alarm', label: 'Alarm', filter: 'alarm' },
    { key: 'uyari', label: 'Uyarı', filter: 'uyarı' },
    { key: 'kayip', label: 'Veri Alınamıyor', filter: 'kayıp' },
    { key: 'normal', label: 'Normal', filter: 'normal' }
  ];
  const DEVICE_ORDER = [
    { key: 'online', label: 'çevrimiçi' },
    { key: 'warning', label: 'Uyarı' },
    { key: 'critical', label: 'Kritik' },
    { key: 'offline', label: 'Bağlantı kesildi' },
    { key: 'disabled', label: 'Devre dışı' },
    { key: 'unknown', label: 'Bilinmiyor' }
  ];
  const CAP_META = {
    ups: { label: 'UPS Yükü', icon: 'pi pi-server' },
    trafo: { label: 'Trafo Yükü', icon: 'pi pi-bolt' },
    klima: { label: 'Soğutma Kapasitesi', icon: 'pi pi-sun' },
    kabin: { label: 'Kabin Doluluk', icon: 'pi pi-th-large' }
  };

  function severityBarClass(key) {
    switch (key) {
      case 'acil': return 'bg-purple-600 dark:bg-purple-500';
      case 'alarm': return 'bg-rose-500';
      case 'uyari': return 'bg-amber-500';
      case 'kayip': return 'bg-orange-500';
      default: return 'bg-emerald-500';
    }
  }
  function deviceBarClass(key) {
    switch (key) {
      case 'online': return 'bg-emerald-500';
      case 'warning': return 'bg-amber-500';
      case 'critical': return 'bg-rose-500';
      case 'offline': return 'bg-orange-500';
      case 'disabled': return 'bg-slate-400 dark:bg-slate-500';
      default: return 'bg-slate-300 dark:bg-slate-600';
    }
  }
  function toneAccentClass(tone) {
    switch (tone) {
      case 'acil': return 'bg-purple-600 dark:bg-purple-500';
      case 'alarm': return 'bg-rose-500';
      case 'uyari': return 'bg-amber-500';
      case 'kayip': return 'bg-orange-500';
      case 'normal': return 'bg-emerald-500';
      default: return 'bg-slate-300 dark:bg-slate-700';
    }
  }
  function toneTextClass(tone) {
    switch (tone) {
      case 'acil': return 'text-purple-700 dark:text-purple-300';
      case 'alarm': return 'text-rose-600 dark:text-rose-400';
      case 'uyari': return 'text-amber-600 dark:text-amber-400';
      case 'kayip': return 'text-orange-600 dark:text-orange-400';
      case 'normal': return 'text-emerald-600 dark:text-emerald-400';
      default: return 'text-slate-500 dark:text-slate-400';
    }
  }
  // AppStatusBadgeComponent: iş emri durum rozetleri (pending / processing → mor, stopped / inactive → gri)
  function woBadge(status, label) {
    const cls = {
      pending: 'bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50',
      processing: 'bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50',
      stopped: 'bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40',
      inactive: 'bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40'
    }[status];
    if (!cls) return ui.statusBadge(status, label);
    const dot = status === 'pending' || status === 'processing' ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'bg-slate-400';
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + cls + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + dot + '"></span>' + esc(label) + '</span>';
  }

  // ---------------------------------------------------------------------------
  // Modül görünürlüğü (Dashboard Yönetimi)
  // ---------------------------------------------------------------------------
  const MODULE_OPTIONS = [
    { key: 'showKpiSummary', title: 'Özet Metrik Kartları', description: 'Alarm, cihaz durumu, PUE, BT yükü ve kabin doluluk kartları' },
    { key: 'showTickets', title: 'Destek Talepleri', description: 'Tüm müşterilerin açık ve kapalı destek talepleri' },
    { key: 'showPueLineChart', title: 'Günlük PUE Trendi', description: 'Bugünün saatlik ortalama PUE grafiği' },
    { key: 'showCoolingHeatChart', title: 'Kapasite ve Soğutma', description: 'UPS, trafo, soğutma ve kabin doluluk göstergeleri' },
    { key: 'showWorkOrders', title: 'Açık İş Emirleri', description: 'İptal ve tamamlananlar dışındaki son iş emirleri' }
  ];
  let modules = { showKpiSummary: true, showTickets: true, showPueLineChart: true, showCoolingHeatChart: true, showWorkOrders: true };
  try {
    const saved = JSON.parse(ui.storage.get(MODULE_STORAGE_KEY) || 'null');
    if (saved) Object.keys(modules).forEach(k => { if (typeof saved[k] === 'boolean') modules[k] = saved[k]; });
  } catch (e) { /* bozuk kayıt: varsayılanlar */ }
  const HIDE_KEYS = { kpi: 'showKpiSummary', tickets: 'showTickets', pue: 'showPueLineChart', capacity: 'showCoolingHeatChart', orders: 'showWorkOrders' };
  (params.get('hide') || '').split(',').map(s => s.trim()).forEach(k => { if (HIDE_KEYS[k]) modules[HIDE_KEYS[k]] = false; });

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  let tick = 0;
  let S = null;          // son snapshot
  let view = null;       // türetilmiş görünüm değerleri
  let hoverIdx = -1;

  function derive(s) {
    const a = s.alarms;
    const maxA = Math.max(1, a.total);
    const alarmSlices = SEV_ORDER.map(o => ({ key: o.key, label: o.label, count: a.counts[o.key] || 0, pct: ((a.counts[o.key] || 0) / maxA) * 100 }));
    const c = a.counts;
    const siteTone = c.acil ? 'acil' : c.alarm ? 'alarm' : c.kayip ? 'kayip' : c.uyari ? 'uyari' : 'normal';

    const dv = s.devices;
    const maxD = Math.max(1, dv.total);
    const deviceSlices = DEVICE_ORDER.map(o => ({ key: o.key, label: o.label, count: dv.counts[o.key] || 0, pct: ((dv.counts[o.key] || 0) / maxD) * 100 }));
    const deviceIssues = dv.counts.warning + dv.counts.critical + dv.counts.offline;
    const deviceTone = dv.counts.critical ? 'alarm' : dv.counts.offline ? 'kayip' : dv.counts.warning ? 'uyari' : 'normal';

    const cap = s.capacity;
    const meter = (key, value) => {
      const cfg = cap.cfg[key];
      const pct = value !== null && cfg.max > 0 ? (value / cfg.max) * 100 : 0;
      const tone = value === null ? 'neutral' : pct >= cfg.threshold + 10 ? 'alarm' : pct >= cfg.threshold ? 'uyari' : 'normal';
      return { key, label: CAP_META[key].label, icon: CAP_META[key].icon, unit: cfg.unit, value, max: cfg.max, threshold: cfg.threshold, pct, tone };
    };
    const capacity = [meter('ups', cap.itKw), meter('trafo', cap.trafoKva), meter('klima', cap.coolingKw), meter('kabin', cap.cabinUsedU)];
    const cabinPct = cap.cabinTotalU > 0 ? (cap.cabinUsedU / cap.cabinTotalU) * 100 : 0;

    // PUE trendi: 0,1 adımlı yuvarlak eksen sınırları
    const pts = s.trend;
    let trend = null;
    if (pts.length) {
      const values = pts.map(p => p.value);
      const tMin = Math.min.apply(null, values), tMax = Math.max.apply(null, values);
      const tAvg = values.reduce((x, y) => x + y, 0) / values.length;
      let lo = Math.floor((tMin - 0.05) * 10) / 10, hi = Math.ceil((tMax + 0.05) * 10) / 10;
      if (hi - lo < 0.2) { lo -= 0.1; hi += 0.1; }
      lo = Math.max(0, lo);
      const y = v => 100 - ((v - lo) / (hi - lo)) * 100;
      const day0 = new Date(); day0.setHours(0, 0, 0, 0);
      const points = pts.map(p => ({ ts: p.ts, value: p.value, x: ((p.ts - day0.getTime()) / 86400000) * 100, y: y(p.value) }));
      const line = points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
      const first = points[0], last = points[points.length - 1];
      trend = {
        points, line, min: tMin, max: tMax, avg: tAvg, last,
        area: points.length > 1 ? line + ' L' + last.x.toFixed(2) + ',100 L' + first.x.toFixed(2) + ',100 Z' : '',
        yTicks: Array.from({ length: 5 }, (_, i) => { const v = lo + ((hi - lo) * i) / 4; return { value: v, y: y(v) }; }),
        xTicks: [0, 6, 12, 18, 24].map(h => ({ label: pad(h) + ':00', x: (h / 24) * 100 }))
      };
    }
    return { alarmSlices, siteTone, deviceSlices, deviceIssues, deviceTone, capacity, cabinPct, trend };
  }

  // ---------------------------------------------------------------------------
  // Başlık eylemleri
  // ---------------------------------------------------------------------------
  function renderActions() {
    const live = S && S.connected;
    document.getElementById('dash-actions').innerHTML =
      '<div class="flex items-center gap-2 h-8 px-2.5 rounded-[2px] border text-[11px] font-semibold bg-white dark:bg-surface-card ' +
        (live ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'border-orange-500/40 text-orange-700 dark:text-orange-400') + '">' +
        '<span class="relative flex h-2 w-2">' +
          (live ? '<span class="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping"></span>' : '') +
          '<span class="relative inline-flex h-2 w-2 rounded-full ' + (live ? 'bg-emerald-500' : 'bg-orange-500') + '"></span>' +
        '</span><span>' + (live ? 'Canlı' : 'Bağlantı yok') + '</span>' +
      '</div>' +
      '<button type="button" data-open-settings class="' + ui.buttonClasses('secondary', 'md') + ' shadow-xs"><i class="pi pi-sliders-h text-current shrink-0"></i><span class="truncate">Ayarlar</span></button>' +
      '<a href="2d.html" class="' + ui.buttonClasses('primary', 'md') + ' shadow-xs"><i class="pi pi-map text-current shrink-0"></i><span class="truncate">Dijital İkiz (2D)</span></a>';
    document.querySelector('[data-open-settings]').addEventListener('click', openSettings);
  }

  // ---------------------------------------------------------------------------
  // KPI kartları
  // ---------------------------------------------------------------------------
  const CARD_LINK = 'group relative flex flex-col min-h-[7.75rem] p-3.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden transition-all duration-150 hover:border-sky-500/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-sky-500';
  const CARD_STATIC = 'relative flex flex-col min-h-[7.75rem] p-3.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden';
  const kpiHead = (title, icon, iconCls) =>
    '<div class="flex items-start justify-between gap-2">' +
      '<span class="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(title) + '</span>' +
      '<span class="w-7 h-7 shrink-0 rounded-[2px] flex items-center justify-center bg-slate-100 dark:bg-slate-800/70 ' + iconCls + '"><i class="' + icon + ' text-sm"></i></span>' +
    '</div>';
  const BIG = 'text-2xl 2xl:text-3xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white';

  function renderKpis() {
    const host = document.getElementById('dash-kpis');
    host.classList.toggle('hidden', !modules.showKpiSummary);
    if (!modules.showKpiSummary) { host.innerHTML = ''; return; }
    const a = S.alarms, v = view, cap = S.capacity, kab = v.capacity[3];

    const alarmCard =
      '<a href="alarms.html" class="' + CARD_LINK + '">' +
        '<span class="absolute inset-x-0 top-0 h-0.5 ' + toneAccentClass(v.siteTone) + '"></span>' +
        kpiHead('Anlık Alarmlar', 'pi pi-bell', toneTextClass(v.siteTone)) +
        '<div class="flex items-baseline gap-2"><span class="' + BIG + '">' + a.total + '</span><span class="text-xs text-slate-500 dark:text-slate-400">Aktif Olay</span></div>' +
        '<div class="mt-auto pt-2">' +
          (a.total > 0
            ? '<div class="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px] bg-slate-100 dark:bg-slate-800">' +
                v.alarmSlices.filter(s => s.count > 0).map(s => '<span class="h-full ' + severityBarClass(s.key) + '" style="width:' + s.pct.toFixed(2) + '%" title="' + esc(s.label + ': ' + s.count) + '"></span>').join('') +
              '</div>' +
              '<div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">' +
                v.alarmSlices.filter(s => s.count > 0 && s.key !== 'normal').map(s =>
                  '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ' + severityBarClass(s.key) + '"></span>' +
                  '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + s.count + '</span> ' + esc(s.label) + '</span>').join('') +
                (a.unacked > 0 ? '<span class="text-slate-500 dark:text-slate-400">· ' + a.unacked + ' onay bekliyor</span>' : '') +
              '</div>'
            : '<p class="text-[11px] flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><i class="pi pi-check-circle text-[11px]"></i> Sistem Normal</p>') +
        '</div>' +
      '</a>';

    const dv = S.devices;
    const deviceCard =
      '<a href="system-health.html" class="' + CARD_LINK + '">' +
        '<span class="absolute inset-x-0 top-0 h-0.5 ' + toneAccentClass(v.deviceTone) + '"></span>' +
        kpiHead('Cihaz Durumu', 'pi pi-sitemap', 'text-sky-600 dark:text-sky-400') +
        '<div class="flex items-baseline gap-1.5"><span class="' + BIG + '">' + dv.counts.online + '</span>' +
          '<span class="text-sm font-semibold tabular-nums text-slate-400 dark:text-slate-500">/ ' + dv.total + '</span>' +
          '<span class="text-xs text-slate-500 dark:text-slate-400">çevrimiçi</span></div>' +
        '<div class="mt-auto pt-2">' +
          '<div class="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px] bg-slate-100 dark:bg-slate-800">' +
            v.deviceSlices.filter(d => d.count > 0).map(d => '<span class="h-full ' + deviceBarClass(d.key) + '" style="width:' + d.pct.toFixed(2) + '%" title="' + esc(d.label + ': ' + d.count) + '"></span>').join('') +
          '</div>' +
          '<div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300">' +
            v.deviceSlices.filter(d => d.count > 0 && d.key !== 'online').map(d =>
              '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ' + deviceBarClass(d.key) + '"></span>' +
              '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + d.count + '</span> ' + esc(d.label) + '</span>').join('') +
            (v.deviceIssues === 0 ? '<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><i class="pi pi-check-circle text-[10px]"></i> Tüm cihazlar çevrimiçi</span>' : '') +
          '</div>' +
        '</div>' +
      '</a>';

    const pueCard =
      '<div class="' + CARD_STATIC + '">' +
        '<span class="absolute inset-x-0 top-0 h-0.5 bg-sky-600/70"></span>' +
        kpiHead('Anlık PUE & Verimlilik', 'pi pi-gauge', 'text-sky-600 dark:text-sky-400') +
        '<div class="flex items-baseline gap-2"><span class="' + BIG + '">' + (S.livePue > 0 ? num(S.livePue, 2) : '—') + '</span><span class="text-xs text-slate-500 dark:text-slate-400">PUE</span></div>' +
        '<div class="mt-auto pt-2 grid grid-cols-2 gap-2 text-[11px]">' +
          '<div class="min-w-0"><span class="block text-[10px] text-slate-500 dark:text-slate-400">CUE</span>' +
            '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + (S.cue > 0 ? num(S.cue, 2) : '—') + '</span>' +
            (S.cue > 0 ? '<span class="text-[10px] text-slate-500"> kgCO₂/kWh</span>' : '') + '</div>' +
          '<div class="min-w-0 border-l border-slate-200 dark:border-slate-800 pl-2"><span class="block text-[10px] text-slate-500 dark:text-slate-400">Dış ortam</span>' +
            '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + (S.outdoor ? esc(S.outdoor.val) : '—') + '</span>' +
            (S.outdoor ? '<span class="text-[10px] text-slate-500"> ' + esc(S.outdoor.unit) + '</span>' : '') + '</div>' +
        '</div>' +
      '</div>';

    const itCard =
      '<div class="' + CARD_STATIC + '">' +
        '<span class="absolute inset-x-0 top-0 h-0.5 bg-sky-600/70"></span>' +
        kpiHead('Toplam IT Tüketimi', 'pi pi-bolt', 'text-sky-600 dark:text-sky-400') +
        '<div class="flex items-baseline gap-1.5"><span class="' + BIG + '">' + (cap.itKw !== null ? num(cap.itKw, 1) : '—') + '</span><span class="text-xs text-slate-500 dark:text-slate-400">kW</span></div>' +
        '<div class="mt-auto pt-2 grid grid-cols-2 gap-2 text-[11px]">' +
          '<div class="min-w-0"><span class="block text-[10px] text-slate-500 dark:text-slate-400">Soğutma yükü</span>' +
            '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + (cap.coolingKw !== null ? num(cap.coolingKw, 1) : '—') + '</span><span class="text-[10px] text-slate-500"> kW</span></div>' +
          '<div class="min-w-0 border-l border-slate-200 dark:border-slate-800 pl-2"><span class="block text-[10px] text-slate-500 dark:text-slate-400">Trafo yükü</span>' +
            '<span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + (cap.trafoKva !== null ? num(cap.trafoKva, 0) : '—') + '</span><span class="text-[10px] text-slate-500"> kVA</span></div>' +
        '</div>' +
      '</div>';

    const cabCard =
      '<a href="reports.html#capacity" class="' + CARD_LINK + '">' +
        '<span class="absolute inset-x-0 top-0 h-0.5 ' + toneAccentClass(kab.tone) + '"></span>' +
        kpiHead('Kabin Doluluk Oranı', 'pi pi-server', 'text-sky-600 dark:text-sky-400') +
        '<div class="flex items-baseline gap-1"><span class="' + BIG + '">' + num(v.cabinPct, 0, 1) + '</span><span class="text-sm font-semibold text-slate-500 dark:text-slate-400">%</span></div>' +
        '<div class="mt-auto pt-2">' +
          '<div class="relative h-1.5 w-full rounded-[2px] bg-slate-100 dark:bg-slate-800 overflow-hidden">' +
            '<div class="h-full rounded-[2px] transition-[width] duration-500 ' + toneAccentClass(kab.tone) + '" style="width:' + Math.min(100, v.cabinPct).toFixed(2) + '%"></div></div>' +
          '<p class="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300"><span class="font-bold tabular-nums text-slate-900 dark:text-slate-100">' + num(cap.cabinUsedU, 0) + '</span>' +
            ' / ' + num(cap.cabinTotalU, 0) + ' U · ' + cap.cabinCount + ' kabin</p>' +
        '</div>' +
      '</a>';

    host.innerHTML = alarmCard + deviceCard + pueCard + itCard + cabCard;
  }

  // ---------------------------------------------------------------------------
  // Ana ızgara kartları (app-card [fill])
  // ---------------------------------------------------------------------------
  function card(opts) {
    return '<div class="' + opts.span + '" data-card="' + opts.id + '">' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3.5 shadow-2xs transition-colors duration-150 h-full flex flex-col min-h-0">' +
        '<div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800/80 pb-2 shrink-0">' +
          '<div class="flex items-center gap-2"><i class="' + opts.icon + ' text-sky-600 dark:text-sky-400 text-sm"></i>' +
            '<div><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">' + esc(opts.title) + '</h3>' +
            (opts.subtitle ? '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(opts.subtitle) + '</p>' : '') + '</div></div>' +
          '<div class="flex items-center gap-2">' + (opts.actions || '') + '</div>' +
        '</div>' +
        '<div class="text-xs text-slate-800 dark:text-slate-200 flex-1 min-h-0 overflow-auto" data-card-body>' + opts.body + '</div>' +
      '</div></div>';
  }
  const allLink = (href, label) => '<a href="' + href + '" class="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-bold flex items-center gap-1"><span>' + label + '</span><i class="pi pi-arrow-right text-[9px]"></i></a>';
  const emptyState = (msg, icon) =>
    '<div class="flex flex-col items-center justify-center gap-2 py-6 text-center text-slate-500 dark:text-slate-400">' +
      '<i class="' + icon + ' text-2xl opacity-60"></i><p class="text-[11px]">' + esc(msg) + '</p></div>';

  function trendInner() {
    const t = view.trend;
    if (!t) return '<div class="h-48 lg:h-full flex items-center justify-center">' + emptyState('Bugün için PUE geçmişi bulunamadı.', 'pi pi-chart-line') + '</div>';
    const hp = hoverIdx >= 0 ? t.points[hoverIdx] : null;
    const hy = hp ? Math.min(80, Math.max(20, hp.y)) : 0;
    return '<div class="relative h-56 lg:h-full lg:min-h-[8rem] select-none" role="img" aria-label="Günlük PUE Trendi">' +
      '<div class="absolute inset-0 pl-9 pr-5 pt-3 pb-6">' +
        '<div class="relative w-full h-full cursor-crosshair touch-none" data-trend-plot>' +
          '<svg class="absolute inset-0 w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
            t.yTicks.map(k => '<line x1="0" x2="100" y1="' + k.y + '" y2="' + k.y + '" class="stroke-slate-200 dark:stroke-slate-800" stroke-width="1" vector-effect="non-scaling-stroke" />').join('') +
            (t.area ? '<path d="' + t.area + '" fill="#0284c7" fill-opacity="0.1" />' : '') +
            '<path d="' + t.line + '" fill="none" stroke="#0284c7" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />' +
            (hp ? '<line x1="' + hp.x + '" x2="' + hp.x + '" y1="0" y2="100" class="stroke-slate-400 dark:stroke-slate-500" stroke-width="1" vector-effect="non-scaling-stroke" />' : '') +
          '</svg>' +
          t.yTicks.map(k => '<span class="absolute -left-9 w-7 text-right text-[10px] leading-none tabular-nums text-slate-400 dark:text-slate-500 -translate-y-1/2" style="top:' + k.y + '%">' + num(k.value, 1) + '</span>').join('') +
          t.xTicks.map(k => '<span class="absolute top-full mt-1.5 text-[10px] leading-none tabular-nums text-slate-400 dark:text-slate-500 -translate-x-1/2" style="left:' + k.x + '%">' + k.label + '</span>').join('') +
          (!hp
            ? '<span class="absolute w-2.5 h-2.5 rounded-full bg-[#0284c7] ring-2 ring-white dark:ring-surface-card -translate-x-1/2 -translate-y-1/2 pointer-events-none" style="left:' + t.last.x + '%;top:' + t.last.y + '%"></span>' +
              '<span class="absolute -translate-x-1/2 text-[10px] font-bold tabular-nums text-slate-700 dark:text-slate-200 pointer-events-none ' + (t.last.y < 15 ? 'translate-y-[60%]' : '-translate-y-[170%]') + '" style="left:' + t.last.x + '%;top:' + t.last.y + '%">' + num(t.last.value, 2) + '</span>'
            : '<span class="absolute w-2.5 h-2.5 rounded-full bg-[#0284c7] ring-2 ring-white dark:ring-surface-card -translate-x-1/2 -translate-y-1/2 pointer-events-none" style="left:' + hp.x + '%;top:' + hp.y + '%"></span>' +
              '<div class="absolute z-10 pointer-events-none -translate-y-1/2 px-2.5 py-1.5 rounded-[2px] border border-slate-200 dark:border-border-muted bg-white/95 dark:bg-surface-panel/95 shadow-lg whitespace-nowrap ' + (hp.x > 70 ? '-translate-x-full -ml-3' : 'ml-3') + '" style="left:' + hp.x + '%;top:' + hy + '%">' +
                '<span class="block text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">' + hm(hp.ts) + '</span>' +
                '<span class="block text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">PUE ' + num(hp.value, 2) + '</span>' +
              '</div>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function bindTrend() {
    const plot = document.querySelector('[data-trend-plot]');
    if (!plot || !view.trend) return;
    const onMove = e => {
      const rect = plot.getBoundingClientRect();
      if (!rect.width) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      let best = 0;
      view.trend.points.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(view.trend.points[best].x - x)) best = i; });
      if (best !== hoverIdx) { hoverIdx = best; refreshTrend(); }
    };
    plot.addEventListener('pointermove', onMove);
    plot.addEventListener('pointerdown', onMove);
    plot.addEventListener('pointerleave', () => { if (hoverIdx >= 0) { hoverIdx = -1; refreshTrend(); } });
  }
  function refreshTrend() {
    const body = document.querySelector('[data-card="pue"] [data-card-body]');
    if (!body) return;
    body.innerHTML = trendInner();
    bindTrend();
  }

  function ticketsInner() {
    const tk = S.tickets;
    const box = (val, label, dot, muted) =>
      '<div class="px-2 py-1.5 rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 min-w-0">' +
        (dot ? '<span class="flex items-center gap-1 text-base font-bold leading-tight tabular-nums text-slate-900 dark:text-slate-100"><span class="w-1.5 h-1.5 rounded-full ' + dot + '"></span>' + val + '</span>'
          : '<span class="block text-base font-bold leading-tight tabular-nums ' + (muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100') + '">' + val + '</span>') +
        '<span class="block text-[10px] text-slate-500 dark:text-slate-400 truncate">' + label + '</span></div>';
    const head = '<div class="sticky top-0 z-[1] grid grid-cols-4 gap-1.5 pb-2 bg-white dark:bg-surface-card">' +
      box(tk.open, 'AÇIK') + box(tk.fresh, 'YENİ TICKET', 'bg-rose-500') + box(tk.message, 'YENİ MESAJ', 'bg-amber-500') + box(tk.closed, 'KAPALI', null, true) + '</div>';
    if (!tk.rows.length) return head + emptyState('Henüz destek talebi bulunmuyor.', 'pi pi-inbox');
    return head + '<ul class="divide-y divide-slate-100 dark:divide-slate-800/80">' + tk.rows.map(t =>
      '<li><a href="engineering.html#ticket-management" class="flex items-start gap-2.5 py-2 px-1 rounded-[2px] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors' + (t.state === 'closed' ? ' opacity-60' : '') + '">' +
        '<span class="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ' + (t.state === 'new' ? 'bg-rose-500' : t.state === 'message' ? 'bg-amber-500' : t.state === 'open' ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600') + '"></span>' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0">#' + esc(t.id) + '</span>' +
            '<span class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title="' + esc(t.subject) + '">' + esc(t.subject) + '</span>' +
            (t.state === 'new' ? '<span class="ml-auto shrink-0 px-1.5 py-px text-[9px] font-bold rounded-[2px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">YENİ TICKET</span>' : '') +
            (t.state === 'message' ? '<span class="ml-auto shrink-0 px-1.5 py-px text-[9px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">YENİ MESAJ</span>' : '') +
          '</div>' +
          (t.preview ? '<p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(t.preview) + '">' + (t.adminReply ? '<i class="pi pi-reply text-[9px] mr-0.5 text-sky-500"></i>' : '') + esc(t.preview) + '</p>' : '') +
          '<p class="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 truncate">' + (t.customer ? esc(t.customer) + ' · ' : '') + (t.ts ? dmyhm(t.ts) : '—') + '</p>' +
        '</div>' +
      '</a></li>').join('') + '</ul>';
  }

  function capacityInner(wide) {
    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 ' + (wide ? '2xl:grid-cols-4' : 'xl:grid-cols-4') + '">' + view.capacity.map(m =>
      '<div class="p-3 rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 min-w-0 truncate"><i class="' + m.icon + ' text-[11px] text-slate-400"></i> ' + esc(m.label) + '</span>' +
          '<span class="inline-flex items-center gap-1 shrink-0 text-[11px] font-bold tabular-nums text-slate-900 dark:text-slate-100">' +
            (m.value !== null ? '<span class="w-1.5 h-1.5 rounded-full ' + toneAccentClass(m.tone) + '"></span>' + num(m.pct, 0, 1) + '%' : '—') + '</span>' +
        '</div>' +
        '<div class="mt-2 relative h-2 w-full rounded-[2px] bg-slate-200 dark:bg-slate-800">' +
          '<div class="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500 ' + toneAccentClass(m.tone) + '" style="width:' + Math.min(100, m.pct).toFixed(2) + '%"></div>' +
          '<span class="absolute -top-0.5 -bottom-0.5 w-px bg-slate-500 dark:bg-slate-400" style="left:' + Math.min(100, m.threshold) + '%" title="Eşik %' + m.threshold + '"></span>' +
        '</div>' +
        '<div class="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">' +
          '<span class="truncate">' + (m.value !== null ? '<b class="text-slate-700 dark:text-slate-200">' + num(m.value, 0, 1) + '</b> / ' + num(m.max, 0) + ' ' + m.unit : 'Veri Yok') + '</span>' +
          '<span class="shrink-0">Eşik %' + m.threshold + '</span>' +
        '</div>' +
      '</div>').join('') + '</div>';
  }

  function ordersInner() {
    const wo = S.workOrders;
    if (!wo.rows.length) return emptyState('Açık iş emri bulunmuyor.', 'pi pi-inbox');
    return '<ul class="divide-y divide-slate-100 dark:divide-slate-800/80">' + wo.rows.map(w =>
      '<li><a href="work-orders.html?q=' + encodeURIComponent(w.id) + '" class="flex items-start gap-3 py-2 px-1 rounded-[2px] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">' +
        '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 min-w-0"><span class="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0">' + esc(w.id) + '</span>' +
            '<span class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title="' + esc(w.title) + '">' + esc(w.title) + '</span></div>' +
          '<p class="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">' + (w.service ? esc(w.service) + ' · ' : '') + (w.ts ? dmyhm(w.ts) : '—') + '</p>' +
        '</div>' +
        '<span class="shrink-0">' + woBadge(w.badge, w.status) + '</span>' +
      '</a></li>').join('') + '</ul>';
  }

  function renderGrid() {
    const host = document.getElementById('dash-grid');
    const pueOn = modules.showPueLineChart, tkOn = modules.showTickets, capOn = modules.showCoolingHeatChart, woOn = modules.showWorkOrders;
    const top = pueOn || tkOn, bottom = capOn || woOn;
    host.className = !top && !bottom ? 'hidden'
      : top && bottom ? 'grid grid-cols-1 lg:grid-cols-12 gap-3 lg:flex-1 lg:min-h-[22rem] lg:grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)]'
        : 'grid grid-cols-1 lg:grid-cols-12 gap-3 lg:flex-1 lg:min-h-[22rem] lg:grid-rows-[minmax(0,1fr)]';
    const t = view.trend;
    let html = '';
    if (pueOn) {
      html += card({
        id: 'pue', span: tkOn ? 'min-h-0 flex-col lg:col-span-8' : 'min-h-0 flex-col lg:col-span-12', icon: 'pi pi-chart-line', title: 'Günlük PUE Trendi', subtitle: 'Bugünün saatlik ortalama PUE değerleri',
        actions: '<div class="hidden sm:flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">' +
          (t ? '<span>Min. <b class="tabular-nums text-slate-800 dark:text-slate-200">' + num(t.min, 2) + '</b></span>' +
               '<span>Ort. <b class="tabular-nums text-slate-800 dark:text-slate-200">' + num(t.avg, 2) + '</b></span>' +
               '<span>Maks. <b class="tabular-nums text-slate-800 dark:text-slate-200">' + num(t.max, 2) + '</b></span>' : '') +
          '<a href="reports.html#energy-pue" class="font-bold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1">Rapor <i class="pi pi-arrow-right text-[8px]"></i></a></div>',
        body: trendInner()
      });
    }
    if (tkOn) {
      html += card({ id: 'tickets', span: pueOn ? 'min-h-0 flex-col lg:col-span-4' : 'min-h-0 flex-col lg:col-span-12', icon: 'pi pi-ticket', title: 'Destek Talepleri', subtitle: 'Tüm müşterilerin talepleri', actions: allLink('engineering.html#ticket-management', 'Tümü'), body: ticketsInner() });
    }
    if (capOn) {
      html += card({ id: 'capacity', span: woOn ? 'min-h-0 flex-col lg:col-span-8' : 'min-h-0 flex-col lg:col-span-12', icon: 'pi pi-th-large', title: 'Kapasite ve Soğutma', subtitle: 'Kapasite raporu eşikleriyle anlık kullanım', actions: allLink('reports.html#capacity', 'Rapor'), body: capacityInner(woOn) });
    }
    if (woOn) {
      html += card({ id: 'orders', span: capOn ? 'min-h-0 flex-col lg:col-span-4' : 'min-h-0 flex-col lg:col-span-12', icon: 'pi pi-list-check', title: 'Açık İş Emirleri', subtitle: S.workOrders.count + ' açık kayıt', actions: allLink('work-orders.html', 'Tümü'), body: ordersInner() });
    }
    host.innerHTML = html;
    bindTrend();
  }

  function renderAll() {
    renderActions();
    renderKpis();
    renderGrid();
  }

  function refresh() {
    S = DCIM.data.dashboard.snapshot(tick);
    view = derive(S);
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Dashboard Yönetimi
  // ---------------------------------------------------------------------------
  function openSettings() {
    const draft = Object.assign({}, modules);
    let saved = false;
    const body =
      '<div class="space-y-3 p-1">' +
        '<p class="text-xs text-slate-500 dark:text-slate-400">Aşağıdaki listeden ekranınızda görüntülemek istediğiniz dashboard bileşenlerini seçin:</p>' +
        '<div class="divide-y divide-slate-100 dark:divide-slate-800 rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs">' +
          MODULE_OPTIONS.map(o =>
            '<label class="flex items-center gap-3 cursor-pointer px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors">' +
              '<input type="checkbox" data-mod="' + o.key + '"' + (modules[o.key] ? ' checked' : '') + ' class="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 shrink-0" />' +
              '<div class="min-w-0"><span class="font-bold text-slate-900 dark:text-slate-100 block">' + esc(o.title) + '</span>' +
              '<span class="text-[10px] text-slate-500 dark:text-slate-400">' + esc(o.description) + '</span></div>' +
            '</label>').join('') +
        '</div>' +
      '</div>';
    const dlg = ui.dialog({
      title: 'Dashboard Yönetimi (Modül & Grafik Seçimi)',
      subtitle: 'Ana sayfada görünmesini istediğiniz grafikleri ve modülleri checkbox ile özelleştirin.',
      variant: 'info',
      body,
      confirmLabel: 'Ayarları Kaydet',
      cancelLabel: 'İptal',
      onConfirm: () => {
        saved = true;
        ui.storage.set(MODULE_STORAGE_KEY, JSON.stringify(modules));
        ui.toast('Dashboard modül seçimi kaydedildi.', 'success', 'Dashboard Yönetimi');
      },
      // İptal / kapat: taslak değişiklikler geri alınır
      onClose: () => { if (!saved) { modules = draft; renderKpis(); renderGrid(); } }
    });
    dlg.body.querySelectorAll('[data-mod]').forEach(cb => cb.addEventListener('change', () => {
      modules = Object.assign({}, modules, { [cb.getAttribute('data-mod')]: cb.checked });
      renderKpis();
      renderGrid();
    }));
  }

  // ---------------------------------------------------------------------------
  // Rapor (üst çubuk: PDF / Excel / CSV; sayfanın okuduğu veriler)
  // ---------------------------------------------------------------------------
  const TONE_REPORT = { acil: 'acil', alarm: 'alarm', uyari: 'warning', kayip: 'lost', normal: 'normal' };
  function exportReport(req) {
    const v = view, cap = S.capacity, fmt2 = x => num(x, 2), fmt1 = x => (x === null ? '-' : num(x, 1));
    const kpis = [
      { label: 'Anlık PUE', value: S.livePue > 0 ? fmt2(S.livePue) : '-', tone: 'info' },
      { label: 'Anlık CUE', value: S.cue > 0 ? fmt2(S.cue) : '-', tone: 'info' },
      { label: 'Dış ortam', value: S.outdoor ? S.outdoor.val + ' ' + S.outdoor.unit : '-' },
      { label: 'IT gücü (kW)', value: fmt1(cap.itKw) },
      { label: 'Soğutma (kW)', value: fmt1(cap.coolingKw) },
      { label: 'Trafo (kVA)', value: fmt1(cap.trafoKva) },
      { label: 'Kabin', value: cap.cabinCount, hint: num(cap.cabinUsedU, 0) + '/' + num(cap.cabinTotalU, 0) + ' U · %' + num(v.cabinPct, 1) },
      { label: 'Aktif alarm', value: S.alarms.total, hint: S.alarms.unacked + ' onaylanmamış', tone: TONE_REPORT[v.siteTone] },
      { label: 'Sorunlu cihaz', value: v.deviceIssues, hint: S.devices.total + ' cihazdan', tone: v.deviceIssues ? 'warning' : 'normal' }
    ];
    const sections = [
      {
        title: 'Aktif alarmlar (şiddete göre)', toneKey: '_tone',
        columns: [{ key: 'sev', label: 'Şiddet' }, { key: 'count', label: 'Adet', align: 'right' }, { key: 'pct', label: 'Oran %', align: 'right' }],
        rows: v.alarmSlices.map(s => ({ sev: s.label, count: s.count, pct: num(s.pct, 1), _tone: s.count ? TONE_REPORT[s.key] : '' }))
      },
      {
        title: 'Cihaz durumu', toneKey: '_tone',
        columns: [{ key: 'st', label: 'Durum' }, { key: 'count', label: 'Adet', align: 'right' }, { key: 'pct', label: 'Oran %', align: 'right' }],
        rows: v.deviceSlices.map(d => ({ st: d.label, count: d.count, pct: num(d.pct, 1), _tone: !d.count ? '' : d.key === 'critical' || d.key === 'offline' ? 'alarm' : d.key === 'warning' ? 'warning' : '' }))
      }
    ];
    if (modules.showCoolingHeatChart) {
      sections.push({
        title: 'Kapasite kullanımı', toneKey: '_tone',
        columns: [{ key: 'g', label: 'Gösterge' }, { key: 'now', label: 'Anlık', align: 'right' }, { key: 'max', label: 'Kapasite', align: 'right' }, { key: 'pct', label: 'Kullanım %', align: 'right' }, { key: 'thr', label: 'Eşik %', align: 'right' }],
        rows: v.capacity.map(m => ({ g: m.label, now: m.value === null ? '-' : num(m.value, 1) + ' ' + m.unit, max: num(m.max, 0) + ' ' + m.unit, pct: m.value === null ? '-' : num(m.pct, 1), thr: m.threshold, _tone: m.tone === 'alarm' ? 'alarm' : m.tone === 'uyari' ? 'warning' : '' }))
      });
    }
    if (modules.showPueLineChart && v.trend) {
      sections.push({
        title: 'Günlük PUE Trendi (en düşük ' + fmt2(v.trend.min) + ' · ortalama ' + fmt2(v.trend.avg) + ' · en yüksek ' + fmt2(v.trend.max) + ')',
        columns: [{ key: 'h', label: 'Saat' }, { key: 'pue', label: 'PUE', align: 'right' }],
        rows: v.trend.points.map(p => ({ h: hm(p.ts), pue: fmt2(p.value) }))
      });
    }
    if (modules.showTickets) {
      const lbl = { new: 'Yeni talep', message: 'Yeni mesaj', open: 'Açık', closed: 'Kapalı' };
      sections.push({
        title: 'Destek Talepleri (açık ' + S.tickets.open + ' · yeni ' + S.tickets.fresh + ' · yeni mesaj ' + S.tickets.message + ' · kapalı ' + S.tickets.closed + ')', toneKey: '_tone',
        columns: [{ key: 'id', label: 'No' }, { key: 'subject', label: 'Konu' }, { key: 'customer', label: 'Müşteri' }, { key: 'state', label: 'Durum' }, { key: 'preview', label: 'Son mesaj' }, { key: 'time', label: 'Zaman' }],
        rows: S.tickets.rows.map(t => ({ id: t.id, subject: t.subject, customer: t.customer, state: lbl[t.state], preview: t.preview, time: t.ts ? dmyhm(t.ts) : '', _tone: t.state === 'new' ? 'alarm' : t.state === 'message' ? 'warning' : '' }))
      });
    }
    if (modules.showWorkOrders) {
      sections.push({
        title: 'İş Emirleri (açık ' + S.workOrders.count + '; listede en son ' + S.workOrders.limit + ' kayıt)',
        columns: [{ key: 'id', label: 'No' }, { key: 'title', label: 'Başlık' }, { key: 'service', label: 'Hizmet' }, { key: 'status', label: 'Durum' }, { key: 'time', label: 'Zaman' }],
        rows: S.workOrders.rows.map(w => ({ id: w.id, title: w.title, service: w.service, status: w.status, time: w.ts ? dmyhm(w.ts) : '' }))
      });
    }
    DCIM.report.generate({
      title: 'Genel Bakış',
      subtitle: 'Saha özeti · Raporun alındığı andaki canlı değerler',
      filename: 'Genel_Bakis',
      kpis,
      sections
    }, req.format);
  }

  DCIM.shell.setPageReport({ scopes: [{ id: 'page', label: 'Genel bakış' }], formats: ['pdf', 'xlsx', 'csv'], export: exportReport });

  refresh();
  // 30 sn'lik tazeleme: KPI ve kapasite göstergeleri (listeler kart içinde kaydırılmış olabilir; yeniden çizilmez)
  setInterval(() => {
    tick++;
    S = DCIM.data.dashboard.snapshot(tick);
    view = derive(S);
    renderKpis();
    const capBody = document.querySelector('[data-card="capacity"] [data-card-body]');
    if (capBody) capBody.innerHTML = capacityInner(modules.showWorkOrders);
  }, POLL_MS);
  if (params.get('settings') === '1') openSettings();
})();
