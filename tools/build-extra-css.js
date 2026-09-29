// Orijinal derlenmiş css/styles.css'te BULUNMAYAN Tailwind sınıflarını, projenin kendi
// Tailwind v4 teması (front_end/projects/user-app/src/styles.css @theme bloğu) ile üretir
// ve css/tailwind-extra.css dosyasına yazar. css/styles.css'e dokunmaz.
//
// Kullanım (dcim-presentation kökünden):
//   node tools/build-extra-css.js
// Gereksinim: ../front_end/node_modules (postcss + @tailwindcss/postcss)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const front = path.resolve(root, '..', 'front_end');
const load = id => require(require.resolve(id, { paths: [front] }));
const postcss = load('postcss');
const tailwind = load('@tailwindcss/postcss');

const missing = execFileSync(process.execPath, [path.join(__dirname, 'check-classes.js'), '--list'], { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean)
  // Tailwind olmayan kanca sınıfları
  .filter(c => !['rear-stack', 'cell-nowrap', 'cell-wrap', 'door-state'].includes(c));

const srcCss = fs.readFileSync(path.join(front, 'projects/user-app/src/styles.css'), 'utf8');
const themeMatch = srcCss.match(/@theme\s*\{[\s\S]*?\n\}/);
if (!themeMatch) throw new Error('@theme bloğu bulunamadı');

const safe = missing.map(c => c.replace(/"/g, '')).join(' ');
const input =
  '@import "tailwindcss/theme" layer(theme);\n' +
  '@import "tailwindcss/utilities" layer(utilities) source(none);\n' +
  '@custom-variant dark (&:where(.dark, .dark *));\n' +
  themeMatch[0] + '\n' +
  '@source inline("' + safe + '");\n';

postcss([tailwind({ base: root })])
  .process(input, { from: path.join(front, 'projects', 'user-app', 'src', '__dcim-extra-input.css') })
  .then(result => {
    // Bu dosya styles.css'ten SONRA yüklenir. Varyantsız (base) kurallar styles.css'teki
    // dark:/hover: varyantlarını ezmesin diye :where() ile sıfır özgüllüğe çekilir;
    // varyantlı kurallar (dark:, sm: ...) normal özgüllükte kalır (Tailwind sıralamasıyla uyumlu).
    result.root.walkRules(rule => {
      let p = rule.parent;
      let inUtilities = false;
      let inMedia = false;
      while (p && p.type !== 'root') {
        if (p.type === 'atrule' && p.name === 'layer' && p.params === 'utilities') inUtilities = true;
        if (p.type === 'atrule' && (p.name === 'media' || p.name === 'supports')) inMedia = true;
        p = p.parent;
      }
      if (!inUtilities || inMedia || /:where\(\.dark|:hover|:focus|:active/.test(rule.selector)) return;
      rule.selectors = rule.selectors.map(s => ':where(' + s + ')');
    });
    const header = '/* DCIM Sunum — Tamamlayıcı Tailwind sınıfları.\n' +
      ' * css/styles.css (22.09 derlemesi) içinde bulunmayan ' + missing.length + ' sınıf, projenin kendi\n' +
      ' * @theme token\'larıyla üretildi (tools/build-extra-css.js). Elle düzenlemeyin. */\n';
    fs.writeFileSync(path.join(root, 'css', 'tailwind-extra.css'), header + result.root.toString());
    console.log('tailwind-extra.css yazıldı:', missing.length, 'sınıf,', result.css.length, 'bayt');
  })
  .catch(err => { console.error(err); process.exit(1); });
