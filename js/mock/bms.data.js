/* ==========================================================================
   DCIM Sunum — BMS · Bina Yönetimi mock verisi (DCIM.data.bms)
   Kaynak: new-ui/pages/showcase/bms-showcase (SHOWCASE_SITE, DATA_SOURCES, DEMO_TEXTS,
   ALARM_CATS / ALARM_CAT_RULE) ve bms-showcase.layout.ts (mockLayout).
   - KAT-1 "canlı": gerçek Kat-1 yerleşimi (js/layout-data.js) + DCIM.data (kabin/ekipman durumu,
     aktif alarmlar, enerji). Böylece BMS, sunumun diğer sayfalarındaki senaryoyla aynıdır
     (1BJ53/1BC37 yüksek sıcaklık, 1AV42 PDU-B faz kaybı, UPS A5 akü modu, KLIMA 109, UPS B7, 1CE51…).
   - KAT-2, KAT-3, IDC4 "demo": orijinaldeki gibi yaklaşık (deterministik) yerleşim ve tohumlu demo alarmları.
   Bağımlılık: js/layout-data.js, js/mock-data.js
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  const LAYOUT = window.DCIM_LAYOUT || null;

  /** SchemaItem piksel/hücre oranı (orijinal CELL_PX). Kat-1 yerleşimi 40 px'lik ızgaradadır. */
  const CELL_PX = 40;

  // ---------------------------------------------------------------------------
  // Saha yapılandırması (SHOWCASE_SITE ile aynı)
  // ---------------------------------------------------------------------------
  const SITE = {
    title: 'BMS · Bina Operatör Paneli',
    subtitle: 'Veri Merkezi · 3D bina ikizi',
    buildings: [
      {
        id: 'DC_ANA', name: 'Veri Merkezi Ana Bina',
        floors: [
          { id: 'KAT-1', name: 'KAT-1', level: 0, schId: 'LC0102010101000000', live: true, mock: { x0: 0, x1: 45, y0: 0, y1: 29, cabinets: 189, climate: 14, ups: 14, panels: 5 } },
          { id: 'KAT-2', name: 'KAT-2', level: 1, schId: 'LC0102010200000000', live: false, mock: { x0: 2, x1: 49, y0: 2, y1: 45, cabinets: 185, climate: 22, ups: 18, panels: 0 } },
          { id: 'KAT-3', name: 'KAT-3', level: 2, schId: 'LC0102010300000000', live: false, mock: { x0: 10, x1: 55, y0: 5, y1: 67, cabinets: 277, climate: 30, ups: 20, panels: 0 } }
        ]
      },
      {
        id: 'IDC4', name: 'IDC4 Ek Bina',
        floors: [
          { id: 'IDC4', name: 'IDC4', level: 0, schId: 'LC0102010400000000', live: false, mock: { x0: 7, x1: 45, y0: 2, y1: 39, cabinets: 148, climate: 18, ups: 25, panels: 0 } }
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------------
  // Alarm kategorileri (sağ panel çipleri) ve vitrin kuralı
  // ---------------------------------------------------------------------------
  const ALARM_CATS = [
    { id: 'hvac', label: 'HVAC & Soğutma', icon: 'pi pi-asterisk' },
    { id: 'power', label: 'Güç & Enerji (PMS)', icon: 'pi pi-bolt' },
    { id: 'env', label: 'Çevre & Ortam', icon: 'pi pi-cloud' },
    { id: 'safety', label: 'Yangın & Güvenlik', icon: 'pi pi-shield' },
    { id: 'it', label: 'BT / Kabinler', icon: 'pi pi-server' }
  ];

  /** Vitrin kuralı; üründe alm_grp safety/security ile değiştirilecek (06-ux-kapsam.md §4). */
  const ALARM_CAT_RULE = {
    safetyGroups: ['safety', 'security', 'fire'],
    safetyKeywords: ['fire', 'yangın', 'duman', 'smoke', 'leak', 'su kaçağı', 'kaçak', 'deprem', 'earthquake',
      'acil stop', 'emergency stop', 'kapı', 'door', 'erişim', 'access'],
    groups: { cooling: 'hvac', power: 'power', environment: 'env', whitespace: 'it' }
  };

  /** Sunum alarm grupları (mock-data.js grp adı) → AlarmGroupService kodu (ADR-0009 legacy eşlemesi). */
  const GROUP_CODE = { 'Soğutma': 'cooling', 'Enerji Grubu': 'power', 'Beyaz Alan': 'whitespace', 'Çevre': 'environment', 'Diğer': '' };

  // ---------------------------------------------------------------------------
  // Demo alarm şablonları (KAT-2, KAT-3, IDC4) — orijinal DEMO_TEXTS
  // ---------------------------------------------------------------------------
  const DEMO_TEXTS = [
    { kind: 'cabinet', txt: 'Kabin sıcaklığı yüksek', sev: 'alarm', cat: 'hvac' },
    { kind: 'cabinet', txt: 'Kabin sıcaklığı yüksek', sev: 'uyari', cat: 'hvac' },
    { kind: 'climate', txt: 'Klima dönüş sıcaklığı yüksek', sev: 'alarm', cat: 'hvac' },
    { kind: 'climate', txt: 'Haberleşme kaybı', sev: 'kayip', cat: 'hvac' },
    { kind: 'ups', txt: 'UPS akü modunda', sev: 'alarm', cat: 'power' },
    { kind: 'ups', txt: 'UPS çıkış yükü yüksek', sev: 'uyari', cat: 'power' },
    { kind: 'climate', txt: 'Ortam nemi yüksek', sev: 'uyari', cat: 'env' },
    { kind: 'climate', txt: 'Dış hava sıcaklığı yüksek (meteoroloji)', sev: 'uyari', cat: 'env' },
    { kind: 'cabinet', txt: 'Duman algılandı', sev: 'acil', cat: 'safety' },
    { kind: 'cabinet', txt: 'Kabin kapısı açık', sev: 'uyari', cat: 'safety' },
    { kind: 'climate', txt: 'Yerde su kaçağı (klima)', sev: 'acil', cat: 'safety' },
    { kind: 'cabinet', txt: 'PDU sigorta akımı', sev: 'acil', cat: 'it' },
    { kind: 'cabinet', txt: 'PDU faz yükü yüksek', sev: 'uyari', cat: 'it' },
    { kind: 'cabinet', txt: 'Haberleşme kaybı', sev: 'kayip', cat: 'it' }
  ];

  /**
   * Açılıştaki demo alarmları (her açılışta aynı): kat başına şablon sırası + öğe sırası (tür içinde).
   * Sonraki değişimler tohumlu üreticiyle (DEMO_SEED) 6-8 sn'de bir yapılır.
   */
  const DEMO_INITIAL = {
    'KAT-2': [{ tpl: 13, idx: 57, ageMin: 3 }, { tpl: 8, idx: 112, ageMin: 1 }, { tpl: 1, idx: 33, ageMin: 9, acked: true }],
    'KAT-3': [{ tpl: 2, idx: 11, ageMin: 6 }, { tpl: 5, idx: 4, ageMin: 14 }],
    'IDC4': [{ tpl: 6, idx: 7, ageMin: 5 }, { tpl: 9, idx: 61, ageMin: 2 }]
  };
  const DEMO_SEED = 20261015;

  // ---------------------------------------------------------------------------
  // Veri kaynakları penceresi (orijinal DATA_SOURCES: ürünün gerçek veri yolu anlatılır)
  // ---------------------------------------------------------------------------
  const DATA_SOURCES = [
    { what: 'KAT-1 yerleşimi (kabin, klima, UPS, pano, duvar)', kind: 'Canlı', src: 'SchemaService / SCH (katın kaydı: db_ASM SITE_Floors) — 2D/3D ikizle aynı yol' },
    { what: 'KAT-1 ekipman durum renkleri', kind: 'Canlı', src: 'SchemaService periyodik XDB sorgusu (buildFloorPollingConfig, durum: statusText/fill)' },
    { what: 'Aktif alarmlar ve sayaçlar (canlı kısım)', kind: 'Canlı', src: "XDB doc('CMA/S00') CMA_List, 10 sn" },
    { what: 'Alarm → kabin/klima eşleşmesi', kind: 'Canlı', src: 'io @cab özniteliği (kabin); klima: nokta kimliği ↔ cihaz kimliği (_DV atılarak)' },
    { what: 'Alarm kategorileri', kind: 'Temsili', src: 'alm_grp + anahtar kelime (vitrin kuralı; grup kodu AlarmGroupService, kurallar ALARM_CAT_RULE)' },
    { what: 'PMS ↔ BMS geçişi', kind: 'Canlı', src: 'URL parametreleri (BMS: floor, dev, cab, alarm, from; PMS: alarm, dev, from); konum eşlemesi SCH devId/cab' },
    { what: '"Gördüm" (canlı alarm)', kind: 'Canlı', src: 'CMA_List öğesine ack yazımı — Alarmlar sayfasıyla aynı yöntem' },
    { what: 'PUE', kind: 'Canlı', src: 'das.fetchInstantPUE(facDoc) / io_role=pue' },
    { what: 'BT ve soğutma gücü', kind: 'Canlı', src: "io_role=pow_tot (dev @load='it' / 'cooling'), 30 sn" },
    { what: 'KAT-1 kabin sıcaklık / nem dağılımı', kind: 'Canlı', src: 'io_role=cabin_temp / cabin_hum (KAT-1 tesis dokümanı), 30 sn' },
    { what: 'KAT-2, KAT-3, IDC4 yerleşimi', kind: 'Temsili', src: 'SCH sch_map (SQL) gelirse gerçek yerleşim, gelmezse yaklaşık yerleşim (kat rozetinde yazar)' },
    { what: 'KAT-2, KAT-3, IDC4 alarmları ve durumları', kind: 'Demo', src: "Tarayıcıda rastgele üretilir, 6-8 sn'de değişir; \"Gördüm\" yalnız ekranda işaretler" },
    { what: 'Bina kabuğu (dış duvar, cephe camı, çatı, giriş, IDC4 bağlantısı)', kind: 'Temsili', src: 'Kat sınırları SCH ölçülerinden; mimari çizim değildir' }
  ];

  // ---------------------------------------------------------------------------
  // Yerleşimler (bms-showcase.layout.ts)
  // ---------------------------------------------------------------------------
  /** Kabin kodu eşleştirmesi için normal biçim: büyük harf, '_' sonrası ekler ve baştaki 'K' (rakamdan önce) atılır. */
  function normCab(v) {
    let s = String(v == null ? '' : v).trim().toUpperCase();
    if (!s) return '';
    const us = s.indexOf('_');
    if (us > 0) s = s.substring(0, us);
    if (/^K\d/.test(s)) s = s.substring(1);
    return s;
  }

  /**
   * Yaklaşık yerleşim: solda UPS/pano odası, üst ve alt duvar boyunca klimalar, ortada sıcak/soğuk
   * koridorlu kabin sıraları. Kabin sayısı alana sığmazsa kabin genişliği daraltılır.
   */
  function mockLayout(spec, floorNo) {
    const { x0, x1, y0, y1 } = spec;
    const items = [];
    const walls = [
      { x1: x0, y1: y0, x2: x1, y2: y0 },
      { x1: x1, y1: y0, x2: x1, y2: y1 },
      { x1: x1, y1: y1, x2: x0, y2: y1 },
      { x1: x0, y1: y1, x2: x0, y2: y0 }
    ];
    const H = y1 - y0;
    const partX = x0 + 5.5;
    // UPS odası bölme duvarı (kapı boşluklu)
    walls.push({ x1: partX, y1: y0, x2: partX, y2: y0 + H * 0.45 });
    walls.push({ x1: partX, y1: y0 + H * 0.45 + 2.5, x2: partX, y2: y1 });

    // UPS: iki sütun
    const upsRows = Math.ceil(spec.ups / 2);
    const upsPitch = Math.min(1.7, (H - 6) / Math.max(1, upsRows));
    for (let i = 0; i < spec.ups; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      items.push({
        kind: 'ups', key: 'ups_' + i, label: 'UPS-' + floorNo + String.fromCharCode(65 + col) + (row + 1), devId: 'D' + floorNo + '_UPS_' + String.fromCharCode(65 + col) + (row + 1),
        cx: x0 + 1.6 + col * 2.4, cy: y0 + 1.8 + row * upsPitch, w: 1.9, d: upsPitch * 0.8, rot: 0
      });
    }
    // Klima panoları: oda altında
    for (let i = 0; i < spec.panels; i++) {
      items.push({
        kind: 'panel', key: 'panel_' + i, label: 'KP-' + floorNo + (i + 1), devId: '',
        cx: x0 + 1.2 + (i % 3) * 1.6, cy: y1 - 1.2 - Math.floor(i / 3) * 1.4, w: 1.2, d: 0.8, rot: 0
      });
    }
    // Klimalar: üst ve alt duvar boyunca eşit aralıklı
    const cx0 = partX + 2, cx1 = x1 - 2;
    const top = Math.ceil(spec.climate / 2), bottom = spec.climate - top;
    const placeRow = (n, y, startIdx) => {
      for (let i = 0; i < n; i++) {
        items.push({
          kind: 'climate', key: 'climate_' + (startIdx + i), label: 'KLM-' + floorNo + String(startIdx + i + 1).padStart(2, '0'), devId: '',
          cx: cx0 + ((i + 0.5) / n) * (cx1 - cx0), cy: y, w: 2.4, d: 1.3, rot: 0
        });
      }
    };
    placeRow(top, y0 + 1.2, 0);
    placeRow(bottom, y1 - 1.2, top);

    // Kabin sıraları (sıcak/soğuk koridor)
    const rx0 = partX + 1.5, rx1 = x1 - 1.2;
    const ry0 = y0 + 3.2, ry1 = y1 - 3.2;
    const depth = 2, aisle = 2;
    const rows = Math.max(1, Math.floor((ry1 - ry0 + aisle) / (depth + aisle)));
    const W = rx1 - rx0;
    const perRow = Math.ceil(spec.cabinets / rows);
    const gaps = Math.floor(perRow / 10);
    const cw = Math.max(0.9, Math.min(1.5, (W - gaps) / Math.max(1, perRow)));
    const fit = Math.max(1, Math.floor((W - gaps) / cw));
    let n = 0;
    for (let r = 0; r < rows && n < spec.cabinets; r++) {
      const cy = ry0 + r * (depth + aisle) + depth / 2;
      const rowLetter = String.fromCharCode(65 + r);
      const count = Math.min(fit, perRow, spec.cabinets - n);
      const used = count * cw + Math.floor(count / 10);
      let x = rx0 + (W - used) / 2;
      for (let i = 0; i < count; i++) {
        if (i > 0 && i % 10 === 0) x += 1;
        items.push({
          kind: 'cabinet', key: 'cab_' + r + '_' + i, label: floorNo + rowLetter + String(i + 1).padStart(2, '0'), devId: '',
          cx: x + cw / 2, cy, w: cw * 0.94, d: depth, rot: 0
        });
        x += cw;
        n++;
      }
    }
    return { items, walls, bounds: { x0: x0 - 0.5, y0: y0 - 0.5, x1: x1 + 0.5, y1: y1 + 0.5 }, source: 'mock' };
  }

  /** Gerçek Kat-1 yerleşimi (SCH, px) → sahne modeli (hücre). Orijinaldeki onSchema + layoutFrom karşılığı. */
  function kat1Layout() {
    if (!LAYOUT) return { items: [], walls: [], bounds: { x0: 0, y0: 0, x1: 45, y1: 29 }, source: 'sql' };
    const kindOf = t => (t === 'cabinet' || t === 'cabinet-bcm' ? 'cabinet' : t === 'climate' ? 'climate' : t === 'climate-panel' ? 'panel' : t === 'ups' ? 'ups' : null);
    const items = [];
    LAYOUT.items.forEach(it => {
      const kind = kindOf(it.type);
      if (!kind) return;
      const w = Math.max(0.3, (it.w || CELL_PX) / CELL_PX), d = Math.max(0.3, (it.h || CELL_PX) / CELL_PX);
      items.push({ kind, key: String(it.id), label: String(it.label || ''), devId: String(it.devId || ''), cx: it.x / CELL_PX + w / 2, cy: it.y / CELL_PX + d / 2, w, d, rot: Number(it.rotation) || 0 });
    });
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    items.forEach(i => { b.x0 = Math.min(b.x0, i.cx - i.w / 2); b.y0 = Math.min(b.y0, i.cy - i.d / 2); b.x1 = Math.max(b.x1, i.cx + i.w / 2); b.y1 = Math.max(b.y1, i.cy + i.d / 2); });
    return { items, walls: [], bounds: { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 }, source: 'sql' };
  }

  /** Kat-1 SCH durum renkleri (alarm değil): kabin/ekipman durumu → önem. Anahtar: SCH öğe kimliği. */
  function kat1Status() {
    const map = new Map();
    const sev = s => (s === 'alarm' ? 'alarm' : s === 'warning' ? 'uyari' : s === 'lost' ? 'kayip' : 'normal');
    (D.cabinets || []).concat(D.climates || [], D.ups || [], D.panels || []).forEach(x => {
      const s = sev(x.status);
      if (s !== 'normal') map.set(String(x.id), s);
    });
    return map;
  }

  /**
   * Kat-1 aktif alarmları (DCIM.data.activeAlarms; Alarmlar sayfasıyla aynı kayıtlar).
   * Önem: level lost → Veri yok (Kayıp), alarm → Alarm, warning → Uyarı (alarm-severity.util kuralı).
   */
  function kat1Alarms() {
    return (D.activeAlarms || []).map(a => ({
      alarmId: a.id,
      rid: a.rid,
      sev: a.level === 'lost' ? 'kayip' : a.level === 'alarm' ? 'alarm' : a.level === 'warning' ? 'uyari' : 'normal',
      desc: a.desc,
      txt: a.txt,
      grp: GROUP_CODE[a.grp] != null ? GROUP_CODE[a.grp] : String(a.grp || ''),
      // CMA "type" alanı: kapak/kilit alarmları erişim olayıdır (vitrin kuralında Yangın & Güvenlik)
      type: a.deviceType === 'lock' ? 'door access' : '',
      deviceType: a.deviceType,
      target: a.target || '',
      location: a.location,
      ts: a.tim instanceof Date ? a.tim.getTime() : new Date(a.tim).getTime(),
      acked: !!a.ack
    }));
  }

  /** Enerji KPI'ları (PMS ile aynı kaynak: DCIM.data.energy.overview, 3 sn tik). */
  function energy(tick) {
    try {
      const o = D.energy && D.energy.overview ? D.energy.overview(tick || 0) : null;
      if (o) return { pue: o.pue, itKw: o.itKw, coolKw: o.coolKw };
    } catch (e) { /* yok say */ }
    return { pue: D.site && D.site.pue || 1.42, itKw: 606, coolKw: 241 };
  }

  /**
   * Kat-1 kabin sıcaklık / nem noktaları (her kabinde üst-orta-alt sıcaklık + nem; haberleşmesi kopuk kabin hariç).
   * tick ile ±0,15 °C tohumlu gürültü eklenir (canlı görünüm).
   */
  function envPoints(tick) {
    const temps = [], hums = [];
    const jit = (key, amp) => {
      const r = D.rng(D.hash(key + '#' + (tick || 0)))();
      return (r - 0.5) * 2 * amp;
    };
    (D.cabinets || []).forEach(c => {
      if (c.status === 'lost') return;
      [['T', c.tempTop], ['M', c.tempMid], ['L', c.tempLow]].forEach(([k, v]) => {
        if (Number.isFinite(v)) temps.push(Math.round((v + jit(c.code + k, 0.15)) * 10) / 10);
      });
      if (Number.isFinite(c.humidity)) hums.push(c.humidity + jit(c.code + 'H', 0.6));
    });
    return { temps, hums };
  }

  D.bms = {
    CELL_PX,
    SITE,
    ALARM_CATS,
    ALARM_CAT_RULE,
    DEMO_TEXTS,
    DEMO_INITIAL,
    DEMO_SEED,
    DATA_SOURCES,
    normCab,
    mockLayout,
    kat1Layout,
    kat1Status,
    kat1Alarms,
    energy,
    envPoints
  };
})();
