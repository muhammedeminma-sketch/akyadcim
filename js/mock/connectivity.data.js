/* ==========================================================================
   DCIM Sunum — SDP Kablolama Topolojisi mock verisi (connectivity.html)
   api.CTD_Data(0,'…') (queryCableTopologyDiagramApi, where={src_pan}) çağrısının yerine geçer.
   KURGUSAL CTD tablosu: Kat-1 kabinleri (DCIM.data.cabinets) POD'larına göre A1–A7 / B1–B7 SDP panolarına
   dağıtılır; her kabinin PDU_A'sı A, PDU_B'si aynı numaralı B panosundan beslenir (2N). Ağ (NW) sırası kabinleri
   tek devre, diğerleri üç devre (L1/L2/L3) alır. Sigorta adı: '<SDP>.G<giriş> - F<no>' (giriş barası G1/G2 dönüşümlü).
   Sabitler: 1NA06 → 2 numaralı SDP (senaryo: PDU-B L2 faz kaybı), 1DL03 → 6 numaralı SDP (yüksek akım).
   Bu dosya js/mock-data.js'ten sonra yüklenir ve DCIM.data.connectivity'yi tanımlar.

   Canlı ölçüm modeli (tohumlu, tick başına ±%1,5 dalgalanma):
   - Sigorta devresi (CTD satırı): kabinin ilgili PDU tarafı akımı (DCIM.data.cabinets[].pduA/pduB)
     o PDU'yu besleyen devrelere paylaştırılır. 3 devreli PDU → L1/L2/L3 (faz payları
     failover rapor mock'undaki basePhases ile aynı tohumdan). Anma: tek devre 32 A, çok devre 16 A.
   - RPP / Giriş barası (…G1 / …G2) ve SDP: DCIM.data.reports.sdp (SDP raporu, 160 A giriş şalteri)
     değerleriyle aynı; rapor verisi yoksa devrelerin toplamı kullanılır.
   - UPS: DCIM.data.ups (yük oranı, çalışma modu). Çıkış gücü = yük % × 80 kW (SDP rapor varsayımı).
   - ADP ve Trafo: tohumlu (1600 kVA). ADP ↔ Trafo ↔ UPS eşlemesi PMS tek hat şemalarıyla aynıdır
     (A1–A4 → ADP-A1 / TR-1, A5–A7 → ADP-A2 / TR-2; B1–B4 → ADP-B1 / TR-3, B5–B7 → ADP-B2 / TR-4).
   Senaryo: UPS A5 akü modunda (ADP → UPS A5 girişi yok) · 1NA06 PDU_B L2 faz kaybı (B2 SDP) ve L2 yükü
   PDU_A'ya aktarıldı (A2 SDP, yüksek yük) · 1DL03 yüksek akım (C20 sigorta, A6/B6 SDP) · UPS B4 yük %82 ·
   UPS B7 SNMP kaybı.
   Bağımlılık: js/mock-data.js (DCIM.data: cabinets, ups, findCabinet, findEquipment, pdu, reports, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const SQRT3 = Math.sqrt(3);
  const between = (rnd, min, max) => min + (max - min) * rnd();
  const rngOf = key => D.rng(D.hash(String(key)));

  // Yük eşikleri (%): ≥ WARN yüksek yük (turuncu), ≥ CRIT aşırı yük (kırmızı)
  const LOAD_WARN = 80;
  const LOAD_CRIT = 95;
  const UPS_RATED_KW = 80;     // SDP raporundaki "yük % × 0,8 kW" varsayımı
  const RPP_RATED_A = 160;     // SDP giriş şalteri (sunum varsayımı)
  const SDP_RATED_A = 250;     // SDP ana bara (sunum varsayımı)
  const ADP_RATED_A = 2500;    // ADP ana şalter (sunum varsayımı)
  const TRAFO_RATED_KVA = 1600;

  // ---------------------------------------------------------------------------
  // CTD tablosu (kurgusal) — [src_pan kodu, src_fus, tgt_cab, tgt_pdu]
  // ---------------------------------------------------------------------------
  const CTD_META = { flr: '1. KAT', hal: '1. SALON', wrk_dat: '2026-03-18', wrk_per: 'Kablolama Ekibi B' };
  const SDP_FIX = { '1NA06': 2, '1DL03': 6 };
  const CTD_ROWS = (function buildCtdRows() {
    const cabs = (D.cabinets || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), 'tr', { numeric: true }));
    const pods = Array.from(new Set(cabs.map(c => c.pod))).sort((a, b) => String(a).localeCompare(String(b), 'tr', { numeric: true }));
    const perSdp = {}, fuse = {};
    const rows = [];
    cabs.forEach(c => {
      const n = SDP_FIX[c.code] || (pods.indexOf(c.pod) % 7) + 1;
      perSdp[n] = (perSdp[n] || 0) + 1;
      const gir = (perSdp[n] % 2) + 1;
      const circuits = /^NW-/.test(c.pod) && !SDP_FIX[c.code] ? 1 : 3;
      ['A', 'B'].forEach(side => {
        const sdp = side + n;
        for (let k = 0; k < circuits; k++) {
          const key = sdp + 'G' + gir;
          fuse[key] = (fuse[key] || 0) + 1;
          rows.push([sdp, sdp + '.G' + gir + ' - F' + fuse[key], c.code, 'PDU_' + side]);
        }
      });
    });
    return rows;
  })();

  const ROWS = CTD_ROWS.map((r, i) => ({
    id: i + 1, flr: CTD_META.flr, hal: CTD_META.hal,
    src_pan: r[0] + ' SDP PANOSU', src_fus: r[1], tgt_cab: r[2], tgt_pdu: r[3],
    wrk_dat: CTD_META.wrk_dat, wrk_per: CTD_META.wrk_per
  }));
  const cabCode = tgt => String(tgt || '').split(' ')[0];
  const sdpCode = pan => String(pan || '').split(' ')[0];
  const sideOfPdu = pdu => String(pdu || '').replace(/^PDU_?/i, '').charAt(0).toUpperCase() || 'A';

  // Kabin|PDU → besleyen devreler (tüm SDP'ler)
  const byPdu = {};
  ROWS.forEach(r => { const k = cabCode(r.tgt_cab) + '|' + r.tgt_pdu; (byPdu[k] = byPdu[k] || []).push(r); });
  const pdusOf = (code, side) => Object.keys(byPdu).filter(k => k.split('|')[0] === code && sideOfPdu(k.split('|')[1]) === side).map(k => k.split('|')[1]).sort();

  // Tohumlu dalgalanma çarpanı
  function jit(key, tick, amp) {
    return 1 + (rngOf(key + '#' + tick)() - 0.5) * 2 * (amp == null ? 0.015 : amp);
  }
  function loadStatus(load, lost) {
    if (lost) return { status: 'alarm', reason: 'Faz kaybı' };
    if (load >= LOAD_CRIT) return { status: 'alarm', reason: 'Aşırı yük' };
    if (load >= LOAD_WARN) return { status: 'warning', reason: 'Yüksek yük' };
    return { status: 'normal', reason: 'Normal' };
  }
  const RANK = { normal: 0, unknown: 1, lost: 1, warning: 2, alarm: 3 };
  const worst = list => list.reduce((w, s) => (RANK[s] > RANK[w] ? s : w), 'normal');

  // ---------------------------------------------------------------------------
  // Sigorta devresi (CTD satırı) — statik taban değerler
  // ---------------------------------------------------------------------------
  const circuitCache = {};
  function circuitBase(row) {
    if (circuitCache[row.id]) return circuitCache[row.id];
    const code = cabCode(row.tgt_cab);
    const side = sideOfPdu(row.tgt_pdu);
    const list = byPdu[code + '|' + row.tgt_pdu] || [row];
    const idx = list.indexOf(row);
    const n = list.length;
    const cab = D.findCabinet(code);
    const pduCount = Math.max(1, pdusOf(code, side).length);
    const rnd = rngOf('ctd-' + row.id);

    // PDU tarafı toplam akımı (A). Yerleşimde olmayan kabinler (2EA08 vb.) için tohumlu değer.
    let S = cab ? (side === 'A' ? cab.pduA : cab.pduB) : between(rngOf('ctd-cab-' + code + side), 7.5, 15.5);
    if (cab && cab.pduFault) S = cab.currentA / 2; // failover mock: faz kaybında taban her iki taraf yarı yük
    S /= pduCount;

    // Devre payları: 3 devre → faz payları (failover basePhases ile aynı tohum)
    let sh;
    if (n === 3) {
      const pr = rngOf(code + '-phase');
      sh = [between(pr, 0.3, 0.37), between(pr, 0.3, 0.37), between(pr, 0.3, 0.37)];
      if (code === '1DL03') sh = [0.38, 0.32, 0.30];
    } else {
      const pr = rngOf(code + '|' + row.tgt_pdu + '-share');
      sh = list.map(() => between(pr, 0.85, 1.15));
    }
    const tot = sh.reduce((a, b) => a + b, 0);
    sh = sh.map(x => x / tot);

    let I = S * sh[idx];
    let lost = false;
    let note = '';
    if (cab && cab.pduFault && n === 3 && idx === 1) {
      // Senaryo 1NA06: PDU-B L2 faz kaybı → L2 yükü PDU-A'ya biner
      if (side === 'B') { I = 0; lost = true; note = 'PDU-B L2 faz kaybı (0 V)'; }
      else { I += S * sh[1] * 1.12; note = 'L2 yükü B yolundan aktarıldı'; }
    }
    const fno = parseInt((String(row.src_fus).match(/F(\d+)$/) || [])[1] || '1', 10);
    const phase = n === 3 ? idx + 1 : ((fno - 1) % 3) + 1;
    let rating = n === 1 ? 32 : 16;
    if (code === '1DL03') { rating = 20; note = 'Yüksek akım (C20 sigorta)'; }

    const base = {
      row, code, side, pdu: row.tgt_pdu, idx, n, phase, rating, lost, note,
      I, V: between(rnd, 228.6, 231.4), pf: between(rnd, 0.95, 0.985),
      gir: parseInt((String(row.src_fus).match(/G(\d)/) || [])[1] || '1', 10)
    };
    circuitCache[row.id] = base;
    return base;
  }

  function circuit(row, tick) {
    const b = circuitBase(row);
    const I = b.lost ? 0 : b.I * jit('c' + row.id, tick);
    const V = b.lost ? 0 : b.V * jit('v' + row.id, tick, 0.002);
    const load = (I / b.rating) * 100;
    const st = loadStatus(load, b.lost);
    return {
      kind: 'circuit', phases: 1, phase: 'L' + b.phase, I: [I], V: [V], Iavg: I, Imax: I, Vavg: V,
      P: (V * I * b.pf) / 1000, pf: b.pf, rating: b.rating, load, status: st.status, reason: b.lost ? 'Faz kaybı' : st.reason,
      lost: b.lost, note: b.note, code: b.code, side: b.side, pdu: b.pdu, gir: b.gir, row
    };
  }

  // PDU (kabin + tgt_pdu) — besleyen tüm devrelerin toplamı
  function pdu(code, pduName, tick) {
    const list = byPdu[code + '|' + pduName] || [];
    const cs = list.map(r => circuit(r, tick));
    const I = cs.reduce((s, c) => s + c.Iavg, 0);
    const live = cs.filter(c => !c.lost);
    const V = live.length ? live.reduce((s, c) => s + c.Vavg, 0) / live.length : 0;
    const P = cs.reduce((s, c) => s + c.P, 0);
    const load = cs.reduce((m, c) => Math.max(m, c.load), 0);
    const side = sideOfPdu(pduName);
    const sc = D.pdu && D.pdu.scenario ? D.pdu.scenario[code + '_' + side] : null;
    const lost = cs.some(c => c.lost);
    const status = worst(cs.map(c => c.status));
    return {
      kind: 'pdu', phases: cs.length, circuits: cs, I: cs.map(c => c.Iavg), V: cs.map(c => c.Vavg),
      Iavg: I, Imax: cs.reduce((m, c) => Math.max(m, c.Iavg), 0), Vavg: V, P, pf: cs.length ? cs[0].pf : 0.97,
      rating: cs.length ? cs[0].rating : 32, load, status, lost,
      reason: lost ? 'Faz kaybı' : loadStatus(load, false).reason,
      note: (sc && sc.note) || (cs.find(c => c.note) || {}).note || '', code, side, pdu: pduName
    };
  }

  // ---------------------------------------------------------------------------
  // Üç fazlı toplayıcılar (RPP / SDP / UPS / ADP / Trafo)
  // ---------------------------------------------------------------------------
  function threePhase(kind, I, V, pf, rating, extra) {
    const Iavg = (I[0] + I[1] + I[2]) / 3;
    const Imax = Math.max(I[0], I[1], I[2]);
    const Vavg = (V[0] + V[1] + V[2]) / 3;
    const load = rating ? (Imax / rating) * 100 : 0;
    const st = loadStatus(load, false);
    return Object.assign({ kind, phases: 3, I, V, Iavg, Imax, Vavg, pf, P: (Vavg * (I[0] + I[1] + I[2]) * pf) / 1000, rating, load, status: st.status, reason: st.reason, lost: false, note: '' }, extra || {});
  }

  function sdpReportUnit(code, gir) {
    const R = D.reports && D.reports.sdp;
    if (!R || !R.units) return null;
    return R.units('CMR/T00').find(u => u.id === code + '_UPS_GIR' + gir) || null;
  }
  const rowsOfSdp = code => ROWS.filter(r => sdpCode(r.src_pan) === code);

  // RPP / Giriş barası: sdp = 'A1', gir = 1|2
  function rpp(code, gir, tick) {
    const u = sdpReportUnit(code, gir);
    let I, V, pf;
    if (u) {
      I = u.I.map((x, i) => x * jit('rpp' + code + gir + i, tick));
      V = u.V.map((x, i) => x * jit('rppv' + code + gir + i, tick, 0.002));
      pf = u.pf;
    } else {
      // Yedek: devrelerin faz toplamları
      I = [0, 0, 0]; V = [230, 230, 230]; pf = 0.97;
      rowsOfSdp(code).forEach(r => { const c = circuit(r, tick); if (c.gir === gir) I[parseInt(c.phase.slice(1), 10) - 1] += c.Iavg; });
    }
    return threePhase('rpp', I, V, pf, RPP_RATED_A, { code, gir });
  }

  function sdp(code, tick) {
    const a = rpp(code, 1, tick);
    const b = rpp(code, 2, tick);
    const I = [0, 1, 2].map(i => a.I[i] + b.I[i]);
    const V = [0, 1, 2].map(i => (a.V[i] + b.V[i]) / 2);
    return threePhase('sdp', I, V, (a.pf + b.pf) / 2, SDP_RATED_A, { code });
  }

  const pointVal = (eq, label) => { const p = eq && eq.points ? eq.points.find(x => x.label === label) : null; return p ? p.value : null; };

  function ups(code, tick) {
    const eq = D.findEquipment('UPS ' + code);
    const lostCom = !!eq && eq.status === 'lost';
    const battery = pointVal(eq, 'Çalışma Modu') === 'AKÜ';
    const baseLoad = eq && eq.load != null ? eq.load : 50;
    const load = baseLoad * jit('ups' + code, tick, 0.01);
    const outKw = (load / 100) * UPS_RATED_KW;
    const pf = 0.96;
    const Iout = (outKw * 1000) / (SQRT3 * 400 * pf);
    const shares = [0, 1, 2].map(i => between(rngOf('ups-ph-' + code + i), 0.97, 1.03));
    const I = shares.map((s, i) => Iout * s * jit('upsI' + code + i, tick, 0.006));
    const vOut = pointVal(eq, 'Çıkış Gerilimi (L1)') || 230;
    const V = [0, 1, 2].map(i => vOut * jit('upsV' + code + i, tick, 0.002));
    const vIn = battery ? 0 : (pointVal(eq, 'Giriş Gerilimi (L1)') || 229);
    const Iin = battery ? [0, 0, 0] : I.map(x => x * 1.045); // verim ≈ %95,7
    // Kapasite oranı UPS yük oranıdır (anma çıkış akımına göre)
    const res = threePhase('ups', I, V, pf, 0, { code });
    res.load = load;
    const st = loadStatus(load, false);
    res.status = lostCom ? 'lost' : eq ? (eq.status === 'normal' ? st.status : eq.status) : st.status;
    res.reason = lostCom ? 'Haberleşme kaybı' : battery ? 'Akü modunda' : eq && eq.note ? eq.note : st.reason;
    res.note = eq ? eq.note : '';
    res.lostCom = lostCom;
    res.battery = battery;
    res.mode = lostCom ? '—' : battery ? 'AKÜ' : 'ONLINE (ŞEBEKE)';
    res.inputV = vIn * (battery ? 0 : jit('upsVin' + code, tick, 0.002));
    res.inputI = Iin;
    res.batteryPct = pointVal(eq, 'Akü Kapasitesi');
    res.batteryMin = pointVal(eq, 'Kalan Akü Süresi');
    res.batteryTemp = pointVal(eq, 'Akü Sıcaklığı');
    res.ratedKw = UPS_RATED_KW;
    // ADP → UPS giriş hattının durumu
    res.input = battery ? { status: 'alarm', reason: 'Giriş yok — akü modu', lost: true }
      : lostCom ? { status: 'unknown', reason: 'Veri alınamıyor', lost: false }
        : { status: st.status, reason: st.reason, lost: false };
    if (lostCom) { res.I = [0, 0, 0]; res.Iavg = res.Imax = 0; res.P = 0; }
    return res;
  }

  // ADP / Trafo eşlemesi (PMS tek hat şemalarıyla aynı kurgusal trafolar)
  const UPSTREAM = [
    { side: 'A', adp: 'ADP-A1', trafo: 'DCA_A_TR1_Q1', trafoLabel: 'TR-1 · Q1', ups: ['A1', 'A2', 'A3', 'A4'] },
    { side: 'A', adp: 'ADP-A2', trafo: 'DCA_A_TR2_Q2', trafoLabel: 'TR-2 · Q2', ups: ['A5', 'A6', 'A7'] },
    { side: 'B', adp: 'ADP-B1', trafo: 'DCA_B_TR3_Q3', trafoLabel: 'TR-3 · Q3', ups: ['B1', 'B2', 'B3', 'B4'] },
    { side: 'B', adp: 'ADP-B2', trafo: 'DCA_B_TR4_Q4', trafoLabel: 'TR-4 · Q4', ups: ['B5', 'B6', 'B7'] }
  ];
  const upstreamOf = code => UPSTREAM.find(u => u.ups.indexOf(code) >= 0) || UPSTREAM[0];
  function trafoUnit(id) {
    const R = D.reports && D.reports.trafo;
    const u = R && R.units ? R.units.find(t => t.id === id) : null;
    if (u) return u;
    const rnd = rngOf('cv-trafo-' + id);
    const a = between(rnd, 820, 910);
    return { id, I: [a, a * 0.99, a * 1.01], V: [233.6, 233.9, 234.1], pf: 0.965 };
  }
  function trafo(id, tick) {
    const u = trafoUnit(id);
    const I = u.I.map((x, i) => x * jit('tr' + id + i, tick, 0.008));
    const V = u.V.map((x, i) => x * jit('trv' + id + i, tick, 0.002));
    const res = threePhase('trafo', I, V, u.pf, (TRAFO_RATED_KVA * 1000) / (SQRT3 * 400), { id });
    res.S = ((V[0] + V[1] + V[2]) / 3) * (I[0] + I[1] + I[2]) / 1000;
    res.ratedKva = TRAFO_RATED_KVA;
    return res;
  }
  function adp(id, tick) {
    const up = UPSTREAM.find(u => u.adp === id) || UPSTREAM[0];
    const t = trafo(up.trafo, tick); // ADP ana barası trafo Q çıkışıyla aynı akımı taşır
    return threePhase('adp', t.I, t.V, t.pf, ADP_RATED_A, { id, trafo: up.trafo });
  }

  // ---------------------------------------------------------------------------
  // Sorgular
  // ---------------------------------------------------------------------------
  // api.CTD_Data karşılığı: where = { src_pan }
  function query(where) {
    const w = where || {};
    if (w.src_pan) return ROWS.filter(r => r.src_pan === w.src_pan);
    if (w.id) return ROWS.filter(r => r.id === Number(w.id));
    return ROWS.slice();
  }
  // Bir kabinin A/B beslemeleri (çift besleme)
  function feedsOf(code) {
    const out = { A: [], B: [] };
    ROWS.forEach(r => { if (cabCode(r.tgt_cab) === code) out[sideOfPdu(r.tgt_pdu)].push(r); });
    return out;
  }
  // Normal dışı hatlar (tüm SDP'ler) + UPS olayları
  function abnormal(tick) {
    const out = [];
    const seen = {};
    ROWS.forEach(r => {
      const c = circuit(r, tick);
      if (c.status === 'normal') return;
      const key = c.code + '|' + c.pdu + '|' + sdpCode(r.src_pan);
      if (seen[key] && RANK[seen[key].status] >= RANK[c.status]) return;
      const item = { kind: 'circuit', status: c.status, code: c.code, pdu: c.pdu, side: c.side, sdp: sdpCode(r.src_pan), row: r, phase: c.phase, load: c.load, reason: c.lost ? 'Faz kaybı' : c.reason, note: c.note };
      if (seen[key]) out.splice(out.indexOf(seen[key]), 1, item); else out.push(item);
      seen[key] = item;
    });
    UPSTREAM.forEach(g => g.ups.forEach(code => {
      const u = ups(code, tick);
      if (u.status !== 'normal') out.push({ kind: 'ups', status: u.status, code, sdp: code, load: u.load, reason: u.reason, battery: u.battery });
    }));
    return out.sort((a, b) => RANK[b.status] - RANK[a.status] || (a.kind === 'ups' ? -1 : 1) - (b.kind === 'ups' ? -1 : 1));
  }

  D.connectivity = {
    meta: CTD_META,
    thresholds: { warn: LOAD_WARN, crit: LOAD_CRIT },
    rated: { ups: UPS_RATED_KW, rpp: RPP_RATED_A, sdp: SDP_RATED_A, adp: ADP_RATED_A, trafo: TRAFO_RATED_KVA },
    query, feedsOf, pdusOf, cabCode, sdpCode, sideOfPdu, upstreamOf, upstream: UPSTREAM,
    circuit, pdu, rpp, sdp, ups, adp, trafo, abnormal, worst, rank: RANK
  };
})();

