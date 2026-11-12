/* ==========================================================================
   DCIM Sunum — Ortak rapor menüsü + rapor üretimi + Kullanım Kılavuzu okuyucusu
   - DCIM.report.menu(host, opts)  → app-report-export-menu karşılığı
       opts: { label, scopes:[{id,label,hint}], formats:['pdf','xlsx','csv'], options:'none'|'limit'|'dateRange',
               unit, total, defaultLimit, defaultPreset, inTable, onExport(req) }
       req : { scope, format, limit?, from?, to? }
   - DCIM.report.generate(doc, format) → report-template.service.ts karşılığı (new-ui PDF şablonu)
       doc : { title, subtitle, filename, kpis:[{label,value,tone}], images:[{src,caption}],
               sections:[{title, columns:[{key,label,align}], rows:[{}], toneKey}], notes:[] }
       PDF: yazdırma penceresi (A4 yatay, KPI kutuları, renkli durum satırları); Excel: .xls tablo; CSV: ';' ayraçlı.
   - DCIM.report.applyLimit(rows, req), applyRange(rows, req, timeKey), captureSvg(svg), captureCanvas(canvas)
   - DCIM.manual.open(chapterKey?) → layout/user-manual-reader karşılığı (sayfa çevirmeli kılavuz + SSS)
   Bağımlılık: js/shell.js (DCIM.ui)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pad = n => String(n).padStart(2, '0');
  const fmtDT = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const toLocalInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  const FORMAT_OPTIONS = [
    { id: 'pdf', label: 'PDF', icon: 'pi pi-file-pdf' },
    { id: 'xlsx', label: 'Excel', icon: 'pi pi-file-excel' },
    { id: 'csv', label: 'CSV', icon: 'pi pi-file' }
  ];
  const DATE_PRESETS = [
    { id: '24h', label: 'Son 24 saat', hours: 24 },
    { id: '7d', label: 'Son 7 gün', hours: 24 * 7 },
    { id: '30d', label: 'Son 30 gün', hours: 24 * 30 },
    { id: '90d', label: 'Son 90 gün', hours: 24 * 90 }
  ];
  const QUICK_LIMITS = [50, 100, 250, 500, 1000];

  // ---------------------------------------------------------------------------
  // Bekleme örtüsü ("Rapor hazırlanıyor")
  // ---------------------------------------------------------------------------
  function busy(text) {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm select-none animate-fade-in';
    el.setAttribute('role', 'alertdialog');
    el.innerHTML =
      '<div class="flex w-full max-w-sm flex-col items-center gap-3 rounded-[2px] border border-slate-200 bg-white px-6 py-5 text-center shadow-2xl dark:border-border-subtle dark:bg-surface-card">' +
        '<div class="relative flex h-14 w-14 items-center justify-center"><span class="absolute inset-0 rounded-full border-4 border-sky-500/15"></span><i class="pi pi-spin pi-spinner text-3xl text-sky-600 dark:text-sky-400"></i></div>' +
        '<div><div class="text-sm font-black text-slate-900 dark:text-slate-100">Rapor hazırlanıyor</div>' +
        '<div class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">' + esc(text || 'Lütfen bekleyin') + '</div></div>' +
        '<div class="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div class="report-busy-bar h-full w-1/3 rounded-full bg-sky-500"></div></div>' +
        '<div class="text-[10px] text-slate-400">Dosya hazır olduğunda indirme otomatik başlar.</div>' +
      '</div>';
    document.body.appendChild(el);
    return { close() { el.remove(); } };
  }

  // ---------------------------------------------------------------------------
  // Menü
  // ---------------------------------------------------------------------------
  function menu(host, opts) {
    const o = Object.assign({
      label: 'Rapor al', scopes: [{ id: 'page', label: 'Bu sayfa' }], formats: ['pdf', 'xlsx', 'csv'], options: 'none',
      unit: 'kayıt', total: null, defaultLimit: 100, defaultPreset: '7d', inTable: false, disabled: false, onExport: null
    }, opts || {});
    const fmts = FORMAT_OPTIONS.filter(f => o.formats.indexOf(f.id) >= 0);
    const direct = o.scopes.length === 1 && fmts.length === 1 && o.options === 'none';
    const single = o.scopes.length === 1 && fmts.length === 1;
    const st = { open: false, pending: null, limitMode: 'all', limitValue: o.defaultLimit, preset: o.defaultPreset, from: '', to: '', error: '' };

    function setPreset(id) {
      const p = DATE_PRESETS.find(x => x.id === id) || DATE_PRESETS[1];
      const to = new Date();
      st.preset = p.id;
      st.to = toLocalInput(to);
      st.from = toLocalInput(new Date(to.getTime() - p.hours * 3600000));
    }
    setPreset(o.defaultPreset);

    function emit(scope, format, extra) {
      st.open = false; st.pending = null; render();
      if (o.onExport) o.onExport(Object.assign({ scope, format }, extra || {}));
    }
    function choose(scope, format) {
      if (o.options === 'none') return emit(scope, format);
      st.pending = { scope, format }; st.error = ''; render();
    }
    function confirm() {
      const p = st.pending;
      if (!p) return;
      if (o.options === 'limit') {
        const n = parseInt(st.limitValue, 10);
        if (st.limitMode === 'first' && !(n > 0)) { st.error = 'Geçerli bir kayıt sayısı girin.'; return render(); }
        return emit(p.scope, p.format, { limit: st.limitMode === 'first' ? n : null });
      }
      const from = new Date(st.from), to = new Date(st.to);
      if (isNaN(from) || isNaN(to) || from > to) { st.error = 'Başlangıç, bitişten önce olmalı.'; return render(); }
      emit(p.scope, p.format, { from, to });
    }

    function render() {
      const btnCls = 'inline-flex items-center rounded-[2px] border border-sky-200 bg-sky-50 px-2.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-60 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-400 dark:hover:bg-sky-900/60 ' +
        (o.inTable ? 'gap-1 py-1 cursor-pointer' : 'h-8 gap-1.5 cursor-pointer');
      let h = '<div class="relative" data-rk-root>' +
        '<button type="button" data-rk-btn class="' + btnCls + '"' + (o.disabled ? ' disabled' : '') + (direct ? '' : ' aria-haspopup="menu" aria-expanded="' + st.open + '"') + '>' +
          '<i class="' + (direct ? fmts[0].icon : 'pi pi-file-export') + ' text-xs"></i><span>' + esc(o.label) + '</span>' +
          (direct ? '' : '<i class="pi pi-chevron-down text-[9px]"></i>') +
        '</button>';
      if (st.open && !direct) {
        h += '<div role="menu" data-rk-menu class="absolute right-0 z-50 mt-1 w-72 rounded-[2px] border border-slate-200 bg-white p-1 text-left shadow-lg dark:border-border-subtle dark:bg-surface-card">';
        if (!st.pending) {
          o.scopes.forEach((s, i) => {
            h += '<div' + (i < o.scopes.length - 1 ? ' class="mb-1"' : '') + '>' +
              '<div class="px-2 pb-0.5 pt-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(s.label) + '</div>' +
              (s.hint ? '<div class="px-2 pb-1 text-[9px] text-slate-400">' + esc(s.hint) + '</div>' : '') +
              '<div class="grid gap-1 px-1 pb-1" style="grid-template-columns:repeat(' + fmts.length + ',minmax(0,1fr))">' +
              fmts.map(f => '<button type="button" role="menuitem" data-rk-choose="' + esc(s.id) + '|' + f.id + '" class="inline-flex h-7 items-center justify-center gap-1 rounded-[2px] border border-slate-200 text-[10px] font-black text-slate-700 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-700 dark:border-slate-700 dark:text-slate-200 dark:hover:text-sky-300"><i class="' + f.icon + ' text-[10px]"></i>' + f.label + '</button>').join('') +
              '</div></div>';
          });
        } else {
          const f = FORMAT_OPTIONS.find(x => x.id === st.pending.format);
          const sc = o.scopes.find(x => x.id === st.pending.scope);
          h += '<form data-rk-form class="flex flex-col gap-2 p-1.5">' +
            '<div class="flex items-center gap-1.5">' +
              (single ? '' : '<button type="button" data-rk-back class="inline-flex h-6 w-6 items-center justify-center rounded-[2px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Geri"><i class="pi pi-arrow-left text-[10px]"></i></button>') +
              '<div class="min-w-0 flex-1"><div class="truncate text-[11px] font-black text-slate-800 dark:text-slate-100"><i class="' + f.icon + ' mr-1 text-[10px] text-sky-600"></i>' + f.label + ' raporu</div>' +
              (o.scopes.length > 1 ? '<div class="truncate text-[9px] text-slate-400">' + esc(sc ? sc.label : '') + '</div>' : '') + '</div>' +
            '</div>';
          if (o.options === 'limit') {
            const on = 'border-sky-500/60 bg-sky-500/10 text-sky-800 dark:text-sky-200', off = 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200';
            const unitTitle = o.unit.charAt(0).toLocaleUpperCase('tr-TR') + o.unit.slice(1);
            h += '<div class="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(unitTitle) + ' sayısı</div>' +
              '<label class="flex cursor-pointer items-center gap-2 rounded-[2px] border px-2 py-1.5 text-[11px] ' + (st.limitMode === 'all' ? on : off) + '"><input type="radio" name="rkLimit" value="all"' + (st.limitMode === 'all' ? ' checked' : '') + ' class="accent-sky-600"><span>Tümü' + (o.total != null ? '<span class="text-slate-400"> (' + o.total + ' ' + esc(o.unit) + ')</span>' : '') + '</span></label>' +
              '<label class="flex cursor-pointer items-center gap-2 rounded-[2px] border px-2 py-1.5 text-[11px] ' + (st.limitMode === 'first' ? on : off) + '"><input type="radio" name="rkLimit" value="first"' + (st.limitMode === 'first' ? ' checked' : '') + ' class="accent-sky-600"><span>İlk</span>' +
                '<input type="number" data-rk-limit min="1" step="1" value="' + esc(st.limitValue) + '" class="h-6 w-20 rounded-[2px] border border-slate-300 bg-white px-1.5 text-right text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" aria-label="Rapordaki kayıt sayısı"><span>' + esc(o.unit) + '</span></label>' +
              '<div class="flex flex-wrap gap-1">' + QUICK_LIMITS.map(n => '<button type="button" data-rk-quick="' + n + '" class="h-6 rounded-[2px] border border-slate-200 px-2 text-[10px] font-bold text-slate-600 hover:border-sky-500/50 hover:text-sky-700 dark:border-slate-700 dark:text-slate-300">' + n + '</button>').join('') + '</div>' +
              '<div class="text-[9px] text-slate-400">Sıralama ve filtreler ekrandaki gibi uygulanır.</div>';
          } else if (o.options === 'dateRange') {
            h += '<div class="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Tarih aralığı</div>' +
              '<div class="grid grid-cols-2 gap-1">' + DATE_PRESETS.map(p => '<button type="button" data-rk-preset="' + p.id + '" class="h-6 rounded-[2px] border text-[10px] font-bold ' + (st.preset === p.id ? 'border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:border-sky-500/50 dark:border-slate-700 dark:text-slate-300') + '">' + p.label + '</button>').join('') + '</div>' +
              '<label class="flex flex-col gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">Başlangıç<input type="datetime-local" data-rk-from value="' + st.from + '" class="h-7 rounded-[2px] border border-slate-300 bg-white px-1.5 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"></label>' +
              '<label class="flex flex-col gap-0.5 text-[10px] text-slate-500 dark:text-slate-400">Bitiş<input type="datetime-local" data-rk-to value="' + st.to + '" class="h-7 rounded-[2px] border border-slate-300 bg-white px-1.5 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"></label>';
          }
          if (st.error) h += '<div class="text-[10px] font-semibold text-rose-600" aria-live="polite">' + esc(st.error) + '</div>';
          h += '<button type="submit" class="inline-flex h-7 items-center justify-center gap-1.5 rounded-[2px] bg-sky-600 text-[11px] font-black text-white hover:bg-sky-700"><i class="pi pi-download text-[10px]"></i>Raporu oluştur</button></form>';
        }
        h += '</div>';
      }
      h += '</div>';
      host.innerHTML = h;
      wire();
    }

    function wire() {
      const root = host.querySelector('[data-rk-root]');
      root.addEventListener('click', e => e.stopPropagation());
      root.querySelector('[data-rk-btn]').addEventListener('click', () => {
        if (direct) return emit(o.scopes[0].id, fmts[0].id);
        if (single && !st.open) { st.open = true; st.pending = { scope: o.scopes[0].id, format: fmts[0].id }; return render(); }
        st.open = !st.open; st.pending = null; render();
      });
      root.querySelectorAll('[data-rk-choose]').forEach(b => b.addEventListener('click', () => { const [s, f] = b.getAttribute('data-rk-choose').split('|'); choose(s, f); }));
      const back = root.querySelector('[data-rk-back]');
      if (back) back.addEventListener('click', () => { st.pending = null; render(); });
      root.querySelectorAll('input[name="rkLimit"]').forEach(r => r.addEventListener('change', () => { st.limitMode = r.value; render(); }));
      const lim = root.querySelector('[data-rk-limit]');
      if (lim) {
        lim.addEventListener('focus', () => { if (st.limitMode !== 'first') { st.limitMode = 'first'; render(); const x = host.querySelector('[data-rk-limit]'); if (x) x.focus(); } });
        lim.addEventListener('input', () => { st.limitValue = lim.value; });
      }
      root.querySelectorAll('[data-rk-quick]').forEach(b => b.addEventListener('click', () => { st.limitMode = 'first'; st.limitValue = b.getAttribute('data-rk-quick'); render(); }));
      root.querySelectorAll('[data-rk-preset]').forEach(b => b.addEventListener('click', () => { setPreset(b.getAttribute('data-rk-preset')); render(); }));
      const from = root.querySelector('[data-rk-from]'), to = root.querySelector('[data-rk-to]');
      if (from) from.addEventListener('change', () => { st.from = from.value; st.preset = ''; });
      if (to) to.addEventListener('change', () => { st.to = to.value; st.preset = ''; });
      const form = root.querySelector('[data-rk-form]');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); confirm(); });
    }

    const onDoc = () => { if (st.open) { st.open = false; st.pending = null; render(); } };
    document.addEventListener('click', onDoc);
    render();
    return {
      update(patch) { Object.assign(o, patch || {}); render(); },
      destroy() { document.removeEventListener('click', onDoc); host.innerHTML = ''; }
    };
  }

  // ---------------------------------------------------------------------------
  // Rapor üretimi
  // ---------------------------------------------------------------------------
  const TONE_ROW = { acil: '#f3e8ff', alarm: '#ffe4e6', critical: '#ffe4e6', warning: '#fef3c7', uyari: '#fef3c7', lost: '#ffedd5', normal: '', ok: '' };
  const TONE_TXT = { acil: '#7e22ce', alarm: '#be123c', critical: '#be123c', warning: '#b45309', uyari: '#b45309', lost: '#c2410c', normal: '#047857', ok: '#047857', info: '#0369a1' };
  const toneOf = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR').replace('ı', 'i').replace('uyarı', 'uyari');

  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return fmtDT(v);
    return String(v);
  }

  function pdfHtml(doc) {
    const now = new Date();
    const kpis = (doc.kpis || []).map(k =>
      '<div class="kpi"><div class="kl">' + esc(k.label) + '</div><div class="kv" style="color:' + (TONE_TXT[toneOf(k.tone)] || '#0f172a') + '">' + esc(k.value) + '</div>' +
      (k.hint ? '<div class="kh">' + esc(k.hint) + '</div>' : '') + '</div>').join('');
    const imgs = (doc.images || []).map(im => '<figure><img src="' + im.src + '" alt=""><figcaption>' + esc(im.caption || '') + '</figcaption></figure>').join('');
    const secs = (doc.sections || []).map(s => {
      const cols = s.columns || Object.keys((s.rows || [])[0] || {}).map(k => ({ key: k, label: k }));
      return '<h2>' + esc(s.title || '') + ' <span>(' + (s.rows || []).length + ' kayıt)</span></h2>' +
        '<table><thead><tr>' + cols.map(c => '<th style="text-align:' + (c.align || 'left') + '">' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' +
        (s.rows || []).map(r => {
          const t = s.toneKey ? toneOf(r[s.toneKey]) : '';
          return '<tr' + (TONE_ROW[t] ? ' style="background:' + TONE_ROW[t] + '"' : '') + '>' +
            cols.map(c => '<td style="text-align:' + (c.align || 'left') + (c.key === s.toneKey && TONE_TXT[t] ? ';color:' + TONE_TXT[t] + ';font-weight:700' : '') + '">' + esc(cellText(r[c.key])) + '</td>').join('') + '</tr>';
        }).join('') +
        '</tbody></table>';
    }).join('');
    return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>' + esc(doc.title) + '</title><style>' +
      '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:"Liberation Sans",Arial,Helvetica,sans-serif;color:#0f172a;margin:0;font-size:10px}' +
      'header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0284c7;padding-bottom:6px;margin-bottom:10px}' +
      'header h1{font-size:17px;margin:0}header .sub{color:#475569;font-size:10px;margin-top:2px}header .meta{text-align:right;color:#64748b;font-size:9px}' +
      '.brand{font-weight:900;color:#0284c7;letter-spacing:.06em;font-size:10px}' +
      '.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin-bottom:10px}' +
      '.kpi{border:1px solid #cbd5e1;border-left:3px solid #0284c7;padding:5px 7px}.kl{font-size:8px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:.04em}.kv{font-size:15px;font-weight:900;margin-top:1px}.kh{font-size:8px;color:#94a3b8}' +
      'figure{margin:0 0 10px;border:1px solid #cbd5e1;padding:4px;page-break-inside:avoid}figure img{width:100%;max-height:150mm;object-fit:contain;display:block}figcaption{font-size:8px;color:#64748b;margin-top:3px}' +
      'h2{font-size:12px;margin:12px 0 4px;border-left:3px solid #0284c7;padding-left:6px}h2 span{color:#94a3b8;font-weight:400;font-size:9px}' +
      'table{width:100%;border-collapse:collapse;font-size:8.5px}th{background:#0f172a;color:#fff;padding:4px 5px;font-weight:700}td{border-bottom:1px solid #e2e8f0;padding:3px 5px}tr{page-break-inside:avoid}' +
      '.notes{margin-top:10px;color:#64748b;font-size:8px}footer{margin-top:14px;border-top:1px solid #cbd5e1;padding-top:4px;color:#94a3b8;font-size:8px;display:flex;justify-content:space-between}' +
      '</style></head><body>' +
      '<header><div><div class="brand">AKYA DCIM</div><h1>' + esc(doc.title) + '</h1>' + (doc.subtitle ? '<div class="sub">' + esc(doc.subtitle) + '</div>' : '') + '</div>' +
      '<div class="meta">Oluşturma: ' + fmtDT(now) + '<br>Kullanıcı: ' + esc(((DCIM.session && DCIM.session.user()) || {}).usr || '-') + '</div></header>' +
      (kpis ? '<div class="kpis">' + kpis + '</div>' : '') + imgs + secs +
      ((doc.notes || []).length ? '<div class="notes">' + doc.notes.map(esc).join('<br>') + '</div>' : '') +
      '<footer><span>DCIM Sunum — mock veri</span><span>' + esc(doc.title) + '</span></footer>' +
      '</body></html>';
  }

  function download(name, mime, content) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function fileBase(doc) {
    const d = new Date();
    return (doc.filename || doc.title || 'rapor').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_') + '_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
  }

  function generate(doc, format) {
    format = format || 'pdf';
    const b = busy((doc.title || 'Rapor') + ' · ' + (format === 'xlsx' ? 'Excel' : format.toUpperCase()) + ' raporu hazırlanıyor');
    setTimeout(() => {
      try {
        if (format === 'pdf') {
          const fr = document.createElement('iframe');
          fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
          document.body.appendChild(fr);
          const w = fr.contentWindow;
          w.document.open(); w.document.write(pdfHtml(doc)); w.document.close();
          const go = () => { try { w.focus(); w.print(); } catch (e) { /* yok say */ } setTimeout(() => fr.remove(), 1500); };
          const imgs = Array.from(w.document.images || []);
          Promise.all(imgs.map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))).then(() => setTimeout(go, 120));
        } else if (format === 'csv') {
          const lines = [];
          (doc.sections || []).forEach((s, si) => {
            const cols = s.columns || Object.keys((s.rows || [])[0] || {}).map(k => ({ key: k, label: k }));
            if ((doc.sections || []).length > 1) { if (si) lines.push(''); lines.push(s.title || ''); }
            lines.push(cols.map(c => c.label).join(';'));
            (s.rows || []).forEach(r => lines.push(cols.map(c => '"' + cellText(r[c.key]).replace(/"/g, '""') + '"').join(';')));
          });
          download(fileBase(doc) + '.csv', 'text/csv;charset=utf-8', '﻿' + lines.join('\r\n'));
        } else {
          const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>' +
            '<h3>' + esc(doc.title) + '</h3>' + (doc.kpis || []).map(k => '<div><b>' + esc(k.label) + ':</b> ' + esc(k.value) + '</div>').join('') +
            (doc.sections || []).map(s => {
              const cols = s.columns || Object.keys((s.rows || [])[0] || {}).map(k => ({ key: k, label: k }));
              return '<h4>' + esc(s.title || '') + '</h4><table border="1"><tr>' + cols.map(c => '<th style="background:#0f172a;color:#fff">' + esc(c.label) + '</th>').join('') + '</tr>' +
                (s.rows || []).map(r => '<tr>' + cols.map(c => '<td>' + esc(cellText(r[c.key])) + '</td>').join('') + '</tr>').join('') + '</table>';
            }).join('') + '</body></html>';
          download(fileBase(doc) + '.xls', 'application/vnd.ms-excel', '﻿' + html);
        }
        if (DCIM.ui && DCIM.ui.toast) DCIM.ui.toast((format === 'pdf' ? 'Yazdırma penceresi açıldı' : 'Dosya indirildi') + ' — ' + (doc.title || 'Rapor'), 'success', 'Rapor hazır');
      } finally {
        b.close();
      }
    }, 450);
  }

  function applyLimit(rows, req) {
    const n = req && req.limit;
    return n && n > 0 && n < rows.length ? rows.slice(0, n) : rows;
  }
  function applyRange(rows, req, key) {
    if (!req || !req.from || !req.to) return rows;
    const a = req.from.getTime(), b = req.to.getTime();
    return rows.filter(r => { const t = new Date(r[key || 'time']).getTime(); return isNaN(t) || (t >= a && t <= b); });
  }
  // SVG → PNG dataURL (2D kroki): CSS değişkenleri çözülmüş renklerle
  function captureSvg(svg, width) {
    return new Promise(resolve => {
      try {
        const clone = svg.cloneNode(true);
        const vb = (svg.getAttribute('viewBox') || '0 0 1000 700').split(/\s+/).map(Number);
        const W = width || 1800, H = Math.round(W * vb[3] / vb[2]);
        clone.setAttribute('width', W); clone.setAttribute('height', H);
        const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
        src.forEach((el, i) => {
          const cs = getComputedStyle(el);
          ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-weight', 'font-family'].forEach(p => { const v = cs.getPropertyValue(p); if (v) dst[i].style.setProperty(p, v); });
          if (cs.display === 'none') dst[i].setAttribute('display', 'none');
        });
        const data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H);
          try { resolve(c.toDataURL('image/png')); } catch (e) { resolve(data); }
        };
        img.onerror = () => resolve(null);
        img.src = data;
      } catch (e) { resolve(null); }
    });
  }
  function captureCanvas(canvas) {
    try { return canvas.toDataURL('image/png'); } catch (e) { return null; }
  }

  DCIM.report = { menu, generate, busy, applyLimit, applyRange, captureSvg, captureCanvas, pdfHtml };

  // ---------------------------------------------------------------------------
  // Kullanım Kılavuzu & SSS (sayfa çevirmeli okuyucu)
  // ---------------------------------------------------------------------------
  const MANUAL = [
    { key: 'dashboard', title: 'Genel Bakış', icon: 'pi pi-home', pages: [
      'Genel Bakış, oturum açıldığında gelen Operasyon Merkezi ekranıdır. Üst şeritte PUE, IT gücü, kabin doluluğu, soğutma yükü, trafo yükü ve dış ortam sıcaklığı gösterilir.',
      'Günlük PUE eğrisi son 24 saati çizer. Canlı alarmlar kartı en yeni 8 alarmı, iş emirleri ve ticket kartları son kayıtları listeler. "Dashboard Yönetimi" ile görünecek modülleri seçebilirsiniz.'
    ], faq: [['Kartlar neden boş görünüyor?', 'Rolünüz ilgili modülü görmüyorsa kart gizlenir. Dashboard Yönetimi\'nden açabilirsiniz.'], ['PUE nasıl hesaplanır?', 'Toplam tesis gücü / IT gücü; ölçümler PMS analizörlerinden gelir.']] },
    { key: '2d', title: 'Dijital İkiz (2D)', icon: 'pi pi-map', pages: [
      'Sol paneldeki ağaçta kat ve salonlar listelenir. Bir salonu seçtiğinizde kroki o salona yakınlaşır; başlık "N. Kat M. Salon" olur. Arama kutusu ile kabin, klima, UPS ya da POD arayabilirsiniz.',
      'Bir kabine tıklayınca sağda kabin paneli açılır: izometrik raf, PDU ve sensör değerleri, kabine ait alarmlar. Görünüm Ayarları\'ndan tel tava ve fiber runner ağ katmanlarını açabilirsiniz.'
    ], faq: [['Acil alarmlar neden kırmızı?', '2D ve 3D ikizde Acil kırmızı çizilir ama etiketi "Acil" kalır; diğer ekranlarda mordur.'], ['POD penceresindeki renkler?', 'Doluluk %70 üzeri sarı, %80 üzeri kırmızıdır.']] },
    { key: '3d', title: 'Dijital İkiz (3D)', icon: 'pi pi-box', pages: [
      'Başlıktaki kat seçici tanımlı tüm katları gösterir. Katman menüsü, "Durum rengi" ve "Isı haritası" anahtarları başlıktadır. Isı haritası kabin orta sıcaklıklarından 18–32 °C ölçeğinde zemin renklendirir.',
      'Kabine çift tıklayınca odak kipine geçilir; "Komşu göster" ile 0–5 komşu kabin görünür kalır. Sol kabin denetçisinde 2D/3D raf, sağ panelde Kablolar sekmesinden port seçip kablo izini görebilirsiniz.'
    ], faq: [['Kamera zemin altına iniyor mu?', 'Hayır, kamera zemin seviyesinde durdurulur.'], ['Duvarlar görüşü kapatıyor', 'Duvar Opaklığı ayarını düşürün (varsayılan %50).']] },
    { key: 'locks', title: 'Kapak Kilitleri', icon: 'pi pi-lock', pages: [
      'Araç çubuğundaki sayaçlar kabin, açık, kapalı ve bekleyen kapak sayısını gösterir; açık sayacına tıklayınca liste süzülür. Topolojide kabin ön/arka yüzleri Salon Planı\'ndaki yönle çizilir.',
      'Bir kabine tıklayınca sayfa başlığı kayar ve sağda kabin detayı açılır: kapak durumu, kart okuma geçmişi ve izometrik raf.'
    ], faq: [['F/R şeritleri ne anlatır?', 'F ön kapak, R arka kapak yüzüdür; kabinin baktığı yöne göre dört kenardan birinde çizilir.']] },
    { key: 'alarms', title: 'Aktif ve Tarihsel Alarmlar', icon: 'pi pi-exclamation-triangle', pages: [
      'Kat seçicisi "Tüm Katlar" ile başlar. "Gruplar" menüsünden alarm gruplarını gizleyebilir, "Varsayılanım yap" ile tercihinizi saklayabilirsiniz. Sistem grubu varsayılan olarak gizlidir.',
      '"Toplu Gördüm" sayfadaki tüm görülmemiş alarmları onaylar; isteğe bağlı not eklenir. Tarihsel alarmlarda "Bakım Aç" ile alarmdan bakım kaydı açılır.'
    ], faq: [['Acil neden mor?', 'Acil seviyesi, Alarm\'dan ayrışsın diye alarm ekranlarında mordur.']] },
    { key: 'maintenance', title: 'Bakım Modülü', icon: 'pi pi-wrench', pages: [
      'Bakım Tablosu tüm bakım kayıtlarını listeler. Garanti ve Bakım Tarihi Belirleme sihirbazı cihazlara garanti bitişi ve bakım periyodu atar.',
      'Periyodik Bakım Planları bir sonraki bakım tarihini izler. Alarm Bakımları tarihsel alarmlardan açılan kayıtlardır; tamamlama akışıyla kapanır.'
    ], faq: [['Gecikmiş bakım nasıl görünür?', 'Planlar listesinde kırmızı "Gecikti" rozetiyle.']] },
    { key: 'reports', title: 'Raporlar', icon: 'pi pi-file', pages: [
      'Rapor kataloğu üç grupta toplanır. Her tablo sayfasındaki "Rapor al" menüsünde kapsam, biçim (PDF, Excel, CSV) ve kayıt sayısı ya da tarih aralığı seçilir.',
      'Kapasite Tahmini; yer, enerji, soğutma ve ağırlık için Doğrusal, Theil–Sen, Holt ve Holt–Winters modelleriyle tahmin üretir; geri test en iyi modeli seçer.'
    ], faq: [['PDF\'te Türkçe karakter bozuk', 'Rapor şablonu Liberation Sans yazı tipini kullanır; tarayıcı yazdırma ayarında "Arka plan grafikleri" açık olmalıdır.']] },
    { key: 'engineering', title: 'Mühendislik', icon: 'pi pi-wrench', pages: [
      'Mühendislik ana sayfası cihaz haberleşme durumunu 5 sn\'de bir yeniler; "Katlar ve dokümanlar" tablosu cihaz, bağlantı, iş parçacığı ve yük bilgisini gösterir.',
      'Sol menü altı grupta aranabilir: Cihaz ve Saha, Veri Toplama ve Alarm, Yerleşim ve Şemalar, Sistem Konfigürasyonu, Operasyon, Tanılama ve Bakım.'
    ], faq: [['Cihaz Ekle nerede?', 'Cihaz ve Saha grubunda; eski Cihaz Tanımlama ve PDU Ekleme ekranlarının yerini aldı.']] }
  ];

  const manual = {
    open(key) {
      const st = { ch: Math.max(0, MANUAL.findIndex(c => c.key === key)), q: '', flip: '' };
      const host = document.createElement('div');
      host.className = 'fixed inset-0 z-[60] bg-slate-950/75 flex items-center justify-center p-3 sm:p-6 animate-fade-in';
      document.body.appendChild(host);
      const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
      const onKey = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
      document.addEventListener('keydown', onKey);
      host.addEventListener('click', e => { if (e.target === host) close(); });
      function go(d) { const n = st.ch + d; if (n < 0 || n >= MANUAL.length) return; st.flip = d > 0 ? 'manual-flip-next' : 'manual-flip-prev'; st.ch = n; render(); }
      function render() {
        const q = st.q.trim().toLocaleLowerCase('tr-TR');
        const list = MANUAL.map((c, i) => ({ c, i })).filter(x => !q || (x.c.title + ' ' + x.c.pages.join(' ') + ' ' + x.c.faq.map(f => f.join(' ')).join(' ')).toLocaleLowerCase('tr-TR').indexOf(q) >= 0);
        const c = MANUAL[st.ch];
        host.innerHTML =
          '<div class="w-full max-w-6xl h-[86vh] bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl flex overflow-hidden">' +
            '<aside class="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-[#0b121e]">' +
              '<div class="px-3 py-3 border-b border-slate-200 dark:border-slate-800"><div class="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">Akya DCIM</div><div class="text-sm font-extrabold text-slate-900 dark:text-slate-100">Kullanım Kılavuzu</div></div>' +
              '<div class="p-2"><input data-man-q value="' + esc(st.q) + '" placeholder="Kılavuzda ara…" class="w-full h-7 px-2 text-xs rounded-[2px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-sky-500"></div>' +
              '<nav class="flex-1 overflow-y-auto custom-scrollbar px-1 pb-2">' + (list.length ? list.map(x =>
                '<button type="button" data-man-ch="' + x.i + '" class="w-full text-left px-2.5 py-1.5 text-xs rounded-[2px] flex items-center gap-2 border-l-2 ' + (x.i === st.ch ? 'border-sky-600 bg-sky-600/10 text-sky-700 dark:text-sky-300 font-bold' : 'border-transparent text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + '"><span class="font-mono text-[10px] text-slate-400 w-4">' + (x.i + 1) + '</span><i class="' + x.c.icon + ' text-[11px] opacity-70"></i><span class="truncate">' + esc(x.c.title) + '</span></button>').join('')
                : '<div class="px-3 py-4 text-[11px] text-slate-400">Sonuç yok.</div>') + '</nav>' +
            '</aside>' +
            '<section class="flex-1 min-w-0 flex flex-col">' +
              '<div class="h-11 shrink-0 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">' +
                '<div class="text-xs text-slate-500 dark:text-slate-400">Bölüm <b class="text-slate-800 dark:text-slate-200">' + (st.ch + 1) + '</b> / ' + MANUAL.length + '</div>' +
                '<button type="button" data-man-close class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1"><i class="pi pi-times"></i></button>' +
              '</div>' +
              '<div class="flex-1 min-h-0 p-4 sm:p-6 bg-slate-100 dark:bg-[#080c14] flex items-stretch justify-center" style="perspective:1800px">' +
                '<div class="manual-book ' + st.flip + ' w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800">' +
                  '<div class="p-6 border-r border-slate-200 dark:border-slate-800 overflow-y-auto custom-scrollbar">' +
                    '<div class="flex items-center gap-2 mb-3"><span class="w-8 h-8 rounded-[2px] bg-sky-600/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="' + c.icon + '"></i></span><h2 class="text-lg font-black text-slate-900 dark:text-slate-100">' + esc(c.title) + '</h2></div>' +
                    c.pages.map(p => '<p class="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300 mb-3">' + esc(p) + '</p>').join('') +
                    '<div class="mt-4 text-[10px] font-mono text-slate-400">— ' + (st.ch * 2 + 1) + ' —</div>' +
                  '</div>' +
                  '<div class="p-6 overflow-y-auto custom-scrollbar">' +
                    '<h3 class="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Sık sorulan sorular</h3>' +
                    c.faq.map(f => '<details class="mb-2 border border-slate-200 dark:border-slate-800 rounded-[2px]"><summary class="px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer">' + esc(f[0]) + '</summary><div class="px-3 pb-2 text-xs text-slate-600 dark:text-slate-300">' + esc(f[1]) + '</div></details>').join('') +
                    '<div class="mt-4 text-[10px] font-mono text-slate-400 text-right">— ' + (st.ch * 2 + 2) + ' —</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="h-12 shrink-0 px-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">' +
                '<button type="button" data-man-go="-1" class="px-3 py-1.5 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"' + (st.ch === 0 ? ' disabled' : '') + '><i class="pi pi-chevron-left text-[10px]"></i> Önceki</button>' +
                '<div class="flex gap-1">' + MANUAL.map((x, i) => '<span class="w-1.5 h-1.5 rounded-full ' + (i === st.ch ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700') + '"></span>').join('') + '</div>' +
                '<button type="button" data-man-go="1" class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40"' + (st.ch === MANUAL.length - 1 ? ' disabled' : '') + '>Sonraki <i class="pi pi-chevron-right text-[10px]"></i></button>' +
              '</div>' +
            '</section>' +
          '</div>';
        st.flip = '';
        host.querySelector('[data-man-close]').addEventListener('click', close);
        host.querySelectorAll('[data-man-go]').forEach(b => b.addEventListener('click', () => go(parseInt(b.getAttribute('data-man-go'), 10))));
        host.querySelectorAll('[data-man-ch]').forEach(b => b.addEventListener('click', () => { const n = parseInt(b.getAttribute('data-man-ch'), 10); st.flip = n > st.ch ? 'manual-flip-next' : 'manual-flip-prev'; st.ch = n; render(); }));
        const qi = host.querySelector('[data-man-q]');
        qi.addEventListener('input', () => { st.q = qi.value; const pos = qi.selectionStart; render(); const n = host.querySelector('[data-man-q]'); n.focus(); n.setSelectionRange(pos, pos); });
      }
      render();
    }
  };
  DCIM.manual = manual;
})();
