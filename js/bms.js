/* ==========================================================================
   DCIM Sunum — BMS · Bina Yönetimi (BmsShowcaseComponent, route /dcim/showcase/bms)
   Kompozisyon (bms-showcase.component.html ile aynı):
     .bms-head   : "Canlı · AyXDB" satırı + başlık · KPI şeridi (Acil/Alarm/Uyarı/Veri yok, Görülmemiş, PUE,
                   BT / Soğutma, KAT-1 ekipman) · PMS'e geç · Veri kaynakları · Görünüm ayarları (dişli)
     .stage      : Babylon.js 3D bina ikizi (Veri Merkezi Ana Bina: KAT-1/KAT-2/KAT-3 + IDC4 Ek Bina) · bina etiketleri ·
                   kat rozetleri · alarm etiketleri (tag3d) · kat seçici (KAT-1…IDC4, Bina) · lejant · kat görünümü çipi ·
                   seçili ekipman kartı (Tek hatta göster (PMS)) · PMS'ten geliş bandı · ayarlar / veri kaynakları pencereleri
     .alarms     : Aktif alarmlar (Tümü/Canlı/kat süzgeci, kategori çipleri, Gördüm, Tek hatta göster (PMS))
     .bottom     : Standart uyumu (5 kart) / Katlar sekmeleri
   Veri: KAT-1 "canlı" = gerçek Kat-1 yerleşimi (js/layout-data.js) + DCIM.data (kabin/ekipman durumu, activeAlarms,
   energy) → sunumun diğer sayfalarıyla aynı senaryo. KAT-2, KAT-3, IDC4 = yaklaşık yerleşim + tohumlu demo alarmları
   (js/mock/bms.data.js), 6-8 sn'de değişir. PUE/BT/soğutma 3 sn, KAT-1 sıcaklıkları 5 sn'de tohumlu gürültüyle güncellenir.
   "Gördüm" yalnız bellekte işaretler. WebGL yoksa sahne yerine bilgi mesajı gösterilir; panel ve kartlar çalışır.
   Etkileşim: kat rozeti/seçici → kat görünümü (üst katlar gizlenir), alarm → ekipmana uçuş + odak halkası,
   ekipmana çift tık → uçuş + seçim kartı, Esc → binaya dön.
   Giden bağlantılar:
     PMS'e geç                    → pms.html?from=bms
     Tek hatta göster (PMS)       → pms.html?view=single-line&alarm=<rid>&dev=<devId>&from=bms
     Seçim kartı (yalnız KAT-1)   → 2d.html?cabinet=X | 3d.html?cabinet=X | cabinet-detail.html?cabinet=X
                                    (klima/UPS/pano: 2d.html?focus=<etiket>, 3d.html?focus=<etiket>)
     Alarm paneli başlığı         → alarms.html
   Derin bağlantılar (orijinal URL sözleşmesi: BMS ?floor&dev&cab&alarm&from):
     ?floor=KAT-1|KAT-2|KAT-3|IDC4           (kat görünümü)
     ?cab=1BJ53                              (KAT-1 kabinine uçuş; floor ile birlikte de verilebilir)
     ?alarm=<rid|AA-xxxx>                    (ör. alarm=KAT1_SAL1_A5_UPS_MODE → UPS A5'e uçuş)
     ?dev=<devId|etiket>                     (ör. dev=KAT1_SAL1_A5_UPS, dev=IDC1_KLM109_DV, dev=UPS%20B7)
     ?from=pms                               ("PMS'ten geldiniz" bandı)
     ?theme=light|dark                       (sunum yardımcısı: temayı kaydetmeden uygular)
   Öncelik (orijinal tryNav): alarm → cab → dev → floor; bulunamazsa "fiziksel konumu tanımlı değil" bandı.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, storage } = DCIM.ui;
  const D = DCIM.data;
  const B = D.bms;
  DCIM.shell.init({ active: 'bms' });

  const params = new URLSearchParams(window.location.search);
  const themeParam = params.get('theme');
  if (themeParam === 'light' || themeParam === 'dark') DCIM.theme.apply(themeParam);

  const BJ = window.BABYLON || {};
  const {
    Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Matrix, Quaternion, Color3, Color4,
    CreateBox, CreateCylinder, CreateTorus, CreateGround, CreateLineSystem, Mesh, TransformNode, StandardMaterial, GlowLayer
  } = BJ;

  // ---------------------------------------------------------------------------
  // Önem (alarm-severity.util.ts) ve görünüm sabitleri
  // ---------------------------------------------------------------------------
  const SEVERITY_COLOR = { acil: '#7E22CE', alarm: '#DC2626', uyari: '#D97706', kayip: '#EA580C', normal: '#16A34A' };
  const SEV_LABEL = { acil: 'Acil', alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Veri yok', normal: 'Normal' };
  /** Şekil kodlaması: Acil sekizgen, Alarm üçgen, Uyarı eşkenar dörtgen. */
  const SEV_SHAPE = { acil: 'oct', alarm: 'tri', uyari: 'dia', kayip: 'dot', normal: 'dot' };
  const LEGEND_SEVS = ['acil', 'alarm', 'uyari', 'kayip', 'normal'];
  const severityRank = s => (s === 'acil' ? 4 : s === 'alarm' ? 3 : s === 'kayip' ? 2 : s === 'uyari' ? 1 : 0);

  const SITE = B.SITE;
  const ALARM_CATS = B.ALARM_CATS;
  const KIND_LABEL = { cabinet: 'Kabin', climate: 'Klima', ups: 'UPS', panel: 'Pano' };
  /** SCH ekipman durumu (alarm değil) hangi çipte görünür: klima panosu soğutmadır. */
  const KIND_CAT = { cabinet: 'it', climate: 'hvac', ups: 'power', panel: 'hvac' };
  const CAT_STORE_KEY = 'bms_showcase_alarm_cats';
  const BAND_MS = 6000;

  // Sahne sabitleri (1 birim = 1 SCH grid hücresi)
  const FH = 6;            // kat yüksekliği
  const SLAB = 0.5;        // döşeme kalınlığı
  const WALL_T = 0.7;      // dış duvar kalınlığı
  const PARAPET = 1.3;     // pencere altı
  const GLASS_H = 2.6;     // pencere bandı
  const EXPLODE = 9;       // katları ayır: kat başına ek yükseklik
  const MARGIN = 3;        // kat salonu ile dış duvar arası
  const BLDG_GAP = 10;     // ana bina ile IDC4 arası
  const ITEM_H = { cabinet: 3.3, climate: 3.1, ups: 2.6, panel: 3 };
  const KINDS = ['cabinet', 'climate', 'ups', 'panel'];
  /** Normal durumda nötr tonlar (ISA-101: yalnız anormal durum renklidir). */
  const NEUTRAL = { cabinet: [0.30, 0.34, 0.42], climate: [0.42, 0.50, 0.58], ups: [0.44, 0.44, 0.52], panel: [0.50, 0.52, 0.58] };

  // ---------------------------------------------------------------------------
  // Alarm kategorisi (vitrin kuralı: showAlarmCategory)
  // ---------------------------------------------------------------------------
  /** Aksan ve büyük/küçük harf duyarsız metin ("Kapısı" = "kapisi"). */
  function foldTr(s) {
    return String(s == null ? '' : s).toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  }
  const SAFETY_RE = new RegExp('(^|[^a-z0-9])(' + B.ALARM_CAT_RULE.safetyKeywords.map(k => foldTr(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
  function showAlarmCategory(grp, texts) {
    const g = foldTr(grp).trim();
    if (B.ALARM_CAT_RULE.safetyGroups.indexOf(g) >= 0) return 'safety';
    if (SAFETY_RE.test(texts.map(t => foldTr(String(t == null ? '' : t))).join(' | '))) return 'safety';
    return B.ALARM_CAT_RULE.groups[g] || null;
  }

  const pad = n => String(n).padStart(2, '0');
  const hhmm = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const hhmmss = ts => { const d = new Date(ts); return hhmm(ts) + ':' + pad(d.getSeconds()); };
  const fmt = (v, digits) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits == null ? 1 : digits));

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  function loadCats() {
    try {
      const v = JSON.parse(storage.get(CAT_STORE_KEY) || '[]');
      const ids = ALARM_CATS.map(c => c.id);
      return Array.isArray(v) ? v.filter(x => ids.indexOf(x) >= 0) : [];
    } catch (e) {
      return [];
    }
  }

  const S = {
    isLight: !document.documentElement.classList.contains('dark'),
    webglError: '',
    connected: true,
    showSettings: false,
    showSources: false,
    facadeOpacity: 45,
    exploded: false,
    autoRotate: true,
    showLabels: true,
    isolatedFloorId: null,
    focusedAlarmId: null,
    alarmFilter: 'all',
    catSel: new Set(loadCats()),
    catChips: ALARM_CATS.map(c => Object.assign({}, c, { n: 0 })),
    catAllCount: 0,
    selItem: null,
    navBand: null,
    stdTab: 'std',
    floorsView: [],
    alarmsView: [],
    kpi: { live: zeroKpi(), demo: zeroKpi() },
    pue: null, itKw: null, coolKw: null,
    kat1Counts: { cabinet: 0, climate: 0, ups: 0, panel: 0 },
    kat1State: 'Canlı',
    lastUpdate: '',
    stdCards: []
  };
  function zeroKpi() { return { acil: 0, alarm: 0, uyari: 0, kayip: 0, total: 0, unack: 0 }; }

  // Sahne
  let engine = null, scene = null, camera = null, glow = null, hemi = null, sun = null, groundMat = null, gridLines = null;
  const sunDarkIntensity = 0.6;
  const mats = {};
  const sevMats = new Map();
  let ring = null, beam = null, focusTarget = null, camTween = null, homePose = null, lastInteract = 0;
  let cssW = 1, cssH = 1;
  const badgeEls = new Map(), labelEls = new Map(), tagEls = new Map();
  let tagList = [];
  let bandTimer = null;

  // Veri
  let realAlarms = [];
  const demoAlarms = new Map();
  const ackedIds = new Set();
  let demoSeq = 0;
  const demoRng = D.rng(B.DEMO_SEED);
  let envTemps = [], envHums = [];
  let energyTick = 0;
  const KAT1_SRC = B.kat1Alarms();

  // ---------------------------------------------------------------------------
  // Bina / kat modeli (sahneden bağımsız: WebGL yoksa da alarm eşleşmesi ve gezinme çalışır)
  // ---------------------------------------------------------------------------
  const buildings = [];
  const floors = [];
  (function buildModel() {
    let cursorX = 0;
    SITE.buildings.forEach((bc, bi) => {
      let W = 0, Dp = 0;
      bc.floors.forEach(f => { W = Math.max(W, f.mock.x1 - f.mock.x0); Dp = Math.max(Dp, f.mock.y1 - f.mock.y0); });
      W += MARGIN * 2; Dp += MARGIN * 2;
      const ox = bi === 0 ? 0 : cursorX + BLDG_GAP + W / 2;
      if (bi === 0) cursorX = W / 2;
      const oz = bi === 0 ? 0 : -(buildings[0].D - Dp) / 2; // ön cepheler hizalı
      const b = { cfg: bc, W, D: Dp, ox, oz, node: null, roof: null, roofY: (Math.max.apply(null, bc.floors.map(f => f.level)) + 1) * FH };
      buildings.push(b);
      bc.floors.forEach(fc => {
        const f = {
          cfg: fc, b, layout: null, node: null, content: null, hidden: false,
          curY: fc.level * FH, targetY: fc.level * FH,
          kinds: {}, kindItems: {}, itemIndex: new Map(), cabIndex: new Map(), labelIndex: new Map(), devStems: [],
          statusSev: new Map(), overlay: null, shellMeshes: []
        };
        f.layout = fc.live ? B.kat1Layout() : B.mockLayout(fc.mock, bc.id === 'IDC4' ? 4 : fc.level + 1);
        if (fc.live) f.statusSev = B.kat1Status();
        indexFloor(f);
        floors.push(f);
      });
      cursorX = Math.max(cursorX, ox + W / 2);
    });
  })();

  function indexFloor(f) {
    f.itemIndex.clear(); f.cabIndex.clear(); f.labelIndex.clear(); f.devStems = []; f.kindItems = {};
    KINDS.forEach(kind => {
      const items = f.layout.items.filter(i => i.kind === kind);
      f.kindItems[kind] = items;
      items.forEach((it, idx) => {
        f.itemIndex.set(it.key, { kind, idx, item: it });
        if (it.label) f.labelIndex.set(it.label.toUpperCase(), it.key);
        if (kind === 'cabinet') {
          [it.label, it.devId].forEach(v => { const n = B.normCab(v); if (n && !f.cabIndex.has(n)) f.cabIndex.set(n, it.key); });
        } else {
          const stem = String(it.devId || '').toUpperCase().replace(/_DV$/, '');
          if (stem.length >= 3) f.devStems.push({ stem, key: it.key });
        }
      });
    });
    f.devStems.sort((a, b) => b.stem.length - a.stem.length);
  }

  const floorById = id => floors.find(f => f.cfg.id === id) || null;
  const floorName = id => { const f = floorById(id); return f ? f.cfg.name : ''; };
  const kat1 = floors.find(f => f.cfg.live);
  S.kat1Counts = {
    cabinet: kat1.kindItems.cabinet.length, climate: kat1.kindItems.climate.length,
    ups: kat1.kindItems.ups.length, panel: kat1.kindItems.panel.length
  };
  S.floorsView = floors.map(f => ({
    id: f.cfg.id, name: f.cfg.name, building: f.b.cfg.name, sev: 'normal', live: 0, demo: 0, isLive: f.cfg.live,
    source: f.cfg.live ? 'SCH canlı' : 'yaklaşık'
  }));

  // ---------------------------------------------------------------------------
  // DOM iskeleti
  // ---------------------------------------------------------------------------
  const root = document.getElementById('bms-root');
  const GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  root.innerHTML =
    '<header class="bms-head">' +
      '<div class="bms-title">' +
        '<div class="bms-eyebrow" data-r="eyebrow"></div>' +
        '<h1>' + esc(SITE.title) + '</h1>' +
        '<p>' + esc(SITE.subtitle) + '</p>' +
      '</div>' +
      '<div class="kpis" data-r="kpis"></div>' +
      '<div class="head-actions">' +
        '<button type="button" class="btn" data-act="pms" title="Güç yönetimi (PMS) tek hat görünümü"><i class="pi pi-bolt" aria-hidden="true"></i>PMS\'e geç</button>' +
        '<button type="button" class="btn" data-act="sources">Veri kaynakları</button>' +
        '<button type="button" class="btn icon" data-act="settings" title="Görünüm ayarları">' + GEAR + '</button>' +
      '</div>' +
    '</header>' +
    '<div class="bms-body">' +
      '<div class="stage" data-r="stage">' +
        '<canvas class="scene-canvas" data-r="canvas" aria-label="Bina 3D görünümü"></canvas>' +
        '<div data-r="webgl"></div>' +
        '<div class="overlay" data-r="overlay">' +
          SITE.buildings.map(b => '<div class="b-label" data-blabel="' + esc(b.id) + '"><span>' + esc(b.name) + '</span></div>').join('') +
          S.floorsView.map(f => '<button type="button" class="f-badge" data-badge="' + esc(f.id) + '" data-act="floor" data-id="' + esc(f.id) + '"></button>').join('') +
          '<div class="tag-layer" data-r="tags"></div>' +
        '</div>' +
        '<div data-r="band"></div>' +
        '<div data-r="sel"></div>' +
        '<div data-r="iso"></div>' +
        '<div class="floor-nav" data-r="fnav"></div>' +
        '<div class="legend">' +
          LEGEND_SEVS.map(s => '<span class="lg" style="--c:' + SEVERITY_COLOR[s] + '"><i class="shape ' + SEV_SHAPE[s] + '"></i>' + esc(SEV_LABEL[s]) + '</span>').join('') +
          '<span class="lg-note">Normal ekipman nötr gri (ISA-101); parlama yalnız Acil/Alarm</span>' +
        '</div>' +
        '<div data-r="pop"></div>' +
      '</div>' +
      '<aside class="alarms">' +
        '<div class="al-head" data-r="alhead"></div>' +
        '<div class="al-filter" data-r="alfilter"></div>' +
        '<div class="al-cats" data-r="alcats" role="group" aria-label="Alarm kategorileri"></div>' +
        '<div class="al-list" data-r="allist"></div>' +
      '</aside>' +
    '</div>' +
    '<section class="bottom" data-r="bottom"></section>';

  const R = {};
  root.querySelectorAll('[data-r]').forEach(el => { R[el.getAttribute('data-r')] = el; });
  root.querySelectorAll('[data-badge]').forEach(el => badgeEls.set(el.getAttribute('data-badge'), el));
  root.querySelectorAll('[data-blabel]').forEach(el => labelEls.set(el.getAttribute('data-blabel'), el));

  // ---------------------------------------------------------------------------
  // Sahne kurulumu
  // ---------------------------------------------------------------------------
  function initScene() {
    if (!Engine) throw new Error('Babylon.js paketi yüklenemedi');
    const canvas = R.canvas;
    const eng = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false, antialias: true, powerPreference: 'high-performance' }, false);
    eng.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));
    engine = eng;

    const sc = new Scene(eng);
    scene = sc;
    sc.clearColor = new Color4(0, 0, 0, 0);
    sc.skipPointerMovePicking = true;
    // Ekipman seçimi yalnız çift tıkta elle yapılır (scene.pick); sahnenin otomatik pick'i kapalı
    sc.skipPointerDownPicking = true;
    sc.skipPointerUpPicking = true;
    sc.fogMode = Scene.FOGMODE_EXP2;
    sc.fogDensity = 0.0028;

    buildBuildings();

    const ext = siteExtent();
    homePose = {
      alpha: -Math.PI / 2 - 0.62, beta: 1.05, radius: Math.max(100, ext.span * 1.05),
      target: new Vector3(ext.cx, FH * 1.1, ext.cz)
    };
    const cam = new ArcRotateCamera('cam', homePose.alpha, homePose.beta, homePose.radius, homePose.target.clone(), sc);
    cam.lowerRadiusLimit = 8;
    cam.upperRadiusLimit = 420;
    cam.lowerBetaLimit = 0.12;
    cam.upperBetaLimit = Math.PI / 2 - 0.05;
    cam.wheelDeltaPercentage = 0.01;
    cam.panningSensibility = 60;
    cam.inertia = 0.88;
    cam.minZ = 0.5;
    cam.maxZ = 2000;
    cam.useInputToRestoreState = false; // çift tık ekipmana uçuş içindir, kamerayı sıfırlamaz
    cam.attachControl(canvas, true);
    camera = cam;

    hemi = new HemisphericLight('hemi', new Vector3(0.2, 1, -0.3), sc);
    hemi.intensity = 0.85;
    sun = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.4), sc);
    sun.intensity = sunDarkIntensity;

    // Zemin, ince ızgara
    const ground = CreateGround('ground', { width: 1200, height: 1200 }, sc);
    ground.position.y = -0.05;
    const gm = new StandardMaterial('groundMat', sc);
    gm.specularColor = Color3.Black();
    ground.material = gm;
    ground.isPickable = false;
    ground.freezeWorldMatrix();
    groundMat = gm;

    const lines = [];
    const Rg = 160, step = 4;
    for (let v = -Rg; v <= Rg; v += step) {
      lines.push([new Vector3(ext.cx - Rg, 0.01, ext.cz + v), new Vector3(ext.cx + Rg, 0.01, ext.cz + v)]);
      lines.push([new Vector3(ext.cx + v, 0.01, ext.cz - Rg), new Vector3(ext.cx + v, 0.01, ext.cz + Rg)]);
    }
    const grid = CreateLineSystem('grid', { lines }, sc);
    grid.isPickable = false;
    grid.alpha = 0.18;
    grid.freezeWorldMatrix();
    gridLines = grid;

    // Odak halkası ve ışık sütunu (yalnız seçili öğede)
    ring = CreateTorus('focusRing', { diameter: 1, thickness: 0.08, tessellation: 48 }, sc);
    const rm = new StandardMaterial('ringMat', sc);
    rm.disableLighting = true;
    rm.emissiveColor = Color3.FromHexString('#38bdf8');
    ring.material = rm;
    ring.isPickable = false;
    ring.setEnabled(false);
    beam = CreateCylinder('beam', { height: 1, diameterTop: 0.5, diameterBottom: 1.4, tessellation: 24, cap: Mesh.NO_CAP }, sc);
    const bm = new StandardMaterial('beamMat', sc);
    bm.disableLighting = true;
    bm.emissiveColor = Color3.FromHexString('#38bdf8');
    bm.alpha = 0.22;
    bm.backFaceCulling = false;
    beam.material = bm;
    beam.isPickable = false;
    beam.setEnabled(false);

    glow = new GlowLayer('glow', sc, { mainTextureSamples: 2, blurKernelSize: 32 });
    glow.intensity = 0.85;
    glow.addIncludedOnlyMesh(ring);
    glow.addIncludedOnlyMesh(beam);

    floors.forEach(f => buildFloorContent(f));

    applyTheme();
    applyFacade();

    // Kullanıcı etkileşimi otomatik dönüşü ve uçuşu durdurur
    const onInteract = () => { lastInteract = performance.now(); camTween = null; };
    ['pointerdown', 'wheel'].forEach(n => canvas.addEventListener(n, onInteract, { passive: true }));
    canvas.addEventListener('dblclick', onCanvasDblClick);

    const ro = new ResizeObserver(() => {
      cssW = canvas.clientWidth || 1;
      cssH = canvas.clientHeight || 1;
      eng.resize();
    });
    ro.observe(R.stage);
    cssW = canvas.clientWidth || 1;
    cssH = canvas.clientHeight || 1;

    let last = performance.now();
    eng.runRenderLoop(() => {
      const now = performance.now();
      const dt = Math.min(64, now - last);
      last = now;
      tick(now, dt);
      sc.render();
      positionOverlays();
    });
  }

  function mat(name, hex, opts) {
    opts = opts || {};
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    const sp = opts.spec == null ? 0.05 : opts.spec;
    m.specularColor = new Color3(sp, sp, sp);
    if (opts.emissive) m.emissiveColor = Color3.FromHexString(opts.emissive);
    if (opts.alpha !== undefined) m.alpha = opts.alpha;
    mats[name] = m;
    return m;
  }

  /** Bina zarfları: kat boyutlarının en büyüğü + pay. Ana bina solda, IDC4 sağda (doğu). */
  function buildBuildings() {
    mat('slab', '#9aa3ad');
    mat('raised', '#2a3340');
    mat('facade', '#c9ced6', { alpha: 1 });
    mat('spandrel', '#8d96a3', { alpha: 1 });
    mat('glass', '#5aa9e6', { alpha: 0.4, spec: 0.6, emissive: '#0b2a44' });
    mat('mullion', '#4b5563', { alpha: 1 });
    mat('roof', '#6b7280', { alpha: 1 });
    mat('rooftop', '#9ca3af');
    mat('pave', '#3a4350');
    mat('shadow', '#000000', { alpha: 0.35 });
    mat('door', '#1f2937', { emissive: '#0ea5e9' });
    mat('canopy', '#e5e7eb');
    mat('iwall', '#64748b');
    mats.shadow.disableLighting = true;
    mats.door.emissiveColor = Color3.FromHexString('#0c4a6e');
    KINDS.forEach(k => {
      const m = mat('eq_' + k, '#ffffff', { spec: 0.12 });
      m.emissiveColor = new Color3(0.06, 0.07, 0.09);
    });
    ['acil', 'alarm', 'uyari', 'kayip'].forEach(s => {
      const m = new StandardMaterial('sev_' + s, scene);
      m.disableLighting = true;
      m.emissiveColor = Color3.FromHexString(SEVERITY_COLOR[s]);
      m.alpha = 0.55;
      sevMats.set(s, m);
    });

    buildings.forEach(b => {
      const node = new TransformNode('b_' + b.cfg.id, scene);
      node.position.set(b.ox, 0, b.oz);
      const roof = new TransformNode('roof_' + b.cfg.id, scene);
      roof.parent = node;
      b.node = node;
      b.roof = roof;
      buildSite(b);
      floors.filter(f => f.b === b).forEach(f => {
        const fnode = new TransformNode('f_' + f.cfg.id, scene);
        fnode.parent = node;
        fnode.position.y = f.cfg.level * FH;
        const content = new TransformNode('fc_' + f.cfg.id, scene);
        content.parent = fnode;
        f.node = fnode;
        f.content = content;
        buildShell(f);
      });
      buildRoof(b);
    });

    // Ana bina ile IDC4 arası kapalı bağlantı koridoru
    if (buildings.length > 1) {
      const a = buildings[0], c = buildings[1];
      const x0 = a.ox + a.W / 2, x1 = c.ox - c.W / 2;
      const link = CreateBox('link', { width: x1 - x0, height: 3.4, depth: 5 }, scene);
      link.position.set((x0 + x1) / 2, SLAB + 1.7, c.oz + c.D / 2 - 8);
      link.material = mats.spandrel;
      link.isPickable = false;
      link.freezeWorldMatrix();
      const lg = CreateBox('linkGlass', { width: x1 - x0, height: 1.4, depth: 5.1 }, scene);
      lg.position.copyFrom(link.position);
      lg.position.y += 0.3;
      lg.material = mats.glass;
      lg.isPickable = false;
      lg.freezeWorldMatrix();
    }
  }

  /** Bina altı: kaldırım, temas gölgesi, giriş yolu. */
  function buildSite(b) {
    const sh = CreateBox('shadow_' + b.cfg.id, { width: b.W + 5, height: 0.02, depth: b.D + 5 }, scene);
    sh.position.set(b.ox + 1.2, 0.0, b.oz + 1.2);
    sh.material = mats.shadow;
    const pave = CreateBox('pave_' + b.cfg.id, { width: b.W + 10, height: 0.06, depth: b.D + 10 }, scene);
    pave.position.set(b.ox, -0.02, b.oz);
    pave.material = mats.pave;
    const path = CreateBox('path_' + b.cfg.id, { width: 6, height: 0.08, depth: 26 }, scene);
    path.position.set(b.ox, 0, b.oz - b.D / 2 - 13);
    path.material = mats.pave;
    [sh, pave, path].forEach(m => { m.isPickable = false; m.freezeWorldMatrix(); });
  }

  /** Bir katın kabuğu: döşeme, yükseltilmiş taban, dış duvar (parapet + cam bandı + kuşak), dikmeler, giriş. */
  function buildShell(f) {
    const W = f.b.W, Dp = f.b.D;
    const unit = (name, matName, list) => {
      const m = CreateBox(name, { size: 1 }, scene);
      m.parent = f.node;
      m.material = mats[matName];
      m.isPickable = false;
      const buf = new Float32Array(list.length * 16);
      list.forEach((mx, i) => mx.copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, true);
      f.shellMeshes.push(m);
      return m;
    };
    const box = (w, h, d, x, y, z) => Matrix.Compose(new Vector3(w, h, d), Quaternion.Identity(), new Vector3(x, y, z));

    // Döşeme (katlar arası) ve yükseltilmiş taban
    unit('slab_' + f.cfg.id, 'slab', [box(W + 0.6, SLAB, Dp + 0.6, 0, SLAB / 2, 0)]);
    unit('raised_' + f.cfg.id, 'raised', [box(W - WALL_T * 2, 0.08, Dp - WALL_T * 2, 0, SLAB + 0.04, 0)]);

    const wallH = FH - SLAB;
    const spandH = wallH - PARAPET - GLASS_H;
    const y0 = SLAB;
    const sides = [
      { len: W, x: 0, z: -Dp / 2 + WALL_T / 2, alongX: true },
      { len: W, x: 0, z: Dp / 2 - WALL_T / 2, alongX: true },
      { len: Dp - WALL_T * 2, x: -W / 2 + WALL_T / 2, z: 0, alongX: false },
      { len: Dp - WALL_T * 2, x: W / 2 - WALL_T / 2, z: 0, alongX: false }
    ];
    const solid = [], span = [], glass = [], mull = [];
    sides.forEach((s, si) => {
      const sx = s.alongX ? s.len : WALL_T, sz = s.alongX ? WALL_T : s.len;
      solid.push(box(sx, PARAPET, sz, s.x, y0 + PARAPET / 2, s.z));
      span.push(box(s.alongX ? s.len : WALL_T * 1.05, spandH, s.alongX ? WALL_T * 1.05 : s.len, s.x, y0 + PARAPET + GLASS_H + spandH / 2, s.z));
      glass.push(box(s.alongX ? s.len : WALL_T * 0.4, GLASS_H, s.alongX ? WALL_T * 0.4 : s.len, s.x, y0 + PARAPET + GLASS_H / 2, s.z));
      const n = Math.floor(s.len / 3.2);
      for (let i = 1; i < n; i++) {
        const t = -s.len / 2 + (i * s.len) / n;
        mull.push(box(s.alongX ? 0.18 : WALL_T * 0.9, GLASS_H, s.alongX ? WALL_T * 0.9 : 0.18,
          s.alongX ? s.x + t : s.x, y0 + PARAPET + GLASS_H / 2, s.alongX ? s.z : s.z + t));
      }
      // Köşe kolonları
      if (si < 2) [-1, 1].forEach(k => solid.push(box(1.1, wallH, 1.1, k * (W / 2 - 0.55), y0 + wallH / 2, s.z)));
    });
    unit('wall_' + f.cfg.id, 'facade', solid);
    unit('spand_' + f.cfg.id, 'spandrel', span);
    unit('glass_' + f.cfg.id, 'glass', glass);
    unit('mull_' + f.cfg.id, 'mullion', mull);

    if (f.cfg.level === 0) {
      // Bina girişi (güney cephe): saçak, iki taşıyıcı, cam kapı
      const zf = -Dp / 2;
      unit('canopy_' + f.cfg.id, 'canopy', [
        box(10, 0.35, 4.5, 0, 3.9, zf - 2.1),
        box(0.35, 3.8, 0.35, -4.6, 1.9, zf - 4),
        box(0.35, 3.8, 0.35, 4.6, 1.9, zf - 4)
      ]);
      unit('door_' + f.cfg.id, 'door', [box(5, 3.2, WALL_T * 1.2, 0, SLAB + 1.6, zf + WALL_T / 2)]);
    }
  }

  function buildRoof(b) {
    b.roof.position.y = b.roofY;
    const mk = (name, matName, w, h, d, x, y, z) => {
      const m = CreateBox(name, { width: w, height: h, depth: d }, scene);
      m.parent = b.roof;
      m.position.set(x, y, z);
      m.material = mats[matName];
      m.isPickable = false;
      return m;
    };
    mk('roofSlab_' + b.cfg.id, 'roof', b.W + 0.8, 0.5, b.D + 0.8, 0, 0.25, 0);
    mk('par1_' + b.cfg.id, 'facade', b.W + 0.8, 0.9, 0.4, 0, 0.9, -b.D / 2 - 0.2);
    mk('par2_' + b.cfg.id, 'facade', b.W + 0.8, 0.9, 0.4, 0, 0.9, b.D / 2 + 0.2);
    mk('par3_' + b.cfg.id, 'facade', 0.4, 0.9, b.D + 0.8, -b.W / 2 - 0.2, 0.9, 0);
    mk('par4_' + b.cfg.id, 'facade', 0.4, 0.9, b.D + 0.8, b.W / 2 + 0.2, 0.9, 0);
    // Çatı üstü soğutma grupları (temsili)
    const n = Math.max(2, Math.floor(b.W / 12));
    for (let i = 0; i < n; i++) {
      const x = -b.W / 2 + 6 + (i * (b.W - 12)) / Math.max(1, n - 1);
      mk('chiller_' + b.cfg.id + '_' + i, 'rooftop', 5, 1.6, 2.6, x, 1.3, b.D / 2 - 6);
      const fan = CreateCylinder('fan_' + b.cfg.id + '_' + i, { height: 0.25, diameter: 1.6, tessellation: 16 }, scene);
      fan.parent = b.roof;
      fan.position.set(x, 2.2, b.D / 2 - 6);
      fan.material = mats.mullion;
      fan.isPickable = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Kat içeriği (thin instances)
  // ---------------------------------------------------------------------------
  function buildFloorContent(f) {
    if (!scene || !f.content) return;
    f.content.getChildMeshes().forEach(m => m.dispose());
    f.kinds = {};
    f.overlay = null;

    const lb = f.layout.bounds;
    const cx = (lb.x0 + lb.x1) / 2, cy = (lb.y0 + lb.y1) / 2;
    // SCH y aşağı doğru; sahnede z kuzey (yukarı). Kat merkezi bina merkezine oturur.
    f.content.position.set(-cx, SLAB + 0.08, cy);
    f.content.scaling.set(1, 1, -1);

    KINDS.forEach(kind => {
      const items = f.kindItems[kind];
      if (!items || !items.length) return;
      const mesh = CreateBox('eq_' + f.cfg.id + '_' + kind, { size: 1 }, scene);
      mesh.parent = f.content;
      mesh.material = mats['eq_' + kind];
      mesh.isPickable = true;
      mesh.thinInstanceEnablePicking = true;
      const mbuf = new Float32Array(items.length * 16);
      const colors = new Float32Array(items.length * 4);
      items.forEach((it, idx) => {
        itemMatrix(it, 1).copyToArray(mbuf, idx * 16);
        const c = NEUTRAL[kind];
        colors.set([c[0], c[1], c[2], 1], idx * 4);
      });
      mesh.thinInstanceSetBuffer('matrix', mbuf, 16, true);
      mesh.thinInstanceSetBuffer('color', colors, 4, false);
      f.kinds[kind] = { mesh, colors, items };
    });

    // İç duvarlar
    const walls = f.layout.walls.filter(w => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 0.2);
    if (walls.length) {
      const m = CreateBox('iw_' + f.cfg.id, { size: 1 }, scene);
      m.parent = f.content;
      m.material = mats.iwall;
      m.isPickable = false;
      const buf = new Float32Array(walls.length * 16);
      walls.forEach((w, i) => wallMatrix(w).copyToArray(buf, i * 16));
      m.thinInstanceSetBuffer('matrix', buf, 16, true);
    }
    const ov = CreateBox('ov_' + f.cfg.id, { size: 1 }, scene);
    ov.parent = f.content;
    ov.isPickable = false;
    ov.material = sevMats.get('alarm');
    ov.thinInstanceSetBuffer('matrix', new Float32Array(16), 16, false);
    ov.thinInstanceCount = 0;
    ov.thinInstanceSetBuffer('color', new Float32Array(4), 4, false);
    ov.isVisible = false;
    if (glow) glow.addIncludedOnlyMesh(ov);
    f.overlay = ov;
  }

  function itemMatrix(it, grow) {
    const h = ITEM_H[it.kind] * (grow > 1 ? 1.06 : 1);
    return Matrix.Compose(
      new Vector3(it.w * grow, h, it.d * grow),
      Quaternion.RotationYawPitchRoll((-it.rot * Math.PI) / 180, 0, 0),
      new Vector3(it.cx, h / 2, it.cy)
    );
  }

  function wallMatrix(w) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    const h = FH - SLAB - 1.2;
    return Matrix.Compose(
      new Vector3(len, h, 0.25),
      Quaternion.RotationYawPitchRoll(-Math.atan2(dy, dx), 0, 0),
      new Vector3((w.x1 + w.x2) / 2, h / 2, (w.y1 + w.y2) / 2)
    );
  }

  /** Öğenin dünya konumu (kat düğümü dahil). */
  function itemWorld(f, it) {
    f.content.computeWorldMatrix(true);
    return Vector3.TransformCoordinates(new Vector3(it.cx, ITEM_H[it.kind] / 2, it.cy), f.content.getWorldMatrix());
  }

  function siteExtent() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    buildings.forEach(b => {
      x0 = Math.min(x0, b.ox - b.W / 2); x1 = Math.max(x1, b.ox + b.W / 2);
      z0 = Math.min(z0, b.oz - b.D / 2); z1 = Math.max(z1, b.oz + b.D / 2);
    });
    if (!Number.isFinite(x0)) return { cx: 0, cz: 0, span: 100 };
    return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span: Math.max(x1 - x0, z1 - z0) };
  }

  // ---------------------------------------------------------------------------
  // Durum → renk
  // ---------------------------------------------------------------------------
  /** Katın öğe önemleri: SCH durumu + alarm eşleşmeleri (en yükseği). */
  function floorItemSev(f) {
    const out = new Map();
    f.statusSev.forEach((s, key) => { if (statusCatOk(f, key)) out.set(key, s); });
    visibleAlarms().forEach(a => {
      if (a.floorId !== f.cfg.id || !a.itemKey) return;
      const cur = out.get(a.itemKey) || 'normal';
      if (severityRank(a.sev) > severityRank(cur)) out.set(a.itemKey, a.sev);
    });
    return out;
  }

  function applyFloorColors(f) {
    if (!scene) return;
    const sevs = floorItemSev(f);
    KINDS.forEach(kind => {
      const km = f.kinds[kind];
      if (!km) return;
      const n = NEUTRAL[kind];
      km.items.forEach((it, idx) => {
        const s = sevs.get(it.key) || 'normal';
        if (s === 'normal') {
          km.colors[idx * 4] = n[0]; km.colors[idx * 4 + 1] = n[1]; km.colors[idx * 4 + 2] = n[2];
        } else {
          const c = Color3.FromHexString(SEVERITY_COLOR[s]);
          km.colors[idx * 4] = c.r; km.colors[idx * 4 + 1] = c.g; km.colors[idx * 4 + 2] = c.b;
        }
      });
      km.mesh.thinInstanceBufferUpdated('color');
    });
    // Parlayan kabuk: yalnız acil/alarm öğeleri
    const ov = f.overlay;
    if (ov) {
      const keys = Array.from(sevs.entries()).filter(e => (e[1] === 'acil' || e[1] === 'alarm') && f.itemIndex.has(e[0]));
      if (!keys.length) {
        ov.thinInstanceCount = 0;
        ov.isVisible = false;
      } else {
        const mb = new Float32Array(keys.length * 16);
        const cols = new Float32Array(keys.length * 4);
        keys.forEach((e, i) => {
          const ref = f.itemIndex.get(e[0]);
          itemMatrix(ref.item, 1.14).copyToArray(mb, i * 16);
          const c = Color3.FromHexString(SEVERITY_COLOR[e[1]]);
          cols.set([c.r, c.g, c.b, 1], i * 4);
        });
        ov.thinInstanceSetBuffer('matrix', mb, 16, false);
        ov.thinInstanceSetBuffer('color', cols, 4, false);
        ov.isVisible = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Tema, cephe
  // ---------------------------------------------------------------------------
  function applyTheme() {
    if (!scene) return;
    const light = S.isLight;
    scene.fogColor = Color3.FromHexString(light ? '#b9c5d3' : '#090d13');
    if (groundMat) groundMat.diffuseColor = light ? new Color3(0.58, 0.63, 0.69) : new Color3(0.06, 0.08, 0.11);
    if (gridLines) gridLines.color = light ? new Color3(0.36, 0.44, 0.54) : new Color3(0.25, 0.4, 0.55);
    if (hemi) {
      hemi.intensity = light ? 0.66 : 0.85;
      hemi.groundColor = light ? new Color3(0.5, 0.53, 0.58) : new Color3(0.08, 0.1, 0.14);
    }
    if (mats.pave) mats.pave.diffuseColor = Color3.FromHexString(light ? '#9aa8b8' : '#1e2631');
    if (mats.raised) mats.raised.diffuseColor = Color3.FromHexString(light ? '#b4c0ce' : '#243041');
    // Bina kabuğu tonları (açık / koyu). Yalnız malzeme rengi değişir, sahne yeniden kurulmaz.
    const tone = {
      slab: ['#cfd6de', '#9aa3ad'],
      facade: ['#eef2f6', '#c9ced6'],
      spandrel: ['#b9c3cf', '#8d96a3'],
      mullion: ['#7b8796', '#4b5563'],
      roof: ['#a3afbd', '#6b7280'],
      rooftop: ['#d3dae2', '#9ca3af'],
      canopy: ['#f8fafc', '#e5e7eb'],
      iwall: ['#94a3b8', '#64748b'],
      door: ['#334155', '#1f2937']
    };
    Object.keys(tone).forEach(k => { if (mats[k]) mats[k].diffuseColor = Color3.FromHexString(tone[k][light ? 0 : 1]); });
    if (mats.glass) {
      mats.glass.diffuseColor = Color3.FromHexString(light ? '#7cc0ef' : '#5aa9e6');
      mats.glass.emissiveColor = Color3.FromHexString(light ? '#163a57' : '#0b2a44');
    }
    if (mats.shadow) mats.shadow.alpha = light ? 0.16 : 0.35;
    if (sun) sun.intensity = light ? 0.42 : sunDarkIntensity;
    // Parlama katmanı toplamsal: açık zeminde alarm renklerini soluklaştırmasın
    if (glow) glow.intensity = light ? 0.4 : 0.85;
  }

  function applyFacade() {
    if (!scene) return;
    const v = Math.max(0, Math.min(1, S.facadeOpacity / 100));
    const eff = S.isolatedFloorId ? Math.min(v, 0.12) : v;
    ['facade', 'spandrel', 'mullion', 'roof', 'canopy'].forEach(k => { if (mats[k]) mats[k].alpha = eff; });
    if (mats.glass) mats.glass.alpha = 0.08 + 0.5 * eff;
    const hide = eff < 0.02;
    floors.forEach(f => f.shellMeshes.forEach(m => {
      if (m.material === mats.slab || m.material === mats.raised) return;
      m.isVisible = !hide;
    }));
    buildings.forEach(b => { if (b.roof) b.roof.getChildMeshes().forEach(m => { m.isVisible = !hide; }); });
  }

  function updateFloorTargets() {
    const iso = S.isolatedFloorId ? floorById(S.isolatedFloorId) : null;
    floors.forEach(f => {
      f.targetY = f.cfg.level * (FH + (S.exploded ? EXPLODE : 0));
      f.hidden = !!iso && iso.b === f.b && f.cfg.level > iso.cfg.level;
      if (f.node) f.node.setEnabled(!f.hidden);
    });
    buildings.forEach(b => {
      const anyHidden = !!iso && iso.b === b && iso.cfg.level < Math.max.apply(null, b.cfg.floors.map(x => x.level));
      if (b.roof) b.roof.setEnabled(!anyHidden);
    });
    applyFacade();
  }

  // ---------------------------------------------------------------------------
  // Kare döngüsü ve HTML katmanları
  // ---------------------------------------------------------------------------
  function tick(now, dt) {
    const cam = camera;
    if (!cam) return;
    // Kat yükseklikleri (patlatma animasyonu)
    floors.forEach(f => {
      if (Math.abs(f.curY - f.targetY) > 0.01) {
        f.curY += (f.targetY - f.curY) * Math.min(1, dt * 0.008);
        f.node.position.y = f.curY;
      }
    });
    buildings.forEach(b => {
      const top = floors.filter(f => f.b === b).reduce((m, f) => Math.max(m, f.curY + FH), 0);
      b.roof.position.y = top;
    });

    if (camTween) {
      const tw = camTween;
      const t = Math.min(1, (now - tw.t0) / tw.dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.alpha = tw.from.alpha + (tw.to.alpha - tw.from.alpha) * e;
      cam.beta = tw.from.beta + (tw.to.beta - tw.from.beta) * e;
      cam.radius = tw.from.radius + (tw.to.radius - tw.from.radius) * e;
      cam.target = Vector3.Lerp(tw.from.target, tw.to.target, e);
      if (t >= 1) camTween = null;
    } else if (S.autoRotate && !focusTarget && now - lastInteract > 5000) {
      cam.alpha += dt * 0.00005;
    }

    // Nabız: alarm kabukları ve odak halkası
    const p = 0.5 + 0.5 * Math.sin(now * 0.006);
    sevMats.forEach(m => { m.alpha = 0.25 + 0.45 * p; });
    if (focusTarget && ring && beam) {
      const ref = focusTarget.f.itemIndex.get(focusTarget.key);
      if (ref) {
        const w = itemWorld(focusTarget.f, ref.item);
        const base = w.y - ITEM_H[ref.item.kind] / 2 + 0.1;
        const s = Math.max(ref.item.w, ref.item.d) * 1.8 + 1.2 + p * 1.2;
        ring.position.set(w.x, base, w.z);
        ring.scaling.set(s, 1, s);
        beam.position.set(w.x, base + 14, w.z);
        beam.scaling.set(1, 28, 1);
        beam.material.alpha = 0.14 + 0.16 * p;
      }
    }
  }

  function positionOverlays() {
    if (!scene || !camera || !engine) return;
    const rw = engine.getRenderWidth(), rh = engine.getRenderHeight();
    const sx = cssW / rw, sy = cssH / rh;
    const vp = camera.viewport.toGlobal(rw, rh);
    const tm = scene.getTransformMatrix();
    const id = Matrix.IdentityReadOnly;
    const place = (el, p, hidden) => {
      if (!el) return;
      const s = Vector3.Project(p, id, tm, vp);
      if (hidden || s.z < 0 || s.z > 1) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; return; }
      el.style.opacity = '';
      el.style.pointerEvents = '';
      el.style.transform = 'translate3d(' + (s.x * sx).toFixed(1) + 'px, ' + (s.y * sy).toFixed(1) + 'px, 0)';
    };
    floors.forEach(f => {
      const b = f.b;
      place(badgeEls.get(f.cfg.id), new Vector3(b.ox + b.W / 2 + 1, f.curY + FH * 0.55, b.oz - b.D / 2), f.hidden);
    });
    buildings.forEach(b => {
      place(labelEls.get(b.cfg.id), new Vector3(b.ox, b.roof.position.y + 5, b.oz), !S.showLabels);
    });
    tagList.forEach(t => {
      const ref = t.f.itemIndex.get(t.key);
      if (!ref) return;
      const w = itemWorld(t.f, ref.item);
      w.y += ITEM_H[ref.item.kind] / 2 + 0.6;
      place(tagEls.get(t.key + '@' + t.f.cfg.id), w, t.f.hidden);
    });
  }

  /** 3D etiketler: önem sırasına göre ilk 14 anormal öğe (DOM elle yönetilir). */
  function rebuildTags() {
    const layer = R.tags;
    if (!layer || !scene) return;
    const list = [];
    if (S.showLabels) {
      floors.forEach(f => {
        floorItemSev(f).forEach((sev, key) => {
          if (sev === 'normal' || sev === 'kayip') return;
          const ref = f.itemIndex.get(key);
          if (ref) list.push({ key, f, item: ref.item, sev });
        });
      });
      list.sort((a, b) => severityRank(b.sev) - severityRank(a.sev));
    }
    const top = list.slice(0, 14);
    const want = new Set(top.map(t => t.key + '@' + t.f.cfg.id));
    tagEls.forEach((el, k) => { if (!want.has(k)) { el.remove(); tagEls.delete(k); } });
    top.forEach(t => {
      const k = t.key + '@' + t.f.cfg.id;
      let el = tagEls.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag3d';
        el.style.opacity = '0';
        layer.appendChild(el);
        tagEls.set(k, el);
      }
      el.style.setProperty('--c', SEVERITY_COLOR[t.sev]);
      el.textContent = (t.item.label || t.key) + (t.f.cfg.live ? '' : ' · demo');
    });
    tagList = top;
  }

  // ---------------------------------------------------------------------------
  // Seçim ve kamera
  // ---------------------------------------------------------------------------
  function selectFloor(id) {
    const f = floorById(id);
    if (!f) return;
    S.isolatedFloorId = id;
    S.focusedAlarmId = null;
    setFocus(null);
    S.selItem = null;
    updateFloorTargets();
    if (camera) {
      const w = new Vector3(f.b.ox, f.targetY + FH * 0.4, f.b.oz);
      flyTo({ alpha: -Math.PI / 2 - 0.35, beta: 0.82, radius: Math.max(60, Math.max(f.b.W, f.b.D) * 1.25), target: w });
    }
    rebuildTags();
    refreshViews();
  }

  function backToBuilding() {
    S.isolatedFloorId = null;
    S.focusedAlarmId = null;
    setFocus(null);
    S.selItem = null;
    updateFloorTargets();
    if (homePose) flyTo(Object.assign({}, homePose, { target: homePose.target.clone() }));
    refreshViews();
  }

  function focusAlarm(a) {
    S.focusedAlarmId = a.id;
    const f = a.floorId ? floorById(a.floorId) : null;
    if (!f) { refreshViews(); return; }
    if (a.itemKey && flyToItem(f, a.itemKey, SEVERITY_COLOR[a.sev])) { refreshViews(); return; }
    S.isolatedFloorId = f.cfg.id;
    updateFloorTargets();
    setFocus(null);
    S.selItem = null;
    if (camera) flyTo({ alpha: -Math.PI / 2 - 0.35, beta: 0.82, radius: Math.max(60, Math.max(f.b.W, f.b.D) * 1.2), target: new Vector3(f.b.ox, f.targetY + FH * 0.4, f.b.oz) });
    refreshViews();
  }

  /** Öğeye yumuşak uçuş + odak halkası + seçim kartı (alarm odağı, çift tık ve URL ortak yolu). */
  function flyToItem(f, key, color) {
    const ref = f.itemIndex.get(key);
    if (!ref) return false;
    S.isolatedFloorId = f.cfg.id;
    updateFloorTargets();
    setFocus({ f, key: ref.item.key }, color);
    if (camera && f.node) {
      // Hedef: katın son (hedef) yüksekliğiyle öğe konumu
      const saveY = f.node.position.y;
      f.node.position.y = f.targetY;
      f.node.computeWorldMatrix(true);
      const w = itemWorld(f, ref.item);
      f.node.position.y = saveY;
      f.node.computeWorldMatrix(true);
      flyTo({ alpha: camera.alpha, beta: 0.9, radius: 12, target: w });
    }
    S.selItem = selView(f, ref.item);
    return true;
  }

  /** Çift tık: thin instance pick (pickedMesh + thinInstanceIndex) → öğeye uçuş. */
  function onCanvasDblClick(ev) {
    if (!scene) return;
    const owner = new Map();
    floors.forEach(f => KINDS.forEach(k => { const km = f.kinds[k]; if (km) owner.set(km.mesh, { f, km }); }));
    const r = R.canvas.getBoundingClientRect();
    const pi = scene.pick(ev.clientX - r.left, ev.clientY - r.top, m => owner.has(m) && m.isEnabled() && m.isVisible);
    const o = pi && pi.hit && pi.pickedMesh ? owner.get(pi.pickedMesh) : undefined;
    const it = o && pi.thinInstanceIndex >= 0 ? o.km.items[pi.thinInstanceIndex] : undefined;
    if (!o || !it) return;
    S.focusedAlarmId = null;
    const sev = floorItemSev(o.f).get(it.key);
    flyToItem(o.f, it.key, sev && sev !== 'normal' ? SEVERITY_COLOR[sev] : undefined);
    refreshViews();
  }

  function selView(f, it) {
    const al = visibleAlarms().filter(a => a.floorId === f.cfg.id && a.itemKey === it.key)
      .sort((a, b) => severityRank(b.sev) - severityRank(a.sev));
    const top = al.filter(a => !a.demo)[0];
    return {
      floorId: f.cfg.id, key: it.key, label: it.label || it.key, kind: it.kind, kindLabel: KIND_LABEL[it.kind], devId: it.devId,
      floorName: f.cfg.name, sev: floorItemSev(f).get(it.key) || 'normal', alarms: al.length, live: f.cfg.live,
      pmsAlarm: top ? top.rid : '', topText: al[0] ? (al[0].detail || al[0].txt) : ''
    };
  }

  function closeSel() {
    S.selItem = null;
    setFocus(null);
    refreshViews();
  }

  function setFocus(t, color) {
    focusTarget = t;
    if (ring) ring.setEnabled(!!t);
    if (beam) beam.setEnabled(!!t);
    if (t && ring && beam) {
      const a = S.alarmsView.find(x => x.id === S.focusedAlarmId);
      const c = Color3.FromHexString(color || (a ? SEVERITY_COLOR[a.sev] : '#38bdf8'));
      ring.material.emissiveColor = c;
      beam.material.emissiveColor = c;
    }
  }

  function flyTo(to) {
    const cam = camera;
    if (!cam) return;
    // En kısa açısal yol
    let da = (to.alpha - cam.alpha) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    camTween = {
      from: { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() },
      to: Object.assign({}, to, { alpha: cam.alpha + da }),
      t0: performance.now(), dur: 1300
    };
  }

  // ---------------------------------------------------------------------------
  // BMS ↔ PMS geçişi (ortak URL sözleşmesi)
  // ---------------------------------------------------------------------------
  /** PMS: alarm (CMA rid), dev (cihaz kimliği), from=bms; alarm/dev varsa tek hat görünümü açılır. */
  function openPms(p) {
    p = p || {};
    const q = new URLSearchParams();
    if (p.alarm || p.dev) q.set('view', 'single-line');
    if (p.alarm) q.set('alarm', p.alarm);
    if (p.dev) q.set('dev', p.dev);
    q.set('from', 'bms');
    window.location.href = 'pms.html?' + q.toString();
  }

  function pmsFromAlarm(a) {
    const f = a.floorId ? floorById(a.floorId) : null;
    const ref = f && a.itemKey ? f.itemIndex.get(a.itemKey) : null;
    openPms({ alarm: a.demo ? undefined : a.rid, dev: (ref && ref.item.devId) || a.dev || undefined });
  }

  function pmsFromSel(s) {
    openPms({ alarm: s.pmsAlarm || undefined, dev: s.devId || undefined });
  }

  function closeBand() {
    S.navBand = null;
    clearTimeout(bandTimer);
    renderBand();
  }

  function showBand(msg) {
    S.navBand = msg;
    clearTimeout(bandTimer);
    bandTimer = setTimeout(closeBand, BAND_MS);
    renderBand();
  }

  /**
   * Sıra: alarm → o alarmın öğesi; yoksa cab → kabin; yoksa dev → SCH devId (_DV'siz) ya da etiket; yoksa floor → kat;
   * hiçbiri yoksa konumun tanımlı olmadığı söylenir (tahmin yok). Yaklaşık (demo) yerleşimlerde arama yapılmaz.
   */
  function tryNav() {
    const g = k => String(params.get(k) || '').trim();
    const req = { floor: g('floor'), dev: g('dev'), cab: g('cab') || g('cabinet'), alarm: g('alarm'), from: g('from') };
    if (!req.floor && !req.dev && !req.cab && !req.alarm) {
      if (req.from === 'pms') showBand("PMS'ten geldiniz");
      return;
    }
    const from = req.from === 'pms' ? "PMS'ten geldiniz" : 'Bağlantıdan geldiniz';

    if (req.alarm) {
      const want = req.alarm.toUpperCase();
      const a = allAlarms().find(x => String(x.rid).toUpperCase() === want || String(x.alarmId || '').toUpperCase() === want || x.id.toUpperCase() === want);
      const f = a && a.floorId ? floorById(a.floorId) : null;
      if (a && f && a.itemKey && f.itemIndex.has(a.itemKey)) {
        focusAlarm(a);
        showBand(from + ' · ' + (a.where || a.txt));
        return;
      }
    }
    const hit = (req.cab ? findCab(req.cab) : null) || (req.dev ? findDev(req.dev) : null);
    if (hit) {
      S.focusedAlarmId = null;
      const sev = floorItemSev(hit.f).get(hit.key);
      flyToItem(hit.f, hit.key, sev && sev !== 'normal' ? SEVERITY_COLOR[sev] : undefined);
      // Öğenin en önemli alarmı listede vurgulanır (PMS'ten gelişte operatör alarmı hemen görsün)
      const al = allAlarms().filter(x => x.floorId === hit.f.cfg.id && x.itemKey === hit.key)
        .sort((x, y) => severityRank(y.sev) - severityRank(x.sev))[0];
      if (al) S.focusedAlarmId = al.id;
      refreshViews();
      const ref = hit.f.itemIndex.get(hit.key);
      showBand(from + ' · ' + hit.f.cfg.name + ' · ' + ((ref && ref.item.label) || hit.key));
      return;
    }
    const fid = req.floor ? resolveFloorId(req.floor) : null;
    if (fid) {
      selectFloor(fid);
      showBand(from + ' · ' + floorName(fid));
      return;
    }
    showBand('Bu güç cihazının fiziksel konumu tanımlı değil (Enerji merkezi)');
  }

  /** Gerçek (SCH) yerleşimli katlar; canlı kat önce. */
  function navFloors() {
    return floors.filter(f => f.layout.source !== 'mock' && f.layout.items.length)
      .sort((a, b) => Number(b.cfg.live) - Number(a.cfg.live));
  }

  function findCab(cab) {
    const n = B.normCab(cab);
    if (!n) return null;
    for (const f of navFloors()) {
      const key = f.cabIndex.get(n);
      if (key) return { f, key };
    }
    return null;
  }

  /** SCH öğesi devId ile eşleşme (sondaki _DV olsa da olmasa da); yoksa kök kuralı; sunumda etiket de kabul edilir. */
  function findDev(dev) {
    const stem = v => String(v || '').trim().toUpperCase().replace(/_DV$/, '');
    const want = stem(dev);
    if (!want) return null;
    const list = navFloors();
    for (const f of list) {
      const it = f.layout.items.find(i => i.devId && stem(i.devId) === want);
      if (it) return { f, key: it.key };
    }
    for (const f of list) {
      const s = f.devStems.find(x => want.indexOf(x.stem) >= 0);
      if (s) return { f, key: s.key };
    }
    const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9ÇĞİÖŞÜ]/g, '');
    const wn = norm(dev);
    for (const f of list) {
      const it = f.layout.items.find(i => norm(i.label) === wn || (i.kind === 'ups' && norm(i.label) === 'UPS' + wn));
      if (it) return { f, key: it.key };
    }
    return null;
  }

  function resolveFloorId(v) {
    const n = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const u = n(v);
    const f = floors.find(x => n(x.cfg.id) === u || n(x.cfg.name) === u || (u === 'FLK1' && x.cfg.live));
    return f ? f.cfg.id : null;
  }

  // ---------------------------------------------------------------------------
  // Alarmlar (KAT-1 canlı = DCIM.data.activeAlarms; diğer katlar demo)
  // ---------------------------------------------------------------------------
  function relinkRealAlarms() {
    const f = kat1;
    const list = [];
    KAT1_SRC.forEach(r => {
      if (r.sev === 'normal') return;
      let itemKey = null;
      if ((r.deviceType === 'cabinet' || r.deviceType === 'lock') && r.target) itemKey = f.cabIndex.get(B.normCab(r.target)) || null;
      else if (r.target) itemKey = f.labelIndex.get(r.target.toUpperCase()) || null;
      if (!itemKey && r.rid) {
        const up = r.rid.toUpperCase();
        const s = f.devStems.find(x => up.indexOf(x.stem) >= 0);
        itemKey = s ? s.key : null;
      }
      const ref = itemKey ? f.itemIndex.get(itemKey) : null;
      const label = ref ? (ref.item.label || r.target) : r.target;
      const id = 'R' + r.alarmId;
      const prev = realAlarms.find(x => x.id === id);
      list.push({
        id, rid: r.rid, alarmId: r.alarmId, uid: '',
        floorId: f.cfg.id, itemKey, sev: r.sev,
        txt: String(r.desc || r.txt || r.rid || 'Alarm'),
        detail: r.txt,
        where: [f.cfg.name, label || ''].filter(Boolean).join(' · '),
        time: hhmm(r.ts), ts: r.ts,
        acked: r.acked || ackedIds.has(id),
        demo: false,
        acking: prev ? prev.acking : false,
        cat: showAlarmCategory(r.grp, [r.txt, r.desc, r.type]),
        dev: ref && ref.item.devId ? ref.item.devId : r.rid
      });
    });
    realAlarms = list;
  }

  /** "Gördüm": sunumda yalnız bellekte işaretlenir (orijinal: CMA_List öğesine ack yazımı). */
  function ack(a) {
    if (!a || a.acked || a.acking) return;
    if (a.demo) {
      a.acked = true;
      onAlarmsChanged();
      return;
    }
    a.acking = true;
    renderAlarmPanel();
    setTimeout(() => {
      a.acking = false;
      a.acked = true;
      ackedIds.add(a.id);
      onAlarmsChanged();
    }, 650);
  }

  function makeDemoAlarm(f, tpl, it, ts, acked) {
    return {
      id: 'D' + (++demoSeq), rid: '', uid: '', floorId: f.cfg.id, itemKey: it.key, sev: tpl.sev, txt: tpl.txt, detail: '',
      where: f.cfg.name + ' · ' + (it.label || it.key),
      time: hhmm(ts), ts, acked: !!acked, demo: true, cat: tpl.cat, dev: it.devId
    };
  }

  /** Açılış: sabit demo alarmları; sonra 6-8 sn'de bir tohumlu değişim (orijinal startDemo). */
  function startDemo() {
    const now = Date.now();
    floors.filter(f => !f.cfg.live).forEach(f => {
      const cur = [];
      (B.DEMO_INITIAL[f.cfg.id] || []).forEach(d => {
        const tpl = B.DEMO_TEXTS[d.tpl];
        const items = f.kindItems[tpl.kind] || [];
        if (!items.length) return;
        cur.push(makeDemoAlarm(f, tpl, items[d.idx % items.length], now - d.ageMin * 60000, d.acked));
      });
      demoAlarms.set(f.cfg.id, cur);
    });
    const rnd = demoRng;
    const step = () => {
      floors.filter(f => !f.cfg.live).forEach(f => {
        const cur = (demoAlarms.get(f.cfg.id) || []).filter(() => rnd() > 0.3);
        const target = 1 + Math.floor(rnd() * 3);
        while (cur.length > target) cur.splice(Math.floor(rnd() * cur.length), 1);
        let guard = 0;
        while (cur.length < target && guard++ < 12) {
          const tpl = B.DEMO_TEXTS[Math.floor(rnd() * B.DEMO_TEXTS.length)];
          const items = f.kindItems[tpl.kind] || [];
          if (!items.length) continue;
          const it = items[Math.floor(rnd() * items.length)];
          if (cur.some(c => c.itemKey === it.key)) continue;
          cur.push(makeDemoAlarm(f, tpl, it, Date.now(), rnd() < 0.25));
        }
        demoAlarms.set(f.cfg.id, cur);
      });
      onAlarmsChanged();
      setTimeout(step, 6000 + rnd() * 2000);
    };
    setTimeout(step, 6000 + rnd() * 2000);
  }

  function allAlarms() {
    const out = realAlarms.slice();
    demoAlarms.forEach(l => out.push.apply(out, l));
    return out;
  }

  function onAlarmsChanged() {
    floors.forEach(f => applyFloorColors(f));
    rebuildTags();
    // Odaktaki demo alarmı kaybolduysa odağı bırak
    if (S.focusedAlarmId && !visibleAlarms().some(a => a.id === S.focusedAlarmId)) {
      S.focusedAlarmId = null;
      if (!S.selItem) setFocus(null);
    }
    refreshViews();
  }

  function setFilter(v) {
    S.alarmFilter = v;
    refreshViews();
  }

  /** Kategori çipi: çoklu seçim; null = Tümü. Liste, 3D vurgu, kat rozetleri ve KPI birlikte süzülür. */
  function toggleCat(id) {
    if (!id) S.catSel.clear();
    else if (S.catSel.has(id)) S.catSel.delete(id);
    else S.catSel.add(id);
    if (S.catSel.size === ALARM_CATS.length) S.catSel.clear();
    storage.set(CAT_STORE_KEY, JSON.stringify(Array.from(S.catSel)));
    onAlarmsChanged();
  }

  const catOk = c => !S.catSel.size || (c !== null && S.catSel.has(c));

  /** SCH durum rengi (alarm değil): ekipman türünün kategorisi seçiliyse görünür. */
  function statusCatOk(f, key) {
    if (!S.catSel.size) return true;
    const ref = f.itemIndex.get(key);
    return !!ref && S.catSel.has(KIND_CAT[ref.kind]);
  }

  /** Kategori süzgecinden geçen alarmlar (3D, KPI, kat rozetleri ve liste bunu kullanır). */
  function visibleAlarms() {
    const all = allAlarms();
    return S.catSel.size ? all.filter(a => catOk(a.cat)) : all;
  }

  function refreshViews() {
    const everything = allAlarms();
    const all = everything.filter(a => catOk(a.cat));
    const live = zeroKpi(), demo = zeroKpi();
    all.forEach(a => {
      const k = a.demo ? demo : live;
      if (a.sev !== 'normal') k[a.sev]++;
      k.total++;
      if (!a.acked) k.unack++;
    });
    S.kpi = { live, demo };
    S.floorsView = S.floorsView.map(fv => {
      const fa = all.filter(a => a.floorId === fv.id);
      const f = floorById(fv.id);
      const st = f ? Array.from(f.statusSev.entries()).filter(e => statusCatOk(f, e[0])).map(e => e[1]) : [];
      const sev = fa.map(a => a.sev).concat(st.filter(s => s !== 'kayip')).reduce((m, s) => (severityRank(s) > severityRank(m) ? s : m), 'normal');
      return Object.assign({}, fv, { sev, live: fa.filter(a => !a.demo).length, demo: fa.filter(a => a.demo).length });
    });
    const scope = l => (S.alarmFilter === 'all' ? l
      : S.alarmFilter === 'live' ? l.filter(a => !a.demo)
        : l.filter(a => a.floorId === S.alarmFilter));
    // Çip sayıları: tümü/kat seçimi içindeki aktif alarmlar (kategori seçiminden bağımsız)
    const scoped = scope(everything);
    S.catAllCount = scoped.length;
    S.catChips = ALARM_CATS.map(c => Object.assign({}, c, { n: scoped.filter(a => a.cat === c.id).length }));
    S.alarmsView = scope(all)
      .sort((a, b) => (Number(a.acked) - Number(b.acked)) || (severityRank(b.sev) - severityRank(a.sev)) || (b.ts - a.ts))
      .slice(0, 200);
    if (S.selItem) {
      const sf = floorById(S.selItem.floorId);
      const ref = sf ? sf.itemIndex.get(S.selItem.key) : null;
      S.selItem = sf && ref ? selView(sf, ref.item) : null;
    }
    refreshStd();
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Standart uyumu kartları
  // ---------------------------------------------------------------------------
  function refreshStd() {
    const now = Date.now();
    const all = allAlarms();
    const real = all.filter(a => !a.demo), demo = all.filter(a => a.demo);
    const last10 = l => l.filter(a => a.ts && now - a.ts <= 10 * 60000).length;
    const t = envTemps, h = envHums;
    const avg = v => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
    const tAvg = avg(t), hAvg = avg(h);
    let bars = [];
    let tMin = 0, tMax = 0;
    if (t.length) {
      tMin = Math.min.apply(null, t); tMax = Math.max.apply(null, t);
      const lo = Math.floor(tMin), hi = Math.ceil(tMax);
      const step = Math.max(1, Math.ceil((hi - lo) / 8));
      const bins = [];
      for (let x = lo; x < hi || bins.length === 0; x += step) bins.push(x);
      const counts = bins.map(b => t.filter(v => (v >= b && v < b + step) || (b + step >= hi && v === hi)).length);
      const max = Math.max.apply(null, [1].concat(counts));
      bars = bins.map((b, i) => ({ label: b + '–' + (b + step), n: counts[i], pct: Math.round((counts[i] / max) * 100) }));
    }
    const k1Total = kat1.layout.items.length;
    const k1Lost = Array.from(kat1.statusSev.values()).filter(s => s === 'kayip').length;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

    const tSub = t.length ? t.length + ' nokta · ' + tMin.toFixed(1) + '–' + tMax.toFixed(1) + ' °C' : 'Nokta okunamadı';
    const tLong = t.length ? t.length + ' nokta · en düşük ' + tMin.toFixed(1) + ' · en yüksek ' + tMax.toFixed(1) + ' °C' + (hAvg !== null ? ' · nem ort. %' + hAvg.toFixed(0) : '') : 'Kabin sıcaklık noktası okunamadı';
    const realUn = real.filter(a => !a.acked).length, demoUn = demo.filter(a => !a.acked).length;
    const card = (c, long) => Object.assign({}, c, { tip: [c.std + (c.live ? ' · canlı' : ''), long, 'Kaynak: ' + c.note].join('\n') });

    S.stdCards = [
      card({
        id: 'temp', title: 'Kabin sıcaklığı (KAT-1)', std: 'ASHRAE TC 9.9 zarfı', live: true,
        value: tAvg === null ? '—' : tAvg.toFixed(1), unit: '°C ort.', sub: tSub, bars,
        note: 'Önerilen/izin verilen aralık araştırma dosyalarında yer almıyor; bu yüzden eşik ve "aralıkta oranı" gösterilmiyor (literatur-raporu.md, 02-kavram-standart.md).'
      }, tLong),
      card({
        id: 'isa182', title: 'Alarm yükü (10 dk)', std: 'ISA-18.2 / EEMUA 191 / IEC 62682', live: true,
        value: String(last10(real)), unit: 'yeni', sub: '+' + last10(demo) + ' demo',
        note: 'Birim zamanda alarm sınırı standartlarda tanımlı; "10 dk\'da 10 alarm" taşkın eşiği araştırmada bulunamadı, eşik gösterilmiyor (06-ux-kapsam.md L110; literatur-taramasi.md L89-90).'
      }, 'Son 10 dk: ' + last10(real) + ' canlı, +' + last10(demo) + ' demo · aktif ' + real.length + ' (+' + demo.length + ' demo)'),
      card({
        id: 'pue', title: 'PUE', std: 'ISO/IEC 30134-2 / EN 50600-4-2', live: true,
        value: S.pue === null ? '—' : S.pue.toFixed(2), unit: '', sub: 'BT ' + fmt(S.itKw, 0) + ' · soğ. ' + fmt(S.coolKw, 0) + ' kW',
        note: 'Ölçüm kategorisi (PUE1 UPS çıkışı / PUE2 PDU / PUE3 sunucu girişi) bugünkü hesap için belirlenmedi (02-kavram-standart.md L32, L107).'
      }, 'Güç kullanım etkinliği · BT ' + fmt(S.itKw) + ' kW · soğutma ' + fmt(S.coolKw) + ' kW'),
      card({
        id: 'unack', title: 'Görülmemiş alarm', std: 'ISA-18.2 durumları (Unack / Ack)', live: true,
        value: pct(realUn, real.length), unit: '', sub: realUn + ' / ' + real.length + ' canlı',
        note: 'Görülmemiş alarm yanıp söner, görülmüş alarm sabit renkte kalır (06-ux-kapsam.md L107).'
      }, realUn + ' / ' + real.length + ' canlı · demo ' + demoUn + ' / ' + demo.length),
      card({
        id: 'comm', title: 'Haberleşme kaybı (KAT-1)', std: 'ISA-101 durumsal farkındalık', live: true,
        value: pct(k1Lost, k1Total), unit: '', sub: k1Lost + ' / ' + k1Total + ' ekipman',
        note: 'ISA-101: nötr arka plan, yalnız anormal durum vurgusu; "Veri yok" alarm renginden ayrı gösterilir (06-ux-kapsam.md L34, L108).'
      }, k1Lost + ' / ' + k1Total + ' ekipman "Veri yok"')
    ];
  }

  // ---------------------------------------------------------------------------
  // Çizim
  // ---------------------------------------------------------------------------
  const shapeI = s => '<i class="shape ' + SEV_SHAPE[s] + '"></i>';
  const liveChip = isLive => (isLive ? '<span class="chip live">canlı</span>' : '<span class="chip demo">demo</span>');

  function renderAll() {
    renderEyebrow();
    renderKpis();
    renderBadges();
    renderFloorNav();
    renderIso();
    renderSel();
    renderAlarmPanel();
    renderBottom();
  }

  function renderEyebrow() {
    R.eyebrow.innerHTML = '<span class="live-dot' + (S.connected ? '' : ' off') + '"></span>' +
      (S.connected ? 'Canlı · AyXDB' : 'Bağlantı bekleniyor') +
      (S.lastUpdate ? ' <span class="muted">· KAT-1 son güncelleme ' + esc(S.lastUpdate) + '</span>' : '');
  }

  function renderKpis() {
    const k = S.kpi;
    R.kpis.innerHTML =
      ['acil', 'alarm', 'uyari', 'kayip'].map(s =>
        '<div class="kpi sev" style="--c:' + SEVERITY_COLOR[s] + '">' +
          '<span class="k-label">' + shapeI(s) + esc(SEV_LABEL[s]) + '</span>' +
          '<span class="k-val">' + k.live[s] + '</span>' +
          '<span class="k-demo">+' + k.demo[s] + ' demo</span>' +
        '</div>').join('') +
      '<div class="kpi"><span class="k-label">Görülmemiş</span><span class="k-val">' + k.live.unack + '</span><span class="k-demo">+' + k.demo.unack + ' demo</span></div>' +
      '<div class="kpi"><span class="k-label">PUE</span><span class="k-val">' + fmt(S.pue, 2) + '</span><span class="k-demo">canlı</span></div>' +
      '<div class="kpi"><span class="k-label">BT / Soğutma</span><span class="k-val">' + fmt(S.itKw, 0) + '<small> / ' + fmt(S.coolKw, 0) + ' kW</small></span><span class="k-demo">canlı</span></div>' +
      '<div class="kpi"><span class="k-label">KAT-1 ekipman</span><span class="k-val">' + S.kat1Counts.cabinet + '<small> kabin · ' + S.kat1Counts.climate + ' klima</small></span><span class="k-demo">' + esc(S.kat1State) + '</span></div>';
  }

  function renderBadges() {
    S.floorsView.forEach(f => {
      const el = badgeEls.get(f.id);
      if (!el) return;
      el.classList.toggle('active', S.isolatedFloorId === f.id);
      el.style.setProperty('--c', SEVERITY_COLOR[f.sev]);
      el.innerHTML = '<span class="dot' + (f.sev !== 'normal' ? ' pulse' : '') + '"></span>' +
        '<span class="f-name">' + esc(f.name) + '</span>' + liveChip(f.isLive) +
        (f.live ? '<span class="f-count">' + f.live + '</span>' : '') +
        (f.demo ? '<span class="f-count demo">+' + f.demo + '</span>' : '');
    });
  }

  function renderFloorNav() {
    R.fnav.innerHTML = S.floorsView.map(f =>
      '<button type="button" data-act="floor" data-id="' + esc(f.id) + '" class="' + (S.isolatedFloorId === f.id ? 'active' : '') + '" style="--c:' + SEVERITY_COLOR[f.sev] + '">' +
        '<span class="dot"></span>' + esc(f.name) + '</button>').join('') +
      '<button type="button" data-act="building" class="' + (!S.isolatedFloorId ? 'active' : '') + '">Bina</button>';
  }

  function renderIso() {
    R.iso.innerHTML = S.isolatedFloorId
      ? '<div class="iso-chip"><span>' + esc(floorName(S.isolatedFloorId)) + ' görünümü</span><button type="button" data-act="building">Binaya dön (Esc)</button></div>'
      : '';
  }

  function renderBand() {
    R.band.innerHTML = S.navBand
      ? '<div class="nav-band" role="status"><i class="pi pi-directions" aria-hidden="true"></i><span>' + esc(S.navBand) + '</span><button type="button" aria-label="Kapat" data-act="close-band">×</button></div>'
      : '';
  }

  /** Seçili ekipmanın kısa ölçüm satırı (yalnız KAT-1; sunum için DCIM.data'dan). */
  function selValues(s) {
    if (!s.live) return [];
    const pt = (e, label) => { const p = e && e.points ? e.points.find(x => x.label === label) : null; return p ? p.value + (p.unit ? (p.unit === '%' ? '' : ' ') + p.unit : '') : null; };
    if (s.kind === 'cabinet') {
      const c = D.findCabinet(s.label);
      if (!c) return [];
      if (c.status === 'lost') return [['Sensör', 'Veri yok']];
      return [['Orta', c.tempMid.toFixed(1) + ' °C'], ['Üst', c.tempTop.toFixed(1) + ' °C'], ['Nem', '%' + c.humidity], ['Güç', c.powerKw.toFixed(1) + ' kW']];
    }
    const e = D.findEquipment(s.label);
    if (!e) return [];
    if (e.status === 'lost') return [['Haberleşme', 'Veri yok']];
    const keys = s.kind === 'climate' ? [['Dönüş', 'Dönüş Sıcaklığı'], ['Üfleme', 'Üfleme Sıcaklığı'], ['Fan', 'Fan Hızı']]
      : s.kind === 'ups' ? [['Mod', 'Çalışma Modu'], ['Yük', 'Yük Oranı'], ['Akü', 'Kalan Akü Süresi']]
        : [['Güç', 'Toplam Aktif Güç'], ['L3', 'L3 Akım']];
    return keys.map(k => [k[0], pt(e, k[1])]).filter(x => x[1] != null);
  }

  function renderSel() {
    const s = S.selItem;
    if (!s) { R.sel.innerHTML = ''; return; }
    const vals = selValues(s);
    let links = '';
    if (s.live) {
      const q = s.kind === 'cabinet' ? 'cabinet=' + encodeURIComponent(s.label) : 'focus=' + encodeURIComponent(s.label);
      links = '<div class="sel-links">' +
        '<a href="2d.html?' + q + '" title="Dijital İkiz (2D)"><i class="pi pi-map" aria-hidden="true"></i>2D</a>' +
        '<a href="3d.html?' + q + '" title="Dijital İkiz (3D)"><i class="pi pi-box" aria-hidden="true"></i>3D</a>' +
        (s.kind === 'cabinet' ? '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(s.label) + '" title="Kabin Yönetimi"><i class="pi pi-server" aria-hidden="true"></i>Kabin</a>' : '') +
      '</div>';
    }
    R.sel.innerHTML =
      '<div class="sel-card" style="--c:' + SEVERITY_COLOR[s.sev] + '">' +
        '<div class="sel-head">' + shapeI(s.sev) + '<b>' + esc(s.label) + '</b><span class="muted">' + esc(s.kindLabel) + ' · ' + esc(s.floorName) + '</span>' +
          '<button type="button" aria-label="Kapat" data-act="close-sel">×</button></div>' +
        '<div class="sel-meta">' + esc(SEV_LABEL[s.sev]) + ' · ' + s.alarms + ' aktif alarm' + (s.live ? '' : ' <span class="chip demo">demo</span>') + '</div>' +
        (s.topText ? '<div class="sel-alarm">' + esc(s.topText) + '</div>' : '') +
        (vals.length ? '<div class="sel-vals">' + vals.map(v => '<span>' + esc(v[0]) + ' <b>' + esc(v[1]) + '</b></span>').join('') + '</div>' : '') +
        (s.kind === 'ups' ? '<button type="button" class="pms-btn" data-act="pms-sel"><i class="pi pi-sitemap" aria-hidden="true"></i>Tek hatta göster (PMS)</button>' : '') +
        links +
        '<div class="sel-hint">Esc / Binaya dön ile geri</div>' +
      '</div>';
  }

  function renderAlarmPanel() {
    const k = S.kpi;
    R.alhead.innerHTML = '<b>Aktif alarmlar</b><a class="al-link" href="alarms.html" title="Aktif Alarmlar sayfası">Tümünü aç <i class="pi pi-external-link" style="font-size:9px"></i></a>' +
      '<span class="muted al-sum">' + k.live.total + ' canlı · +' + k.demo.total + ' demo</span>';
    R.alfilter.innerHTML =
      '<button type="button" data-act="filter" data-v="all" class="' + (S.alarmFilter === 'all' ? 'active' : '') + '">Tümü</button>' +
      '<button type="button" data-act="filter" data-v="live" class="' + (S.alarmFilter === 'live' ? 'active' : '') + '">Canlı</button>' +
      S.floorsView.map(f => '<button type="button" data-act="filter" data-v="' + esc(f.id) + '" class="' + (S.alarmFilter === f.id ? 'active' : '') + '">' + esc(f.name) + '</button>').join('');
    R.alcats.innerHTML =
      '<button type="button" data-act="cat" data-v="" class="' + (S.catSel.size === 0 ? 'active' : '') + '" aria-pressed="' + (S.catSel.size === 0) + '">' +
        '<i class="pi pi-th-large" aria-hidden="true"></i>Tümü<span class="n">' + S.catAllCount + '</span></button>' +
      S.catChips.map(c =>
        '<button type="button" data-act="cat" data-v="' + c.id + '" class="' + [S.catSel.has(c.id) ? 'active' : '', !c.n ? 'zero' : ''].join(' ').trim() + '"' +
          ' aria-pressed="' + S.catSel.has(c.id) + '" title="' + esc(c.label + ': ' + c.n + ' aktif alarm') + '">' +
          '<i class="' + c.icon + '" aria-hidden="true"></i>' + esc(c.label) + '<span class="n">' + c.n + '</span></button>').join('');
    const list = S.alarmsView;
    R.allist.innerHTML = list.length ? list.map(a =>
      '<div class="al-item' + (S.focusedAlarmId === a.id ? ' focused' : '') + (!a.acked ? ' unack' : '') + '" role="button" tabindex="0" data-act="alarm" data-id="' + esc(a.id) + '"' +
        ' style="--c:' + SEVERITY_COLOR[a.sev] + '"' + (a.detail ? ' title="' + esc(a.detail) + '"' : '') + '>' +
        shapeI(a.sev) +
        '<div class="al-main">' +
          '<div class="al-txt">' + esc(a.txt) + '</div>' +
          '<div class="al-meta">' +
            '<span>' + esc(a.where) + '</span><span>' + esc(a.time) + '</span>' +
            (a.demo ? '<span class="chip demo">demo</span>' : '') +
            (!a.itemKey && a.floorId ? '<span class="muted">kat düzeyi</span>' : '') +
            (a.cat === 'power' ? '<button type="button" class="pms-link" title="Tek hatta göster (PMS)" data-act="pms-alarm" data-id="' + esc(a.id) + '"><i class="pi pi-sitemap" aria-hidden="true"></i>Tek hatta göster (PMS)</button>' : '') +
          '</div>' +
        '</div>' +
        (!a.acked
          ? '<button type="button" class="ack" data-act="ack" data-id="' + esc(a.id) + '"' + (a.acking ? ' disabled' : '') + '>' + (a.acking ? '…' : 'Gördüm') + '</button>'
          : '<span class="acked">görüldü</span>') +
      '</div>').join('') : '<div class="al-empty">Aktif alarm yok</div>';
  }

  function renderBottom() {
    let body;
    if (S.stdTab === 'std') {
      body = '<div class="std-cards">' + S.stdCards.map(c =>
        '<div class="std" title="' + esc(c.tip) + '">' +
          '<div class="std-top"><span class="std-title">' + esc(c.title) + '</span><i class="pi pi-info-circle std-i" title="' + esc(c.tip) + '" aria-label="Ayrıntı ve kaynak"></i></div>' +
          '<div class="std-row">' +
            '<span class="std-val">' + esc(c.value) + (c.unit ? '<small> ' + esc(c.unit) + '</small>' : '') + '</span>' +
            (c.bars && c.bars.length ? '<span class="hist" aria-hidden="true">' + c.bars.map(b => '<span class="bar" style="height:' + b.pct + '%" title="' + esc(b.label + ' °C: ' + b.n) + '"></span>').join('') + '</span>' : '') +
          '</div>' +
          '<div class="std-sub">' + esc(c.sub) + '</div>' +
        '</div>').join('') + '</div>';
    } else {
      body = '<div class="floor-cards">' + S.floorsView.map(f =>
        '<button type="button" class="fc" data-act="floor" data-id="' + esc(f.id) + '" style="--c:' + SEVERITY_COLOR[f.sev] + '" title="' + esc(f.building + ' · ' + f.source) + '">' +
          '<div class="fc-top"><b>' + esc(f.name) + '</b>' + liveChip(f.isLive) + '</div>' +
          '<div class="fc-sev"><i class="dot"></i>' + esc(SEV_LABEL[f.sev]) + ' · ' + f.live + ' +' + f.demo + ' demo</div>' +
        '</button>').join('') + '</div>';
    }
    R.bottom.innerHTML =
      '<div class="tabs">' +
        '<button type="button" data-act="std-tab" data-v="std" class="' + (S.stdTab === 'std' ? 'active' : '') + '">Standart uyumu</button>' +
        '<button type="button" data-act="std-tab" data-v="floors" class="' + (S.stdTab === 'floors' ? 'active' : '') + '">Katlar</button>' +
      '</div>' + body;
  }

  function renderPopups() {
    if (S.showSettings) {
      R.pop.innerHTML =
        '<div class="popup settings" role="dialog" aria-label="Görünüm ayarları">' +
          '<div class="pop-head"><b>Görünüm ayarları</b><button type="button" data-act="close-pop">×</button></div>' +
          '<label class="row"><span>Dış cephe opaklığı <b data-r-op>' + S.facadeOpacity + '</b></span>' +
            '<input type="range" min="0" max="100" step="1" value="' + S.facadeOpacity + '" data-in="opacity"></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="exploded"' + (S.exploded ? ' checked' : '') + '><span>Katları ayır</span></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="autorotate"' + (S.autoRotate ? ' checked' : '') + '><span>Otomatik dönüş</span></label>' +
          '<label class="row toggle"><input type="checkbox" data-in="labels"' + (S.showLabels ? ' checked' : '') + '><span>Etiketler</span></label>' +
        '</div>';
    } else if (S.showSources) {
      R.pop.innerHTML =
        '<div class="popup sources" role="dialog" aria-label="Veri kaynakları">' +
          '<div class="pop-head"><b>Veri kaynakları — canlı / demo</b><button type="button" data-act="close-pop">×</button></div>' +
          '<table><thead><tr><th>Bileşen</th><th>Tür</th><th>Kaynak</th></tr></thead><tbody>' +
            B.DATA_SOURCES.map(r => {
              const cls = r.kind === 'Canlı' ? 'live' : r.kind === 'Demo' ? 'demo' : 'rep';
              return '<tr><td>' + esc(r.what) + '</td><td><span class="chip ' + cls + '">' + esc(r.kind) + '</span></td><td class="src">' + esc(r.src) + '</td></tr>';
            }).join('') +
          '</tbody></table>' +
          '<p class="pop-note">Kat yerleşim kaynağı: ' + S.floorsView.map(f => '<b>' + esc(f.name) + '</b> ' + esc(f.source)).join(', ') + '</p>' +
          '<p class="pop-note">Sunum kopyası: "Canlı" satırlar sunumun ortak mock verisinden (DCIM.data), "Demo" satırlar tarayıcıda tohumlu olarak üretilir; ağ bağlantısı yoktur.</p>' +
        '</div>';
    } else {
      R.pop.innerHTML = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t)) return;
    const act = t.getAttribute('data-act');
    const id = t.getAttribute('data-id');
    const v = t.getAttribute('data-v');
    const alarmById = x => S.alarmsView.find(a => a.id === x) || allAlarms().find(a => a.id === x);
    switch (act) {
      case 'floor': selectFloor(id); break;
      case 'building': backToBuilding(); break;
      case 'pms': openPms({}); break;
      case 'sources': S.showSources = !S.showSources; S.showSettings = false; renderPopups(); break;
      case 'settings': S.showSettings = !S.showSettings; S.showSources = false; renderPopups(); break;
      case 'close-pop': S.showSettings = false; S.showSources = false; renderPopups(); break;
      case 'filter': setFilter(v); break;
      case 'cat': toggleCat(v || null); break;
      case 'alarm': { const a = alarmById(id); if (a) focusAlarm(a); break; }
      case 'ack': ack(alarmById(id)); break;
      case 'pms-alarm': { const a = alarmById(id); if (a) pmsFromAlarm(a); break; }
      case 'pms-sel': if (S.selItem) pmsFromSel(S.selItem); break;
      case 'close-sel': closeSel(); break;
      case 'close-band': closeBand(); break;
      case 'std-tab': S.stdTab = v === 'floors' ? 'floors' : 'std'; renderBottom(); break;
      default: break;
    }
  });

  root.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target.closest('[data-act="alarm"]');
    if (t && e.target === t) { const a = S.alarmsView.find(x => x.id === t.getAttribute('data-id')); if (a) focusAlarm(a); }
  });

  root.addEventListener('input', e => {
    if (e.target.getAttribute('data-in') !== 'opacity') return;
    S.facadeOpacity = Number(e.target.value) || 0;
    const lbl = root.querySelector('[data-r-op]');
    if (lbl) lbl.textContent = String(S.facadeOpacity);
    applyFacade();
  });

  root.addEventListener('change', e => {
    const k = e.target.getAttribute('data-in');
    if (k === 'exploded') { S.exploded = !S.exploded; updateFloorTargets(); }
    else if (k === 'autorotate') { S.autoRotate = !S.autoRotate; lastInteract = 0; }
    else if (k === 'labels') { S.showLabels = !S.showLabels; rebuildTags(); }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.showSettings || S.showSources) { S.showSettings = false; S.showSources = false; renderPopups(); return; }
    backToBuilding();
  });

  document.addEventListener('dcim:theme', () => {
    S.isLight = !document.documentElement.classList.contains('dark');
    applyTheme();
  });

  // ---------------------------------------------------------------------------
  // "Canlı" veri (sunum: tohumlu mock)
  // ---------------------------------------------------------------------------
  function refreshEnergy() {
    const e = B.energy(energyTick);
    S.pue = e.pue; S.itKw = e.itKw; S.coolKw = e.coolKw;
  }
  function refreshEnv(tickNo) {
    const p = B.envPoints(tickNo);
    envTemps = p.temps;
    envHums = p.hums;
    S.lastUpdate = hhmmss(Date.now());
  }

  // ---------------------------------------------------------------------------
  // Başlatma
  // ---------------------------------------------------------------------------
  try {
    initScene();
  } catch (err) {
    console.warn('[BMS] 3D görünüm başlatılamadı (WebGL):', err && err.message ? err.message : err);
    S.webglError = 'Bu tarayıcıda 3D görünüm başlatılamadı (WebGL).';
    try { if (engine) engine.dispose(); } catch (e2) { /* yok say */ }
    engine = null; scene = null; camera = null;
    R.canvas.style.display = 'none';
    R.overlay.style.display = 'none';
    R.webgl.innerHTML = '<div class="webgl-error"><div><b>' + esc(S.webglError) + '</b>Kat seçici, alarm paneli ve kartlar çalışmaya devam eder. Donanım hızlandırmayı açıp sayfayı yenileyin.</div></div>';
  }

  let envTick = 0;
  refreshEnergy();
  refreshEnv(envTick);
  relinkRealAlarms();
  startDemo();
  onAlarmsChanged();
  renderBand();

  setInterval(() => { energyTick++; refreshEnergy(); refreshStd(); renderKpis(); if (S.stdTab === 'std') renderBottom(); }, (D.energy && D.energy.TICK_SEC ? D.energy.TICK_SEC : 3) * 1000);
  setInterval(() => { envTick++; refreshEnv(envTick); refreshStd(); renderEyebrow(); if (S.stdTab === 'std') renderBottom(); }, 5000);
  // Alarm yükü (10 dk) penceresi zamanla kayar
  setInterval(() => { refreshStd(); if (S.stdTab === 'std') renderBottom(); }, 15000);

  // URL (PMS'ten geliş / derin bağlantı): sahne ilk kareyi çizdikten sonra
  setTimeout(tryNav, 350);
})();
