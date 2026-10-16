/* ==========================================================================
   DCIM Sunum — PMS Tek Hat çizimi (app-energy-single-line + energy-general-view'in tek hat bölümü)
   Kaynak: new-ui/pages/energy/single-line/single-line.component.{ts,html,scss}
           new-ui/pages/energy/energy-general-view (app-schematic-toolbar başlığı, "Klasik görünüm",
           seçim kartı: Mekânsal konum (BMS) / Alarmlar / İşareti kaldır)
   Veri: DCIM.data.pmsSingleLine (js/mock/pms-single-line.data.js — SCH kayıtlarından)

   Sözleşme (pms.js bunu kullanır):
     DCIM.pmsSingleLine.schemas            → [{ id, label }] (kenar çubuğu TEK HAT sırası)
     DCIM.pmsSingleLine.mount(el, opts)    → { destroy(), setFocus(focus) }
        opts.schemaId : gösterilecek şema (yoksa focus'tan çözülür, o da yoksa ilk şema)
        opts.focus    : { devId?, rid?, severity?: 'acil'|'alarm'|'uyari'|'veri-yok', text?, time? } | null
                        → önem renginde nabızlı halka + iğne + alarm metni, otomatik yakınlaşma, diğerleri soluk
        opts.onLocate(devId, alarm?) : "Mekânsal konum (BMS)"; yoksa bms.html?dev=<devId>&from=pms
        opts.onFocusClear()          : "İşareti kaldır" sonrası (isteğe bağlı)
     DCIM.pmsSingleLine.resolve(ridOrDevId) → { schemaId, devId } | null
        (energy-general-view.locateSource: önek eşleşmesi, en uzun cihaz kimliği, eşitlikte kenar çubuğu sırası)

   Çizim kuralları (orijinalle aynı): 1 hücre = 40 px; kesici kapalı ⇔ rotation === initialRotation;
   çizimdeki kapalı oranı < %20 ise varsayılan işletme (tümü kapalı) + sunum senaryosundaki açık kesiciler;
   enerji kaynaklardan (jeneratör/trafo) kapalı kesiciler üzerinden yayılır. Elektriksel durum renksizdir
   (gri ton + biçim); önem renkleri yalnız alarm halkası/işaretinde (K-07).
   Canlı değerler (P, U, f, I, cosφ) tohumlu sunum verisidir; 3 sn'de bir hafif oynar.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data || {};
  const SRC = D.pmsSingleLine || { schemas: [], scenario: {}, demoAlarms: [] };

  const esc = (DCIM.ui && DCIM.ui.esc) || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const rngOf = key => (D.rng && D.hash ? D.rng(D.hash(key)) : Math.random);

  const CELL = 40;
  /** Kablo uçlarının birleşme toleransı (~0.3 hücre). */
  const TOL = 0.3 * CELL;
  const SWITCH_HALF = 11;
  const SWITCH_HIT = 16;
  const LIVE_MS = 3000;

  // alarm-severity.util.ts SEVERITY_COLOR (sunum sözleşmesinde 'veri-yok' = 'kayip')
  const SEV_COLOR = { acil: '#7E22CE', alarm: '#DC2626', uyari: '#D97706', kayip: '#EA580C', normal: '#16A34A' };
  const SEV_LABEL = { acil: 'Acil', alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Veri yok' };
  const normSev = s => (s === 'veri-yok' || s === 'kayip' ? 'kayip' : SEV_COLOR[s] && s !== 'normal' ? s : 'alarm');

  const KIND_NAME = { generator: 'Jeneratör', transformer: 'Trafo', switch: 'Kesici', fixed: 'Sabit bağlantı', ups: 'UPS', source: 'AC kaynak' };
  const TYPE_OF = { g: 'generator', t: 'transformer', s: 'switch', f: 'switch-sabit', c: 'cable', c2: 'cable2', b: 'line_dashed', l: 'label' };
  const DEAD_SOURCE = new Set(['DEVREDIŞI', 'DEVREDISI', 'BAĞLANAMADI', 'BAGLANAMADI', 'OFF']);

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d || 0); };
  const normId = v => String(v == null ? '' : v).trim().toLocaleLowerCase('en-US').replace(/_dv$/, '');
  const trUpper = s => String(s || '').toLocaleUpperCase('tr-TR').trim();

  function distToSeg(px, py, l) {
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - l.x1) * dx + (py - l.y1) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (l.x1 + t * dx), py - (l.y1 + t * dy));
  }

  /** statusText → önem (yalnız alarm halkası için). */
  function severityOf(status) {
    const s = trUpper(status);
    if (!s) return null;
    if (s === 'ACİL' || s === 'ACIL') return 'acil';
    if (s === 'ALARM') return 'alarm';
    if (s === 'UYARI') return 'uyari';
    if (s === 'VERİ ESKİ' || s === 'VERI ESKI' || s === 'BAĞLANAMADI' || s === 'BAGLANAMADI') return 'kayip';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Veri: kısaltılmış satırlar → SchemaItem benzeri nesneler
  // ---------------------------------------------------------------------------
  const schemaById = new Map((SRC.schemas || []).map(s => [s.id, s]));

  function itemsOf(schema) {
    const sc = (SRC.scenario && SRC.scenario[schema.id]) || {};
    const st = sc.status || {};
    const ovl = new Set(sc.overload || []), stale = new Set(sc.stale || []);
    return schema.items.map(r => {
      const t = TYPE_OF[r[0]];
      const it = { id: r[1], originalType: t, label: r[2], devId: r[3] === '=' ? r[1] : r[3], x: r[4], y: r[5] };
      if (r[0] === 'g' || r[0] === 't') { it.shape = 'svg-icon'; it.width = r[6]; it.height = 0; }
      else if (r[0] === 's' || r[0] === 'f') { it.rotation = r[6]; it.initialRotation = r[7]; }
      else if (r[0] === 'l') it.fontSize = r[6];
      else { it.x2 = r[6]; it.y2 = r[7]; it.connectedToStart = r[8]; it.connectedToEnd = r[9]; }
      it.statusText = st[it.devId] || '';
      it.overload = ovl.has(it.devId);
      it.stale = stale.has(it.devId);
      return it;
    });
  }

  /** Şemadaki tüm cihaz kimlikleri (classifyPages: sch_map'teki dev_id değerleri). */
  const devIdsOf = schema => schema.items.map(r => (r[3] === '=' ? r[1] : r[3])).filter(Boolean);

  // ---------------------------------------------------------------------------
  // Model (single-line.component.ts buildModel birebir)
  // ---------------------------------------------------------------------------
  function buildModel(items, openSet) {
    const nodes = [], lines = [], labels = [], refs = [];

    const baseNode = (it, kind, cx, cy, r, hr, w, h, vertical, closed) => {
      const statusText = String(it.statusText || '');
      const sev = kind === 'switch' ? null : severityOf(statusText);
      return {
        id: String(it.id || it.devId || kind + '_' + nodes.length), src: it, kind,
        label: String(it.label || it.devId || ''),
        cx, cy, r, hr, w, h, vertical, closed, energized: false,
        sev, sevColor: sev ? SEV_COLOR[sev] : '', statusText,
        values: [], lx: cx + r + 10, ly: cy - 4, anchor: 'start',
        transform: 'translate(' + cx + ' ' + cy + ')' + (vertical ? '' : ' rotate(90)')
      };
    };

    items.forEach(it => {
      const t = String(it.originalType || '').toLowerCase();
      if (t === 'generator' || t === 'transformer' || t === 'ups' || t === 'ac_source') {
        const kind = t === 'ac_source' ? 'source' : t;
        const def = kind === 'generator' ? 100 : kind === 'ups' ? 80 : 70;
        let w, h;
        if (it.shape === 'svg-icon' || !num(it.height)) { w = h = num(it.width) || num(it.size) || def; }
        else { w = num(it.width, def); h = num(it.height, def); }
        const cx = num(it.x) + w / 2, cy = num(it.y) + h / 2;
        const half = Math.min(w, h) / 2;
        let r, sw = 0, sh = 0;
        if (kind === 'generator') r = half * 0.62;
        else if (kind === 'transformer') { sw = half * 0.5; r = sw * 1.62; }
        else if (kind === 'ups') { sw = Math.max(44, Math.min(64, w * 0.62)); sh = sw * 0.74; r = sw / 2; }
        else r = half * 0.55;
        nodes.push(baseNode(it, kind, cx, cy, r, Math.max(w, h) / 2 + TOL, sw, sh, true, true));
      } else if (t === 'switch' || t === 'switch-sabit') {
        const rot = num(it.rotation);
        const init = num(it.initialRotation == null ? it.rotation : it.initialRotation);
        const vertical = (((init % 180) + 180) % 180) === 90;
        const fixed = t === 'switch-sabit';
        nodes.push(baseNode(it, fixed ? 'fixed' : 'switch', num(it.x), num(it.y), fixed ? 6 : SWITCH_HALF, SWITCH_HIT + TOL, 0, 0, vertical, fixed ? true : rot === init));
      } else if (t === 'cable' || t === 'cable2' || t === 'line_dashed') {
        if (it.x2 === undefined || it.y2 === undefined) return;
        const kind = t === 'cable' ? 'cable' : t === 'cable2' ? 'tie' : 'border';
        const x1 = num(it.x), y1 = num(it.y), x2 = num(it.x2), y2 = num(it.y2);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 1) return;
        const line = { id: String(it.id || it.devId || kind + '_' + lines.length), src: it, devId: String(it.devId || ''), kind, x1, y1, x2, y2, len, d: '', bus: false, live: false, rev: false };
        lines.push(line);
        if (kind !== 'border') refs.push({ line, start: String(it.connectedToStart || ''), end: String(it.connectedToEnd || '') });
      } else if (t === 'label') {
        const fs = parseFloat(String(it.fontSize || '')) || 18;
        labels.push({ id: String(it.id || 'label_' + labels.length), text: String(it.label || ''), x: num(it.x), y: num(it.y), size: Math.max(13, Math.min(22, fs * 0.62)) });
      }
    });

    // ── Bağlantı grafı ──
    const adj = new Map();
    const link = (a, b) => {
      if (!a || !b || a === b) return;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a).add(b);
      adj.get(b).add(a);
    };
    nodes.forEach(n => adj.set(n.id, adj.get(n.id) || new Set()));
    const elec = lines.filter(l => l.kind !== 'border');
    elec.forEach(l => adj.set(l.id, adj.get(l.id) || new Set()));

    // 1) SCH'deki açık bağlantılar (devId ya da id)
    const idOf = new Map();
    nodes.forEach(n => { idOf.set(n.id, n.id); if (n.src.devId) idOf.set(String(n.src.devId), n.id); });
    elec.forEach(l => { idOf.set(l.id, l.id); if (l.devId) idOf.set(l.devId, l.id); });
    refs.forEach(r => [r.start, r.end].forEach(ref => { const t = ref ? idOf.get(ref) : undefined; if (t) link(r.line.id, t); }));

    // 2) Geometrik yakınlık; uç düğüm içindeyse yalnız düğüme bağlanır (şalteri atlayan kısa devre olmasın)
    const junctions = [];
    const endCount = new Map();
    elec.forEach(l => {
      [[l.x1, l.y1], [l.x2, l.y2]].forEach(([px, py]) => {
        let hitNode = false;
        nodes.forEach(n => { if (Math.hypot(px - n.cx, py - n.cy) <= n.hr) { link(l.id, n.id); hitNode = true; } });
        if (hitNode) return;
        const key = Math.round(px / 5) + '_' + Math.round(py / 5);
        const e = endCount.get(key) || { x: px, y: py, ids: [] };
        e.ids.push(l.id);
        endCount.set(key, e);
        elec.forEach(o => {
          if (o === l || distToSeg(px, py, o) > TOL) return;
          link(l.id, o.id);
          // T bağlantı: uç, diğer hattın ortasına değiyorsa bağlantı noktası
          if (Math.hypot(px - o.x1, py - o.y1) > TOL && Math.hypot(px - o.x2, py - o.y2) > TOL) {
            junctions.push({ id: 'j_' + l.id + '_' + o.id, x: px, y: py, live: false });
          }
        });
      });
    });
    endCount.forEach((e, k) => { if (e.ids.length >= 3) junctions.push({ id: 'jn_' + k, x: e.x, y: e.y, live: false }); });

    // ── Şalter durumu: çizimde kapalı oranı < %20 ise varsayılan işletme (tümü kapalı) ──
    const breakers = nodes.filter(n => n.kind === 'switch');
    const drawnClosed = breakers.filter(n => n.closed).length;
    const nominal = breakers.length > 0 && drawnClosed / breakers.length < 0.2;
    if (nominal) breakers.forEach(n => (n.closed = true));
    // Sunum senaryosu: açan kesiciler (TRIP vb.)
    if (openSet && openSet.size) breakers.forEach(n => { if (openSet.has(normId(n.src.devId))) n.closed = false; });

    // ── Enerji yayılımı: kaynaklardan kapalı şalterler üzerinden ──
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const lineById = new Map(elec.map(l => [l.id, l]));
    const energized = new Set();
    const queue = [];
    nodes
      .filter(n => (n.kind === 'generator' || n.kind === 'transformer' || n.kind === 'source')
        && !DEAD_SOURCE.has(trUpper(n.statusText))
        && !(n.kind === 'source' && n.src.is_energized === false && !!n.statusText))
      .forEach(n => { energized.add(n.id); queue.push(n.id); });

    const posOf = (id, toward) => {
      const n = nodeById.get(id);
      if (n) return [n.cx, n.cy];
      const l = lineById.get(id);
      if (!l) return [0, 0];
      const a = Math.min(distToSeg(toward.x1, toward.y1, l), distToSeg(toward.x2, toward.y2, l));
      const ends = [[l.x1, l.y1], [l.x2, l.y2]];
      let best = ends[0], bd = Infinity;
      ends.forEach(e => { const dd = distToSeg(e[0], e[1], toward); if (dd < bd) { bd = dd; best = e; } });
      return a <= bd ? [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2] : best;
    };

    while (queue.length) {
      const v = queue.shift();
      const vn = nodeById.get(v);
      if (vn && vn.kind === 'switch' && !vn.closed) continue;
      (adj.get(v) || new Set()).forEach(w => {
        if (energized.has(w)) return;
        const wn = nodeById.get(w);
        const wl = lineById.get(w);
        if (wn && wn.kind === 'switch' && !wn.closed) return;
        energized.add(w);
        if (wl) {
          const p = posOf(v, wl);
          wl.rev = Math.hypot(p[0] - wl.x2, p[1] - wl.y2) < Math.hypot(p[0] - wl.x1, p[1] - wl.y1);
        }
        queue.push(w);
      });
    }
    nodes.forEach(n => (n.energized = energized.has(n.id)));
    elec.forEach(l => (l.live = energized.has(l.id)));
    junctions.forEach(j => { j.live = elec.some(l => l.live && distToSeg(j.x, j.y, l) <= TOL); });

    // ── Kablo uçlarını sembol merkezine hizala (sembol zemini hattı örter, boşluk kalmaz) ──
    elec.forEach(l => {
      const vertical = Math.abs(l.x2 - l.x1) < 1;
      const horizontal = Math.abs(l.y2 - l.y1) < 1;
      const snap = which => {
        const px = which === 1 ? l.x1 : l.x2;
        const py = which === 1 ? l.y1 : l.y2;
        const n = nodes.find(nn => Math.hypot(px - nn.cx, py - nn.cy) <= nn.hr);
        if (!n) return;
        if (vertical && Math.abs(px - n.cx) <= n.r) { if (which === 1) l.y1 = n.cy; else l.y2 = n.cy; }
        else if (horizontal && Math.abs(py - n.cy) <= n.r) { if (which === 1) l.x1 = n.cx; else l.x2 = n.cx; }
      };
      snap(1);
      snap(2);
      l.len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      l.bus = horizontal && l.len >= 4 * CELL;
    });
    lines.forEach(l => (l.d = 'M' + l.x1 + ' ' + l.y1 + 'L' + l.x2 + ' ' + l.y2));

    // Canlı değerler (etiket yerleşimi metin genişliğine bakar)
    nodes.forEach(n => (n.values = valuesOf(n, 0)));
    placeLabels(nodes, elec);

    // ── Sınır kutusu ──
    const xs = [], ys = [];
    nodes.forEach(n => {
      xs.push(n.cx - n.r - 20, n.cx + n.r + 20);
      ys.push(n.cy - n.r - 20, n.cy + n.r + 20);
      const lw = Math.max(n.label.length * 7.4, ...n.values.map(v => (v.k.length + v.v.length + 1) * 6.6));
      xs.push(n.anchor === 'start' ? n.lx + lw : n.anchor === 'end' ? n.lx - lw : n.lx + lw / 2);
    });
    lines.forEach(l => { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); });
    labels.forEach(t => { xs.push(t.x, t.x + t.text.length * t.size * 0.62); ys.push(t.y - t.size, t.y + t.size); });
    const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 800;
    const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 600;
    const pad = 48;

    return {
      nodes, lines, labels, junctions,
      bbox: { x: minX - pad, y: minY - pad, w: Math.max(200, maxX - minX + pad * 2), h: Math.max(160, maxY - minY + pad * 2) },
      nominal,
      liveLines: elec.filter(l => l.live).length,
      elecLines: elec.length,
      breakers: breakers.length,
      closedBreakers: breakers.filter(n => n.closed).length,
      alarms: nodes.filter(n => !!n.sev).length
    };
  }

  /** Etiket yerleşimi: kaynaklar sağda; şalterlerde çakışmayan ilk aday (sağ, sol, üst, alt). */
  function placeLabels(nodes, lines) {
    const boxes = [];
    const hits = b =>
      boxes.some(o => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) ||
      lines.some(l => segHitsBox(l, b));
    nodes.forEach(n => boxes.push({ x: n.cx - n.r, y: n.cy - n.r, w: n.r * 2, h: n.r * 2 }));
    const textW = n => Math.max(16, n.label.length * 7.4, ...n.values.slice(0, 2).map(v => (v.k.length + v.v.length + 1) * 6.4));
    const textH = n => 14 + (n.kind === 'switch' ? 12 : 0) + Math.min(2, n.values.length) * 12;
    const place = (n, g, extra) => {
      const w = textW(n), h = textH(n);
      const cands = [
        { lx: n.cx + g, ly: n.cy - h / 2 + 11, anchor: 'start', box: { x: n.cx + g, y: n.cy - h / 2, w, h } },
        { lx: n.cx - g, ly: n.cy - h / 2 + 11, anchor: 'end', box: { x: n.cx - g - w, y: n.cy - h / 2, w, h } },
        { lx: n.cx, ly: n.cy - g - h + 11, anchor: 'middle', box: { x: n.cx - w / 2, y: n.cy - g - h, w, h } }
      ];
      if (extra) {
        cands.push(
          { lx: n.cx, ly: n.cy + g + 11, anchor: 'middle', box: { x: n.cx - w / 2, y: n.cy + g, w, h } },
          { lx: n.cx + g + 6, ly: n.cy - g - h + 11, anchor: 'start', box: { x: n.cx + g + 6, y: n.cy - g - h, w, h } }
        );
      }
      const pick = cands.find(c => !hits(c.box)) || cands[0];
      n.lx = pick.lx; n.ly = pick.ly; n.anchor = pick.anchor;
      boxes.push(pick.box);
    };
    nodes.filter(n => n.kind !== 'switch' && n.kind !== 'fixed').forEach(n => place(n, n.r + 10, false));
    nodes.filter(n => n.kind === 'switch' || n.kind === 'fixed').forEach(n => place(n, n.r + 8, true));
  }

  function segHitsBox(l, b) {
    const minX = Math.min(l.x1, l.x2), maxX = Math.max(l.x1, l.x2);
    const minY = Math.min(l.y1, l.y2), maxY = Math.max(l.y1, l.y2);
    if (maxX < b.x - 2 || minX > b.x + b.w + 2 || maxY < b.y - 2 || minY > b.y + b.h + 2) return false;
    const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    const steps = Math.max(2, Math.ceil(len / 6));
    for (let i = 0; i <= steps; i++) {
      const x = l.x1 + ((l.x2 - l.x1) * i) / steps;
      const y = l.y1 + ((l.y2 - l.y1) * i) / steps;
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2) return true;
    }
    return false;
  }

  /** Alarm işareti hedefi: devId tam eşleşme (büyük/küçük harf, _DV eki yok sayılır); yoksa en uzun önek. */
  function findFocusTarget(m, devId) {
    const want = normId(devId);
    if (!want) return null;
    const cands = m.nodes.map(n => ({ id: n.id, cx: n.cx, cy: n.cy, r: Math.max(n.r, 10), key: normId(n.src.devId) || normId(n.label) }))
      .concat(m.lines.filter(l => l.kind !== 'border').map(l => ({ id: l.id, cx: (l.x1 + l.x2) / 2, cy: (l.y1 + l.y2) / 2, r: 10, key: normId(l.devId) })));
    const exact = cands.find(c => c.key && c.key === want);
    if (exact) return exact;
    let best = null;
    cands.forEach(c => {
      if (c.key.length < 3 || !want.startsWith(c.key) || /[a-z0-9]/.test(want.charAt(c.key.length))) return;
      if (!best || c.key.length > best.key.length) best = c;
    });
    return best;
  }

  // ---------------------------------------------------------------------------
  // Sunum canlı değerleri (tohumlu; enerjisiz öğede 0)
  // ---------------------------------------------------------------------------
  const f1 = n => n.toFixed(1), f0 = n => n.toFixed(0);
  // 'IDC1_A_GEN4_Q5_DV' / 'GEN-4' → 4; jeneratör değilse 0
  const genNo = s => { const m = /GEN-?(\d)/i.exec(String(s || '')); return m ? +m[1] : 0; };
  function valuesOf(n, tick) {
    const key = n.src.devId || n.id;
    const base = rngOf('sl-base-' + key);
    const jit = rngOf('sl-live-' + key + '-' + tick);
    const j = (a) => 1 + (jit() * 2 - 1) * a;
    const on = n.energized;
    if (n.kind === 'switch') {
      // Haberleşme kaybı: ölçüm yok (son değer gösterilmez)
      if (n.src.stale) return ['P', 'U', 'I', 'f', 'cosφ'].map(k => ({ k, v: '—' }));
      // Jeneratör kesicileri js/mock/pms.data.js ile aynı senaryo: A kolu (GEN4–6) haftalık yüksüz test ≈2 kW, B kolu (GEN1–3) beklemede 0
      const gen = genNo(key);
      const pBase = gen ? (gen >= 4 ? 1.9 + base() * 0.5 : 0) : n.src.overload ? 520 + base() * 25 : 25 + base() * 380;
      const p = on && n.closed ? pBase * j(gen ? 0.06 : 0.035) : 0;
      const u = on ? (398.5 + base() * 4) * j(0.002) : 0;
      const pf = gen ? 0.33 : 0.93 + base() * 0.05;
      const i = u ? (p * 1000) / (Math.sqrt(3) * u * pf) : 0;
      const f = on ? 50 + (jit() - 0.5) * 0.06 : 0;
      return [{ k: 'P', v: f1(p) + ' kW' }, { k: 'U', v: f1(u) + ' V' }, { k: 'I', v: f0(i) + ' A' }, { k: 'f', v: f1(f) + ' Hz' }, { k: 'cosφ', v: on && p ? pf.toFixed(2) : '—' }];
    }
    if (n.kind === 'transformer') {
      const load = on ? (38 + base() * 30) * j(0.02) : 0;
      const kva = 1600;
      const u = on ? (399 + base() * 3) * j(0.002) : 0;
      const p = (kva * load) / 100 * 0.95;
      const hot = /UYARI|ALARM|ACİL/.test(trUpper(n.statusText));
      return [{ k: 'P', v: f0(p) + ' kW' }, { k: 'U', v: f1(u) + ' V' }, { k: 'Yük', v: '%' + f0(load) }, { k: 'Sargı', v: f0(hot ? 96 + jit() * 2 : 58 + base() * 14) + ' °C' }, { k: 'Güç', v: kva + ' kVA' }];
    }
    if (n.kind === 'generator') {
      const fuel = 78 + base() * 20;
      const test = (genNo(n.label) || genNo(key)) >= 4; // A kolu haftalık yüksüz test
      return [{ k: 'Mod', v: test ? 'TEST' : 'OTOMATİK' }, { k: 'Yakıt', v: '%' + f0(fuel) }, { k: 'Akü', v: f1((26.6 + base() * 1.2) * j(0.003)) + ' V' }, { k: 'Motor', v: f0(test ? 74 + base() * 8 : 41 + base() * 6) + ' °C' }, { k: 'Çalışma', v: test ? 'Yüksüz test' : 'Bekleme' }];
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // SVG şablonu
  // ---------------------------------------------------------------------------
  const sinePath = r => {
    const w = r * 0.9, a = r * 0.13, x0 = -w / 2, y = r * 0.42;
    return 'M' + x0 + ' ' + y + ' q' + w / 4 + ' ' + -a * 2 + ' ' + w / 2 + ' 0 t' + w / 2 + ' 0';
  };

  function symbolSvg(n) {
    switch (n.kind) {
      case 'generator':
        return '<circle class="sl-hit" r="' + (n.r + 6) + '" /><circle class="sl-sym" r="' + n.r + '" />' +
          '<text class="sl-sym-glyph" y="-1" font-size="' + n.r * 0.72 + '" text-anchor="middle" dominant-baseline="central">G</text>' +
          '<path class="sl-sym-thin" d="' + sinePath(n.r) + '" />';
      case 'transformer': {
        const o = n.w * 0.62;
        return '<circle class="sl-hit" r="' + (n.r + 6) + '" />' +
          '<circle class="sl-sym-mask" cy="' + -o + '" r="' + n.w + '" /><circle class="sl-sym-mask" cy="' + o + '" r="' + n.w + '" />' +
          '<circle class="sl-sym-open" cy="' + -o + '" r="' + n.w + '" /><circle class="sl-sym-open" cy="' + o + '" r="' + n.w + '" />';
      }
      case 'switch':
        return '<rect class="sl-hit" x="-17" y="-17" width="34" height="34" />' + (n.closed
          ? '<rect class="sl-brk-closed" x="-11" y="-11" width="22" height="22" rx="1.5" />'
          : '<rect class="sl-brk-open" x="-11" y="-11" width="22" height="22" rx="1.5" /><path class="sl-brk-blade" d="M0 11L-8 -7" /><path class="sl-brk-contact" d="M0 -11v4" />');
      case 'fixed':
        return '<circle class="sl-hit" r="12" /><path class="sl-fixed-mark" d="M-6 -3l6 -5l6 5M-6 3l6 5l6 -5" />';
      default:
        return '<circle class="sl-hit" r="' + (n.r + 6) + '" /><circle class="sl-sym" r="' + n.r + '" />';
    }
  }

  function tagInner(n) {
    let s = '<tspan class="sl-tag-name">' + esc(n.label) + '</tspan>';
    if (n.kind === 'switch') s += '<tspan class="sl-tag-state" x="' + n.lx + '" dy="12">' + (n.closed ? 'KAPALI' : 'AÇIK') + '</tspan>';
    n.values.slice(0, 2).forEach(v => {
      s += '<tspan class="sl-tag-val" x="' + n.lx + '" dy="12">' + esc(v.k) + ' <tspan class="sl-tag-num">' + esc(v.v) + '</tspan></tspan>';
    });
    return s;
  }

  function svgContent(m, uid) {
    const out = [];
    out.push('<defs>' +
      '<pattern id="' + uid + '-g1" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" class="sl-grid-minor" fill="none" /></pattern>' +
      '<pattern id="' + uid + '-g5" width="200" height="200" patternUnits="userSpaceOnUse"><rect width="200" height="200" fill="url(#' + uid + '-g1)" /><path d="M200 0H0V200" class="sl-grid-major" fill="none" /></pattern>' +
      '</defs>');
    const b = m.bbox;
    out.push('<rect class="sl-gridbg" x="' + (b.x - b.w * 2) + '" y="' + (b.y - b.h * 2) + '" width="' + b.w * 5 + '" height="' + b.h * 5 + '" fill="url(#' + uid + '-g5)" />');

    const elec = m.lines.filter(l => l.kind !== 'border');
    out.push('<g class="sl-borders">' + m.lines.filter(l => l.kind === 'border').map(l => '<path d="' + l.d + '" class="sl-border" />').join('') + '</g>');
    out.push('<g class="sl-halo">' + elec.filter(l => l.live).map(l => '<path d="' + l.d + '"' + (l.bus ? ' class="sl-bus"' : '') + ' />').join('') + '</g>');
    out.push('<g class="sl-conductors">' + elec.map(l => '<path d="' + l.d + '" class="sl-cond' + (l.live ? ' sl-live' : '') + (l.bus ? ' sl-bus' : '') + (l.kind === 'tie' ? ' sl-tie' : '') + '" />').join('') + '</g>');
    out.push('<g class="sl-flow">' + elec.filter(l => l.live && l.len > 24).map(l => '<path d="' + l.d + '"' + (l.rev ? ' class="sl-rev"' : '') + ' />').join('') + '</g>');
    out.push('<g class="sl-junctions">' + m.junctions.map(j => '<circle cx="' + j.x + '" cy="' + j.y + '" r="4.5"' + (j.live ? ' class="sl-live"' : '') + ' />').join('') + '</g>');
    out.push('<g class="sl-zone-labels">' + m.labels.map(t => '<text x="' + t.x + '" y="' + t.y + '" font-size="' + t.size + '" dominant-baseline="hanging">' + esc(t.text) + '</text>').join('') + '</g>');

    out.push('<g class="sl-nodes">');
    m.nodes.forEach((n, i) => {
      out.push('<g class="sl-node' + (n.energized ? ' sl-energized' : '') + '" data-n="' + i + '">');
      if (n.sev) out.push('<circle class="sl-sev-ring' + (n.sev === 'acil' || n.sev === 'alarm' ? ' sl-pulse' : '') + '" cx="' + n.cx + '" cy="' + n.cy + '" r="' + (n.r + 8) + '" stroke="' + n.sevColor + '" />');
      out.push('<g transform="' + n.transform + '">' + symbolSvg(n) + '</g>');
      if (n.sev) {
        out.push('<g class="sl-sev-badge" transform="translate(' + (n.cx + n.r * 0.72 + 6) + ' ' + (n.cy - n.r * 0.72 - 6) + ')"><circle r="7" fill="' + n.sevColor + '" /><text text-anchor="middle" dominant-baseline="central" y="0.5">!</text></g>');
      }
      out.push('<text class="sl-tag" data-tag="' + i + '" x="' + n.lx + '" y="' + n.ly + '" text-anchor="' + n.anchor + '">' + tagInner(n) + '</text>');
      out.push('</g>');
    });
    out.push('</g>');
    out.push('<g data-focus-layer></g>');
    return out.join('');
  }

  function focusSvg(f) {
    let s = '<g class="sl-focus-mark" style="--fm:' + f.color + '" role="img" aria-label="' + esc('Alarm kaynağı' + (f.label ? ': ' + f.label : '')) + '">' +
      '<circle class="sl-fm-wave" cx="' + f.cx + '" cy="' + f.cy + '" r="' + (f.r + 10) + '" />' +
      '<circle class="sl-fm-wave sl-fm-wave2" cx="' + f.cx + '" cy="' + f.cy + '" r="' + (f.r + 10) + '" />' +
      '<circle class="sl-fm-ring" cx="' + f.cx + '" cy="' + f.cy + '" r="' + (f.r + 10) + '" />' +
      '<g transform="translate(' + f.cx + ' ' + (f.cy - f.r - 12) + ')">' +
      '<path class="sl-fm-pin" d="M0 0C-3 -6 -11 -12 -11 -21A11 11 0 1 1 11 -21C11 -12 3 -6 0 0Z" />' +
      '<text class="sl-fm-bang" y="-21" text-anchor="middle" dominant-baseline="central">!</text>';
    if (f.boxH) {
      s += '<g transform="translate(' + -f.boxW / 2 + ' ' + f.boxY + ')">' +
        '<rect class="sl-fm-box" width="' + f.boxW + '" height="' + f.boxH + '" rx="3" />' +
        '<rect class="sl-fm-box-bar" width="3" height="' + f.boxH + '" />' +
        (f.label ? '<text class="sl-fm-label" x="10" y="15">' + esc(f.label) + '</text>' : '') +
        (f.time ? '<text class="sl-fm-time" x="10" y="' + (f.label ? 29 : 15) + '">' + esc(f.time) + '</text>' : '') +
        '</g>';
    }
    return s + '</g></g>';
  }

  const LEGEND =
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><circle class="sl-sym" r="11" /><text class="sl-sym-glyph" font-size="9" text-anchor="middle" dominant-baseline="central">G</text></svg>Jeneratör</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><circle class="sl-sym-open" cy="-4.5" r="7" /><circle class="sl-sym-open" cy="4.5" r="7" /></svg>Trafo</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><path class="sl-cond" d="M0 -14V14" /><rect class="sl-brk-closed" x="-7" y="-7" width="14" height="14" rx="1" /></svg>Kesici kapalı</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><path class="sl-cond" d="M0 -14V14" /><rect class="sl-brk-open" x="-7" y="-7" width="14" height="14" rx="1" /><path class="sl-brk-blade" d="M0 7L-5 -4" /></svg>Kesici açık</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><path class="sl-cond" d="M0 -14V14" /><path class="sl-fixed-mark" d="M-6 -3l6 -5l6 5M-6 3l6 5l6 -5" /></svg>Sabit bağlantı</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><path class="sl-cond sl-live" d="M-14 0H14" /></svg>Enerjili hat</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><path class="sl-cond" d="M-14 0H14" /></svg>Enerjisiz hat</div>' +
    '<div class="sl-lg"><svg viewBox="-14 -14 28 28"><circle class="sl-sym" r="6" /><circle class="sl-sev-ring" r="10" stroke="' + SEV_COLOR.alarm + '" /></svg>Alarm (önem rengi)</div>';

  // app-schematic-toolbar (energy.js renderToolbar ile aynı biçim; arama kutusu tek hatta yok)
  const BTN = 'px-2.5 py-1 text-xs font-bold rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer';
  const TILE = 'flex items-center gap-2 px-2 py-1 border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-[#0b121e] rounded-[2px]';
  const SEL_BTN = 'px-2 py-1 text-[11px] font-semibold rounded-[2px] border border-slate-300 dark:border-border-muted bg-white dark:bg-surface-panel text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-surface-hover flex items-center gap-1.5 cursor-pointer';

  function toolbarHtml(title, alarms) {
    const site = D.site || { outdoor: [{ val: 18.4, unit: '°C' }], pue: 1.42, cue: 0.38 };
    const out = (site.outdoor || [])[0] || { val: '--', unit: '°C' };
    const nA = alarms.filter(a => a.sev === 'acil' || a.sev === 'alarm').length;
    const nW = alarms.filter(a => a.sev === 'uyari' || a.sev === 'kayip').length;
    return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">' +
      '<div class="flex flex-wrap items-center gap-2.5">' +
        '<div class="flex items-center gap-1.5 mr-1"><i class="pi pi-map text-sky-600 dark:text-sky-400 font-bold text-sm"></i>' +
          '<span class="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-tight">' + esc(title) + '</span></div>' +
        '<button type="button" data-sl-refresh title="Yenile" class="' + BTN + '"><i class="pi pi-refresh text-xs"></i><span class="hidden sm:inline">Yenile</span></button>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2 text-xs">' +
        (nA || nW ? '<div class="flex items-center gap-1 mr-1">' +
          (nA ? '<span class="px-2 py-0.5 rounded-[2px] bg-rose-600 text-white font-mono font-bold text-[11px] flex items-center gap-1 shadow-xs" title="Aktif Alarmlar"><i class="pi pi-exclamation-circle text-[10px]"></i><span>' + nA + '</span></span>' : '') +
          (nW ? '<span class="px-2 py-0.5 rounded-[2px] bg-amber-500 text-white font-mono font-bold text-[11px] flex items-center gap-1 shadow-xs" title="Aktif Uyarılar"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>' + nW + '</span></span>' : '') +
        '</div>' : '') +
        '<div class="relative group ' + TILE + '"><i class="pi pi-sun text-amber-500 font-bold text-xs"></i>' +
          '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block leading-none">Dış Ortam</span>' +
          '<span class="font-mono font-black text-slate-900 dark:text-slate-100 text-xs" data-sl-out>' + esc(out.val) + ' ' + esc(out.unit) + '</span></div>' +
          '<div class="absolute top-full right-0 mt-1 hidden group-hover:block bg-slate-900 text-slate-100 text-xs p-2 rounded-[2px] shadow-xl border border-slate-700 z-50 min-w-48">' +
            '<table class="w-full text-left text-[11px]"><thead><tr class="border-b border-slate-700 text-slate-400"><th class="py-1">Parametre</th><th class="py-1 text-right">Değer</th></tr></thead><tbody>' +
            (site.outdoor || []).map(o => '<tr class="border-b border-slate-800"><td class="py-1">' + esc(o.desc) + '</td><td class="py-1 text-right font-bold">' + esc(o.val) + (o.unit ? ' ' + esc(o.unit) : '') + '</td></tr>').join('') +
            '</tbody></table></div>' +
        '</div>' +
        '<div class="' + TILE + '"><div class="relative w-7 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-7 h-4">' +
          '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 24 6" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" />' +
          '<path d="M 24 6 A 16 16 0 0 1 36 20" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="13" y2="9" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#10b981" /></svg></div>' +
          '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık PUE</span><span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs" data-sl-pue>' + num(site.pue, 1.42).toFixed(2) + '</span></div>' +
        '</div>' +
        '<div class="' + TILE + '"><div class="relative w-7 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-7 h-4">' +
          '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="#0284c7" stroke-width="4" stroke-linecap="round" />' +
          '<path d="M 20 4 A 16 16 0 0 1 36 20" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="11" y2="11" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#0284c7" /></svg></div>' +
          '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık CUE</span><span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs" data-sl-cue>' + num(site.cue, 0.38).toFixed(2) + '</span></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Alarm → şema çözümü (energy-general-view.locateSource + pms-shared.sourceMatches)
  // ---------------------------------------------------------------------------
  const sourceMatches = (src, dev) => !!src && !!dev && (src === dev || src.startsWith(dev));

  function resolve(ridOrDevId) {
    const src = String(ridOrDevId == null ? '' : ridOrDevId).trim();
    if (!src) return null;
    let best = null;
    const scan = match => (SRC.schemas || []).forEach(s => {
      devIdsOf(s).forEach(d => {
        if (!match(d)) return;
        if (!best || d.length > best.devId.length) best = { schemaId: s.id, devId: d };
      });
    });
    scan(d => sourceMatches(src, d));
    if (!best) {
      // Yedek: büyük/küçük harf ve _DV eki duyarsız, sözcük sınırında önek (single-line findFocusTarget kuralı)
      const want = normId(src);
      scan(d => { const k = normId(d); return k.length >= 3 && want.startsWith(k) && !/[a-z0-9]/.test(want.charAt(k.length)); });
    }
    return best;
  }

  /** Şemaya düşen sunum alarmları (önem: iç ad 'kayip'). */
  function alarmsFor(schemaId) {
    return (SRC.demoAlarms || []).filter(a => a.schemaId === schemaId).map(a => Object.assign({}, a, { sev: normSev(a.severity) }));
  }

  const pad2 = n => String(n).padStart(2, '0');
  const fmtTime = d => pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  const T0 = Date.now();

  let uidSeq = 0;

  // ---------------------------------------------------------------------------
  // mount
  // ---------------------------------------------------------------------------
  function mount(el, opts) {
    const o = opts || {};
    const focusIn = o.focus || null;
    let schemaId = o.schemaId || o.schema || '';
    if (!schemaById.has(schemaId) && focusIn) {
      const r = resolve(focusIn.devId || focusIn.rid);
      if (r) schemaId = r.schemaId;
    }
    if (!schemaById.has(schemaId)) schemaId = (SRC.schemas[0] || {}).id;
    const schema = schemaById.get(schemaId);
    const uid = 'sl' + ++uidSeq;
    const sc = (SRC.scenario && SRC.scenario[schemaId]) || {};
    const openSet = new Set((sc.open || []).map(normId));
    const m = schema ? buildModel(itemsOf(schema), openSet) : { nodes: [], lines: [], labels: [], junctions: [], bbox: { x: 0, y: 0, w: 800, h: 600 }, nominal: false, liveLines: 0, elecLines: 0, breakers: 0, closedBreakers: 0, alarms: 0 };
    const title = schema ? schema.title : 'Tek hat şeması';
    const schemaAlarms = alarmsFor(schemaId);

    const timers = [];
    const cleanup = [];
    let destroyed = false;
    let tick = 0;
    let classic = false;
    let animId = 0;
    let dimmed = false;
    let focus = null;          // { devId, severity, label, time }
    let focusMark = null;      // hedef + kutu ölçüleri
    let focusMissing = false;
    let hover = null;          // { n, left, top }
    let selected = null;       // NodeVM
    let showSelAlarms = false;
    let userTouched = false;
    let dragging = false, dragMoved = false;

    el.innerHTML =
      '<div class="pms-sl-host flex-1 min-h-0 flex flex-col">' +
        '<div class="shrink-0 pms-sl-toolbar" data-sl-toolbar>' + toolbarHtml(title, schemaAlarms) + '</div>' +
        '<div class="pms-sl flex-1 min-h-0">' +
          '<div class="sl-root" data-sl-root>' +
            '<svg class="sl-svg" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(title) + '" data-sl-svg>' + svgContent(m, uid) + '</svg>' +
            '<div class="sl-hud sl-hud-tl">' +
              '<div class="sl-hud-title">' + esc(title) + '</div>' +
              '<div class="sl-hud-stats"><span><b>' + m.liveLines + '</b>/' + m.elecLines + ' hat enerjili</span>' +
                (m.breakers ? '<span><b>' + m.closedBreakers + '</b>/' + m.breakers + ' kesici kapalı</span>' : '') +
                (m.alarms ? '<span><b style="color:' + SEV_COLOR.alarm + '">' + m.alarms + '</b> alarmlı öğe</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="sl-hud sl-hud-tr sl-hud-notes" data-sl-notes></div>' +
            (!m.nodes.length && !m.lines.length ? '<div class="sl-empty">Tek hat şeması verisi yok</div>' : '') +
            '<div class="sl-hud sl-hud-br sl-controls" data-sl-controls></div>' +
            '<div class="sl-hud sl-hud-bl sl-legend">' + LEGEND + '</div>' +
            '<div class="sl-card" data-sl-card hidden></div>' +
            '<div class="sl-classic-toggle">' +
              '<button type="button" data-sl-classic class="px-2 py-1 text-[10px] font-semibold rounded-[2px] border border-slate-300 dark:border-border-muted bg-white/90 dark:bg-surface-card/90 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-surface-hover cursor-pointer flex items-center gap-1" title="Klasik şema görünümüne geç"></button>' +
            '</div>' +
            '<div data-sl-sel></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const q = sel => el.querySelector(sel);
    const root = q('[data-sl-root]');
    const svg = q('[data-sl-svg]');
    const focusLayer = svg.querySelector('[data-focus-layer]');
    const notesEl = q('[data-sl-notes]');
    const controlsEl = q('[data-sl-controls]');
    const cardEl = q('[data-sl-card]');
    const selEl = q('[data-sl-sel]');
    const classicBtn = q('[data-sl-classic]');
    const nodeEls = Array.from(svg.querySelectorAll('.sl-node'));
    const tagEls = Array.from(svg.querySelectorAll('[data-tag]'));

    let vb = Object.assign({}, m.bbox);
    const inVb = schema && schema.viewBox && schema.viewBox.length === 4 && schema.viewBox[2] > 0 ? { x: schema.viewBox[0], y: schema.viewBox[1], w: schema.viewBox[2], h: schema.viewBox[3] } : null;

    // ── Görünüm ──
    function applyViewBox() {
      const { x, y, w, h } = vb;
      if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
    }
    function cancelAnim() { if (animId) { cancelAnimationFrame(animId); animId = 0; } }
    function resetView() { cancelAnim(); vb = inVb ? Object.assign({}, inVb) : Object.assign({}, m.bbox); applyViewBox(); }
    function fit() { cancelAnim(); userTouched = true; vb = Object.assign({}, m.bbox); applyViewBox(); }
    function zoomAt(px, py, f) {
      if (!Number.isFinite(f) || f <= 0 || !(vb.w > 0) || !(vb.h > 0)) return;
      cancelAnim();
      const span = Math.max(m.bbox.w, inVb ? inVb.w : 0, 200);
      const minW = Math.max(60, span / 40), maxW = span * 5;
      let nw = vb.w * f;
      // Sınır yalnız değişim yönünde uygulanır (sınır dışındaki görünümde ters yöne sıçrama olmaz)
      if (f < 1) nw = Math.max(nw, Math.min(minW, vb.w));
      else nw = Math.min(nw, Math.max(maxW, vb.w));
      const k = nw / vb.w;
      if (Math.abs(k - 1) < 1e-6) return;
      userTouched = true;
      vb = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w: vb.w * k, h: vb.h * k };
      applyViewBox();
    }
    const zoomBy = f => zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, f);
    function toUser(inv, cx, cy) {
      if (!inv) return { x: cx, y: cy };
      const p = new DOMPoint(cx, cy).matrixTransform(inv);
      return { x: p.x, y: p.y };
    }
    function animateTo(to) {
      cancelAnim();
      const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { vb = to; applyViewBox(); return; }
      const from = Object.assign({}, vb);
      const t0 = performance.now();
      const ease = k => 1 - Math.pow(1 - k, 3);
      const step = now => {
        if (destroyed) return;
        const k = Math.min(1, (now - t0) / 600);
        const e = ease(k);
        vb = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e };
        applyViewBox();
        animId = k < 1 ? requestAnimationFrame(step) : 0;
      };
      animId = requestAnimationFrame(step);
    }
    /** Öğeye yumuşak yaklaşma (~600 ms; hareket azaltmada anında). Orijinalde en az 360 birim genişlik;
     *  geniş sunum ekranında bu ~5 kat büyütme olduğundan çevre bağlamı kalsın diye ~1.3 kat (ekran genişliğinin %75i). */
    function zoomToTarget(t) {
      const cw = svg.clientWidth || 800, chh = svg.clientHeight || 600;
      const w = Math.min(Math.max(360, cw * 0.75, t.r * 16), Math.max(m.bbox.w, 360));
      const h = w * (chh / cw);
      userTouched = true;
      animateTo({ x: t.cx - w / 2, y: t.cy - h / 2 - h * 0.08, w, h });
    }

    // ── HUD ──
    function renderNotes() {
      notesEl.innerHTML =
        (focusMissing ? '<div class="sl-note sl-warn" role="status">Alarmın kaynağı bu şemada işaretlenemedi</div>' : '') +
        (m.nominal ? '<div class="sl-note">Şalter konumları: varsayılan işletme (canlı konum bağlanmadı)</div>' : '');
      notesEl.hidden = !notesEl.innerHTML;
    }
    function renderControls() {
      controlsEl.innerHTML =
        '<button type="button" data-z="in" title="Yakınlaştır" aria-label="Yakınlaştır">+</button>' +
        '<button type="button" data-z="out" title="Uzaklaştır" aria-label="Uzaklaştır">&minus;</button>' +
        (focus ? '<button type="button" class="sl-fit" data-z="clear" title="Alarm işaretini kaldır">İşareti kaldır</button>' : '') +
        '<button type="button" class="sl-fit" data-z="fit" title="Şemayı sığdır">Sığdır</button>';
    }
    function renderClassicBtn() {
      classicBtn.innerHTML = '<i class="pi ' + (classic ? 'pi-share-alt' : 'pi-history') + '"></i> ' + (classic ? 'Tek hat görünümü' : 'Klasik görünüm');
      classicBtn.title = classic ? 'Yeni tek hat görünümüne geç' : 'Klasik şema görünümüne geç';
      root.classList.toggle('sl-classic', classic);
    }
    function applyDim() { svg.classList.toggle('sl-dimmed', dimmed && !!focusMark); }

    // ── Alarm işareti ──
    function updateFocus(zoom) {
      focusLayer.innerHTML = '';
      nodeEls.forEach(g => g.classList.remove('sl-is-focus'));
      focusMark = null;
      focusMissing = false;
      if (focus) {
        const t = findFocusTarget(m, focus.devId);
        if (!t) focusMissing = m.nodes.length + m.lines.length > 0;
        else {
          const raw = String(focus.label || '').replace(/\s+/g, ' ').trim();
          const label = raw.length > 44 ? raw.slice(0, 43) + '…' : raw;
          const time = String(focus.time || '').trim();
          const boxH = label && time ? 36 : label || time ? 22 : 0;
          focusMark = Object.assign({}, t, {
            color: SEV_COLOR[focus.severity] || SEV_COLOR.alarm, label, time,
            boxW: Math.max(label.length * 6.3, time.length * 5.9, 60) + 18, boxH, boxY: -38 - boxH
          });
          focusLayer.innerHTML = focusSvg(focusMark);
          const idx = m.nodes.findIndex(n => n.id === t.id);
          if (idx >= 0) nodeEls[idx].classList.add('sl-is-focus');
          if (zoom) zoomToTarget(t);
        }
      }
      applyDim();
      renderNotes();
      renderControls();
    }

    function setFocus(f) {
      if (destroyed) return;
      const dev = f ? String(f.devId || f.rid || '') : '';
      if (!dev) { focus = null; dimmed = false; updateFocus(false); renderSel(); return; }
      const tmin = (SRC.demoAlarms || []).find(a => a.rid === f.rid || (!f.rid && a.devId === f.devId));
      focus = {
        devId: dev,
        severity: f.severity ? normSev(f.severity) : 'alarm',
        label: String(f.text || f.label || ''),
        time: f.time ? String(f.time) : tmin && tmin.minutesAgo != null ? fmtTime(new Date(T0 - tmin.minutesAgo * 60000)) : ''
      };
      dimmed = true;
      updateFocus(true);
      renderSel();
    }
    function clearFocus() {
      dimmed = false;
      focus = null;
      updateFocus(false);
      renderSel();
      if (typeof o.onFocusClear === 'function') o.onFocusClear();
    }

    // ── Hover kartı ──
    const stateText = n => n.kind === 'switch' ? (n.closed ? 'KAPALI' : 'AÇIK') : n.kind === 'fixed' ? 'SABİT' : (n.statusText || (n.energized ? 'ENERJİLİ' : 'ENERJİSİZ'));
    function renderCard() {
      if (!hover) { cardEl.hidden = true; return; }
      const n = hover.n;
      cardEl.hidden = false;
      cardEl.style.left = hover.left + 'px';
      cardEl.style.top = hover.top + 'px';
      cardEl.innerHTML =
        '<div class="sl-card-head"><span class="sl-card-name">' + esc(n.label) + '</span><span class="sl-card-kind">' + esc(KIND_NAME[n.kind]) + '</span></div>' +
        (n.src.devId ? '<div class="sl-card-dev">' + esc(n.src.devId) + '</div>' : '') +
        '<div class="sl-card-row"><span>Durum</span><b>' + esc(stateText(n)) + '</b></div>' +
        '<div class="sl-card-row"><span>Enerji</span><b>' + (n.energized ? 'Var' : 'Yok') + '</b></div>' +
        (n.sev ? '<div class="sl-card-row"><span>Önem</span><b style="color:' + n.sevColor + '">' + esc(SEV_LABEL[n.sev] || '') + '</b></div>' : '') +
        (n.values.length ? '<div class="sl-card-sep"></div>' + n.values.map(v => '<div class="sl-card-row sl-mono"><span>' + esc(v.k) + '</span><b>' + esc(v.v) + '</b></div>').join('') : '');
    }

    // ── Seçim kartı (energy-general-view .sel-card) ──
    function selAlarms() {
      if (!selected || !selected.src.devId) return [];
      const dev = selected.src.devId;
      return schemaAlarms.filter(a => a.devId === dev || sourceMatches(a.rid, dev));
    }
    function renderSel() {
      if (!selected) { selEl.innerHTML = ''; return; }
      const n = selected;
      const dev = n.src.devId || '';
      const al = selAlarms();
      if (!al.length) showSelAlarms = false;
      selEl.innerHTML =
        '<div role="dialog" aria-label="Seçili öğe" class="sl-sel-card absolute left-2 bottom-2 z-20 w-72 flex flex-col rounded-[2px] border border-slate-200 dark:border-border-muted bg-white dark:bg-surface-card text-slate-800 dark:text-slate-100 shadow-lg">' +
          '<div class="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-200 dark:border-border-subtle">' +
            '<i class="pi pi-bolt text-[11px] text-sky-600 dark:text-sky-400"></i>' +
            '<span class="text-xs font-bold truncate flex-1" title="' + esc(n.label || dev) + '">' + esc(n.label || dev || '—') + '</span>' +
            '<button type="button" data-sel="close" title="Kapat" aria-label="Seçim kartını kapat" class="p-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] cursor-pointer"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 min-w-0">' +
            '<span class="text-slate-500 dark:text-slate-400">Cihaz</span>' +
            '<span class="font-mono truncate' + (dev ? '' : ' text-slate-400') + '" title="' + esc(dev) + '">' + esc(dev || '—') + '</span>' +
          '</div>' +
          '<div class="px-2.5 pb-2 flex items-center gap-1.5 flex-wrap">' +
            '<button type="button" data-sel="bms"' + (dev ? '' : ' disabled') + ' class="' + SEL_BTN + ' disabled:opacity-50 disabled:cursor-default"><i class="pi pi-map-marker text-[10px]"></i> Mekânsal konum (BMS)</button>' +
            (al.length ? '<button type="button" data-sel="alarms" aria-expanded="' + showSelAlarms + '" class="' + SEL_BTN + '"><i class="pi pi-bell text-[10px]"></i> Alarmlar (' + al.length + ') <i class="pi ' + (showSelAlarms ? 'pi-angle-up' : 'pi-angle-down') + ' text-[10px]"></i></button>' : '') +
            (focus ? '<button type="button" data-sel="unfocus" title="Tek hattaki alarm işaretini kaldır" class="' + SEL_BTN + '"><i class="pi pi-eye-slash text-[10px]"></i> İşareti kaldır</button>' : '') +
          '</div>' +
          (showSelAlarms ? '<div class="sl-sel-alarms min-h-0 overflow-auto border-t border-slate-200 dark:border-border-subtle">' +
            al.map((a, i) => '<div class="flex items-center gap-2 px-2.5 py-1 text-[11px]' + (i ? ' border-t border-slate-100 dark:border-border-subtle' : '') + '">' +
              '<span class="w-1 self-stretch rounded-[1px]" style="background:' + SEV_COLOR[a.sev] + '"></span>' +
              '<span class="truncate flex-1" title="' + esc(a.text) + '">' + esc(a.text || a.title || a.rid) + '</span>' +
              '<button type="button" data-sel="alarm-bms" data-i="' + i + '" title="Mekânsal konum (BMS)" aria-label="Mekânsal konum (BMS)" class="p-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer"><i class="pi pi-map-marker"></i></button>' +
            '</div>').join('') + '</div>' : '') +
        '</div>';
    }
    function locate(devId, alarm) {
      if (!devId) return;
      if (typeof o.onLocate === 'function') { o.onLocate(devId, alarm || null); return; }
      window.location.href = 'bms.html?dev=' + encodeURIComponent(alarm ? alarm.rid : devId) + (alarm ? '&alarm=' + encodeURIComponent(alarm.rid) : '') + '&from=pms';
    }

    // ── Canlı değerler ──
    function liveTick() {
      if (destroyed) return;
      tick++;
      m.nodes.forEach((n, i) => {
        if (!n.values.length) return;
        n.values = valuesOf(n, tick);
        if (tagEls[i]) tagEls[i].innerHTML = tagInner(n);
      });
      if (hover) renderCard();
      const site = D.site;
      if (site) {
        const jr = rngOf('sl-tb-' + tick);
        const pue = q('[data-sl-pue]'), cue = q('[data-sl-cue]');
        if (pue) pue.textContent = (num(site.pue, 1.42) + (jr() - 0.5) * 0.02).toFixed(2);
        if (cue) cue.textContent = (num(site.cue, 0.38) + (jr() - 0.5) * 0.01).toFixed(2);
      }
    }
    timers.push(setInterval(liveTick, LIVE_MS));

    // ── Olaylar ──
    const on = (target, type, fn, o2) => { target.addEventListener(type, fn, o2); cleanup.push(() => target.removeEventListener(type, fn, o2)); };

    let start = null, startVb = vb, inv = null, sx = 0, sy = 0, pid = -1;
    on(svg, 'wheel', e => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      const p = toUser(ctm ? ctm.inverse() : null, e.clientX, e.clientY);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(p.x, p.y, Math.exp(Math.max(-60, Math.min(60, dy)) * 0.0022));
    }, { passive: false });
    on(svg, 'dblclick', e => {
      e.preventDefault();
      const ctm = svg.getScreenCTM();
      const p = toUser(ctm ? ctm.inverse() : null, e.clientX, e.clientY);
      zoomAt(p.x, p.y, e.shiftKey ? 1.8 : 0.55);
    });
    on(svg, 'pointerdown', e => {
      if (e.button !== 0) return;
      cancelAnim();
      const ctm = svg.getScreenCTM();
      inv = ctm ? ctm.inverse() : null;
      start = toUser(inv, e.clientX, e.clientY);
      startVb = Object.assign({}, vb);
      sx = e.clientX; sy = e.clientY; pid = e.pointerId;
      dragging = true;
      dragMoved = false;
    });
    on(svg, 'pointermove', e => {
      if (!dragging || !start || e.pointerId !== pid) return;
      if (!dragMoved && Math.hypot(e.clientX - sx, e.clientY - sy) < 4) return;
      if (!dragMoved) {
        dragMoved = true;
        try { svg.setPointerCapture(pid); } catch (err) { /* yok say */ }
        svg.classList.add('sl-panning');
        if (hover) { hover = null; renderCard(); }
      }
      const p = toUser(inv, e.clientX, e.clientY);
      userTouched = true;
      vb = Object.assign({}, startVb, { x: startVb.x - (p.x - start.x), y: startVb.y - (p.y - start.y) });
      applyViewBox();
    });
    const onUp = e => {
      if (e.pointerId !== pid) return;
      dragging = false;
      start = null;
      svg.classList.remove('sl-panning');
      try { svg.releasePointerCapture(pid); } catch (err) { /* yok say */ }
      // dragMoved ardından gelen click olayında okunur; sonra sıfırlanır
      timers.push(setTimeout(() => (dragMoved = false), 0));
    };
    on(svg, 'pointerup', onUp);
    on(svg, 'pointercancel', onUp);

    on(svg, 'pointerover', e => {
      if (dragging) return;
      const g = e.target.closest && e.target.closest('[data-n]');
      if (!g) return;
      const n = m.nodes[+g.getAttribute('data-n')];
      if (!n || (hover && hover.n === n)) return;
      nodeEls.forEach(x => x.classList.toggle('sl-hovered', x === g));
      const rect = root.getBoundingClientRect();
      let left = e.clientX - rect.left + 16, top = e.clientY - rect.top + 12;
      if (left + 240 > rect.width) left = Math.max(8, e.clientX - rect.left - 252);
      if (top + 180 > rect.height) top = Math.max(8, e.clientY - rect.top - 188);
      hover = { n, left, top };
      renderCard();
    });
    on(svg, 'pointerout', e => {
      const g = e.target.closest && e.target.closest('[data-n]');
      if (!g || (e.relatedTarget && g.contains(e.relatedTarget))) return;
      g.classList.remove('sl-hovered');
      if (hover && hover.n === m.nodes[+g.getAttribute('data-n')]) { hover = null; renderCard(); }
    });
    on(svg, 'click', e => {
      if (dragMoved) return;
      const g = e.target.closest && e.target.closest('[data-n]');
      if (g) {
        selected = m.nodes[+g.getAttribute('data-n')];
        showSelAlarms = false;
        renderSel();
      }
      // İşarete ya da boş alana tıklama: soluklaştırma kalkar, işaret kalır
      if (dimmed) { dimmed = false; applyDim(); }
    });
    on(controlsEl, 'click', e => {
      const b = e.target.closest('[data-z]');
      if (!b) return;
      const z = b.getAttribute('data-z');
      if (z === 'in') zoomBy(0.8);
      else if (z === 'out') zoomBy(1.25);
      else if (z === 'fit') fit();
      else if (z === 'clear') clearFocus();
    });
    on(classicBtn, 'click', () => { classic = !classic; renderClassicBtn(); });
    on(selEl, 'click', e => {
      const b = e.target.closest('[data-sel]');
      if (!b || !selected) return;
      const a = b.getAttribute('data-sel');
      if (a === 'close') { selected = null; showSelAlarms = false; renderSel(); }
      else if (a === 'bms') locate(selected.src.devId);
      else if (a === 'alarms') { showSelAlarms = !showSelAlarms; renderSel(); }
      else if (a === 'unfocus') clearFocus();
      else if (a === 'alarm-bms') { const al = selAlarms()[+b.getAttribute('data-i')]; if (al) locate(al.devId, al); }
    });
    on(q('[data-sl-toolbar]'), 'click', e => {
      const r = e.target.closest('[data-sl-refresh]');
      if (!r) return;
      const i = r.querySelector('i');
      i.classList.add('pi-spin');
      timers.push(setTimeout(() => i.classList.remove('pi-spin'), 600));
      liveTick();
    });

    // ── İlk çizim ──
    renderClassicBtn();
    resetView();
    if (focusIn) {
      // Boyut ölçülebilsin diye bir kare sonra yaklaş
      animId = requestAnimationFrame(() => { animId = 0; setFocus(focusIn); });
      updateFocus(false);
    } else updateFocus(false);

    return {
      setFocus,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelAnim();
        timers.forEach(t => { clearInterval(t); clearTimeout(t); });
        cleanup.forEach(f => f());
        el.innerHTML = '';
      }
    };
  }

  DCIM.pmsSingleLine = {
    schemas: (SRC.schemas || []).map(s => ({ id: s.id, label: s.label, schId: s.schId, title: s.title })),
    mount,
    resolve,
    /** Şemanın cihaz kimlikleri (jeneratör/trafo/kesici) — DCIM.data.pmsSingleLine.devices kısayolu */
    devices: id => (SRC.devices && SRC.devices[id]) || []
  };
})();
