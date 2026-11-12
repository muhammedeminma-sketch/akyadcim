/* ==========================================================================
   DCIM Sunum — Salon Planı Yönetimi mock verisi (DCIM.data.spaceEdit)
   SchemaService (SCH kaydı: schema_info.layers + katman blokları) ve SITE_Floors yerine geçer.
   TÜM VERİ KURGUSALDIR: kat yerleşimi window.DCIM_FLOOR_LAYOUTS'tan (js/layout-data.js) gelir;
   tel tava / fiber runner ağları buradaki kurala göre yerleşimden türetilir:
     - her kabin sırasının (col) boyunca bir tel tava hattı (sıranın üst/sol kenarı üzerinden),
     - salon başına bir omurga (sıraların başlangıç ucunu birleştirir),
     - fiber runner aynı düzende sıranın alt/sağ kenarından; omurga ucunda kat geçişi (şaft) işareti.
   Düğüm koordinatları SVG pikselidir (SQL'de grid birimi = piksel / 40).

   API:
     spaceEdit.defaultLayers()           DEFAULT_SCHEMA_LAYERS (schema.service.ts) kopyası, ağlar boş
     spaceEdit.networks(digit)           { 'tel-tava': {nodes, edges}, 'fiber-runner': {nodes, edges} }
     spaceEdit.location(digit)           { city, region, floor, salon } — konum hapı/penceresi metinleri
     spaceEdit.pduDoc(digit)             katın PDU dokümanı (POD yazımı toast metni için)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  // schema.service.ts → DEFAULT_SCHEMA_LAYERS
  const DEFAULT_LAYERS = [
    { id: 'kabin', name: 'Kabin', kind: 'objects', order: 0, visible: true },
    { id: 'klima', name: 'Klima', kind: 'objects', order: 10, visible: true },
    { id: 'klima-panosu', name: 'Klima Panosu', kind: 'objects', order: 20, visible: true },
    { id: 'sdp-ups', name: 'SDP/UPS', kind: 'objects', order: 30, visible: true },
    { id: 'kapi-duvar', name: 'Kapı/Duvar', kind: 'objects', order: 40, visible: true },
    { id: 'mazgal', name: 'Mazgal', kind: 'objects', order: 50, visible: true },
    { id: 'metin', name: 'Metin', kind: 'objects', order: 60, visible: true },
    { id: 'tel-tava', name: 'Tel Tava', kind: 'cable-tray', order: 0, visible: true, width_cm: 30, color: '#64748b' },
    { id: 'fiber-runner', name: 'Fiber Runner', kind: 'fiber-runner', order: 0, visible: true, width_cm: 12, color: '#f59e0b' }
  ];

  const layoutOf = digit => (window.DCIM_FLOOR_LAYOUTS || [])[digit - 1] || null;

  // Kabin sıraları: col → sınır kutusu + yön
  function rowsOf(L) {
    const by = {};
    L.items.filter(i => i.type === 'cabinet').forEach(c => {
      const r = by[c.col] || (by[c.col] = { col: c.col, salon: c.salon, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
      r.x0 = Math.min(r.x0, c.x); r.y0 = Math.min(r.y0, c.y);
      r.x1 = Math.max(r.x1, c.x + c.w); r.y1 = Math.max(r.y1, c.y + c.h); r.n++;
    });
    return Object.values(by).map(r => Object.assign(r, { horizontal: (r.x1 - r.x0) >= (r.y1 - r.y0) }));
  }

  function buildNetwork(L, digit, kind, shift) {
    const nodes = [], edges = [];
    let ni = 0, ei = 0;
    const node = (x, y, riser) => {
      const n = { id: kind + '-n' + (++ni), x: Math.round(x), y: Math.round(y) };
      if (riser) n.riser = riser;
      nodes.push(n);
      return n;
    };
    const edge = (a, b) => edges.push({ id: kind + '-e' + (++ei), a: a.id, b: b.id });
    const rows = rowsOf(L);
    const salons = Array.from(new Set(rows.map(r => r.salon)));
    salons.forEach((salon, si) => {
      const list = rows.filter(r => r.salon === salon);
      const horiz = list.filter(r => r.horizontal).length >= list.length / 2;
      if (horiz) {
        const spineX = Math.min.apply(null, list.map(r => r.x0)) - 26 - shift;
        const starts = list.map(r => {
          const cy = shift ? r.y1 - 7 : r.y0 + 7;
          const a = node(spineX, cy);
          const b = node(r.x1 + 10, cy);
          edge(a, b);
          return a;
        }).sort((p, q) => p.y - q.y);
        for (let i = 1; i < starts.length; i++) edge(starts[i - 1], starts[i]);
        if (kind === 'fiber-runner' && si === 0 && starts.length) {
          const top = starts[0];
          const sh = node(spineX, top.y - 60, digit < 3 ? 'up' : 'down');
          edge(sh, top);
          if (digit === 2) {
            const bot = starts[starts.length - 1];
            const sd = node(spineX, bot.y + 60, 'down');
            edge(bot, sd);
          }
        }
      } else {
        const spineY = Math.min.apply(null, list.map(r => r.y0)) - 26 - shift;
        const starts = list.map(r => {
          const cx = shift ? r.x1 - 7 : r.x0 + 7;
          const a = node(cx, spineY);
          const b = node(cx, r.y1 + 10);
          edge(a, b);
          return a;
        }).sort((p, q) => p.x - q.x);
        for (let i = 1; i < starts.length; i++) edge(starts[i - 1], starts[i]);
        if (kind === 'fiber-runner' && starts.length) {
          const first = starts[0];
          const sh = node(first.x - 60, spineY, si === 0 ? 'down' : 'up');
          edge(sh, first);
        }
      }
    });
    return { nodes, edges };
  }

  const cache = {};
  function networks(digit) {
    if (!cache[digit]) {
      const L = layoutOf(digit);
      cache[digit] = L
        ? { 'tel-tava': buildNetwork(L, digit, 'tel-tava', 0), 'fiber-runner': buildNetwork(L, digit, 'fiber-runner', 14) }
        : { 'tel-tava': { nodes: [], edges: [] }, 'fiber-runner': { nodes: [], edges: [] } };
    }
    return JSON.parse(JSON.stringify(cache[digit]));
  }

  D.spaceEdit = {
    defaultLayers: () => DEFAULT_LAYERS.map(l => Object.assign({}, l)),
    networks,
    location: digit => ({ city: 'Merkez', region: 'DCA Ana Bina', floor: digit + '. Kat', salon: 'GENEL KAT PLANI' }),
    pduDoc: digit => (digit === 1 ? 'CMR/T01' : 'CMR/T0' + digit)
  };
})();
