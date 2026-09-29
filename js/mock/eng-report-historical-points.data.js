/* ==========================================================================
   DCIM Sunum — Tarihsel Noktalar mock verisi (DCIM.data.historicalPoints)
   api.HIS_cmr_list(0,'...') (db_DAS_api.js) → CMR tablosu (tim, doc, rid, val, pro, sta, txt, TotalCount)
   karşılığı. Kayıtlar DCIM.data.telemetry noktalarından (telemetry-points.html ile aynı rid / tanım /
   birim / protokol ölçeği) türetilir: son 7 gün, 15 dk kayıt periyodu, nokta başına sabit saniye ofseti.
   Kayıtlar diziye açılmaz (≈2,3 milyon); (örnek, nokta) çiftinden istek anında hesaplanır.
   Senaryo (tüm sayfalarla tutarlı): anormal noktalar başlangıç anından (aktif alarm zamanı,
   haberleşme kaybı / devre dışı için noktanın son güncelleme zamanı) itibaren güncel durumlarıyla,
   öncesinde normal değer ve durumla (0x0003) kaydedilir; sıcaklık/basınç alarmlarında öncesinde 3 saatlik yükseliş.
   Filtre anlamı sunucudaki SQL ile aynıdır:
     rid / txt / val / pro → içerir (büyük/küçük harf duyarsız, ILIKE '%…%')
     bgn / end            → tim >= bgn, tim <= end
     sta                  → (sta & 15): DISABLED 0, UNREACHABLE 1, OLD 2, NORMAL 3, WARNING 7, ALARM 11, EMERGENCY 15
     sıralama             → ORDER BY tim DESC, sayfalama → OFFSET sayfa × rng
   Bağımlılık: js/mock-data.js → DCIM.data (telemetry [lazy], activeAlarms, findCabinet, rng, hash, lazy)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const PERIOD_MS = 15 * 60000;
  const DAYS = 7;
  const SAMPLES = DAYS * 24 * 60 * 60000 / PERIOD_MS;   // 672
  const DAY_MS = 86400000;
  const STA_FILTER = { DISABLED: 0, UNREACHABLE: 1, OLD: 2, NORMAL: 3, WARNING: 7, ALARM: 11, EMERGENCY: 15 };
  const NORMAL_TEXT = { 'AKÜ': ['ONLINE (ŞEBEKE)', '1'], 'ARIZA': ['SOĞUTMA', '0'], 'KİRLİ': ['TEMİZ', '0'], 'AÇIK': ['KAPALI', '0'] };

  // (0..1) arası tohumlu gürültü — nokta tohumu + örnek indeksi
  function noise(seed, s) {
    let h = (seed ^ Math.imul(s + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  D.lazy('historicalPoints', function () {
    const TEL = D.telemetry;
    const RUN = TEL.STA.RUN;
    const NOW = Date.now();
    // En yeni örnek: son tamamlanmış 15 dk sınırı (nokta ofsetleri gelecek zamana taşmasın diye 1 dk pay)
    const T0 = Math.floor((NOW - 60000) / PERIOD_MS) * PERIOD_MS;
    const sampleTime = s => T0 - s * PERIOD_MS;
    const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');

    // Aktif alarm başlangıcı: kabin kodu / ekipman etiketi eşlemesi
    const alarmOnset = {};
    (D.activeAlarms || []).forEach(a => { if (a.target && !(a.target in alarmOnset)) alarmOnset[a.target] = a.tim.getTime(); });
    function onsetFor(p) {
      const eng = p.sta & 0x3;
      if (eng !== RUN) return p.tim.getTime();                       // devre dışı / haberleşme kaybı: son görülme
      const cab = /K(\d[A-Z]{2}\d{2})_/.exec(p.rid);
      if (cab && alarmOnset[cab[1]] != null) return alarmOnset[cab[1]];
      const ups = /_([AB]\d)_UPS_/.exec(p.rid);
      if (ups && alarmOnset['UPS ' + ups[1]] != null) return alarmOnset['UPS ' + ups[1]];
      if (p.dev && alarmOnset[p.dev] != null) return alarmOnset[p.dev];
      if (p.dev && alarmOnset[String(p.dev).toUpperCase()] != null) return alarmOnset[String(p.dev).toUpperCase()];
      return NOW - (25 + (D.hash(p.rid) % 215)) * 60000;              // eşleşme yoksa 25–240 dk önce
    }

    const round = (v, dec) => Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);

    // Başlangıç öncesi normal değer
    function normalOf(p, h) {
      const cur = typeof p.base === 'number' ? p.base : null;
      const unit = p.unit;
      if (unit === '°C') return cur != null && p.hi != null ? Math.min(cur, p.hi - 3.2 + h * 0.8) : (cur != null && cur > 0 ? cur : 22.8 + h * 1.6);
      if (unit === '%RH') return cur != null ? Math.min(cur, 44 + h * 6) : 44 + h * 6;
      if (unit === 'V') return cur != null && cur > 100 ? cur : 229.2 + h * 1.4;
      if (unit === 'A') return cur != null && cur > 0 ? cur : 3.1 + h * 1.2;
      if (unit === 'W') return cur != null && cur > 0 ? cur : 2400 + h * 600;
      if (unit === 'kW') return cur != null && cur > 0 ? cur : 38 + h * 8;
      if (unit === 'bar') return cur != null ? Math.min(cur, 19.5 + h * 1.5) : 20;
      if (/_BAT_CAP$/.test(p.rid)) return 100;
      if (/_BAT_TIME$/.test(p.rid)) return 42 + Math.round(h * 6);
      return cur;
    }

    // Nokta ön-hesapları
    const points = TEL.points.map((p, idx) => {
      const seed = D.hash(p.rid);
      const h = (seed % 1000) / 1000;
      const abnormal = (p.sta & 0x3) !== RUN || (p.sta & 0xC) !== 0 || (p.cls === 'DOOR' && p.val === 'AÇIK');
      const out = p.sta & 0x30;
      const q = {
        p, idx, seed,
        off: 5 + (seed % 52) * 1000 + (seed % 7) * 97,              // örnek içi saniye ofseti (ms)
        doc: p.qry_doc, rid: p.rid, txt: p.desc, unit: p.unit, dec: p.dec,
        abnormal,
        onset: abnormal ? onsetFor(p) : Infinity,
        staNow: p.sta,
        staNorm: RUN | out,
        cur: typeof p.base === 'number' ? p.base : null,
        amp: p.noise ? p.noise * 4 : 0,
        jit: p.noise ? p.noise * 1.5 : 0,
        phase: h * Math.PI * 2
      };
      q.norm = abnormal ? normalOf(p, h) : q.cur;
      // Değeri '-' olan noktalar (haberleşme kaybı / devre dışı) için ondalık ve ham değer ölçeği birimden
      if (!p.isNum) {
        q.dec = p.unit === '°C' || p.unit === '%RH' || p.unit === 'V' || p.unit === 'kW' ? 1 : 0;
        q.scale = p.proto === TEL.PROTO.modbus || p.proto === TEL.PROTO.snmp2 || p.proto === TEL.PROTO.snmp3 ? Math.pow(10, q.dec) : 1;
      } else {
        q.scale = p.scale;
      }
      q.ramp = abnormal && q.norm != null && q.cur != null && q.cur > q.norm && (p.unit === '°C' || p.unit === 'bar' || p.unit === '%RH') && (p.sta & 0x3) === RUN;
      const nt = NORMAL_TEXT[p.val];
      q.normText = nt ? nt[0] : p.val;
      q.normPro = nt ? nt[1] : p.pro;
      return q;
    });
    // Aynı örnekte tim DESC: ofseti büyük olan önce
    points.sort((a, b) => b.off - a.off || (a.rid < b.rid ? -1 : a.rid > b.rid ? 1 : 0));
    const byRid = {};
    points.forEach(q => { byRid[q.rid] = q; });

    function rawOf(q, v) {
      const p = q.p;
      if (p.proto === TEL.PROTO.mqtt || p.proto === TEL.PROTO.bacnet) return v.toFixed(q.dec);
      return String(Math.round(v * q.scale));
    }

    const recTime = (q, s) => sampleTime(s) + q.off;
    const staAt = (q, t) => (t >= q.onset ? q.staNow : q.staNorm);

    // Tek kayıt: { tim, doc, rid, pro, val, sta, txt }
    function record(q, s) {
      const t = recTime(q, s);
      const after = t >= q.onset;
      const sta = after ? q.staNow : q.staNorm;
      const p = q.p;
      let val, pro;
      if (after) {
        // Güncel durum (canlı değerin çevresinde küçük salınım)
        if (q.cur != null && (p.sta & 0x3) === RUN && q.jit) {
          const v = q.cur + (noise(q.seed, s) - 0.5) * 2 * q.jit * 0.6;
          val = v.toFixed(q.dec); pro = rawOf(q, v);
        } else { val = p.val; pro = p.pro; }
      } else if (typeof q.norm === 'number') {
        let v = q.norm;
        if (q.amp) v += q.amp * (Math.sin((t / DAY_MS) * Math.PI * 2 + q.phase) - Math.sin((NOW / DAY_MS) * Math.PI * 2 + q.phase)) + (noise(q.seed, s) - 0.5) * 2 * q.jit;
        if (q.ramp) {
          const top = p.hi != null ? Math.min(q.cur, p.hi - 0.3) : q.cur - (q.cur - q.norm) * 0.25;
          const k = 1 - (q.onset - t) / (3 * 3600000);
          if (k > 0) v += (top - q.norm) * k;
        }
        if (p.unit === 'A' || p.unit === 'W' || p.unit === 'kW' || p.unit === '%' || p.unit === '%RH') v = Math.max(0, v);
        if (/_BAT_CAP$/.test(p.rid)) v = Math.min(100, v);
        v = round(v, q.dec);
        val = v.toFixed(q.dec); pro = rawOf(q, v);
      } else {
        val = q.normText; pro = q.normPro;
      }
      return { tim: new Date(t), doc: q.doc, rid: q.rid, pro: String(pro), val: String(val), sta, txt: q.txt };
    }

    // where: { rid, txt, val, pro, sta, bgn, end } (bgn/end: Date | ISO | 'YYYY-MM-DD')
    // page: sayfa indeksi (0…), rng: sayfa boyu → { rows, total }
    function query(where, page, rng) {
      const w = where || {};
      const ridQ = lc(w.rid), txtQ = lc(w.txt), valQ = lc(w.val), proQ = lc(w.pro);
      const staQ = w.sta && STA_FILTER[w.sta] != null ? STA_FILTER[w.sta] : null;
      const bgn = w.bgn ? new Date(w.bgn).getTime() : -Infinity;
      const end = w.end ? new Date(w.end).getTime() : Infinity;
      const pts = points.filter(q => (!ridQ || lc(q.rid).indexOf(ridQ) >= 0) && (!txtQ || lc(q.txt).indexOf(txtQ) >= 0));
      const needRec = !!(valQ || proQ);
      const from = Math.max(0, page | 0) * Math.max(1, rng | 0);
      const to = from + Math.max(1, rng | 0);
      const rows = [];
      let total = 0;
      // Örnek aralığı (bgn/end) — nokta ofseti < 1 dk olduğundan bir örnek pay
      const sMin = end === Infinity ? 0 : Math.max(0, Math.floor((T0 - end) / PERIOD_MS) - 1);
      const sMax = bgn === -Infinity ? SAMPLES - 1 : Math.min(SAMPLES - 1, Math.ceil((T0 - bgn) / PERIOD_MS) + 1);
      for (let s = sMin; s <= sMax; s++) {
        const base = sampleTime(s);
        const edge = base + 60000 > end || base < bgn;   // örneğin tamamı aralıkta değil
        if (!needRec && staQ == null && !edge) {
          // Hızlı yol: bu örnekteki tüm noktalar eşleşir
          if (total + pts.length > from && total < to) {
            for (let i = Math.max(0, from - total); i < pts.length && total + i < to; i++) rows.push(record(pts[i], s));
          }
          total += pts.length;
          continue;
        }
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const t = base + q.off;
          if (t < bgn || t > end) continue;
          if (staQ != null && (staAt(q, t) & 15) !== staQ) continue;
          let rec = null;
          if (needRec) {
            rec = record(q, s);
            if (valQ && lc(rec.val).indexOf(valQ) < 0) continue;
            if (proQ && lc(rec.pro).indexOf(proQ) < 0) continue;
          }
          if (total >= from && total < to) rows.push(rec || record(q, s));
          total++;
        }
      }
      return { rows, total };
    }

    // Trend grafiği (sunum eki): tek noktanın [bgn, end] aralığındaki kayıtları, eskiden yeniye
    function series(rid, bgn, end) {
      const q = byRid[rid];
      if (!q) return [];
      const b = bgn ? new Date(bgn).getTime() : -Infinity;
      const e = end ? new Date(end).getTime() : Infinity;
      const out = [];
      for (let s = SAMPLES - 1; s >= 0; s--) {
        const t = recTime(q, s);
        if (t < b || t > e) continue;
        out.push(record(q, s));
      }
      return out;
    }

    D.historicalPoints = {
      PERIOD_MS, SAMPLES, T0,
      query,
      series,
      point: rid => (byRid[rid] ? byRid[rid].p : null),
      rids: () => TEL.points.map(p => p.rid)
    };
  });
})();
