/* ==========================================================================
   DCIM Sunum — Kabin Anomali mock verisi (DCIM.data.cabinAnomaly) — cabin-anomaly.html
   Orijinal: new-ui/pages/analytics/cabin-anomaly (CabinAnomalyComponent + anomaly-floor-3d + ups-panel)
   Kaynakların karşılığı:
     - Canlı (motor belleği): doc(CMR/T0x)/json(//io[cabin_temp|cabin_hum]) → val, sta, anm, anm_typ, anm_trend, anm_kc,
       val_alm_onlhi_wrn/alm  →  live(floorId)
     - Geçmiş (api.HIS_Cabin saatlik HSH) + tarayıcıda anomali hesabı → cabinHistory(floorId, cab, start, end)
     - UPS panosu girişleri (_GIR1/_GIR2) + UPS modülleri (batarya akımı) → upsLive / upsHistory
   Tüm değerler KURGUSAL ve tohumludur (DCIM.data.rng). Kat yerleşimi js/layout-data.js'ten (kurgusal bina).
   Senaryo (kat 1, tüm sayfalarla tutarlı):
     1DU06  Sıçrama (↯)  üst + orta, ~3 sa önce başladı, sürüyor — bağlam: Ortam (nem düştü)
     1DA07  Sapma (~)    orta, ~10 sa'lik yükseliş, sürüyor — Ortam
     1DS07  Sapma (~)    orta, sürüyor — Belirsiz
     1DL01  Sapma (~)    üst sürüyor + dün 5 sa'lik Çelişki (⇅: alt sensör üstten sıcak), bitti
     1DP02  Sapma (~)    üç sensör aşağı (düşük sıcaklık), nem değişmedi — Sensör şüphesi
     1DN05  Sıçrama (↯)  nem %53 → %62, sürüyor — Ortam
     1DM03  Sıçrama (↯)  orta sensörde tek saatlik sıçrama, ardından 34 dk'dır haberleşme kaybı (gri bant) — Sensör şüphesi
     1DE04  kalıcı çelişki (K, anomali değil) · 1DR05 / 1DC02 hızlı ısınma, 1DG03 hızlı soğuma (izle oku)
     UPS A2 yük değişimi (anomali, sürüyor) · UPS B3 şebeke normalken batarya kullanımı (anomali, 2 gün önce)
     UPS A5 giriş gerilimi yok + şebeke olayı (bilgi: akü modunda) · UPS B7 veri yok (SNMP kaybı)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const ANM_DEV = 1, ANM_JUMP = 2, ANM_CONTRA = 4;
  const UPS_JUMP = 2, UPS_BATT = 8, UPS_NOINPUT = 16, UPS_GRID = 32;
  const H = 3600000, MIN = 60000, DAY = 86400000;
  const POS = ['top', 'mid', 'bot'];
  const TEMP_WRN = 27, TEMP_ALM = 32, HUM_WRN = 60, HUM_ALM = 70;
  const NOW = Date.now();
  const rngOf = key => D.rng(D.hash(String(key)));
  const round2 = v => Math.round(v * 100) / 100;

  const FLOORS = (D.floors || []).map(f => ({ id: f.id, digit: f.digit, name: f.label, doc: 'CMR/' + f.id }));
  const floorOf = id => FLOORS.find(f => f.id === id) || FLOORS[0];
  const cabinetsOf = f => (f.digit === 1 ? D.cabinets : D.getLockFloor(f.id).map(c => c.cabinet));

  // ---------------------------------------------------------------------------
  // Olay tanımları: t0 / t1 = şimdiden kaç saat önce başladı / bitti (t1 null: sürüyor)
  // shape: 'step' (sıçrama), 'ramp' (sapma), 'contra' (alt sensör üstü geçer), 'spike' (tek saatlik)
  // ---------------------------------------------------------------------------
  const F1_EVENTS = {
    '1DU06': [{ pos: ['top', 'mid'], typ: ANM_JUMP, shape: 'step', amp: 4.6, t0: 3, t1: null, ctx: 'ambient', hum: -4 }],
    '1DA07': [{ pos: ['mid'], typ: ANM_DEV, shape: 'ramp', amp: 3.1, t0: 10, t1: null, ctx: 'ambient', hum: -3 }],
    '1DS07': [{ pos: ['mid'], typ: ANM_DEV, shape: 'ramp', amp: 2.2, t0: 6, t1: null, ctx: 'unclear' }],
    '1DL01': [
      { pos: ['top'], typ: ANM_DEV, shape: 'ramp', amp: 2.4, t0: 5, t1: null, ctx: 'ambient', hum: -2 },
      { pos: ['bot'], typ: ANM_CONTRA, shape: 'contra', amp: 4.4, t0: 30, t1: 25, ctx: 'unclear' }
    ],
    '1DP02': [{ pos: ['top', 'mid', 'bot'], typ: ANM_DEV, shape: 'ramp', amp: -3.0, t0: 8, t1: null, ctx: 'sensor' }],
    '1DN05': [{ pos: ['hum'], typ: ANM_JUMP, shape: 'step', amp: 9, t0: 4, t1: null, ctx: 'ambient', mid: -0.6 }],
    '1DM03': [{ pos: ['mid'], typ: ANM_JUMP, shape: 'spike', amp: 5.2, t0: 3, t1: 2, ctx: 'sensor', live: true }]
  };
  const F1_EXTRA = {
    persistent: { '1DE04': { inv: true, mid: false } },
    trend: { '1DR05': { top: 1, mid: 1 }, '1DC02': { top: 1 }, '1DG03': { mid: -1, bot: -1 } },
    noSensor: ['1DB07', '1DK07', '1DT01']
  };
  // 1DM03: 34 dk önce haberleşme koptu (aktif alarm DCA_1DM03_SNS)
  const COMM_LOSS = { '1DM03': { start: NOW - 34 * MIN, end: null } };

  // Diğer katlar: tohumlu birkaç olay (her katta 3 anomali, 1 kalıcı çelişki, 2 izle oku, 2 sensörsüz kabin)
  const floorExtras = {};
  function extrasFor(f) {
    if (f.digit === 1) return { events: F1_EVENTS, extra: F1_EXTRA };
    if (floorExtras[f.id]) return floorExtras[f.id];
    const rnd = rngOf('ca-floor-' + f.id);
    const cabs = cabinetsOf(f).map(c => c.code);
    const take = () => cabs.splice(Math.floor(rnd() * cabs.length), 1)[0];
    const events = {};
    events[take()] = [{ pos: ['top', 'mid'], typ: ANM_JUMP, shape: 'step', amp: 4.2, t0: 2 + Math.round(rnd() * 5), t1: null, ctx: 'ambient', hum: -3 }];
    events[take()] = [{ pos: ['mid'], typ: ANM_DEV, shape: 'ramp', amp: 2.3, t0: 6 + Math.round(rnd() * 6), t1: null, ctx: 'unclear' }];
    events[take()] = [{ pos: ['bot'], typ: ANM_CONTRA, shape: 'contra', amp: 4.1, t0: 52, t1: 46, ctx: 'unclear' },
      { pos: ['hum'], typ: ANM_JUMP, shape: 'step', amp: 8.6, t0: 3, t1: null, ctx: 'ambient', mid: -0.5 }];
    const extra = { persistent: {}, trend: {}, noSensor: [take(), take()] };
    extra.persistent[take()] = { inv: false, mid: true };
    extra.trend[take()] = { top: 1 };
    extra.trend[take()] = { mid: -1 };
    floorExtras[f.id] = { events, extra };
    return floorExtras[f.id];
  }

  const ridOf = (code, pos) => 'DCA_' + code + (pos === 'hum' ? '_HUM_MID' : '_TEMP_' + pos.toUpperCase());

  // ---------------------------------------------------------------------------
  // Canlı: kattaki kabinler (CabinOption karşılığı)
  // ---------------------------------------------------------------------------
  const liveCache = {};
  function live(floorId) {
    const f = floorOf(floorId);
    if (liveCache[f.id]) return liveCache[f.id];
    const { events, extra } = extrasFor(f);
    const list = [];
    cabinetsOf(f).forEach(c => {
      if (extra.noSensor.indexOf(c.code) >= 0) return; // sensörü tanımlı değil (kat planında gri)
      const lost = c.status === 'lost';
      const evs = events[c.code] || [];
      const vals = { top: c.tempTop, mid: c.tempMid, bot: c.tempLow, hum: c.humidity };
      const kc = extra.persistent[c.code] || null;
      const tr = extra.trend[c.code] || {};
      const pt = pos => {
        // sürüyor olan (ya da canlıda işaretli kalan) olaylar anm = '1'
        const hits = evs.filter(e => e.pos.indexOf(pos) >= 0 && (e.t1 === null || e.live));
        return {
          id: ridOf(c.code, pos), pos, val: lost ? null : vals[pos], ok: !lost,
          anm: hits.length ? '1' : '0', anmTyp: hits.reduce((t, e) => t | e.typ, 0),
          trend: tr[pos] || 0,
          kc: kc && ((pos === 'mid' && kc.mid) || (pos !== 'mid' && pos !== 'hum' && kc.inv)) ? 1 : 0,
          wrn: pos === 'hum' ? HUM_WRN : TEMP_WRN, alm: pos === 'hum' ? HUM_ALM : TEMP_ALM
        };
      };
      const temps = {};
      POS.forEach(p => { temps[p] = pt(p); });
      list.push({ cab: c.code, pod: c.pod || '', temps, hum: pt('hum'), commLoss: COMM_LOSS[c.code] || null, cabinet: c });
    });
    liveCache[f.id] = list;
    return list;
  }

  // ---------------------------------------------------------------------------
  // Geçmiş (saatlik): tohumlu taban + günlük salınım + olay şekilleri; son nokta canlı değere oturur
  // ---------------------------------------------------------------------------
  function shapeAt(e, tHoursAgo) {
    const s = e.t0, en = e.t1 === null ? -1 : e.t1;
    if (tHoursAgo > s || tHoursAgo < en) return 0;
    const k = (s - tHoursAgo) / Math.max(1, s - Math.max(0, en));
    switch (e.shape) {
      case 'step': return e.amp;
      case 'ramp': return e.amp * Math.min(1, 0.25 + k);
      case 'contra': return e.amp * (0.6 + 0.4 * Math.sin(Math.PI * k));
      case 'spike': return tHoursAgo >= s - 1 ? e.amp : 0;
      default: return 0;
    }
  }

  function seriesFor(c, pos, start, end, evs) {
    const liveVal = pos === 'hum' ? c.cabinet.humidity : pos === 'top' ? c.cabinet.tempTop : pos === 'mid' ? c.cabinet.tempMid : c.cabinet.tempLow;
    const loss = c.commLoss;
    const until = Math.min(end, NOW);
    const t0 = Math.floor(start / H) * H;
    const rnd = rngOf('ca-his-' + c.cab + pos);
    const raw = [];
    let walk = 0;
    // olaylara göre taban: olay bitmemişse son değer olay genliğini içerir
    for (let t = t0 - 24 * H; t <= until; t += H) {
      walk = walk * 0.85 + (rnd() - 0.5) * (pos === 'hum' ? 0.9 : 0.22);
      const hr = new Date(t).getHours();
      const diurnal = (pos === 'hum' ? -0.8 : 0.32) * Math.sin(2 * Math.PI * (hr - 9) / 24);
      const ago = (NOW - t) / H;
      let ev = 0;
      evs.forEach(e => {
        if (e.pos.indexOf(pos) >= 0) ev += shapeAt(e, ago);
        // bağlam: sıcaklık olayında nem ters yönde (ortam), nem olayında orta sıcaklık
        if (pos === 'hum' && e.hum && e.pos.indexOf('hum') < 0) ev += (shapeAt(e, ago) / (e.amp || 1)) * e.hum;
        if (pos === 'mid' && e.mid && e.pos.indexOf('mid') < 0) ev += (shapeAt(e, ago) / (e.amp || 1)) * e.mid;
      });
      raw.push({ t, v: walk + diurnal + ev });
    }
    if (!raw.length) return [];
    // son ölçülen nokta canlı değere otursun (haberleşme kaybında kayıptan önceki son ölçüm)
    const lastOk = loss ? raw.filter(p => p.t < loss.start) : raw;
    const ref = lastOk.length ? lastOk[lastOk.length - 1].v : raw[raw.length - 1].v;
    const shift = liveVal - ref;
    return raw.map(p => ({ t: p.t, v: round2(p.v + shift) }))
      .filter(p => !loss || p.t < loss.start);
  }

  // Beklenen değer ve hata sapması (Holt benzeri sönümlü tahmin; ilk 24 sa ısınma)
  function score(pts, warmTs) {
    let m = null, s = 0.3;
    return pts.map(p => {
      const out = { t: p.t, v: p.v, m: null, s: undefined };
      if (m === null) m = p.v;
      else {
        if (p.t >= warmTs) { out.m = round2(m); out.s = s; }
        const err = p.v - m;
        s = Math.sqrt(0.95 * s * s + 0.05 * Math.max(0.04, err * err));
        s = Math.min(0.6, Math.max(0.18, s));
        m = m + 0.35 * err;
      }
      return out;
    });
  }

  function episodesFor(c, evs, start, end, series) {
    const rows = [];
    evs.forEach(e => {
      const s = NOW - e.t0 * H, en = e.t1 === null ? null : NOW - e.t1 * H;
      if (s > end || (en !== null && en < start)) return;
      e.pos.forEach(pos => {
        const sc = series[pos] || [];
        const inWin = sc.filter(p => p.t >= s - H && p.t <= (en === null ? NOW : en));
        const before = sc.filter(p => p.t < s - H);
        const baseline = before.length ? before[before.length - 1].v : (inWin[0] ? inWin[0].v : 0);
        const peak = inWin.reduce((b, p) => (Math.abs(p.v - baseline) > Math.abs(b - baseline) ? p.v : b), baseline);
        rows.push({
          start: Math.floor(s / H) * H, end: en === null ? null : Math.floor(en / H) * H,
          pos, rid: ridOf(c.cab, pos), typ: e.typ,
          peakValue: peak, baseline,
          peakZ: (peak - baseline) / (pos === 'hum' ? 0.9 : 0.42),
          ctx: e.typ & (ANM_DEV | ANM_JUMP) ? e.ctx : 'unclear'
        });
      });
    });
    return rows.sort((a, b) => b.start - a.start);
  }

  function cabinHistory(floorId, cabCode, start, end) {
    const f = floorOf(floorId);
    const c = live(f.id).find(x => x.cab === cabCode);
    if (!c) return null;
    const evs = (extrasFor(f).events[cabCode] || []);
    const raw = {};
    POS.concat(['hum']).forEach(pos => { raw[pos] = seriesFor(c, pos, start, end, evs); });
    const scored = {};
    POS.forEach(pos => { scored[pos] = score(raw[pos], start).filter(p => p.t >= start); });
    const scoredHum = score(raw.hum, start).filter(p => p.t >= start);
    const episodes = episodesFor(c, evs, start, end, raw);
    const loss = c.commLoss && c.commLoss.start <= end ? [{ start: c.commLoss.start, end: Math.min(end, NOW) }] : [];
    // kalıcı çelişki (anomali değil): seçili aralığın yarısından fazlası
    const ex = extrasFor(f).extra.persistent[cabCode] || null;
    return { scored, scoredHum, episodes, commLoss: loss, persistent: ex };
  }

  // Geçmiş harita: aralığın en yüksek sıcaklığı + aralıkla kesişen olaylar (günlük HSD + saatlik tarama)
  function mapHistory(floorId, start, end) {
    const f = floorOf(floorId);
    const evMap = extrasFor(f).events;
    const out = {};
    live(f.id).forEach(c => {
      const rnd = rngOf('ca-maph-' + c.cab + start);
      const evs = evMap[c.cab] || [];
      let max = Math.max(c.cabinet.tempTop, c.cabinet.tempMid, c.cabinet.tempLow) + 0.3 + rnd() * 0.6;
      let typ = 0;
      const pos = {};
      evs.forEach(e => {
        const s = NOW - e.t0 * H, en = e.t1 === null ? NOW : NOW - e.t1 * H;
        if (s <= end && en >= start) {
          typ |= e.typ;
          e.pos.forEach(p => { pos[p] = true; });
          if (e.amp > 0 && e.pos.indexOf('hum') < 0 && e.shape !== 'step') max = Math.max(max, c.cabinet.tempTop + (e.shape === 'contra' ? 0.4 : 0));
        }
      });
      // haberleşme kaybı olan kabinin de aralıkta ölçümü var (kayıptan önceki saatler)
      out[c.cab] = { max: Math.round(max * 10) / 10, anomaly: typ !== 0, anmTyp: typ, pos };
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // UPS panoları (kat planındaki UPS'ler) + UPS modülleri (batarya)
  // ---------------------------------------------------------------------------
  const UPS_SCENARIO = {
    'UPS A2': { live: UPS_JUMP, events: [{ input: 1, typ: UPS_JUMP, t0: 5, t1: null, rel: 0.38 }] },
    'UPS A5': { live: UPS_NOINPUT | UPS_GRID, noInput: 7 * MIN, events: [{ input: 1, typ: UPS_NOINPUT, t0: 0.12, t1: null }, { input: 2, typ: UPS_NOINPUT, t0: 0.12, t1: null }, { src: 'A-M2', typ: UPS_GRID, t0: 0.12, t1: null, crowd: 1 }] },
    'UPS B3': { live: 0, events: [{ src: 'B-M3', typ: UPS_BATT, t0: 49, t1: 48.7 }] },
    'UPS B7': { lost: true, events: [] }
  };
  const upsScenarioFor = (f, label) => {
    if (f.digit === 1) return UPS_SCENARIO[label] || { live: 0, events: [] };
    const rnd = rngOf('ca-ups-' + f.id + label);
    return /2$/.test(label) && rnd() < 0.8 ? { live: UPS_JUMP, events: [{ input: 2, typ: UPS_JUMP, t0: 3 + Math.round(rnd() * 8), t1: null, rel: 0.31 }] } : { live: 0, events: [] };
  };

  function upsList(floorId) {
    const f = floorOf(floorId);
    const lay = D.layoutOf ? D.layoutOf(f.digit) : null;
    const items = lay ? lay.items.filter(i => i.type === 'ups') : [];
    return items.map(u => {
      const sc = upsScenarioFor(f, u.label);
      const side = (u.label.match(/UPS\s*([A-Z])/) || [])[1] || '';
      return { id: u.id, label: u.label, devId: u.devId || ('KAT' + f.digit + '_SAL1_' + u.label.replace(/\s+/g, '').replace('UPS', '') + '_UPS'), side, typ: sc.lost ? 0 : sc.live || 0, lost: !!sc.lost, scenario: sc, item: u };
    });
  }

  function upsModules(side) {
    return [1, 2, 3, 4].map(n => ({ id: side + '-M' + n, label: 'UPS ' + side + ' Modül ' + n }));
  }

  function upsHistory(floorId, label, start, end) {
    const u = upsList(floorId).find(x => x.label === label);
    if (!u) return null;
    const sc = u.scenario;
    const until = Math.min(end, NOW);
    const t0 = Math.floor(start / H) * H;
    const inputs = [1, 2].map(n => {
      const rnd = rngOf('ca-ups-his-' + label + n);
      const base = 38 + rnd() * 22;
      const pow = [], volt = [];
      for (let t = t0; t <= until; t += H) {
        const ago = (NOW - t) / H;
        let p = base * (1 + 0.06 * Math.sin(2 * Math.PI * (new Date(t).getHours() - 14) / 24) + (rnd() - 0.5) * 0.04);
        let v = 229 + (rnd() - 0.5) * 3;
        sc.events.forEach(e => {
          if (e.input !== n) return;
          const active = ago <= e.t0 && (e.t1 === null || ago >= e.t1);
          if (!active) return;
          if (e.typ === UPS_JUMP) p *= 1 + e.rel;
          if (e.typ === UPS_NOINPUT) { p = 0; v = 0; }
        });
        if (sc.noInput && NOW - t < H && t + H > NOW - sc.noInput) { p = 0; v = 0; }
        if (sc.lost && ago < 0.7) continue;
        pow.push([t, round2(p)]);
        volt.push([t, round2(v)]);
      }
      return { n, pow, volt };
    });
    const events = sc.events.filter(e => NOW - e.t0 * H <= end && (e.t1 === null || NOW - e.t1 * H >= start)).map(e => {
      const inp = e.input ? inputs[e.input - 1] : null;
      const s = NOW - e.t0 * H;
      const baseline = inp ? (inp.pow.filter(p => p[0] < s - H).slice(-1)[0] || [0, 0])[1] : null;
      const peak = inp ? inp.pow.filter(p => p[0] >= s - H).reduce((m, p) => Math.max(m, p[1]), 0) : -38.4;
      return {
        start: s, end: e.t1 === null ? null : NOW - e.t1 * H, input: e.input || 0, src: e.src || '', typ: e.typ,
        peakValue: peak, baseline, peakZ: inp && baseline ? (peak - baseline) / baseline : 0, crowd: e.crowd || 0
      };
    }).sort((a, b) => b.start - a.start);
    // modüller: şebekede küçük şarj akımı; batarya olayında deşarj (negatif)
    const mods = upsModules(u.side).map(m => {
      const evs = events.filter(e => e.src === m.id);
      const discharging = evs.some(e => e.end === null);
      const rnd = rngOf('ca-mod-' + m.id);
      return {
        id: m.id, label: m.label,
        live: { ok: !u.lost, cur: discharging ? -38.4 : round2(1.2 + rnd() * 1.6), typ: discharging ? (evs[0].typ) : 0 },
        view: { got: true, minCur: evs.length ? -38.4 : round2(0.8 + rnd()), eps: evs }
      };
    });
    return { inputs, events, mods, side: u.side };
  }

  D.cabinAnomaly = {
    ANM_DEV, ANM_JUMP, ANM_CONTRA, UPS_JUMP, UPS_BATT, UPS_NOINPUT, UPS_GRID,
    UPS_ANM_MASK: UPS_JUMP | UPS_BATT, UPS_INFO_MASK: UPS_NOINPUT | UPS_GRID,
    TEMP_WRN, TEMP_ALM, HUM_WRN, HUM_ALM,
    floors: FLOORS,
    cabinetsOf: id => cabinetsOf(floorOf(id)),
    noSensor: id => extrasFor(floorOf(id)).extra.noSensor.slice(),
    live,
    cabinHistory,
    mapHistory,
    upsList,
    upsHistory
  };
})();
