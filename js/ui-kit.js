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

  // ---------------------------------------------------------------------------
  // app-data-table mobil kart görünümü ([mobileCards]="true") — lg altı (<1024px) ekranlarda satırlar kart olur.
  // Görünürlük yalnız CSS ile: kart kabı CARDS_WRAP_CLS ('lg:hidden'), tablo kabına 'max-lg:hidden' eklenir.
  // columns: [{ field, header, mobile: 'primary'|'badge'|'sub'|'secondary'|'meta'|'extra'|'hide', mobileIcon, mobileBlock,
  //             card: (row, i) => html  (yoksa render, o da yoksa esc(value(row) | row[field])) }]
  // opts: { start: sıra no başlangıcı, rowAttrs: row => 'data-row="…"', cardCls: row => '', tone: row => acil|alarm|warning|lost|normal|info,
  //         empty: 'Veri bulunamadı' }
  // 'extra' alanlar <details> ile "Detayları Göster / Gizle" şeridinde açılır (JS gerekmez).
  // ---------------------------------------------------------------------------
  const CARDS_WRAP_CLS = 'lg:hidden flex-1 min-h-0 overflow-y-auto w-full p-2 space-y-1.5 bg-slate-100 dark:bg-[#080c14]';
  const TONE_COLOR = { acil: '#a855f7', alarm: '#f43f5e', critical: '#f43f5e', warning: '#f59e0b', lost: '#f97316', normal: '#10b981', info: '#0ea5e9', muted: '#64748b' };
  const isEmptyVal = v => v === undefined || v === null || v === '';

  function cardCell(col, row, i) {
    const fn = col.card || col.render;
    if (fn) return fn(row, i);
    const v = col.value ? col.value(row) : row[col.field];
    return isEmptyVal(v) ? '-' : esc(v);
  }

  function dataCards(rows, columns, opts) {
    const o = Object.assign({ start: 0, rowAttrs: null, cardCls: null, tone: null, empty: 'Veri bulunamadı' }, opts || {});
    if (!rows.length) {
      return '<div class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i>' +
        '<span class="italic text-xs">' + esc(o.empty) + '</span></div>';
    }
    const by = k => columns.filter(c => c.mobile === k && c.visible !== false);
    const primary = by('primary')[0] || columns.find(c => !c.mobile || c.mobile === 'meta');
    const badge = by('badge')[0];
    const sub = by('sub')[0];
    const secondary = by('secondary')[0];
    const meta = columns.filter(c => c !== primary && c.visible !== false && c.desktopOnly !== true && (c.mobile === 'meta' || (!c.mobile && c.field !== 'siraNo' && c.field !== 'actions')));
    const extra = by('extra');
    return rows.map((row, idx) => {
      const i = o.start + idx + 1;
      const tone = o.tone ? o.tone(row) : '';
      const color = TONE_COLOR[tone] || '';
      const frame = color ? ' style="border-color:' + color + '66; box-shadow: inset 0 3px 0 ' + color + ';"' : '';
      const metaHtml = meta.length
        ? '<dl class="mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">' +
            meta.map(c => {
              const long = c.mobileBlock || (!c.card && !c.render && String((c.value ? c.value(row) : row[c.field]) || '').length > 16);
              return '<div class="flex gap-1 min-w-0' + (long ? ' col-span-2' : '') + (c.mobileBlock ? ' flex-col' : '') + '">' +
                '<dt class="shrink-0 max-w-[55%] truncate text-slate-400 dark:text-slate-500">' + esc(c.header) + ':</dt>' +
                '<dd class="min-w-0 break-words font-semibold text-slate-700 dark:text-slate-200">' + cardCell(c, row, i) + '</dd></div>';
            }).join('') + '</dl>'
        : '';
      const extraHtml = extra.length
        ? '<details class="group">' +
            '<summary class="list-none [&::-webkit-details-marker]:hidden mt-1.5 -mx-2.5 -mb-1.5 h-7 flex items-center justify-center gap-1.5 border-t border-sky-200/70 dark:border-sky-500/20 bg-sky-50 dark:bg-sky-500/10 text-[11px] font-bold tracking-wide text-sky-700 dark:text-sky-300 cursor-pointer select-none group-open:order-last">' +
              '<span class="group-open:hidden">Detayları Göster</span><span class="hidden group-open:inline">Detayları Gizle</span>' +
              '<i class="pi pi-chevron-down text-[10px] group-open:rotate-180 transition-transform"></i></summary>' +
            '<dl class="mt-1.5 pt-1.5 pb-1 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">' +
              extra.map(c => '<div class="min-w-0' + (c.mobileBlock ? ' col-span-2' : '') + '"><dt class="text-slate-400 dark:text-slate-500 truncate">' + esc(c.header) + '</dt>' +
                '<dd class="font-semibold text-slate-700 dark:text-slate-200 break-words">' + cardCell(c, row, i) + '</dd></div>').join('') +
            '</dl></details>'
        : '';
      return '<article class="rounded-[3px] border border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card shadow-2xs px-2.5 py-1.5 ' +
          (o.cardCls ? o.cardCls(row) : '') + '" ' + (o.rowAttrs ? o.rowAttrs(row) : '') + frame + '>' +
        '<div class="flex items-center justify-between gap-2">' +
          (primary ? '<div class="min-w-0 break-words text-[12.5px] font-extrabold leading-tight text-slate-900 dark:text-slate-100">' + cardCell(primary, row, i) + '</div>' : '') +
          (badge ? '<div class="shrink-0" data-card-badge>' + cardCell(badge, row, i) + '</div>' : '') +
        '</div>' +
        (sub ? '<div class="mt-1 flex items-start gap-1.5 text-[14px] font-bold leading-snug text-sky-700 dark:text-sky-300">' +
          '<i class="pi ' + esc(sub.mobileIcon || 'pi-building') + ' text-[12px] mt-[3px] shrink-0 opacity-80"></i><span class="min-w-0 break-words">' + cardCell(sub, row, i) + '</span></div>' : '') +
        (secondary ? '<div class="mt-0.5 text-[12.5px] font-medium leading-snug text-slate-600 dark:text-slate-300 break-words">' + cardCell(secondary, row, i) + '</div>' : '') +
        metaHtml + extraHtml +
      '</article>';
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // app-data-table (shared/components/data-table) — istemci tarafı süzme / sayfalama, varsayılan 50 satır,
  // arama, hızlı filtre çipleri, sütun içi filtre satırı, sütun görünürlüğü, Online rozeti, [table-actions] yuvası,
  // mobil kart görünümü. dataTable(host, opts) → api
  // opts: { columns:[{field, header, sortable, width, minWidth, maxWidth, wrap, filterable, filter:{type:'select', options:[{value,label}]},
  //                   visible, desktopOnly, mobileOnly, mobile, mobileIcon, mobileBlock, value(row), render(row,i), card(row,i)}],
  //         rows, rowKey, searchable, searchFields, search, filters, showFilters, quickFilters:[{label,value}], quick, quickFn(row,value),
  //         sortField, sortOrder, page, pageSize, mobileCards, rowClass(row), rowAttrs(row), cardTone(row), onRowClick(row, ev),
  //         actions: html, onActions(el), onRefresh(), conStatus: 'con1'|'con0'|'conE'|fn, emptyText, filterRow(row) (sayfa süzgeci),
  //         onChange(state), afterBody(pageRows, start, host) (her gövde çiziminden sonra; ör. özel görünüm) }
  // api: { el, state, render(), renderBody(), setRows(rows), getFiltered(), setSearch(q), setFilters(f), setShowFilters(b), actionsEl }
  // ---------------------------------------------------------------------------
  const DT_FILTER_INPUT = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const DT_TOOL_BTN = 'px-2.5 py-1 max-lg:py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer';
  const DT_PG_BTN = 'w-7 h-7 max-lg:w-9 max-lg:h-9 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer';
  const DT_PAGE_SIZES = [5, 10, 15, 20, 50, 100];
  const lcTr = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');

  function dataTable(host, opts) {
    const o = Object.assign({
      columns: [], rows: [], rowKey: (r, i) => String(i), searchable: true, searchFields: null,
      quickFilters: [], quickFn: null, mobileCards: true, rowClass: null, rowAttrs: null, cardTone: null, onRowClick: null,
      actions: '', onActions: null, onRefresh: null, conStatus: 'con1', emptyText: 'Veri bulunamadı', filterRow: null, onChange: null, afterBody: null
    }, opts || {});
    const state = {
      search: o.search || '', filters: Object.assign({}, o.filters || {}), showFilters: !!o.showFilters,
      quick: o.quick || (o.quickFilters.length ? o.quickFilters[0].value : ''), sortField: o.sortField || '', sortOrder: o.sortOrder || 1,
      page: o.page || 1, pageSize: o.pageSize || 50, hidden: {}, showColMenu: false
    };
    o.columns.forEach(c => { if (c.visible === false) state.hidden[c.field] = true; });
    let rows = o.rows || [];
    let filtered = [];
    const valueOf = (c, r) => (c.value ? c.value(r) : r[c.field]);
    const deskCols = () => o.columns.filter(c => !c.mobileOnly && !state.hidden[c.field]);
    const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '') + (c.maxWidth ? 'max-width:' + c.maxWidth + ';' : '');
    const conStatus = () => (typeof o.conStatus === 'function' ? o.conStatus() : o.conStatus);
    const changed = () => { if (o.onChange) o.onChange(api.state); };

    function computeFiltered() {
      let list = rows.slice();
      if (o.filterRow) list = list.filter(o.filterRow);
      if (state.quick && o.quickFn) list = list.filter(r => o.quickFn(r, state.quick));
      const q = lcTr(state.search.trim());
      if (q) {
        const cs = o.searchFields ? o.columns.filter(c => o.searchFields.indexOf(c.field) >= 0) : o.columns;
        list = list.filter(r => cs.some(c => lcTr(valueOf(c, r)).indexOf(q) >= 0));
      }
      o.columns.forEach(c => {
        const f = state.filters[c.field];
        if (f == null || String(f).trim() === '') return;
        if (c.filter && c.filter.type === 'select') list = list.filter(r => String(valueOf(c, r)) === String(f));
        else { const s = lcTr(String(f).trim()); list = list.filter(r => lcTr(valueOf(c, r)).indexOf(s) >= 0); }
      });
      if (state.sortField) {
        const c = o.columns.find(x => x.field === state.sortField);
        if (c) list.sort((a, b) => {
          const va = valueOf(c, a), vb = valueOf(c, b);
          const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'tr', { numeric: true });
          return r * state.sortOrder;
        });
      }
      return list;
    }

    function filterCell(c) {
      if (c.filterable === false || c.field === 'actions' || c.field === 'siraNo') return '';
      const v = state.filters[c.field] || '';
      if (c.filter && c.filter.type === 'select') {
        return '<select data-dt-f="' + esc(c.field) + '" class="' + DT_FILTER_INPUT + '">' +
          [{ value: '', label: '-Tümü-' }].concat(c.filter.options).map(op =>
            '<option value="' + esc(op.value) + '"' + (String(op.value) === String(v) ? ' selected' : '') + '>' + esc(op.label) + '</option>').join('') + '</select>';
      }
      return '<input type="text" data-dt-f="' + esc(c.field) + '" value="' + esc(v) + '" placeholder="Filtre" class="' + DT_FILTER_INPUT + '" />';
    }

    function shell() {
      const chips = o.quickFilters.length
        ? '<div class="flex items-center gap-1 max-lg:max-w-full max-lg:overflow-x-auto max-lg:pb-0.5" data-dt-quick>' +
            o.quickFilters.map(f => '<button type="button" data-dt-q="' + esc(f.value) + '" class="px-2 py-1 max-lg:px-3 max-lg:py-1.5 max-lg:whitespace-nowrap max-lg:shrink-0 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + esc(f.label) + '</button>').join('') +
          '</div>'
        : '';
      host.innerHTML =
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden w-full h-full">' +
          '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">' +
            '<div class="flex flex-wrap items-center gap-2 max-lg:w-full max-lg:flex-col max-lg:items-stretch">' +
              (o.searchable
                ? '<div class="relative w-60 sm:w-72 max-lg:w-full">' +
                    '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
                    '<input type="text" data-dt-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 max-lg:py-2.5 text-xs max-lg:text-sm bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
                  '</div>'
                : '') +
              chips +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0 ml-auto max-lg:ml-0 max-lg:w-full max-lg:flex-wrap">' +
              '<span data-dt-con></span>' +
              '<div data-dt-actions class="flex items-center gap-1.5">' + (o.actions || '') + '</div>' +
              '<button type="button" data-dt-clear title="Temizle" class="hidden px-2.5 py-1 text-xs rounded-[2px] border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 items-center transition-all cursor-pointer"><i class="pi pi-filter-slash text-xs"></i></button>' +
              '<button type="button" data-dt-filter title="Filtre" class="px-2.5 py-1 max-lg:py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer"><i class="pi pi-filter text-xs"></i><span>Filtre</span></button>' +
              '<div class="relative max-lg:hidden">' +
                '<button type="button" data-dt-colmenu class="' + DT_TOOL_BTN + '"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
                '<div data-dt-colpanel class="hidden absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
              '</div>' +
              '<button type="button" data-dt-refresh title="Yenile" class="' + DT_TOOL_BTN + '"><i class="pi pi-refresh text-xs"></i><span>Yenile</span></button>' +
            '</div>' +
          '</div>' +
          '<div data-dt-scroll class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar' + (o.mobileCards ? ' max-lg:hidden' : '') + '">' +
            '<table class="scada-table w-full text-left border-collapse text-xs"><thead class="sticky top-0 z-10 shadow-2xs" data-dt-thead></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-dt-tbody></tbody></table>' +
          '</div>' +
          (o.mobileCards ? '<div data-dt-cards class="' + CARDS_WRAP_CLS + '"></div>' : '') +
          '<div data-dt-footer class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0"></div>' +
        '</div>';
      const $ = s => host.querySelector(s);
      api.actionsEl = $('[data-dt-actions]');
      let t = null;
      const sIn = $('[data-dt-search]');
      if (sIn) sIn.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); changed(); }, 150); });
      host.querySelectorAll('[data-dt-q]').forEach(b => b.addEventListener('click', () => { state.quick = b.getAttribute('data-dt-q'); state.page = 1; renderTools(); renderBody(); changed(); }));
      $('[data-dt-filter]').addEventListener('click', () => { state.showFilters = !state.showFilters; renderTools(); renderHead(); changed(); });
      $('[data-dt-clear]').addEventListener('click', clearFilters);
      const colBtn = $('[data-dt-colmenu]');
      const colPanel = $('[data-dt-colpanel]');
      colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
      colPanel.addEventListener('click', e => e.stopPropagation());
      document.addEventListener('click', () => colPanel.classList.add('hidden'));
      $('[data-dt-refresh]').addEventListener('click', () => {
        const ic = $('[data-dt-refresh] i');
        ic.className = 'pi pi-spin pi-spinner text-xs';
        setTimeout(() => { ic.className = 'pi pi-refresh text-xs'; if (o.onRefresh) o.onRefresh(); renderBody(); }, 450);
      });
      const onRow = e => {
        if (!o.onRowClick || e.target.closest('a,button,input,select,summary,[data-stop]')) return;
        const el = e.target.closest('[data-dt-row]');
        if (el) { const r = filtered[parseInt(el.getAttribute('data-dt-row'), 10)]; if (r) o.onRowClick(r, e); }
      };
      $('[data-dt-tbody]').addEventListener('click', onRow);
      if (o.mobileCards) $('[data-dt-cards]').addEventListener('click', onRow);
      if (o.onActions) o.onActions(api.actionsEl);
    }

    function renderTools() {
      const $ = s => host.querySelector(s);
      host.querySelectorAll('[data-dt-q]').forEach(b => {
        const on = b.getAttribute('data-dt-q') === String(state.quick);
        b.classList.remove('bg-sky-600', 'text-white', 'font-bold', 'border-sky-600', 'bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-700', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
        (on ? ['bg-sky-600', 'text-white', 'font-bold', 'border-sky-600'] : ['bg-white', 'dark:bg-slate-800', 'text-slate-700', 'dark:text-slate-300', 'border-slate-200', 'dark:border-slate-700', 'hover:bg-slate-100', 'dark:hover:bg-slate-700']).forEach(c => b.classList.add(c));
      });
      const fb = $('[data-dt-filter]');
      fb.className = 'px-2.5 py-1 max-lg:py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
        (state.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
      const cb = $('[data-dt-clear]');
      cb.classList.toggle('hidden', !state.showFilters);
      cb.classList.toggle('flex', state.showFilters);
      const cs = conStatus();
      $('[data-dt-con]').innerHTML = cs === 'con0'
        ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0" title="Yükleniyor"><i class="pi pi-spin pi-spinner text-[10px]"></i><span>Yükleniyor</span></span>'
        : cs === 'conE'
          ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0" title="Bağlantı Hatası"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>Bağlantı Hatası</span></span>'
          : '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0 max-lg:hidden" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>';
    }

    function renderColMenu() {
      const panel = host.querySelector('[data-dt-colpanel]');
      panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
        o.columns.filter(c => !c.mobileOnly).map(c =>
          '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
          '<input type="checkbox" data-dt-col="' + esc(c.field) + '"' + (state.hidden[c.field] ? '' : ' checked') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>').join('');
      panel.querySelectorAll('[data-dt-col]').forEach(chk => chk.addEventListener('change', () => {
        state.hidden[chk.getAttribute('data-dt-col')] = !chk.checked;
        renderHead(); renderBody();
      }));
    }

    function renderHead() {
      const thead = host.querySelector('[data-dt-thead]');
      const cs = deskCols();
      let h = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
        cs.map(c => '<th' + (c.sortable ? ' data-dt-sort="' + esc(c.field) + '"' : '') + ' class="py-2 px-2 text-left font-bold bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap' +
          (c.sortable ? ' cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors' : '') + '" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
          '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
          (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
          '</div></th>').join('') + '</tr>';
      if (state.showFilters) {
        h += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
          cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' + filterCell(c) + '</th>').join('') + '</tr>';
      }
      thead.innerHTML = h;
      thead.querySelectorAll('[data-dt-sort]').forEach(th => th.addEventListener('click', () => {
        const f = th.getAttribute('data-dt-sort');
        if (state.sortField === f) state.sortOrder *= -1; else { state.sortField = f; state.sortOrder = 1; }
        renderHead(); renderBody();
      }));
      thead.querySelectorAll('[data-dt-f]').forEach(inp => {
        let t = null;
        inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
          clearTimeout(t);
          t = setTimeout(() => { state.filters[inp.getAttribute('data-dt-f')] = inp.value; state.page = 1; renderBody(); changed(); }, inp.tagName === 'SELECT' ? 0 : 150);
        });
      });
    }

    function clearFilters() {
      state.filters = {}; state.search = ''; state.page = 1;
      if (o.quickFilters.length) state.quick = o.quickFilters[0].value;
      const s = host.querySelector('[data-dt-search]');
      if (s) s.value = '';
      renderTools(); renderHead(); renderBody(); changed();
    }

    function renderBody() {
      filtered = computeFiltered();
      const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
      if (state.page > totalPages) state.page = totalPages;
      const start = (state.page - 1) * state.pageSize;
      const page = filtered.slice(start, start + state.pageSize);
      const cs = deskCols();
      const tbody = host.querySelector('[data-dt-tbody]');
      tbody.innerHTML = page.length
        ? page.map((r, i) => '<tr data-dt-row="' + (start + i) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors' + (o.onRowClick ? ' cursor-pointer' : '') + (o.rowClass ? ' ' + o.rowClass(r) : '') + '" ' + (o.rowAttrs ? o.rowAttrs(r) : '') + '>' +
            cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' +
              (c.render ? c.render(r, start + i + 1) : (c.field === 'siraNo' ? String(start + i + 1) : '<span title="' + esc(valueOf(c, r)) + '">' + esc(valueOf(c, r)) + '</span>')) + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + cs.length + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">' + esc(o.emptyText) + '</span></td></tr>';
      if (o.mobileCards) {
        host.querySelector('[data-dt-cards]').innerHTML = dataCards(page, o.columns.filter(c => !state.hidden[c.field] || c.mobileOnly), {
          start, empty: o.emptyText, tone: o.cardTone,
          rowAttrs: (r) => 'data-dt-row="' + filtered.indexOf(r) + '"' + (o.rowAttrs ? ' ' + o.rowAttrs(r) : '')
        });
      }
      const footer = host.querySelector('[data-dt-footer]');
      footer.innerHTML =
        '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + filtered.length + '</span> kayıt listeleniyor.</div>' +
        '<div class="flex items-center gap-3 self-end sm:self-auto max-lg:w-full max-lg:justify-between">' +
          '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
            '<select data-dt-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
            DT_PAGE_SIZES.concat(DT_PAGE_SIZES.indexOf(state.pageSize) < 0 ? [state.pageSize] : []).sort((a, b) => a - b)
              .map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" data-dt-page="-1"' + (state.page <= 1 ? ' disabled' : '') + ' class="' + DT_PG_BTN + '"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
            '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + state.page + ' / ' + totalPages + '</span>' +
            '<button type="button" data-dt-page="1"' + (state.page >= totalPages ? ' disabled' : '') + ' class="' + DT_PG_BTN + '"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
          '</div>' +
        '</div>';
      footer.querySelector('[data-dt-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderBody(); changed(); });
      footer.querySelectorAll('[data-dt-page]').forEach(b => b.addEventListener('click', () => {
        state.page += parseInt(b.getAttribute('data-dt-page'), 10);
        renderBody(); changed();
        host.querySelector('[data-dt-scroll]').scrollTop = 0;
        if (o.mobileCards) host.querySelector('[data-dt-cards]').scrollTop = 0;
      }));
      if (o.afterBody) o.afterBody(page, start, host);
    }

    const api = {
      el: host, state, actionsEl: null,
      render() { shell(); renderTools(); renderHead(); renderBody(); },
      renderBody, renderTools,
      setRows(r) { rows = r || []; renderBody(); },
      getFiltered() { return filtered.slice(); },
      setSearch(q) { state.search = q || ''; state.page = 1; const s = host.querySelector('[data-dt-search]'); if (s) s.value = state.search; renderBody(); changed(); },
      setFilters(f) { state.filters = Object.assign({}, f || {}); state.page = 1; renderHead(); renderBody(); changed(); },
      setShowFilters(b) { state.showFilters = !!b; renderTools(); renderHead(); changed(); },
      clearFilters
    };
    api.render();
    return api;
  }

  DCIM.kit = { pageHeader, card, formField, select, INPUT_CLS, emptyState, sidebar, exportExcel, exportPdf, PALETTE, chartColors, applyChartDefaults, series,
    CARDS_WRAP_CLS, dataCards, dataTable };
})();
