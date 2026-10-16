/* ==========================================================================
   DCIM Sunum — PMS (Güç Yönetim Sistemi) mock verileri (pms.html)
   XDB enerji analizörleri (dev_type='meter'), CMA_List güç alarmları ve SCH tablo şemalarının yerine geçer.
   DCIM.data.pms:
     analyzers           → 42 analizör tanımı (IDC1 41 + IDC4 1; kimlik/ad SCH_PMS_import_2026-10-14.sql'den)
     meters(tick)        → { [id]: { kw, kva, kvar, pf, vln, vll, freq, ia, ib, ic, curr, loaded } }
     kpi(tick)           → BT / soğutma / trafo yükü, PUE, UPS modül sayısı, A/B besleme, tesis girişi
     sources(tick)       → Kaynaklar ve dağıtım kartları (meter_of = grid / transformer / generator)
     generatorTable(side, tick) → "A/B Tarafı Jeneratör Değerleri" tablo şeması (EN0101010400000000[b])
     compensationTables(tick)   → "Kompanzasyon Sistemleri" tablo şeması (EN0101010300000000)
     powerAlarms()       → güç alarmları: DCIM.data.activeAlarms (Enerji Grubu + 1AV42 PDU-B) +
                           DCIM.data.pmsSingleLine.demoAlarms (varsa; şalter/jeneratör alarmları)
     upsInfo(code)       → UPS düğüm adı ("A UPS - 5") ve sayfa başlığı (A UPS ODASI 5 Nolu Modül | Huawei UPS 5000E | IP)
     standards, dataSources → "Sektör standartları" ve "Veri kaynakları" metinleri (pms-dashboard.component'ten)
   Kapsam: PMS IDC1 binasının tamamını (3 kat) izler; Kat-1 BT yükü UPS giriş güçleriyle (DCIM.data.energy) tutarlı,
   PUE ≈ site.pue. Senaryo: UPS A5 akü modunda (A kolu Kat-1 yükü düşük), UPS B7 SNMP kaybı, A kolu jeneratörleri
   (GEN4–GEN6) haftalık yüksüz testte, B kolu (GEN1–GEN3) otomatikte hazır, kuplaj şalterleri açık.
   Tek hat demo alarmlarıyla tutarlılık: "veri yok" alarmlı analizör (ör. GEN3 Q9) değer vermez; TRIP alarmlı kat
   panosu (ör. Q36) enerjisizdir ve yükü aynı kattaki öbür taraf panosuna geçer (A/B dengesi buna göre kayar).
   tick: 3 sn'lik canlı yenileme sayacı; aynı tick → aynı değer (tohumlu gürültü).
   Bağımlılık: js/mock-data.js (DCIM.data.energy, activeAlarms, site, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;
  const E = D.energy;
  const TICK_SEC = E.TICK_SEC || 3;

  const rngOf = key => D.rng(D.hash(String(key)));
  const jit = (key, tick, amp) => (rngOf(key + '#' + tick)() - 0.5) * 2 * amp;
  const fixed = (key, a, b) => a + (b - a) * rngOf(key)();
  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;
  const TARGET_PUE = (D.site && D.site.pue) || 1.42;

  // ---------------------------------------------------------------------------
  // Analizörler — meter_of / feed / load öznitelikleri (analyzers-view METER_OF_LABEL anahtarları)
  // ---------------------------------------------------------------------------
  const A = (id, title, meterOf, feed, extra) => Object.assign({ id, title, meterOf, feed, loc: 'IDC1', load: '' }, extra || {});
  const analyzers = [
    // A tarafı
    A('IDC1_A_GEN4_Q5', 'IDC1 A Jeneratör-4 Q5', 'generator', 'A', { gen: 4 }),
    A('IDC1_A_GEN5_Q6', 'IDC1 A Jeneratör-5 Q6', 'generator', 'A', { gen: 5 }),
    A('IDC1_A_GEN6_Q7', 'IDC1 A Jeneratör-6 Q7', 'generator', 'A', { gen: 6 }),
    A('IDC1_A_K1GRID_KDP1_Q33', 'IDC1 A Kat-1 Şebeke Kat Dağıtım Panosu-1 Q33', 'grid', 'A', { load: 'it', floor: 1, part: 0.52 }),
    A('IDC1_A_K1GRID_KDP2_Q30', 'IDC1 A Kat-1 Şebeke Kat Dağıtım Panosu-2 Q30', 'grid', 'A', { load: 'it', floor: 1, part: 0.48 }),
    A('IDC1_A_K2GRID_KDP1_Q34', 'IDC1 A Kat-2 Şebeke Kat Dağıtım Panosu-1 Q34', 'grid', 'A', { load: 'it', floor: 2, part: 0.51 }),
    A('IDC1_A_K2GRID_KDP2_Q35', 'IDC1 A Kat-2 Şebeke Kat Dağıtım Panosu-2 Q35', 'grid', 'A', { load: 'it', floor: 2, part: 0.49 }),
    A('IDC1_A_K3GRID_KDP1_Q36', 'IDC1 A Kat-3 Şebeke Kat Dağıtım Panosu-1 Q36', 'grid', 'A', { load: 'it', floor: 3, part: 0.53 }),
    A('IDC1_A_K3GRID_KDP2_Q37', 'IDC1 A Kat-3 Şebeke Kat Dağıtım Panosu-2 Q37', 'grid', 'A', { load: 'it', floor: 3, part: 0.47 }),
    A('IDC1_A_KUPLAJSALTERI1_Q22', 'IDC1 A Kuplaj Şalteri-1 Q22', 'breaker', 'A', { open: true }),
    A('IDC1_A_KUPLAJSALTERI2_Q21', 'IDC1 A Kuplaj Şalteri-2 Q21', 'breaker', 'A', { open: true }),
    A('IDC1_A_Q44', 'IDC1 A Q44', '', 'A', { fixedKw: 24.6 }),
    A('IDC1_A_REDRESOR_Q45', 'IDC1 A Redresör Q45', 'rectifier', 'A', { rect: true }),
    A('IDC1_A_SYCIKISSALTER1_Q11', 'IDC1 A Senkron Yük Çıkış Şalteri-1 Q11', 'breaker', 'A', { sideShare: 0.52 }),
    A('IDC1_A_SYCIKISSALTER2_Q12', 'IDC1 A Senkron Yük Çıkış Şalteri-2 Q12', 'breaker', 'A', { sideShare: 0.48 }),
    A('IDC1_A_TRF1KOMP_Q15', 'IDC1 A Trafo 1 Kompanzasyon Q15', 'compensation', 'A', { comp: 'IDC1_A_TRAFO3_Q1' }),
    A('IDC1_A_TRAFO1KOMP_Q146', 'IDC1 A Trafo-1 Kompanzasyon Q146', 'compensation', 'A', { comp: 'IDC1_A_TRAFO4_Q2' }),
    A('IDC1_A_TRAFO3_Q1', 'IDC1 A Trafo-3 Q1', 'transformer', 'A', { trShare: 0.51 }),
    A('IDC1_A_TRAFO4_Q2', 'IDC1 A Trafo-4 Q2', 'transformer', 'A', { trShare: 0.49 }),
    A('IDC1_A_YGSALTER1_Q18', 'IDC1 A Yük Giriş Şalteri-1 Q18', 'breaker', 'A', { sideShare: 0.515 }),
    A('IDC1_A_YGSALTER2_Q17', 'IDC1 A Yük Giriş Şalteri-2 Q17', 'breaker', 'A', { sideShare: 0.475 }),
    // B tarafı
    A('IDC1_B_GEN1_Q8', 'IDC1 B Jeneratör-1 Q8', 'generator', 'B', { gen: 1 }),
    A('IDC1_B_GEN2_Q10', 'IDC1 B Jeneratör-2 Q10', 'generator', 'B', { gen: 2 }),
    A('IDC1_B_GEN3_Q9', 'IDC1 B Jeneratör-3 Q9', 'generator', 'B', { gen: 3 }),
    A('IDC1_B_TRAFO1_Q3', 'IDC1 B Trafo-1 Q3', 'transformer', 'B', { trShare: 0.505 }),
    A('IDC1_B_TRAFO2_Q4', 'IDC1 B Trafo-2 Q4', 'transformer', 'B', { trShare: 0.495 }),
    A('IDC1_B_TRAFO1KOMP_Q16', 'IDC1 B Trafo-1 Kompanzasyon Q16', 'compensation', 'B', { comp: 'IDC1_B_TRAFO1_Q3' }),
    A('IDC1_B_TRAFO2KOMP_Q145', 'IDC1 B Trafo-2 Kompanzasyon Q145', 'compensation', 'B', { comp: 'IDC1_B_TRAFO2_Q4' }),
    A('IDC1_B_ORTAKYC1_Q13', 'IDC1 B Ortak Yük Çıkış-1 Q13', 'common_load', 'B', { sideShare: 0.49 }),
    A('IDC1_B_ORTAKYC2_Q14', 'IDC1 B Ortak Yük Çıkış-2 Q14', 'common_load', 'B', { sideShare: 0.495 }),
    A('IDC1_B_OYGIRISI1_Q23', 'IDC1 B Ortak Yük Girişi-1 Q23', 'common_load', 'B', { sideShare: 0.5 }),
    A('IDC1_B_OYGIRISI2_Q24', 'IDC1 B Ortak Yük Girişi-2 Q24', 'common_load', 'B', { sideShare: 0.5 }),
    A('IDC1_B_K1GRID_KDP1_Q90', 'IDC1 B Kat-1 Şebeke Kat Dağıtım Panosu-1 Q90', 'grid', 'B', { load: 'it', floor: 1, part: 0.5 }),
    A('IDC1_B_K1GRID_KDP2_Q91', 'IDC1 B Kat-1 Şebeke Kat Dağıtım Panosu-2 Q91', 'grid', 'B', { load: 'it', floor: 1, part: 0.5 }),
    A('IDC1_B_K2GRID_KDP1_Q96', 'IDC1 B Kat-2 Şebeke Kat Dağıtım Panosu-1 Q96', 'grid', 'B', { load: 'it', floor: 2, part: 0.52 }),
    A('IDC1_B_K2GRID_KDP2_Q95', 'IDC1 B Kat-2 Şebeke Kat Dağıtım Panosu-2 Q95', 'grid', 'B', { load: 'it', floor: 2, part: 0.48 }),
    A('IDC1_B_K3GRID_KDP1_Q94', 'IDC1 B Kat-3 Şebeke Kat Dağıtım Panosu-1 Q94', 'grid', 'B', { load: 'it', floor: 3, part: 0.5 }),
    A('IDC1_B_K3GRID_KDP2_Q88', 'IDC1 B Kat-3 Şebeke Kat Dağıtım Panosu-2 Q88', 'grid', 'B', { load: 'it', floor: 3, part: 0.5 }),
    A('IDC1_B_CHILLER1_Q89', 'IDC1 B Chiller-1 Q89', 'chiller', 'B', { load: 'cooling', coolShare: 0.74 }),
    A('IDC1_B_Q102', 'IDC1 B Q102', '', 'B', { load: 'cooling', coolShare: 0.26 }),
    A('IDC1_B_Q104', 'IDC1 B Q104', '', 'B', { fixedKw: 31.2 }),
    // IDC4 beslemesi (IDC1 A dağıtımından)
    A('IDC1_A_IDC4_GRID_Q38', 'IDC4 Şebeke Besleme Q38', 'grid', 'A', { loc: 'IDC4', fixedKw: 212.4 })
  ];
  const BY_ID = new Map(analyzers.map(a => [a.id, a]));

  // Kat-2 / Kat-3 BT yükü (yalnız analizörden bilinir; Kat-1 UPS giriş güçlerinden türetilir)
  const FLOOR_BASE = { 2: { A: 236.4, B: 241.8 }, 3: { A: 158.2, B: 151.6 } };
  const COOL_RATIO = 0.29;

  // Kat-1 A/B BT yükü = UPS giriş güçleri (akü modundaki UPS şebekeden çekmez; SNMP kaybı analizörü etkilemez)
  function kat1Kw(tick) {
    const out = { A: 0, B: 0 };
    E.ups(tick).forEach(u => {
      const side = u.code.charAt(0);
      if (u.mode === 'battery') return;
      const load = u.load == null ? 55 : u.load;
      out[side] += load * 0.8 / 0.955;
    });
    return out;
  }

  // Alarmla "veri yok" işaretli analizörler (tek hat demo alarmları) değer vermez
  const DEV_NORM = s => String(s || '').toUpperCase().replace(/_DV$/, '');
  const slAlarms = () => (D.pmsSingleLine && Array.isArray(D.pmsSingleLine.demoAlarms) ? D.pmsSingleLine.demoAlarms : []);
  const metersOf = a => {
    const dev = DEV_NORM(a.devId || a.rid), rid = String(a.rid || '').toUpperCase();
    return analyzers.filter(m => dev === m.id || dev.indexOf(m.id + '_') === 0 || rid.indexOf(m.id) === 0).map(m => m.id);
  };
  function lostMeterIds() {
    const ids = new Set();
    slAlarms().filter(a => a.severity === 'veri-yok' || a.severity === 'kayip').forEach(a => metersOf(a).forEach(id => ids.add(id)));
    return ids;
  }
  // Kesici açması (TRIP): çıkış enerjisiz; 2N beslemede yük aynı kattaki öbür taraf panosuna geçer
  function trippedMeterIds() {
    const ids = new Set();
    slAlarms().filter(a => /TRIP/i.test(a.rid || '') || /TRIP/i.test(a.title || '')).forEach(a => metersOf(a).forEach(id => ids.add(id)));
    return ids;
  }
  const pairOf = m => {
    const k = /K(\d)GRID_KDP(\d)/.exec(m.id);
    if (!k) return null;
    const other = m.feed === 'A' ? 'B' : 'A';
    return analyzers.find(x => x.load === 'it' && x.feed === other && x.floor === m.floor && new RegExp('K' + k[1] + 'GRID_KDP' + k[2]).test(x.id)) || null;
  };

  // Bir analizörün elektriksel değerleri (kW, PF ve gerilimden faz akımları türetilir)
  function electrical(m, kw, pf, tick, opts) {
    const o = opts || {};
    const vln = (m.feed === 'A' ? 231.2 : 230.6) + fixed(m.id + 'v', -1.2, 1.2) + jit(m.id + 'v', tick, 0.35);
    const freq = 50 + jit('pms-grid-freq', tick, 0.02);
    let ia = 0, ib = 0, ic = 0;
    if (o.current != null) {
      ia = o.current * (1 + fixed(m.id + 'ia', -0.04, 0.04));
      ib = o.current * (1 + fixed(m.id + 'ib', -0.04, 0.04));
      ic = o.current * (1 + fixed(m.id + 'ic', -0.04, 0.04));
    } else if (kw > 0) {
      const per = (kw * 1000) / (3 * vln * (pf || 1));
      ia = per * (1 + fixed(m.id + 'ia', -0.025, 0.025) + jit(m.id + 'ia', tick, 0.006));
      ib = per * (1 + fixed(m.id + 'ib', -0.025, 0.025) + jit(m.id + 'ib', tick, 0.006));
      ic = per * (1 + fixed(m.id + 'ic', -0.025, 0.025) + jit(m.id + 'ic', tick, 0.006));
    }
    const kva = pf ? kw / pf : (3 * vln * (ia + ib + ic) / 3) / 1000;
    const kvar = Math.sqrt(Math.max(0, kva * kva - kw * kw));
    return {
      kw, kva, kvar, pf, vln, vll: vln * Math.sqrt(3), freq: o.freq != null ? o.freq : freq,
      ia, ib, ic, curr: ia + ib + ic, loaded: true
    };
  }

  // ---------------------------------------------------------------------------
  // Anlık ölçümler (tüm analizörler)
  // ---------------------------------------------------------------------------
  function meters(tick) {
    tick = tick || 0;
    const res = {};
    const k1 = kat1Kw(tick);
    const sideIt = { A: 0, B: 0 };
    // 1) BT panoları (açan kesicinin yükü eş panoya aktarılır)
    const tripped = trippedMeterIds();
    const itKwOf = m => (m.floor === 1 ? k1[m.feed] : FLOOR_BASE[m.floor][m.feed]) * m.part * (1 + jit(m.id + 'kw', tick, 0.008));
    analyzers.filter(m => m.load === 'it').forEach(m => {
      if (tripped.has(m.id)) {
        res[m.id] = Object.assign(electrical(m, 0, null, tick, { current: 0 }), { kw: 0, kva: 0, kvar: 0, pf: null, vln: 0, vll: 0, freq: 0 });
        return;
      }
      let kw = itKwOf(m);
      analyzers.filter(x => tripped.has(x.id) && pairOf(x) === m).forEach(x => { kw += itKwOf(x); });
      sideIt[m.feed] += kw;
      res[m.id] = electrical(m, kw, 0.965 + fixed(m.id + 'pf', -0.01, 0.012) + jit(m.id + 'pf', tick, 0.002), tick);
    });
    const itKw = sideIt.A + sideIt.B;
    // 2) Soğutma
    const coolKw = itKw * COOL_RATIO * (1 + jit('pms-cool', tick, 0.01));
    analyzers.filter(m => m.load === 'cooling').forEach(m => {
      res[m.id] = electrical(m, coolKw * m.coolShare, 0.93 + jit(m.id + 'pf', tick, 0.004), tick);
    });
    // 3) Sabit yükler ve redresör girişi (48 V DC yük / %93 verim)
    const rect = E.rectifiers(tick);
    analyzers.filter(m => m.fixedKw || m.rect).forEach(m => {
      const kw = m.rect
        ? rect.reduce((s, r) => s + r.loadVoltage.value * r.outputCurrent.value, 0) / 1000 / 0.93
        : m.fixedKw * (1 + jit(m.id + 'kw', tick, 0.015));
      res[m.id] = electrical(m, kw, (m.rect ? 0.98 : 0.95) + jit(m.id + 'pf', tick, 0.003), tick);
    });
    // 4) Jeneratörler: A kolu haftalık yüksüz test (uyartım + yardımcılar), B kolu otomatikte hazır (0)
    analyzers.filter(m => m.meterOf === 'generator').forEach(m => {
      if (m.feed === 'A') {
        const kw = 1.9 + fixed(m.id + 'kw', -0.4, 0.5) + jit(m.id + 'kw', tick, 0.12);
        const e = electrical(m, kw, 0.33 + jit(m.id + 'pf', tick, 0.01), tick, { freq: 50 + jit(m.id + 'f', tick, 0.05) });
        e.vln = 230.4 + jit(m.id + 'gv', tick, 0.8); e.vll = e.vln * Math.sqrt(3);
        res[m.id] = e;
      } else {
        res[m.id] = { kw: 0, kva: 0, kvar: 0, pf: 0, vln: 0, vll: 0, freq: 0, ia: 0, ib: 0, ic: 0, curr: 0, loaded: true };
      }
    });
    const genKw = analyzers.filter(m => m.meterOf === 'generator').reduce((s, m) => s + res[m.id].kw, 0);
    // 5) Tesis girişi = BT × PUE; trafolar tesis girişini besleme payıyla taşır (jeneratör testi tesise vermez)
    const pueNow = TARGET_PUE + jit('pms-pue', tick, 0.006);
    const facilityKw = itKw * pueNow;
    const trafoKw = Math.max(0, facilityKw - genKw);
    const shareA = sideIt.A / itKw;
    const sideTot = { A: trafoKw * shareA, B: trafoKw * (1 - shareA) };
    analyzers.filter(m => m.meterOf === 'transformer').forEach(m => {
      res[m.id] = electrical(m, sideTot[m.feed] * m.trShare * (1 + jit(m.id + 'kw', tick, 0.004)), 0.97 + jit(m.id + 'pf', tick, 0.003), tick);
    });
    // 6) Kompanzasyon rölesi: bağlı olduğu trafonun şebeke değerlerini (düzeltilmiş cos φ) okur
    analyzers.filter(m => m.comp).forEach(m => {
      const t = res[m.comp];
      res[m.id] = electrical(m, t.kw * (1 + jit(m.id + 'kw', tick, 0.002)), 0.986 + jit(m.id + 'pf', tick, 0.003), tick);
    });
    // 7) Senkron/ortak yük şalterleri (taraf toplamının payı), kuplaj şalterleri açık (akım yok)
    analyzers.filter(m => m.sideShare).forEach(m => {
      res[m.id] = electrical(m, sideTot[m.feed] * m.sideShare * (1 + jit(m.id + 'kw', tick, 0.005)), 0.968 + jit(m.id + 'pf', tick, 0.003), tick);
    });
    analyzers.filter(m => m.open).forEach(m => {
      res[m.id] = Object.assign(electrical(m, 0, null, tick, { current: 0 }), { kw: 0, kva: 0, kvar: 0, pf: null });
    });
    // 8) Veri yok
    lostMeterIds().forEach(id => {
      res[id] = { kw: null, kva: null, kvar: null, pf: null, vln: null, vll: null, freq: null, ia: null, ib: null, ic: null, curr: null, loaded: false };
    });
    Object.defineProperty(res, '_sum', { value: { itKw, sideIt, coolKw, genKw, facilityKw, trafoKw, pueNow }, enumerable: false });
    return res;
  }

  // ---------------------------------------------------------------------------
  // KPI (pms-dashboard refresh() karşılığı)
  // ---------------------------------------------------------------------------
  function kpi(tick) {
    const m = meters(tick);
    const sum = (filter, key) => {
      const vals = analyzers.filter(filter).map(a => m[a.id][key]).filter(v => v != null);
      return vals.length ? vals.reduce((x, y) => x + y, 0) : null;
    };
    const itKw = sum(a => a.load === 'it', 'kw');
    const coolingKw = sum(a => a.load === 'cooling', 'kw');
    const trafoKva = sum(a => a.meterOf === 'transformer', 'kva');
    const trKw = sum(a => a.meterOf === 'transformer', 'kw');
    const genKw = sum(a => a.meterOf === 'generator', 'kw');
    const facilityKw = trKw == null ? null : trKw + (genKw || 0);
    return {
      itKw, coolingKw, trafoKva, facilityKw,
      pue: itKw ? facilityKw / itKw : 0,
      upsCount: E.upsCodes.length,
      feedA: sum(a => a.load === 'it' && a.feed === 'A', 'kw'),
      feedB: sum(a => a.load === 'it' && a.feed === 'B', 'kw'),
      meters: m
    };
  }

  // Kaynaklar ve dağıtım (refreshSources: grid → transformer → generator, ad sırası; göreli yük aynı türün en büyüğüne göre)
  const KIND_ORDER = { grid: 0, transformer: 1, generator: 2 };
  function sources(tick, metersSnap) {
    const m = metersSnap || meters(tick);
    const cards = analyzers.filter(a => KIND_ORDER[a.meterOf] != null).map(a => {
      const v = m[a.id];
      return { id: a.id, title: a.title, kind: a.meterOf, feed: a.feed, kw: v.kw, kva: v.kva, pf: v.pf, volt: v.vln, curr: v.curr, loaded: v.loaded, rel: null };
    });
    cards.sort((x, y) => KIND_ORDER[x.kind] - KIND_ORDER[y.kind] || x.title.localeCompare(y.title, 'tr', { numeric: true }));
    const load = c => (c.kw != null ? c.kw : c.kva);
    const max = { grid: 0, transformer: 0, generator: 0 };
    cards.forEach(c => { const v = load(c); if (v != null && v > max[c.kind]) max[c.kind] = v; });
    cards.forEach(c => { const v = load(c); c.rel = v == null ? null : max[c.kind] > 0 ? Math.max(0, v / max[c.kind] * 100) : 0; });
    return cards;
  }

  // ---------------------------------------------------------------------------
  // Tablo şemaları (energy-table-dashboard TableData; hücre "role" alanı KPI hesabı içindir)
  // ---------------------------------------------------------------------------
  const STA = { NORMAL: '0x0303', LOST: '0x0301' };
  const GEN_ROWS = [
    { label: 'FREKANS', role: 'hz', unit: 'Hz', d: 2, get: v => v.freq },
    { label: 'TOPLAM GÜÇ FAKTÖRÜ', role: 'pf', unit: '-', d: 2, get: v => v.pf },
    { label: 'TOPLAM AKTİF GÜÇ', role: 'kw', unit: 'kW', d: 2, get: v => v.kw },
    { label: 'TOPLAM REAKTİF GÜÇ', role: 'kvar', unit: 'kVAr', d: 2, get: v => v.kvar },
    { label: 'TOPLAM GÖRÜNÜR GÜÇ', role: 'kva', unit: 'kVA', d: 2, get: v => v.kva },
    { label: 'L1-N GERİLİMİ', role: 'vln', unit: 'V', d: 1, get: (v, k) => ph(v.vln, k, 'n1') },
    { label: 'L2-N GERİLİMİ', role: 'vln', unit: 'V', d: 1, get: (v, k) => ph(v.vln, k, 'n2') },
    { label: 'L3-N GERİLİMİ', role: 'vln', unit: 'V', d: 1, get: (v, k) => ph(v.vln, k, 'n3') },
    { label: 'L1-L2 GERİLİMİ', role: 'vll', unit: 'V', d: 1, get: (v, k) => ph(v.vll, k, 'l12') },
    { label: 'L2-L3 GERİLİMİ', role: 'vll', unit: 'V', d: 1, get: (v, k) => ph(v.vll, k, 'l23') },
    { label: 'L3-L1 GERİLİMİ', role: 'vll', unit: 'V', d: 1, get: (v, k) => ph(v.vll, k, 'l31') },
    { label: 'ORTALAMA FAZ VOLTAJI', role: 'vln-avg', unit: 'V', d: 1, get: v => v.vln },
    { label: 'ORTALAMA HAT VOLTAJI', role: 'vll-avg', unit: 'V', d: 1, get: v => v.vll },
    { label: 'L1 AKIMI', role: 'ia', unit: 'A', d: 1, get: v => v.ia },
    { label: 'L2 AKIMI', role: 'ib', unit: 'A', d: 1, get: v => v.ib },
    { label: 'L3 AKIMI', role: 'ic', unit: 'A', d: 1, get: v => v.ic }
  ];
  const ph = (v, key, p) => (v == null ? null : v === 0 ? 0 : v * (1 + fixed(key + p, -0.004, 0.004)));
  const cellOf = (val, unit, d, lost) => (lost || val == null
    ? { value: '-', unit, sta: STA.LOST }
    : { value: d === 2 ? r2(val) : r1(val), unit, sta: STA.NORMAL });

  const GEN_COLS = {
    A: [['GEN4', 'IDC1_A_GEN4_Q5'], ['GEN5', 'IDC1_A_GEN5_Q6'], ['GEN6', 'IDC1_A_GEN6_Q7']],
    B: [['GEN1', 'IDC1_B_GEN1_Q8'], ['GEN2', 'IDC1_B_GEN2_Q10'], ['GEN3', 'IDC1_B_GEN3_Q9']]
  };
  const GEN_PAGE = {
    A: { sch: 'EN0101010400000000', title: 'A Tarafı Jeneratör Değerleri', table: 'A TARAFI GEN. DEĞERLERİ', note: 'GEN4–GEN6 · Haftalık yüksüz test çalışması · ATS şebekede (tesise güç verilmiyor)', running: true },
    B: { sch: 'EN0101010400000000b', title: 'B Tarafı Jeneratör Değerleri', table: 'B TARAFI GEN. DEĞERLERİ', note: 'GEN1–GEN3 · Otomatikte hazır · Blok ısıtıcı aktif · ATS şebekede', running: false }
  };
  function generatorTable(side, tick, metersSnap) {
    const m = metersSnap || meters(tick);
    const cols = GEN_COLS[side];
    return {
      title: GEN_PAGE[side].table,
      note: GEN_PAGE[side].note,
      headers: [{ title: 'Parametre', devId: 'param_label' }].concat(cols.map(c => ({ title: c[0], devId: c[1] }))),
      rows: GEN_ROWS.map(r => ({
        id: r.label,
        cells: [{ value: r.label, unit: '' }].concat(cols.map(c => {
          const v = m[c[1]];
          return Object.assign(cellOf(v.loaded ? r.get(v, c[1]) : null, r.unit, r.d, !v.loaded), { role: r.role, dev: c[1] });
        }))
      }))
    };
  }

  const COMP_TABLES = [['A - Q15', 'IDC1_A_TRF1KOMP_Q15'], ['A - Q146', 'IDC1_A_TRAFO1KOMP_Q146'], ['B - Q16', 'IDC1_B_TRAFO1KOMP_Q16'], ['B - Q145', 'IDC1_B_TRAFO2KOMP_Q145']];
  const COMP_ROWS = [
    { label: 'Toplam Aktif Güç', role: 'kw', unit: 'kW', d: 1, get: v => v.kw },
    { label: 'Faz A Akımı', role: 'ia', unit: 'A', d: 1, get: v => v.ia },
    { label: 'Faz B Akımı', role: 'ib', unit: 'A', d: 1, get: v => v.ib },
    { label: 'Faz C Akımı', role: 'ic', unit: 'A', d: 1, get: v => v.ic },
    { label: 'Ortalama Hat Voltajı', role: 'vll-avg', unit: 'V', d: 1, get: v => v.vll },
    { label: 'Ortalama Faz Voltajı', role: 'vln-avg', unit: 'V', d: 1, get: v => v.vln },
    { label: 'Frekans', role: 'hz', unit: 'Hz', d: 2, get: v => v.freq },
    { label: 'Toplam Güç Faktörü', role: 'pf', unit: 'cos φ', d: 2, get: v => v.pf }
  ];
  function compensationTables(tick, metersSnap) {
    const m = metersSnap || meters(tick);
    return COMP_TABLES.map(t => {
      const v = m[t[1]];
      return {
        title: t[0],
        headers: [{ title: 'AÇIKLAMA', devId: 'param_label' }, { title: 'DEĞER', devId: 'value' }],
        rows: COMP_ROWS.map(r => ({ id: r.label, cells: [{ value: r.label, unit: '' }, Object.assign(cellOf(v.loaded ? r.get(v) : null, r.unit, r.d, !v.loaded), { role: r.role, dev: t[1] })] }))
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Güç alarmları (CMA_List grp=power karşılığı) — iki kaynak tek biçime getirilir
  //   sev: acil | alarm | uyari | kayip (alarm-severity.util)
  // ---------------------------------------------------------------------------
  const PRES_SEV = a => (a.level === 'lost' ? 'kayip' : a.level === 'warning' ? 'uyari' : a.severity === 'critical' ? 'acil' : 'alarm');
  const SL_SEV = s => (s === 'veri-yok' ? 'kayip' : s === 'acil' || s === 'alarm' || s === 'uyari' || s === 'kayip' ? s : 'alarm');
  const isPowerAlarm = a => a.grp === 'Enerji Grubu' || /_PDU_[AB]_/.test(a.rid || '');
  function powerAlarms() {
    const list = [];
    (D.activeAlarms || []).filter(isPowerAlarm).forEach(a => {
      const devId = String(a.rid).replace(/_[A-Z0-9]+$/, '');
      const cabM = a.deviceType === 'cabinet' && a.target ? a.target : '';
      const upsM = a.deviceType === 'ups' ? String(a.target || '').replace(/^UPS\s*/i, '') : '';
      list.push({
        key: 'P:' + a.rid, rid: a.rid, devId, schemaId: null, sev: PRES_SEV(a),
        title: a.desc, text: a.txt, tim: a.tim, acked: !!a.ack, ackBy: a.ack ? a.ack.user : '',
        floor: /^Kat 1/i.test(a.location || '') ? 'KAT-1' : '', cab: cabM, ups: upsM, location: a.location || ''
      });
    });
    const sl = D.pmsSingleLine && Array.isArray(D.pmsSingleLine.demoAlarms) ? D.pmsSingleLine.demoAlarms : [];
    sl.forEach((a, i) => {
      list.push({
        key: 'S:' + (a.rid || i), rid: a.rid || '', devId: a.devId || '', schemaId: a.schemaId || null, sev: SL_SEV(a.severity),
        title: a.title || a.devId || a.rid, text: a.text || '',
        tim: a.tim ? new Date(a.tim) : new Date(Date.now() - (a.minutesAgo != null ? a.minutesAgo : 9 + i * 13) * 60000),
        acked: !!a.ack, ackBy: '', floor: '', cab: '', ups: '', location: 'Enerji odası (fiziksel konum tanımsız)'
      });
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // UPS düğüm/sayfa adları (ENERGY_List_static + SCH page_title kalıbı)
  // ---------------------------------------------------------------------------
  function upsInfo(code) {
    const side = code.charAt(0);
    const n = parseInt(code.slice(1), 10) || 1;
    const room = side === 'A' ? 'A UPS ODASI' : 'B UPS Odası';
    const ip = '10.6.126.' + ((side === 'A' ? 229 : 239) + n);
    return { node: side + ' UPS - ' + n, title: room + ' ' + n + ' Nolu Modül | Huawei UPS 5000E | ' + ip, sch: 'EN01010106' + (side === 'A' ? n : n + 7).toString(16).toUpperCase().padStart(2, '0') + '000000' };
  }

  // ---------------------------------------------------------------------------
  // Metinler (pms-dashboard.component.html / .ts — değiştirilmedi)
  // ---------------------------------------------------------------------------
  const standards = {
    pue: { title: 'Enerji verimliliği · ISO/IEC 30134-2 / EN 50600-4-2', text: 'Üç ölçüm kategorisi: PUE1 UPS çıkışı, PUE2 PDU, PUE3 sunucu girişi. Mevcut hesabın kategorisi henüz belirlenmedi.' },
    tier: { title: 'Yedeklilik · EN 50600-2-2 / TIA-942 / Uptime Tier', text: 'Tier III "eşzamanlı bakım yapılabilir", Tier IV buna hata toleransı ekler. Ekranda Rated/Tier etiketi verilmez (sertifika iddiası gibi okunur).' },
    quality: { title: 'Güç kalitesi · IEEE 519-2022 / IEC 61000-4-30', text: 'Harmonik sınırları PCC noktasında uygulanır; dip/swell yarım periyot düzeyinde bir olaydır, 30 sn yoklamayla yakalanamaz. THD bugün okunmuyor.' },
    alarm: { title: 'Alarm yükü · ANSI/ISA-18.2 / EEMUA 191', text: 'ISA-18.2 alarm yönetimini yaşam döngüsü olarak tanımlar; EEMUA 191 hedef azami alarm oranlarını ele alır. Oran eşiği tanımlanmadığı için eşiksiz gösterilir.' },
    source: 'Kaynak: docs/arge-bms/02-claude/pms/02-kavram-standart.md, 04-sentez/pms/literatur-raporu.md, 04-sentez/pms/secenekler-karar.md'
  };

  const dataSources = [
    { component: 'BT yükü (kW)', state: 'Canlı', source: "XDB //dev[@load='it']//io[@io_role='pow_tot']" },
    { component: 'Soğutma yükü (kW)', state: 'Canlı', source: "XDB //dev[@load='cooling']//io[@io_role='pow_tot']" },
    { component: 'Trafo yükü (kVA)', state: 'Canlı', source: "XDB meter_of='transformer' io_role='apow' io_pos='total'" },
    { component: 'PUE', state: 'Canlı', source: "XDB io_role='pue' (sunucu calculatePUE, 15 dk)" },
    { component: 'UPS modül sayısı', state: 'Canlı', source: "XDB //dev[@dev_type='ups']" },
    { component: 'Kaynak kartları (trafo/jeneratör/şebeke)', state: 'Canlı', source: "XDB dev_type='meter' meter_of; io_role pow_tot/apow/pf/volt_ln/curr" },
    { component: 'A/B besleme dengesi', state: 'Canlı', source: "XDB //dev[@load='it' and @feed='A'|'B']//io[@io_role='pow_tot']" },
    { component: 'Güç alarmları', state: 'Canlı', source: 'CMA_List (grp=power), alarm-severity.util' },
    { component: 'Yük dağılımı halkası', state: 'Türetilmiş', source: 'BT + soğutma canlı; Diğer = tesis girişi − BT − soğutma. Tesis girişi = trafo + jeneratör pow_tot (trafo yoksa şebeke + jeneratör). Türetilemezse (giriş yok / negatif) yalnız BT + soğutma' },
    { component: 'PUE göstergesi', state: 'Canlı', source: "io_role='pue' (sunucu, 15 dk). Ölçek 1,0–3,0; eşik / renk bandı yok (araştırma belgelerinde tanımlı değil)" },
    { component: 'A/B dengesi halkası', state: 'Türetilmiş', source: 'A% = A / (A + B), feed A/B BT panoları pow_tot; ortada fark (yüzde puan)' },
    { component: 'Güç alarmları önem halkası', state: 'Canlı', source: 'CMA_List (grp=power); Acil/Alarm/Uyarı/Kayıp (veri yok), SEVERITY_COLOR' },
    { component: 'Kaynak kartı yük halkaları', state: 'Türetilmiş', source: 'Göreli: kW (yoksa kVA) / aynı türdeki en büyük değer. Anma kapasitesi okunmuyor; % doluluk değildir' },
    { component: 'KPI eğrileri (sparkline)', state: 'Türetilmiş', source: 'Son 30 okuma, 10 sn periyot; yalnız tarayıcı belleğinde (sayfa kapanınca silinir)' },
    { component: 'PMS ↔ BMS geçişi — URL parametreleri', state: 'Gezinme', source: 'PMS→BMS: /dcim/showcase/bms?alarm=<CMA_List öğe id>&dev=<alarm rid ya da cihaz id>&floor=<SITE_Floors id>&from=pms; kat: alarmın/cihazın doc\'u bir katın fac_doc/pdu_doc\'una eşitse. BMS→PMS: /dcim/energy/scada-energy?alarm=&dev=&from=bms (tek hat sayfası açılır, bulunamazsa bilgi bandı)' },
    { component: 'Alarm işareti — alarm rid → tek hat öğesi devId eşlemesi', state: 'Canlı', source: 'CMA_List rid (kaynak nokta) → SCH sch_map dev_id/auxDevId (önek eşleşmesi, en uzun) → tek hat öğesi devId (büyük/küçük harf duyarsız, _DV eki yok sayılır); önem alarm-severity.util, metin desc||txt, zaman tim' },
    { component: 'Güç kalitesi (THD, dip/swell)', state: 'Yok', source: 'Ölçüm yok — sonraki faz (IEEE 519 / IEC 61000-4-30)' },
    { component: 'Standart kartları', state: 'Canlı', source: 'Metin: docs/arge-bms PMS belgeleri; değerler yukarıdaki canlı ölçümler' }
  ];

  D.pms = {
    TICK_SEC,
    analyzers,
    byId: id => BY_ID.get(id) || null,
    meters,
    kpi,
    sources,
    generatorTable,
    genPage: side => GEN_PAGE[side === 'B' ? 'B' : 'A'],
    compensationTables,
    compPage: { sch: 'EN0101010300000000', title: 'Kompanzasyon Sistemleri', tablesPerRow: 2 },
    powerAlarms,
    upsInfo,
    standards,
    dataSources
  };
})();
