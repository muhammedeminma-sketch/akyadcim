/* ==========================================================================
   DCIM Sunum — 2D Dijital İkiz kat modeli (kurgusal, tohumlu)
   DCIM.twin2d.floor(floorId) → kat yerleşimi (DCIM_FLOOR_LAYOUTS) + kabinler + klima / UPS / pano
   durumları, POD özeti (koridor sıcaklığı, giriş gücü, doluluk), klima dönüş sıcaklıkları,
   ağ katmanları (Tel Tava / Fiber Runner) ve canlı izlenen nokta sayısı.
   Kat 1 = DCIM.data (ortak senaryo); diğer katların kabinleri DCIM.data.getLockFloor(id), ekipman
   durumları yerleşim öğelerinden tohumlu üretilir.
   Bağımlılık: js/layout-data.js, js/mock-data.js
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const round1 = n => Math.round(n * 10) / 10;
  const cache = {};

  // ---------------------------------------------------------------------------
  // Diğer katların ekipmanları (kat 1'deki buildEquipment ile aynı nokta yapısı)
  // ---------------------------------------------------------------------------
  function seededEquipment(L, digit) {
    const res = { climates: [], ups: [], panels: [] };
    L.items.forEach(it => {
      if (it.type === 'cabinet') return;
      const rnd = D.rng(D.hash('twin2d-' + it.label + '-' + digit));
      const b = (min, max) => min + (max - min) * rnd();
      const roll = rnd();
      const base = { id: it.id, label: it.label, devId: it.devId, x: it.x, y: it.y, w: it.w, h: it.h, lo: it.lo, salon: it.salon, inRow: !!it.inRow, status: 'normal', note: '' };
      if (it.type === 'climate') {
        const hot = roll < 0.12;
        const supply = round1(b(15.5, 17.8));
        const ret = hot ? round1(b(28.3, 29.2)) : round1(b(23.4, 26.6));
        if (hot) { base.status = 'warning'; base.note = 'Dönüş havası yüksek'; }
        res.climates.push(Object.assign(base, {
          kind: 'climate', supplyTemp: supply, returnTemp: ret,
          points: [
            { label: 'Çalışma Modu', value: 'SOĞUTMA', unit: '', status: 'normal' },
            { label: 'Üfleme Sıcaklığı', value: supply, unit: '°C', status: 'normal' },
            { label: 'Dönüş Sıcaklığı', value: ret, unit: '°C', status: ret > 28 ? 'warning' : 'normal' },
            { label: 'Oda Nemi', value: Math.round(b(40, 50)), unit: '%', status: 'normal' },
            { label: 'Fan Hızı', value: Math.round(b(62, 88)), unit: '%', status: 'normal' },
            { label: 'Kompresör 1 Basınç', value: round1(b(17, 22)), unit: 'bar', status: 'normal' },
            { label: 'Filtre Durumu', value: 'TEMİZ', unit: '', status: 'normal' }
          ]
        }));
      } else if (it.type === 'ups') {
        const heavy = roll < 0.12;
        const load = heavy ? 81 + Math.round(b(0, 4)) : Math.round(b(36, 70));
        if (heavy) { base.status = 'warning'; base.note = 'Yük %' + load; }
        res.ups.push(Object.assign(base, {
          kind: 'ups', load,
          points: [
            { label: 'Çalışma Modu', value: 'ONLINE (ŞEBEKE)', unit: '', status: 'normal' },
            { label: 'Giriş Gerilimi (L1)', value: Math.round(b(226, 232)), unit: 'V', status: 'normal' },
            { label: 'Çıkış Gerilimi (L1)', value: Math.round(b(229, 231)), unit: 'V', status: 'normal' },
            { label: 'Yük Oranı', value: load, unit: '%', status: load > 80 ? 'warning' : 'normal' },
            { label: 'Akü Kapasitesi', value: 100, unit: '%', status: 'normal' },
            { label: 'Kalan Akü Süresi', value: Math.round(b(34, 48)), unit: 'dk', status: 'normal' },
            { label: 'Akü Sıcaklığı', value: round1(b(22, 25)), unit: '°C', status: 'normal' }
          ]
        }));
      } else {
        res.panels.push(Object.assign(base, {
          kind: 'panel',
          points: [
            { label: 'L1 Akım', value: round1(b(42, 61)), unit: 'A', status: 'normal' },
            { label: 'L2 Akım', value: round1(b(40, 60)), unit: 'A', status: 'normal' },
            { label: 'L3 Akım', value: round1(b(41, 59)), unit: 'A', status: 'normal' },
            { label: 'Toplam Aktif Güç', value: round1(b(28, 41)), unit: 'kW', status: 'normal' },
            { label: 'Güç Faktörü', value: b(0.95, 0.99).toFixed(2), unit: '', status: 'normal' },
            { label: 'THD-I', value: round1(b(3.1, 5.8)), unit: '%', status: 'normal' }
          ]
        }));
      }
    });
    return res;
  }

  // ---------------------------------------------------------------------------
  // Geometri yardımcıları
  // ---------------------------------------------------------------------------
  function bbox(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(r => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  const pathOf = segs => segs.map(s => 'M ' + Math.round(s[0]) + ' ' + Math.round(s[1]) + ' L ' + Math.round(s[2]) + ' ' + Math.round(s[3])).join(' ');

  // Kabin sıraları (col): yön, eksen ve uçlar
  function rowsOf(cabinets) {
    const by = {};
    cabinets.forEach(c => { (by[c.col] = by[c.col] || []).push(c); });
    return Object.keys(by).map(col => {
      const b = bbox(by[col]);
      return { col, pod: by[col][0].pod, salon: by[col][0].salonId, b, horiz: b.w >= b.h };
    });
  }

  // Tel Tava: her kabin sırasının üstünden geçen hat + salon başına omurga (sıraların başına bağlanır)
  function cableTray(rows, salons, digit) {
    const segs = [];
    const risers = [];
    salons.forEach(sl => {
      const rs = rows.filter(r => r.salon === sl.id);
      const H = rs.filter(r => r.horiz), V = rs.filter(r => !r.horiz);
      if (H.length) {
        const tx = Math.min.apply(null, H.map(r => r.b.x)) - 40;
        const ys = H.map(r => r.b.cy);
        H.forEach(r => { segs.push([tx, r.b.cy, r.b.x1 + 12, r.b.cy]); });
        segs.push([tx, Math.min.apply(null, ys), tx, Math.max.apply(null, ys)]);
        risers.push({ x: tx, y: Math.min.apply(null, ys), up: digit < 3 });
      }
      if (V.length) {
        const ty = Math.min.apply(null, V.map(r => r.b.y)) - 40;
        const xs = V.map(r => r.b.cx);
        V.forEach(r => { segs.push([r.b.cx, ty, r.b.cx, r.b.y1 + 12]); });
        segs.push([Math.min.apply(null, xs), ty, Math.max.apply(null, xs), ty]);
        if (!H.length) risers.push({ x: Math.min.apply(null, xs), y: ty, up: digit < 3 });
      }
    });
    if (digit === 2 && risers.length > 1) risers[risers.length - 1].up = false;
    return { d: pathOf(segs), risers };
  }

  // Fiber Runner: NW sıralarından ana hat; ana hattan her POD bloğuna iniş
  function fiberRunner(rows, salons, digit) {
    const segs = [];
    const risers = [];
    salons.forEach(sl => {
      const rs = rows.filter(r => r.salon === sl.id);
      if (!rs.length) return;
      const nw = rs.filter(r => /^NW-/.test(r.pod));
      const podNames = Array.from(new Set(rs.filter(r => !/^NW-/.test(r.pod)).map(r => r.pod)));
      const pods = podNames.map(p => bbox(rs.filter(r => r.pod === p).map(r => r.b)));
      if (!pods.length) return;
      const all = bbox(pods);
      let y;
      if (nw.length) {
        const nb = bbox(nw.map(r => r.b));
        y = nb.y1 <= all.y ? nb.y1 + 34 : nb.y - 34;
        nw.forEach(r => segs.push([r.b.cx, y, r.b.cx, y < r.b.y ? r.b.y : r.b.y1]));
      } else {
        y = all.y - 30;
        risers.push({ x: all.x - 20, y, up: digit === 1 });
      }
      const xs = pods.map(p => p.cx).concat(nw.map(r => r.b.cx));
      if (!nw.length) xs.push(all.x - 20);
      segs.push([Math.min.apply(null, xs), y, Math.max.apply(null, xs), y]);
      pods.forEach(p => segs.push([p.cx, y, p.cx, y < p.y ? p.y : p.y1]));
    });
    return { d: pathOf(segs), risers };
  }

  // ---------------------------------------------------------------------------
  // Kat modeli
  // ---------------------------------------------------------------------------
  function floor(floorId) {
    if (cache[floorId]) return cache[floorId];
    const meta = (D.floors || []).find(f => f.id === floorId) || D.floors[0];
    const digit = meta.digit;
    const L = D.layoutOf(digit);
    const cabinets = digit === 1 ? D.cabinets : D.getLockFloor(meta.id).map(k => k.cabinet);
    const eq = digit === 1 ? { climates: D.climates, ups: D.ups, panels: D.panels } : seededEquipment(L, digit);
    // Kat 1 ekipmanlarına salon ve sıra içi bilgisi yerleşimden eklenir
    if (digit === 1) {
      const byId = {};
      L.items.forEach(it => { byId[it.id] = it; });
      [].concat(eq.climates, eq.ups, eq.panels).forEach(e => { const it = byId[e.id]; if (it) { e.salon = e.salon || it.salon; e.inRow = !!it.inRow; } });
    }
    const salonKey = s => String(s || 'S1').replace(/^SAL/, 'S');
    const salons = (L.salons && L.salons.length ? L.salons : [{ id: 'S1', name: '1. Salon', x: 100, y: 100, w: L.mapW - 200, h: L.mapH - 200 }]);

    // POD özetleri (POD metinleri yerleşimin texts listesinde)
    const pods = L.texts.filter(t => /^(POD|NW)-\d+$/.test(t.text)).map(t => {
      const cabs = cabinets.filter(c => c.pod === t.text);
      const live = cabs.filter(c => c.status !== 'lost');
      const rnd = D.rng(D.hash('pod-aisle-' + digit + '-' + t.text));
      const avgTop = live.length ? live.reduce((s, c) => s + c.tempTop, 0) / live.length : 24;
      const temp = round1(avgTop + 0.6 + rnd() * 0.8);
      const powerKw = round1(cabs.reduce((s, c) => s + (c.powerKw || 0), 0));
      return {
        name: t.text, x: t.x, y: t.y, cabinets: cabs, box: cabs.length ? bbox(cabs) : null,
        temp, tempStatus: temp >= 30 ? 'alarm' : temp >= 28 ? 'warning' : 'normal',
        powerKw, salonId: cabs.length ? cabs[0].salonId : 'S1'
      };
    });

    const rows = rowsOf(cabinets);
    const network = [
      Object.assign({ id: 'tel-tava', name: 'Tel Tava', kind: 'cable-tray', color: '#64748b', strokeWidth: 30 / 60 * 40 }, cableTray(rows, salons, digit)),
      Object.assign({ id: 'fiber-runner', name: 'Fiber Runner', kind: 'fiber-runner', color: '#f59e0b', strokeWidth: 12 / 60 * 40 }, fiberRunner(rows, salons, digit))
    ];

    // Canlı izlenen nokta: kabin başına sensör kiti (6) + 2 PDU × 4 giriş noktası, klima 7, UPS 7, pano 6
    const livePoints = cabinets.length * 14 + eq.climates.length * 7 + eq.ups.length * 7 + eq.panels.length * 6;

    const model = {
      id: meta.id, digit, name: meta.label, layout: L, schId: L.schId,
      salons: salons.map(s => Object.assign({}, s)), salonKey,
      cabinets, climates: eq.climates, ups: eq.ups, panels: eq.panels, pods, network, livePoints
    };
    cache[floorId] = model;
    return model;
  }

  // Kabin PDU'ları (kabin yöneticisi PDU Üniteleri tablosu): A/B besleme, kurgusal IP
  function cabinetPdus(c) {
    const rnd = D.rng(D.hash('pdu-ip-' + c.code));
    const lost = c.status === 'lost';
    const mk = (feed, amps, fault) => {
      const volt = fault ? 0 : round1(228 + rnd() * 4);
      const tone = lost ? 'lost' : fault ? 'alarm' : (c.note === 'Yüksek akım' ? 'warning' : 'normal');
      return {
        id: c.code + '_PDU_' + feed, name: c.code + '_PDU_' + feed,
        ip: '10.' + (60 + c.floor) + '.' + (10 + Math.floor(rnd() * 80)) + '.' + (20 + Math.floor(rnd() * 200)),
        voltage: lost ? null : volt, current: lost ? null : (fault ? 0 : amps), power: lost ? null : (fault ? 0 : round1(amps * volt * 0.97)),
        tone
      };
    };
    return [mk('A', c.pduA, false), mk('B', c.pduB, !!c.pduFault)];
  }

  DCIM.twin2d = { floor, cabinetPdus, bbox };
})();
