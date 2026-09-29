// Statik sayfalarda kullanılan Tailwind/özel sınıfların derlenmiş CSS'te var olup olmadığını denetler.
// Kullanım: node tools/check-classes.js   (dcim-presentation kökünden)
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// --list: build-extra-css.js için ham eksik listesi (tailwind-extra.css hariç tutulur)
const cssFiles = fs.readdirSync(path.join(root, 'css')).filter(f => f.endsWith('.css')).map(f => 'css/' + f)
  .filter(f => f !== 'css/tailwind-extra.css' || !process.argv.includes('--list'));
const css = cssFiles.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

// CSS içindeki tüm sınıf seçicilerini topla (kaçış karakterlerini çöz)
const known = new Set();
const re = /\.((?:\\.|[A-Za-z0-9_-])+)/g;
let m;
while ((m = re.exec(css))) known.add(m[1].replace(/\\(.)/g, '$1'));

const jsFiles = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? jsFiles(path.join(dir, e.name)) : e.name.endsWith('.js') && e.name !== 'layout-data.js' ? [path.join(dir, e.name)] : []);
const files = fs.readdirSync(root).filter(f => f.endsWith('.html')).map(f => path.join(root, f))
  .concat(jsFiles(path.join(root, 'js')));

// Sınıf olmayan ama sınıf listelerinde görülebilecek JS/HTML kancaları
const IGNORE = new Set(['dark', 'light', 'group', 'peer', 'is-open', 'is-selected', 'is-dimmed', 'selected', 'hovered', 'is-dragging', 'is-auto-rotating',
  'schematic-item', 'item-body', 'rear-stack', 'dxf-background-layer', 'schematic-label', 'on-demand', 'door-state', 'lock-card', 'cabinet-grid', 'operator-toolbar', 'user-menu-container', 'login-host', 'dcim-toast', 'dcim-toast-host',
  // Müşteri eşleştirme şablonlarından aynen alınan işaret sınıfları (stil taşımaz)
  'add-pdu-wrapper', 'btn-add-pdu', 'btn-error-confirm', 'btn-remove-pdu', 'customer-form', 'dialog-actions', 'dialog-content', 'error-card', 'error-content',
  'error-title', 'group-label', 'industrial-header', 'loading-overlay', 'pdu-group', 'pdu-group-header', 'pdu-outlet-row', 'pdu-outlets-container',
  'scada-select-wrapper', 'spinner-container', 'sticky-search-header',
  // Orijinal Angular şablonlarında da geçersiz olan sınıflar (Tailwind üretmez; bilerek aynen bırakıldı)
  'py-0.2', 'bg-slate-450', 'text-slate-655', 'border-emerald-250', 'border-purple-250',
  // Paketlenmiş PrimeIcons sürümünde olmayan ikon (orijinalde de boş görünür)
  'pi-minus-square']);

const missing = {};
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const chunks = [];
  const attr = /class(?:Name)?\s*=\s*"([^"]*)"/g;
  while ((m = attr.exec(src))) chunks.push(m[1]);
  if (file.endsWith('.js')) {
    const str = /'([^'\n]*)'/g;
    while ((m = str.exec(src))) if (/(^|\s)(bg|text|border|px|py|p|m|mt|mb|flex|grid|w|h|rounded|font|gap|items|justify|shadow|dark:|hover:)[-:[]/.test(m[1])) chunks.push(m[1]);
  }
  for (const chunk of chunks) {
    for (const raw of chunk.split(/\s+/)) {
      const cls = raw.trim();
      if (!isClassToken(cls) || IGNORE.has(cls)) continue;
      if (!known.has(cls)) (missing[cls] = missing[cls] || new Set()).add(path.basename(file));
    }
  }
}

// Sınıf adayı: küçük harf, en az bir '-' veya ':' içerir; '.' yalnızca rakamlar arasında;
// parantez/virgül yalnızca köşeli parantez (arbitrary value) içinde.
function isClassToken(t) {
  if (!t || t.startsWith('data-') || /[A-ZÇĞİÖŞÜçğıöşü<>'"=+{};$|?\\]/.test(t)) return false;
  if (/[:,.]$/.test(t)) return false;
  const outside = t.replace(/\[[^\]]*\]/g, '');
  if (/[(),]/.test(outside)) return false;
  if (/\.(?!\d)|(?<!\d)\./.test(outside)) return false;
  if (!/^[!-]?[a-z@][a-z0-9:_\-\/.\[\]%#(),]*$/.test(t)) return false;
  return /[-:]/.test(t) || ['flex', 'grid', 'hidden', 'block', 'inline', 'truncate', 'relative', 'absolute', 'fixed', 'sticky', 'italic', 'uppercase', 'border', 'rounded', 'shadow', 'underline', 'invert', 'grow', 'shrink', 'transform', 'contents'].includes(t);
}

const keys = Object.keys(missing).sort();
if (process.argv.includes('--list')) { process.stdout.write(keys.join('\n')); process.exit(0); }
if (!keys.length) { console.log('Tüm sınıflar derlenmiş CSS içinde mevcut.'); process.exit(0); }
console.log(keys.length + ' eksik sınıf:');
keys.forEach(k => console.log('  ' + k + '  ← ' + Array.from(missing[k]).join(', ')));
