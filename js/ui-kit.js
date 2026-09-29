/* ==========================================================================
   DCIM Sunum — Paylaşılan UI bileşenleri (new-ui/shared/components karşılıkları)
   app-page-header, app-card, app-form-field, app-empty-state, app-sidebar
   + dışa aktarım (Excel/CSV, PDF/yazdır) ve Chart.js tema yardımcıları.
   Bağımlılık: js/shell.js (DCIM.ui)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const esc = DCIM.ui.esc;

  // app-page-header — opts: { title, badge, compact, breadcrumbs: [{label, href}], actions: html }
  function pageHeader(opts) {
    const o = Object.assign({ title: '', badge: '', compact: false, breadcrumbs: [], actions: '', id: '' }, opts);
    const wrap = o.compact
      ? 'mb-1 pb-1 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800/80 select-none'
      : 'mb-3 pb-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800/80 select-none';
    const crumbs = o.breadcrumbs.length
      ? '<nav class="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mb-0.5 font-medium">' +
          '<a href="2d.html" class="hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"><i class="pi pi-home text-[10px]"></i></a>' +
          o.breadcrumbs.map((b, i) => {
            const last = i === o.breadcrumbs.length - 1;
            return '<i class="pi pi-chevron-right text-[8px] text-slate-400"></i>' +
              (!last && b.href
                ? '<a href="' + esc(b.href) + '" class="hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer">' + esc(b.label) + '</a>'
                : '<span class="text-slate-700 dark:text-slate-300 font-bold">' + esc(b.label) + '</span>');
          }).join('') +
        '</nav>'
      : '';
    return '<div class="' + wrap + '"' + (o.id ? ' id="' + esc(o.id) + '"' : '') + '>' +
      '<div class="flex items-center gap-3"><div>' + crumbs +
        '<div class="flex items-center gap-2">' +
          '<h1 class="text-sm md:text-base font-extrabold tracking-tight text-slate-900 dark:text-slate-100">' + esc(o.title) + '</h1>' +
          (o.badge ? '<span class="px-2 py-0.5 text-[10px] font-extrabold rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">' + esc(o.badge) + '</span>' : '') +
        '</div>' +
      '</div></div>' +
      '<div class="flex flex-wrap items-center gap-2.5 shrink-0 ml-auto">' + o.actions + '</div>' +
    '</div>';
  }

  // app-card — opts: { title, subtitle, icon, badge, actions: html, body: html, cls: ek sınıflar, attrs }
  function card(opts) {
    const o = Object.assign({ title: '', subtitle: '', icon: '', badge: '', actions: '', body: '', cls: '', attrs: '' }, opts);
    const head = o.title || o.actions
      ? '<div class="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800/80 pb-2">' +
          '<div class="flex items-center gap-2">' +
            (o.icon ? '<i class="' + o.icon + ' text-sky-600 dark:text-sky-400 text-sm"></i>' : '') +
            '<div><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">' + esc(o.title) + '</h3>' +
            (o.subtitle ? '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(o.subtitle) + '</p>' : '') + '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            (o.badge ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20">' + esc(o.badge) + '</span>' : '') +
            o.actions +
          '</div>' +
        '</div>'
      : '';
    return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3.5 shadow-2xs transition-colors duration-150 ' + o.cls + '" ' + o.attrs + '>' +
      head + '<div class="text-xs text-slate-800 dark:text-slate-200">' + o.body + '</div></div>';
  }

  // app-form-field — opts: { label, hint, error, required, icon, control: html (input/select) }
  function formField(opts) {
    const o = Object.assign({ label: '', hint: '', error: '', required: false, icon: '', control: '' }, opts);
    return '<div class="flex flex-col gap-1 w-full">' +
      (o.label ? '<label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between"><span>' + esc(o.label) +
        (o.required ? '<span class="text-rose-500 font-bold ml-0.5">*</span>' : '') + '</span>' +
        (o.hint ? '<span class="text-[10px] font-normal text-slate-400">' + esc(o.hint) + '</span>' : '') + '</label>' : '') +
      '<div class="relative flex items-center w-full">' +
        (o.icon ? '<i class="' + o.icon + ' absolute left-2.5 text-slate-400 text-xs pointer-events-none"></i>' : '') +
        '<div class="w-full' + (o.icon ? ' pl-7' : '') + '">' + o.control + '</div>' +
      '</div>' +
      (o.error ? '<p class="text-[10px] text-rose-500 font-medium flex items-center gap-1 mt-0.5"><i class="pi pi-exclamation-circle text-[10px]"></i>' + esc(o.error) + '</p>' : '') +
    '</div>';
  }

  // Projede form-field içinde kullanılan standart input/select sınıfları
  const INPUT_CLS = 'w-full bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-[2px] px-2 py-1.5 font-semibold focus:outline-none focus:border-sky-500';

  function select(attrs, options, value) {
    return '<select class="' + INPUT_CLS + '" ' + (attrs || '') + '>' +
      options.map(op => {
        const v = typeof op === 'object' ? op.value : op;
        const l = typeof op === 'object' ? op.label : op;
        return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>';
      }).join('') + '</select>';
  }

  // app-empty-state — opts: { message, description, icon, tone: neutral|success|info, compact }
  function emptyState(opts) {
    const o = Object.assign({ message: 'Kayıt bulunamadı', description: '', icon: 'pi pi-inbox', tone: 'neutral', compact: false }, opts);
    const color = o.tone === 'success' ? 'text-emerald-500' : '';
    const iconCls = [o.compact ? 'text-xl' : 'text-2xl', color, color ? '' : 'opacity-40', 'mb-1 block'].filter(Boolean).join(' ');
    return '<div class="' + (o.compact ? 'p-3' : 'p-6') + ' text-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded mt-1">' +
      (o.icon ? '<i class="' + o.icon + ' ' + iconCls + '"></i>' : '') +
      '<span class="text-xs font-semibold">' + esc(o.message) + '</span>' +
      (o.description ? '<span class="text-xs text-slate-400 block mt-1">' + esc(o.description) + '</span>' : '') +
    '</div>';
  }

  // app-sidebar — opts: { title, icon, collapsed, body: html, footer: html }
  // Daralt/genişlet düğmesi data-sidebar-toggle taşır; olay bağlamayı çağıran yapar.
  function sidebar(opts) {
    const o = Object.assign({ title: '', icon: '', collapsed: false, body: '', footer: '' }, opts);
    return '<aside class="bg-white dark:bg-surface-card border-r border-slate-200 dark:border-border-subtle h-full flex flex-col transition-all duration-200 select-none overflow-hidden shrink-0 ' + (o.collapsed ? 'w-12' : 'w-64') + '">' +
      '<div class="h-12 px-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/40">' +
        (!o.collapsed ? '<div class="flex items-center gap-2 overflow-hidden">' + (o.icon ? '<i class="' + o.icon + ' text-sky-500 text-sm shrink-0"></i>' : '') +
          '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">' + esc(o.title) + '</span></div>' : '') +
        '<button type="button" data-sidebar-toggle class="w-7 h-7 rounded-[2px] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors ml-auto" title="' + (o.collapsed ? 'Genişlet' : 'Daralt') + '">' +
          '<i class="' + (o.collapsed ? 'pi pi-chevron-right text-xs' : 'pi pi-chevron-left text-xs') + '"></i></button>' +
      '</div>' +
      '<div class="flex-1 overflow-y-auto p-2 space-y-1">' + o.body + '</div>' +
      '<div class="shrink-0 border-t border-slate-200 dark:border-border-subtle p-2 bg-slate-50/30 dark:bg-slate-900/30">' + o.footer + '</div>' +
    '</aside>';
  }

  // ---------------------------------------------------------------------------
  // Dışa aktarım (ExcelJS / jsPDF yerine)
  // ---------------------------------------------------------------------------
  // columns: [{ header, value: row => any }] — Excel'in Türkçe yerel ayarı için ';' ayraçlı, BOM'lu CSV
  function exportExcel(filename, columns, rows) {
    const cell = v => {
      const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [columns.map(c => cell(c.header)).join(';')]
      .concat(rows.map(r => columns.map(c => cell(c.value(r))).join(';')));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/\.(xlsx|xls|csv)$/i, '') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    DCIM.ui.toast(rows.length + ' satır dışa aktarıldı.', 'success', 'Excel');
  }

  function exportPdf() {
    DCIM.ui.toast('Yazdırma penceresinde "PDF olarak kaydet" seçin.', 'info', 'PDF');
    setTimeout(() => window.print(), 150);
  }

  // ---------------------------------------------------------------------------
  // Chart.js tema yardımcıları (window.Chart varsa)
  // ---------------------------------------------------------------------------
  const PALETTE = { sky: '#0ea5e9', emerald: '#10b981', amber: '#f59e0b', rose: '#f43f5e', violet: '#8b5cf6', orange: '#f97316', cyan: '#06b6d4', slate: '#64748b' };

  function chartColors() {
    const dark = DCIM.theme.mode() === 'dark';
    return {
      text: dark ? '#94a3b8' : '#475569',
      grid: dark ? 'rgba(27,38,59,0.9)' : 'rgba(226,232,240,0.9)',
      tooltipBg: dark ? '#0e1726' : '#ffffff',
      tooltipBorder: dark ? '#1b263b' : '#e2e8f0',
      tooltipText: dark ? '#e2e8f0' : '#0f172a'
    };
  }

  function applyChartDefaults() {
    if (!window.Chart) return;
    const c = chartColors();
    const d = window.Chart.defaults;
    d.color = c.text;
    d.borderColor = c.grid;
    // Canvas 'inherit' değerini tanımaz; gövdenin hesaplanmış yazı tipini kullan
    d.font.family = (document.body && getComputedStyle(document.body).fontFamily) || 'Inter, ui-sans-serif, system-ui, sans-serif';
    d.font.size = 10;
    d.animation = { duration: 300 };
    d.maintainAspectRatio = false;
    d.plugins.legend.labels.boxWidth = 10;
    d.plugins.legend.labels.boxHeight = 10;
    d.plugins.tooltip.backgroundColor = c.tooltipBg;
    d.plugins.tooltip.borderColor = c.tooltipBorder;
    d.plugins.tooltip.borderWidth = 1;
    d.plugins.tooltip.titleColor = c.tooltipText;
    d.plugins.tooltip.bodyColor = c.tooltipText;
    d.plugins.tooltip.cornerRadius = 2;
  }
  applyChartDefaults();
  document.addEventListener('dcim:theme', applyChartDefaults);

  // Tohumlu zaman serisi: points adet, stepMin dakika aralıklı; fn(i, rnd) değer üretir
  function series(seed, points, stepMin, fn) {
    const rnd = DCIM.data.rng(typeof seed === 'number' ? seed : DCIM.data.hash(String(seed)));
    const now = Date.now();
    const out = [];
    for (let i = 0; i < points; i++) out.push({ t: new Date(now - (points - 1 - i) * stepMin * 60000), v: fn(i, rnd) });
    return out;
  }

  DCIM.kit = { pageHeader, card, formField, select, INPUT_CLS, emptyState, sidebar, exportExcel, exportPdf, PALETTE, chartColors, applyChartDefaults, series };
})();
