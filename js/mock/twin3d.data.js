/* ==========================================================================
   DCIM Sunum — 3D Dijital İkiz mock verisi (DCIM.twin3d)
   NewUICMPDigitalTwin3DComponent'in kat / ekipman / ASM / CAT / LNK / şema ağ katmanı kaynaklarının yerine geçer:
     SITE_Floors (kat seçici)                → floors()
     SCH kat öğeleri (kabin + ekipman)       → cabinetsOf(digit), equipmentOf(digit)
     ASM (kabin cihazları + dikey 0U PDU)    → assetsOf(cab)
     CAT.jsn (ön/arka SVG + port şablonu)    → DCIM.data.cabinetMgr.face() (cabinet-detail.html ile aynı çizimler)
     LNK (iki yönlü port bağlantıları)       → portsOf(asset)  — tüm katlar için tohumlu, bir kez üretilir
     schema_info.layers (fiber runner/tava)  → networkOf(digit) + route(digit, from, to)
   Tüm veri kurgusaldır ve tohumludur (DCIM.data.rng / hash); gerçek saha kaydı içermez.
   LNK kuralları cabinetMgr ile aynı sırada çalışır (NIC1 → patch panel, NIC2 → ToR switch); ek olarak
   MGMT / uplink / SAN portları NW sıralarındaki omurga switch'lerine, NW omurgası kat omurgasına (katlar arası)
   ve PSU1/PSU2 kabinin dikey PDU-A/PDU-B prizlerine bağlanır.
   Bağımlılık: js/mock-data.js (DCIM.data, DCIM.data.cabinetMgr)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;
  const M = D.cabinetMgr || null;

  const rngOf = key => D.rng(D.hash(key));
  const between = (r, a, b) => a + (b - a) * r();
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];
  const round1 = v => Math.round(v * 10) / 10;
  const isNwCab = c => /^NW-/.test(c.pod || '');

  // ---------------------------------------------------------------------------
  // Katlar (SITE_Floors karşılığı) ve kat öğeleri
  // ---------------------------------------------------------------------------
  const FLOORS = (D.floors || [])
    .map(f => ({ id: f.id, digit: f.digit, label: f.label, layout: D.layoutOf(f.digit) }))
    .filter(f => f.layout);
  FLOORS.forEach(f => { f.title = f.layout.title || f.label; });

  const floorOf = digit => FLOORS.find(f => f.digit === digit) || FLOORS[0];

  function cabinetsOf(digit) {
    if (digit === 1) return D.cabinets;
    const f = floorOf(digit);
    return D.getLockFloor(f.id).map(k => k.cabinet);
  }

  // Diğer katların ekipmanı (kat 1: DCIM.data.climates / ups / panels) — aynı nokta listesi biçiminde
  const EQ_SCENARIO = {
    2: { 'KLIMA 205': { status: 'warning', note: 'Filtre kirli' }, 'UPS C3': { status: 'warning', note: 'Akü testi gerekli' } },
    3: { 'KLIMA 306': { status: 'warning', note: 'Dönüş havası yüksek' } }
  };
  const eqCache = {};
  function equipmentOf(digit) {
    if (digit === 1) return { climates: D.climates, ups: D.ups, panels: D.panels };
    if (eqCache[digit]) return eqCache[digit];
    const L = D.layoutOf(digit);
    const res = { climates: [], ups: [], panels: [] };
    (L ? L.items : []).forEach(it => {
      if (it.type === 'cabinet') return;
      const rnd = rngOf('twin3d|' + it.label + '|' + it.devId);
      const sc = (EQ_SCENARIO[digit] || {})[it.label] || {};
      const base = {
        id: it.id, label: it.label, devId: it.devId, x: it.x, y: it.y, w: it.w, h: it.h, lo: it.lo, inRow: !!it.inRow,
        status: sc.status || 'normal', note: sc.note || ''
      };
      if (it.type === 'climate') {
        const ret = sc.note === 'Dönüş havası yüksek' ? 28.6 : round1(between(rnd, 23.4, 26.6));
        res.climates.push(Object.assign(base, {
          kind: 'climate',
          points: [
            { label: 'Çalışma Modu', value: 'SOĞUTMA', unit: '', status: 'normal' },
            { label: 'Üfleme Sıcaklığı', value: round1(between(rnd, 15.6, 17.8)), unit: '°C', status: 'normal' },
            { label: 'Dönüş Sıcaklığı', value: ret, unit: '°C', status: ret > 28 ? 'warning' : 'normal' },
            { label: 'Oda Nemi', value: Math.round(between(rnd, 40, 50)), unit: '%', status: 'normal' },
            { label: 'Fan Hızı', value: Math.round(between(rnd, 60, 88)), unit: '%', status: 'normal' },
            { label: 'Kompresör 1 Basınç', value: round1(between(rnd, 16.5, 18.6)), unit: 'bar', status: 'normal' },
            { label: 'Filtre Durumu', value: sc.note === 'Filtre kirli' ? 'KİRLİ' : 'TEMİZ', unit: '', status: sc.note === 'Filtre kirli' ? 'warning' : 'normal' }
          ]
        }));
      } else if (it.type === 'ups') {
        const load = Math.round(between(rnd, 34, 62));
        res.ups.push(Object.assign(base, {
          kind: 'ups',
          points: [
            { label: 'Çalışma Modu', value: 'ONLINE (ŞEBEKE)', unit: '', status: 'normal' },
            { label: 'Giriş Gerilimi (L1)', value: Math.round(between(rnd, 228, 232)), unit: 'V', status: 'normal' },
            { label: 'Çıkış Gerilimi (L1)', value: Math.round(between(rnd, 229, 231)), unit: 'V', status: 'normal' },
            { label: 'Yük Oranı', value: load, unit: '%', status: 'normal' },
            { label: 'Akü Kapasitesi', value: sc.status ? 88 : 100, unit: '%', status: sc.status ? 'warning' : 'normal' },
            { label: 'Kalan Akü Süresi', value: Math.round(between(rnd, 32, 48)), unit: 'dk', status: 'normal' },
            { label: 'Akü Sıcaklığı', value: round1(between(rnd, 22.4, 24.8)), unit: '°C', status: 'normal' }
          ]
        }));
      } else {
        const l1 = round1(between(rnd, 38, 58));
        res.panels.push(Object.assign(base, {
          kind: 'panel',
          points: [
            { label: 'L1 Akım', value: l1, unit: 'A', status: 'normal' },
            { label: 'L2 Akım', value: round1(l1 * between(rnd, 0.94, 1.06)), unit: 'A', status: 'normal' },
            { label: 'L3 Akım', value: round1(l1 * between(rnd, 0.94, 1.06)), unit: 'A', status: 'normal' },
            { label: 'Toplam Aktif Güç', value: round1(l1 * 0.66), unit: 'kW', status: 'normal' },
            { label: 'Güç Faktörü', value: '0.97', unit: '', status: 'normal' },
            { label: 'THD-I', value: round1(between(rnd, 2.6, 4.1)), unit: '%', status: 'normal' }
          ]
        }));
      }
    });
    eqCache[digit] = res;
    return res;
  }

  // ---------------------------------------------------------------------------
  // Cihaz yüz çizimleri: CAT SVG (cabinetMgr.face) + dikey 0U PDU şeridi
  // ---------------------------------------------------------------------------
  const PFX = 'data:image/svg+xml;charset=utf-8,';
  const svgUri = svg => PFX + encodeURIComponent(svg);
  const t = (x, y, size, color, str, w) => '<text x="' + x + '" y="' + y + '" font-family="Arial, Helvetica, sans-serif" font-size="' + size + '" font-weight="' + (w || 700) + '" fill="' + color + '">' + str + '</text>';

  // Dikey PDU yüzü yatay çizilir (görselin solu = şeridin üstü; 3D'de şerit boyunca yerleşir)
  const pduFaceCache = {};
  function pduFace(feed, side) {
    const key = feed + '|' + side;
    if (pduFaceCache[key]) return pduFaceCache[key];
    const W = 800, H = 72;
    const ports = [];
    let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="4" fill="#111827"/>' +
      '<rect x="3" y="3" width="' + (W - 6) + '" height="' + (H - 6) + '" rx="3" fill="#1f2937" stroke="' + (feed === 'A' ? '#16a34a' : '#2563eb') + '" stroke-width="2"/>';
    if (side === 'front') {
      s += '<rect x="14" y="14" width="96" height="44" rx="3" fill="#052e16" stroke="#22c55e" stroke-width="1.5"/>' +
        t(24, 34, 13, '#4ade80', 'PDU-' + feed) + t(24, 50, 10, '#86efac', '230V 32A', 600);
      for (let i = 0; i < 24; i++) {
        const cx = 140 + i * 26.5;
        s += '<rect x="' + (cx - 10) + '" y="22" width="20" height="28" rx="3" fill="#0b0e12" stroke="#94a3b8" stroke-width="1"/>' +
          '<rect x="' + (cx - 5) + '" y="30" width="3" height="8" fill="#94a3b8"/><rect x="' + (cx + 2) + '" y="30" width="3" height="8" fill="#94a3b8"/>' +
          '<circle cx="' + cx + '" cy="16" r="2" fill="#22c55e"/>';
        ports.push({ name: 'OUT' + String(i + 1).padStart(2, '0'), type: 'power', x: +(cx / W).toFixed(4), y: +(36 / H).toFixed(4) });
      }
    } else {
      s += t(24, 42, 14, '#94a3b8', 'PDU-' + feed + ' · IEC 60309 32A GİRİŞ') +
        '<circle cx="700" cy="36" r="20" fill="#0b0e12" stroke="#f59e0b" stroke-width="2"/>' + t(686, 41, 11, '#f59e0b', 'IN');
      ports.push({ name: 'IN', type: 'power', x: +(700 / W).toFixed(4), y: 0.5 });
    }
    s += '</svg>';
    pduFaceCache[key] = { img: svgUri(s), ports };
    return pduFaceCache[key];
  }

  function faceOf(asset, side) {
    if (asset.zeroU) return pduFace(asset.feed, side);
    return M && asset.raw ? M.face(asset.raw, side) : null;
  }

  // ---------------------------------------------------------------------------
  // ASM: kabinin cihazları (3D ve kabin detay paneli için) + dikey 0U PDU-A / PDU-B
  // ---------------------------------------------------------------------------
  const ASSET_INDEX = {}; // asset id -> { asset, cab, floor }
  const assetCache = {};

  function assetsOf(cab) {
    if (assetCache[cab.code]) return assetCache[cab.code];
    const list = (cab.assets || []).map(a => {
      const cat = M ? M.findCatalog(a.manufacturer || '', a.model || '') : null;
      return {
        id: a.id, cabinetId: cab.id, cabinetName: cab.code, name: a.displayName, devId: a.hostname, label: a.assetType, type: a.assetType,
        uStart: a.startU, uSize: a.uSize, uEnd: a.startU + a.uSize - 1, zeroU: false,
        status: 'ok', ip: a.primaryIP || '—', serial: a.serial, powerKw: (a.powerKw || 0).toFixed(2),
        modelId: cat ? cat.model_id : '', raw: a
      };
    });
    ['A', 'B'].forEach((feed, i) => {
      const fault = feed === 'B' && cab.pduFault;
      list.push({
        id: cab.code + '-PDU-' + feed, cabinetId: cab.id, cabinetName: cab.code, name: 'PDU-' + feed + ' (Besleme ' + feed + ')',
        devId: 'K' + cab.code + '_PDU_' + feed, label: 'PDU', type: 'PDU', uStart: 0, uSize: 0, uEnd: 0, zeroU: true, vpduIndex: i, feed,
        status: fault ? 'critical' : 'ok', ip: '10.10.' + (40 + cab.code.charCodeAt(2) % 20) + '.' + (feed === 'A' ? '11' : '12'),
        serial: 'PD' + (D.hash(cab.code + feed) % 90000000 + 10000000), powerKw: ((feed === 'A' ? cab.pduA : cab.pduB) * 0.23).toFixed(2),
        modelId: 'PDU-0U-24', raw: null
      });
    });
    assetCache[cab.code] = list;
    return list;
  }

  // ---------------------------------------------------------------------------
  // LNK: iki yönlü port bağlantıları (tüm katlar, ilk erişimde bir kez)
  // ---------------------------------------------------------------------------
  const NOTES = ['Kablo etiketlendi, bağlantı test cihazıyla doğrulandı.', 'Yeni devreye alma — İE-2026-0744 kapsamında çekildi.', 'Port yeniden eşleştirildi, eski bağlantı sökülüp raporlandı.', 'Yedekli bağlantı; LACP grubu Po1 üyesi.', 'Müşteri talebi ile aktif edildi.'];
  let LNK = null;

  function buildLnk() {
    LNK = {};
    let seq = 0;
    const setEnd = (a, port, side, b, bPort, bSide, info) => {
      (LNK[a.id] = LNK[a.id] || {})[port] = Object.assign({ peer: b, peerPort: bPort, peerSide: bSide }, info);
    };
    const taken = (a, port) => !!(LNK[a.id] && LNK[a.id][port]);
    const link = (a, aPort, aSide, b, bPort, bSide, type) => {
      if (!a || !b || a.id === b.id || taken(a, aPort) || taken(b, bPort)) return false;
      seq++;
      const r = rngOf(a.id + '|' + aPort + '|lnk');
      const info = { lnkId: String(40000 + seq), type, status: r() < 0.93 ? 'Aktif' : 'Planlı', description: pick(r, NOTES) };
      setEnd(a, aPort, aSide, b, bPort, bSide, info);
      setEnd(b, bPort, bSide, a, aPort, aSide, info);
      return true;
    };

    const floorCabs = {};
    FLOORS.forEach(f => {
      floorCabs[f.digit] = cabinetsOf(f.digit);
      floorCabs[f.digit].forEach(c => assetsOf(c).forEach(a => { ASSET_INDEX[a.id] = { asset: a, cab: c, floor: f.digit }; }));
    });

    // Omurga havuzu: NW sıralarındaki switch'ler (kat 3'te NW sırası yok: kat 2 omurgası kullanılır)
    const capOf = a => (a.uSize > 1 ? 24 : 12);
    const pools = {};
    FLOORS.forEach(f => {
      const sw = [];
      floorCabs[f.digit].filter(isNwCab).forEach(c => assetsOf(c).forEach(a => { if (a.type === 'Switch') sw.push(a); }));
      pools[f.digit] = { sw, used: {}, ptr: 0 };
    });
    const poolFor = digit => (pools[digit] && pools[digit].sw.length ? pools[digit] : pools[2] && pools[2].sw.length ? pools[2] : pools[1]);
    const alloc = (pool, exclCab) => {
      if (!pool || !pool.sw.length) return null;
      // havuzda serpiştir: ardışık bağlantılar farklı switch'lere düşsün; adım havuz boyuyla aralarında asal
      // olmalı (aksi hâlde 7'nin katı boyutlu havuzda yalnız bir alt küme dolaşılır)
      const gcd = (x, y) => (y ? gcd(y, x % y) : x);
      let step = 7;
      while (gcd(step, pool.sw.length) !== 1) step++;
      for (let k = 0; k < pool.sw.length; k++) {
        const sw = pool.sw[pool.ptr % pool.sw.length];
        pool.ptr += step;
        if (ASSET_INDEX[sw.id].cab === exclCab) continue;
        const n = (pool.used[sw.id] || 0) + 1;
        if (n <= capOf(sw)) { pool.used[sw.id] = n; return { sw, port: String(n) }; }
      }
      return null;
    };

    // Üst kattan başlanır: NW sırası olmayan kat 3, kat 2 omurgasında yer bulsun
    FLOORS.slice().sort((a, b) => b.digit - a.digit).forEach(f => {
      const pool = poolFor(f.digit);
      floorCabs[f.digit].forEach(c => {
        const list = assetsOf(c);
        const nw = isNwCab(c);
        const pp = list.find(a => a.type === 'Patch Panel');
        const tor = nw ? null : list.find(a => a.type === 'Switch');
        let ppN = 0, torN = 0;
        const out = { A: 0, B: 0 };
        const pdu = feed => list.find(a => a.zeroU && a.feed === feed);
        const toPP = (a, port) => { if (pp && ppN < 24) { ppN++; link(a, port, 'back', pp, String(ppN), 'front', 'Cat6A U/FTP'); } };
        const toNet = (a, port, side, type, p) => { const n = alloc(p || pool, c); if (n) link(a, port, side, n.sw, n.port, 'front', type); };
        const toTor = (a, port, side) => {
          if (tor && tor.id !== a.id && torN < capOf(tor)) { torN++; link(a, port, side, tor, String(torN), 'front', 'Cat6A U/FTP'); return; }
          toNet(a, port, side, 'Cat6A U/FTP');
        };
        const toPower = a => {
          if (!(parseFloat(a.powerKw) > 0)) return;
          ['A', 'B'].forEach(feed => {
            const p = pdu(feed);
            if (p && out[feed] < 24) { out[feed]++; link(a, 'PSU' + (feed === 'A' ? 1 : 2), 'back', p, 'OUT' + String(out[feed]).padStart(2, '0'), 'front', 'C13-C14 Güç Kablosu'); }
          });
        };
        // Kablolama politikası (sunum): kabin içi veri bağlantısı çok az (~%10, yalnız patch panel);
        // veri bağlantıları fiber runner / tel tava üzerinden NW omurgasına gider, bir kısmı kat geçişiyle
        // başka katın omurgasına bağlanır. Güç (PSU → PDU) doğal olarak kabin içindedir.
        const otherPool = r => {
          const ds = FLOORS.map(x => x.digit).filter(d => d !== f.digit && pools[d] && pools[d].sw.length);
          return ds.length ? pools[ds[Math.floor(r() * ds.length) % ds.length]] : null;
        };
        const toFloor = (a, port, side, type, r) => { const p = otherPool(r); if (p) toNet(a, port, side, type, p); else toNet(a, port, side, type); };
        list.forEach(a => {
          if (a.zeroU) return;
          const r = rngOf(a.id + '|ports');
          if (a.type === 'Sunucu') {
            if (r() < 0.1) toPP(a, 'NIC1');
            else toNet(a, 'NIC1', 'back', 'OM4 LC-LC (Fiber Runner)');
            if (r() < 0.18) toFloor(a, 'NIC2', 'back', 'OS2 LC-LC (Kat Geçişi)', r);
            else toNet(a, 'NIC2', 'back', 'OM4 LC-LC (Fiber Runner)');
            if (r() < 0.5) toNet(a, 'MGMT', 'back', 'Cat6 (OOB Yönetim · Tel Tava)');
            if (r() < 0.35) toFloor(a, 'SFP1', 'back', 'OS2 LC-LC (Kat Geçişi)', r);
          } else if (a.type === 'Depolama') {
            if (r() < 0.1) toPP(a, 'A-MG'); else toNet(a, 'A-MG', 'back', 'Cat6 (Yönetim · Tel Tava)');
            toNet(a, 'A-FC1', 'back', 'OM4 LC-LC (SAN-A)');
            if (r() < 0.4) toFloor(a, 'B-FC1', 'back', 'OS2 LC-LC (SAN-B · Kat Geçişi)', r);
            else toNet(a, 'B-FC1', 'back', 'OM4 LC-LC (SAN-B)');
          } else if (a.type === 'Switch' && !nw) {
            toNet(a, 'U1', 'front', 'OS2 LC-LC (Uplink)');
            if (r() < 0.35) toFloor(a, 'U2', 'front', 'OS2 LC-LC (Uplink · Kat Geçişi)', r);
            else toNet(a, 'U2', 'front', 'OS2 LC-LC (Uplink)');
            if (r() < 0.1) toPP(a, 'MGMT'); else toNet(a, 'MGMT', 'back', 'Cat6 (Yönetim · Tel Tava)');
          } else if (a.type === 'Switch' && nw) {
            // Omurga: U1 diğer NW kabinine (aynı kat), U2 başka katın omurgasına (kat geçişi)
            toNet(a, 'U1', 'front', 'OS2 LC-LC (Omurga)');
            if (r() < 0.85) toFloor(a, 'U2', 'front', 'OS2 LC-LC (Kat Omurgası)', r);
          } else if (a.type === 'Router' || a.type === 'Firewall') {
            toNet(a, 'X1', 'front', 'OM4 LC-LC (Fiber Runner)');
            if (r() < 0.4) toFloor(a, 'X2', 'front', 'OS2 LC-LC (Kat Geçişi)', r);
            else toNet(a, 'X2', 'front', 'OM4 LC-LC (Fiber Runner)');
          }
          toPower(a);
        });
      });
    });
  }

  const uRange = a => (a.zeroU ? '0U' : String(a.uStart) + (a.uSize > 1 ? '-' + (a.uStart + a.uSize - 1) : ''));

  /** Cihazın portları (CAT şablonu + LNK) — cable-trace.util buildDevicePorts karşılığı (DcimPort). */
  function portsOf(asset) {
    if (!LNK) buildLnk();
    const out = [];
    ['front', 'back'].forEach(side => {
      const f = faceOf(asset, side);
      if (!f) return;
      f.ports.forEach((p, i) => {
        const l = (LNK[asset.id] || {})[p.name];
        const peer = l ? ASSET_INDEX[l.peer.id] : null;
        out.push({
          portKey: side + '|' + asset.id + '_' + side + '_' + i + '|' + p.name,
          id: asset.id + '_' + side + '_' + i,
          name: p.name,
          side,
          x: p.x,
          y: p.y,
          hasPosition: true,
          media: p.type || '',
          connected: !!l,
          lnkId: l ? l.lnkId : '',
          linkType: l ? l.type : '',
          linkStatus: l ? l.status : '',
          description: l ? l.description : '',
          remote: l && peer ? {
            assetId: l.peer.id,
            deviceType: l.peer.type,
            device: l.peer.name,
            cabinet: peer.cab.code,
            floor: peer.floor,
            uplace: uRange(l.peer),
            ucapacity: String(l.peer.uSize || 0),
            portId: l.peerPort,
            portLabel: l.peerPort,
            side: l.peerSide
          } : null
        });
      });
    });
    return out;
  }

  function findAsset(id) {
    if (!LNK) buildLnk();
    return ASSET_INDEX[id] || null;
  }

  // ---------------------------------------------------------------------------
  // Şema ağ katmanı: fiber runner / tel tava (kabin sıraları üstünde + omurga + kat geçişi)
  // Kat planı pikseli; düğüm/kenar grafiği ve en kısa yol (findCablePath karşılığı)
  // ---------------------------------------------------------------------------
  const RISER_X = 980; // kat geçişi (şaft): tüm katlarda aynı plan noktası, salonlar arası duvar hattı
  const netCache = {};

  function networkOf(digit) {
    if (netCache[digit]) return netCache[digit];
    const L = D.layoutOf(digit);
    const cabs = (L ? L.items : []).filter(i => i.type === 'cabinet');
    const segs = [];
    const H = (x1, x2, y) => segs.push({ a: { x: Math.min(x1, x2), y }, b: { x: Math.max(x1, x2), y } });
    const V = (x, y1, y2) => segs.push({ a: { x, y: Math.min(y1, y2) }, b: { x, y: Math.max(y1, y2) } });
    if (!cabs.length) return (netCache[digit] = { segs, riser: null, graph: null });
    const minX = Math.min.apply(null, cabs.map(c => c.x)), maxX = Math.max.apply(null, cabs.map(c => c.x + c.w));
    const minY = Math.min.apply(null, cabs.map(c => c.y));
    const spineY = minY - 45;
    H(minX - 30, maxX + 30, spineY);

    const groups = {};
    cabs.forEach(c => {
      const horiz = c.facing === 'N' || c.facing === 'S';
      const key = (c.salon || 'S1') + '|' + (horiz ? 'H' : 'V');
      const g = (groups[key] = groups[key] || { horiz, rows: {} });
      const line = Math.round(horiz ? c.y + c.h / 2 : c.x + c.w / 2);
      const row = (g.rows[line] = g.rows[line] || { line, lo: Infinity, hi: -Infinity });
      row.lo = Math.min(row.lo, horiz ? c.x : c.y);
      row.hi = Math.max(row.hi, horiz ? c.x + c.w : c.y + c.h);
    });
    Object.keys(groups).forEach(k => {
      const g = groups[k];
      const rows = Object.keys(g.rows).map(n => g.rows[n]);
      const lo = Math.min.apply(null, rows.map(r => r.lo)) - 30, hi = Math.max.apply(null, rows.map(r => r.hi)) + 30;
      const lineMax = Math.max.apply(null, rows.map(r => r.line));
      if (g.horiz) {
        rows.forEach(r => H(lo, hi, r.line));
        V(lo, spineY, lineMax);
        V(hi, spineY, lineMax);
      } else {
        const lineMin = Math.min.apply(null, rows.map(r => r.line));
        rows.forEach(r => V(r.line, spineY, hi));
        H(lineMin, lineMax, hi);
      }
    });
    const riser = { x: Math.max(minX - 30, Math.min(maxX + 30, RISER_X)), y: spineY - 40 };
    V(riser.x, riser.y, spineY);
    const net = { segs, riser, spineY, graph: buildGraph(segs) };
    netCache[digit] = net;
    return net;
  }

  function buildGraph(segs) {
    const key = p => p.x.toFixed(1) + ',' + p.y.toFixed(1);
    const nodes = {};
    const node = p => { const k = key(p); if (!nodes[k]) nodes[k] = { k, x: p.x, y: p.y, adj: [] }; return nodes[k]; };
    const edges = [];
    segs.forEach((s, i) => {
      const horiz = s.a.y === s.b.y;
      const cuts = [s.a, s.b];
      segs.forEach((o, j) => {
        if (i === j) return;
        const oh = o.a.y === o.b.y;
        if (horiz === oh) {
          // Aynı doğrultuda üst üste / uç uca: uç noktaları kesim olur
          [o.a, o.b].forEach(p => {
            if (horiz && p.y === s.a.y && p.x > s.a.x && p.x < s.b.x) cuts.push(p);
            if (!horiz && p.x === s.a.x && p.y > s.a.y && p.y < s.b.y) cuts.push(p);
          });
          return;
        }
        const h = horiz ? s : o, v = horiz ? o : s;
        const x = v.a.x, y = h.a.y;
        if (x >= h.a.x - 0.01 && x <= h.b.x + 0.01 && y >= v.a.y - 0.01 && y <= v.b.y + 0.01) cuts.push({ x, y });
      });
      cuts.sort((p, q) => (horiz ? p.x - q.x : p.y - q.y));
      for (let k = 1; k < cuts.length; k++) {
        const a = node(cuts[k - 1]), b = node(cuts[k]);
        if (a === b) continue;
        const w = Math.hypot(b.x - a.x, b.y - a.y);
        a.adj.push({ n: b, w });
        b.adj.push({ n: a, w });
        edges.push({ a, b });
      }
    });
    return { nodes, edges };
  }

  function project(graph, p) {
    let best = null;
    graph.edges.forEach(e => {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const L2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((p.x - e.a.x) * dx + (p.y - e.a.y) * dy) / L2));
      const q = { x: e.a.x + dx * k, y: e.a.y + dy * k };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (!best || d < best.d) best = { d, q, e };
    });
    return best;
  }

  /** Ağ üzerinde en kısa yol (plan pikseli): [giriş izdüşümü, ...düğümler, çıkış izdüşümü]. to null ise kat geçişine. */
  function route(digit, from, to) {
    const net = networkOf(digit);
    if (!net.graph || !net.graph.edges.length) return null;
    const s = project(net.graph, from);
    const goal = to ? project(net.graph, to) : project(net.graph, net.riser);
    if (!s || !goal) return null;
    if (s.e === goal.e || (s.e.a === goal.e.b && s.e.b === goal.e.a)) return [s.q, goal.q];
    // Dijkstra: sanal başlangıç izdüşümü kenarın iki ucuna bağlanır
    const dist = new Map(), prev = new Map(), done = new Set();
    const dd = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    dist.set(s.e.a, dd(s.q, s.e.a));
    dist.set(s.e.b, dd(s.q, s.e.b));
    const targets = new Map([[goal.e.a, dd(goal.e.a, goal.q)], [goal.e.b, dd(goal.e.b, goal.q)]]);
    let bestEnd = null, bestLen = Infinity;
    for (;;) {
      let u = null, du = Infinity;
      dist.forEach((v, n) => { if (!done.has(n) && v < du) { du = v; u = n; } });
      if (!u || du >= bestLen) break;
      done.add(u);
      if (targets.has(u) && du + targets.get(u) < bestLen) { bestLen = du + targets.get(u); bestEnd = u; }
      u.adj.forEach(({ n, w }) => {
        const nd = du + w;
        if (nd < (dist.has(n) ? dist.get(n) : Infinity)) { dist.set(n, nd); prev.set(n, u); }
      });
    }
    if (!bestEnd) return null;
    const path = [];
    for (let n = bestEnd; n; n = prev.get(n)) path.unshift({ x: n.x, y: n.y });
    return [s.q].concat(path, [goal.q]);
  }

  /** PDF/SVG yüz çizimi slot kutusunu tam doldursun diye preserveAspectRatio="none" (cabinet-inspector stretchSvgFace). */
  function stretch(uri) {
    if (!uri || uri.indexOf(PFX) !== 0) return uri || '';
    try {
      const svg = decodeURIComponent(uri.slice(PFX.length));
      if (/^[^>]*preserveAspectRatio=/.test(svg)) return uri;
      return PFX + encodeURIComponent(svg.replace(/<svg\b/, '<svg preserveAspectRatio="none"'));
    } catch (e) { return uri; }
  }

  DCIM.twin3d = {
    floors: () => FLOORS,
    floorOf,
    cabinetsOf,
    equipmentOf,
    assetsOf,
    portsOf,
    faceOf,
    findAsset,
    networkOf,
    route,
    stretch
  };
})();
