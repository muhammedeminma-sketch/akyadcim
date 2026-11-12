/* ==========================================================================
   DCIM Sunum — Kabin Anomali (cabin-anomaly.html)
   Kaynak: new-ui/pages/analytics/cabin-anomaly
     cabin-anomaly.component.{html,ts}  sayfa, kabin paneli, göstergeler, olaylar, PDF raporu
     anomaly-floor-3d.component.ts      3D kat planı (Three.js; kabin blokları, sensör ışıkları, UPS / klima, kamera turu)
     ups-panel.component.{html,ts}      UPS panosu paneli (giriş gücü / gerilimi, batarya modülleri, olaylar)
   - Harita kaynağı: Canlı (motorun anm bayrakları) ya da Geçmiş (seçili aralığın en yüksek değeri + aralıktaki olaylar)
   - Kabin seçilince: bağlantılı sıcaklık + nem grafikleri (ECharts, ortak yakınlaştırma), beklenen aralık bandı,
     sensör göstergeleri (ECharts gauge), anomali olayları tablosu (sapma / sıçrama / çelişki + ortam bağlamı)
   - UPS seçilince: UPS anomali paneli
   - Başlıktaki "PDF Raporu" (page-report): KPI şeridi + 3D kat planı görüntüsü + izlenecek kabinler / UPS / olaylar
   Derin bağlantılar:
     ?floor=T00|T02|T03          kat
     ?cabinet=1DU06              kabin paneli açık (senaryo: 1DU06, 1DA07, 1DS07, 1DL01, 1DP02, 1DN05, 1DM03)
     ?ups=UPS%20A2               UPS paneli açık (UPS A2 yük değişimi, UPS A5 giriş yok, UPS B3 batarya, UPS B7 veri yok)
     ?mode=history               harita kaynağı Geçmiş
     ?q=1DA                      kabin arama
     ?exp=top|mid|bot            grafikte beklenen aralık
     ?hum=1                      nem grafiği açık
     ?rotate=0                   kamera turu kapalı (ekran görüntüsü için)
   Veri: js/mock/cabin-anomaly.data.js (DCIM.data.cabinAnomaly)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const ui = DCIM.ui;
  const esc = ui.esc;
  const D = DCIM.data;
  const A = D.cabinAnomaly;
  const THREE = window.THREE;
  const echarts = window.echarts;
  DCIM.shell.init({ active: 'cabin-anomaly' });

  const q = new URLSearchParams(window.location.search);
  const POS_ORDER = ['top', 'mid', 'bot'];
  const SENSOR = { top: 'Üst', mid: 'Orta', bot: 'Alt', hum: 'Nem' };
  const LEVEL_RGB = { cool: [37, 99, 235], normal: [22, 163, 74], warn: [234, 179, 8], alarm: [220, 38, 38], lost: [148, 163, 184] };
  const LEVEL_LABEL = { cool: 'Soğuk', normal: 'Normal', warn: 'Uyarı', alarm: 'Alarm' };
  const ANOMALY_RGB = [192, 38, 211];
  const HUM_RGB = [14, 165, 233];
  const COOL_BELOW = 18;
  const LED = { ok: 'rgb(34, 197, 94)', anm: 'rgb(217, 70, 239)' };
  const CTX_LABEL = { ambient: 'Ortam', sensor: 'Sensör şüphesi', unclear: 'Belirsiz' };
  const INPUT_COLOR = ['#f97316', '#3b82f6'];
  const BAT_DISCHARGE = -5;
  const H = 3600000, DAY = 86400000;
  const rgb = (a, al) => al === undefined ? 'rgb(' + a.join(', ') + ')' : 'rgba(' + a.join(', ') + ', ' + al + ')';

  const anmTypeIcon = t => (t & A.ANM_JUMP ? '↯' : t & A.ANM_DEV ? '~' : t & A.ANM_CONTRA ? '⇅' : '!');
  const anmTypeLabel = t => [[A.ANM_DEV, 'Sapma'], [A.ANM_JUMP, 'Sıçrama'], [A.ANM_CONTRA, 'Çelişki']].filter(x => (t || 0) & x[0]).map(x => x[1]).join(', ');
  const upsTypeLabel = t => [[A.UPS_JUMP, 'Yük değişimi'], [A.UPS_BATT, 'Şebeke normalken batarya kullanımı'], [A.UPS_NOINPUT, 'Giriş gerilimi yok'], [A.UPS_GRID, 'Şebeke olayı (batarya devrede)']]
    .filter(x => (t || 0) & x[0]).map(x => x[1]).join(', ');
  const upsIsAnomaly = t => ((t || 0) & A.UPS_ANM_MASK) !== 0;

  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fmtDay = s => { const p = String(s).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : s; };
  const dmyhm = ms => { const d = new Date(ms); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const dmhm = ms => { const d = new Date(ms); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const n1 = v => Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtVal = v => (v === null || v === undefined ? '—' : v.toFixed(1) + ' °C');
  const fmtHum = v => (v === null || v === undefined ? '—' : v.toFixed(1) + ' %RH');
  const fmtSensor = (v, s) => (s === 'hum' ? fmtHum(v) : fmtVal(v));
  const isDark = () => document.documentElement.classList.contains('dark');

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const today = new Date();
  const state = {
    floorId: (A.floors.find(f => f.id === q.get('floor')) || A.floors[0]).id,
    startDate: iso(new Date(today.getTime() - 7 * DAY)),
    endDate: iso(today),
    mapMode: q.get('mode') === 'history' ? 'history' : 'live',
    search: q.get('q') || '',
    cabId: '',
    upsLabel: '',
    showHum: q.get('hum') === '1' || ui.storage.get('ca-show-hum') === '1',
    expPos: POS_ORDER.indexOf(q.get('exp')) >= 0 ? q.get('exp') : (POS_ORDER.indexOf(ui.storage.get('ca-exp-pos')) >= 0 ? ui.storage.get('ca-exp-pos') : ''),
    liveAt: new Date()
  };
  let cabins = [];
  let mapHist = null;
  let hist = null;
  let ups = [];
  let plan = null;
  let floor3d = null;
  let charts = [];
  let upsCharts = [];

  const rangeStart = () => new Date(state.startDate + 'T00:00:00').getTime();
  const rangeEnd = () => new Date(state.endDate + 'T23:59:59').getTime();
  const upsRange = () => fmtDay(state.startDate) + ' – ' + fmtDay(state.endDate);
  const floor = () => A.floors.find(f => f.id === state.floorId) || A.floors[0];

  function levelOf(v, ref) {
    if (v === null || v === undefined) return 'lost';
    if (ref && ref.alm !== null && v >= ref.alm) return 'alarm';
    if (ref && ref.wrn !== null && v >= ref.wrn) return 'warn';
    if (v < COOL_BELOW) return 'cool';
    return 'normal';
  }

  // Kutucuk / kabin değerleri: canlı ya da geçmiş
  function refreshCabins() {
    const live = A.live(state.floorId);
    if (state.mapMode === 'history' && !mapHist) mapHist = A.mapHistory(state.floorId, rangeStart(), rangeEnd());
    cabins = live.map(c => {
      const o = { cab: c.cab, pod: c.pod, temps: c.temps, hum: c.hum, commLoss: c.commLoss };
      if (state.mapMode === 'live') {
        const vals = POS_ORDER.map(p => c.temps[p]).filter(p => p && p.ok && p.val !== null).map(p => p.val);
        o.anomaly = POS_ORDER.some(p => c.temps[p].anm === '1') || c.hum.anm === '1';
        o.anmTyp = POS_ORDER.map(p => c.temps[p]).concat([c.hum]).reduce((t, p) => (p.anm === '1' ? t | p.anmTyp : t), 0);
        o.anmPos = {};
        POS_ORDER.concat(['hum']).forEach(p => { const pt = p === 'hum' ? c.hum : c.temps[p]; if (pt.anm === '1') o.anmPos[p] = true; });
        o.max = vals.length ? Math.max.apply(null, vals) : null;
      } else {
        const m = mapHist[c.cab] || { max: null, anomaly: false, anmTyp: 0, pos: {} };
        o.max = m.max; o.anomaly = m.anomaly; o.anmTyp = m.anmTyp; o.anmPos = m.pos;
      }
      o.level = levelOf(o.max, c.temps.top);
      return o;
    });
    ups = A.upsList(state.floorId).map(u => {
      let typ = u.typ;
      if (state.mapMode === 'history') {
        const h = A.upsHistory(state.floorId, u.label, rangeStart(), rangeEnd());
        typ = h ? h.events.reduce((t, e) => t | e.typ, 0) : 0;
      }
      return Object.assign({}, u, { typ, anomaly: upsIsAnomaly(typ), info: !upsIsAnomaly(typ) && (typ & A.UPS_INFO_MASK) !== 0 });
    });
  }

  const cabin = () => cabins.find(c => c.cab === state.cabId) || null;
  const passes = c => { const s = state.search.trim().toUpperCase(); return !s || c.cab.toUpperCase().indexOf(s) >= 0 || c.pod.toUpperCase().indexOf(s) >= 0; };
  function persistentOf(c) {
    if (!c) return null;
    const k = { inv: c.temps.top.kc === 1 || c.temps.bot.kc === 1, mid: c.temps.mid.kc === 1 };
    return k.inv || k.mid ? k : null;
  }
  function persistentText(k) {
    if (!k) return '';
    const what = [k.inv ? 'alt sensör sürekli üstten sıcak' : '', k.mid ? 'orta sensör sürekli aralık dışında' : ''].filter(x => x).join(', ');
    return 'Kalıcı çelişki: ' + what + ' · yerleşim / kalibrasyon kontrol edilmeli';
  }
  function trendOf(c) {
    if (state.mapMode !== 'live' || c.anomaly) return 0;
    const t = POS_ORDER.map(p => c.temps[p]).filter(p => p && p.ok).map(p => p.trend || 0);
    return t.some(x => x > 0) ? 1 : t.some(x => x < 0) ? -1 : 0;
  }
  function trendText(c) {
    const t = trendOf(c);
    if (!t) return '';
    const who = POS_ORDER.filter(p => (c.temps[p].trend || 0) === t).map(p => SENSOR[p]).join(', ');
    return t > 0 ? who + ' hızlı ısınıyor · nem düşüyor (ortam)' : who + ' hızlı soğuyor · nem yükseliyor (ortam)';
  }
  const trendArrow = c => { const t = trendOf(c); return t > 0 ? ' ↑' : t < 0 ? ' ↓' : ''; };
  function posState(c, p) {
    const pt = c.temps[p];
    if (!pt) return 'lost';
    if (c.anmPos && c.anmPos[p]) return 'anm';
    if (state.mapMode === 'live') return !pt.ok || pt.val === null ? 'lost' : 'ok';
    return 'ok';
  }
  const rackCaption = () => (state.mapMode === 'live' ? 'Şu an' : 'Aralığın en yüksek değeri');

  // ---------------------------------------------------------------------------
  // Kat planı geometrisi (kurgusal yerleşim: js/layout-data.js)
  // ---------------------------------------------------------------------------
  function buildPlan() {
    const L = D.layoutOf(floor().digit);
    const items = L.items;
    const lines = [];
    const tok = String(L.bgPath || '').trim().split(/\s+/);
    let cur = null;
    for (let i = 0; i < tok.length; i++) {
      if (tok[i] === 'M') { cur = [+tok[i + 1], +tok[i + 2]]; i += 2; }
      else if (tok[i] === 'L' && cur) { const nx = [+tok[i + 1], +tok[i + 2]]; lines.push({ x1: cur[0], y1: cur[1], x2: nx[0], y2: nx[1], w: 4, dash: false }); cur = nx; i += 2; }
    }
    (L.layer1Rects || []).forEach(r => {
      const p = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h], [r.x, r.y]];
      for (let k = 0; k < 4; k++) lines.push({ x1: p[k][0], y1: p[k][1], x2: p[k + 1][0], y2: p[k + 1][1], w: 1, dash: true });
    });
    const xs = [], ys = [];
    items.forEach(i => { xs.push(i.x, i.x + i.w); ys.push(i.y, i.y + i.h); });
    const x0 = Math.min.apply(null, xs) - 60, y0 = Math.min.apply(null, ys) - 60;
    plan = {
      cabs: items.filter(i => i.type === 'cabinet'),
      klms: items.filter(i => i.type === 'climate'),
      upsItems: items.filter(i => i.type === 'ups'),
      equip: items.filter(i => i.type === 'climate-panel').map(i => ({ id: i.id, kind: 'climate', x: i.x, y: i.y, w: i.w, h: i.h, label: i.label })),
      lines,
      texts: (L.texts || []).map(t => ({ x: t.x, y: t.y, label: t.text, fs: /^(POD|NW)/.test(t.text) ? 30 : 22, pod: /^(POD|NW)/.test(t.text) })),
      fitBox: { x: x0, y: y0, w: Math.max.apply(null, xs) + 60 - x0, h: Math.max.apply(null, ys) + 60 - y0 }
    };
  }

  function planCabs() {
    const byCab = new Map(cabins.map(c => [c.cab, c]));
    return plan.cabs.map(g => {
      const c = byCab.get(g.label) || null;
      return {
        id: g.id, label: g.label, x: g.x, y: g.y, w: g.w, h: g.h, cab: c,
        anomaly: !!(c && c.anomaly), persistent: !!c && !c.anomaly && !!persistentOf(c),
        selected: !!c && c.cab === state.cabId, dim: !!c && !passes(c),
        value: c && c.max !== null ? c.max.toFixed(1) + '°' + trendArrow(c) : '',
        leds: c ? POS_ORDER.filter(p => c.temps[p]).map(p => ({ pos: p, state: posState(c, p) })) : []
      };
    });
  }
  function planUps() {
    return ups.map(u => ({ id: u.id, label: u.label, devId: u.devId, x: u.item.x, y: u.item.y, w: u.item.w, h: u.item.h, anomaly: u.anomaly, info: u.info, lost: u.lost, selected: u.label === state.upsLabel }));
  }
  function pushPlan(first) {
    if (!floor3d) return;
    const data = { cabs: planCabs(), ups: planUps(), klms: plan.klms, equip: plan.equip, lines: plan.lines, texts: plan.texts, fitBox: plan.fitBox };
    if (first) floor3d.setStatic(data);
    floor3d.setDynamic(data);
  }

  // ---------------------------------------------------------------------------
  // 3D kat planı (anomaly-floor-3d karşılığı)
  // ---------------------------------------------------------------------------
  const SKY = 0x0ea5e9, PURPLE = 0xa21caf, PURPLE_LIGHT = 0xc026d3, SLATE = 0x94a3b8, SLATE_DARK = 0x64748b, GREEN = 0x16a34a, GREEN_LED = 0x22c55e, UNIT_GREY = 0x6b7280;
  const LED_LEVEL = { top: 0.82, mid: 0.5, bot: 0.18 };
  // ~30 kare/sn; tools/smoke.js (headless, yazılım WebGL) altında seyrek çizim — ekran görüntüsü süresi makul kalsın
  const FRAME_MS = navigator.webdriver ? 600 : 33;
  const TOUR_SPEED = (Math.PI * 2) / 60, TOUR_PERIOD_S = 36, TOUR_PHI_MIN = 0.18, TOUR_PHI_MAX = 1.22, INTRO_MS = 2500, TOUR_DIST = 0.62, ROTATE_IDLE_MS = 5000, ROTATE_KEY = 'ca-3d-rotate-v2';

  function createFloor3D(host, canvas, handlers) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (THREE.NeutralToneMapping !== undefined) renderer.toneMapping = THREE.NeutralToneMapping;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(0.35, 1, 0.55);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const staticLayer = new THREE.Group(), dynLayer = new THREE.Group();
    scene.add(staticLayer, dynLayer);
    const unitBox = new THREE.BoxGeometry(1, 1, 1), unitPlane = new THREE.PlaneGeometry(1, 1), unitSphere = new THREE.SphereGeometry(1, 16, 12);
    const unitEdges = new THREE.EdgesGeometry(unitBox);
    const hoverBox = new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    hoverBox.visible = false;
    scene.add(hoverBox);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    controls.zoomToCursor = true;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    const mats = new Map(), texs = new Map(), geos = new Map();
    let dark = isDark();
    let data = null, fb = { x: 0, y: 0, w: 1, h: 1 }, cx = 0, cz = 0, HH = 100, S0 = 40;
    let picks = [], pickInfo = new Map(), pulseMats = [];
    let rotate = q.get('rotate') === '0' ? false : ui.storage.get(ROTATE_KEY) !== '0';
    let userActive = false, pauseUntil = 0, introAt = 0, tourT = 0, anim = null, lastT = 0, lastFrame = 0, dirty = true;
    const mouse = new THREE.Vector2(9, 9);
    let hoverXY = { x: 0, y: 0 }, hoverDirty = false, hoverKey = '', down = null;
    const raycaster = new THREE.Raycaster();

    const mat = (key, make) => { let m = mats.get(key); if (!m) { m = make(); mats.set(key, m); } return m; };
    const geo = (key, make) => { let g = geos.get(key); if (!g) { g = make(); geos.set(key, g); } return g; };
    const solid = (color, op, pulse, metal, rough) => {
      const key = 's|' + color.getHexString() + '|' + op + '|' + !!pulse + '|' + metal + '|' + rough;
      if (pulse) {
        const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, transparent: op < 1, opacity: op, emissive: new THREE.Color(PURPLE_LIGHT), emissiveIntensity: 0.1 });
        pulseMats.push(m);
        return m;
      }
      return mat(key, () => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, transparent: op < 1, opacity: op }));
    };
    const lit = (color, op, intensity) => mat('lit|' + color + '|' + op + '|' + intensity, () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, transparent: op < 1, opacity: op }));
    const flat = (color, op) => mat('f|' + color + '|' + op, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    const lineMat = (color, op, dash) => mat('l|' + color + '|' + op + '|' + dash, () => dash > 0
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: op, dashSize: dash, gapSize: dash * 0.7 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
    function canvasTex(key, W, Hc, draw, repeat) {
      let t = texs.get(key);
      if (!t) {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = Hc;
        draw(cv.getContext('2d'), W, Hc);
        t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
        texs.set(key, t);
      }
      return t;
    }
    const textTex = (key, w, h, draw) => canvasTex(key, 256, Math.min(512, Math.max(48, Math.round((256 * h) / Math.max(1, w)))), draw);
    function topMaterial(bg, fg, label, value, long, short, op, fans) {
      const tk = 'top|' + bg.getHexString() + '|' + fg + '|' + label + '|' + value + '|' + Math.round(long) + 'x' + Math.round(short) + '|' + !!fans;
      const tex = textTex(tk, long, short, (g, W, Hc) => {
        g.fillStyle = '#' + bg.getHexString();
        g.fillRect(0, 0, W, Hc);
        if (fans) {
          [W * 0.22, W * 0.78].forEach(x => {
            const r = Math.min(Hc * 0.36, W * 0.16);
            g.beginPath(); g.arc(x, Hc / 2, r, 0, Math.PI * 2); g.fillStyle = 'rgba(15, 23, 42, 0.28)'; g.fill();
            g.beginPath(); g.arc(x, Hc / 2, r * 0.22, 0, Math.PI * 2); g.fillStyle = 'rgba(15, 23, 42, 0.35)'; g.fill();
          });
        }
        g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
        const fit = (txt, size, weight, maxW) => {
          let s = size;
          g.font = weight + ' ' + s + 'px "Segoe UI", system-ui, sans-serif';
          while (s > 8 && g.measureText(txt).width > maxW) { s -= 2; g.font = weight + ' ' + s + 'px "Segoe UI", system-ui, sans-serif'; }
          return s;
        };
        if (value) {
          const s1 = fit(label, Hc * 0.3, 600, W * 0.86);
          g.globalAlpha = 0.85; g.fillText(label, W / 2, Hc * 0.33); g.globalAlpha = 1;
          g.font = '700 ' + Math.min(fit(value, Hc * 0.36, 700, W * 0.86), s1 * 1.35) + 'px "Segoe UI", system-ui, sans-serif';
          g.fillText(value, W / 2, Hc * 0.7);
        } else {
          fit(label, Hc * 0.42, 700, fans ? W * 0.3 : W * 0.86);
          g.fillText(label, W / 2, Hc / 2);
        }
      });
      return mat('tm|' + tk + '|' + op, () => new THREE.MeshBasicMaterial({ map: tex, transparent: op < 1, opacity: op, toneMapped: false }));
    }
    function faceMaterial(kind) {
      const ink = dark ? 'rgba(0, 0, 0, 0.32)' : 'rgba(15, 23, 42, 0.16)';
      const tex = kind === 'door'
        ? canvasTex('face|door|' + dark, 64, 64, (g, W, Hc) => { g.fillStyle = ink; for (let y = 4; y < Hc; y += 8) for (let x = 4 + ((y / 8) % 2) * 4; x < W; x += 8) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); } }, true)
        : kind === 'grille'
          ? canvasTex('face|grille|' + dark, 64, 64, (g, W, Hc) => { g.fillStyle = ink; for (let y = 3; y < Hc; y += 8) g.fillRect(4, y, W - 8, 2.5); }, true)
          : canvasTex('face|ups|' + dark, 128, 256, (g, W, Hc) => {
            g.fillStyle = 'rgba(15, 23, 42, 0.55)'; g.fillRect(W * 0.22, Hc * 0.12, W * 0.56, Hc * 0.12);
            g.fillStyle = 'rgba(34, 197, 94, 0.9)'; g.fillRect(W * 0.28, Hc * 0.16, W * 0.28, Hc * 0.04);
            g.fillStyle = ink; for (let y = Hc * 0.34; y < Hc * 0.92; y += 10) g.fillRect(W * 0.18, y, W * 0.64, 3);
          });
      if (kind === 'door') tex.repeat.set(2, 12);
      if (kind === 'grille') tex.repeat.set(1, 8);
      return mat('face|' + kind + '|' + dark, () => new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.5, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -1 }));
    }
    function shadowMat() {
      const tex = canvasTex('shadow', 128, 128, (g, W, Hc) => {
        const grd = g.createRadialGradient(W / 2, Hc / 2, 0, W / 2, Hc / 2, W / 2);
        grd.addColorStop(0, 'rgba(0, 0, 0, 0.7)'); grd.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)'); grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
        g.fillStyle = grd; g.fillRect(0, 0, W, Hc);
      });
      return mat('shadow|' + dark, () => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: dark ? 0.6 : 0.28, toneMapped: false }));
    }
    const boxGeo = (w, h, d) => geo('b|' + w.toFixed(1) + '|' + h.toFixed(1) + '|' + d.toFixed(1), () => new THREE.BoxGeometry(w, h, d));
    const edgesGeo = (w, h, d) => geo('e|' + w.toFixed(1) + '|' + h.toFixed(1) + '|' + d.toFixed(1), () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)));
    const pos = (x, y) => [x - cx, y - cz];

    function clearLayer(g) {
      while (g.children.length) {
        const c = g.children.pop();
        c.traverse(o => { if (o.geometry && o.userData.own) o.geometry.dispose(); });
      }
    }
    function addShadow(parent, w, d) {
      const s = new THREE.Mesh(unitPlane, shadowMat());
      s.rotation.x = -Math.PI / 2; s.scale.set(w * 1.4, d * 1.3, 1); s.position.y = 0.5; s.renderOrder = -1;
      parent.add(s);
    }
    function addStatusBand(parent, w, h, d, color, op) {
      const band = new THREE.Mesh(unitBox, lit(color, op, 0.55));
      band.scale.set(w * 1.012, h * 0.022, d * 1.012); band.position.y = h * 0.955;
      parent.add(band);
    }
    function addSelection(parent, w, h, d) {
      [1.02, 1.07].forEach(k => {
        const e = new THREE.LineSegments(unitEdges, lineMat(SKY, k > 1.05 ? 0.5 : 1, 0));
        e.scale.set(w * k, h * (1 + (k - 1) * 0.3), d * k); e.position.y = (h * (1 + (k - 1) * 0.3)) / 2;
        parent.add(e);
      });
      const glow = new THREE.Mesh(unitPlane, flat(SKY, 0.16));
      glow.rotation.x = -Math.PI / 2; glow.scale.set(w + S0 * 0.3, d + S0 * 0.3, 1); glow.position.y = 0.9;
      parent.add(glow);
    }
    function addFaces(parent, kind, w, d, hgt, fwK) {
      const fm = faceMaterial(kind), depthZ = w < d, short = Math.min(w, d);
      [-1, 1].forEach(sd => {
        const f = new THREE.Mesh(unitPlane, fm);
        const fw = short * (fwK || 0.8);
        f.scale.set(fw, kind === 'ups' ? Math.min(hgt * 0.8, fw * 2) : hgt * (kind === 'door' ? 0.86 : 0.78), 1);
        f.position.y = hgt * 0.47;
        if (depthZ) { f.position.z = sd * (d / 2 + 0.3); f.rotation.y = sd > 0 ? 0 : Math.PI; }
        else { f.position.x = sd * (w / 2 + 0.3); f.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2; }
        parent.add(f);
      });
    }

    function measure() {
      fb = data.fitBox;
      cx = fb.x + fb.w / 2; cz = fb.y + fb.h / 2;
      const med = v => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
      const depth = med(data.cabs.map(c => Math.max(c.w, c.h))), width = med(data.cabs.map(c => Math.min(c.w, c.h)));
      HH = depth > 0 ? depth * 1.55 : 100;
      S0 = width > 0 ? width : 40;
      const R = 0.5 * Math.hypot(fb.w, fb.h) || 500;
      camera.near = Math.max(0.5, HH * 0.02); camera.far = R * 30; camera.updateProjectionMatrix();
      controls.minDistance = HH * 0.6; controls.maxDistance = R * 6;
      const bg = new THREE.Color(dark ? 0x0d1424 : 0xf1f4f8);
      scene.background = bg;
      scene.fog = new THREE.Fog(bg, R * 3, R * 8);
    }

    function rebuildStatic() {
      clearLayer(staticLayer);
      const L = staticLayer, fw = fb.w * 1.1, fh = fb.h * 1.1;
      const tile = canvasTex('floor|' + dark, 128, 128, (g, W, Hc) => {
        g.fillStyle = dark ? '#162033' : '#e8ecf1'; g.fillRect(0, 0, W, Hc);
        g.strokeStyle = dark ? '#0f1726' : '#d5dce5'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, W - 3, Hc - 3);
      }, true);
      tile.repeat.set(fw / S0, fh / S0);
      const floorMesh = new THREE.Mesh(unitPlane, mat('floor|' + dark, () => new THREE.MeshStandardMaterial({ map: tile, roughness: 0.9, metalness: 0.02 })));
      floorMesh.rotation.x = -Math.PI / 2; floorMesh.scale.set(fw, fh, 1);
      L.add(floorMesh);
      const wallMat = solid(new THREE.Color(dark ? 0x3b4a60 : 0xb6c0cc), 0.35, false, 0.1, 0.3);
      const capMat = solid(new THREE.Color(dark ? 0x64748b : 0x7b8796), 1, false, 0.4, 0.4);
      data.lines.forEach(l => {
        const dx = l.x2 - l.x1, dy = l.y2 - l.y1, len = Math.hypot(dx, dy);
        if (len < 1) return;
        const m = pos((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2);
        if (l.dash) {
          const a = pos(l.x1, l.y1), b = pos(l.x2, l.y2);
          const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], 0.6, a[1]), new THREE.Vector3(b[0], 0.6, b[1])]);
          const seg = new THREE.Line(g, lineMat(dark ? 0x475569 : 0x94a3b8, 0.8, S0 * 0.25));
          seg.computeLineDistances(); seg.userData.own = true;
          L.add(seg);
          return;
        }
        const t = Math.max(1.5, l.w), wh = HH * 0.2, rot = -Math.atan2(dy, dx);
        const wall = new THREE.Mesh(unitBox, wallMat);
        wall.scale.set(len, wh, t); wall.position.set(m[0], wh / 2, m[1]); wall.rotation.y = rot;
        const cap = new THREE.Mesh(unitBox, capMat);
        cap.scale.set(len, Math.max(1, HH * 0.01), t * 1.3); cap.position.set(m[0], wh, m[1]); cap.rotation.y = rot;
        L.add(wall, cap);
      });
      data.equip.forEach(e => {
        const p = pos(e.x + e.w / 2, e.y + e.h / 2), hgt = HH * 0.85, long = Math.max(e.w, e.h), short = Math.min(e.w, e.h);
        const body = new THREE.Mesh(boxGeo(e.w, hgt, e.h), solid(new THREE.Color(dark ? 0x323d50 : 0xdde2e9), 1, false, 0.3, 0.55));
        body.position.set(p[0], hgt / 2, p[1]);
        const top = new THREE.Mesh(unitPlane, topMaterial(new THREE.Color(UNIT_GREY), '#ffffff', e.label || 'Klima panosu', '', long, short, 1));
        top.rotation.set(-Math.PI / 2, 0, e.h > e.w ? Math.PI / 2 : 0); top.scale.set(long * 0.92, short * 0.86, 1); top.position.set(p[0], hgt + 0.4, p[1]);
        const band = new THREE.Mesh(unitBox, lit(UNIT_GREY, 1, 0.55));
        band.scale.set(e.w * 1.012, hgt * 0.022, e.h * 1.012); band.position.set(p[0], hgt * 0.955, p[1]);
        const pick = { kind: 'pano', id: e.id, label: e.label || 'Klima panosu' };
        body.userData.pick = pick; top.userData.pick = pick;
        L.add(body, top, band);
        picks.push(body, top);
        pickInfo.set('pano:' + e.id, { rect: e, height: hgt });
      });
      data.texts.forEach(t => {
        const w = Math.max(1, t.label.length) * t.fs * 0.62, h = t.fs * 1.3;
        const color = t.pod ? (dark ? '#8796ab' : '#52607a') : (dark ? '#5b6b82' : '#94a3b8');
        const tex = textTex('txt|' + t.label + '|' + color + '|' + Math.round(w) + 'x' + Math.round(h), w, h, (g, W, Hc) => {
          g.fillStyle = color;
          let s = Math.round(Hc * 0.7);
          g.font = '600 ' + s + 'px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          while (s > 8 && g.measureText(t.label).width > W * 0.96) { s -= 2; g.font = '600 ' + s + 'px "Segoe UI", system-ui, sans-serif'; }
          g.fillText(t.label, W / 2, Hc / 2);
        });
        const m = new THREE.Mesh(unitPlane, mat('txm|' + t.label + '|' + color + '|' + Math.round(w), () => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })));
        const p = pos(t.x, t.y);
        m.rotation.x = -Math.PI / 2; m.scale.set(w, h, 1); m.position.set(p[0], 0.8, p[1]);
        L.add(m);
      });
      dirty = true;
    }

    const neutralBody = () => new THREE.Color(dark ? 0x2a3445 : 0xd3d9e1);
    const neutralTop = () => new THREE.Color(dark ? 0x364256 : 0xe6eaf0);
    const topText = () => (dark ? '#e2e8f0' : '#1e293b');

    function addCabinet(p) {
      const op = p.dim ? 0.16 : 1, g = new THREE.Group();
      const c = pos(p.x + p.w / 2, p.y + p.h / 2);
      g.position.set(c[0], 0, c[1]);
      const pick = { kind: 'cab', id: p.id };
      const long = Math.max(p.w, p.h), short = Math.min(p.w, p.h), depthZ = p.w < p.h;
      const nodata = !p.cab;
      const bodyCol = p.anomaly ? new THREE.Color(PURPLE) : nodata ? new THREE.Color(dark ? 0x3a4352 : 0xc7cdd6) : neutralBody();
      const topCol = p.anomaly ? new THREE.Color(PURPLE_LIGHT) : nodata ? new THREE.Color(dark ? 0x465063 : 0xd8dde4) : neutralTop();
      const statusCol = p.anomaly ? PURPLE_LIGHT : nodata ? SLATE_DARK : GREEN;
      if (!p.dim) addShadow(g, p.w, p.h);
      const body = new THREE.Mesh(boxGeo(p.w, HH, p.h), solid(bodyCol, op, p.anomaly && !p.dim, p.anomaly ? 0.2 : 0.35, p.anomaly ? 0.45 : 0.6));
      body.position.y = HH / 2; body.userData.pick = pick;
      g.add(body);
      addStatusBand(g, p.w, HH, p.h, statusCol, op);
      if (!p.dim) addFaces(g, 'door', p.w, p.h, HH);
      const top = new THREE.Mesh(unitPlane, topMaterial(topCol, p.anomaly ? '#ffffff' : topText(), p.label, p.value, long, short, op));
      top.rotation.set(-Math.PI / 2, 0, p.h > p.w ? Math.PI / 2 : 0); top.scale.set(long * 0.92, short * 0.86, 1); top.position.y = HH + 0.4; top.userData.pick = pick;
      g.add(top);
      if (p.persistent || !p.cab) {
        const e = new THREE.LineSegments(edgesGeo(p.w * 1.02, HH * 1.005, p.h * 1.02), lineMat(p.persistent ? PURPLE_LIGHT : SLATE, p.dim ? 0.3 : 1, S0 * 0.18));
        e.computeLineDistances(); e.position.y = HH / 2;
        g.add(e);
      }
      if (p.selected) addSelection(g, p.w, HH, p.h);
      const r = short * 0.06;
      p.leds.forEach(l => {
        const anm = l.state === 'anm' && !p.dim;
        const m = anm ? solid(new THREE.Color(0xe879f9), op, true, 0, 0.3) : lit(GREEN_LED, op, 0.8);
        [-1, 1].forEach(sd => {
          const s = new THREE.Mesh(unitSphere, m);
          s.scale.setScalar(anm ? r * 1.3 : r);
          const y = (LED_LEVEL[l.pos] || 0.5) * HH;
          if (depthZ) s.position.set(0, y, sd * (p.h / 2 + r * 0.4)); else s.position.set(sd * (p.w / 2 + r * 0.4), y, 0);
          g.add(s);
        });
      });
      dynLayer.add(g);
      picks.push(body, top);
      pickInfo.set('cab:' + p.id, { rect: p, height: HH });
    }

    function addUnit(kind, id, label, rc, anomaly, info, lost, selected, mark) {
      const hgt = HH * (kind === 'klm' ? 0.95 : 0.8), op = lost && !selected ? 0.45 : 1;
      const accent = anomaly ? PURPLE_LIGHT : info ? SLATE_DARK : UNIT_GREY;
      const g = new THREE.Group();
      const c = pos(rc.x + rc.w / 2, rc.y + rc.h / 2);
      g.position.set(c[0], 0, c[1]);
      const pick = { kind, id: label, label };
      const long = Math.max(rc.w, rc.h), short = Math.min(rc.w, rc.h);
      if (op === 1) addShadow(g, rc.w, rc.h);
      const bodyCol = anomaly ? new THREE.Color(PURPLE) : new THREE.Color(dark ? 0x323d50 : 0xdde2e9);
      const body = new THREE.Mesh(boxGeo(rc.w, hgt, rc.h), solid(bodyCol, op, anomaly, 0.3, 0.55));
      body.position.y = hgt / 2; body.userData.pick = pick;
      g.add(body);
      addStatusBand(g, rc.w, hgt, rc.h, accent, op);
      if (op === 1) addFaces(g, kind === 'klm' ? 'grille' : 'ups', rc.w, rc.h, hgt);
      const top = new THREE.Mesh(unitPlane, topMaterial(new THREE.Color(accent), '#ffffff', mark, '', long, short, op, kind === 'klm'));
      top.rotation.set(-Math.PI / 2, 0, rc.h > rc.w ? Math.PI / 2 : 0); top.scale.set(long * 0.92, short * 0.86, 1); top.position.y = hgt + 0.4; top.userData.pick = pick;
      g.add(top);
      if (kind === 'ups' && info && !selected) {
        const e = new THREE.LineSegments(edgesGeo(rc.w * 1.02, hgt * 1.005, rc.h * 1.02), lineMat(SLATE_DARK, 1, S0 * 0.18));
        e.computeLineDistances(); e.position.y = hgt / 2;
        g.add(e);
      }
      if (selected) addSelection(g, rc.w, hgt, rc.h);
      dynLayer.add(g);
      picks.push(body, top);
      pickInfo.set(kind + ':' + label, { rect: rc, height: hgt });
    }

    function rebuildDynamic() {
      clearLayer(dynLayer);
      picks = picks.filter(o => o.parent === staticLayer);
      Array.from(pickInfo.keys()).forEach(k => { if (k.indexOf('pano:') !== 0) pickInfo.delete(k); });
      pulseMats.forEach(m => m.dispose());
      pulseMats = [];
      data.cabs.forEach(addCabinet);
      data.klms.forEach(k => addUnit('klm', k.id, k.label, k, false, false, false, false, '❄'));
      data.ups.forEach(u => addUnit('ups', u.id, u.label, u, u.anomaly, u.info, u.lost, u.selected, 'UPS'));
      hoverKey = '-'; hoverDirty = true; dirty = true;
    }

    function fitDistance() {
      const R = 0.5 * Math.hypot(fb.w, fb.h) || 500;
      const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      return Math.max(R / t, R / (t * Math.max(0.3, camera.aspect))) * 0.92;
    }
    function moveTo(p, t, animate) {
      if (!animate) { camera.position.copy(p); controls.target.copy(t); anim = null; controls.update(); dirty = true; return; }
      anim = { t0: performance.now(), dur: 450, p0: camera.position.clone(), t0v: controls.target.clone(), p1: p, t1v: t };
    }
    function fit(animate) {
      const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), 0.75, 0));
      moveTo(off, new THREE.Vector3(0, 0, 0), animate);
    }
    function topView() {
      const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance(), 0.02, 0));
      moveTo(off, new THREE.Vector3(0, 0, 0), true);
    }
    function zoom(f) {
      const t = controls.target, off = camera.position.clone().sub(t);
      const d = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
      moveTo(t.clone().add(off.setLength(d)), t.clone(), true);
    }
    function focusPick(key, dist) {
      const info = pickInfo.get(key);
      if (!info) return false;
      const c = pos(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
      const t = new THREE.Vector3(c[0], info.height / 2, c[1]);
      const off = camera.position.clone().sub(controls.target).setLength(HH * (dist || 3.2));
      moveTo(t.clone().add(off), t, true);
      return true;
    }

    function pickAt() {
      if (Math.abs(mouse.x) > 1 || Math.abs(mouse.y) > 1) return null;
      raycaster.setFromCamera(mouse, camera);
      const hit = raycaster.intersectObjects(picks, false).find(h => h.object.userData.pick && h.object.material && h.object.material.opacity > 0.2);
      return hit ? hit.object.userData.pick : null;
    }
    function updateHover() {
      hoverDirty = false;
      const p = pickAt();
      const key = p ? p.kind + ':' + p.id : '';
      if (key !== hoverKey) {
        hoverKey = key;
        const info = key ? pickInfo.get(key) : null;
        if (info) {
          const c = pos(info.rect.x + info.rect.w / 2, info.rect.y + info.rect.h / 2);
          hoverBox.scale.set(info.rect.w * 1.04, info.height * 1.02, info.rect.h * 1.04);
          hoverBox.position.set(c[0], info.height / 2, c[1]);
          hoverBox.visible = true;
        } else hoverBox.visible = false;
        canvas.style.cursor = p && (p.kind === 'cab' || p.kind === 'ups') ? 'pointer' : 'grab';
        dirty = true;
      }
      handlers.onHover(p, hoverXY);
    }

    function tourStep(t, dt) {
      if (!introAt) introAt = t;
      const intro = t - introAt < INTRO_MS;
      if (!intro) tourT += dt;
      const mid = (TOUR_PHI_MIN + TOUR_PHI_MAX) / 2, amp = (TOUR_PHI_MAX - TOUR_PHI_MIN) / 2;
      const phiT = intro ? mid : mid + amp * Math.sin((tourT * Math.PI * 2) / TOUR_PERIOD_S);
      const k = 1 - Math.exp(-dt * (intro ? 2 : 1.2));
      const off = camera.position.clone().sub(controls.target), sph = new THREE.Spherical().setFromVector3(off);
      sph.phi += (phiT - sph.phi) * k;
      if (!intro) sph.theta += dt * TOUR_SPEED;
      const rT = fitDistance() * TOUR_DIST;
      if (sph.radius > rT) sph.radius += (rT - sph.radius) * k;
      sph.makeSafe();
      camera.position.copy(controls.target).add(off.setFromSpherical(sph));
      camera.lookAt(controls.target);
    }

    let raf = 0;
    function loop(t) {
      raf = requestAnimationFrame(loop);
      const dt = THREE.MathUtils.clamp((t - (lastT || t)) / 1000, 0, 0.1);
      lastT = t;
      if (anim) {
        const k = Math.min(1, (t - anim.t0) / anim.dur), e = 1 - Math.pow(1 - k, 3);
        camera.position.lerpVectors(anim.p0, anim.p1, e);
        controls.target.lerpVectors(anim.t0v, anim.t1v, e);
        if (k >= 1) { anim = null; pauseUntil = t + ROTATE_IDLE_MS; }
        dirty = true;
      }
      const autoOn = rotate && !userActive && !anim && t >= pauseUntil && controls.target.lengthSq() < (HH * 0.5) * (HH * 0.5);
      if (autoOn) tourStep(t, dt);
      else if (controls.update()) dirty = true;
      const moving = autoOn || pulseMats.length > 0;
      if (moving) {
        const k = 0.5 + 0.5 * Math.sin((t / 1600) * Math.PI * 2);
        pulseMats.forEach(m => { m.emissiveIntensity = 0.04 + 0.2 * k; });
      }
      if (hoverDirty || (autoOn && Math.abs(mouse.x) <= 1)) updateHover();
      if (dirty || (moving && t - lastFrame >= FRAME_MS)) {
        renderer.render(scene, camera);
        dirty = false;
        lastFrame = t;
      }
    }

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    }

    controls.addEventListener('change', () => { dirty = true; });
    controls.addEventListener('start', () => { canvas.style.cursor = 'grabbing'; anim = null; userActive = true; });
    controls.addEventListener('end', () => { canvas.style.cursor = 'grab'; userActive = false; pauseUntil = performance.now() + ROTATE_IDLE_MS; hoverDirty = true; });
    canvas.addEventListener('pointerdown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, moved: false }; });
    canvas.addEventListener('pointermove', e => {
      const rect = canvas.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      hoverXY = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
      hoverDirty = true;
    });
    canvas.addEventListener('pointerup', e => {
      const d = down; down = null;
      if (!d || d.moved || e.button !== 0) return;
      const p = pickAt();
      if (p) handlers.onClick(p);
    });
    canvas.addEventListener('pointerleave', () => { mouse.set(9, 9); hoverDirty = true; });
    canvas.addEventListener('dblclick', () => {
      const p = pickAt();
      if (!p || !focusPick(p.kind + ':' + p.id)) fit(true);
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(host);
    resize();
    raf = requestAnimationFrame(loop);

    return {
      setStatic(d) {
        data = d;
        dark = isDark();
        mats.forEach(m => m.dispose()); mats.clear();
        texs.forEach(t => t.dispose()); texs.clear();
        picks = []; pickInfo.clear();
        measure();
        rebuildStatic();
        introAt = 0; tourT = 0;
        const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(fitDistance() * 1.25, 0.95, -0.35));
        moveTo(off, new THREE.Vector3(0, 0, 0), false);
        if (!rotate) fit(false);
      },
      setDynamic(d) { data = d; rebuildDynamic(); },
      fit: () => fit(true),
      zoom,
      topView,
      focus: (key, dist) => focusPick(key, dist),
      get rotate() { return rotate; },
      toggleRotate() {
        rotate = !rotate;
        ui.storage.set(ROTATE_KEY, rotate ? '1' : '0');
        if (rotate) pauseUntil = 0;
        return rotate;
      },
      snapshot() {
        renderer.render(scene, camera);
        try { return { src: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }; } catch (e) { return null; }
      },
      destroy() { cancelAnimationFrame(raf); renderer.dispose(); }
    };
  }

  // ---------------------------------------------------------------------------
  // Başlık denetimleri
  // ---------------------------------------------------------------------------
  const SELECT_CLS = 'h-8 min-w-32 rounded-[2px] border border-slate-300 bg-white px-2 text-xs font-normal normal-case tracking-normal text-slate-900 dark:border-border-subtle dark:bg-surface-panel dark:text-slate-100';
  const DATE_CLS = 'h-8 rounded-[2px] border border-slate-300 bg-white px-2 text-xs font-normal text-slate-900 dark:border-border-subtle dark:bg-surface-panel dark:text-slate-100';
  const LBL_CLS = 'flex flex-col gap-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400';
  function renderControls() {
    const modeBtn = (m, icon, label) =>
      '<button type="button" data-mode="' + m + '" aria-pressed="' + (state.mapMode === m) + '" class="h-full rounded-[2px] px-3 text-[11px] font-bold ' +
      (state.mapMode === m ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-hover') + '">' +
      '<i class="' + icon + '"></i>' + label + '</button>';
    const host = document.getElementById('ca-controls');
    host.innerHTML =
      '<label class="' + LBL_CLS + '">Kat<select id="ca-floor" class="' + SELECT_CLS + '">' +
        A.floors.map(f => '<option value="' + f.id + '"' + (f.id === state.floorId ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select></label>' +
      '<label class="' + LBL_CLS + '">Başlangıç<input id="ca-start" type="date" class="' + DATE_CLS + '" value="' + state.startDate + '" /></label>' +
      '<label class="' + LBL_CLS + '">Bitiş<input id="ca-end" type="date" class="' + DATE_CLS + '" value="' + state.endDate + '" /></label>' +
      '<button type="button" id="ca-apply" class="' + ui.buttonClasses('primary', 'md') + ' h-8"><i class="pi pi-check text-current shrink-0"></i><span class="truncate">Uygula</span></button>' +
      '<div class="flex h-8 items-center rounded-[2px] border border-slate-200 p-0.5 dark:border-border-subtle" role="group" aria-label="Harita kaynağı">' +
        modeBtn('live', 'pi pi-circle-fill mr-1 text-[7px]', 'Canlı') + modeBtn('history', 'pi pi-history mr-1 text-[10px]', 'Geçmiş') + '</div>' +
      '<button type="button" id="ca-refresh" class="' + ui.buttonClasses('secondary', 'md') + ' h-8"><i class="pi pi-refresh text-current shrink-0"></i><span class="truncate">Yenile</span></button>';
    host.querySelector('#ca-floor').addEventListener('change', e => setFloor(e.target.value));
    host.querySelector('#ca-start').addEventListener('change', e => { state.startDate = e.target.value; });
    host.querySelector('#ca-end').addEventListener('change', e => { state.endDate = e.target.value; });
    host.querySelector('#ca-apply').addEventListener('click', applyRange);
    host.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMapMode(b.getAttribute('data-mode'))));
    host.querySelector('#ca-refresh').addEventListener('click', () => { state.liveAt = new Date(); applyRange(); ui.toast('Canlı değerler ve geçmiş yeniden okundu.', 'info', 'Kabin Anomali'); });
  }

  function setFloor(id) {
    state.floorId = id;
    state.cabId = '';
    state.upsLabel = '';
    mapHist = null;
    hist = null;
    refreshCabins();
    buildPlan();
    pushPlan(true);
    renderPanels();
  }
  function setMapMode(m) {
    if (m === state.mapMode) return;
    state.mapMode = m;
    renderControls();
    refreshCabins();
    pushPlan(false);
    renderPanels();
  }
  function applyRange() {
    if (!(rangeStart() < rangeEnd())) { ui.toast('Başlangıç tarihi bitişten önce olmalı.', 'error', 'Kabin Anomali'); return; }
    mapHist = null;
    hist = null;
    refreshCabins();
    pushPlan(false);
    renderPanels();
  }

  // ---------------------------------------------------------------------------
  // Üzerine gelinen kabin kartı + 3D ipucu
  // ---------------------------------------------------------------------------
  function onHover(p, xy) {
    const card = document.getElementById('ca-hover');
    const tip = document.getElementById('ca-3d-tip');
    const pc = p && p.kind === 'cab' ? plan.cabs.find(g => g.id === p.id) : null;
    const c = pc ? cabins.find(x => x.cab === pc.label) : null;
    if (c) {
      tip.classList.add('hidden');
      const accent = c.anomaly ? 'rgb(192, 38, 211)' : 'rgb(22, 163, 74)';
      const leds = POS_ORDER.filter(x => c.temps[x]).map(x => ({ pos: x, anm: posState(c, x) === 'anm' }));
      const k = persistentOf(c), tr = trendOf(c);
      card.innerHTML =
        '<div class="flex items-center justify-between gap-2"><span class="font-black text-slate-900 dark:text-slate-100">' + esc(c.cab) + '</span><span class="text-[10px] font-bold text-slate-500">' + esc(c.pod) + '</span></div>' +
        '<div class="mt-1 flex items-baseline gap-1.5"><span class="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style="background:' + accent + '"></span>' +
          '<span class="text-base font-black tabular-nums text-slate-900 dark:text-slate-100">' + fmtVal(c.max) + '</span>' +
          '<span class="text-[10px] font-bold text-slate-500">' + (c.level === 'lost' ? '' : LEVEL_LABEL[c.level]) + '</span></div>' +
        '<div class="mt-0.5 text-[10px] text-slate-500">' + (state.mapMode === 'live' ? 'Anlık en yüksek' : rackCaption()) + '</div>' +
        (leds.length ? '<div class="mt-1.5 flex gap-2 border-t border-slate-100 pt-1.5 text-[10px] dark:border-border-subtle">' + leds.map(l =>
          '<span class="flex items-center gap-1 ' + (l.anm ? 'font-black text-fuchsia-700 dark:text-fuchsia-200' : 'text-slate-500') + '"><i class="inline-block h-2 w-2 rounded-full" style="background:' + (l.anm ? LED.anm : LED.ok) + '"></i>' + SENSOR[l.pos] + '</span>').join('') + '</div>' : '') +
        (c.hum && state.mapMode === 'live' ? '<div class="mt-1 text-[10px] ' + (c.hum.anm === '1' ? 'font-black text-fuchsia-700 dark:text-fuchsia-200' : 'text-slate-500') + '">Nem ' + fmtHum(c.hum.ok ? c.hum.val : null) + '</div>' : '') +
        (c.anomaly ? '<div class="mt-1 rounded-[2px] bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] font-black text-fuchsia-700 dark:text-fuchsia-200">' + anmTypeIcon(c.anmTyp) + ' ANOMALİ' + (c.anmTyp ? '<span class="font-bold"> · ' + anmTypeLabel(c.anmTyp) + '</span>' : '') + '</div>' : '') +
        (k ? '<div class="mt-1 rounded-[2px] border border-dashed border-fuchsia-500/60 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-200">K · ' + esc(persistentText(k)) + '</div>' : '') +
        (tr ? '<div class="mt-1 rounded-[2px] border border-orange-500/40 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:text-orange-200">' + (tr > 0 ? '↑' : '↓') + ' İzle · ' + esc(trendText(c)) + '</div>' : '');
      const w = document.getElementById('ca-plan').clientWidth;
      const left = xy.x + 14 + 200 > w ? xy.x - 214 : xy.x + 14;
      card.style.left = Math.max(4, left) + 'px';
      card.style.top = Math.max(4, xy.y - 10) + 'px';
      card.classList.remove('hidden');
      return;
    }
    card.classList.add('hidden');
    if (p && (p.kind === 'klm' || p.kind === 'pano' || p.kind === 'ups' || p.kind === 'cab')) {
      let text = p.label || '';
      if (p.kind === 'pano') text += ' · klima panosu';
      if (p.kind === 'cab') text = (pc ? pc.label : '') + ' · Sensörü tanımlı değil';
      if (p.kind === 'ups') { const u = ups.find(x => x.label === p.label); if (u) text += u.anomaly ? ' · Anomali: ' + upsTypeLabel(u.typ) : u.info ? ' · Bilgi: ' + upsTypeLabel(u.typ) : u.lost ? ' · veri yok' : ''; }
      tip.textContent = text;
      tip.style.left = (xy.x + 14) + 'px';
      tip.style.top = (xy.y - 10) + 'px';
      tip.classList.remove('hidden');
    } else tip.classList.add('hidden');
  }
  function onClick(p) {
    if (p.kind === 'cab') {
      const pc = plan.cabs.find(g => g.id === p.id);
      const c = pc ? cabins.find(x => x.cab === pc.label) : null;
      if (c) { document.getElementById('ca-hover').classList.add('hidden'); selectCabin(c.cab); }
    } else if (p.kind === 'ups') selectUps(p.label);
  }

  function renderNav() {
    const nav = document.getElementById('ca-3d-nav');
    const btn = (attr, title, icon, extra) => '<button type="button" ' + attr + ' class="flex h-8 w-8 items-center justify-center ' + (extra || '') + ' text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-hover" aria-label="' + title + '" title="' + title + '"><i class="' + icon + ' text-xs"></i></button>';
    const rot = floor3d && floor3d.rotate;
    nav.innerHTML =
      btn('data-nav="in"', 'Yakınlaştır', 'pi pi-plus') +
      btn('data-nav="out"', 'Uzaklaştır', 'pi pi-minus', 'border-t border-slate-200 dark:border-border-subtle') +
      btn('data-nav="fit"', 'Başa dön (boş yere çift tık)', 'pi pi-expand', 'border-t border-slate-200 dark:border-border-subtle') +
      btn('data-nav="top"', 'Üstten bak', 'pi pi-eye', 'border-t border-slate-200 dark:border-border-subtle') +
      '<button type="button" data-nav="rot" aria-pressed="' + !!rot + '" class="flex h-8 w-8 items-center justify-center border-t border-slate-200 hover:bg-slate-100 dark:border-border-subtle dark:hover:bg-surface-hover ' +
        (rot ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300') + '" title="' + (rot ? 'Kamera turunu durdur' : 'Kamera turunu başlat') + '"><i class="pi text-xs ' + (rot ? 'pi-pause' : 'pi-sync') + '"></i></button>';
    nav.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
      if (!floor3d) return;
      const k = b.getAttribute('data-nav');
      if (k === 'in') floor3d.zoom(0.7);
      else if (k === 'out') floor3d.zoom(1.4);
      else if (k === 'fit') floor3d.fit();
      else if (k === 'top') floor3d.topView();
      else if (k === 'rot') { floor3d.toggleRotate(); renderNav(); }
    }));
  }

  // ---------------------------------------------------------------------------
  // Seçim
  // ---------------------------------------------------------------------------
  function selectCabin(cab) {
    if (cab === state.cabId) return;
    const opening = !state.cabId && !state.upsLabel;
    state.upsLabel = '';
    state.cabId = cab;
    hist = null;
    pushPlan(false);
    renderPanels();
    if (opening && window.innerWidth < 1280) setTimeout(() => { const el = document.getElementById('ca-detail'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  function closeCabin() {
    if (!state.cabId) return;
    state.cabId = '';
    hist = null;
    pushPlan(false);
    renderPanels();
  }
  function selectUps(label) {
    if (label === state.upsLabel) return;
    state.cabId = '';
    hist = null;
    state.upsLabel = label;
    pushPlan(false);
    renderPanels();
  }
  function closeUps() {
    if (!state.upsLabel) return;
    state.upsLabel = '';
    pushPlan(false);
    renderPanels();
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('[data-dialog-panel]')) return;
    if (state.upsLabel) closeUps(); else closeCabin();
  });

  // ---------------------------------------------------------------------------
  // Grafik yardımcıları (ECharts)
  // ---------------------------------------------------------------------------
  function disposeCharts(list) { list.forEach(c => { try { c.dispose(); } catch (e) { /* yok say */ } }); list.length = 0; }
  function initChart(el, option, list, group) {
    if (!el || !echarts) return null;
    const ch = echarts.init(el, null, { renderer: 'canvas' });
    ch.setOption(option);
    if (group) ch.group = group;
    list.push(ch);
    return ch;
  }
  const palette = () => {
    const dark = isDark();
    return { dark, fg: dark ? '#cbd5e1' : '#334155', muted: dark ? '#64748b' : '#94a3b8', grid: dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.12)', gfg: dark ? '#e2e8f0' : '#0f172a' };
  };
  const chartRange = () => ({ min: rangeStart(), max: rangeEnd() });
  function lossBands() {
    return (hist.commLoss || []).map(l => [{ xAxis: l.start, itemStyle: { color: 'rgba(100, 116, 139, 0.18)' } }, { xAxis: l.end }]);
  }
  function lineData(s) {
    const out = [];
    s.forEach((p, j) => {
      if (j > 0 && p.t - s[j - 1].t > H) out.push([s[j - 1].t + H, null]);
      out.push([p.t, +p.v.toFixed(2)]);
    });
    return out;
  }

  function tempChartOption() {
    const keys = POS_ORDER.filter(p => hist.scored[p] && hist.scored[p].length);
    if (!keys.length) return null;
    const P = palette();
    const colors = { top: '#f97316', mid: '#3b82f6', bot: '#14b8a6' };
    const c = cabin();
    const ref = c.temps.top;
    const ep = state.expPos && hist.scored[state.expPos] && hist.scored[state.expPos].length ? state.expPos : null;
    const lastT = Math.min(Date.now(), rangeEnd());
    const bands = lossBands().concat(hist.episodes.filter(e => e.pos !== 'hum').map(e => [
      { xAxis: e.start - H / 2, itemStyle: { color: rgb(ANOMALY_RGB, 0.16) } }, { xAxis: (e.end === null ? lastT : e.end) + H / 2 }]));
    const warnC = rgb(LEVEL_RGB.warn), almC = rgb(LEVEL_RGB.alarm);
    const lines = [
      { yAxis: ref.wrn, name: 'Uyarı', lineStyle: { color: warnC }, label: { formatter: 'Uyarı ' + ref.wrn + ' °C', color: warnC } },
      { yAxis: ref.alm, name: 'Alarm', lineStyle: { color: almC }, label: { formatter: 'Alarm ' + ref.alm + ' °C', color: almC } }
    ];
    const series = keys.map((pos, i) => {
      const out = {
        name: SENSOR[pos], type: 'line', data: lineData(hist.scored[pos]), showSymbol: false, connectNulls: false,
        lineStyle: { width: 1.75, color: colors[pos], opacity: ep && ep !== pos ? 0.3 : 1 }, itemStyle: { color: colors[pos] }, emphasis: { focus: 'series' }
      };
      if (i === 0) {
        out.markArea = { silent: true, data: bands };
        out.markLine = { silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 }, data: lines };
      }
      return out;
    });
    if (ep) {
      const k = 4, low = [], wid = [], mid = [];
      hist.scored[ep].forEach(p => {
        const ok = p.m !== null && p.s !== undefined;
        low.push([p.t, ok ? +(p.m - k * p.s).toFixed(2) : null]);
        wid.push([p.t, ok ? +(2 * k * p.s).toFixed(2) : null]);
        mid.push([p.t, ok ? +p.m.toFixed(2) : null]);
      });
      const common = { type: 'line', showSymbol: false, connectNulls: false, silent: true, z: 1 };
      series.push(
        Object.assign({}, common, { id: 'exp-low', name: '_expLow', data: low, stack: 'exp', lineStyle: { opacity: 0 } }),
        Object.assign({}, common, { id: 'exp-band', name: '_expBand', data: wid, stack: 'exp', lineStyle: { opacity: 0 }, areaStyle: { color: colors[ep], opacity: 0.14 } }),
        Object.assign({}, common, { id: 'exp-mid', name: 'Beklenen (' + SENSOR[ep] + ')', data: mid, z: 2, lineStyle: { type: 'dashed', width: 1.25, color: colors[ep] }, itemStyle: { color: colors[ep] } })
      );
    }
    const vals = [];
    keys.forEach(p => hist.scored[p].forEach(x => vals.push(x.v)));
    const lo = Math.floor(Math.min.apply(null, vals) - 1);
    const hi = Math.ceil(Math.max.apply(null, vals.concat([ref.wrn + 1])));
    return {
      color: keys.map(k => colors[k]),
      animation: false,
      grid: { left: 56, right: 84, top: 36, bottom: 52 },
      legend: { top: 0, right: 84, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: P.fg }, data: keys.map(k => SENSOR[k]).concat(ep ? ['Beklenen (' + SENSOR[ep] + ')'] : []) },
      tooltip: ep ? { trigger: 'axis', formatter: expTooltip } : { trigger: 'axis', valueFormatter: v => (v === null || v === undefined ? '—' : Number(v).toFixed(2) + ' °C') },
      xAxis: Object.assign({ type: 'time' }, chartRange(), { axisLabel: { color: P.muted }, axisLine: { lineStyle: { color: P.muted } }, splitLine: { show: false } }),
      yAxis: { type: 'value', min: lo, max: hi, axisLabel: { color: P.muted, formatter: '{value} °C' }, splitLine: { lineStyle: { color: P.grid } } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8, borderColor: P.grid, textStyle: { color: P.muted } }],
      series
    };
  }
  function expTooltip(ps) {
    const val = p => (p && Array.isArray(p.value) ? p.value[1] : null);
    const low = ps.find(p => p.seriesId === 'exp-low'), wid = ps.find(p => p.seriesId === 'exp-band');
    const rows = ps.filter(p => String(p.seriesName).indexOf('_') !== 0 && val(p) !== null && val(p) !== undefined).map(p => {
      let txt = p.marker + p.seriesName + ': <b>' + Number(val(p)).toFixed(2) + ' °C</b>';
      if (p.seriesId === 'exp-mid' && val(low) !== null && val(wid) !== null) txt += ' <span style="opacity:.7">(normal ' + Number(val(low)).toFixed(2) + '–' + (Number(val(low)) + Number(val(wid))).toFixed(2) + ')</span>';
      return txt;
    });
    if (!rows.length) return '';
    return [dmyhm(ps[0].value[0])].concat(rows).join('<br>');
  }
  function humChartOption() {
    const s = hist.scoredHum;
    if (!s.length) return null;
    const P = palette();
    const color = rgb(HUM_RGB);
    const ref = cabin().hum;
    const lastT = Math.min(Date.now(), rangeEnd());
    const bands = lossBands().concat(hist.episodes.filter(e => e.pos === 'hum').map(e => [
      { xAxis: e.start - H / 2, itemStyle: { color: rgb(ANOMALY_RGB, 0.16) } }, { xAxis: (e.end === null ? lastT : e.end) + H / 2 }]));
    const warnC = rgb(LEVEL_RGB.warn), almC = rgb(LEVEL_RGB.alarm);
    const vals = s.map(x => x.v);
    return {
      color: [color],
      animation: false,
      grid: { left: 56, right: 84, top: 28, bottom: 28 },
      legend: { top: 0, right: 84, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: P.fg }, data: ['Nem'] },
      tooltip: { trigger: 'axis', valueFormatter: v => (v === null || v === undefined ? '—' : Number(v).toFixed(1) + ' %RH') },
      xAxis: Object.assign({ type: 'time' }, chartRange(), { axisLabel: { color: P.muted }, axisLine: { lineStyle: { color: P.muted } }, splitLine: { show: false } }),
      yAxis: { type: 'value', min: Math.max(0, Math.floor(Math.min.apply(null, vals) - 2)), max: Math.min(100, Math.ceil(Math.max.apply(null, vals.concat([ref.wrn + 2])))), axisLabel: { color: P.muted, formatter: '{value} %' }, splitLine: { lineStyle: { color: P.grid } } },
      dataZoom: [{ type: 'inside' }, { type: 'slider', show: false }],
      series: [{
        name: 'Nem', type: 'line', data: lineData(s), showSymbol: false, connectNulls: false,
        lineStyle: { width: 1.75, color }, itemStyle: { color }, areaStyle: { color: rgb(HUM_RGB, 0.08) },
        markArea: { silent: true, data: bands },
        markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', width: 1 }, data: [
          { yAxis: ref.wrn, lineStyle: { color: warnC }, label: { formatter: 'Uyarı ' + ref.wrn + ' %', color: warnC } },
          { yAxis: ref.alm, lineStyle: { color: almC }, label: { formatter: 'Alarm ' + ref.alm + ' %', color: almC } }] }
      }]
    };
  }

  // Sensör göstergeleri: ibre (canlıda anlık, geçmişte aralığın en yükseği), yay sensör eşiklerine göre bölgeli
  function gauges() {
    const c = cabin();
    const sensors = POS_ORDER.filter(p => c.temps[p]).concat(c.hum ? ['hum'] : []);
    const from = rangeStart(), to = rangeEnd() + 1000;
    const hours = Math.max(1, Math.round((to - from) / H));
    return sensors.map(pos => {
      const pt = pos === 'hum' ? c.hum : c.temps[pos];
      const series = pos === 'hum' ? hist.scoredHum : hist.scored[pos] || [];
      const pts = series.filter(s => s.t >= from && s.t < to).map(s => s.v);
      const eps = hist.episodes.filter(e => e.pos === pos);
      const counts = { dev: eps.filter(e => e.typ & A.ANM_DEV).length, jump: eps.filter(e => e.typ & A.ANM_JUMP).length, contra: eps.filter(e => e.typ & A.ANM_CONTRA).length };
      const parts = [counts.dev ? counts.dev + ' sapma' : '', counts.jump ? counts.jump + ' sıçrama' : '', counts.contra ? counts.contra + ' çelişki' : ''].filter(x => x);
      let value, anomaly;
      if (state.mapMode === 'live') { value = pt.ok ? pt.val : null; anomaly = pt.anm === '1'; }
      else { value = pts.length ? Math.max.apply(null, pts) : null; anomaly = eps.length > 0; }
      return {
        pos, label: SENSOR[pos], value, anomaly, ref: pt,
        min: pts.length ? Math.min.apply(null, pts) : null,
        max: pts.length ? Math.max.apply(null, pts) : null,
        avg: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null,
        anmText: parts.length ? parts.join(' · ') : 'Anomali yok', anmCount: eps.length,
        coverage: Math.min(1, pts.length / hours),
        note: value === null ? 'veri yok' : ''
      };
    });
  }
  function gaugeOption(g) {
    const P = palette();
    const hum = g.pos === 'hum';
    const lo = hum ? 0 : 10, hi = hum ? 100 : 40;
    const f = v => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    const wrn = g.ref.wrn, alm = g.ref.alm;
    const zones = hum
      ? [[f(wrn), rgb(HUM_RGB, 0.45)], [f(alm), rgb(LEVEL_RGB.warn, 0.6)], [1, rgb(LEVEL_RGB.alarm, 0.6)]]
      : [[f(COOL_BELOW), rgb(LEVEL_RGB.cool, 0.45)], [f(wrn), rgb(LEVEL_RGB.normal, 0.45)], [f(alm), rgb(LEVEL_RGB.warn, 0.6)], [1, rgb(LEVEL_RGB.alarm, 0.6)]];
    const common = { type: 'gauge', min: lo, max: hi, startAngle: 215, endAngle: -35, center: ['50%', '60%'], silent: true, animation: false };
    const accent = g.anomaly ? rgb(ANOMALY_RGB) : P.gfg;
    const unit = hum ? ' %' : ' °C';
    const series = [Object.assign({}, common, {
      radius: '95%', splitNumber: hum ? 4 : 3,
      axisLine: { lineStyle: { width: 9, color: zones } }, axisTick: { show: false },
      splitLine: { length: 5, distance: -9, lineStyle: { color: P.muted, width: 1 } },
      axisLabel: { distance: 12, fontSize: 9, color: P.muted, formatter: v => String(Math.round(v)) },
      pointer: { show: g.value !== null, length: '62%', width: 3, itemStyle: { color: accent } },
      anchor: { show: g.value !== null, size: 7, itemStyle: { color: accent } },
      title: { show: false },
      detail: { offsetCenter: [0, '62%'], fontSize: 15, fontWeight: 800, color: accent, formatter: () => (g.value === null ? '—' : g.value.toFixed(1) + unit) },
      data: [{ value: g.value === null ? lo : g.value }]
    })];
    if (g.min !== null && g.max !== null) {
      const a = f(g.min), b = Math.min(1, Math.max(f(g.max), a + 0.012));
      series.push(Object.assign({}, common, {
        radius: '76%',
        axisLine: { lineStyle: { width: 4, color: [[a, 'rgba(0,0,0,0)'], [b, P.dark ? 'rgba(226,232,240,0.75)' : 'rgba(15,23,42,0.55)'], [1, 'rgba(0,0,0,0)']] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false }, anchor: { show: false }, title: { show: false }, detail: { show: false },
        data: [{ value: lo }]
      }));
    }
    return { series };
  }

  // ---------------------------------------------------------------------------
  // Paneller
  // ---------------------------------------------------------------------------
  const CLOSE_BTN = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-surface-hover dark:hover:text-slate-100';

  function renderDetail() {
    const el = document.getElementById('ca-detail');
    const c = cabin();
    disposeCharts(charts);
    if (!c) { el.classList.remove('is-open'); el.innerHTML = ''; return; }
    if (!hist) hist = A.cabinHistory(state.floorId, c.cab, rangeStart(), rangeEnd());
    const k = persistentOf(c) || (state.mapMode === 'history' && hist.persistent) || null;
    const expChoices = POS_ORDER.filter(p => hist.scored[p] && hist.scored[p].length);
    const gs = gauges();
    const caption = 'İbre: ' + (state.mapMode === 'live' ? 'anlık değer' : 'aralığın en yükseği') + ' · koyu bant ve özet: ' + upsRange() + ' (saatlik HSH)';
    el.innerHTML =
      '<div class="flex items-start justify-between gap-2">' +
        '<div><div class="text-sm font-black text-slate-900 dark:text-slate-100">' + esc(c.cab) + (c.pod ? '<span class="ml-1 text-[11px] font-bold text-slate-500">' + esc(c.pod) + '</span>' : '') + '</div>' +
        '<div class="text-[10px] text-slate-500">Anlık değerler ve ' + upsRange() + ' geçmişi</div></div>' +
        '<button type="button" data-close-cab class="' + CLOSE_BTN + '" aria-label="Kabin panelini kapat" title="Kapat (Esc)"><i class="pi pi-times text-xs"></i></button>' +
      '</div>' +
      '<div class="flex flex-col gap-3 sm:flex-row"><div class="flex min-w-0 flex-1 flex-col gap-1">' +
        '<div class="flex flex-wrap items-center gap-x-4 gap-y-1">' +
          (c.hum ? '<label class="flex w-fit cursor-pointer items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" data-hum class="h-3.5 w-3.5 accent-sky-500"' + (state.showHum ? ' checked' : '') + '>Nem grafiğini göster</label>' : '') +
          (expChoices.length ? '<label class="flex w-fit items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300" title="Sapma: değer bu aralığın dışına çıkınca işaretlenir. Aralık her sensörün olağan tahmin farkından hesaplanır.">Beklenen aralık' +
            '<select id="ca-exp-pos" class="rounded-[2px] border border-slate-300 bg-white px-1 py-0.5 text-[11px] font-bold dark:border-border-subtle dark:bg-surface-card">' +
              '<option value="">Kapalı</option>' + expChoices.map(p => '<option value="' + p + '"' + (state.expPos === p ? ' selected' : '') + '>' + SENSOR[p] + '</option>').join('') +
            '</select></label>' : '') +
        '</div>' +
        '<div class="relative h-72"><div data-chart="temp" class="h-full w-full"></div></div>' +
        (state.showHum && hist.scoredHum.length ? '<div class="relative h-40"><div data-chart="hum" class="h-full w-full"></div></div>' : '') +
      '</div></div>' +
      (gs.length ?
        '<div class="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-border-subtle">' +
          '<div class="flex flex-wrap items-baseline justify-between gap-2"><div class="text-sm font-black text-slate-900 dark:text-slate-100">Sensör göstergeleri</div><div class="text-[10px] text-slate-500">' + esc(caption) + '</div></div>' +
          (k ? '<div class="rounded-[2px] border border-dashed border-fuchsia-500/60 px-2 py-1 text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-200">K · ' + esc(persistentText(k)) + '. Bu çelişki anomali sayılmıyor; sapma ve sıçrama kuralları çalışmaya devam ediyor.</div>' : '') +
          '<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">' + gs.map((g, i) =>
            '<div class="flex min-w-0 flex-col items-center gap-1 rounded-[2px] border p-2 ' + (g.anomaly ? 'border-fuchsia-600 bg-fuchsia-500/10' : 'border-slate-200 dark:border-border-subtle') + '">' +
              '<div class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">' + g.label + '</div>' +
              '<div data-gauge="' + i + '" class="h-28 w-full" role="img" aria-label="' + esc(g.label + ': ' + (g.note || fmtSensor(g.value, g.pos)) + (g.anomaly ? ', anomali' : '')) + '"></div>' +
              (g.note ? '<div class="-mt-1 text-[9px] font-bold text-slate-500">' + g.note + '</div>' : '') +
              '<div class="grid w-full grid-cols-3 text-center text-[10px] tabular-nums">' +
                ['min', 'avg', 'max'].map(kk => '<div><div class="text-slate-400">' + ({ min: 'min', avg: 'ort', max: 'maks' })[kk] + '</div><div class="font-bold text-slate-700 dark:text-slate-200">' + (g[kk] === null ? '—' : n1(g[kk])) + '</div></div>').join('') +
              '</div>' +
              '<div class="w-full rounded-[2px] px-1 py-0.5 text-center text-[10px] font-bold ' + (g.anmCount ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200' : 'text-emerald-700 dark:text-emerald-300') + '"><i class="pi mr-1 text-[9px] ' + (g.anmCount ? 'pi-exclamation-circle' : 'pi-check') + '"></i>' + esc(g.anmText) + '</div>' +
              '<div class="text-[9px] text-slate-500 ' + (g.coverage < 0.8 ? 'text-amber-600 dark:text-amber-300' : '') + '">veri %' + Math.round(g.coverage * 100) + '</div>' +
            '</div>').join('') + '</div>' +
        '</div>' : '');
    el.classList.add('is-open');
    el.querySelector('[data-close-cab]').addEventListener('click', closeCabin);
    const hb = el.querySelector('[data-hum]');
    if (hb) hb.addEventListener('change', () => { state.showHum = hb.checked; ui.storage.set('ca-show-hum', state.showHum ? '1' : '0'); renderDetail(); });
    const sel = el.querySelector('#ca-exp-pos');
    if (sel) sel.addEventListener('change', () => { state.expPos = POS_ORDER.indexOf(sel.value) >= 0 ? sel.value : ''; ui.storage.set('ca-exp-pos', state.expPos); renderDetail(); });
    const t = tempChartOption();
    if (t) initChart(el.querySelector('[data-chart="temp"]'), t, charts, 'ca-hist');
    const hEl = el.querySelector('[data-chart="hum"]');
    if (hEl) { const h = humChartOption(); if (h) initChart(hEl, h, charts, 'ca-hist'); }
    if (echarts && charts.length > 1) echarts.connect('ca-hist');
    gs.forEach((g, i) => initChart(el.querySelector('[data-gauge="' + i + '"]'), gaugeOption(g), charts));
  }

  function renderEvents() {
    const el = document.getElementById('ca-events');
    const c = cabin();
    if (!c || !hist) { el.classList.remove('is-open'); el.innerHTML = ''; return; }
    const rows = hist.episodes;
    el.innerHTML =
      '<div class="mb-2 flex items-center justify-between gap-2">' +
        '<div class="text-sm font-black text-slate-900 dark:text-slate-100">Anomali olayları <span class="text-[11px] font-bold text-slate-500">' + esc(c.cab) + '</span></div>' +
        '<button type="button" data-excel class="' + ui.buttonClasses('secondary', 'sm') + ' h-7"><i class="pi pi-file-excel text-current shrink-0"></i><span class="truncate">Excel</span></button>' +
      '</div>' +
      (!rows.length ? '<div class="py-4 text-center text-xs text-slate-500">Seçili aralıkta anomali yok.</div>' :
        '<div class="overflow-x-auto"><table class="w-full text-left text-xs">' +
          '<thead class="text-[10px] uppercase tracking-wider text-slate-500"><tr class="border-b border-slate-200 dark:border-border-subtle">' +
            '<th class="py-1.5 pr-3">Başlangıç</th><th class="py-1.5 pr-3">Bitiş</th><th class="py-1.5 pr-3">Sensör</th><th class="py-1.5 pr-3">Tür</th>' +
            '<th class="py-1.5 pr-3 text-right">Tepe değer</th><th class="py-1.5 pr-3 text-right">Referans</th><th class="py-1.5 pr-3 text-right">z</th>' +
            '<th class="py-1.5" title="Nem ile sıcaklığın birlikte hareketi: ortam mı, sensör mü">Bağlam</th></tr></thead><tbody>' +
          rows.map(e =>
            '<tr class="border-b border-slate-100 text-slate-800 dark:border-border-subtle dark:text-slate-200">' +
              '<td class="py-1.5 pr-3 tabular-nums">' + dmyhm(e.start) + '</td>' +
              '<td class="py-1.5 pr-3 tabular-nums">' + (e.end ? dmyhm(e.end) : 'sürüyor') + '</td>' +
              '<td class="py-1.5 pr-3">' + SENSOR[e.pos] + ' <span class="text-slate-400">' + esc(e.rid) + '</span></td>' +
              '<td class="py-1.5 pr-3 font-bold text-fuchsia-700 dark:text-fuchsia-200">' + anmTypeLabel(e.typ) + '</td>' +
              '<td class="py-1.5 pr-3 text-right tabular-nums">' + fmtSensor(e.peakValue, e.pos) + '</td>' +
              '<td class="py-1.5 pr-3 text-right tabular-nums">' + fmtSensor(e.baseline, e.pos) + '</td>' +
              '<td class="py-1.5 pr-3 text-right font-bold tabular-nums ' + (e.peakZ > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-sky-600 dark:text-sky-300') + '">' + n1(e.peakZ) + '</td>' +
              '<td class="py-1.5">' + (e.ctx ? '<span class="inline-block whitespace-nowrap rounded-[2px] px-1.5 py-px text-[10px] font-bold ' +
                (e.ctx === 'ambient' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-200' : e.ctx === 'sensor' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'bg-slate-500/10 text-slate-500 dark:text-slate-400') + '">' + CTX_LABEL[e.ctx] + '</span>' : '') + '</td>' +
            '</tr>').join('') + '</tbody></table></div>');
    el.classList.add('is-open');
    el.querySelector('[data-excel]').addEventListener('click', () => {
      DCIM.report.generate({
        title: 'Kabin Anomali · ' + c.cab, filename: 'Kabin_Anomali_' + c.cab,
        sections: [{
          title: 'Olaylar', columns: [{ key: 's', label: 'Başlangıç' }, { key: 'e', label: 'Bitiş' }, { key: 'p', label: 'Nokta' }, { key: 't', label: 'Tür' }, { key: 'pk', label: 'Tepe değer' }, { key: 'b', label: 'Referans' }, { key: 'z', label: 'z' }, { key: 'x', label: 'Bağlam (nem)' }, { key: 'r', label: 'Gerçek mi?' }, { key: 'n', label: 'Not' }],
          rows: rows.map(e => ({ s: dmyhm(e.start), e: e.end ? dmyhm(e.end) : 'sürüyor', p: e.rid, t: anmTypeLabel(e.typ), pk: fmtSensor(e.peakValue, e.pos), b: fmtSensor(e.baseline, e.pos), z: n1(e.peakZ), x: CTX_LABEL[e.ctx] || '', r: '', n: '' }))
        }]
      }, 'xlsx');
    });
  }

  function renderUps() {
    const el = document.getElementById('ca-ups');
    disposeCharts(upsCharts);
    const u = ups.find(x => x.label === state.upsLabel);
    if (!u) { el.classList.remove('is-open'); el.innerHTML = ''; return; }
    const v = A.upsHistory(state.floorId, u.label, rangeStart(), rangeEnd());
    const liveMode = state.mapMode === 'live';
    const liveTyp = n => v.events.filter(e => e.input === n && e.end === null).reduce((t, e) => t | e.typ, 0) | (n === 1 && u.typ & A.UPS_GRID ? A.UPS_GRID : 0);
    const amp = x => (x === null || x === undefined ? '— A' : x.toFixed(1) + ' A');
    const kw = x => (x === null || x === undefined ? '—' : x.toFixed(1) + ' kW');
    const pct = x => (x === null || x === undefined ? '—' : (x > 0 ? '+' : '') + (100 * x).toFixed(0) + '%');
    const modCount = bit => v.mods.reduce((n, m) => n + m.view.eps.filter(e => e.typ & bit).length, 0);
    const modTyp = m => m.view.eps.reduce((t, e) => t | e.typ, 0);
    const liveBadges = liveMode ? [1, 2].filter(n => liveTyp(n)).map(n => {
      const t = liveTyp(n);
      return '<span class="flex flex-wrap items-center gap-1.5"><span class="font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Giriş-' + n + '</span>' +
        '<span class="rounded-[2px] px-1.5 py-0.5 font-black ' + (upsIsAnomaly(t) ? 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-200' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300') + '">' + (upsIsAnomaly(t) ? 'ANOMALİ' : 'Bilgi') + ' · ' + upsTypeLabel(t) + '</span></span>';
    }) : [];
    el.innerHTML =
      '<div class="flex flex-col gap-3">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div><div class="text-sm font-black text-slate-900 dark:text-slate-100">' + esc(u.label) + '<span class="ml-1 text-[11px] font-bold text-slate-500">' + esc(u.devId) + '</span></div>' +
          '<div class="text-[10px] text-slate-500">UPS panosu, giriş analizörleri (Giriş-1 / Giriş-2)' + (u.side ? ' · ' + u.side + ' tarafı' : '') + ' · ' + upsRange() + ' geçmişi</div></div>' +
          '<button type="button" data-close-ups class="' + CLOSE_BTN + '" aria-label="UPS panelini kapat" title="Kapat (Esc)"><i class="pi pi-times text-xs"></i></button>' +
        '</div>' +
        (liveBadges.length ? '<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">' + liveBadges.join('') + '</div>' : '') +
        (u.lost ? '<div class="rounded-[2px] border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[10px] font-bold text-orange-700 dark:text-orange-300">Veri yok: UPS haberleşmesi kesik (SNMP). Grafikte son okunan değerler.</div>' : '') +
        '<div class="flex flex-col gap-1.5 rounded-[2px] border border-slate-200 p-2 dark:border-border-subtle">' +
          '<div class="flex items-baseline justify-between gap-2"><span class="text-[11px] font-black text-slate-900 dark:text-slate-100">Batarya' + (u.side ? ' · ' + u.side + ' UPS' : '') + ' <span class="font-normal text-slate-400">(' + v.mods.length + ' modül)</span></span>' +
            '<span class="text-[10px] tabular-nums text-slate-500"><span class="' + (modCount(A.UPS_BATT) ? 'font-bold text-fuchsia-700' : '') + '">' + modCount(A.UPS_BATT) + ' şebeke normalken</span> · ' + modCount(A.UPS_GRID) + ' şebeke olayı</span></div>' +
          '<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">' + v.mods.map(m => {
            if (liveMode) {
              const dis = m.live.cur !== null && m.live.cur < BAT_DISCHARGE;
              return '<div class="flex min-w-0 flex-col rounded-[2px] border px-1.5 py-1 ' + (upsIsAnomaly(m.live.typ) ? 'border-fuchsia-600 bg-fuchsia-500/10' : 'border-slate-200 dark:border-border-subtle') + '" title="' + esc(m.label + (m.live.typ ? ' · ' + upsTypeLabel(m.live.typ) : '')) + '">' +
                '<span class="truncate text-[10px] font-black text-slate-500 dark:text-slate-400">' + esc(m.id) + '</span>' +
                '<span class="text-[12px] font-black tabular-nums ' + (dis ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-slate-800 dark:text-slate-100') + '">' + (m.live.ok ? amp(m.live.cur) : '—') + '</span>' +
                (m.live.ok ? '<span class="text-[10px] text-slate-500">' + (dis ? 'bataryadan besliyor' : 'şebekeden') + '</span>' : '') + '</div>';
            }
            const t = modTyp(m), dis = m.view.minCur < BAT_DISCHARGE;
            return '<div class="flex min-w-0 flex-col rounded-[2px] border px-1.5 py-1 ' + (upsIsAnomaly(t) ? 'border-fuchsia-600 bg-fuchsia-500/10' : 'border-slate-200 dark:border-border-subtle') + '" title="' + esc(m.label + (t ? ' · ' + upsTypeLabel(t) : '')) + '">' +
              '<span class="truncate text-[10px] font-black text-slate-500 dark:text-slate-400">' + esc(m.id) + '</span>' +
              '<span class="text-[12px] font-black tabular-nums ' + (dis ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-slate-800 dark:text-slate-100') + '">' + amp(m.view.minCur) + '</span>' +
              '<span class="text-[10px] text-slate-500">' + (m.view.eps.length ? m.view.eps.length + ' batarya kullanımı' : 'aralıkta en düşük; batarya kullanılmadı') + '</span></div>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="relative h-64"><div data-chart="pow" class="h-full w-full"></div></div>' +
        '<div class="relative h-32"><div data-chart="volt" class="h-full w-full"></div></div>' +
        '<div class="flex flex-col gap-1 border-t border-slate-100 pt-3 dark:border-border-subtle">' +
          '<div class="text-sm font-black text-slate-900 dark:text-slate-100">Olaylar <span class="text-[11px] font-bold text-slate-500">' + v.events.length + '</span></div>' +
          (!v.events.length ? '<div class="py-3 text-center text-xs text-slate-500">Seçili aralıkta olay yok.</div>' :
            '<div class="max-h-72 overflow-auto"><table class="w-full text-left text-xs">' +
              '<thead class="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-slate-500 dark:bg-surface-card"><tr class="border-b border-slate-200 dark:border-border-subtle">' +
                '<th class="py-1.5 pr-3">Başlangıç</th><th class="py-1.5 pr-3">Giriş</th><th class="py-1.5 pr-3">Tür</th><th class="py-1.5 pr-3 text-right">Güç</th><th class="py-1.5 pr-3 text-right">Olağan</th><th class="py-1.5 pr-3 text-right">Değişim</th><th class="py-1.5">Bağlam</th></tr></thead><tbody>' +
              v.events.map(e =>
                '<tr class="border-b border-slate-100 text-slate-800 dark:border-border-subtle dark:text-slate-200">' +
                  '<td class="py-1.5 pr-3 tabular-nums">' + dmhm(e.start) + '<span class="text-slate-400"> – ' + (e.end ? hm(e.end) : 'sürüyor') + '</span></td>' +
                  '<td class="py-1.5 pr-3" title="' + esc(e.src) + '">' + (e.src ? 'Modül' : 'G' + e.input) + '</td>' +
                  '<td class="py-1.5 pr-3 font-bold ' + (upsIsAnomaly(e.typ) ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-slate-500') + '">' + upsTypeLabel(e.typ) + '</td>' +
                  '<td class="py-1.5 pr-3 text-right tabular-nums">' + (e.src ? amp(e.peakValue) : kw(e.peakValue)) + '</td>' +
                  '<td class="py-1.5 pr-3 text-right tabular-nums">' + (e.src ? '—' : kw(e.baseline)) + '</td>' +
                  '<td class="py-1.5 pr-3 text-right font-bold tabular-nums ' + (e.peakZ < 0 ? 'text-sky-600 dark:text-sky-300' : 'text-rose-600 dark:text-rose-300') + '">' + (e.src ? '—' : pct(e.peakZ)) + '</td>' +
                  '<td class="py-1.5"><span class="inline-block whitespace-nowrap rounded-[2px] px-1.5 py-px text-[10px] font-bold ' + (e.crowd ? 'bg-slate-500/10 text-slate-600 dark:text-slate-300' : 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-200') + '">' +
                    (e.src ? esc(e.src) + (e.crowd ? ' · ' + e.crowd + ' modül daha' : '') : e.crowd ? 'Toplu · ' + e.crowd + ' UPS daha' : 'Tekil') + '</span></td>' +
                '</tr>').join('') + '</tbody></table></div>') +
        '</div>' +
      '</div>';
    el.classList.add('is-open');
    el.querySelector('[data-close-ups]').addEventListener('click', closeUps);
    const P = palette();
    const bands = v.events.filter(e => e.input).map(e => [
      { xAxis: e.start - 1800000, itemStyle: { color: upsIsAnomaly(e.typ) ? rgb(ANOMALY_RGB, 0.16) : 'rgba(100, 116, 139, 0.18)' },
        label: upsIsAnomaly(e.typ) ? undefined : { show: true, position: 'insideTop', formatter: 'Giriş yok', color: P.muted, fontSize: 10 } },
      { xAxis: (e.end === null ? Math.min(Date.now(), rangeEnd()) : e.end) + 1800000 }]);
    const common = {
      animation: false,
      grid: { left: 56, right: 24, top: 30, bottom: 28 },
      xAxis: Object.assign({ type: 'time' }, chartRange(), { axisLabel: { color: P.muted }, axisLine: { lineStyle: { color: P.muted } }, splitLine: { show: false } }),
      legend: { top: 0, right: 24, icon: 'roundRect', itemWidth: 12, itemHeight: 3, textStyle: { color: P.fg } }
    };
    initChart(el.querySelector('[data-chart="pow"]'), Object.assign({}, common, {
      tooltip: { trigger: 'axis', valueFormatter: x => (x === null || x === undefined ? '—' : Number(x).toFixed(1) + ' kW') },
      yAxis: { type: 'value', scale: true, axisLabel: { color: P.muted, formatter: '{value} kW' }, splitLine: { lineStyle: { color: P.grid } } },
      dataZoom: [{ type: 'inside' }],
      series: v.inputs.map((i, k) => ({ name: 'Giriş-' + i.n, type: 'line', showSymbol: false, connectNulls: false, data: i.pow, lineStyle: { width: 1.75, color: INPUT_COLOR[k] }, itemStyle: { color: INPUT_COLOR[k] }, markArea: { silent: true, data: k === 0 ? bands : [] } }))
    }), upsCharts);
    initChart(el.querySelector('[data-chart="volt"]'), Object.assign({}, common, {
      grid: { left: 56, right: 24, top: 24, bottom: 24 },
      tooltip: { trigger: 'axis', valueFormatter: x => (x === null || x === undefined ? '—' : Number(x).toFixed(1) + ' V') },
      yAxis: { type: 'value', min: 180, max: 260, axisLabel: { color: P.muted, formatter: '{value} V' }, splitLine: { lineStyle: { color: P.grid } } },
      series: v.inputs.map((i, k) => ({ name: 'Giriş-' + i.n + ' faz-1', type: 'line', showSymbol: false, connectNulls: false, data: i.volt.map(p => [p[0], p[1] < 180 ? 180 : p[1]]), lineStyle: { width: 1.25, color: INPUT_COLOR[k] }, itemStyle: { color: INPUT_COLOR[k] },
        markArea: { silent: true, data: k === 0 ? [[{ yAxis: 200, itemStyle: { color: 'rgba(22, 163, 74, 0.06)' } }, { yAxis: 255 }]] : [] } }))
    }), upsCharts);
  }

  function placeOverlay() {
    const ov = document.getElementById('ca-ov');
    const planEl = document.getElementById('ca-plan');
    const h = Math.max(520, window.innerHeight - 140);
    planEl.style.height = h + 'px';
    ov.style.setProperty('--ca-ov-top', (planEl.offsetTop + 8) + 'px');
    ov.style.setProperty('--ca-ov-h', Math.max(320, h - 16) + 'px');
  }

  function renderPanels() {
    document.getElementById('ca-hint').classList.toggle('hidden', !!(state.cabId || state.upsLabel));
    renderDetail();
    renderEvents();
    renderUps();
    placeOverlay();
  }

  // ---------------------------------------------------------------------------
  // PDF raporu (page-report): KPI + 3D kat planı görüntüsü + izlenecek kabinler / UPS / olaylar
  // ---------------------------------------------------------------------------
  function exportReport(req) {
    const live = state.mapMode === 'live';
    const all = cabins;
    const count = f => all.filter(f).length;
    const anomalies = count(c => c.anomaly), persistent = count(c => !!persistentOf(c)), warnUp = count(c => c.level === 'warn' || c.level === 'alarm');
    const lost = count(c => c.level === 'lost'), trend = count(c => !!trendOf(c)), upsAnm = ups.filter(u => u.anomaly).length;
    const watched = all.filter(c => c.anomaly || !!persistentOf(c) || !!trendOf(c) || c.level === 'warn' || c.level === 'alarm')
      .sort((a, b) => Number(b.anomaly) - Number(a.anomaly) || (b.max === null ? -Infinity : b.max) - (a.max === null ? -Infinity : a.max));
    const snap = floor3d ? floor3d.snapshot() : null;
    const kpis = [
      { label: 'Kabin', value: all.length },
      { label: 'Anomali', value: anomalies, tone: anomalies ? 'alarm' : 'normal' },
      { label: 'Kalıcı çelişki', value: persistent, tone: persistent ? 'warning' : 'normal' },
      { label: 'Uyarı üstü', value: warnUp, tone: warnUp ? 'warning' : 'normal' },
      { label: live ? 'Haberleşmeyen' : 'Veri yok', value: lost, tone: lost ? 'lost' : 'normal' }
    ];
    if (live) kpis.push({ label: 'Hızlı hareket', value: trend, tone: trend ? 'warning' : 'normal' });
    if (ups.length) kpis.push({ label: 'UPS anomalisi', value: upsAnm, hint: ups.length + ' UPS', tone: upsAnm ? 'alarm' : 'normal' });
    const sections = [{
      title: 'İzlenecek kabinler', toneKey: '_tone',
      columns: [{ key: 'cab', label: 'Kabin' }, { key: 'pod', label: 'POD' }, { key: 'val', label: live ? 'Değer' : 'En yüksek', align: 'right' }, { key: 'lvl', label: 'Seviye' }, { key: 'anm', label: 'Anomali' }, { key: 'kc', label: 'Kalıcı çelişki' }]
        .concat(live ? [{ key: 'tr', label: 'Hızlı hareket' }] : []),
      rows: watched.map(c => ({
        cab: c.cab, pod: c.pod, val: fmtVal(c.max), lvl: c.level === 'lost' ? 'Veri yok' : LEVEL_LABEL[c.level], anm: c.anomaly ? (anmTypeLabel(c.anmTyp) || 'Anomali') : '—',
        kc: persistentText(persistentOf(c)) || '—', tr: trendText(c) || '—',
        _tone: c.anomaly ? 'acil' : c.level === 'alarm' ? 'alarm' : c.level === 'warn' || persistentOf(c) || trendOf(c) ? 'warning' : ''
      }))
    }];
    if (ups.length) {
      sections.push({
        title: 'UPS', toneKey: '_tone',
        columns: [{ key: 'u', label: 'UPS' }, { key: 'd', label: 'Cihaz' }, { key: 's', label: 'Durum' }, { key: 'e', label: 'Olay' }],
        rows: ups.map(u => ({ u: u.label, d: u.devId, s: u.anomaly ? 'Anomali' : u.info ? 'Bilgi' : u.lost ? 'Veri yok' : 'Normal', e: upsTypeLabel(u.typ) || '—', _tone: u.anomaly ? 'acil' : u.info ? 'info' : u.lost ? 'lost' : '' }))
      });
    }
    const sel = cabin();
    if (sel) {
      const h = hist || A.cabinHistory(state.floorId, sel.cab, rangeStart(), rangeEnd());
      sections.push({
        title: 'Anomali Olayları · ' + sel.cab + ' (' + upsRange() + ')', toneKey: '_tone',
        columns: [{ key: 's', label: 'Başlangıç' }, { key: 'e', label: 'Bitiş' }, { key: 'p', label: 'Sensör' }, { key: 't', label: 'Tür' }, { key: 'pk', label: 'Tepe', align: 'right' }, { key: 'b', label: 'Referans', align: 'right' }, { key: 'z', label: 'z', align: 'right' }, { key: 'x', label: 'Bağlam' }],
        rows: h.episodes.map(e => ({ s: dmyhm(e.start), e: e.end ? dmyhm(e.end) : 'Sürüyor', p: SENSOR[e.pos] + ' ' + e.rid, t: anmTypeLabel(e.typ), pk: fmtSensor(e.peakValue, e.pos), b: fmtSensor(e.baseline, e.pos), z: n1(e.peakZ), x: CTX_LABEL[e.ctx] || '—', _tone: 'acil' }))
      });
    }
    DCIM.report.generate({
      title: 'Kabin Anomali',
      subtitle: floor().name + ' · ' + (live ? 'Canlı değerler (' + ui.fmtDateTime(state.liveAt) + ')' : 'Geçmiş: ' + upsRange() + ' aralığının en yüksek değerleri ve olayları') + (state.search.trim() ? ' · Ekrandaki arama: "' + state.search.trim() + '"' : ''),
      filename: 'Kabin_Anomali_' + state.floorId,
      kpis,
      images: snap ? [{ src: snap.src, caption: 'Kat Planı · ' + floor().name + ' — ekrandaki kamera açısıyla alındı.' }] : [],
      sections,
      notes: snap ? [] : ['Kat planı görüntüsü alınamadı.']
    }, req.format || 'pdf');
  }

  // ---------------------------------------------------------------------------
  // Başlangıç
  // ---------------------------------------------------------------------------
  DCIM.shell.setPageReport({ scopes: [{ id: 'floor', label: 'Açık kat' }], formats: ['pdf'], export: exportReport });
  renderControls();
  refreshCabins();
  buildPlan();
  const search = document.getElementById('ca-search');
  search.value = state.search;
  search.addEventListener('input', () => { state.search = search.value; pushPlan(false); });
  placeOverlay();
  try {
    if (!THREE || !THREE.WebGLRenderer) throw new Error('three yok');
    floor3d = createFloor3D(document.getElementById('ca-3d'), document.getElementById('ca-canvas'), { onHover, onClick });
    pushPlan(true);
  } catch (e) {
    console.warn('[Kabin anomali] 3D kat planı açılamadı', e);
    document.getElementById('ca-3d').innerHTML = '<div class="flex h-full items-center justify-center text-xs text-slate-500">Kat planı yüklenemedi (WebGL).</div>';
  }
  renderNav();
  const qc = q.get('cabinet'), qu = q.get('ups');
  if (qc && cabins.some(c => c.cab === qc)) { state.cabId = qc; pushPlan(false); if (floor3d) floor3d.focus('cab:' + (plan.cabs.find(g => g.label === qc) || {}).id, 7); }
  else if (qu && ups.some(u => u.label === qu)) { state.upsLabel = qu; pushPlan(false); }
  renderPanels();
  window.addEventListener('resize', () => { placeOverlay(); charts.concat(upsCharts).forEach(c => c.resize()); });
  document.addEventListener('dcim:theme', () => { if (floor3d) pushPlan(true); renderPanels(); });
})();
