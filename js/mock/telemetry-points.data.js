/* ==========================================================================
   DCIM Sunum — Telemetri Noktaları: kat dokümanları (SITE_Floors karşılığı)
   Orijinalde kat seçicisi db_ASM.xml SITE_Floors'tan gelir: her katın tesis dokümanı (fac_doc) ve
   beyaz alan / PDU dokümanı (pdu_doc). Sunum sahası (diğer sayfalarla aynı):
     1. Kat · Tesis      CMR/T00  kabin sensör modülleri, kapak kilitleri, ortam sensörleri, UPS, PMM, klima, pano
     1. Kat · Beyaz Alan CMR/T01  kabin PDU'ları
     2. Kat              CMR/T02  (tek doküman)
     3. Kat              CMR/T03  (tek doküman)
   Kat 1 noktaları DCIM.data.telemetry'den gelir (bu sayfada kat dokümanına taşınır); kat 2 / 3 noktaları
   DCIM.data.getLockFloor(T02|T03) kabinleri ve kat yerleşimindeki klima / UPS'lerden tohumlu üretilir.
   Kat 2 / 3'te açık kapaklar Kapak Kilitleri sayfasıyla aynıdır (getLockFloor). Tüm veri kurgusaldır.
   Çıktı: DCIM.data.telemetryFloors = [{ value: 'CMR/T00', label }], noktalar DCIM.data.telemetry.points'e eklenir.
   Bağımlılık: js/mock-data.js (DCIM.data.telemetry, floors, getLockFloor, layoutOf, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D || !D.telemetry) return;

  const T = D.telemetry;
  const PROTO = T.PROTO;
  const { RUN, WARN, ALARM } = T.STA;
  const NOW = Date.now();

  // 1) Kat 1: beyaz alan (PDU) → CMR/T01, geri kalanı tesis → CMR/T00
  T.points.forEach(p => { p.qry_doc = p.cls === 'PDU' ? 'CMR/T01' : 'CMR/T00'; });

  // 2) Kat 2 / 3
  let pid = T.points.reduce((m, p) => Math.max(m, p.pid), 10000) + 1;
  const decimalsOf = v => { const s = String(v); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  function noiseOf(unit, val) {
    switch (unit) {
      case '°C': return 0.1;
      case '%RH': return 0.4;
      case 'V': return val > 0 ? 0.4 : 0;
      case 'A': return val > 0 ? Math.max(0.02, val * 0.02) : 0;
      case 'W': return val > 0 ? val * 0.015 : 0;
      case '%': return 0.5;
      default: return 0;
    }
  }
  // o: { doc, rid, dev, desc, unit, val, dec, proto, sta, cls, conHost, lo, hi, hiA, pro, noise }
  function add(o, rnd) {
    const isNum = typeof o.val === 'number';
    const dec = isNum ? Math.max(decimalsOf(o.val), o.dec || 0) : 0;
    const scale = o.proto === 'modbus' || o.proto === 'snmp3' ? (dec >= 2 ? 100 : dec === 1 ? 10 : 1) : 1;
    const running = (o.sta & 0x3) === RUN;
    const p = {
      pid: pid++, qry_doc: o.doc, rid: o.rid, dev: o.dev, desc: o.desc, unit: o.unit || '', proto: PROTO[o.proto], sta: o.sta,
      tim: new Date(NOW - (running ? 1 + rnd() * 14 : 900 + rnd() * 1800) * 1000),
      cls: o.cls || '', isNum, dec, scale, base: isNum ? o.val : null,
      noise: o.noise != null ? o.noise : (isNum && running ? noiseOf(o.unit, o.val) : 0),
      lo: o.lo, hi: o.hi, hiA: o.hiA, conHost: o.conHost || '', pro: '', val: ''
    };
    T.setValue(p, o.val, o.pro);
    T.points.push(p);
  }
  const tempSta = v => (v >= 30 ? ALARM : v >= 27 || v < 18 ? WARN : 0);
  const r1 = v => Math.round(v * 10) / 10;

  (D.floors || []).filter(f => f.digit !== 1).forEach(f => {
    const doc = 'CMR/' + f.id;
    const rnd = D.rng(D.hash('telemetry-floor-' + f.id));
    const net = 100 + f.digit * 10;
    // Kabinler: sensör modülü (Modbus TCP), kapak (MQTT), PDU A/B (Modbus TCP)
    (D.getLockFloor(f.id) || []).map(k => k.cabinet).forEach((c, i) => {
      const pfx = c.pod.replace('-', '') + '_K' + c.code;
      const sns = 'Kabin ' + c.code + ' Sensör Modülü';
      const host = '10.10.' + net + '.' + (10 + (i % 240));
      [['TEMP_TOP', c.tempTop, 'ÜST SICAKLIK'], ['TEMP_MID', c.tempMid, 'ORTA SICAKLIK'], ['TEMP_BOT', c.tempLow, 'ALT SICAKLIK']].forEach(t =>
        add({ doc, rid: pfx + '_' + t[0], dev: sns, desc: 'KABİN ' + c.code + ' ' + t[2], unit: '°C', val: r1(t[1]), dec: 1, proto: 'modbus', sta: RUN | tempSta(t[1]), cls: 'TEMP', lo: 18, hi: 27, hiA: 30, conHost: host }, rnd));
      add({ doc, rid: pfx + '_HUM_MID', dev: sns, desc: 'KABİN ' + c.code + ' ORTA NEM', unit: '%RH', val: r1(c.humidity), dec: 1, proto: 'modbus', sta: RUN | (c.humidity >= 60 ? WARN : 0), cls: 'HUM', lo: 30, hi: 60, hiA: 70, conHost: host }, rnd);
      [['FDOOR', c.frontDoor, 'ÖN KAPAK', ' (Ön)'], ['RDOOR', c.rearDoor, 'ARKA KAPAK', ' (Arka)']].forEach(d =>
        add({ doc, rid: pfx + '_' + d[0], dev: 'Kilit ' + c.code + d[3], desc: 'KABİN ' + c.code + ' ' + d[2], unit: '-', val: d[1] === 'open' ? 'AÇIK' : 'KAPALI', pro: d[1] === 'open' ? 1 : 0,
          proto: 'mqtt', sta: RUN | (d[1] === 'open' ? ALARM : 0), cls: 'DOOR', conHost: 'mqtt://sns-gw-' + c.pod.toLowerCase() + ':1883' }, rnd));
      ['A', 'B'].forEach(side => {
        const curr = Math.round((side === 'A' ? c.pduA : c.pduB) * 100) / 100;
        const volt = r1(229 + rnd() * 2.5);
        const base = 'K' + c.code + '_PDU_' + side;
        const dev = 'Kabin ' + c.code + ' PDU-' + side;
        const pduHost = '10.10.' + (net + 1) + '.' + (10 + (i % 120) * 2 + (side === 'B' ? 1 : 0));
        add({ doc, rid: base + '_IN1_CURR', dev, desc: 'KABİN ' + c.code + ' PDU-' + side + ' IN1 CURR', unit: 'A', val: curr, dec: 2, proto: 'modbus', sta: RUN, cls: 'PDU', conHost: pduHost }, rnd);
        add({ doc, rid: base + '_IN1_VOLT_FN', dev, desc: 'KABİN ' + c.code + ' PDU-' + side + ' IN1 VOLT FN', unit: 'V', val: volt, dec: 1, proto: 'modbus', sta: RUN, cls: 'PDU', conHost: pduHost }, rnd);
        add({ doc, rid: base + '_IN_TOT_POW', dev, desc: 'KABİN ' + c.code + ' PDU-' + side + ' IN TOT POW', unit: 'W', val: Math.round(curr * volt * 0.96), proto: 'modbus', sta: RUN, cls: 'PDU', conHost: pduHost }, rnd);
      });
    });
    // Klima (BACnet/IP) ve UPS (SNMP v3) — kat yerleşimindeki etiketlerle
    const layout = D.layoutOf ? D.layoutOf(f.digit) : null;
    const items = layout ? layout.items : [];
    items.filter(it => it.type === 'climate').forEach((k, i) => {
      const id = 'KAT' + f.digit + '_' + k.label.replace(/\s+/g, '');
      const host = '10.10.' + (net + 5) + '.' + (31 + i);
      const ret = r1(24.2 + rnd() * 2.6);
      add({ doc, rid: id + '_MODE', dev: k.label, desc: k.label + ' ÇALIŞMA MODU', unit: '', val: 'SOĞUTMA', pro: 1, proto: 'bacnet', sta: RUN, cls: 'KLM', conHost: host }, rnd);
      add({ doc, rid: id + '_SUP_TEMP', dev: k.label, desc: k.label + ' ÜFLEME SICAKLIĞI', unit: '°C', val: r1(17.4 + rnd() * 1.8), dec: 1, proto: 'bacnet', sta: RUN, cls: 'KLM', conHost: host }, rnd);
      add({ doc, rid: id + '_RET', dev: k.label, desc: k.label + ' DÖNÜŞ SICAKLIĞI', unit: '°C', val: ret, dec: 1, proto: 'bacnet', sta: RUN, cls: 'KLM', hi: 28, hiA: 30, conHost: host }, rnd);
      add({ doc, rid: id + '_HUM', dev: k.label, desc: k.label + ' ODA NEMİ', unit: '%RH', val: Math.round(42 + rnd() * 9), proto: 'bacnet', sta: RUN, cls: 'KLM', conHost: host }, rnd);
      add({ doc, rid: id + '_FAN', dev: k.label, desc: k.label + ' FAN HIZI', unit: '%', val: Math.round(58 + rnd() * 22), proto: 'bacnet', sta: RUN, cls: 'KLM', noise: 0.6, conHost: host }, rnd);
      add({ doc, rid: id + '_SET', dev: k.label, desc: k.label + ' SET SICAKLIĞI', unit: '°C', val: 22.0, dec: 1, proto: 'bacnet', sta: RUN | T.STA.OUT, noise: 0, cls: 'SET', conHost: host }, rnd);
    });
    items.filter(it => it.type === 'ups').forEach((u, i) => {
      const code = u.label.replace(/^UPS\s*/i, '');
      const id = 'KAT' + f.digit + '_SAL1_' + code + '_UPS';
      const host = '10.10.' + (net + 6) + '.' + (11 + i);
      add({ doc, rid: id + '_MODE', dev: u.label, desc: u.label + ' ÇALIŞMA MODU', unit: '', val: 'ONLINE (ŞEBEKE)', pro: 1, proto: 'snmp3', sta: RUN, cls: 'UPS', conHost: host }, rnd);
      add({ doc, rid: id + '_OUT_VOLT_L1', dev: u.label, desc: u.label + ' ÇIKIŞ GERİLİMİ L1', unit: 'V', val: r1(229.4 + rnd() * 1.4), dec: 1, proto: 'snmp3', sta: RUN, cls: 'UPS', conHost: host }, rnd);
      add({ doc, rid: id + '_LOAD', dev: u.label, desc: u.label + ' YÜK ORANI', unit: '%', val: Math.round(31 + rnd() * 24), proto: 'snmp3', sta: RUN, cls: 'UPS', noise: 0.6, conHost: host }, rnd);
      add({ doc, rid: id + '_BAT_CAP', dev: u.label, desc: u.label + ' AKÜ KAPASİTESİ', unit: '%', val: 100, proto: 'snmp3', sta: RUN, cls: 'UPS', noise: 0, conHost: host }, rnd);
    });
  });

  // Kat seçeneği (floorDocOptions): katın iki dokümanı varsa " · Tesis" / " · Beyaz Alan"
  D.telemetryFloors = [];
  (D.floors || []).forEach(f => {
    const docs = f.digit === 1 ? [['CMR/T00', ' · Tesis'], ['CMR/T01', ' · Beyaz Alan']] : [['CMR/' + f.id, '']];
    docs.forEach(d => D.telemetryFloors.push({ value: d[0], label: f.label + d[1] + ' (' + d[0] + ')' }));
  });
})();
