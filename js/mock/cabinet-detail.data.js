/* ==========================================================================
   DCIM Sunum — Kabin Yönetimi sayfa veri katmanı (cabinet-detail.html)
   js/mock-data.js'teki DCIM.data.cabinetMgr'ı bu sayfa için genişletir (dosyayı değiştirmez):
   - Kat 2 / Kat 3 kabinleri (DCIM.data.getLockFloor) de açılabilir: D.findCabinet bu sayfada tüm
     katlara bakar (cabinetMgr.sensorIos / pduDevs ve DCIM.data.pdu aynı aramayı kullanır),
     varlıklar cabinetMgr.registerAsset ile kaydedilir, POD lokasyonları kat adıyla eklenir.
   - ASM assignment: iki kabinde birer cihaz Kullanımda değildir (1DU06: 2 Hurdaya Ayrıldı → HURDA-DEPO,
     1NA06: 4 Bakımda; cihaz tohumla seçilir). Orijinaldeki gibi rafa yalnız assignment = 0 cihazlar çizilir.
   - HURDA-DEPO lokasyonu (hurdaya ayrılan cihaz yalnız buraya atanabilir). ?scraploc=0 ile
     lokasyon tanımsız sayılır → "HURDA-DEPO lokasyonu bulunamadı" uyarısı.
   - Dikey (0U) IT PDU'lar: U konumu olmayan, kullanımdaki IT PDU kayıtları (her kabinde A + B).
   Gerçek saha verisi değildir; tüm değerler tohumludur.
   Bağımlılık: js/mock-data.js (DCIM.data, cabinetMgr, getLockFloor, floors, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const M = D && D.cabinetMgr;
  if (!D || !M) return;

  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------------------
  // Tüm katların kabinleri
  // ---------------------------------------------------------------------------
  const floorOf = digit => (D.floors || []).find(f => f.digit === digit) || null;
  const others = [];
  (D.floors || []).forEach(f => {
    if (f.digit === 1 || typeof D.getLockFloor !== 'function') return;
    D.getLockFloor(f.id).forEach(card => { if (card.cabinet) others.push(card.cabinet); });
  });
  const ALL = D.cabinets.concat(others);
  const byCode = {};
  ALL.forEach(c => { byCode[c.code] = c; });

  const origFind = D.findCabinet;
  D.findCabinet = code => origFind(code) || byCode[String(code || '').toUpperCase()] || null;

  others.forEach(c => c.assets.forEach(a => M.registerAsset(a, c)));

  // Diğer katların POD lokasyonları (cabinetMgr.locationOf POD adıyla eşler)
  const company = (D.site && D.site.company) || 'Türk Telekom';
  const dc = (D.site && D.site.dc) || 'Veri Merkezi';
  others.forEach(c => {
    if (M.locations.some(l => l.pod === c.pod)) return;
    const f = floorOf(c.floor);
    M.locations.push({ location_id: 'LOC-' + c.pod, full_name: [company, dc, f ? f.label : c.floor + '. Kat', c.salon || '1. Salon', c.pod].join(' / '), pod: c.pod });
  });

  // HURDA-DEPO (orijinal kural: full_name / name içinde "HURDA DEPO")
  const SCRAP_LOCATIONS = params.get('scraploc') === '0' ? [] : [
    { location_id: 'LOC-HURDA-DEPO-1', full_name: company + ' / ' + dc + ' / Zemin Kat / HURDA-DEPO-1', pod: null },
    { location_id: 'LOC-HURDA-DEPO-2', full_name: company + ' / Ankara Merkez Lojistik / HURDA-DEPO-2', pod: null }
  ];
  SCRAP_LOCATIONS.forEach(l => M.locations.push(l));
  const isScrapLocation = l => /HURDA[\s_-]*DEPO/i.test(String((l && l.full_name) || '') + ' ' + String((l && l.name) || ''));

  // ---------------------------------------------------------------------------
  // ASM assignment (0 = Kullanımda). Seçilen kabinlerde birer cihaz farklı durumda.
  // ---------------------------------------------------------------------------
  const assignment = {};
  const FIXED = { '1DU06': 2, '1NA06': 4 };
  ALL.forEach(c => {
    const val = FIXED[c.code];
    if (val == null) return;
    const cands = c.assets.filter(a => a.assetType === 'Sunucu' || a.assetType === 'Depolama');
    if (!cands.length) return;
    const a = cands[D.hash(c.code + '-asm-pick') % cands.length];
    assignment[a.id] = val;
  });
  const assignmentOf = a => (a && a.id in assignment ? assignment[a.id] : 0);
  // Varlığın ASM alanlarına assignment'tan gelen düzeltme (hurda → HURDA-DEPO, kabin/U temizlenmiş)
  function asmOverride(a) {
    const v = assignmentOf(a);
    if (!v) return null;
    const o = { assignment: String(v) };
    if (v === 2) Object.assign(o, { locationId: SCRAP_LOCATIONS.length ? SCRAP_LOCATIONS[0].location_id : '', cabinetName: '', position: 0 });
    if (v === 1) Object.assign(o, { stock: 'Veri Merkezi / Zemin Kat Depo-1', cabinetName: '', position: 0 });
    return o;
  }

  // ---------------------------------------------------------------------------
  // Dikey (0U) IT PDU'lar — rafın yanında boydan boya şerit (önden: A sol, B sağ)
  // ---------------------------------------------------------------------------
  const PDU_MODELS = [['APC', 'AP8959EU3'], ['Raritan', 'PX3-5190R'], ['Vertiv', 'Geist rPDU 0U']];
  const vpduCache = {};
  function verticalPdus(cab) {
    if (vpduCache[cab.code]) return vpduCache[cab.code];
    const rnd = D.rng(D.hash(cab.code + '-vpdu'));
    const m = PDU_MODELS[Math.floor(rnd() * PDU_MODELS.length) % PDU_MODELS.length];
    const list = ['A', 'B'].map(side => ({
      id: cab.code + '-VPDU-' + side,
      startU: 0,
      uSize: 0,
      manufacturer: m[0],
      model: m[1],
      displayName: m[0] + ' ' + m[1] + ' (' + side + ')',
      hostname: cab.code.toLowerCase() + '-pdu-' + side.toLowerCase(),
      assetType: 'IT PDU',
      customerType: 'internal',
      customer: company + ' (Dahili)',
      primaryIP: '10.10.' + (40 + cab.code.charCodeAt(2) % 20) + '.' + (side === 'A' ? '11' : '12'),
      serial: m[0].slice(0, 2).toUpperCase() + String(100000000 + (D.hash(cab.code + side) % 899999999)),
      weight: 6,
      powerKw: 0,
      status: 'normal',
      feed: side
    }));
    vpduCache[cab.code] = list;
    return list;
  }

  // SVG yüz çizimi slot kutusunu tam doldursun (raf genişliği gerçek orandan geniş): preserveAspectRatio="none"
  const PFX = 'data:image/svg+xml;charset=utf-8,';
  const stretchCache = {};
  function stretchSvgFace(uri) {
    if (!uri || uri.indexOf(PFX) !== 0) return uri || '';
    if (stretchCache[uri]) return stretchCache[uri];
    let out = uri;
    try {
      const svg = decodeURIComponent(uri.slice(PFX.length));
      if (!/^[^>]*preserveAspectRatio=/.test(svg)) out = PFX + encodeURIComponent(svg.replace(/<svg\b/, '<svg preserveAspectRatio="none"'));
    } catch (e) { /* bozuk URI: olduğu gibi */ }
    stretchCache[uri] = out;
    return out;
  }

  D.cabinetDetail = {
    allCabinets: ALL,
    find: code => D.findCabinet(code),
    floorLabel: c => { const f = floorOf(c.floor); return f ? f.label : ''; },
    assignmentOf,
    asmOverride,
    inUse: a => assignmentOf(a) === 0,
    verticalPdus,
    scrapLocations: SCRAP_LOCATIONS,
    isScrapLocation,
    isScrapLocationId: id => !!id && M.locations.some(l => l.location_id === id && isScrapLocation(l)),
    stretchSvgFace
  };
})();
