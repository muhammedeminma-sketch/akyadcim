/* ==========================================================================
   DCIM Sunum — Mühendislik ortak canlı durum mock'u (DCIM.data.engSystem)
   AyxdbHealthService ('engineer' akışı) + AyxdbPerformanceService + SiteModelService.floors() yerine geçer.
   Kullananlar: Mühendislik ana sayfası (#home), Konfigürasyon Editörü özeti (#xml-editor),
   AyXDB Tanılama (#ayxdb-diagnostics).

   TÜM VERİ KURGUSALDIR (tohumlu). Doküman adları sunumun kat kimlikleriyle (T00/T02/T03) uyumlu
   genel adlardır; IP'ler kurgusal 10.201.<kat>.<n> bloğundandır.
     CMR/T00  1. Kat tesis (UPS, klima, klima panosu, sensör modülleri)
     CMR/T01  1. Kat PDU'lar
     CMR/T02  2. Kat (tesis + PDU)      CMR/T03  3. Kat (tesis + PDU)
     CMR/T09  DCB (ek bina: trafo/pano analizörleri, UPS, klima)
   Senaryo (ortak): UPS B7 SNMP kaybı (haberleşme yok), 1DM03 sensör modülü haberleşme yok, UPS A5 / KLIMA 109 /
   1NA06 PDU-B kritik, 1DL03 PDU-B / UPS A3 / UPS B4 / KLIMA 104 / KLIMA 112 / A1 KLIMA PANOSU uyarı, PMM-7 devre dışı;
   CMR/T01 "SNMP_PDU_3" bağlantısının worker yükü %80'in üstünde (bozulma).

   API:
     engSystem.docs                       [{doc, floors, kind, floorDigit}]
     engSystem.snapshot(tick)             {sampledAt, sourceState, errors, devices, runtimeNodes, summary, issueGroups}
     engSystem.perf(tick)                 {nodes:[{node, level}], counts:{kirilma,bozulma,gecici,saglikli,toplu,bilinmiyor}}
     engSystem.latency(nodeId, n, tick)   son n örneğin gecikme dizisi (ms)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const rngOf = key => D.rng(D.hash(String(key)));

  const DOCS = [
    { doc: 'CMR/T00', floors: '1. Kat', kind: 'Tesis', floorDigit: 1 },
    { doc: 'CMR/T01', floors: '1. Kat', kind: 'PDU', floorDigit: 1 },
    { doc: 'CMR/T02', floors: '2. Kat', kind: 'Tesis + PDU', floorDigit: 2 },
    { doc: 'CMR/T03', floors: '3. Kat', kind: 'Tesis + PDU', floorDigit: 3 },
    { doc: 'CMR/T09', floors: 'DCB', kind: 'Ek bina', floorDigit: 9 }
  ];

  // Senaryo durumları (cihaz kimliği → durum)
  const SCENARIO = {
    'KAT1_SAL1_B7_UPS': { status: 'offline', note: 'SNMP yanıt yok (3 ardışık sorgu)' },
    'KAT1_SAL1_A5_UPS': { status: 'critical', note: 'Akü modunda' },
    'KAT1_SAL1_KLM109_DV': { status: 'critical', note: 'Kompresör yüksek basınç' },
    'K1NA06_PDU_B_DV': { status: 'critical', note: 'Faz kaybı (L2)' },
    'K1DL03_PDU_B_DV': { status: 'warning', note: 'Yüksek akım' },
    'KAT1_SAL1_A3_UPS': { status: 'warning', note: 'Akü sıcaklığı yüksek' },
    'KAT1_SAL1_B4_UPS': { status: 'warning', note: 'Yük %82' },
    'KAT1_SAL1_KLM104_DV': { status: 'warning', note: 'Filtre kirli' },
    'KAT1_SAL1_KLM112_DV': { status: 'warning', note: 'Dönüş havası yüksek' },
    'KAT1_SAL1_A1_KLM_PANO_DV': { status: 'warning', note: 'Faz dengesizliği' },
    'PMM_7': { status: 'disabled', note: 'Planlı devre dışı' }
  };

  const ip = (floor, n) => '10.201.' + floor + '.' + (10 + (n % 240));

  // --- Cihaz listesi (tohumlu, bir kez üretilir) -------------------------------------
  function buildDevices() {
    const out = [];
    const push = (doc, id, description, kind, proto, host, extra) => {
      const sc = SCENARIO[id] || {};
      out.push(Object.assign({ key: doc + '|' + id, id, description, document: doc, kind, proto, host,
        status: sc.status || 'online', note: sc.note || '' }, extra || {}));
    };
    // 1. Kat tesis
    let n = 0;
    (D.ups || []).forEach(u => push('CMR/T00', u.devId || ('KAT1_SAL1_' + u.label.replace(/\W+/g, '') + '_UPS'), u.label, 'UPS', 'SNMP', ip(11, n++)));
    (D.climates || []).forEach(c => push('CMR/T00', c.devId || ('KAT1_SAL1_' + c.label.replace(/\W+/g, '') + '_DV'), c.label, 'Klima', 'Modbus TCP', ip(12, n++)));
    (D.panels || []).forEach(p => push('CMR/T00', p.devId || ('KAT1_SAL1_' + p.label.replace(/\W+/g, '_') + '_DV'), p.label, 'Klima Panosu', 'Modbus TCP', ip(13, n++)));
    (D.cabinets || []).forEach((c, i) => {
      const id = (c.pod || 'POD').replace(/-/g, '') + '_' + c.code + '_ID01_DV';
      const st = c.code === '1DM03' ? { status: 'offline', note: 'Modbus zaman aşımı' } : null;
      push('CMR/T00', id, c.code + ' sensör modülü', 'Sensör', 'Modbus TCP', ip(14, i), st ? { status: st.status, note: st.note } : null);
    });
    for (let i = 1; i <= 12; i++) push('CMR/T00', 'PMM_' + i, 'Enerji analizörü PMM-' + i, 'Analizör', 'Modbus TCP', ip(15, i));
    // 1. Kat PDU
    n = 0;
    (D.cabinets || []).forEach(c => ['A', 'B'].forEach(s => push('CMR/T01', 'K' + c.code + '_PDU_' + s + '_DV', c.code + ' PDU-' + s, 'PDU', 'SNMP', ip(21, n++))));
    // 2. ve 3. kat (kurgusal yerleşimden)
    [2, 3].forEach(digit => {
      const L = D.layoutOf ? D.layoutOf(digit) : null;
      const doc = 'CMR/T0' + digit;
      const r = rngOf('eng-dev-' + digit);
      let k = 0;
      (L ? L.items : []).forEach(it => {
        if (it.type === 'cabinet') {
          ['A', 'B'].forEach(s => push(doc, 'K' + it.label + '_PDU_' + s + '_DV', it.label + ' PDU-' + s, 'PDU', 'SNMP', ip(digit * 10 + 1, k++)));
        } else if (it.type === 'ups') {
          push(doc, 'KAT' + digit + '_' + String(it.label).replace(/\W+/g, '') + '_UPS', it.label, 'UPS', 'SNMP', ip(digit * 10, k++));
        } else if (it.type === 'climate') {
          push(doc, 'KAT' + digit + '_' + String(it.label).replace(/\W+/g, '') + '_DV', it.label, 'Klima', 'Modbus TCP', ip(digit * 10 + 2, k++));
        }
      });
      // kat başına birkaç kurgusal sorun
      const list = out.filter(d => d.document === doc && d.kind === 'PDU');
      if (list.length) {
        const a = list[Math.floor(r() * list.length)];
        a.status = digit === 2 ? 'offline' : 'warning';
        a.note = digit === 2 ? 'SNMP yanıt yok' : 'Sıcaklık sensörü okunamıyor';
        if (digit === 2) {
          const b = list[Math.floor(r() * list.length)];
          if (b !== a) { b.status = 'warning'; b.note = 'Yük dengesizliği'; }
        }
      }
    });
    // DCB
    n = 0;
    for (let i = 1; i <= 4; i++) push('CMR/T09', 'DCB_TR' + i + '_ANL', 'DCB TR-' + i + ' analizörü', 'Analizör', 'Modbus TCP', ip(91, n++));
    for (let i = 1; i <= 18; i++) push('CMR/T09', 'DCB_DP' + String(i).padStart(2, '0') + '_ANL', 'DCB dağıtım panosu DP-' + String(i).padStart(2, '0'), 'Analizör', 'Modbus TCP', ip(91, n++));
    for (let i = 1; i <= 4; i++) push('CMR/T09', 'DCB_UPS' + i, 'DCB UPS-' + i, 'UPS', 'SNMP', ip(92, n++));
    for (let i = 1; i <= 8; i++) push('CMR/T09', 'DCB_KLM' + i + '_DV', 'DCB KLİMA ' + i, 'Klima', 'Modbus TCP', ip(93, n++));
    for (let i = 1; i <= 2; i++) push('CMR/T09', 'DCB_JEN' + i + '_DV', 'DCB Jeneratör ' + i, 'Jeneratör', 'Modbus TCP', ip(94, n++));
    const tr4 = out.find(d => d.id === 'DCB_TR4_ANL');
    if (tr4) { tr4.status = 'warning'; tr4.note = 'Sargı sıcaklığı uyarısı'; }
    const dp = out.find(d => d.id === 'DCB_DP11_ANL');
    if (dp) { dp.status = 'offline'; dp.note = 'Modbus zaman aşımı'; }
    return out;
  }

  // --- Çalışma bileşenleri (doküman kökü / thread / bağlantı) ------------------------
  // conn tanımı: [ad, protokol, cihaz süzgeci, worker sayısı, oturum kapasitesi]
  function buildNodes(devices) {
    const nodes = [];
    const byDoc = d => devices.filter(x => x.document === d);
    const conn = (doc, id, proto, devs, workers, sesCap, baseLoad) => {
      nodes.push({ id: doc + '/' + id, name: id, document: doc, kind: 'connection', proto,
        deviceCount: devs.length, workerCount: workers, threadCount: 1, sessionCapacity: sesCap,
        baseLoad, baseLatency: proto === 'SNMP' ? 38 : 22 });
    };
    DOCS.forEach(def => {
      const docDevs = byDoc(def.doc);
      nodes.push({ id: def.doc, name: def.doc, document: def.doc, kind: 'document', proto: '', deviceCount: docDevs.length, workerCount: 0, threadCount: 1, sessionCapacity: 0, baseLoad: 8, baseLatency: 4 });
      nodes.push({ id: def.doc + '/thr_evt', name: 'thr_evt', document: def.doc, kind: 'thread', proto: '', deviceCount: 0, workerCount: 2, threadCount: 1, sessionCapacity: 0, baseLoad: 18, baseLatency: 6 });
      const snmp = docDevs.filter(d => d.proto === 'SNMP');
      const mb = docDevs.filter(d => d.proto !== 'SNMP');
      if (def.doc === 'CMR/T01' || def.doc === 'CMR/T02' || def.doc === 'CMR/T03') {
        const parts = def.doc === 'CMR/T01' ? 6 : 4;
        for (let i = 0; i < parts; i++) {
          const slice = snmp.filter((_, j) => j % parts === i);
          const load = def.doc === 'CMR/T01' && i === 2 ? 84 : 38 + (i * 7) % 25;
          conn(def.doc, 'SNMP_PDU_' + (i + 1), 'SNMP', slice, 8, 64, load);
        }
        if (mb.length) conn(def.doc, 'MB_TESIS', 'Modbus TCP', mb, 4, 16, 34);
      } else {
        if (snmp.length) conn(def.doc, 'SNMP_UPS', 'SNMP', snmp, 4, 16, 41);
        const sens = mb.filter(d => d.kind === 'Sensör');
        const rest = mb.filter(d => d.kind !== 'Sensör');
        if (sens.length) { conn(def.doc, 'MB_SENSOR_1', 'Modbus TCP', sens.filter((_, j) => j % 2 === 0), 6, 32, 57); conn(def.doc, 'MB_SENSOR_2', 'Modbus TCP', sens.filter((_, j) => j % 2 === 1), 6, 32, 52); }
        if (rest.length) conn(def.doc, def.doc === 'CMR/T09' ? 'MB_ENERJI' : 'MB_KLIMA', 'Modbus TCP', rest, 4, 24, def.doc === 'CMR/T09' ? 63 : 46);
      }
    });
    return nodes;
  }

  let DEVICES = null, NODES = null;
  const ensure = () => {
    if (!DEVICES) { DEVICES = buildDevices(); NODES = buildNodes(DEVICES); }
  };

  // canlı dalgalanma: her tick'te tohumlu küçük oynama
  function liveNode(n, tick) {
    const r = rngOf(n.id + ':' + tick);
    const load = Math.max(1, Math.min(99, Math.round(n.baseLoad + (r() - 0.5) * 8)));
    const latency = Math.round(n.baseLatency * (n.baseLoad >= 80 ? 3.2 : 1) * (0.85 + r() * 0.35));
    const sessionCount = n.sessionCapacity ? Math.min(n.sessionCapacity, Math.round(n.deviceCount * (0.92 + r() * 0.08) / Math.max(1, Math.ceil(n.deviceCount / n.sessionCapacity)))) : 0;
    return Object.assign({}, n, {
      workerLoad: n.workerCount ? load : null,
      threadLoad: Math.round(load * 0.8),
      latencyMs: latency,
      sessionCount,
      cycleMs: n.kind === 'connection' ? Math.round(latency * Math.max(1, n.deviceCount / Math.max(1, n.workerCount))) : null,
      running: true
    });
  }

  function perfLevelOf(n) {
    if (n.workerLoad !== null && n.workerLoad >= 90) return 'kirilma';
    if (n.workerLoad !== null && n.workerLoad >= 80) return 'bozulma';
    if (n.latencyMs > 120) return 'gecici';
    return n.kind === 'document' ? 'toplu' : 'saglikli';
  }

  function snapshot(tick) {
    ensure();
    const t = tick || 0;
    const devices = DEVICES.map(d => Object.assign({}, d));
    const runtimeNodes = NODES.map(n => liveNode(n, t));
    const cnt = st => devices.filter(d => d.status === st).length;
    const rtWarn = runtimeNodes.filter(n => n.workerLoad !== null && n.workerLoad >= 80).length;
    const summary = {
      deviceTotal: devices.length, deviceOnline: cnt('online') + cnt('warning') + cnt('critical'),
      deviceOffline: cnt('offline'), deviceCritical: cnt('critical'), deviceWarning: cnt('warning'),
      deviceDisabled: cnt('disabled'), runtimeTotal: runtimeNodes.length, runtimeCritical: 0, runtimeWarning: rtWarn
    };
    const off = devices.filter(d => d.status === 'offline');
    const issueGroups = [
      { code: 'DEV_OFFLINE', severity: 'critical', title: 'Haberleşmeyen cihaz', count: off.length,
        action: 'Cihaz IP/port ve ağ erişimini kontrol edin: ' + off.slice(0, 3).map(d => d.description).join(', ') + (off.length > 3 ? '…' : '') },
      { code: 'DEV_CRITICAL', severity: 'critical', title: 'Kritik durum biti bildiren cihaz', count: cnt('critical'),
        action: 'UPS A5, KLIMA 109 ve 1NA06 PDU-B — alarm ekranında ayrıntı.' },
      { code: 'WRK_LOAD', severity: 'warning', title: 'Worker yükü %80 üstünde', count: rtWarn,
        action: 'CMR/T01 SNMP_PDU_3: cihazları SNMP_PDU_5/6\'ya dağıtın ya da thr_wrk artırın.' },
      { code: 'DEV_WARNING', severity: 'warning', title: 'Uyarı durum biti bildiren cihaz', count: cnt('warning'),
        detail: 'Eşik uyarıları; Alarm Eşikleri sayfasından gözden geçirilebilir.' },
      { code: 'DEV_DISABLED', severity: 'info', title: 'Devre dışı cihaz', count: cnt('disabled'),
        detail: 'PMM-7 planlı bakım nedeniyle devre dışı.' },
      { code: 'SES_FREE', severity: 'healthy', title: 'Oturum kapasitesi yeterli', count: runtimeNodes.filter(n => n.kind === 'connection').length, detail: '' }
    ];
    const now = new Date();
    return { sampledAt: now, sourceState: 'fresh', errors: [], devices, runtimeNodes, summary, issueGroups };
  }

  function perf(tick) {
    const s = snapshot(tick);
    const nodes = s.runtimeNodes.map(n => ({ node: n, level: perfLevelOf(n) }));
    const counts = { kirilma: 0, bozulma: 0, gecici: 0, saglikli: 0, toplu: 0, bilinmiyor: 0 };
    nodes.forEach(v => { counts[v.level]++; });
    return { nodes, counts };
  }

  function latency(nodeId, n, tick) {
    ensure();
    const node = NODES.find(x => x.id === nodeId) || NODES[0];
    const out = [];
    const t0 = tick || 0;
    for (let i = n - 1; i >= 0; i--) out.push(liveNode(node, t0 - i).latencyMs);
    return out;
  }

  D.engSystem = {
    docs: DOCS,
    snapshot,
    perf,
    latency,
    perfLabel: l => ({ kirilma: 'Kırılma', bozulma: 'Bozulma', gecici: 'Kısa tepe', saglikli: 'Sağlıklı', toplu: 'Toplu iş', bilinmiyor: 'Ölçüm yok' }[l] || l)
  };
})();
