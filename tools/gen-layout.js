// Generates dcim-presentation/js/layout-data.js from the Angular sch-first-row.data.ts
// Usage: node gen-layout.js <path-to-sch-first-row.data.ts> <out-file>
const fs = require('fs');
const [, , src, out] = process.argv;
const s = fs.readFileSync(src, 'utf8');
const data = eval('(' + s.slice(s.indexOf('=') + 1).trim().replace(/;\s*$/, '') + ')');

const info = data[0].schema_info;
const dxf = info.dxfImport;
const GRID = 40;
const r1 = n => Math.round(n * 10) / 10;

// Kabin kolonlarını POD'lara eşle (DXF'teki POD-1..POD-10 yazılarının konumlarına göre)
const PAIR_OF = { '1AS': 0, '1AV': 0, '1AZ': 1, '1BC': 1, '1BG': 2, '1BJ': 2, '1BN': 3, '1BQ': 3, '1BU': 4, '1BX': 4, '1CB': 5, '1CE': 5 };

const items = [];
for (const group of data[1].entities) {
  for (const it of group.items) {
    const x = it.position.x_start * GRID;
    const y = it.position.y_start * GRID;
    const w = (it.dimensions.size_x / 60) * GRID;
    const h = (it.dimensions.size_y / 60) * GRID;
    const item = {
      type: group.type,
      id: it.sch_id,
      label: it.label,
      devId: it.dev_id,
      x: r1(x), y: r1(y), w: r1(w), h: r1(h)
    };
    if (it.position.labelOffset) item.lo = [it.position.labelOffset.x, it.position.labelOffset.y];
    if (group.type === 'cabinet') {
      const col = it.label.slice(0, 3);
      const pair = PAIR_OF[col];
      const top = y + h / 2 < 640;
      item.col = col;
      item.pod = pair === 0 ? (top ? 'NS2' : 'NS1') : (top ? 'POD-' + (11 - pair) : 'POD-' + pair);
    }
    items.push(item);
  }
}

const texts = dxf.detectedTexts.map(t => ({ text: t.text, x: r1(t.x), y: r1(t.y) }));

const layout = {
  schId: info.sch_id,
  title: info.page_title,
  mapW: info.map_size.x * GRID,
  mapH: info.map_size.y * GRID,
  gridCols: info.map_size.x,
  gridRows: info.map_size.y,
  fitViewBox: info.fit_viewbox,
  texts,
  items,
  bgPath: dxf.backgroundAsset.svgPathLayer1 || dxf.backgroundAsset.svgPath
};

const header = '/* DCIM Sunum — Kat 1 Salon 1 yerleşim verisi.\n' +
  ' * Kaynak: front_end/projects/user-app/src/app/new-ui/pages/digital-twin-3d/sch-first-row.data.ts\n' +
  ' * (gen-layout.js ile üretildi; elle düzenlemeyin.) */\n';
fs.writeFileSync(out, header + 'window.DCIM_LAYOUT = ' + JSON.stringify(layout) + ';\n');
console.log('items', items.length, 'texts', texts.length, 'bytes', fs.statSync(out).size);
