// Bir sayfayı headless Chrome ile açar: konsol mesajlarını/hatalarını yazdırır ve ekran görüntüsü alır.
// Kullanım (dcim-presentation kökünden):
//   node tools/smoke.js <sayfa.html[?q=..][#hash]> [cikti.png] [genislik] [yukseklik]
// Örnek: node tools/smoke.js "reports.html#energy-pue" C:/tmp/pue.png 1600 900
// Çıkış kodu: sayfada yakalanmamış hata (Uncaught) varsa 1.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const [page, outArg, w = '1600', h = '900'] = process.argv.slice(2);
if (!page) { console.error('Kullanım: node tools/smoke.js <sayfa.html> [cikti.png] [genislik] [yukseklik]'); process.exit(2); }

const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
if (!chrome) { console.error('Chrome/Edge bulunamadı'); process.exit(2); }

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dcim-smoke-'));
const out = outArg || path.join(os.tmpdir(), 'dcim-smoke-' + Date.now() + '.png');
const url = 'file:///' + path.join(root, page.replace(/[?#].*$/, '')).replace(/\\/g, '/') + (page.match(/[?#].*$/) || [''])[0];

const res = spawnSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + profile, '--window-size=' + w + ',' + h, '--virtual-time-budget=5000',
  '--enable-logging=stderr', '--log-level=0', '--screenshot=' + out, url
], { encoding: 'utf8', timeout: 90000 });

const lines = (res.stderr || '').split(/\r?\n/).filter(l => /:CONSOLE[:(]/.test(l))
  .map(l => l.replace(/^\[[^\]]*\]\s*/, '').replace(/, source: file:\/\/\/.*?dcim-presentation\//, ' @ '));
try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* yok say */ }

console.log('URL: ' + url);
console.log(lines.length ? lines.join('\n') : 'Konsol mesajı yok.');
console.log(fs.existsSync(out) ? 'Ekran görüntüsü: ' + out : 'Ekran görüntüsü alınamadı.');
process.exit(lines.some(l => /Uncaught|Error/.test(l)) ? 1 : 0);
