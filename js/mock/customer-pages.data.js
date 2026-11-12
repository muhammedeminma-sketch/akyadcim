/* ==========================================================================
   DCIM Sunum — Müşteri Eşleştirme ek verisi (DCIM.data.customers genişletmesi)
   Yalnız customer-pages.html yükler; js/mock-data.js'teki D.customers (kat 1 PDU'ları, CDB/WOR listeleri) üzerine:
   - siteFloors: SITE_Floors karşılığı (kat → CMR dokümanları; SiteModelService.definedFloors / floors)
   - devices(): doc('CMR/*')//dev[contains(@id,'PDU') | contains(@id,'PMM')] — bütün katların PDU/PMM cihazları
     (kat 2 / 3 PDU'ları DCIM.data.getLockFloor kabinlerinden ilk erişimde üretilir; IP blokları kurgusal)
   - lookupDev(id, docHint): cihazın bulunduğu doküman + con_host (ipucu yoksa katların dokümanlarında sırayla aranır)
   - Kat 2 / 3 eşleştirmeleri: mevcut müşterilerin diğer katlardaki kabinlerine ait birkaç CDB kaydı (çok katlı arama)
   Kurgusal ve tohumludur (DCIM.data.rng / hash); gerçek saha verisi içermez.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const D = DCIM && DCIM.data;
  const CU = D && D.customers;
  if (!CU || CU.siteFloors) return;

  // SITE_Floors: 1. kat tesis (T00) + beyaz alan PDU (T01) dokümanları; 2. ve 3. kat tek doküman
  const FLOORS = [
    { id: 'T00', name: '1. Kat', digit: 1, pduDoc: 'CMR/T01', facDoc: 'CMR/T00', docs: ['CMR/T00', 'CMR/T01'], open: true },
    { id: 'T02', name: '2. Kat', digit: 2, pduDoc: 'CMR/T02', facDoc: 'CMR/T02', docs: ['CMR/T02'], open: true },
    { id: 'T03', name: '3. Kat', digit: 3, pduDoc: 'CMR/T03', facDoc: 'CMR/T03', docs: ['CMR/T03'], open: true }
  ];
  const floorOfDoc = doc => FLOORS.find(f => f.docs.indexOf(String(doc || '')) >= 0) || null;

  // Pano güç analizörleri (PMM) 1. katın PDU dokümanındadır (proje envanteri: CMR_T01 → PDU (POD), PDU (NS), PMM)
  CU.pdus.forEach(p => { if (/PMM/.test(p.id)) p.doc = 'CMR/T01'; });

  const pad = n => String(n).padStart(2, '0');
  function outletIo(count) {
    const io = [{ id: 'IO_IN01_KWH', mtr_pow: '1' }];
    for (let i = 1; i <= count; i++) io.push({ id: 'IO_OUT' + pad(i) + '_KWH', mtr_pow: String(-i) });
    return io;
  }

  // Kat 2 / 3 PDU'ları — IP: 10.1<kat>.<40 + sıra index>.<kabin no × 2 + (A:1 | B:2)> (kat 1: 10.10.x, mock-data.js)
  let upper = null;
  function upperFloorPdus() {
    if (upper) return upper;
    upper = [];
    FLOORS.filter(f => f.digit > 1).forEach(f => {
      const cabs = (D.getLockFloor ? D.getLockFloor(f.id) : []).map(c => c.cabinet).filter(Boolean);
      const colIdx = {};
      let seq = 0;
      cabs.forEach(cab => {
        if (colIdx[cab.col] == null) colIdx[cab.col] = seq++;
        const num = parseInt(cab.code.slice(3), 10) || 0;
        const outlets = /^NW-/.test(cab.pod || '') ? 16 : 24;
        ['A', 'B'].forEach(side => upper.push({
          id: 'K' + cab.code + '_PDU_' + side,
          con_host: '10.1' + f.digit + '.' + (40 + colIdx[cab.col]) + '.' + (num * 2 + (side === 'A' ? 1 : 2)),
          doc: f.pduDoc,
          cabinet: cab.code,
          customer: cab.customer,
          side,
          io: outletIo(outlets)
        }));
      });
    });
    return upper;
  }

  const stripK = id => (id && id.charAt(0) === 'K' ? id.substring(1) : id || '');
  let all = null;
  let byId = null;
  function devices() {
    if (all) return all;
    all = CU.pdus.concat(upperFloorPdus()).slice().sort((a, b) => {
      const ia = stripK(a.id), ib = stripK(b.id);
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
    byId = {};
    all.forEach(d => { byId[d.id] = d; });
    return all;
  }
  const findDev = id => { devices(); return byId[id] || null; };

  // lookupDev: cihaz, katların dokümanlarında aranır (sabit 'CMR/T01' yok); bulunamazsa null → "(IP bulunamadı)"
  function lookupDev(id) {
    const d = findDev(id);
    return d ? { doc: d.doc, desc: stripK(d.id), con_host: d.con_host } : null;
  }

  // ---------------------------------------------------------------------------
  // Diğer katlardaki eşleştirmeler (mevcut müşteriler — CDB_List'e eklenir)
  // ---------------------------------------------------------------------------
  const rnd = D.rng(D.hash('customers-cdb-upper-floors'));
  const NOW = Date.now();
  const fmt = t => {
    const d = new Date(t);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const used = {};
  CU.cdbList.forEach(c => {
    let arr = [];
    try { arr = JSON.parse(c.meter || '[]'); } catch (e) { arr = []; }
    arr.forEach(m => { if (m && m.dev && Array.isArray(m.meter)) { used[m.dev] = used[m.dev] || new Set(); m.meter.forEach(v => used[m.dev].add(Number(v))); } });
  });
  const freeOutlets = (dev, n) => {
    const d = findDev(dev);
    if (!d) return [];
    const u = used[dev] || new Set();
    const out = d.io.map(o => Number(o.mtr_pow)).filter(v => v < 0 && !u.has(v)).sort((a, b) => b - a).slice(0, n);
    used[dev] = u;
    out.forEach(v => u.add(v));
    return out;
  };
  const customerRow = name => CU.cdbList.find(c => c.customer_name.indexOf(name) === 0);
  const cabOf = (floorId, name, k) => {
    const list = upperFloorPdus().filter(p => p.doc === FLOORS.find(f => f.id === floorId).pduDoc && p.side === 'A');
    const own = list.filter(p => p.customer === name);
    const src = own.length ? own : list;
    return src.length ? src[(k || 0) % src.length].cabinet : null;
  };
  let ep = CU.cdbList.reduce((mx, c) => Math.max(mx, Number(c.energy_product_id) || 0), 5013400150) + 6;
  let svc = 4103900;
  function addMatch(name, pkg, parts, days) {
    const base = customerRow(name);
    if (!base) return;
    const meter = [];
    parts.forEach(p => {
      if (!p.cab) return;
      ['A', 'B'].forEach(side => {
        const dev = 'K' + p.cab + '_PDU_' + side;
        const d = findDev(dev);
        if (!d) return;
        if (p.inlet) meter.push({ doc: d.doc, dev, meter: [1] });
        else {
          const outs = side === 'A' ? freeOutlets(dev, p.n) : (meter.find(m => m.dev === 'K' + p.cab + '_PDU_A') || { meter: [] }).meter.slice();
          if (side === 'B') { used[dev] = used[dev] || new Set(); outs.forEach(v => used[dev].add(v)); }
          if (outs.length) meter.push({ doc: d.doc, dev, meter: outs });
        }
      });
    });
    if (!meter.length) return;
    ep += 1 + Math.floor(rnd() * 3);
    svc += 11 + Math.floor(rnd() * 37);
    CU.cdbList.push({
      rid: 'CD00000000' + Number(base.cdb_id).toString(16).toUpperCase().padStart(8, '0') + '_' + ep,
      cdb_id: base.cdb_id,
      erp_id: base.erp_id,
      customer_name: base.customer_name,
      energy_product_id: String(ep),
      svc_desc: pkg,
      svc_id: String(svc),
      tim_bgn: fmt(NOW - days * 86400000 - Math.floor(rnd() * 20) * 3600000),
      tim_end: '',
      meter: JSON.stringify(meter)
    });
  }
  // Delta Yazılım — 2. katta tam kabin (girişten ölçüm)
  addMatch('Delta Yazılım', 'Kabin Kiralama - Yüksek Yoğunluk 8 kW', [{ cab: cabOf('T02', 'Delta Yazılım', 0), inlet: true }], 96);
  // Marmara Sigorta — 3. katta paylaşımlı kabin (çift besleme, aynı outletler)
  addMatch('Marmara Sigorta', 'Sunucu Barındırma - Yarım Kabin (21U) 2,5 kW', [{ cab: cabOf('T03', 'Marmara Sigorta', 0), n: 8 }], 61);
  // Kuzey Enerji — iki katlı eşleştirme: 1. kat + 2. kat kabinleri (tek üründe birden fazla kat)
  const kuzeyK1 = D.cabinets.filter(c => c.customer === 'Kuzey Enerji')[1] || D.cabinets[0];
  addMatch('Kuzey Enerji', 'Kesintisiz Enerji Hattı - 16A Çift Besleme', [{ cab: kuzeyK1 && kuzeyK1.code, n: 2 }, { cab: cabOf('T02', 'Kuzey Enerji', 1), n: 3 }], 34);
  // Anadolu Finans — 3. katta ek kabin
  addMatch('Anadolu Finans', 'Ek Enerji Paketi - 2 kW', [{ cab: cabOf('T03', 'Anadolu Finans A.Ş.', 1), n: 4 }], 12);

  Object.assign(CU, {
    siteFloors: FLOORS,
    floorOfDoc,
    devices,
    findDev,
    lookupDev
  });
})();
