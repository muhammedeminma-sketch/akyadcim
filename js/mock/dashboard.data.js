/* ==========================================================================
   DCIM Sunum — Genel Bakış mock verisi (DCIM.data.dashboard) — dashboard.html
   Orijinal: new-ui/pages/dashboard (DashboardComponent). Her widget, verisini aldığı sayfanın kaynağından okur:
     - Aktif alarmlar      : DCIM.data.activeAlarms (CMA_List) → seviye: Acil / Alarm / Uyarı / Veri Alınamıyor
     - Cihaz durumu        : DCIM.data.health.sample() (Sistem Sağlığı ile ortak, sta bitlerinden)
     - PUE / CUE / dış ortam: DCIM.data.reports.pue (saatlik, tüm katların ortalaması), CUE = PUE × 0,484
     - BT / soğutma / trafo : DCIM.data.reports.capacity.instant() (kapasite raporuyla aynı toplamlar)
     - Kabin doluluğu      : DCIM.data.reports.capacity.cabinets() (HIS_Capacity_Cabins / Used)
     - Destek talepleri    : DCIM.data.tickets (js/mock/eng-ticket-management.data.js, sayfada yüklenir)
     - İş emirleri         : DCIM.data.workOrders.list (iptal / tamamlanan hariç, en yeni 12)
   snapshot(tick): tick = 30 sn'lik tazeleme sayacı; aynı tick her zaman aynı değerleri verir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const R = D.reports || {};
  const CUE_FACTOR = (R.cue && R.cue.MULTIPLIER) || 0.484;
  const WORK_ORDER_LIST_LIMIT = 12;

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  // --- Alarm seviyesi (alarm-severity.util: Acil yalnız seçilmiş kritik noktalarda; haberleşme kaybı Veri Alınamıyor)
  function alarmSeverity(a) {
    if (!a || a.level === 'normal' || a.cleared) return 'normal';
    if (a.level === 'lost') return 'kayip';
    if (a.level === 'alarm') return a.severity === 'critical' ? 'acil' : 'alarm';
    if (a.level === 'warning') return 'uyari';
    return 'normal';
  }

  // --- Cihaz durumu (system-health classifyEngineState ile aynı kural)
  function classify(sta) {
    if (sta === null || sta === undefined) return 'unknown';
    const engine = sta & 0x0003, value = sta & 0x000c;
    if (engine === 0) return 'disabled';
    if (engine === 1 || engine === 2) return 'offline';
    if (value === 0x0004) return 'warning';
    if (value === 0x0008 || value === 0x000c) return 'critical';
    return engine === 3 ? 'online' : 'unknown';
  }

  function alarms() {
    const counts = { acil: 0, alarm: 0, uyari: 0, kayip: 0, normal: 0 };
    let unacked = 0;
    // Alarmlar sayfası ve başlık zili ile aynı kaynak: tüm katlar, varsayılan gizli gruplar (Sistem) hariç
    if (D.alarmsPage) {
      const hidden = new Set((D.alarmsPage.groups || []).filter(g => g.hidden).map(g => g.code));
      const list = D.alarmsPage.active.filter(a => !hidden.has(a.grp));
      list.forEach(a => { if (counts[a.level] != null) counts[a.level]++; if (!a.ack) unacked++; });
      return { total: list.length, unacked, counts };
    }
    (D.activeAlarms || []).forEach(a => {
      counts[alarmSeverity(a)]++;
      if (!a.ack) unacked++;
    });
    return { total: (D.activeAlarms || []).length, unacked, counts };
  }

  function devices() {
    const list = D.health ? D.health.sample(0).devices : [];
    const counts = { online: 0, warning: 0, critical: 0, offline: 0, disabled: 0, unknown: 0 };
    list.forEach(d => { counts[classify(d.sta)]++; });
    return { total: list.length, counts };
  }

  // Bugünün saatlik PUE ortalaması (HIS_Pue hourly / Average): saat başına tüm katların ortalaması
  function pueTrend() {
    if (!R.pue) return [];
    const today = new Date();
    const rows = R.pue.history({ floors: R.pue.floors, mode: 'hourly', agg: 'average', filterDate: dayKey(today), startTime: '00', endTime: '23' });
    const buckets = new Map();
    rows.forEach(r => {
      const b = buckets.get(r.timestamp) || { sum: 0, n: 0 };
      b.sum += r.value; b.n++;
      buckets.set(r.timestamp, b);
    });
    return Array.from(buckets.entries()).map(([ts, b]) => ({ ts, value: b.sum / b.n })).sort((a, b) => a.ts - b.ts);
  }

  function capacity(tick) {
    const cfg = (R.capacity && R.capacity.config) || {};
    const inst = R.capacity ? R.capacity.instant(tick) : { ups: null, trafo: null, klima: null };
    const cabs = R.capacity ? R.capacity.cabinets() : [];
    const totalU = cabs.reduce((s, r) => s + (r.total_u || 0), 0);
    const usedU = cabs.reduce((s, r) => s + (r.used_u || 0), 0);
    return {
      itKw: inst.ups, coolingKw: inst.klima, trafoKva: inst.trafo,
      cabinCount: cabs.length, cabinTotalU: totalU, cabinUsedU: usedU,
      cfg: {
        ups: { unit: 'kVA', threshold: (cfg.ups && cfg.ups.threshold) || 80, max: (cfg.ups && cfg.ups.maxCapacity) || 1000 },
        trafo: { unit: 'kVA', threshold: (cfg.trafo && cfg.trafo.threshold) || 80, max: (cfg.trafo && cfg.trafo.maxCapacity) || 2000 },
        klima: { unit: 'kW', threshold: (cfg.klima && cfg.klima.threshold) || 75, max: (cfg.klima && cfg.klima.maxCapacity) || 1500 },
        kabin: { unit: 'U', threshold: (cfg.kabin && cfg.kabin.threshold) || 70, max: totalU || 100 }
      }
    };
  }

  function chatHistory(t) {
    if (Array.isArray(t && t.chat_history)) return t.chat_history;
    if (t && typeof t.chat_history === 'string' && t.chat_history.trim()) {
      try { const h = JSON.parse(t.chat_history); return Array.isArray(h) ? h : []; } catch (e) { return []; }
    }
    return [];
  }
  const parseTime = v => { if (!v) return 0; const t = new Date(String(v).replace(' ', 'T')).getTime(); return isNaN(t) ? 0 : t; };

  // ticket yönetim sayfasındaki isNewTicket / hasNewMessage kuralları
  function tickets() {
    const list = (D.tickets && D.tickets.list) || [];
    let open = 0, closed = 0, fresh = 0, message = 0;
    const rows = list.filter(t => t && t.tck_id).map(t => {
      const history = chatHistory(t);
      const real = history.filter(h => h && h.sender_type !== 'system');
      const last = real[real.length - 1];
      const isOpen = String(t.status || 'OPEN').trim() === 'OPEN';
      const hasAdmin = history.some(h => h && h.sender_type === 'admin');
      let state = 'closed';
      if (isOpen) {
        open++;
        if (!hasAdmin) { state = 'new'; fresh++; }
        else if (last && last.sender_type === 'customer') { state = 'message'; message++; }
        else state = 'open';
      } else closed++;
      return {
        id: String(t.tck_id),
        subject: String(t.subject || ('#' + t.tck_id)),
        customer: String(t.customer_name || t.customer_id || ''),
        preview: String((last && (last.message || last.text)) || t.description || ''),
        adminReply: !!last && last.sender_type === 'admin',
        state,
        ts: parseTime((last && (last.timestamp || last.created_at)) || t.updated_at || t.created_at)
      };
    });
    const rank = { new: 0, message: 0, open: 1, closed: 2 };
    rows.sort((a, b) => rank[a.state] - rank[b.state] || b.ts - a.ts);
    return { rows, open, closed, fresh, message };
  }

  // İş emirleri sayfasındaki getStatusBadgeType ile aynı eşleme
  const WO_BADGE = { 1: 'pending', 2: 'info', 3: 'processing', 4: 'completed', 5: 'inactive', 6: 'warning', 0: 'stopped' };
  const WO_STATUS = {
    0: 'İPTAL', 1: 'YENİ', 2: 'PLANLANIYOR', 3: 'İŞLİYOR-NORMAL', 4: 'TAMAMLANDI', 5: 'DURDU-İK', 6: 'BEKLİYOR-UYARI', 7: 'İŞLİYOR-UYARI',
    8: 'BAŞARISIZ-ALARM', 9: 'DURDU-TEDARİK', 10: 'BEKLİYOR-ALARM', 11: 'İŞLİYOR-ALARM', 12: 'BAŞARISIZ-KRİZ', 13: 'DURDU-ARIZA', 14: 'BEKLİYOR-KRİZ', 15: 'İŞLİYOR-KRİZ'
  };
  function workOrders() {
    const all = (D.workOrders && D.workOrders.list) || [];
    const open = all.filter(r => r.sta !== '0x0300' && r.sta !== '0x0304');
    const rows = open.map(r => {
      const cls = parseInt(r.sta, 16) & 0x000f;
      return { id: String(r.rid || '-'), title: String(r.wor_name || '-'), service: String(r.svc_name || ''), cls, status: WO_STATUS[cls] || '-', badge: WO_BADGE[cls] || 'normal', ts: new Date(r.tim_open).getTime() || 0 };
    }).sort((a, b) => b.ts - a.ts).slice(0, WORK_ORDER_LIST_LIMIT);
    return { count: open.length, rows, limit: WORK_ORDER_LIST_LIMIT };
  }

  function outdoor() {
    const t = ((D.site && D.site.outdoor) || []).find(o => o.id === 'temp');
    return t ? { val: String(t.val).replace('.', ','), unit: t.unit || '°C' } : null;
  }

  D.dashboard = {
    CUE_FACTOR,
    alarmSeverity,
    snapshot(tick) {
      const trend = pueTrend();
      const last = trend.length ? trend[trend.length - 1].value : 0;
      // anlık PUE: son saatin değeri etrafında küçük oynama (2D sayfasının 60 sn yoklaması)
      const rnd = D.rng(D.hash('dash-pue-' + (tick || 0)));
      const livePue = last ? last + (rnd() - 0.5) * 0.01 : (D.site && D.site.pue) || 0;
      return {
        connected: true,
        alarms: alarms(),
        devices: devices(),
        livePue,
        cue: livePue * CUE_FACTOR,
        outdoor: outdoor(),
        capacity: capacity(tick || 0),
        trend,
        tickets: tickets(),
        workOrders: workOrders()
      };
    }
  };
})();
