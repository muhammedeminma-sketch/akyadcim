/* ==========================================================================
   DCIM Sunum — Sistem Sağlığı "Performans" sekmesi mock verisi
   AyxdbPerformanceService (ayxdb-performance.service.ts) aynı sağlık snapshot'ını okur; burada
   DCIM.data.health.sample(tick) satırlarına sahayı yoklayan bağlantılar (kind connection, tmr_cnt > 0)
   ve saatlik toplu iş (TH_SUM*) eklenir. Tüm değerler tohumlu ve kurgusaldır.
   rel = sayfa açılışına göre 5 sn'lik yoklama sırası (0 = ilk canlı yoklama, negatif = geçmiş).
   Senaryo (ortak senaryo ile tutarlı):
     - con_snmp_ups   UPS B7 SNMP kaybı: zaman aşımları birikiyor, gecikme ≥ 30 sn → Kırılma (3 dk önce başladı)
     - con_mb_pod5_7  1DM03 sensör modülü Modbus zaman aşımı: gecikme ~1,5 sn + tmr_skp artıyor → Bozulma (4 dk)
     - con_bac_klima  KLIMA 109 alarm sorgusu kısa tepe yapıyor (≈2 dk'da bir 10 sn) → Kısa tepe
   Bağımlılık: js/mock-data.js (DCIM.data.health, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D || !D.health) return;

  const RUN = 0x0003;
  const TICK_BASE = 1000; // ortak üreticideki sayaçlar (tmr_skp) pozitif ve artan kalsın

  // p: healthy | kirilma | bozulma | tepe
  const FIELD = [
    { rid: 'con_mb_pod1_4', doc: 'CMR/T01', desc: 'Modbus TCP · POD-1..4 kabin sensör ve PDU', lat: 46000, load: 44, wrk: 3, tmr: 8, ses: [24, 32] },
    { rid: 'con_mb_pod5_7', doc: 'CMR/T01', desc: 'Modbus TCP · POD-5..7 kabin sensör ve PDU', lat: 58000, load: 61, wrk: 3, tmr: 6, ses: [18, 32], p: 'bozulma', onset: -48 },
    { rid: 'con_mb_pod8_10', doc: 'CMR/T01', desc: 'Modbus TCP · POD-8..10 kabin sensör ve PDU', lat: 41000, load: 39, wrk: 3, tmr: 6, ses: [18, 32] },
    { rid: 'con_mb_ns', doc: 'CMR/T01', desc: 'Modbus TCP · NW-1 / NW-2 ağ kabinleri', lat: 22000, load: 18, wrk: 2, tmr: 2, ses: [6, 16] },
    { rid: 'con_mb_kat2', doc: 'CMR/T01', desc: 'Modbus TCP · 2. Kat kabinleri (POD-11..17, NW-3)', lat: 71000, load: 52, wrk: 4, tmr: 12, ses: [40, 64] },
    { rid: 'con_mb_kat3', doc: 'CMR/T01', desc: 'Modbus TCP · 3. Kat kabinleri (POD-21..24)', lat: 49000, load: 33, wrk: 3, tmr: 8, ses: [26, 48] },
    { rid: 'con_snmp_ups', doc: 'CMR/T02', desc: 'SNMP v3 · UPS A / B grubu', lat: 118000, load: 57, wrk: 2, tmr: 4, ses: [11, 16], p: 'kirilma', onset: -36 },
    { rid: 'con_snmp_pmm', doc: 'CMR/T02', desc: 'SNMP v2c · Pano analizörleri (PMM)', lat: 64000, load: 21, wrk: 1, tmr: 2, ses: [6, 16] },
    { rid: 'con_bac_klima', doc: 'CMR/T03', desc: 'BACnet/IP · Salon klimaları', lat: 88000, load: 36, wrk: 2, tmr: 4, ses: [14, 32], p: 'tepe' },
    { rid: 'con_rtu_pano', doc: 'CMR/T03', desc: 'Modbus RTU · Klima panoları (RS-485)', lat: 152000, load: 27, wrk: 1, tmr: 2 },
    { rid: 'con_mqtt_lock', doc: 'CMR/T04', desc: 'MQTT · Kapak kilidi ağ geçitleri', lat: 9000, load: 12, wrk: 1, tmr: 1, ses: [12, 32] }
  ];
  // Ortak üreticideki genel saha havuzları yerine ayrıntılı bağlantılar kullanılır
  const REPLACED = { con_mb_gw: 1, con_snmp: 1, con_bacnet: 1 };

  function fieldRow(def, rel) {
    const rnd = D.rng(D.hash(def.rid + ':' + rel));
    const j = (base, spread) => Math.max(0, base + (rnd() - 0.5) * 2 * spread);
    const load = j(def.load, 3);
    const row = {
      rid: def.rid, qry_doc: def.doc, desc: def.desc, sta: RUN, eng_mode: 1, tmr_cnt: def.tmr, thr_wrk: def.wrk,
      thr_win_ms: Math.round(j(1000, 15)),
      thr_tot_lps: Math.round(load * 10) / 10,
      wrk_tot_lps: Math.round(j(load * 0.94, 2) * 10) / 10,
      wrk_tot_lps_max: Math.round(Math.min(78, j(load * 1.06, 2)) * 10) / 10,
      thr_que_cnt: 0, wrk_que_cnt: 0,
      thr_que_aps: Math.round(j(def.tmr * 4, 2)), thr_que_rps: 0,
      thr_cyc_ovr: 0, wrk_cyc_ovr: 0, tmr_skp: 0
    };
    row.thr_que_rps = row.thr_que_aps;
    let lat = j(def.lat, def.lat * 0.18);
    if (def.p === 'kirilma' && rel >= def.onset) {
      // UPS B7 SNMP ajanı yanıt vermiyor: her tur zaman aşımına kadar bekliyor, iş kuyrukta birikiyor
      const k = rel - def.onset;
      lat = Math.min(38500000, 30800000 + k * 160000) + (rnd() - 0.5) * 900000;
      row.wrk_que_cnt = 2 + Math.min(9, Math.floor(k / 4));
      row.thr_que_cnt = 1;
      row.wrk_cyc_ovr = 2 + (k % 3);
      row.wrk_tot_lps = Math.round(j(load * 1.18, 2) * 10) / 10;
    } else if (def.p === 'bozulma' && rel >= def.onset) {
      // 1DM03 sensör modülü yanıt vermiyor: Modbus zaman aşımları turu uzatıyor, tetiklemeler düşüyor
      lat = j(1580000, 320000);
      row.tmr_skp = 260 + (rel - def.onset) * 2;
    } else if (def.p === 'bozulma') {
      row.tmr_skp = 260;
    } else if (def.p === 'tepe' && (((rel % 23) + 23) % 23 === 0 || ((rel % 23) + 23) % 23 === 22)) {
      // KLIMA 109 alarm tablosu okuması kısa süre uzuyor (30 sn'yi doldurmadan geçiyor)
      lat = j(1320000, 160000);
    } else if (def.p === 'tepe' && rel < -60 && ((rel % 41) + 41) % 41 === 0) {
      lat = j(640000, 80000); // eşik altı küçük tepeler
    }
    row.wrk_lat_us = Math.round(lat);
    row.thr_lat_us = Math.round(lat * 1.08);
    row.wrk_lat_max_us = Math.round(lat * (lat >= 30000000 ? j(1.12, 0.04) : j(2.1, 0.3)));
    row.thr_lat_max_us = Math.round(row.wrk_lat_max_us * 1.05);
    if (def.ses) {
      row.ses_cnt = Math.round(j(def.ses[0], Math.max(1, def.ses[0] * 0.06)));
      row.con_ses = def.ses[1];
    }
    return row;
  }

  function batchRow(rel) {
    const rnd = D.rng(D.hash('TH_SUM_HOURLY:' + rel));
    const peak = ((rel % 72) + 72) % 72 < 3; // saat başı (sunumda ≈6 dk'da bir) toplu tepe
    const lat = peak ? 2400000 + rnd() * 900000 : 4200 + rnd() * 1500;
    return {
      rid: 'TH_SUM_HOURLY', qry_doc: 'CME/S00', desc: 'Saatlik enerji ve kapasite özeti (toplu iş)', sta: RUN, eng_mode: 1, tmr_cnt: 1, thr_wrk: 1,
      thr_win_ms: 1000, thr_tot_lps: peak ? 94 : 3, wrk_tot_lps: peak ? 92 : 2, wrk_tot_lps_max: peak ? 96 : 3,
      thr_que_cnt: 0, wrk_que_cnt: 0, thr_que_aps: 1, thr_que_rps: 1,
      thr_lat_us: Math.round(lat), thr_lat_max_us: Math.round(lat * 1.6), wrk_lat_us: Math.round(lat * 0.95), wrk_lat_max_us: Math.round(lat * 1.5),
      thr_cyc_ovr: 0, wrk_cyc_ovr: 0, tmr_skp: 0
    };
  }

  D.healthPerf = {
    /** Sayfa açılmadan önceki izleme penceresi (5 sn × 120 = 10 dk) */
    warmSamples: 120,
    /** ?state=stale|partial|disconnected: son geçerli ölçüm bu kadar yoklama önce */
    staleAfter: 27,
    /** Ortak sağlık örneği + performans eklentileri (rel: sayfa açılışına göre yoklama sırası) */
    sample(rel) {
      const raw = D.health.sample(TICK_BASE + rel);
      raw.connections = raw.connections.filter(r => !REPLACED[r.rid]).map(r => Object.assign(r, { tmr_cnt: 0 }))
        .concat(FIELD.map(def => fieldRow(def, rel)));
      raw.threads = raw.threads.concat([batchRow(rel)]);
      return raw;
    }
  };
})();
