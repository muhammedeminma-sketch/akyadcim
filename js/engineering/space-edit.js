/* ==========================================================================
   DCIM Sunum — Salon Planı Yönetimi (NewUICMPSpaceEditComponent, "2D ŞEMASI DÜZENLEME")
   Kaynak: new-ui/pages/engineering/space-edit/space-edit.component.{html,ts} + schematic-viewer
           + core/services/schema.service.ts (DEFAULT_SCHEMA_LAYERS, ağ katmanları).
   Görünüm kipi: konum hapı, "Lokasyon Değiştir", "Düzenle". Düzenleme kipi (yalnız Admin; sunumda admin):
   - Üst araç çubuğu: Harita Başlığı, Geri Al / Yinele, İçe Aktar, Dışa Aktar (JSON / SVG / DWG), Şemayı Temizle
   - Sol panel: Görünüm & Ayarlar (Kroki Görünümü, Grid'e Hizala, Grid Boyutu, Grid Konumunu Sıfırla),
     Katmanlar (9 varsayılan katman; göz = görünürlük, satır = hedef katman + gösterim seçimi, yeni katman,
     boş katmanı sil, "Seçimi … katmanına taşı"), Düzenleme Paneli (Seçim & Düzenle, Metin Ekle, Grid Sürükle,
     Tel Tava Çiz / Fiber Runner Çiz + Çiz/Sil/Kat Geçişi, Kablo Yolu (En Kısa)), SEÇİLİ NESNE (Metni Düzenle,
     Sil, Kabin Yönü (Ön Yüz) Üst/Alt/Sol/Sağ toplu, POD Grubu: POD'a Ekle / POD'dan Çıkar, Seçimi Temizle),
     Yardım ve Bilgilendirme.
   - Kaydet → değişiklik yoksa düzenleme biter; varsa Önizleme penceresi (Eklenen/Silinen/Değişen/Taşınan,
     Mevcut / Değiştirilecek) → Uygula / İptal Et / Düzenlemeye Devam Et.
   Fare: sol sürükle boş alan = kaydır, tekerlek = yakınlaştır, öğe sürükle = taşı, Ctrl+tık = seçime ekle/çıkar,
   orta tuş (ya da Shift+sol) sürükle = kutu seçimi. Klavye: Ctrl+Z / Ctrl+Y, Delete, Esc.

   Sunum farkları: veri kurgusal kat yerleşimidir (window.DCIM_FLOOR_LAYOUTS; js/mock/eng-space-edit.data.js).
   "Uygula" SCH'ye yazmaz; şema bu sekmenin oturumunda (sessionStorage 'dcim_space_edit_v1') tutulur.
   POD ataması orijinaldeki gibi hemen "yazılır" (katın PDU dokümanı) — sunumda yine oturumda tutulur.
   Kabin ön yüz işareti (kabin kenarındaki mavi çizgi) ve "POD Grupları" listesi sunum ekidir (orijinal
   şematikte yön çizilmez; POD paneli yalnız seçimle açılır). DXF içe aktarma / DWG dışa aktarma devre dışı.

   Derin bağlantılar (engineering.html#space-edit?...):
     ?floor=1|2|3                kat (varsayılan 1)
     ?edit=1                     doğrudan düzenleme kipi
     ?select=1DA01,1DA02         kabinleri seç (etikete göre) + seçime yakınlaş   (düzenleme kipini açar)
     ?pod=POD-3                  POD'un kabinlerini seç ve sınırını vurgula        (düzenleme kipini açar)
     ?facing=N|S|E|W             seçime ön yüz yönünü uygula (select/pod ile)
     ?panel=layers|facing|pod|runner   ilgili bölüme kaydır ve vurgula (runner: Fiber Runner çizim aracı)
     ?tool=select|text|draggrid|network|cablepath  &layer=tel-tava|fiber-runner  &mode=draw|erase|riser
     ?solo=tel-tava,fiber-runner yalnız bu katmanları göster
     ?path=1NA01,1DP05           Kablo Yolu (En Kısa) sonucunu çiz (kat 2: 2EA01,2EG05; salonlar arası ağ bağlantısız)
     ?save=1                     (edit ile) Kaydet önizlemesini açar
     ?reset=1                    oturumdaki şema değişikliklerini sil
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, toast, dialog, storage, button } = DCIM.ui;
  const kit = DCIM.kit;

  const STORE_KEY = 'dcim_space_edit_v1';
  const ADMIN_ONLY_MESSAGE = 'Bu düzenlemeleri yalnızca Admin yetkisine sahip kullanıcılar yapabilir';
  const GRID_UNIT_OPTIONS = [20, 40, 60, 80];
  const GRID_UNIT_MIN = 10, GRID_UNIT_MAX = 200;
  const TYPE_LAYER = { cabinet: 'kabin', climate: 'klima', 'climate-panel': 'klima-panosu', ups: 'sdp-ups' };
  const TYPE_CLS = { cabinet: 'se-cab', climate: 'se-clm', 'climate-panel': 'se-pnl', ups: 'se-ups' };
  const FACING_OPTS = [{ v: 'N', label: 'Üst' }, { v: 'S', label: 'Alt' }, { v: 'W', label: 'Sol' }, { v: 'E', label: 'Sağ' }];
  const KIND_RANK = { objects: 0, 'cable-tray': 1, 'fiber-runner': 2 };
  const POD_RE = /^(POD|NW)-\d+$/;

  // EXPORT: dışa aktarılan SVG'nin kendi içinde okunabilmesi için (açık tema)
  const EXPORT_CSS = '.se-wall{fill:none;stroke:#94a3b8;stroke-width:1.2}.se-salon{fill:none;stroke:#cbd5e1;stroke-dasharray:6 4}' +
    '.se-salon-name{fill:#64748b;font:700 13px sans-serif}.se-l1{fill:rgba(148,163,184,.08);stroke:#94a3b8}.se-body{stroke:#797979}' +
    '.se-cab{fill:#e2e8f0}.se-clm{fill:#dbeafe}.se-pnl{fill:#fef3c7}.se-ups{fill:#d1fae5}.se-label{fill:#0f172a;font:700 11px sans-serif}' +
    '.se-face{stroke:#0ea5e9;stroke-width:3}.se-text{fill:#0f172a;font:700 11px sans-serif}.se-text.is-pod{font-size:15px}' +
    '.se-edge{fill:none;stroke-linecap:round;opacity:.85}.se-edge-hit,.se-text-hit{display:none}.se-riser{fill:#7c3aed}.se-riser-t{fill:#fff;font:800 11px sans-serif}';

  const clone = o => JSON.parse(JSON.stringify(o));
  const layoutOf = digit => (window.DCIM_FLOOR_LAYOUTS || [])[digit - 1] || null;
  const sortLayers = ls => ls.slice().sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.order - b.order);
  const fmt = (n, d) => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: d || 0 });

  // ---------------------------------------------------------------------------
  // Kat şeması (SchemaInfo + öğeler) — kurgusal yerleşimden
  // ---------------------------------------------------------------------------
  function initialFloor(digit) {
    const L = layoutOf(digit);
    const nets = DCIM.data.spaceEdit.networks(digit);
    return {
      digit,
      schemaId: L.schId,
      title: L.title,
      gridOffsetX: 0,
      gridOffsetY: 0,
      items: L.items.map(i => ({
        id: i.id, type: i.type, label: i.label, x: i.x, y: i.y, w: i.w, h: i.h,
        facing: i.type === 'cabinet' ? (i.facing || null) : null, pod: i.pod || null, layerId: TYPE_LAYER[i.type] || 'kabin'
      })),
      texts: L.texts.map((t, k) => ({ id: 'txt_' + digit + '_' + k, text: t.text, x: t.x, y: t.y, kind: POD_RE.test(t.text) ? 'text-pod' : 'text', layerId: 'metin' })),
      layers: DCIM.data.spaceEdit.defaultLayers().map(l => l.kind === 'objects' ? l : Object.assign(l, { network: nets[l.id] || { nodes: [], edges: [] } }))
    };
  }

  function readStore() {
    try { return JSON.parse(storage.sessionGet(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function loadFloor(digit) {
    const s = readStore();
    return s[digit] ? s[digit] : initialFloor(digit);
  }
  function persistFloor(fs) {
    const s = readStore();
    s[fs.digit] = fs;
    storage.sessionSet(STORE_KEY, JSON.stringify(s));
  }

  function resolvePod(raw) {
    const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    let m;
    if ((m = s.match(/^(\d+)$/))) return 'POD-' + Number(m[1]);
    if ((m = s.match(/^POD-?(\d+)$/))) return 'POD-' + Number(m[1]);
    if ((m = s.match(/^(NW|NS)-?(\d+)$/))) return 'NW-' + Number(m[2]);
    return '';
  }

  // ---------------------------------------------------------------------------
  // SVG içerik üretimi (ana tuval + önizleme)
  // ---------------------------------------------------------------------------
  function layerVisibleFn(fs, solo) {
    const map = {};
    fs.layers.forEach(l => { map[l.id] = l.visible && (!solo || !solo.size || solo.has(l.id)); });
    return id => map[id] !== false && map[id] !== undefined;
  }

  function facingLine(it) {
    const p = 3;
    switch (it.facing) {
      case 'N': return [it.x + p, it.y + 2, it.x + it.w - p, it.y + 2];
      case 'S': return [it.x + p, it.y + it.h - 2, it.x + it.w - p, it.y + it.h - 2];
      case 'W': return [it.x + 2, it.y + p, it.x + 2, it.y + it.h - p];
      case 'E': return [it.x + it.w - 2, it.y + p, it.x + it.w - 2, it.y + it.h - p];
      default: return null;
    }
  }

  function itemSvg(it, opt) {
    const cls = 'se-item' + (opt.sel && opt.sel.has(it.id) ? ' is-sel' : '') + (opt.pick && opt.pick.indexOf(it.label) >= 0 ? ' is-pick' : '') +
      (opt.diff && opt.diff[it.id] ? ' se-diff-' + opt.diff[it.id] : '');
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    const rot = it.h > it.w * 1.4 && String(it.label).length * 6.4 > it.w - 4;
    const fl = facingLine(it);
    return '<g class="' + cls + '"' + (opt.interactive ? ' data-se-item="' + esc(it.id) + '"' : '') + '>' +
      '<rect class="se-body ' + (TYPE_CLS[it.type] || 'se-cab') + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" rx="2" ry="2">' +
        '<title>' + esc(it.label + (it.pod ? ' · ' + it.pod : '') + (it.facing ? ' · ön yüz ' + (FACING_OPTS.find(f => f.v === it.facing) || {}).label : '')) + '</title></rect>' +
      (fl ? '<line class="se-face" x1="' + fl[0] + '" y1="' + fl[1] + '" x2="' + fl[2] + '" y2="' + fl[3] + '" />' : '') +
      '<text class="se-label" x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central"' +
        (rot ? ' transform="rotate(-90 ' + cx + ' ' + cy + ')"' : '') + (it.type === 'cabinet' ? '' : ' style="font-size:10px"') + '>' + esc(it.label) + '</text>' +
    '</g>';
  }

  function textSvg(t, opt) {
    const isSel = opt.sel && opt.sel.has(t.id);
    const fs = t.kind === 'text-pod' ? 15 : 11;
    const w = Math.max(20, String(t.text).length * fs * 0.62), h = fs + 8;
    return '<g class="se-text-g' + (isSel ? ' is-sel' : '') + '"' + (opt.interactive ? ' data-se-text="' + esc(t.id) + '"' : '') + '>' +
      '<rect class="se-text-hit" x="' + (t.x - w / 2) + '" y="' + (t.y - h / 2) + '" width="' + w + '" height="' + h + '" rx="2" />' +
      '<text class="se-text' + (t.kind === 'text-pod' ? ' is-pod' : '') + (isSel ? ' is-sel' : '') + '" x="' + t.x + '" y="' + t.y + '" text-anchor="middle" dominant-baseline="central">' + esc(t.text) + '</text>' +
    '</g>';
  }

  function networkSvg(layer, opt) {
    const net = layer.network || { nodes: [], edges: [] };
    const byId = {};
    net.nodes.forEach(n => { byId[n.id] = n; });
    const w = Math.max(2, (layer.width_cm || 20) / 3.75);
    const erasable = opt.interactive && opt.tool === 'network' && opt.netMode === 'erase' && opt.netLayer === layer.id;
    // Ağ yalnız kendi çizim aracı açıkken tıklanır; diğer araçlarda alttaki kabinlerin seçimini engellemez
    const live = opt.interactive && opt.tool === 'network' && opt.netLayer === layer.id;
    let s = '<g data-se-net="' + esc(layer.id) + '"' + (live ? '' : ' class="pointer-events-none"') + '>';
    net.edges.forEach(e => {
      const a = byId[e.a], b = byId[e.b];
      if (!a || !b) return;
      s += '<g class="se-edge-g' + (erasable ? ' is-erasable' : '') + '"' + (opt.interactive ? ' data-se-edge="' + esc(e.id) + '" data-se-edge-layer="' + esc(layer.id) + '"' : '') + '>' +
        '<line class="se-edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + esc(layer.color) + '" stroke-width="' + w + '" />' +
        (live ? '<line class="se-edge-hit" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" />' : '') +
      '</g>';
    });
    const showNodes = opt.interactive && opt.tool === 'network' && opt.netLayer === layer.id;
    net.nodes.forEach(n => {
      if (n.riser) {
        s += '<g' + (opt.interactive ? ' data-se-node="' + esc(n.id) + '" data-se-node-layer="' + esc(layer.id) + '"' : '') + '>' +
          '<circle class="se-riser" cx="' + n.x + '" cy="' + n.y + '" r="9"><title>' + (n.riser === 'up' ? 'Üst kata geçiş' : 'Alt kata geçiş') + '</title></circle>' +
          '<text class="se-riser-t" x="' + n.x + '" y="' + n.y + '" text-anchor="middle" dominant-baseline="central">' + (n.riser === 'up' ? '↑' : '↓') + '</text></g>';
      } else if (showNodes) {
        s += '<circle class="se-node" data-se-node="' + esc(n.id) + '" data-se-node-layer="' + esc(layer.id) + '" cx="' + n.x + '" cy="' + n.y + '" r="3.5" stroke="' + esc(layer.color) + '" />';
      }
    });
    return s + '</g>';
  }

  function contentSvg(fs, opt) {
    const L = layoutOf(fs.digit);
    const vis = layerVisibleFn(fs, opt.solo);
    let s = '';
    if (vis('kapi-duvar')) {
      s += '<g class="pointer-events-none">' +
        (L.salons || []).map(sa => '<rect class="se-salon" x="' + sa.x + '" y="' + sa.y + '" width="' + sa.w + '" height="' + sa.h + '" />' +
          '<text class="se-salon-name" x="' + (sa.x + 10) + '" y="' + (sa.y + 20) + '">' + esc(sa.name) + '</text>').join('') +
        (L.layer1Rects || []).map(r => '<rect class="se-l1" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '"><title>' + esc(r.text || '') + '</title></rect>').join('') +
        '<path class="se-wall" d="' + L.bgPath + '" />' +
      '</g>';
    }
    const objLayers = sortLayers(fs.layers).filter(l => l.kind === 'objects');
    objLayers.forEach(l => {
      if (!vis(l.id)) return;
      fs.items.filter(i => i.layerId === l.id).forEach(i => { s += itemSvg(i, opt); });
      fs.texts.filter(t => t.layerId === l.id).forEach(t => { s += textSvg(t, opt); });
    });
    // katmanı silinmiş öğeler: ilk obje katmanında çizilir (createLayerResolver geri dönüşü)
    const known = new Set(objLayers.map(l => l.id));
    const fallback = objLayers.length ? objLayers[0].id : 'kabin';
    if (vis(fallback)) {
      fs.items.filter(i => !known.has(i.layerId)).forEach(i => { s += itemSvg(i, opt); });
      fs.texts.filter(t => !known.has(t.layerId)).forEach(t => { s += textSvg(t, opt); });
    }
    sortLayers(fs.layers).filter(l => l.kind !== 'objects' && vis(l.id)).forEach(l => { s += networkSvg(l, opt); });
    return s;
  }

  // ---------------------------------------------------------------------------
  // Önizleme farkı (computePreviewSummary + computeLayerDiff)
  // ---------------------------------------------------------------------------
  function diffFloors(before, after) {
    const sum = { added: 0, removed: 0, changed: 0, moved: 0 };
    const afterDiff = {}, beforeDiff = {};
    const cmp = (bArr, aArr, keysChanged) => {
      const bMap = {}, aMap = {};
      bArr.forEach(x => { bMap[x.id] = x; });
      aArr.forEach(x => { aMap[x.id] = x; });
      aArr.forEach(x => {
        const b = bMap[x.id];
        if (!b) { sum.added++; afterDiff[x.id] = 'add'; return; }
        if (keysChanged.some(k => (b[k] || null) !== (x[k] || null))) { sum.changed++; afterDiff[x.id] = 'chg'; }
        if (b.x !== x.x || b.y !== x.y) { sum.moved++; afterDiff[x.id] = afterDiff[x.id] || 'mov'; }
      });
      bArr.forEach(x => { if (!aMap[x.id]) { sum.removed++; beforeDiff[x.id] = 'del'; } });
    };
    cmp(before.items, after.items, ['facing', 'pod', 'label', 'layerId']);
    cmp(before.texts, after.texts, ['text', 'layerId']);
    const bl = {}; before.layers.forEach(l => { bl[l.id] = l; });
    const al = {}; after.layers.forEach(l => { al[l.id] = l; });
    after.layers.forEach(l => {
      const b = bl[l.id];
      const meta = x => { const c = Object.assign({}, x); delete c.network; return JSON.stringify(c); };
      if (!b) { sum.added++; return; }
      if (meta(b) !== meta(l)) sum.changed++;
      if (l.network) {
        const be = new Set((b.network ? b.network.edges : []).map(e => e.id));
        const ae = new Set(l.network.edges.map(e => e.id));
        ae.forEach(id => { if (!be.has(id)) sum.added++; });
        be.forEach(id => { if (!ae.has(id)) sum.removed++; });
        const bn = {}; (b.network ? b.network.nodes : []).forEach(n => { bn[n.id] = n; });
        l.network.nodes.forEach(n => { if (bn[n.id] && (bn[n.id].riser || null) !== (n.riser || null)) sum.changed++; });
      }
    });
    before.layers.forEach(l => { if (!al[l.id]) sum.removed++; });
    if (before.title !== after.title) sum.changed++;
    return { sum, afterDiff, beforeDiff };
  }

  // ---------------------------------------------------------------------------
  // Kablo yolu: kabinden kabine en kısa yol (ağ grafı üzerinde Dijkstra)
  // ---------------------------------------------------------------------------
  function shortestPath(fs, layerId, fromCab, toCab) {
    const layer = fs.layers.find(l => l.id === layerId);
    const net = layer && layer.network;
    if (!net || !net.nodes.length) return null;
    const center = c => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const nearest = p => net.nodes.reduce((best, n) => (!best || dist(n, p) < dist(best, p) ? n : best), null);
    const A = center(fromCab), B = center(toCab);
    const na = nearest(A), nb = nearest(B);
    const adj = {};
    net.nodes.forEach(n => { adj[n.id] = []; });
    const byId = {}; net.nodes.forEach(n => { byId[n.id] = n; });
    net.edges.forEach(e => {
      if (!byId[e.a] || !byId[e.b]) return;
      const d = dist(byId[e.a], byId[e.b]);
      adj[e.a].push([e.b, d]); adj[e.b].push([e.a, d]);
    });
    const D = {}, prev = {}, done = {};
    net.nodes.forEach(n => { D[n.id] = Infinity; });
    D[na.id] = 0;
    for (;;) {
      let u = null;
      Object.keys(D).forEach(k => { if (!done[k] && D[k] < Infinity && (u === null || D[k] < D[u])) u = k; });
      if (u === null || u === nb.id) break;
      done[u] = true;
      adj[u].forEach(([v, w]) => { if (D[u] + w < D[v]) { D[v] = D[u] + w; prev[v] = u; } });
    }
    if (D[nb.id] === Infinity) return { pts: null };
    const ids = [];
    for (let k = nb.id; k; k = prev[k]) { ids.unshift(k); if (k === na.id) break; }
    const pts = [A].concat(ids.map(id => byId[id])).concat([B]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
    return { pts, len };
  }

  // ---------------------------------------------------------------------------
  // Modül
  // ---------------------------------------------------------------------------
  function mount(el, params) {
    if (params.get('reset') === '1') storage.sessionRemove(STORE_KEY);
    const digit0 = Math.min(3, Math.max(1, parseInt(params.get('floor') || '1', 10) || 1));

    const st = {
      digit: digit0,
      saved: loadFloor(digit0),
      work: null,
      edit: false,
      tool: 'select',
      netLayer: 'tel-tava',
      netMode: 'draw',
      activeObjLayer: 'metin',
      solo: new Set(),
      sel: new Set(),
      minimap: true,
      snap: true,
      gridUnit: 40,
      vb: null,
      undo: [],
      redo: [],
      chain: null,         // ağ çiziminde son düğüm {layerId, nodeId}
      cursor: null,
      pathPick: [],
      pathResult: null,
      podHl: null,
      newLayerName: '',
      podChoice: '',
      exportOpen: false
    };
    const fs = () => (st.edit ? st.work : st.saved);
    const L = () => layoutOf(st.digit);
    const fitVB = () => { const p = String(L().fitViewBox || '0 0 2000 1640').split(/\s+/).map(Number); return { x: p[0], y: p[1], w: p[2], h: p[3] }; };
    st.vb = fitVB();

    el.innerHTML =
      '<div class="flex-1 min-h-0 h-full flex flex-col overflow-hidden bg-slate-100 dark:bg-[#080c14]" data-se-root>' +
        '<div class="shrink-0 px-3 pt-3 pb-1.5 bg-white dark:bg-surface-card" data-se-header></div>' +
        '<div data-se-toolbar></div>' +
        '<div class="flex-1 flex min-h-0 overflow-hidden relative">' +
          '<div data-se-side class="hidden"></div>' +
          '<div class="flex-1 h-full relative overflow-hidden bg-slate-50 dark:bg-[#060a10]" data-se-wrap>' +
            '<svg data-se-svg class="se-svg is-pan w-full h-full block select-none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
              '<defs><pattern id="se-grid-pat" patternUnits="userSpaceOnUse" width="40" height="40"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--schema-grid)" stroke-width="1" /></pattern></defs>' +
              '<rect x="-10000" y="-10000" width="30000" height="30000" fill="url(#se-grid-pat)" class="pointer-events-none" />' +
              '<g data-se-content></g>' +
              '<g data-se-overlay class="pointer-events-none"></g>' +
            '</svg>' +
            '<div class="absolute top-2 right-2 flex flex-col gap-1 z-10">' +
              '<button type="button" data-act="zoom-in" class="w-7 h-7 rounded-[2px] bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-sky-600 flex items-center justify-center" title="Yakınlaştır"><i class="pi pi-plus text-[10px]"></i></button>' +
              '<button type="button" data-act="zoom-out" class="w-7 h-7 rounded-[2px] bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-sky-600 flex items-center justify-center" title="Uzaklaştır"><i class="pi pi-minus text-[10px]"></i></button>' +
              '<button type="button" data-act="zoom-fit" class="w-7 h-7 rounded-[2px] bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-sky-600 flex items-center justify-center" title="Sığdır"><i class="pi pi-expand text-[10px]"></i></button>' +
            '</div>' +
            '<div data-se-minimap class="absolute left-2 bottom-8 w-48 h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] shadow-sm z-10 overflow-hidden"></div>' +
            '<div data-se-status class="absolute left-0 right-0 bottom-0 h-6 px-2 flex items-center gap-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-white/85 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 z-10 overflow-hidden whitespace-nowrap"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const root = el.querySelector('[data-se-root]');
    const headerEl = el.querySelector('[data-se-header]');
    const toolbarEl = el.querySelector('[data-se-toolbar]');
    const sideEl = el.querySelector('[data-se-side]');
    const svg = el.querySelector('[data-se-svg]');
    const contentG = svg.querySelector('[data-se-content]');
    const overlayG = svg.querySelector('[data-se-overlay]');
    const gridPat = svg.querySelector('#se-grid-pat');
    const minimapEl = el.querySelector('[data-se-minimap]');
    const statusEl = el.querySelector('[data-se-status]');

    // ---- yardımcılar ----------------------------------------------------------
    const layerById = id => fs().layers.find(l => l.id === id);
    const selectedItems = () => fs().items.filter(i => st.sel.has(i.id));
    const selectedTexts = () => fs().texts.filter(t => st.sel.has(t.id));
    const selectedCabinets = () => selectedItems().filter(i => i.type === 'cabinet');
    const snapshot = () => JSON.stringify(st.work);
    const isDirty = () => st.edit && JSON.stringify(st.work) !== JSON.stringify(st.saved);

    function commit() {
      st.undo.push(snapshot());
      if (st.undo.length > 80) st.undo.shift();
      st.redo = [];
    }
    function undo() {
      if (st.undo.length < 2) return;
      st.redo.push(st.undo.pop());
      st.work = JSON.parse(st.undo[st.undo.length - 1]);
      pruneSelection();
      renderAll();
    }
    function redo() {
      if (!st.redo.length) return;
      const s = st.redo.pop();
      st.undo.push(s);
      st.work = JSON.parse(s);
      pruneSelection();
      renderAll();
    }
    function pruneSelection() {
      const ids = new Set(fs().items.map(i => i.id).concat(fs().texts.map(t => t.id)));
      st.sel = new Set(Array.from(st.sel).filter(id => ids.has(id)));
    }

    function layerCount(l) {
      const f = fs();
      if (l.kind !== 'objects') return l.network ? l.network.edges.length : 0;
      let n = f.items.filter(i => i.layerId === l.id).length + f.texts.filter(t => t.layerId === l.id).length;
      if (l.id === 'kapi-duvar') n += (L().salons || []).length + (L().layer1Rects || []).length;
      return n;
    }
    const canRemoveLayer = l => l.kind === 'objects' && layerCount(l) === 0 && fs().layers.filter(x => x.kind === 'objects').length > 1;

    function podMap() {
      const m = {};
      st.saved.items.filter(i => i.type === 'cabinet').forEach(c => { m[c.id] = c.pod || ''; });
      return m;
    }
    function podOptions() {
      const set = new Set();
      st.saved.items.forEach(i => { if (i.pod) set.add(i.pod); });
      fs().texts.forEach(t => { if (t.kind === 'text-pod') set.add(t.text); });
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    }
    function selectionPodLabel() {
      const cabs = selectedCabinets();
      if (!cabs.length) return '';
      const m = podMap();
      const pods = new Set(cabs.map(c => m[c.id] || ''));
      if (pods.size !== 1) return 'Karışık';
      return pods.values().next().value || 'Atanmamış';
    }
    function selectionFacing() {
      const cabs = selectedCabinets();
      if (!cabs.length) return null;
      const f = cabs[0].facing || null;
      return cabs.every(c => (c.facing || null) === f) ? f : null;
    }

    // ---- görünüm kutusu --------------------------------------------------------
    function applyVB() {
      const v = st.vb;
      svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
      renderMinimap();
      renderStatus();
    }
    function unitsPerPx() {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return 1;
      return Math.max(st.vb.w / r.width, st.vb.h / r.height);
    }
    function svgPoint(e) {
      const m = svg.getScreenCTM();
      if (!m) return { x: 0, y: 0 };
      const p = svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      const r = p.matrixTransform(m.inverse());
      return { x: r.x, y: r.y };
    }
    function zoomAt(factor, cx, cy) {
      const v = st.vb;
      const nw = Math.min(8000, Math.max(120, v.w * factor));
      const k = nw / v.w;
      st.vb = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: nw, h: v.h * k };
      applyVB();
    }
    function zoomToBox(b, pad) {
      const p = pad || 120;
      const w = Math.max(1000, b.x1 - b.x0 + p * 2), h = Math.max(760, b.y1 - b.y0 + p * 2);
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      st.vb = { x: cx - w / 2, y: cy - h / 2, w, h };
      applyVB();
    }
    function bboxOf(items) {
      if (!items.length) return null;
      return items.reduce((b, i) => ({ x0: Math.min(b.x0, i.x), y0: Math.min(b.y0, i.y), x1: Math.max(b.x1, i.x + i.w), y1: Math.max(b.y1, i.y + i.h) }),
        { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    }

    // ---- çizim ----------------------------------------------------------------
    function renderCanvas() {
      const f = fs();
      gridPat.setAttribute('width', st.gridUnit);
      gridPat.setAttribute('height', st.gridUnit);
      gridPat.setAttribute('x', f.gridOffsetX || 0);
      gridPat.setAttribute('y', f.gridOffsetY || 0);
      gridPat.querySelector('path').setAttribute('d', 'M ' + st.gridUnit + ' 0 L 0 0 0 ' + st.gridUnit);
      contentG.innerHTML = contentSvg(f, {
        interactive: true, sel: st.sel, solo: st.solo, tool: st.edit ? st.tool : '', netMode: st.netMode, netLayer: st.netLayer,
        pick: st.tool === 'cablepath' ? st.pathPick : null
      });
      renderOverlay();
      svg.classList.toggle('is-cross', st.edit && (st.tool === 'network' || st.tool === 'cablepath'));
      svg.classList.toggle('is-text', st.edit && st.tool === 'text');
      svg.classList.toggle('is-move', st.edit && st.tool === 'draggrid');
      svg.classList.toggle('is-pan', !st.edit || st.tool === 'select');
      renderMinimap();
      renderStatus();
    }

    function podBox(pod) {
      const cabs = fs().items.filter(i => i.type === 'cabinet' && (podMap()[i.id] || '') === pod);
      return bboxOf(cabs);
    }

    function renderOverlay(extra) {
      let s = '';
      if (st.podHl) {
        const b = podBox(st.podHl);
        if (b) {
          s += '<rect class="se-pod-hl" x="' + (b.x0 - 12) + '" y="' + (b.y0 - 12) + '" width="' + (b.x1 - b.x0 + 24) + '" height="' + (b.y1 - b.y0 + 24) + '" rx="4" />' +
            '<text class="se-pod-hl-t" x="' + (b.x0 - 10) + '" y="' + (b.y0 - 18) + '">' + esc(st.podHl) + ' · ' + fs().items.filter(i => (podMap()[i.id] || '') === st.podHl).length + ' kabin</text>';
        }
      }
      if (st.pathResult && st.pathResult.pts) {
        s += '<polyline class="se-path" points="' + st.pathResult.pts.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join(' ') + '" />';
      }
      if (st.edit && st.tool === 'network' && st.netMode === 'draw' && st.chain && st.cursor) {
        const layer = layerById(st.chain.layerId);
        const n = layer && layer.network.nodes.find(x => x.id === st.chain.nodeId);
        if (n) {
          s += '<line class="se-preview-line" x1="' + n.x + '" y1="' + n.y + '" x2="' + st.cursor.x + '" y2="' + st.cursor.y + '" stroke="' + esc(layer.color) + '" stroke-width="3" />' +
            '<circle class="se-pending" cx="' + n.x + '" cy="' + n.y + '" r="4" />';
        }
      }
      overlayG.innerHTML = s + (extra || '');
    }

    function renderMinimap() {
      if (!st.minimap) { minimapEl.classList.add('hidden'); return; }
      minimapEl.classList.remove('hidden');
      const Ly = L();
      const v = st.vb;
      minimapEl.innerHTML =
        '<div class="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-slate-800">Kroki</div>' +
        '<svg data-se-mini viewBox="0 0 ' + Ly.mapW + ' ' + Ly.mapH + '" preserveAspectRatio="xMidYMid meet" class="w-full block cursor-pointer" style="height:calc(100% - 1rem)">' +
          '<path d="' + Ly.bgPath + '" fill="none" stroke="var(--schema-text-muted)" stroke-width="8" />' +
          fs().items.filter(i => i.type === 'cabinet').map(i => '<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" fill="' + (st.sel.has(i.id) ? '#0ea5e9' : '#64748b') + '" />').join('') +
          '<rect class="se-minimap-vp" x="' + v.x + '" y="' + v.y + '" width="' + v.w + '" height="' + v.h + '" />' +
        '</svg>';
    }

    function renderStatus() {
      const f = fs();
      const cnt = t => f.items.filter(i => i.type === t).length;
      const net = id => { const l = f.layers.find(x => x.id === id); return l && l.network ? l.network.edges.length : 0; };
      const zoom = Math.round(fitVB().w / st.vb.w * 100);
      let s = '<span>' + cnt('cabinet') + ' kabin</span><span>' + cnt('climate') + ' klima</span><span>' + cnt('ups') + ' UPS</span>' +
        '<span>Tel Tava ' + net('tel-tava') + ' parça</span><span>Fiber Runner ' + net('fiber-runner') + ' parça</span>' +
        (st.sel.size ? '<span class="text-sky-600 dark:text-sky-400">' + st.sel.size + ' seçili</span>' : '');
      if (st.pathResult) {
        s += st.pathResult.pts
          ? '<span class="text-cyan-600 dark:text-cyan-400">Kablo yolu ' + esc(st.pathResult.from) + ' → ' + esc(st.pathResult.to) + ': ' + fmt(st.pathResult.len / 40, 1) + ' grid birimi (≈ ' + fmt(st.pathResult.len / 40 * 0.6, 1) + ' m)</span>'
          : '<span class="text-rose-600 dark:text-rose-400">Kablo yolu bulunamadı (ağ bağlantısız)</span>';
      }
      s += '<span class="ml-auto">Ölçek %' + zoom + '</span>';
      statusEl.innerHTML = s;
    }

    function renderHeader() {
      const loc = DCIM.data.spaceEdit.location(st.digit);
      const pill = [loc.city, loc.region, loc.floor, loc.salon].join(' > ');
      let actions = '<div class="flex flex-wrap items-center gap-2">' +
        '<div class="flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-xs font-semibold text-slate-700 dark:text-slate-300">' +
          '<i class="pi pi-map-marker text-sky-500 text-xs shrink-0"></i><span class="truncate max-w-[260px]">' + esc(pill) + '</span></div>' +
        button({ variant: 'secondary', size: 'sm', icon: 'pi pi-compass', label: 'Lokasyon Değiştir', attrs: 'data-act="location"' });
      if (st.edit) {
        actions += button({ variant: 'primary', size: 'sm', icon: 'pi pi-check', label: 'Kaydet', attrs: 'data-act="save"' }) +
          button({ variant: 'danger', size: 'sm', icon: 'pi pi-times', label: 'Vazgeç', attrs: 'data-act="discard"' });
      } else {
        actions += button({ variant: 'primary', size: 'sm', icon: 'pi pi-pencil', label: 'Düzenle', attrs: 'data-act="edit"' });
      }
      actions += '</div>';
      headerEl.innerHTML = kit.pageHeader({
        title: '2D ŞEMASI DÜZENLEME',
        compact: true,
        breadcrumbs: [{ label: 'Mühendislik', href: 'engineering.html#home' }, { label: 'ŞEMA YÖNETİMİ' }, { label: '2D ŞEMASI DÜZENLEME' }],
        actions
      });
    }

    function renderToolbar() {
      if (!st.edit) { toolbarEl.innerHTML = ''; return; }
      toolbarEl.innerHTML =
        '<div class="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel">' +
          '<div class="flex items-center gap-2 min-w-0 flex-1 basis-[280px] max-w-[520px]">' +
            '<label for="spaceEditMapTitle" class="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Harita Başlığı:</label>' +
            '<input id="spaceEditMapTitle" type="text" data-se-title value="' + esc(st.work.title) + '" placeholder="Harita başlığı giriniz..." class="flex-1 min-w-0 text-xs py-1 px-2.5 bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-border-subtle rounded-[2px] focus:border-sky-500 outline-none">' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2 ml-auto">' +
            '<span title="Geri Al (Ctrl+Z)" class="inline-flex">' + button({ variant: 'secondary', size: 'sm', icon: 'pi pi-undo', label: 'Geri Al', attrs: 'data-act="undo"' + (st.undo.length < 2 ? ' disabled' : '') }) + '</span>' +
            '<span title="Yinele (Ctrl+Y / Ctrl+Shift+Z)" class="inline-flex">' + button({ variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', label: 'Yinele', attrs: 'data-act="redo"' + (!st.redo.length ? ' disabled' : '') }) + '</span>' +
            '<span class="w-px h-5 bg-slate-300 dark:bg-border-subtle mx-1"></span>' +
            button({ variant: 'secondary', size: 'sm', icon: 'pi pi-upload', label: 'İçe Aktar', attrs: 'data-act="import"' }) +
            '<div class="relative">' +
              '<button type="button" data-act="export-menu" class="px-2.5 py-1 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-border-subtle bg-slate-100 dark:bg-surface-card hover:bg-slate-200 dark:hover:bg-surface-hover text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer">' +
                '<i class="pi pi-download text-xs text-sky-500"></i><span>Dışa Aktar</span><i class="pi pi-chevron-down text-[9px] opacity-70 ml-0.5"></i></button>' +
              (st.exportOpen ? '<div class="absolute right-0 top-full mt-1 z-30 min-w-56 py-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl">' +
                [['json', 'pi pi-code', 'JSON (.json) olarak Aktar'], ['svg', 'pi pi-image', 'SVG (.svg) olarak Aktar'], ['dwg', 'pi pi-file', 'DWG/DXF olarak Aktar']].map(o =>
                  '<button type="button" data-act="export" data-fmt="' + o[0] + '" class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"><i class="' + o[1] + ' text-sky-500 text-xs"></i><span>' + o[2] + '</span></button>').join('') +
              '</div>' : '') +
            '</div>' +
            '<span class="w-px h-5 bg-slate-300 dark:bg-border-subtle mx-1"></span>' +
            button({ variant: 'danger', size: 'sm', icon: 'pi pi-trash', label: 'Şemayı Temizle', attrs: 'data-act="clear"' }) +
          '</div>' +
        '</div>';
    }

    const toolBtnCls = on => 'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] font-semibold text-left transition-colors border ' +
      (on ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
          : 'bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover');
    const segBtnCls = (on, onCls) => 'flex-1 py-1 text-[11px] font-bold rounded-[2px] border transition-colors whitespace-nowrap ' +
      (on ? (onCls || 'bg-sky-600 border-sky-600 text-white') : 'bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-hover');
    const secTitle = t => '<div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-border-subtle pb-1">' + esc(t) + '</div>';
    const check = (act, on, label) => '<label data-act="' + act + '" class="flex items-center gap-2 p-1.5 rounded-[2px] hover:bg-slate-50 dark:hover:bg-surface-hover cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-border-subtle transition-colors">' +
      '<input type="checkbox"' + (on ? ' checked' : '') + ' class="rounded-[2px] accent-sky-600 pointer-events-none"><span class="text-xs text-slate-700 dark:text-slate-300">' + esc(label) + '</span></label>';

    function helpTexts() {
      return [
        st.minimap ? 'Kroki Görünümü aktif: Sol altta kuşbakışı genel görünüm açık.' : 'Kroki Görünümü pasif: Kroki haritası gizli.',
        st.snap ? "Grid'e Hizala aktif: Kabin/metinler sürüklenirken grid çizgilerine tam oturur." : "Grid'e Hizala pasif: Nesneler grid çizgilerinden bağımsız serbestçe kaydırılabilir."
      ];
    }
    function toolHelp() {
      switch (st.tool) {
        case 'select': return 'Seçim & Düzenle aktif: Harita üzerindeki nesneleri seçip konumlandırabilir, 90 derece döndürebilir veya silebilirsiniz.';
        case 'text': return 'Metin Ekle aktif: Haritada herhangi bir boş alana tıklayarak özel açıklamalar veya etiket metinleri yerleştirebilirsiniz.';
        case 'draggrid': return 'Grid Sürükle aktif: Haritayı sürükleyerek kılavuz çizgilerin konumunu kaydırabilir ve snap hizasını özelleştirebilirsiniz.';
        case 'network': {
          const l = layerById(st.netLayer);
          const n = l ? l.name : '';
          if (st.netMode === 'erase') return n + ' Sil aktif: Silmek istediğiniz parçaya tıklayın.';
          if (st.netMode === 'riser') return n + ' Kat Geçişi aktif: Düğüme tıklayın: ↑ üst kata geçiş → ↓ alt kata geçiş → işaretsiz.';
          return n + ' Çiz aktif: İnce grid üzerinde ardışık noktalara tıklayarak parça çizin; Esc ya da çift tık çizimi bitirir.';
        }
        case 'cablepath': return 'Kablo Yolu (En Kısa) aktif: Başlangıç ve hedef kabine tıklayın; seçili ağ üzerindeki en kısa yol çizilir.';
        default: return 'Lütfen etkin bir düzenleme aracı seçiniz.';
      }
    }

    function selectionSummary() {
      const count = st.sel.size;
      if (!count) return null;
      if (count > 1) return { title: count + ' öğe seçili', subtitle: 'Toplu seçim', canEditText: false };
      const id = st.sel.values().next().value;
      const it = fs().items.find(i => i.id === id);
      if (it) {
        const l = layerById(it.layerId);
        return { title: it.label || it.id, subtitle: it.type + (l ? ' · ' + l.name : ''), canEditText: false };
      }
      const t = fs().texts.find(x => x.id === id);
      if (t) {
        const l = layerById(t.layerId);
        return { title: t.text || 'İsimsiz Metin', subtitle: (t.kind === 'text-pod' ? 'POD metni' : 'Metin') + (l ? ' · ' + l.name : ''), canEditText: true };
      }
      return null;
    }

    function renderSide() {
      if (!st.edit) { sideEl.className = 'hidden'; sideEl.innerHTML = ''; return; }
      const scroll = sideEl.scrollTop;
      sideEl.className = 'w-64 bg-white dark:bg-surface-card border-r border-slate-200 dark:border-border-subtle flex flex-col overflow-y-auto shrink-0 select-none p-3 space-y-4 text-xs';
      const f = st.work;
      const layersTopFirst = sortLayers(f.layers).reverse();
      const netLayers = sortLayers(f.layers).filter(l => l.kind !== 'objects');
      const activeObj = f.layers.find(l => l.id === st.activeObjLayer && l.kind === 'objects');
      const movable = st.sel.size;
      const isLayerActive = l => l.kind === 'objects' ? l.id === st.activeObjLayer : ((st.tool === 'network' || st.tool === 'cablepath') && l.id === st.netLayer);
      const sum = selectionSummary();
      const cabs = selectedCabinets();
      const facing = selectionFacing();

      let h = '';
      // Görünüm & Ayarlar
      h += '<div class="space-y-2" data-se-sec="view">' + secTitle('Görünüm & Ayarlar') +
        check('toggle-minimap', st.minimap, 'Kroki Görünümü') +
        check('toggle-snap', st.snap, "Grid'e Hizala (Snap)") +
        '<div class="p-1.5 space-y-1.5"><div class="flex items-center justify-between"><span class="text-xs text-slate-700 dark:text-slate-300">Grid Boyutu</span><span class="text-[10px] font-mono text-slate-400">' + st.gridUnit + 'px</span></div>' +
          '<div class="flex gap-1">' + GRID_UNIT_OPTIONS.map(s => '<button type="button" data-act="grid-unit" data-v="' + s + '" class="' + segBtnCls(st.gridUnit === s) + '">' + s + '</button>').join('') + '</div>' +
          '<input type="number" data-se-grid-input min="' + GRID_UNIT_MIN + '" max="' + GRID_UNIT_MAX + '" step="5" value="' + st.gridUnit + '" aria-label="Grid boyutu (px)" class="w-full text-xs py-1 px-2 bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-border-subtle rounded-[2px] focus:border-sky-500 outline-none">' +
        '</div>' +
        ((f.gridOffsetX || f.gridOffsetY) ? '<button type="button" data-act="grid-reset" class="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold border border-rose-200 dark:border-rose-900/60 rounded-[2px] hover:bg-rose-100 transition-colors"><i class="pi pi-refresh text-xs"></i><span>Grid Konumunu Sıfırla</span></button>' : '') +
      '</div>';

      // Katmanlar
      h += '<div class="space-y-2 rounded-[2px]" data-se-sec="layers">' + secTitle('Katmanlar') +
        '<div class="flex flex-col gap-1">' + layersTopFirst.map(l => {
          const on = isLayerActive(l), solo = st.solo.has(l.id);
          return '<div data-act="layer-row" data-id="' + esc(l.id) + '" title="' + (solo ? 'Gösterim seçiminden çıkar' : 'Gösterim seçimine ekle') + '" class="flex items-center gap-1.5 px-1.5 py-1 rounded-[2px] border cursor-pointer transition-colors ' +
            (on ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500' : 'bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle hover:bg-slate-100 dark:hover:bg-surface-hover') + (solo ? ' se-solo' : '') + '">' +
            '<button type="button" data-act="layer-eye" data-id="' + esc(l.id) + '" class="p-0.5 text-slate-500 dark:text-slate-400 hover:text-sky-600" title="' + (l.visible ? 'Gizle' : 'Göster') + '"><i class="pi text-xs ' + (l.visible ? 'pi-eye' : 'pi-eye-slash') + '"></i></button>' +
            (l.kind !== 'objects' ? '<span class="w-2.5 h-2.5 rounded-[1px] shrink-0" style="background:' + esc(l.color) + '"></span>' : '') +
            '<span class="flex-1 truncate text-xs ' + (on ? 'font-bold text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300') + (l.visible ? '' : ' opacity-50') + '" title="' + esc(l.name) + '">' + esc(l.name) + '</span>' +
            '<span class="text-[10px] font-mono text-slate-400" title="' + (l.kind === 'objects' ? 'Öğe sayısı' : 'Parça sayısı') + '">' + layerCount(l) + '</span>' +
            (canRemoveLayer(l) ? '<button type="button" data-act="layer-remove" data-id="' + esc(l.id) + '" class="p-0.5 text-slate-400 hover:text-rose-600" title="Boş katmanı sil"><i class="pi pi-trash text-[10px]"></i></button>' : '') +
          '</div>';
        }).join('') + '</div>' +
        (st.solo.size ? '<button type="button" data-act="solo-clear" title="' + esc(layersTopFirst.filter(l => st.solo.has(l.id)).map(l => l.name).join(', ')) + '" class="w-full py-1 px-2 text-[11px] font-bold rounded-[2px] border border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 transition-colors truncate">' + st.solo.size + ' katman gösteriliyor · Tümünü göster</button>' : '') +
        '<div class="flex gap-1"><input type="text" data-se-new-layer value="' + esc(st.newLayerName) + '" placeholder="Yeni katman adı" aria-label="Yeni katman adı" class="flex-1 min-w-0 text-xs py-1 px-2 bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-border-subtle rounded-[2px] focus:border-sky-500 outline-none">' +
          '<button type="button" data-act="layer-add" class="px-2 py-1 text-[11px] font-bold rounded-[2px] border bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover"><i class="pi pi-plus text-[10px]"></i> Ekle</button></div>' +
        (activeObj && movable ? '<button type="button" data-act="move-to-layer" class="w-full py-1 px-2 text-[11px] font-bold rounded-[2px] border border-sky-500/60 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition-colors truncate">Seçimi (' + movable + ') "' + esc(activeObj.name) + '" katmanına taşı</button>' : '') +
      '</div>';

      // Düzenleme Paneli
      h += '<div class="space-y-2" data-se-sec="tools">' + secTitle('Düzenleme Paneli') +
        '<div class="text-[9px] font-bold text-slate-400 uppercase">ETKİN ARAÇ SEÇİMİ</div>' +
        '<div class="flex flex-col gap-1.5" data-se-sec="runner">' +
          '<button type="button" data-act="tool" data-v="select" class="' + toolBtnCls(st.tool === 'select') + '"><i class="pi pi-arrows-alt text-xs shrink-0"></i><span>Seçim & Düzenle</span></button>' +
          '<button type="button" data-act="tool" data-v="text" class="' + toolBtnCls(st.tool === 'text') + '"><i class="pi pi-file-edit text-xs shrink-0"></i><span>Metin Ekle</span></button>' +
          '<button type="button" data-act="tool" data-v="draggrid" class="' + toolBtnCls(st.tool === 'draggrid') + '"><i class="pi pi-arrows-alt text-xs shrink-0"></i><span>Grid Sürükle</span></button>' +
          netLayers.map(l => '<button type="button" data-act="net-tool" data-id="' + esc(l.id) + '" class="' + toolBtnCls(st.tool === 'network' && st.netLayer === l.id) + '"><span class="w-2.5 h-2.5 rounded-[1px] shrink-0" style="background:' + esc(l.color) + '"></span><span>' + esc(l.name) + ' Çiz</span></button>').join('') +
          (st.tool === 'network' ? '<div class="flex gap-1">' + [['draw', 'Çiz', ''], ['erase', 'Sil', 'bg-rose-600 border-rose-600 text-white'], ['riser', 'Kat Geçişi', 'bg-violet-600 border-violet-600 text-white']].map(m =>
            '<button type="button" data-act="net-mode" data-v="' + m[0] + '"' + (m[0] === 'riser' ? ' title="Düğüme tıklayın: ↑ üst kata geçiş → ↓ alt kata geçiş → işaretsiz"' : '') + ' class="' + segBtnCls(st.netMode === m[0], m[2]) + '">' + m[1] + '</button>').join('') + '</div>' : '') +
          (netLayers.length ? '<button type="button" data-act="tool" data-v="cablepath" class="' + toolBtnCls(st.tool === 'cablepath') + '"><i class="pi pi-share-alt text-xs shrink-0"></i><span>Kablo Yolu (En Kısa)</span></button>' : '') +
          (st.tool === 'cablepath' ? '<div class="flex gap-1">' + netLayers.map(l => '<button type="button" data-act="path-layer" data-id="' + esc(l.id) + '" class="' + segBtnCls(st.netLayer === l.id) + ' truncate">' + esc(l.name) + '</button>').join('') + '</div>' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400">' + (st.pathPick.length === 2 ? '<b class="font-mono">' + esc(st.pathPick[0]) + ' → ' + esc(st.pathPick[1]) + '</b> · yeni yol için kabine tıklayın' : st.pathPick.length ? 'Başlangıç: <b class="font-mono">' + esc(st.pathPick[0]) + '</b> · hedef kabine tıklayın' : 'Başlangıç kabinine tıklayın') + '</div>' : '') +
        '</div>';

      // Seçim
      if (sum) {
        h += '<div class="p-2.5 bg-slate-50 dark:bg-surface-panel border border-sky-500/40 rounded-[2px] space-y-2 mt-3" data-se-sec="selection">' +
          '<div><span class="text-[9px] font-extrabold uppercase text-slate-400 block">SEÇİLİ NESNE</span>' +
            '<div class="font-bold text-slate-800 dark:text-slate-100 truncate" title="' + esc(sum.title) + '">' + esc(sum.title) + '</div>' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">' + esc(sum.subtitle) + '</div></div>' +
          '<div class="flex gap-1.5">' +
            (sum.canEditText ? '<button type="button" data-act="edit-text" class="flex-1 py-1 px-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-[2px] transition-colors">Metni Düzenle</button>' : '') +
            '<button type="button" data-act="delete" class="flex-1 py-1 px-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-[2px] transition-colors" title="Delete">' + (st.sel.size > 1 ? 'Seçilenleri Sil (' + st.sel.size + ')' : 'Sil') + '</button>' +
          '</div>' +
          (cabs.length ? '<div class="space-y-1 pt-1 border-t border-slate-200 dark:border-border-subtle" data-se-sec="facing">' +
            '<span class="text-[9px] font-extrabold uppercase text-slate-400 block">Kabin Yönü (Ön Yüz)' + (cabs.length > 1 ? ' · ' + cabs.length + ' kabin' : '') + '</span>' +
            '<div class="flex gap-1">' + FACING_OPTS.map(o => '<button type="button" data-act="facing" data-v="' + o.v + '" class="' + segBtnCls(facing === o.v) + '">' + o.label + '</button>').join('') + '</div>' +
            '<button type="button" data-act="facing" data-v="" class="w-full py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">Yönü Temizle</button>' +
          '</div>' : '') +
          (cabs.length ? '<div class="space-y-1 pt-1 border-t border-slate-200 dark:border-border-subtle" data-se-sec="pod">' +
            '<span class="text-[9px] font-extrabold uppercase text-slate-400 block">POD Grubu' + (cabs.length > 1 ? ' · ' + cabs.length + ' kabin' : '') + '</span>' +
            '<div class="flex gap-1"><input data-se-pod-input list="spaceEditPodOptions" value="' + esc(st.podChoice) + '" placeholder="POD-1, POD-2…" class="flex-1 min-w-0 px-2 py-1 text-[11px] font-semibold rounded-[2px] border bg-white dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200">' +
              '<datalist id="spaceEditPodOptions">' + podOptions().map(p => '<option value="' + esc(p) + '"></option>').join('') + '</datalist>' +
              '<button type="button" data-act="pod-apply" class="py-1 px-2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-[2px] transition-colors">POD\'a Ekle</button></div>' +
            '<div class="flex items-center justify-between"><span class="text-[10px] text-slate-500 dark:text-slate-400">Seçimin POD\'u: ' + esc(selectionPodLabel() || '…') + '</span>' +
              '<button type="button" data-act="pod-remove" class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">POD\'dan Çıkar</button></div>' +
          '</div>' : '') +
          '<button type="button" data-act="sel-clear" class="w-full py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" title="Esc">Seçimi Temizle</button>' +
        '</div>';
      }
      h += '</div>';

      // POD Grupları (sunum eki): POD seçimi + sınır vurgusu
      const pm = podMap();
      const pods = {};
      Object.keys(pm).forEach(id => { if (pm[id]) pods[pm[id]] = (pods[pm[id]] || 0) + 1; });
      const podList = Object.keys(pods).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      h += '<div class="space-y-2" data-se-sec="pods">' + secTitle('POD Grupları') +
        '<div class="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">Kaynak: ' + esc(DCIM.data.spaceEdit.pduDoc(st.digit)) + ' · PDU/PMM @pod. Tıklayın: kabinleri seç ve sınırı vurgula.</div>' +
        '<div class="flex flex-wrap gap-1">' + podList.map(p => '<button type="button" data-act="pod-hl" data-v="' + esc(p) + '" class="px-1.5 py-0.5 text-[10px] font-bold rounded-[2px] border transition-colors ' +
          (st.podHl === p ? 'bg-sky-600 border-sky-600 text-white' : 'bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover') + '">' +
          esc(p) + ' <span class="font-mono opacity-70">' + pods[p] + '</span></button>').join('') + '</div>' +
      '</div>';

      // Yardım
      h += '<div class="space-y-2 border-t border-slate-100 dark:border-border-subtle pt-3" data-se-sec="help">' +
        '<div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Yardım ve Bilgilendirme</div>' +
        '<ul class="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 pl-3 list-disc">' + helpTexts().map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
        '<p class="text-[11px] text-slate-500 dark:text-slate-400 italic pt-2 border-t border-dashed border-slate-200 dark:border-border-subtle">' + esc(toolHelp()) + '</p>' +
      '</div>';

      sideEl.innerHTML = h;
      sideEl.scrollTop = scroll;
    }

    function renderAll() {
      renderHeader();
      renderToolbar();
      renderSide();
      renderCanvas();
    }

    function flashSection(name) {
      const sec = sideEl.querySelector('[data-se-sec="' + name + '"]');
      if (!sec) return;
      sec.scrollIntoView({ block: 'center' });
      sec.classList.remove('se-flash');
      void sec.offsetWidth;
      sec.classList.add('se-flash');
    }

    // ---- düzenleme oturumu --------------------------------------------------------
    function beginEdit() {
      if (st.edit) return;
      st.work = clone(st.saved);
      st.edit = true;
      st.undo = [snapshot()];
      st.redo = [];
      st.chain = null;
    }
    function endEdit() {
      st.edit = false;
      st.work = null;
      st.undo = []; st.redo = [];
      st.chain = null; st.pathPick = []; st.pathResult = null;
      st.tool = 'select';
      st.exportOpen = false;
      pruneSelection();
    }
    function discard() {
      endEdit();
      st.sel.clear();
      renderAll();
    }

    function openPreview() {
      if (!isDirty()) { endEdit(); renderAll(); return; }
      const d = diffFloors(st.saved, st.work);
      const all = st.saved.items.concat(st.work.items);
      const b = bboxOf(all) || { x0: 0, y0: 0, x1: 2000, y1: 1640 };
      const vb = (b.x0 - 80) + ' ' + (b.y0 - 80) + ' ' + (b.x1 - b.x0 + 160) + ' ' + (b.y1 - b.y0 + 160);
      const mini = (f, diff) => '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" class="w-full h-full block">' + contentSvg(f, { interactive: false, diff }) + '</svg>';
      const host = document.createElement('div');
      host.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-start justify-center p-4 animate-fade-in';
      host.innerHTML =
        '<div class="mt-[4vh] w-[min(1200px,96vw)] max-h-[92vh] bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl overflow-hidden flex flex-col">' +
          '<div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel shrink-0">' +
            '<div class="flex items-center gap-2"><i class="pi pi-eye text-sky-500 font-bold"></i><h3 class="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 m-0">Önizleme</h3></div>' +
            '<button type="button" data-pv="stay" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"><i class="pi pi-times text-xs"></i></button>' +
          '</div>' +
          '<div class="flex-1 p-4 overflow-y-auto space-y-3 min-h-0">' +
            '<div class="text-xs text-amber-600 dark:text-amber-400 font-medium">Değişikliği Uyguladıktan sonra geri alamazsınız.</div>' +
            '<div class="flex flex-wrap gap-4 text-xs font-mono bg-slate-50 dark:bg-surface-panel p-2.5 rounded-[2px] border border-slate-200 dark:border-border-subtle">' +
              '<span class="text-emerald-600 dark:text-emerald-400"><b>Eklenen:</b> ' + d.sum.added + '</span>' +
              '<span class="text-rose-600 dark:text-rose-400"><b>Silinen:</b> ' + d.sum.removed + '</span>' +
              '<span class="text-sky-600 dark:text-sky-400"><b>Değişen:</b> ' + d.sum.changed + '</span>' +
              '<span class="text-amber-600 dark:text-amber-400"><b>Taşınan:</b> ' + d.sum.moved + '</span>' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 h-[55vh]">' +
              ['Mevcut', 'Değiştirilecek'].map((t, i) =>
                '<div class="flex flex-col border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden">' +
                  '<div class="px-3 py-1.5 bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-[11px] font-bold text-slate-700 dark:text-slate-300">' + t + '</div>' +
                  '<div class="flex-1 relative overflow-hidden bg-slate-50 dark:bg-[#060a10]">' + (i ? mini(st.work, d.afterDiff) : mini(st.saved, d.beforeDiff)) + '</div>' +
                '</div>').join('') +
            '</div>' +
          '</div>' +
          '<div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel shrink-0">' +
            button({ variant: 'secondary', size: 'sm', label: 'Düzenlemeye Devam Et', attrs: 'data-pv="stay"' }) +
            button({ variant: 'danger', size: 'sm', label: 'İptal Et', attrs: 'data-pv="discard"' }) +
            button({ variant: 'primary', size: 'sm', icon: 'pi pi-check', label: 'Uygula', attrs: 'data-pv="accept"' }) +
          '</div>' +
        '</div>';
      const close = () => host.remove();
      host.addEventListener('click', e => {
        const b2 = e.target.closest('[data-pv]');
        if (!b2) return;
        const r = b2.getAttribute('data-pv');
        close();
        if (r === 'discard') discard();
        else if (r === 'accept') {
          st.saved = clone(st.work);
          persistFloor(st.saved);
          endEdit();
          renderAll();
          toast('Şema kaydedildi (sunum: değişiklikler bu oturumda tutulur).', 'success', 'Salon Planı');
        }
      });
      document.body.appendChild(host);
      previewHost = host;
    }
    let previewHost = null;

    // ---- işlemler ----------------------------------------------------------------
    function switchFloor(digit) {
      if (st.edit && isDirty()) toast('Kaydedilmemiş düzenlemeler bırakıldı.', 'warning', 'Salon Planı');
      endEdit();
      st.digit = digit;
      st.saved = loadFloor(digit);
      st.sel.clear();
      st.podHl = null;
      st.solo = new Set();
      st.vb = fitVB();
      applyVB();
      renderAll();
    }

    function openLocationModal() {
      const loc = DCIM.data.spaceEdit.location(st.digit);
      const body = '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
        kit.formField({ label: 'Şehir', control: kit.select('data-loc-city', [loc.city], loc.city) }) +
        kit.formField({ label: 'Bölge', control: kit.select('data-loc-region', [loc.region], loc.region) }) +
        kit.formField({ label: 'Kat', control: kit.select('data-loc-floor', (window.DCIM_FLOOR_LAYOUTS || []).map((Lx, i) => ({ value: i + 1, label: (i + 1) + '. Kat' })), st.digit) }) +
      '</div>' +
      '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-3">Düzenlemek istediğiniz Salonu seçiniz. Şema bütün katındır (salon seçimi şimdilik kaldırıldı).</p>';
      dialog({
        title: 'Lokasyon Seçimi', variant: 'info', body, confirmLabel: 'Uygula', cancelLabel: 'İptal Et', maxWidth: 'max-w-2xl',
        onConfirm: host => {
          const v = parseInt(host.querySelector('[data-loc-floor]').value, 10);
          if (v !== st.digit) switchFloor(v);
        }
      });
    }

    function exportAs(fmtKey) {
      st.exportOpen = false;
      renderToolbar();
      const f = fs();
      const dl = (name, type, text) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      if (fmtKey === 'json') {
        const payload = [{ schema_info: { schema_id: f.schemaId, page_title: f.title, layers: f.layers.map(l => { const c = Object.assign({}, l); delete c.network; return c; }) } }]
          .concat(f.layers.filter(l => l.kind === 'objects').map(l => ({ layer: l.id, entities: f.items.filter(i => i.layerId === l.id).concat(f.texts.filter(t => t.layerId === l.id)) })))
          .concat(f.layers.filter(l => l.kind !== 'objects').map(l => ({ layer: l.id, network: l.network })));
        dl(f.schemaId + '.json', 'application/json', JSON.stringify(payload, null, 2));
      } else if (fmtKey === 'svg') {
        const Ly = L();
        dl(f.schemaId + '.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Ly.mapW + ' ' + Ly.mapH + '"><style>' + EXPORT_CSS + '</style>' +
          '<rect width="100%" height="100%" fill="#ffffff"/>' + contentSvg(f, { interactive: false }) + '</svg>');
      } else {
        toast('DWG/DXF dışa aktarımı sunumda devre dışı.', 'info', 'Dışa Aktar');
      }
    }

    function clearSchema() {
      dialog({
        title: 'Şemayı Temizle?', variant: 'danger',
        body: '<p>Bu işlem mevcut şemadaki tüm objeleri silecektir. Devam etmek istiyor musunuz?</p>',
        confirmLabel: 'Evet, Temizle', cancelLabel: 'Hayır',
        onConfirm: () => {
          st.work.items = [];
          st.work.texts = [];
          st.work.layers.forEach(l => { if (l.network) l.network = { nodes: [], edges: [] }; });
          st.sel.clear(); st.podHl = null; st.pathResult = null;
          commit();
          renderAll();
        }
      });
    }

    function deleteSelection() {
      if (!st.sel.size) return;
      const n = st.sel.size;
      dialog({
        title: 'Sil', variant: 'danger',
        body: '<p>' + (n > 1 ? n + ' öğe' : 'Seçili öğe') + ' şemadan silinsin mi? Değişiklik "Kaydet" ile kalıcı olur.</p>',
        confirmLabel: 'Sil', cancelLabel: 'İptal Et',
        onConfirm: () => {
          st.work.items = st.work.items.filter(i => !st.sel.has(i.id));
          st.work.texts = st.work.texts.filter(t => !st.sel.has(t.id));
          st.sel.clear();
          commit();
          renderAll();
        }
      });
    }

    function textDialog(title, initial, onOk) {
      dialog({
        title, variant: 'info',
        body: kit.formField({ label: 'Metin', control: '<input type="text" data-se-text-input class="' + kit.INPUT_CLS + '" value="' + esc(initial || '') + '" maxlength="80">' }),
        confirmLabel: 'Kaydet', cancelLabel: 'İptal Et',
        onConfirm: host => {
          const v = host.querySelector('[data-se-text-input]').value.trim();
          if (!v) return false;
          onOk(v);
        }
      });
      setTimeout(() => { const i = document.querySelector('[data-se-text-input]'); if (i) { i.focus(); i.select(); } }, 30);
    }

    function applyFacing(v) {
      const cabs = selectedCabinets();
      if (!cabs.length) return;
      cabs.forEach(c => { c.facing = v || null; });
      commit();
      renderSide(); renderCanvas();
    }

    function applyPod(input) {
      const cabs = selectedCabinets();
      if (!cabs.length) return;
      let pod = '';
      if (input !== null) {
        const raw = String(input).trim();
        if (!raw) return;
        pod = resolvePod(raw);
        if (!pod) { toast('POD adı çözümlenemedi: ' + raw, 'warning', 'POD'); return; }
      }
      const doc = DCIM.data.spaceEdit.pduDoc(st.digit);
      const ids = new Set(cabs.map(c => c.id));
      let n = 0;
      [st.saved, st.work].forEach(f => f && f.items.forEach(i => { if (ids.has(i.id) && (i.pod || '') !== pod) { i.pod = pod || null; if (f === st.saved) n++; } }));
      persistFloor(st.saved);
      if (pod) {
        toast(n + ' kabin ' + pod + ' grubuna yazıldı (' + doc + ').', 'success', 'POD');
        if (!st.work.texts.some(t => t.kind === 'text-pod' && t.text === pod)) {
          const b = bboxOf(cabs);
          st.work.texts.push({ id: 'txt_pod_' + Date.now().toString(36), text: pod, x: Math.round((b.x0 + b.x1) / 2), y: Math.round(b.y1 + 24), kind: 'text-pod', layerId: 'metin' });
          commit();
          toast(pod + ' metni krokiye eklendi; yerini sürükleyip krokiyi kaydedin.', 'info', 'POD');
        }
        st.podHl = pod;
      } else {
        toast(n + ' kabin POD\'dan çıkarıldı (' + doc + ').', 'success', 'POD');
      }
      st.podChoice = '';
      renderSide(); renderCanvas();
    }

    function selectPod(pod, zoom) {
      st.podHl = pod;
      const pm = podMap();
      st.sel = new Set(fs().items.filter(i => i.type === 'cabinet' && pm[i.id] === pod).map(i => i.id));
      if (zoom) { const b = podBox(pod); if (b) zoomToBox(b, 160); }
      renderSide(); renderCanvas();
    }

    // ---- ağ çizimi ---------------------------------------------------------------
    function snapFine(v, off) {
      const step = st.gridUnit / 3;
      return Math.round((v - off) / step) * step + off;
    }
    function nearNode(layer, p, tol) {
      let best = null, bd = tol;
      layer.network.nodes.forEach(n => { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d <= bd) { bd = d; best = n; } });
      return best;
    }
    let seq = 0;
    const newId = pfx => pfx + Date.now().toString(36) + (++seq);
    function networkClick(p, target) {
      const layer = layerById(st.netLayer);
      if (!layer || !layer.network) return;
      const tol = 10 * unitsPerPx();
      if (st.netMode === 'erase') {
        const eg = target.closest('[data-se-edge]');
        if (!eg || eg.getAttribute('data-se-edge-layer') !== layer.id) return;
        const id = eg.getAttribute('data-se-edge');
        layer.network.edges = layer.network.edges.filter(e => e.id !== id);
        const used = new Set();
        layer.network.edges.forEach(e => { used.add(e.a); used.add(e.b); });
        layer.network.nodes = layer.network.nodes.filter(n => used.has(n.id) || n.riser);
        commit(); renderSide(); renderCanvas();
        return;
      }
      if (st.netMode === 'riser') {
        const ng = target.closest('[data-se-node]');
        const n = ng && ng.getAttribute('data-se-node-layer') === layer.id
          ? layer.network.nodes.find(x => x.id === ng.getAttribute('data-se-node'))
          : nearNode(layer, p, tol);
        if (!n) return;
        n.riser = !n.riser ? 'up' : n.riser === 'up' ? 'down' : undefined;
        if (!n.riser) delete n.riser;
        commit(); renderCanvas();
        return;
      }
      // çiz
      const f = fs();
      const q = { x: Math.round(snapFine(p.x, f.gridOffsetX || 0) * 1000) / 1000, y: Math.round(snapFine(p.y, f.gridOffsetY || 0) * 1000) / 1000 };
      let node = nearNode(layer, p, tol);
      if (!st.chain || st.chain.layerId !== layer.id) {
        if (!node) { node = { id: newId(layer.id + '-n'), x: q.x, y: q.y }; layer.network.nodes.push(node); }
        st.chain = { layerId: layer.id, nodeId: node.id };
        renderOverlay();
        return;
      }
      if (node && node.id === st.chain.nodeId) { st.chain = null; renderOverlay(); return; }
      if (!node) { node = { id: newId(layer.id + '-n'), x: q.x, y: q.y }; layer.network.nodes.push(node); }
      layer.network.edges.push({ id: newId(layer.id + '-e'), a: st.chain.nodeId, b: node.id });
      st.chain = { layerId: layer.id, nodeId: node.id };
      commit(); renderSide(); renderCanvas();
    }
    function endChain() {
      if (!st.chain) return;
      // tek başına kalan başlangıç düğümünü temizle
      const layer = layerById(st.chain.layerId);
      if (layer && layer.network) {
        const id = st.chain.nodeId;
        if (!layer.network.edges.some(e => e.a === id || e.b === id)) layer.network.nodes = layer.network.nodes.filter(n => n.id !== id || n.riser);
      }
      st.chain = null;
      renderCanvas();
    }

    function cablePathClick(target) {
      const g = target.closest('[data-se-item]');
      const it = g && fs().items.find(i => i.id === g.getAttribute('data-se-item'));
      if (!it || it.type !== 'cabinet') return;
      if (st.pathPick.length >= 2) st.pathPick = [];
      st.pathPick.push(it.label);
      st.pathResult = null;
      if (st.pathPick.length === 2) computePath(st.pathPick[0], st.pathPick[1]);
      renderSide(); renderCanvas();
    }
    function computePath(a, b) {
      const f = fs();
      const ca = f.items.find(i => i.label === a), cb = f.items.find(i => i.label === b);
      if (!ca || !cb) return;
      const r = shortestPath(f, st.netLayer, ca, cb);
      st.pathResult = r ? Object.assign(r, { from: a, to: b }) : { pts: null, from: a, to: b };
    }

    // ---- fare ---------------------------------------------------------------------
    let drag = null;   // {kind:'pan'|'box'|'move'|'grid', ...}
    function onDown(e) {
      if (previewHost && document.body.contains(previewHost)) return;
      const p = svgPoint(e);
      const t = e.target;
      if (st.edit && (e.button === 1 || (e.button === 0 && e.shiftKey && st.tool === 'select'))) {
        e.preventDefault();
        drag = { kind: 'box', x0: p.x, y0: p.y, add: e.ctrlKey || e.metaKey };
        return;
      }
      if (e.button !== 0) return;
      if (st.edit && st.tool === 'network') { e.preventDefault(); networkClick(p, t); return; }
      if (st.edit && st.tool === 'cablepath') { e.preventDefault(); if (t.closest('[data-se-item]')) { cablePathClick(t); return; } }
      if (st.edit && st.tool === 'text') {
        e.preventDefault();
        const tg = t.closest('[data-se-text]');
        if (tg) {
          const tx = st.work.texts.find(x => x.id === tg.getAttribute('data-se-text'));
          if (tx) textDialog('Metni Düzenle', tx.text, v => { tx.text = v; if (POD_RE.test(v)) tx.kind = 'text-pod'; commit(); renderAll(); });
          return;
        }
        const layerId = (layerById(st.activeObjLayer) && layerById(st.activeObjLayer).kind === 'objects') ? st.activeObjLayer : 'metin';
        textDialog('Metin Ekle', '', v => {
          const id = newId('txt_');
          st.work.texts.push({ id, text: v, x: Math.round(p.x), y: Math.round(p.y), kind: POD_RE.test(v) ? 'text-pod' : 'text', layerId });
          st.sel = new Set([id]);
          commit(); renderAll();
        });
        return;
      }
      if (st.edit && st.tool === 'draggrid') {
        e.preventDefault();
        drag = { kind: 'grid', x0: p.x, y0: p.y, ox: st.work.gridOffsetX || 0, oy: st.work.gridOffsetY || 0 };
        return;
      }
      if (st.edit && st.tool === 'select') {
        const ig = t.closest('[data-se-item]') || t.closest('[data-se-text]');
        if (ig) {
          e.preventDefault();
          const id = ig.getAttribute('data-se-item') || ig.getAttribute('data-se-text');
          if (e.ctrlKey || e.metaKey) {
            if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id);
            renderSide(); renderCanvas();
            return;
          }
          if (!st.sel.has(id)) { st.sel = new Set([id]); renderSide(); renderCanvas(); }
          const orig = {};
          st.work.items.concat(st.work.texts).forEach(o => { if (st.sel.has(o.id)) orig[o.id] = { x: o.x, y: o.y }; });
          drag = { kind: 'move', x0: p.x, y0: p.y, orig, moved: false };
          return;
        }
        if (st.sel.size && !(e.ctrlKey || e.metaKey)) { st.sel.clear(); renderSide(); renderCanvas(); }
      }
      e.preventDefault();
      drag = { kind: 'pan', cx: e.clientX, cy: e.clientY, vb: Object.assign({}, st.vb) };
      svg.classList.add('is-panning');
    }
    function onMove(e) {
      if (st.edit && st.tool === 'network' && st.chain) {
        const p = svgPoint(e);
        const f = fs();
        st.cursor = { x: snapFine(p.x, f.gridOffsetX || 0), y: snapFine(p.y, f.gridOffsetY || 0) };
        renderOverlay();
      }
      if (!drag) return;
      const p = svgPoint(e);
      if (drag.kind === 'pan') {
        const k = unitsPerPx();
        st.vb = Object.assign({}, drag.vb, { x: drag.vb.x - (e.clientX - drag.cx) * k, y: drag.vb.y - (e.clientY - drag.cy) * k });
        applyVB();
      } else if (drag.kind === 'box') {
        const x = Math.min(drag.x0, p.x), y = Math.min(drag.y0, p.y);
        drag.box = { x, y, w: Math.abs(p.x - drag.x0), h: Math.abs(p.y - drag.y0) };
        renderOverlay('<rect class="se-selbox" x="' + x + '" y="' + y + '" width="' + drag.box.w + '" height="' + drag.box.h + '" />');
      } else if (drag.kind === 'move') {
        let dx = p.x - drag.x0, dy = p.y - drag.y0;
        if (st.snap) { const s = st.gridUnit / 4; dx = Math.round(dx / s) * s; dy = Math.round(dy / s) * s; }
        drag.dx = dx; drag.dy = dy;
        drag.moved = drag.moved || Math.abs(dx) > 0 || Math.abs(dy) > 0;
        Object.keys(drag.orig).forEach(id => {
          const g = contentG.querySelector('[data-se-item="' + id + '"], [data-se-text="' + id + '"]');
          if (g) g.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
        });
      } else if (drag.kind === 'grid') {
        const u = st.gridUnit;
        const ox = ((drag.ox + p.x - drag.x0) % u + u) % u, oy = ((drag.oy + p.y - drag.y0) % u + u) % u;
        st.work.gridOffsetX = Math.round(ox); st.work.gridOffsetY = Math.round(oy);
        gridPat.setAttribute('x', st.work.gridOffsetX); gridPat.setAttribute('y', st.work.gridOffsetY);
      }
    }
    function onUp() {
      if (!drag) return;
      const d = drag;
      drag = null;
      svg.classList.remove('is-panning');
      if (d.kind === 'box') {
        if (d.box && (d.box.w > 3 || d.box.h > 3)) {
          const f = fs();
          const vis = layerVisibleFn(f, st.solo);
          const hit = (x, y, w, h) => x < d.box.x + d.box.w && x + w > d.box.x && y < d.box.y + d.box.h && y + h > d.box.y;
          const next = d.add ? new Set(st.sel) : new Set();
          f.items.forEach(i => { if (vis(i.layerId) && hit(i.x, i.y, i.w, i.h)) next.add(i.id); });
          f.texts.forEach(t => { if (vis(t.layerId) && hit(t.x - 10, t.y - 8, 20, 16)) next.add(t.id); });
          st.sel = next;
        }
        renderSide(); renderCanvas();
      } else if (d.kind === 'move') {
        if (d.moved) {
          st.work.items.concat(st.work.texts).forEach(o => {
            if (d.orig[o.id]) { o.x = Math.round(d.orig[o.id].x + d.dx); o.y = Math.round(d.orig[o.id].y + d.dy); }
          });
          commit();
          renderToolbar(); renderSide(); renderCanvas();
        }
      } else if (d.kind === 'grid') {
        commit();
        renderSide();
      }
    }
    function onWheel(e) {
      e.preventDefault();
      const p = svgPoint(e);
      zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }
    function onDbl() {
      if (st.edit && st.tool === 'network') endChain();
    }
    function onKey(e) {
      if (!document.body.contains(root)) return;
      const tag = (e.target && e.target.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (document.querySelector('[data-dialog-panel]') || (previewHost && document.body.contains(previewHost))) return;
      if (!st.edit) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (k === 'delete') { e.preventDefault(); deleteSelection(); }
      else if (k === 'escape') {
        if (st.chain) endChain();
        else if (st.sel.size) { st.sel.clear(); renderSide(); renderCanvas(); }
      }
    }

    svg.addEventListener('mousedown', onDown);
    svg.addEventListener('dblclick', onDbl);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', e => { if (st.edit && st.tool === 'network') { e.preventDefault(); endChain(); } });
    svg.addEventListener('mouseleave', () => { if (st.cursor) { st.cursor = null; renderOverlay(); } });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
    minimapEl.addEventListener('mousedown', e => {
      const m = minimapEl.querySelector('[data-se-mini]');
      if (!m) return;
      const ctm = m.getScreenCTM();
      if (!ctm) return;
      const pt = m.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(ctm.inverse());
      st.vb = Object.assign({}, st.vb, { x: q.x - st.vb.w / 2, y: q.y - st.vb.h / 2 });
      applyVB();
    });

    // ---- tıklama / giriş delegasyonu -------------------------------------------------
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-act]');
      if (!a || !root.contains(a)) {
        if (st.exportOpen && !e.target.closest('[data-act="export-menu"]')) { st.exportOpen = false; renderToolbar(); }
        return;
      }
      const act = a.getAttribute('data-act');
      const v = a.getAttribute('data-v');
      const id = a.getAttribute('data-id');
      if (act !== 'export-menu' && act !== 'export' && st.exportOpen) { st.exportOpen = false; renderToolbar(); }
      switch (act) {
        case 'zoom-in': zoomAt(1 / 1.3, st.vb.x + st.vb.w / 2, st.vb.y + st.vb.h / 2); break;
        case 'zoom-out': zoomAt(1.3, st.vb.x + st.vb.w / 2, st.vb.y + st.vb.h / 2); break;
        case 'zoom-fit': st.vb = fitVB(); applyVB(); break;
        case 'location': openLocationModal(); break;
        case 'edit': beginEdit(); renderAll(); break;
        case 'save': openPreview(); break;
        case 'discard': discard(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'import': toast('İçe aktarma (JSON / DXF) sunumda devre dışı; kurgusal kat planı kullanılıyor.', 'info', 'İçe Aktar'); break;
        case 'export-menu': st.exportOpen = !st.exportOpen; renderToolbar(); break;
        case 'export': exportAs(a.getAttribute('data-fmt')); break;
        case 'clear': clearSchema(); break;
        case 'toggle-minimap': e.preventDefault(); st.minimap = !st.minimap; renderSide(); renderMinimap(); break;
        case 'toggle-snap': e.preventDefault(); st.snap = !st.snap; renderSide(); break;
        case 'grid-unit': st.gridUnit = Number(v); renderSide(); renderCanvas(); break;
        case 'grid-reset': st.work.gridOffsetX = 0; st.work.gridOffsetY = 0; commit(); renderSide(); renderCanvas(); break;
        case 'layer-eye': {
          e.stopPropagation();
          const l = layerById(id);
          if (l) { l.visible = !l.visible; commit(); renderAll(); }
          break;
        }
        case 'layer-row': {
          const l = layerById(id);
          if (!l) break;
          if (l.kind === 'objects') st.activeObjLayer = l.id;
          else { st.tool = 'network'; st.netLayer = l.id; st.netMode = 'draw'; st.chain = null; }
          const next = new Set(st.solo);
          if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
          st.solo = next;
          renderSide(); renderCanvas();
          break;
        }
        case 'layer-remove': {
          e.stopPropagation();
          const l = layerById(id);
          if (!l || !canRemoveLayer(l)) break;
          st.work.layers = st.work.layers.filter(x => x.id !== id);
          if (st.activeObjLayer === id) st.activeObjLayer = (st.work.layers.find(x => x.kind === 'objects') || {}).id || 'kabin';
          st.solo.delete(id);
          commit(); renderAll();
          break;
        }
        case 'layer-add': {
          const objs = st.work.layers.filter(l => l.kind === 'objects');
          const nl = { id: 'katman-' + Date.now().toString(36), name: st.newLayerName.trim() || 'Katman ' + (objs.length + 1), kind: 'objects', order: Math.max(0, ...objs.map(l => l.order)) + 10, visible: true };
          st.work.layers.push(nl);
          st.activeObjLayer = nl.id;
          st.newLayerName = '';
          commit(); renderAll();
          break;
        }
        case 'solo-clear': st.solo = new Set(); renderSide(); renderCanvas(); break;
        case 'move-to-layer': {
          const target = st.activeObjLayer;
          st.work.items.concat(st.work.texts).forEach(o => { if (st.sel.has(o.id)) o.layerId = target; });
          commit(); renderAll();
          break;
        }
        case 'tool':
          if (st.chain) endChain();
          st.tool = v;
          if (v !== 'cablepath') { st.pathPick = []; }
          renderSide(); renderCanvas();
          break;
        case 'net-tool': if (st.chain) endChain(); st.tool = 'network'; st.netLayer = id; renderSide(); renderCanvas(); break;
        case 'net-mode': if (st.chain) endChain(); st.netMode = v; renderSide(); renderCanvas(); break;
        case 'path-layer':
          st.netLayer = id;
          if (st.pathPick.length === 2) computePath(st.pathPick[0], st.pathPick[1]);
          renderSide(); renderCanvas();
          break;
        case 'edit-text': {
          const t = selectedTexts()[0];
          if (t) textDialog('Metni Düzenle', t.text, val => { t.text = val; if (POD_RE.test(val)) t.kind = 'text-pod'; commit(); renderAll(); });
          break;
        }
        case 'delete': deleteSelection(); break;
        case 'facing': applyFacing(v); break;
        case 'pod-apply': applyPod(st.podChoice); break;
        case 'pod-remove': applyPod(null); break;
        case 'pod-hl':
          if (st.podHl === v) { st.podHl = null; renderSide(); renderCanvas(); }
          else selectPod(v, true);
          break;
        case 'sel-clear': st.sel.clear(); renderSide(); renderCanvas(); break;
      }
    });
    root.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-se-title]')) { st.work.title = t.value; }
      else if (t.matches('[data-se-new-layer]')) st.newLayerName = t.value;
      else if (t.matches('[data-se-pod-input]')) st.podChoice = t.value;
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-se-title]')) { commit(); renderToolbar(); }
      else if (t.matches('[data-se-grid-input]')) {
        const n = Math.min(GRID_UNIT_MAX, Math.max(GRID_UNIT_MIN, Math.round(Number(t.value) || 40)));
        st.gridUnit = n; renderSide(); renderCanvas();
      }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.matches('[data-se-new-layer]')) { e.preventDefault(); root.querySelector('[data-act="layer-add"]').click(); }
      if (e.key === 'Enter' && e.target.matches('[data-se-pod-input]')) { e.preventDefault(); applyPod(st.podChoice); }
    });

    // ---- derin bağlantılar --------------------------------------------------------------
    const p = k => params.get(k);
    const wantEdit = p('edit') === '1' || ['panel', 'select', 'pod', 'path', 'tool', 'facing', 'solo'].some(k => params.has(k));
    if (wantEdit) beginEdit();
    if (p('solo')) st.solo = new Set(p('solo').split(',').map(s => s.trim()).filter(Boolean));
    if (p('select')) {
      const labels = new Set(p('select').split(',').map(s => s.trim().toUpperCase()));
      st.sel = new Set(fs().items.filter(i => labels.has(String(i.label).toUpperCase())).map(i => i.id));
    }
    if (p('pod')) {
      const pod = resolvePod(p('pod')) || p('pod');
      st.podHl = pod;
      if (!p('select')) {
        const pm = podMap();
        st.sel = new Set(fs().items.filter(i => i.type === 'cabinet' && pm[i.id] === pod).map(i => i.id));
      }
    }
    if (p('facing') && st.edit && /^[NSEW]$/.test(p('facing'))) {
      selectedCabinets().forEach(c => { c.facing = p('facing'); });
      commit();
    }
    if (p('tool') && ['select', 'text', 'draggrid', 'network', 'cablepath'].indexOf(p('tool')) >= 0) st.tool = p('tool');
    if (p('layer') === 'tel-tava' || p('layer') === 'fiber-runner') st.netLayer = p('layer');
    if (p('mode') && ['draw', 'erase', 'riser'].indexOf(p('mode')) >= 0) st.netMode = p('mode');
    if (p('panel') === 'runner') { st.tool = 'network'; st.netLayer = p('layer') || 'fiber-runner'; }
    if (p('path')) {
      const parts = p('path').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (parts.length === 2) {
        st.tool = 'cablepath';
        st.pathPick = parts;
        computePath(parts[0], parts[1]);
      }
    }

    renderAll();
    applyVB();
    const selItems = selectedItems();
    if (selItems.length && (p('select') || p('pod'))) {
      requestAnimationFrame(() => { const b = bboxOf(selItems); if (b) zoomToBox(b, 160); });
    }
    if (p('panel')) {
      const map = { layers: 'layers', facing: st.sel.size ? 'facing' : 'tools', pod: st.sel.size ? 'pod' : 'pods', runner: 'runner' };
      requestAnimationFrame(() => flashSection(map[p('panel')] || 'tools'));
    } else if (p('path') || p('tool')) {
      requestAnimationFrame(() => flashSection('runner'));
    }
    if (st.pathResult && st.pathResult.pts) {
      const xs = st.pathResult.pts.map(q => q.x), ys = st.pathResult.pts.map(q => q.y);
      requestAnimationFrame(() => zoomToBox({ x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys), x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) }, 120));
    }
    if (p('save') === '1' && st.edit) setTimeout(openPreview, 50);

    const onResize = () => applyVB();
    window.addEventListener('resize', onResize);

    return {
      destroy() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', onKey);
        if (previewHost) previewHost.remove();
      }
    };
  }

  DCIM.engRegistry['space-edit'] = { mount };
})();
