/* ==========================================================================
   DCIM Sunum — PDU Detay sayfa verisi (DCIM.data.pduPage)
   Ortak PDU üreticisi DCIM.data.pdu (js/mock-data.js) yalnız 1. kat kabinlerini tanır; bu dosya
   aynı üreticiyi 2. ve 3. kat kabinleri için de çalıştırır ve sayfaya özel senaryo ekler:
     - 2. katta bir kabinin PDU-A C2 kesicisi ACİL (aşırı akım; en yüklü outlet'i de ACİL)
     - 3. katta bir kabinin alarmları susturulmuş (STA 0x03C3) → PDU DEVREDIŞI, satırlarda alarm görünmez
   Kabinler: kat 1 DCIM.data.cabinets, diğer katlar DCIM.data.getLockFloor(id).map(c => c.cabinet).
   Ağaç: kat (DCIM.data.floors) → POD (cabinet.pod; yoksa sıra) → kabin (pdu-detail.component.ts treeGroup).
   Bağımlılık: js/mock-data.js (DCIM.data.pdu, floors, cabinets, getLockFloor, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D || !D.pdu) return;

  // STA bitleri: 0x0003 çalışıyor, 0x000C değer maskesi (4 uyarı, 8 alarm, C acil), 0x00C0 susturulmuş
  const STA_ACIL = '0x000F';
  const STA_MUTED = '0x03C3';
  const STA_MUTED_ALARM = '0x03CB';

  // ---------------------------------------------------------------------------
  // Katlar ve kabinler
  // ---------------------------------------------------------------------------
  let floorCache = null;
  function floors() {
    if (floorCache) return floorCache;
    floorCache = (D.floors || []).map(f => ({
      id: f.id,
      label: f.label,
      digit: f.digit,
      cabinets: f.digit === 1 ? D.cabinets : (D.getLockFloor ? D.getLockFloor(f.id).map(c => c.cabinet) : [])
    }));
    return floorCache;
  }
  const norm = id => String(id || '').replace(/_DV$/, '').replace(/^K(?=\d)/i, '').toUpperCase();
  function findCab(id) {
    const code = norm(id);
    for (const f of floors()) {
      const c = f.cabinets.find(x => x.code === code);
      if (c) return c;
    }
    return null;
  }
  const floorOf = code => floors().find(f => f.cabinets.some(c => c.code === code)) || null;

  // Senaryo kabinleri (tohumlu seçim; yükü olan kabinlerden)
  function pickCab(floorId, key) {
    const f = floors().find(x => x.id === floorId);
    if (!f) return '';
    const list = f.cabinets.filter(c => c.pduA > 1 && c.pduB > 1 && !/^NW-/.test(c.pod)).map(c => c.code).sort();
    if (!list.length) return '';
    const rnd = D.rng(D.hash(key));
    return list[Math.floor(rnd() * list.length) % list.length];
  }
  const SCENARIO = { acil: pickCab('T02', 'pdu-page-acil'), muted: pickCab('T03', 'pdu-page-muted') };

  // Ortak üretici (DCIM.data.pdu) kabini DCIM.data.findCabinet ile bulur: çağrı süresince diğer katların
  // kabinlerini de tanıması için geçici olarak genişletilir (yalnız bu sayfada, eşzamanlı çalışır).
  function withCab(cab, fn) {
    const prev = D.findCabinet;
    D.findCabinet = code => (String(code).toUpperCase() === cab.code ? cab : prev(code));
    try { return fn(); } finally { D.findCabinet = prev; }
  }

  // Outlet → kesici (mock-data.js breakerOfOutlet ile aynı kural)
  function breakerOfOutlet(outlets, ocp, o) {
    const per = Math.max(1, Math.floor(outlets / ocp));
    return Math.min(ocp, Math.floor((o - 1) / per) + 1);
  }

  function applyScenario(cab, devs) {
    if (cab.code === SCENARIO.acil) {
      const dev = devs.find(d => /_PDU_A_DV$/.test(d.id));
      if (dev) {
        const ios = dev.io;
        const get = suffix => ios.find(io => io.id.endsWith(suffix));
        const outCnt = parseInt((get('_NFO_PDUOUTCNT') || {}).val, 10) || 24;
        const ocp = ios.filter(io => /_RTD_OCP\d+_CURR$/.test(io.id)).length || 2;
        const rtd = parseFloat((get('_RTD_OCP2_CURR') || {}).val) || 16;
        const curr = get('_OCP_C2_CURR');
        if (curr) { curr.val = (rtd * 0.97).toFixed(2); curr.sta = STA_ACIL; }
        const st = get('_OCP_C2_STATUS');
        if (st) st.val = '-';
        // Kesicinin en yüklü outlet'i
        let hot = null;
        for (let o = 1; o <= outCnt; o++) {
          if (breakerOfOutlet(outCnt, ocp, o) !== 2) continue;
          const io = get('_OUT' + String(o).padStart(2, '0') + '_CURR');
          if (io && (!hot || parseFloat(io.val) > parseFloat(hot.val))) hot = io;
        }
        if (hot) hot.sta = STA_ACIL;
      }
    } else if (cab.code === SCENARIO.muted) {
      devs.forEach(d => {
        d.sta = STA_MUTED;
        d.io.forEach(io => { io.sta = STA_MUTED; });
        // Susturulmuş bir uyarı (satırlarda görünmez)
        const c1 = d.io.find(io => /_OCP_C1_CURR$/.test(io.id));
        if (c1) c1.sta = STA_MUTED_ALARM;
      });
    }
    return devs;
  }

  D.pduPage = {
    floors,
    floorOf,
    findCab,
    scenario: SCENARIO,
    // Seçili kabinin PDU dev blokları (XDB dev JSON biçimi; live=true → 5 sn polling titreşimi)
    query(cabinetId, live) {
      const cab = findCab(cabinetId);
      if (!cab) return [];
      return applyScenario(cab, withCab(cab, () => D.pdu.query(cab.code, live)));
    },
    outletAssets(cabinetId, side) {
      const cab = findCab(cabinetId);
      return cab ? withCab(cab, () => D.pdu.outletAssets(cab.code, side)) : {};
    }
  };
})();
