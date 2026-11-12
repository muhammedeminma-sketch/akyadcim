/* DCIM Sunum — kurgusal bina yerleşimi üreticisi.
 *
 * Sunum gerçek saha verisi içermez: 3 katlı kurgusal bir veri merkezi binası burada
 * deterministik olarak üretilir ve js/layout-data.js'e yazılır.
 *
 *   node tools/gen-mock-layout.js            → js/layout-data.js
 *
 * Çıktı biçimi eski SCH tabanlı yerleşimle aynıdır (items / texts / bgPath / layer1Rects /
 * fitViewBox); ek olarak her kat `salons` bölgelerini ve kabinler `facing` (ön yüz yönü)
 * alanını taşır.
 *   window.DCIM_FLOOR_LAYOUTS = [kat1, kat2, kat3]
 *   window.DCIM_LAYOUT        = kat1 (geriye uyumluluk)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MAP_W = 2000;
const MAP_H = 1640;
// Kabin satırı harf çiftleri (I, O, Q, W, X atlanır)
const LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ'.split('');

function r1(v) { return Math.round(v * 10) / 10; }

function floorBuilder(floor) {
  const L = {
    floor,
    schId: 'LC-MOCK-K' + floor + '-00',
    title: '',
    mapW: MAP_W, mapH: MAP_H, gridCols: 50, gridRows: 41,
    fitViewBox: '',
    salons: [],
    texts: [],
    items: [],
    bgPath: '',
    layer1Rects: []
  };
  const path = [];
  let idSeq = 0;
  const nid = (kind, x, y, w, h) => 'mock_' + kind + '_' + floor + '_' + (++idSeq) + '_' + Math.round(x) + '_' + Math.round(y) + '_' + Math.round(w) + '_' + Math.round(h);
  const api = {
    L,
    wall(x1, y1, x2, y2) { path.push('M ' + r1(x1) + ' ' + r1(y1) + ' L ' + r1(x2) + ' ' + r1(y2)); },
    // Kapı boşluklu dikdörtgen oda duvarı. doors: [{side:'n'|'s'|'e'|'w', at, w}]
    room(x, y, w, h, doors) {
      const sides = {
        n: [[x, y], [x + w, y]], s: [[x, y + h], [x + w, y + h]],
        w: [[x, y], [x, y + h]], e: [[x + w, y], [x + w, y + h]]
      };
      Object.keys(sides).forEach(k => {
        const [[ax, ay], [bx, by]] = sides[k];
        const ds = (doors || []).filter(d => d.side === k).sort((a, b) => a.at - b.at);
        const horiz = ay === by;
        let cur = horiz ? ax : ay;
        const end = horiz ? bx : by;
        ds.forEach(d => {
          const s = (horiz ? ax : ay) + d.at;
          if (s > cur) horiz ? api.wall(cur, ay, s, ay) : api.wall(ax, cur, ax, s);
          // kapı kanadı (çeyrek yay yerine kısa çizgi)
          if (horiz) api.wall(s, ay, s, ay + (k === 'n' ? 1 : -1) * d.w * 0.8);
          else api.wall(ax, s, ax + (k === 'w' ? 1 : -1) * d.w * 0.8, s);
          cur = s + d.w;
        });
        if (cur < end) horiz ? api.wall(cur, ay, end, ay) : api.wall(ax, cur, ax, end);
      });
    },
    column(x, y, s) { s = s || 18; path.push('M ' + x + ' ' + y + ' L ' + (x + s) + ' ' + y + ' L ' + (x + s) + ' ' + (y + s) + ' L ' + x + ' ' + (y + s) + ' Z'); },
    text(text, x, y) { L.texts.push({ text, x: r1(x), y: r1(y) }); },
    rect1(x, y, w, h, text) { L.layer1Rects.push({ id: nid('l1', x, y, w, h), x, y, w, h, text: text || '' }); },
    salon(id, name, x, y, w, h) { L.salons.push({ id, name, x, y, w, h }); },
    item(o) { o.id = nid(o.type === 'cabinet' ? 'cab' : o.type, o.x, o.y, o.w, o.h); L.items.push(o); return o; },
    finish(title) {
      L.title = title;
      L.bgPath = path.join(' ');
      const xs = [], ys = [];
      path.join(' ').replace(/(-?[\d.]+) (-?[\d.]+)/g, (m, a, b) => { xs.push(+a); ys.push(+b); return m; });
      L.items.forEach(i => { xs.push(i.x, i.x + i.w); ys.push(i.y, i.y + i.h); });
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const m = 48;
      L.fitViewBox = [x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m].map(Math.round).join(' ');
      return L;
    }
  };
  return api;
}

/* Kabin POD'u: 2 karşılıklı sıra.
 *   orient 'h' → sıralar yatay (kabinler x boyunca), üst sıra kuzeye, alt sıra güneye bakar
 *   orient 'v' → sıralar dikey (kabinler y boyunca), sol sıra batıya, sağ sıra doğuya bakar
 * inRow: sıra sonlarına sıra-içi klima (sadece 'h')
 */
function pod(api, o) {
  const { floor, name, salon, x, y, n, orient, rows } = o;
  const cw = 44, cd = 70, aisle = 56;
  const cabs = [];
  const n2 = o.n2 != null ? o.n2 : n;
  [0, 1].forEach(ri => {
    const count = ri === 0 ? n : n2;
    const col = String(floor) + rows[ri];
    for (let k = 0; k < count; k++) {
      const num = String(k + 1).padStart(2, '0');
      let it;
      if (orient === 'h') {
        it = { type: 'cabinet', label: col + num, x: x + k * cw, y: y + ri * (cd + aisle), w: cw, h: cd, facing: ri === 0 ? 'N' : 'S' };
      } else {
        it = { type: 'cabinet', label: col + num, x: x + ri * (cd + aisle), y: y + k * cw, w: cd, h: cw, facing: ri === 0 ? 'W' : 'E' };
      }
      it.devId = it.label;
      it.col = col;
      it.pod = name;
      it.salon = salon;
      cabs.push(api.item(it));
    }
  });
  const len = Math.max(n, n2) * cw;
  if (orient === 'h') {
    api.text(name, x + len / 2, y + cd + aisle / 2);
    api.rect1(x - 6, y + cd, len + 12, aisle, name + ' Sıcak Koridor Kapama');
  } else {
    api.text(name, x + cd + aisle / 2, y + len / 2);
    api.rect1(x + cd, y - 6, aisle, len + 12, name + ' Sıcak Koridor Kapama');
  }
  return cabs;
}

// Tek sıra (ağ kabinleri)
function row(api, o) {
  const { floor, name, salon, x, y, n, rowCode, facing } = o;
  const cw = 44, cd = 70;
  const col = String(floor) + rowCode;
  for (let k = 0; k < n; k++) {
    const num = String(k + 1).padStart(2, '0');
    api.item({ type: 'cabinet', label: col + num, devId: col + num, x: x + k * cw, y, w: cw, h: cd, col, pod: name, salon, facing: facing || 'S' });
  }
  api.text(name, x + (n * cw) / 2, y - 16);
}

function climate(api, floor, salon, num, x, y, vertical, lo) {
  const w = vertical ? 54 : 128, h = vertical ? 128 : 54;
  const it = { type: 'climate', label: 'KLIMA ' + num, devId: 'KAT' + floor + '_' + salon + '_KLM' + num + '_DV', x, y, w, h, salon };
  if (lo) it.lo = lo;
  return api.item(it);
}
function inRowClimate(api, floor, salon, num, x, y, w, h) {
  return api.item({ type: 'climate', label: 'KLIMA ' + num, devId: 'KAT' + floor + '_' + salon + '_KLM' + num + '_DV', x, y, w, h, salon, inRow: true });
}
function ups(api, floor, salon, name, x, y, lo) {
  return api.item({ type: 'ups', label: 'UPS ' + name, devId: 'KAT' + floor + '_' + salon + '_' + name + '_UPS', x, y, w: 64, h: 40, lo: lo || [0, -32], salon });
}
function panel(api, floor, salon, label, key, x, y, lo) {
  return api.item({ type: 'climate-panel', label, devId: 'KAT' + floor + '_' + salon + '_' + key + '_KLM_PANO_DV', x, y, w: 34, h: 40, lo: lo || [0, -34], salon });
}

/* ---------------------------------------------------------------- KAT 1 */
function kat1() {
  const api = floorBuilder(1);
  const F = 1, S = 'SAL1';
  // Bina dış duvarı ve odalar
  api.room(80, 80, 1880, 1520, [{ side: 's', at: 1700, w: 70 }]);
  api.room(100, 100, 1620, 1150, [{ side: 's', at: 1040, w: 90 }, { side: 'e', at: 980, w: 80 }]); // Sistem salonu
  api.room(100, 1270, 1000, 310, [{ side: 'n', at: 860, w: 70 }]);  // UPS odası
  api.room(1120, 1270, 600, 310, [{ side: 'n', at: 40, w: 70 }]);  // Elektrik odası
  api.room(1740, 100, 200, 560, [{ side: 'w', at: 470, w: 70 }]);  // Akü odası
  api.room(1740, 680, 200, 900, [{ side: 'w', at: 120, w: 70 }]);  // Operatör / NOC
  for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 3; cy++) api.column(420 + cx * 360, 300 + cy * 300);
  api.salon('S1', '1. Salon', 100, 100, 1620, 1150);

  // Ağ sıraları (NW-1, NW-2)
  row(api, { floor: F, name: 'NW-1', salon: 'S1', x: 290, y: 190, n: 10, rowCode: 'NA', facing: 'S' });
  row(api, { floor: F, name: 'NW-2', salon: 'S1', x: 1010, y: 190, n: 10, rowCode: 'NB', facing: 'S' });

  // POD-1 .. POD-10 (yatay, 3 sıra)
  let li = 0;
  const rowsFor = () => [LETTERS[li++], LETTERS[li++]].map(l => 'D' + l);
  const A = [[200, 330], [564, 330], [928, 330], [1292, 330]];
  const B = [[200, 620], [564, 620], [928, 620], [1292, 620]];
  [...A, ...B].forEach((p, i) => pod(api, { floor: F, name: 'POD-' + (i + 1), salon: 'S1', x: p[0], y: p[1], n: 7, orient: 'h', rows: rowsFor() }));
  pod(api, { floor: F, name: 'POD-9', salon: 'S1', x: 200, y: 910, n: 6, orient: 'h', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-10', salon: 'S1', x: 520, y: 910, n: 5, n2: 4, orient: 'h', rows: rowsFor() });
  // Müşteri kafes alanı (yerleşim çizimi)
  api.room(860, 900, 720, 300, [{ side: 'n', at: 330, w: 60 }]);
  api.text('MÜŞTERİ KAFES ALANI', 1220, 1050);
  api.rect1(880, 920, 200, 120, 'Kafes K-01 (boş)');
  api.rect1(1100, 920, 200, 120, 'Kafes K-02 (boş)');
  api.rect1(1320, 920, 240, 120, 'Kafes K-03 (rezerve)');

  // Klimalar: batı ve doğu duvarı (dikey) + kuzey duvarı
  [101, 102, 103, 104, 105].forEach((n, i) => climate(api, F, S, n, 110, 170 + i * 210, true, [62, 0]));
  [106, 107, 108, 109, 110].forEach((n, i) => climate(api, F, S, n, 1656, 170 + i * 210, true, [-62, 0]));
  climate(api, F, S, 111, 560, 108, false, [0, 42]);
  climate(api, F, S, 112, 1300, 108, false, [0, 42]);

  // UPS odası: A hattı (kuzey) ve B hattı (güney)
  for (let i = 0; i < 7; i++) ups(api, F, S, 'A' + (i + 1), 150 + i * 120, 1320, [0, -32]);
  for (let i = 0; i < 7; i++) ups(api, F, S, 'B' + (i + 1), 150 + i * 120, 1500, [0, 34]);
  api.text('UPS ODASI', 600, 1430);
  api.text('A Hattı', 150, 1290); api.text('B Hattı', 150, 1565);

  // Elektrik odası panoları
  panel(api, F, S, 'A1 KLIMA PANOSU', 'A1', 1180, 1330);
  panel(api, F, S, 'A2 Klima Panosu', 'A2', 1260, 1330);
  panel(api, F, S, 'A3 Klima Panosu', 'A3', 1340, 1400, [0, -34]);
  panel(api, F, S, 'B1 Klima Panosu', 'B1', 1180, 1480, [0, 34]);
  panel(api, F, S, 'B2 Klima Panosu', 'B2', 1260, 1480, [0, 34]);
  panel(api, F, S, 'Klimalar Kontrol Panosu', 'KONTROL', 1560, 1400, [0, -34]);
  api.text('ELEKTRİK ODASI', 1420, 1430);
  api.rect1(1380, 1300, 120, 60, 'Ana Dağıtım Panosu (ADP)');
  api.rect1(1380, 1480, 120, 60, 'Master Pano');
  api.text('Ana Dağıtım Panosu', 1440, 1330);

  api.text('AKÜ ODASI', 1840, 380);
  api.rect1(1770, 140, 140, 100, 'Akü Rafı A');
  api.rect1(1770, 260, 140, 100, 'Akü Rafı B');
  api.text('OPERATÖR ODASI (NOC)', 1840, 1100);
  api.text('1. KAT SİSTEM SALONU', 910, 570);
  api.rect1(130, 1180, 40, 40, 'Yangın Söndürme Paneli');
  api.text('Yangın Paneli', 150, 1170);
  api.rect1(1660, 1180, 30, 40, 'Yangın Tüpü (FM-200)');
  return api.finish('1. Kat 1. Salon Sistem Odası');
}

/* ---------------------------------------------------------------- KAT 2 */
function kat2() {
  const api = floorBuilder(2);
  const F = 2;
  api.room(80, 80, 1880, 1520, [{ side: 's', at: 920, w: 80 }]);
  api.room(100, 100, 860, 1060, [{ side: 's', at: 700, w: 80 }]);   // Salon 1
  api.room(1000, 100, 940, 1060, [{ side: 's', at: 120, w: 80 }]);  // Salon 2
  api.room(100, 1300, 760, 280, [{ side: 'n', at: 620, w: 70 }]);   // UPS odası
  api.room(1140, 1300, 800, 280, [{ side: 'n', at: 60, w: 70 }]);   // Elektrik odası
  api.text('KORİDOR', 1000, 1230);
  api.salon('S1', '1. Salon', 100, 100, 860, 1060);
  api.salon('S2', '2. Salon', 1000, 100, 940, 1060);
  for (let cy = 0; cy < 3; cy++) { api.column(520, 330 + cy * 300); api.column(1460, 330 + cy * 300); }

  // Salon 1: dikey PODlar
  let li = 0;
  const rowsFor = () => [LETTERS[li++], LETTERS[li++]].map(l => 'E' + l);
  pod(api, { floor: F, name: 'POD-11', salon: 'S1', x: 200, y: 240, n: 8, orient: 'v', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-12', salon: 'S1', x: 600, y: 240, n: 8, orient: 'v', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-13', salon: 'S1', x: 200, y: 680, n: 7, orient: 'v', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-14', salon: 'S1', x: 600, y: 680, n: 7, n2: 6, orient: 'v', rows: rowsFor() });
  // Salon 2: yatay PODlar
  pod(api, { floor: F, name: 'POD-15', salon: 'S2', x: 1110, y: 220, n: 8, orient: 'h', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-16', salon: 'S2', x: 1110, y: 520, n: 8, orient: 'h', rows: rowsFor() });
  pod(api, { floor: F, name: 'POD-17', salon: 'S2', x: 1110, y: 820, n: 6, orient: 'h', rows: rowsFor() });
  row(api, { floor: F, name: 'NW-3', salon: 'S2', x: 1530, y: 860, n: 7, rowCode: 'NC', facing: 'N' });

  [201, 202, 203].forEach((n, i) => climate(api, F, 'SAL1', n, 140 + i * 290, 108, false, [0, 42]));
  [204, 205, 206].forEach((n, i) => climate(api, F, 'SAL1', n, 140 + i * 290, 1098, false, [0, -42]));
  [207, 208, 209].forEach((n, i) => climate(api, F, 'SAL2', n, 1080 + i * 300, 108, false, [0, 42]));
  [210, 211].forEach((n, i) => climate(api, F, 'SAL2', n, 1876, 300 + i * 360, true, [-62, 0]));

  for (let i = 0; i < 4; i++) ups(api, F, 'SAL1', 'C' + (i + 1), 160 + i * 130, 1350, [0, -32]);
  for (let i = 0; i < 4; i++) ups(api, F, 'SAL2', 'D' + (i + 1), 160 + i * 130, 1500, [0, 34]);
  api.text('UPS ODASI', 480, 1450);
  panel(api, F, 'SAL1', 'C1 Klima Panosu', 'C1', 1200, 1360);
  panel(api, F, 'SAL2', 'D1 Klima Panosu', 'D1', 1290, 1360);
  panel(api, F, 'SAL2', 'Kat 2 Kontrol Panosu', 'KONTROL', 1380, 1360);
  api.text('ELEKTRİK ODASI', 1540, 1450);
  api.rect1(1640, 1340, 140, 70, 'Kat 2 Dağıtım Panosu');
  api.text('2. KAT 1. SALON', 530, 205);
  api.text('2. KAT 2. SALON', 1470, 205);
  api.rect1(130, 1050, 40, 40, 'Yangın Söndürme Paneli');
  api.rect1(1890, 1080, 30, 40, 'Yangın Tüpü (FM-200)');
  return api.finish('2. Kat Sistem Salonları');
}

/* ---------------------------------------------------------------- KAT 3 */
function kat3() {
  const api = floorBuilder(3);
  const F = 3;
  api.room(80, 80, 1880, 1520, [{ side: 's', at: 1500, w: 80 }]);
  api.room(100, 100, 1300, 860, [{ side: 'e', at: 700, w: 80 }]);   // Salon 1 (sıra içi soğutma)
  api.room(1420, 100, 520, 500, [{ side: 's', at: 60, w: 70 }]);    // UPS + elektrik
  api.room(100, 980, 1300, 600, [{ side: 'n', at: 1100, w: 80 }]); // Ofis / depo
  api.salon('S1', '1. Salon', 100, 100, 1300, 860);
  api.text('3. KAT 1. SALON (SIRA İÇİ SOĞUTMA)', 750, 160);

  let li = 0;
  const rowsFor = () => [LETTERS[li++], LETTERS[li++]].map(l => 'F' + l);
  const pods = [[200, 240], [760, 240], [200, 600], [760, 600]];
  let kn = 301;
  pods.forEach((p, i) => {
    pod(api, { floor: F, name: 'POD-' + (21 + i), salon: 'S1', x: p[0] + 54, y: p[1], n: 9, orient: 'h', rows: rowsFor() });
    // sıra sonlarına sıra içi klima (2 adet / POD)
    inRowClimate(api, F, 'SAL1', kn++, p[0], p[1], 50, 70);
    inRowClimate(api, F, 'SAL1', kn++, p[0] + 54 + 9 * 44 + 4, p[1] + 126, 50, 70);
  });
  for (let i = 0; i < 2; i++) ups(api, F, 'SAL1', 'E' + (i + 1), 1460 + i * 110, 160, [0, -32]);
  for (let i = 0; i < 2; i++) ups(api, F, 'SAL1', 'F' + (i + 1), 1460 + i * 110, 300, [0, 34]);
  panel(api, F, 'SAL1', 'E1 Klima Panosu', 'E1', 1760, 170);
  panel(api, F, 'SAL1', 'Kat 3 Kontrol Panosu', 'KONTROL', 1840, 170);
  api.text('UPS / ELEKTRİK ODASI', 1680, 470);
  api.text('OFİS VE DEPO', 750, 1280);
  api.rect1(160, 1040, 300, 160, 'Kurulum Hazırlık Alanı');
  api.rect1(500, 1040, 300, 160, 'Yedek Parça Deposu');
  api.rect1(130, 880, 40, 40, 'Yangın Söndürme Paneli');
  return api.finish('3. Kat Sistem Salonu');
}

const floors = [kat1(), kat2(), kat3()];
const out = '/* DCIM Sunum — kurgusal bina yerleşimi (3 kat).\n' +
  ' * Gerçek saha verisi değildir; tools/gen-mock-layout.js ile üretildi (elle düzenlemeyin). */\n' +
  'window.DCIM_FLOOR_LAYOUTS = ' + JSON.stringify(floors) + ';\n' +
  'window.DCIM_LAYOUT = window.DCIM_FLOOR_LAYOUTS[0];\n';
const target = path.join(__dirname, '..', 'js', 'layout-data.js');
fs.writeFileSync(target, out);
floors.forEach(f => {
  const t = {};
  f.items.forEach(i => { t[i.type] = (t[i.type] || 0) + 1; });
  console.log('Kat ' + f.floor + ':', JSON.stringify(t), 'salons=' + f.salons.length, 'fit=' + f.fitViewBox);
});
console.log('yazıldı:', target, out.length, 'bayt');
