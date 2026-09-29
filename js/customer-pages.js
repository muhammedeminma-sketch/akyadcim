/* ==========================================================================
   DCIM Sunum — Müşteri Eşleştirme
   NewuicmpCustomerPagesComponent ("Müşteri Eşleştirme") +
   NewuicmpCustomerPagesMatchingPduComponent ("Eşleşen Müşteriler (PDU)")
   Açılır pencereler: CustomerChangeComponent (PDU/outlet eşleştirme formu),
   CustomerPagesDetailsComponent, TableDialogComponent, CustomerMatchingReportPopupComponent.
   WOR/CDB XDB sorguları yerine DCIM.data.customers (js/mock-data.js) bellek içi kullanılır.
   Derin bağlantı: ?tab=matching|matched  &open=match|matched|edit|details|report  &q=arama
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  const CU = DCIM.data.customers;
  DCIM.shell.init({ active: 'customers' });

  // ---------------------------------------------------------------------------
  // Bellek içi "sunucu" durumu (WOR/S00 WOR_List + CDB/S00 CDB_List)
  // ---------------------------------------------------------------------------
  const store = {
    wor: CU.worList.map(x => Object.assign({}, x)),
    cdb: CU.cdbList.map(x => Object.assign({}, x)),
    matched: []
  };

  const stripK = id => (id && id.charAt(0) === 'K' ? id.substring(1) : id || '');
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');

  function parseMeter(meter) {
    if (!meter) return [];
    if (Array.isArray(meter)) return meter;
    if (typeof meter !== 'string' || meter.trim() === '') return [];
    try {
      const parsed = JSON.parse(meter.replace(/\\"/g, '"'));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return [];
    }
  }
  const outletLabel = n => {
    const s = String(n);
    return s.charAt(0) === '-' ? 'out_' + s.substring(1) : 'in_' + s;
  };
  // getPduOutletList / getPduOutletPairs / con_host (CMR/T01 @con_host sorgusu yerine cihaz listesi)
  function pduOutletList(row) {
    return parseMeter(row.meter).map(v => ({
      device: stripK(v.dev || 'Bilinmeyen PDU'),
      outlets: Array.isArray(v.meter) ? v.meter.map(outletLabel).join(', ') : 'N/A'
    }));
  }
  function pduOutletPairsHtml(row) {
    const list = pduOutletList(row);
    if (!list.length) return 'N/A';
    return list.map(i => '<div class="pdu-line"><strong>' + esc(i.device) + ':</strong> ' + esc(i.outlets) + '</div>').join('');
  }
  function pduOutletPairsText(row) {
    const list = pduOutletList(row);
    return list.length ? list.map(i => i.device + ': ' + i.outlets).join('\n') : 'N/A';
  }
  function conHost(row) {
    const arr = parseMeter(row.meter);
    if (!arr.length) return 'N/A';
    return arr.map(m => {
      const dev = m && m.dev ? CU.findPdu(m.dev) : null;
      return dev ? dev.con_host : (m && m.dev ? stripK(m.dev) + ' (IP bulunamadı)' : '');
    }).filter(Boolean).join(', ');
  }
  const ipList = row => {
    const h = conHost(row);
    return h && h !== 'N/A' ? h.split(',').map(s => s.trim()).filter(Boolean) : [];
  };

  // NewuicmpCustomerPagesComponent qry_out işleme mantığı:
  // eşleşmişler popup'a, CDB'de zaten olan ürünler gizli, aynı enerji ürününde ilk tamamlanan görünür.
  function pendingRows() {
    const existing = new Set(store.cdb.map(c => String(c.energy_product_id)));
    const matchedMap = new Map(store.matched.map(m => [m.id, m]));
    const raw = store.wor.filter(w => w.sta === '0x0304' && String(w.energy_product_id || '').length > 0);
    const first = new Map();
    raw.forEach(item => {
      const ep = String(item.energy_product_id);
      const ex = first.get(ep);
      if (!ex || item.tim_end_ms < ex.tim_end_ms) first.set(ep, item);
    });
    const unique = [];
    raw.forEach(item => {
      if (item.is_matched) { matchedMap.set(item.id, item); return; }
      const ep = String(item.energy_product_id);
      if (existing.has(ep)) return;
      if (first.get(ep) === item) unique.push(item);
    });
    store.matched = Array.from(matchedMap.values());
    return unique;
  }

  // ---------------------------------------------------------------------------
  // app-data-table (AppDataTableComponent) vanilla karşılığı
  // cfg: { columns, rows(), cell(col,row), searchText(row), filterText(row,field), actions(), onClick(e), onRefresh, onShowFilters, onClearFilters, emptyText }
  // ---------------------------------------------------------------------------
  function DataTable(host, cfg) {
    const st = { search: cfg.search || '', showFilters: false, colFilters: {}, sortField: '', sortOrder: 1, page: 1, pageSize: cfg.pageSize || 10, selected: new Set(), loading: false, showColMenu: false };
    const cols = cfg.columns.map(c => Object.assign({ visible: true }, c));
    const visible = () => cols.filter(c => c.visible !== false);
    const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '') + (c.maxWidth ? 'max-width:' + c.maxWidth + ';' : '');
    const rowId = r => String(r.id || r.rid);
    let lastRows = [];

    function filtered() {
      let list = cfg.rows().slice();
      const q = lc(st.search.trim());
      if (q) list = list.filter(r => lc(cfg.searchText ? cfg.searchText(r) : Object.keys(r).map(k => r[k]).join(' ')).indexOf(q) >= 0);
      Object.keys(st.colFilters).forEach(f => {
        const v = lc((st.colFilters[f] || '').trim());
        if (!v) return;
        list = list.filter(r => lc(cfg.filterText ? cfg.filterText(r, f) : r[f]).indexOf(v) >= 0);
      });
      if (st.sortField) {
        const key = r => { const v = cfg.sortValue ? cfg.sortValue(r, st.sortField) : r[st.sortField]; return v == null ? '' : v; };
        list.sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -st.sortOrder : ka > kb ? st.sortOrder : 0; });
      }
      return list;
    }
    function pageRows() {
      const start = (st.page - 1) * st.pageSize;
      return lastRows.slice(start, start + st.pageSize);
    }

    host.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden w-full">' +
        '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<div class="relative w-60 sm:w-72">' +
              '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
              '<input type="text" data-search placeholder="Ara" value="' + esc(st.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 shrink-0" data-right></div>' +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full" data-scroll' + (cfg.maxHeight ? ' style="max-height:' + cfg.maxHeight + '"' : '') + '>' +
          '<table class="scada-table w-full text-left border-collapse text-xs">' +
            '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
          '</table>' +
        '</div>' +
        '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0" data-footer></div>' +
      '</div>';

    const q = sel => host.querySelector(sel);

    function renderRight() {
      const conBadge = st.loading
        ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0" title="Yükleniyor"><i class="pi pi-spin pi-spinner text-[10px]"></i><span>Yükleniyor</span></span>'
        : '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>';
      const bulk = st.selected.size > 0
        ? '<div class="px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"><span>' + st.selected.size + ' seçili</span>' +
          '<button type="button" data-bulk class="underline hover:text-sky-800 dark:hover:text-sky-300">İşlemler</button></div>'
        : '';
      const filterBtn = cfg.filterable === false ? '' :
        '<button type="button" data-filter-toggle title="Filtre" class="px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
          (st.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700') + '">' +
          '<i class="pi pi-filter text-xs"></i><span>Filtre</span></button>';
      const colMenu = st.showColMenu
        ? '<div data-colmenu-panel class="absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1">' +
            '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
            cols.map((c, i) =>
              '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
              '<input type="checkbox" data-col="' + i + '"' + (c.visible !== false ? ' checked' : '') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>').join('') +
          '</div>'
        : '';
      q('[data-right]').innerHTML = conBadge + bulk +
        (cfg.actions ? cfg.actions() : '') +
        filterBtn +
        '<div class="relative">' +
          '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
          colMenu +
        '</div>' +
        '<button type="button" data-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>';
    }

    function renderHead() {
      const cs = visible();
      let html = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
        '<th class="py-2 px-1 text-center bg-slate-100 dark:bg-surface-base" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-check-all class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
        cs.map(c =>
          '<th data-sort="' + esc(c.field) + '" class="py-2 px-2 text-left font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
            '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
            (st.sortField === c.field ? '<i class="' + (st.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
            '</div></th>').join('') + '</tr>';
      if (st.showFilters) {
        html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
          '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-[#0b121e]" style="width: 36px; min-width: 36px; max-width: 36px;"><button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button></th>' +
          cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' +
            (c.field !== 'actions' && c.filterable !== false
              ? '<input type="text" data-cf="' + esc(c.field) + '" value="' + esc(st.colFilters[c.field] || '') + '" placeholder="Filtre" class="w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />'
              : '') + '</th>').join('') +
          '</tr>';
      }
      q('[data-thead]').innerHTML = html;
    }

    function renderBody() {
      lastRows = filtered();
      const totalPages = Math.ceil(lastRows.length / st.pageSize) || 1;
      if (st.page > totalPages) st.page = totalPages;
      const rows = pageRows();
      const cs = visible();
      q('[data-tbody]').innerHTML = !rows.length
        ? '<tr><td colspan="' + (cs.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">' + esc(cfg.emptyText || 'Veri bulunamadı') + '</span></td></tr>'
        : rows.map(r => {
          const id = rowId(r);
          const sel = st.selected.has(id);
          return '<tr data-row="' + esc(id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (sel ? ' bg-sky-500/5' : '') + '">' +
            '<td class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;" data-check-cell><input type="checkbox" data-row-check' + (sel ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
            cs.map(c => {
              const custom = cfg.cell ? cfg.cell(c, r) : null;
              const val = r[c.field] == null ? '' : r[c.field];
              return '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' +
                (custom != null ? custom : '<span class="' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" title="' + esc(val) + '">' + esc(val) + '</span>') + '</td>';
            }).join('') + '</tr>';
        }).join('');
      const all = q('[data-check-all]');
      if (all) all.checked = rows.length > 0 && rows.every(r => st.selected.has(rowId(r)));

      q('[data-footer]').innerHTML =
        '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastRows.length + '</span> kayıt listeleniyor.</div>' +
        '<div class="flex items-center gap-3 self-end sm:self-auto">' +
          '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
            '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
            [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === st.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" data-page="-1"' + (st.page <= 1 ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
            '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + st.page + ' / ' + totalPages + '</span>' +
            '<button type="button" data-page="1"' + (st.page >= totalPages ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
          '</div>' +
        '</div>';
    }

    // --- Olaylar (delegasyon) ---
    let searchTimer = null;
    host.addEventListener('input', e => {
      const t = e.target;
      if (t.hasAttribute('data-search')) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { st.search = t.value; st.page = 1; renderBody(); }, 150);
      } else if (t.hasAttribute('data-cf')) {
        st.colFilters[t.getAttribute('data-cf')] = t.value;
        st.page = 1;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderBody, 150);
      }
    });
    host.addEventListener('change', e => {
      const t = e.target;
      if (t.hasAttribute('data-pagesize')) { st.pageSize = parseInt(t.value, 10); st.page = 1; renderBody(); }
      else if (t.hasAttribute('data-col')) { const c = cols[parseInt(t.getAttribute('data-col'), 10)]; c.visible = t.checked; renderHead(); renderBody(); }
      else if (t.hasAttribute('data-check-all')) {
        if (t.checked) pageRows().forEach(r => st.selected.add(rowId(r))); else st.selected.clear();
        renderBody(); renderRight();
      }
    });
    host.addEventListener('click', e => {
      const t = e.target;
      if (cfg.onClick && cfg.onClick(e) === true) return;
      if (t.closest('[data-colmenu-panel]')) { e.stopPropagation(); return; }
      if (t.closest('[data-colmenu]')) { e.stopPropagation(); st.showColMenu = !st.showColMenu; renderRight(); return; }
      if (t.closest('[data-filter-toggle]')) {
        st.showFilters = !st.showFilters;
        renderHead(); renderRight();
        if (cfg.onShowFilters) cfg.onShowFilters(st.showFilters);
        return;
      }
      if (t.closest('[data-clear-filters]')) {
        st.colFilters = {}; st.search = ''; st.page = 1;
        q('[data-search]').value = '';
        renderHead(); renderBody();
        if (cfg.onClearFilters) cfg.onClearFilters();
        return;
      }
      if (t.closest('[data-refresh]')) { if (cfg.onRefresh) cfg.onRefresh(); else api.reload(); return; }
      const pg = t.closest('[data-page]');
      if (pg) { if (pg.disabled) return; st.page += parseInt(pg.getAttribute('data-page'), 10); renderBody(); q('[data-scroll]').scrollTop = 0; return; }
      const th = t.closest('[data-sort]');
      if (th && !t.closest('input')) {
        const f = th.getAttribute('data-sort');
        if (st.sortField === f) st.sortOrder *= -1; else { st.sortField = f; st.sortOrder = 1; }
        renderHead(); renderBody();
        return;
      }
      const tr = t.closest('[data-row]');
      if (tr) {
        const id = tr.getAttribute('data-row');
        if (st.selected.has(id)) st.selected.delete(id); else st.selected.add(id);
        renderBody(); renderRight();
      }
    });
    const closeColMenu = () => { if (st.showColMenu && host.isConnected) { st.showColMenu = false; renderRight(); } };
    document.addEventListener('click', closeColMenu);

    const api = {
      state: st,
      render() { renderRight(); renderHead(); renderBody(); },
      refresh() { renderRight(); renderBody(); },
      renderActions: renderRight,
      selectedRows() { return cfg.rows().filter(r => st.selected.has(rowId(r))); },
      clearSelection() { st.selected.clear(); renderRight(); renderBody(); },
      // Sunucu sorgusu simülasyonu: kısa "Yükleniyor" durumu
      reload(done) {
        st.loading = true; renderRight();
        setTimeout(() => { st.loading = false; api.refresh(); if (done) done(); }, 450);
      },
      destroy() { document.removeEventListener('click', closeColMenu); }
    };
    api.render();
    return api;
  }

  // ---------------------------------------------------------------------------
  // Mat-dialog benzeri pencere kabuğu (+ cdkDrag başlıktan sürükleme)
  // ---------------------------------------------------------------------------
  function openPane(opts) {
    const overlay = document.createElement('div');
    overlay.className = 'cp-overlay animate-fade-in';
    overlay.innerHTML = '<div class="cp-pane animate-modal-pop" style="' + (opts.style || '') + '">' + opts.html + '</div>';
    const pane = overlay.firstChild;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      closeSelectPanel();
      overlay.remove();
      if (opts.onClose) opts.onClose();
    };
    const onKey = e => { if (e.key === 'Escape' && !selectPanel) { if (opts.onEscape) opts.onEscape(); else close(); } };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay._down = true; });
    overlay.addEventListener('click', e => { if (e.target === overlay && overlay._down) { if (opts.onBackdrop) opts.onBackdrop(); else close(); } overlay._down = false; });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    const handle = pane.querySelector('[data-drag-handle]');
    if (handle) {
      let sx = 0, sy = 0, ox = 0, oy = 0, drag = false;
      handle.addEventListener('mousedown', e => {
        if (e.target.closest('button')) return;
        drag = true; sx = e.clientX; sy = e.clientY; e.preventDefault();
      });
      const move = e => { if (!drag) return; pane.style.transform = 'translate(' + (ox + e.clientX - sx) + 'px,' + (oy + e.clientY - sy) + 'px)'; };
      const up = e => { if (!drag) return; drag = false; ox += e.clientX - sx; oy += e.clientY - sy; };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    }
    return { overlay, pane, close };
  }

  // mat-select paneli (cdk overlay): tetikleyicinin altında sabit konumlu liste
  let selectPanel = null;
  function positionPanel(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    el.style.left = r.left + 'px';
    el.style.width = Math.max(r.width, el._minWidth || 0) + 'px';
    if (below < 240 && r.top > below) { el.style.top = ''; el.style.bottom = (window.innerHeight - r.top + 4) + 'px'; el.style.maxHeight = Math.min(300, r.top - 12) + 'px'; }
    else { el.style.bottom = ''; el.style.top = (r.bottom + 4) + 'px'; el.style.maxHeight = Math.min(300, below - 12) + 'px'; }
  }
  // Kaydırmada paneli tetikleyiciye göre yeniden konumla (cdk reposition stratejisi)
  function repositionSelectPanel() {
    if (selectPanel) positionPanel(selectPanel.el, selectPanel.anchor);
  }
  function closeSelectPanel() {
    if (!selectPanel) return;
    selectPanel.el.remove();
    if (selectPanel.anchor) selectPanel.anchor.classList.remove('is-open');
    document.removeEventListener('mousedown', selectPanel.onDown, true);
    document.removeEventListener('keydown', selectPanel.onKey, true);
    window.removeEventListener('resize', repositionSelectPanel);
    const cb = selectPanel.onClose;
    selectPanel = null;
    if (cb) cb();
  }
  function openSelectPanel(anchor, html, onClose) {
    closeSelectPanel();
    const el = document.createElement('div');
    el.className = 'scada-mat-select-panel custom-scrollbar';
    el.innerHTML = html;
    positionPanel(el, anchor);
    document.body.appendChild(el);
    anchor.classList.add('is-open');
    const onDown = e => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeSelectPanel(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); closeSelectPanel(); } };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', repositionSelectPanel);
    selectPanel = { el, anchor, onDown, onKey, onClose };
    return el;
  }

  // ---------------------------------------------------------------------------
  // CustomerChangeComponent — "Enerji CDR Değerleme (Düzenle)" PDU & outlet eşleştirme formu
  // ---------------------------------------------------------------------------
  const RO_MONO = 'px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm font-mono font-semibold text-slate-800 dark:text-slate-200 w-full focus:outline-none cursor-not-allowed transition-colors';
  const RO_AREA = 'px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm font-semibold text-slate-800 dark:text-slate-200 w-full focus:outline-none cursor-not-allowed transition-colors leading-snug resize-none';
  const LBL = 'text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider';

  function openCustomerChange(data, onResult) {
    const isEditMode = !!data.meter;
    const myCdb = String(data.customerId || '');
    const myEp = String(data.productId || '');
    // loadUsedPdus: diğer CDB kayıtlarında kullanılan outletler (düzenlemede kendi kaydı hariç)
    const usedPduMap = new Map();
    store.cdb.forEach(itm => {
      if (isEditMode && String(itm.cdb_id) === myCdb && String(itm.energy_product_id) === myEp) return;
      parseMeter(itm.meter).forEach(m => {
        if (!m.dev || !Array.isArray(m.meter)) return;
        if (!usedPduMap.has(m.dev)) usedPduMap.set(m.dev, new Set());
        m.meter.forEach(v => usedPduMap.get(m.dev).add(String(v)));
      });
    });

    const newGroup = () => ({ pduIp: null, outletNo: null, allSel: false, full: false, filterText: '', filterId: '' });
    let groups = [];
    if (isEditMode) {
      groups = parseMeter(data.meter).filter(m => m && m.dev).map(m => {
        const vals = (m.meter || []).filter(v => typeof v === 'number');
        const pos = vals.filter(v => v > 0).map(v => 'in_' + v);
        const neg = vals.filter(v => v < 0).map(v => String(v));
        return Object.assign(newGroup(), { pduIp: m.dev, outletNo: pos.concat(neg) });
      });
    }
    if (!groups.length) groups = [newGroup()];
    const outletMap = {};
    let loading = true;
    let loadError = null;

    function outletsFor(pduId) {
      const dev = CU.findPdu(pduId);
      if (!dev) return [];
      const usedSet = usedPduMap.get(pduId);
      return dev.io.map(io => String(io.mtr_pow))
        .filter(p => p.charAt(0) === '-' || parseInt(p, 10) > 0)
        .filter(p => parseInt(p, 10) > 0 || !usedSet || !usedSet.has(p))
        .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
    }
    const optVal = p => (p.charAt(0) === '-' ? p : 'in_' + p);
    const optLabel = v => (v.charAt(0) === '-' ? 'out_' + v.substring(1) : v);

    function onPduSelected(i, id, fromInit) {
      const g = groups[i];
      g.allSel = false;
      g.filterText = '';
      g.pduIp = id || '';
      if (!id) { g.outletNo = null; g.full = false; return; }
      const list = outletsFor(id);
      outletMap[id] = list;
      const usedSet = usedPduMap.get(id);
      g.full = !fromInit && list.length === 0 && !!usedSet && usedSet.size > 0;
      if (g.full) {
        outletMap[id] = [];
        toast('SEÇMEK İSTEDİĞİNİZ PDU DOLU', 'warning', 'UYARI');
        g.pduIp = ''; g.outletNo = null; g.full = false;
        return;
      }
      if (fromInit) return;
      if (!g.outletNo || !g.outletNo.length) {
        const first = list[0];
        g.outletNo = first && parseInt(first, 10) > 0 ? ['in_' + first] : [];
      } else {
        const valid = list;
        if (g.outletNo.some(so => valid.indexOf(so.indexOf('in_') === 0 ? so.replace('in_', '') : so) < 0)) g.outletNo = [];
      }
    }

    function availablePdus(i) {
      const g = groups[i];
      const ft = (g.filterText || '').toLocaleLowerCase('tr');
      const fi = (g.filterId || '').toLowerCase();
      const taken = groups.map((x, j) => (j !== i ? x.pduIp : null)).filter(v => v);
      return CU.pdus.filter(d => taken.indexOf(d.id) < 0 &&
        (ft === '' || (d.con_host || '').toLocaleLowerCase('tr').indexOf(ft) >= 0) &&
        (fi === '' || stripK(d.id).toLowerCase().indexOf(fi) >= 0));
    }

    function groupHtml(g, i) {
      const outs = g.pduIp ? outletMap[g.pduIp] || [] : [];
      const selDisabled = g.allSel || g.full;
      const selected = g.outletNo || [];
      return '<div class="pdu-group bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 p-5 rounded-[4px] shadow-sm transition-all hover:shadow-md hover:border-sky-400 dark:hover:border-sky-600 relative">' +
        '<div class="pdu-group-header flex justify-between items-center mb-5 pb-3 border-b border-slate-200 dark:border-slate-700">' +
          '<span class="group-label text-[12px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5"><i class="pi pi-server text-[11px]"></i> Eşleştirme #' + (i + 1) + '</span>' +
          (groups.length > 1 || i > 0
            ? '<button type="button" data-remove="' + i + '" class="btn-remove-pdu bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white rounded-[4px] px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1" title="Bu PDU satırını sil"><i class="pi pi-trash text-[10px]"></i> SİL</button>'
            : '') +
        '</div>' +
        '<div class="pdu-outlet-row flex flex-col gap-5">' +
          '<div class="flex flex-col gap-2 w-full">' +
            '<label class="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">PDU No Seçimi (PDU #' + (i + 1) + ')</label>' +
            '<div class="scada-select-wrapper relative">' +
              '<button type="button" class="cp-select" data-pdu-select="' + i + '">' +
                (g.pduIp
                  ? '<span class="cp-value font-mono text-sky-700 dark:text-sky-400 font-bold text-[14px]">' + esc(stripK(g.pduIp)) + '</span>'
                  : '<span class="cp-placeholder">Lütfen Bir PDU Seçiniz</span>') +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="flex flex-col gap-2 w-full">' +
            '<label class="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Inlet / Outlet Port Seçimi</label>' +
            '<div class="scada-select-wrapper relative">' +
              '<button type="button" class="cp-select" data-outlet-select="' + i + '"' + (selDisabled ? ' disabled' : '') + '>' +
                (selected.length
                  ? '<span class="cp-value font-mono">' + esc(selected.map(optLabel).join(', ')) + '</span>'
                  : '<span class="cp-placeholder">' + (g.full ? 'Seçili PDU Tamamen Dolu!' : 'Lütfen Port(ları) Seçiniz') + '</span>') +
              '</button>' +
            '</div>' +
            '<div class="mt-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[4px] p-2 flex items-center">' +
              '<label class="cp-checkbox text-sm font-bold' + (g.full ? ' is-disabled' : '') + '"><input type="checkbox" data-allsel="' + i + '"' + (g.allSel ? ' checked' : '') + (g.full ? ' disabled' : '') + ' />' +
                '<span class="text-[12px] font-bold text-slate-700 dark:text-slate-300">PDU\'daki Tüm Outletleri Kapla (Tümünü Kullan)</span></label>' +
            '</div>' +
            (g.pduIp && !outs.length ? '<span class="text-[10px] text-slate-400 italic">Bu PDU için port bilgisi bulunamadı.</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }

    const html =
      '<div class="customer-change-dialog bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-slate-200 select-none" style="height:100%">' +
        '<div class="industrial-header p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base cursor-move flex-shrink-0" data-drag-handle>' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center bg-sky-500/10 text-sky-500 border border-sky-500/20 text-xs"><i class="pi pi-file-edit font-bold"></i></span>' +
            '<div class="flex items-center gap-2">' +
              '<h3 class="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide uppercase">Enerji CDR Değerleme (Düzenle)</h3>' +
              (data.customerId ? '<span class="px-1.5 py-0.5 rounded-[2px] font-mono text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">#' + esc(data.customerId) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer" type="button" data-cancel title="Kapat"><i class="pi pi-times text-xs"></i></button>' +
          '</div>' +
        '</div>' +
        '<div data-overlay></div>' +
        '<form class="customer-form flex flex-col flex-1 min-h-0 overflow-hidden" data-form>' +
          '<div class="dialog-content p-4 max-h-[75vh] overflow-y-auto space-y-4 bg-white dark:bg-surface-card" data-content>' +
            '<div class="border border-slate-200 dark:border-slate-700/80 rounded-[4px] bg-slate-50/80 dark:bg-slate-800/50 p-4 mb-4">' +
              '<div class="flex items-center gap-2 pb-3 mb-4 border-b border-slate-200/80 dark:border-slate-700"><i class="pi pi-id-card text-sky-500 text-lg"></i><span class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">Genel Müşteri Bilgileri</span></div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
                '<div class="flex flex-col gap-1.5 w-full"><label class="' + LBL + '">Müşteri Id</label><input value="' + esc(data.customerId) + '" class="px-3 py-2 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm font-mono font-bold text-sky-700 dark:text-sky-400 w-full focus:outline-none cursor-not-allowed transition-colors" readonly /></div>' +
                '<div class="flex flex-col gap-1.5 w-full md:col-span-2"><label class="' + LBL + '">Müşteri Adı</label><textarea class="' + RO_AREA + '" readonly rows="2">' + esc(data.customerName) + '</textarea></div>' +
                '<div class="flex flex-col gap-1.5 w-full"><label class="' + LBL + '">Enerji Ürün ID</label><input value="' + esc(data.productId) + '" class="' + RO_MONO + '" readonly /></div>' +
                '<div class="flex flex-col gap-1.5 w-full md:col-span-2"><label class="' + LBL + '">Paket Adı</label><textarea class="' + RO_AREA + '" readonly rows="2">' + esc(data.productName) + '</textarea></div>' +
                '<div class="flex flex-col gap-1.5 w-full"><label class="' + LBL + '">Hizmet Numarası</label><input value="' + esc(data.accountId) + '" class="' + RO_MONO + '" readonly /></div>' +
                '<div class="flex flex-col gap-1.5 w-full"><label class="' + LBL + '">Servis ID</label><input value="' + esc(data.serviceNo) + '" class="' + RO_MONO + '" readonly /></div>' +
              '</div>' +
            '</div>' +
            '<div class="pdu-outlets-container space-y-4">' +
              '<div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/80 dark:border-slate-800"><div class="flex items-center gap-2"><i class="pi pi-bolt text-amber-500 text-lg"></i><span class="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-xs">PDU &amp; Outlet Eşleştirmeleri</span></div></div>' +
              '<div class="space-y-4" data-groups></div>' +
              '<div class="add-pdu-wrapper mt-3 flex justify-center">' +
                '<button type="button" data-add class="btn-add-pdu bg-transparent border border-dashed border-sky-500 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:border-solid rounded-[2px] px-4 py-2 text-xs font-semibold cursor-pointer w-full transition-all flex items-center justify-center gap-2"><i class="pi pi-plus"></i> Yeni PDU Eşleştir</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="dialog-actions p-3 px-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex items-center justify-end flex-shrink-0 gap-2">' +
            '<button class="px-4 py-2 rounded-[2px] bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer" type="button" data-cancel>İptal</button>' +
            '<button class="px-4 py-2 rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer" type="submit"><i class="pi pi-save text-xs"></i> Kaydet</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    const cancel = () => { toast('İşlem iptal edildi.', 'info', 'İPTAL EDİLDİ'); pane.close(); };
    const pane = openPane({ html, style: 'width:450px;height:80vh', onBackdrop: cancel, onEscape: cancel });
    const root = pane.pane;

    function renderOverlay() {
      const host = root.querySelector('[data-overlay]');
      if (!loading && !loadError) { host.innerHTML = ''; return; }
      host.innerHTML =
        '<div class="loading-overlay absolute inset-0 bg-white/95 dark:bg-surface-card/95 z-50 flex justify-center items-center p-5 mt-12">' +
          (loading && !loadError ? '<div class="spinner-container flex flex-col items-center gap-4"><div class="cp-spinner"></div><p class="text-slate-600 dark:text-slate-400 font-medium">Veriler yükleniyor...</p></div>' : '') +
          (loadError
            ? '<div class="error-card bg-white dark:bg-surface-card border border-rose-200 dark:border-rose-900/50 rounded-[4px] shadow-lg w-full max-w-[350px] p-6 flex flex-col items-center gap-4 text-center">' +
                '<i class="pi pi-exclamation-triangle text-3xl text-rose-500"></i><h3 class="error-title m-0 text-lg font-bold text-rose-600 dark:text-rose-500">Veri Uyarısı</h3>' +
                '<div class="error-content text-sm text-slate-700 dark:text-slate-300 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-[2px] border border-rose-200 dark:border-rose-900/50 w-full max-h-[150px] overflow-y-auto break-words">' + esc(loadError) + '</div>' +
                '<button class="btn-error-confirm bg-rose-600 hover:bg-rose-700 text-white border-none py-2 px-6 rounded-[2px] font-semibold cursor-pointer transition-colors w-full" type="button" data-err-ok>Tamam, Devam Et</button></div>'
            : '') +
        '</div>';
    }
    function renderGroups() {
      root.querySelector('[data-groups]').innerHTML = groups.map(groupHtml).join('');
    }

    // PDU seçim paneli (arama başlığı + seçenekler)
    function pduOptionsHtml(i) {
      const list = availablePdus(i);
      const cur = groups[i].pduIp;
      return '<div class="mat-mdc-option text-rose-500 font-semibold border-b border-slate-100 dark:border-slate-700" data-opt="">-- Seçimi Kaldır --</div>' +
        list.map(d =>
          '<div class="mat-mdc-option' + (cur === d.id ? ' mdc-list-item--selected' : '') + '" data-opt="' + esc(d.id) + '">' +
            '<div class="leading-tight py-1.5 font-mono"><span class="font-bold text-slate-800 dark:text-slate-200 text-[13px]">' + esc(stripK(d.id)) + '</span><br>' +
            '<span class="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">' + esc(d.con_host || '-') + '</span></div>' +
          '</div>').join('') +
        (list.length ? '' : '<div class="mat-mdc-option is-disabled"><span class="text-xs text-slate-400 italic">Eşleşen PDU bulunamadı...</span></div>');
    }
    function openPduPanel(i, anchor) {
      const g = groups[i];
      const el = openSelectPanel(anchor,
        '<div class="sticky-search-header sticky top-0 z-10 bg-white dark:bg-slate-800 p-3 border-b border-slate-200 dark:border-slate-700 shadow-sm">' +
          '<div class="flex gap-3">' +
            '<div class="flex flex-col gap-1.5 flex-1 min-w-[120px]"><label class="text-[10px] font-bold text-slate-500 uppercase">PDU Ara (IP)</label>' +
              '<div class="relative w-full"><input data-ft value="' + esc(g.filterText) + '" autocomplete="off" placeholder="IP Adresi..." class="px-2.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm font-mono w-full focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-200"></div></div>' +
            '<div class="flex flex-col gap-1.5 flex-1 min-w-[120px]"><label class="text-[10px] font-bold text-slate-500 uppercase">PDU Ara (İsim)</label>' +
              '<div class="relative w-full"><input data-fi value="' + esc(g.filterId) + '" autocomplete="off" placeholder="Cihaz İsmi..." class="px-2.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm w-full focus:outline-none focus:border-sky-500 text-slate-800 dark:text-slate-200"></div></div>' +
          '</div>' +
        '</div>' +
        '<div data-opts>' + pduOptionsHtml(i) + '</div>');
      // Seçim paneli dar olduğundan arama başlığı için genişlik tanı
      el._minWidth = 360;
      positionPanel(el, anchor);
      const refreshOpts = () => { el.querySelector('[data-opts]').innerHTML = pduOptionsHtml(i); };
      el.querySelector('[data-ft]').addEventListener('input', e => { g.filterText = e.target.value; refreshOpts(); });
      el.querySelector('[data-fi]').addEventListener('input', e => { g.filterId = e.target.value; refreshOpts(); });
      el.addEventListener('click', e => {
        const o = e.target.closest('[data-opt]');
        if (!o) return;
        onPduSelected(i, o.getAttribute('data-opt'), false);
        closeSelectPanel();
        renderGroups();
      });
      const sel = el.querySelector('.mdc-list-item--selected');
      if (sel) sel.scrollIntoView({ block: 'center' });
      el.querySelector('[data-fi]').focus();
    }
    function outletOptionsHtml(i) {
      const g = groups[i];
      const outs = outletMap[g.pduIp] || [];
      const sel = g.outletNo || [];
      return '<div class="mat-mdc-option font-bold text-emerald-600 dark:text-emerald-500 border-b border-slate-100 dark:border-slate-700' + (outs.length ? '' : ' is-disabled') + '" data-all><i class="pi pi-check-square text-xs mr-2"></i>Tüm Portları Seç</div>' +
        '<div class="mat-mdc-option text-rose-500 font-bold border-b border-slate-100 dark:border-slate-700" data-clear><i class="pi pi-minus-square text-xs mr-2"></i>Tüm Seçimleri Temizle</div>' +
        outs.map(p => {
          const v = optVal(p);
          const on = sel.indexOf(v) >= 0;
          return '<div class="mat-mdc-option' + (on ? ' mdc-list-item--selected' : '') + '" data-ov="' + esc(v) + '">' +
            '<span class="cp-pseudo-check' + (on ? ' is-checked' : '') + '">' + (on ? '<i class="pi pi-check"></i>' : '') + '</span>' +
            '<span class="font-mono font-bold text-[13px] text-slate-800 dark:text-slate-200">' + esc(optLabel(v)) + '</span></div>';
        }).join('');
    }
    function openOutletPanel(i, anchor) {
      const g = groups[i];
      const el = openSelectPanel(anchor, outletOptionsHtml(i), renderGroups);
      el.addEventListener('click', e => {
        const outs = outletMap[g.pduIp] || [];
        if (e.target.closest('[data-all]')) { if (outs.length) g.outletNo = outs.map(optVal); }
        else if (e.target.closest('[data-clear]')) g.outletNo = [];
        else {
          const o = e.target.closest('[data-ov]');
          if (!o) return;
          const v = o.getAttribute('data-ov');
          const cur = (g.outletNo || []).slice();
          const k = cur.indexOf(v);
          if (k >= 0) cur.splice(k, 1); else cur.push(v);
          // mat-select çoklu seçimde seçenek sırasını korur
          const order = outs.map(optVal);
          g.outletNo = cur.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        }
        const top = el.scrollTop;
        el.innerHTML = outletOptionsHtml(i);
        el.scrollTop = top;
        const trig = anchor.querySelector('span');
        if (trig) {
          trig.className = g.outletNo && g.outletNo.length ? 'cp-value font-mono' : 'cp-placeholder';
          trig.textContent = g.outletNo && g.outletNo.length ? g.outletNo.map(optLabel).join(', ') : 'Lütfen Port(ları) Seçiniz';
        }
      });
    }

    function isOutletsValid() {
      return !groups.filter(g => !!g.pduIp).some(g => !g.outletNo || !g.outletNo.length);
    }
    function submit() {
      if (groups.every(g => !g.pduIp)) { toast('Hiçbir PDU IP seçilmedi.', 'warning', 'UYARI'); return; }
      if (!isOutletsValid()) { toast('Lütfen seçili PDU için outlet seçimi yapınız!', 'warning', 'UYARI'); return; }
      const formValid = ['customerId', 'customerName', 'serviceNo', 'productId', 'productName'].every(k => data[k] != null && String(data[k]) !== '');
      if (!formValid) return;
      const result = {
        customerId: data.customerId,
        customerName: data.customerName,
        accountId: data.accountId,
        serviceNo: data.serviceNo,
        productId: data.productId,
        productName: data.productName,
        pduOutlets: groups.filter(g => !!g.pduIp).map(g => {
          const dev = CU.findPdu(g.pduIp);
          return { pduIp: g.pduIp, outletNo: g.outletNo.map(v => (v.indexOf('in_') === 0 ? v.replace('in_', '') : v)), con_host: dev ? dev.con_host : null, doc: dev ? dev.doc : null };
        })
      };
      pane.close();
      onResult(result);
    }

    root.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('[data-cancel]')) { cancel(); return; }
      if (t.closest('[data-err-ok]')) { loadError = null; renderOverlay(); return; }
      if (t.closest('[data-add]')) { groups.push(newGroup()); renderGroups(); const c = root.querySelector('[data-content]'); c.scrollTop = c.scrollHeight; return; }
      const rm = t.closest('[data-remove]');
      if (rm) {
        groups.splice(parseInt(rm.getAttribute('data-remove'), 10), 1);
        if (!groups.length) groups.push(newGroup());
        renderGroups();
        return;
      }
      const ps = t.closest('[data-pdu-select]');
      if (ps) { if (selectPanel && selectPanel.anchor === ps) closeSelectPanel(); else openPduPanel(parseInt(ps.getAttribute('data-pdu-select'), 10), ps); return; }
      const os = t.closest('[data-outlet-select]');
      if (os && !os.disabled) { if (selectPanel && selectPanel.anchor === os) closeSelectPanel(); else openOutletPanel(parseInt(os.getAttribute('data-outlet-select'), 10), os); }
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (!t.hasAttribute('data-allsel')) return;
      const i = parseInt(t.getAttribute('data-allsel'), 10);
      const g = groups[i];
      g.allSel = t.checked;
      const outs = outletMap[g.pduIp] || [];
      if (t.checked && g.pduIp) g.outletNo = outs.length ? outs.map(optVal) : ['in_1'];
      else if (!t.checked) g.outletNo = [];
      renderGroups();
    });
    root.querySelector('[data-form]').addEventListener('submit', e => { e.preventDefault(); submit(); });
    root.querySelector('[data-content]').addEventListener('scroll', repositionSelectPanel);

    renderGroups();
    renderOverlay();
    // loadDevices + loadUsedPdus → loadOutletsForExistingPdus
    setTimeout(() => {
      const notFound = [];
      groups.forEach((g, i) => {
        if (!g.pduIp) return;
        if (CU.findPdu(g.pduIp)) onPduSelected(i, g.pduIp, true);
        else { notFound.push(g.pduIp); g.pduIp = null; g.outletNo = []; }
      });
      if (notFound.length) loadError = 'PDU IP\'ler bulunurken hata oluştu: ' + notFound.join(', ') + '. Lütfen kontrol ediniz.';
      loading = false;
      renderGroups();
      renderOverlay();
    }, 650);
  }

  // ---------------------------------------------------------------------------
  // CustomerPagesDetailsComponent — "MÜŞTERİ DETAYLARI"
  // ---------------------------------------------------------------------------
  function openCustomerDetails(row) {
    const values = parseMeter(row.meter);
    const devArr = values.map(v => stripK(v.dev));
    const outlet = values.map(v => v.meter || []);
    const ipArr = conHost(row).split(',').map(s => s.trim());
    const pduList = devArr.map((id, i) => ({ id, ip: ipArr[i] || '' }));
    let selected = null;
    const getOutletLabel = o => (String(o).charAt(0) === '-' ? 'out' + String(o).substring(1) : 'in' + o);
    const box = (label, value, cls, extra) =>
      '<div class="p-2 bg-white dark:bg-surface-card border border-slate-200/70 dark:border-slate-800 rounded-[2px]' + (extra || '') + '"><span class="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5">' + label + '</span>' + '<span class="' + cls + '"' + '>' + value + '</span></div>';

    function pduSection() {
      if (!devArr.length) return '<div class="text-slate-400 italic text-[11px] py-1">PDU/Outlet eşleştirmesi bulunamadı.</div>';
      return '<div class="space-y-2">' +
        '<label class="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold">PDU Seçiniz:</label>' +
        '<select data-pdu-sel class="w-full px-2.5 py-1.5 bg-white dark:bg-surface-card border border-slate-300 dark:border-slate-700 rounded-[2px] text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer">' +
          '<option value=""' + (selected === null ? ' selected' : '') + '>PDU ID seçiniz</option>' +
          devArr.map((p, i) => '<option value="' + i + '"' + (selected === i ? ' selected' : '') + '>' + esc(p) + '</option>').join('') +
        '</select>' +
        (selected !== null && outlet[selected] && outlet[selected].length
          ? '<div class="pt-1"><span class="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-1">Seçili PDU Outletleri:</span><div class="flex flex-wrap gap-1.5">' +
              outlet[selected].map(o => '<span class="inline-flex items-center px-2 py-1 rounded-[2px] text-[11px] font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-medium"><i class="pi pi-power-off text-[9px] mr-1 opacity-70"></i>' + esc(getOutletLabel(o)) + '</span>').join('') +
            '</div></div>'
          : '') +
      '</div>';
    }
    function pduRows() {
      if (!pduList.length) return '<tr><td colspan="2" class="p-3 text-center text-slate-400 italic font-sans text-xs">PDU kaydı bulunamadı.</td></tr>';
      return pduList.map((p, i) =>
        '<tr data-pdu-row="' + i + '" class="hover:bg-sky-500/10 dark:hover:bg-sky-500/20 cursor-pointer transition-colors' + (selected === i ? ' bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 font-semibold' : '') + '">' +
          '<td class="p-2 px-3 border-r border-slate-200 dark:border-slate-800/60">' + esc(p.id) + '</td><td class="p-2 px-3">' + esc(p.ip || '-') + '</td></tr>').join('');
    }

    const html =
      '<div class="workorder-popup bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-slate-200 select-none">' +
        '<div class="industrial-header p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base cursor-move flex-shrink-0" data-drag-handle>' +
          '<div class="flex items-center gap-2.5">' +
            '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center bg-sky-500/10 text-sky-500 border border-sky-500/20 text-xs"><i class="pi pi-user font-bold"></i></span>' +
            '<div class="flex items-center gap-2"><h3 class="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide uppercase">MÜŞTERİ DETAYLARI</h3>' +
              (row.cdb_id ? '<span class="px-1.5 py-0.5 rounded-[2px] font-mono text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">#' + esc(row.cdb_id) + '</span>' : '') + '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1"><button type="button" data-close class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="Kapat"><i class="pi pi-times text-xs"></i></button></div>' +
        '</div>' +
        '<div class="dialog-content p-4 max-h-[75vh] overflow-y-auto space-y-4 bg-white dark:bg-surface-card">' +
          '<div class="border border-slate-200 dark:border-slate-800/80 rounded-[2px] bg-slate-50/50 dark:bg-surface-base/50 p-3">' +
            '<div class="flex items-center gap-1.5 pb-2 mb-3 border-b border-slate-200/80 dark:border-slate-800"><i class="pi pi-id-card text-sky-500"></i><span class="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">Genel Bilgiler</span></div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">' +
              box('Müşteri ID', esc(row.cdb_id || '-'), 'font-mono text-xs font-semibold text-sky-600 dark:text-sky-400') +
              box('Hizmet Numarası (ERP)', esc(row.erp_id || '-'), 'font-mono text-xs text-slate-800 dark:text-slate-200') +
              '<div class="p-2 bg-white dark:bg-surface-card border border-slate-200/70 dark:border-slate-800 rounded-[2px] col-span-1 sm:col-span-2"><span class="block text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5">Müşteri Adı</span><span class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block" title="' + esc(row.customer_name) + '">' + esc(row.customer_name || '-') + '</span></div>' +
              box('Enerji Ürün ID', esc(row.energy_product_id || '-'), 'font-mono text-xs text-slate-800 dark:text-slate-200') +
              box('Paket Adı', esc(row.svc_desc || '-'), 'text-xs text-slate-800 dark:text-slate-200') +
              box('Servis ID', esc(row.svc_id || '-'), 'font-mono text-xs text-slate-800 dark:text-slate-200') +
              box('Başlangıç / Bitiş', esc(row.tim_bgn || '-') + '<br>' + esc(row.tim_end || '-'), 'text-[11px] font-mono text-slate-700 dark:text-slate-300 block leading-tight') +
            '</div>' +
          '</div>' +
          '<div class="border border-slate-200 dark:border-slate-800/80 rounded-[2px] bg-slate-50/50 dark:bg-surface-base/50 p-3">' +
            '<div class="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200/80 dark:border-slate-800"><div class="flex items-center gap-1.5"><i class="pi pi-bolt text-amber-500"></i><span class="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">Outlet No &amp; PDU Eşleştirme</span></div></div>' +
            '<div data-pdu-section>' + pduSection() + '</div>' +
          '</div>' +
          '<div class="border border-slate-200 dark:border-slate-800/80 rounded-[2px] overflow-hidden">' +
            '<div class="p-2 px-3 bg-slate-100 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"><div class="flex items-center gap-1.5"><i class="pi pi-server text-sky-500"></i><span class="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">PDU Listesi</span></div>' +
              '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">Toplam: ' + pduList.length + '</span></div>' +
            '<div class="overflow-x-auto max-h-[160px] overflow-y-auto"><table class="w-full text-left text-xs border-collapse">' +
              '<thead class="bg-slate-50 dark:bg-surface-base sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold"><tr><th class="p-2 px-3 border-r border-slate-200 dark:border-slate-800">PDU ID</th><th class="p-2 px-3">PDU IP</th></tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono" data-pdu-rows>' + pduRows() + '</tbody></table></div>' +
          '</div>' +
        '</div>' +
        '<div class="dialog-actions p-3 px-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex items-center justify-between flex-shrink-0">' +
          '<div></div>' +
          '<div class="flex items-center gap-2">' +
            '<button type="button" data-pdf class="px-3 py-1.5 rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"><i class="pi pi-file-pdf text-xs"></i><span>PDF İNDİR</span></button>' +
            '<button type="button" data-close class="px-3 py-1.5 rounded-[2px] bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs transition-colors cursor-pointer">Kapat</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    const p = openPane({ html, style: 'width:810px' });
    const root = p.pane;
    const refresh = () => {
      root.querySelector('[data-pdu-section]').innerHTML = pduSection();
      root.querySelector('[data-pdu-rows]').innerHTML = pduRows();
    };
    root.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { p.close(); return; }
      if (e.target.closest('[data-pdf]')) {
        toast('musteri_detay_' + (row.cdb_id || 'detay') + '.pdf oluşturuldu.', 'success', 'PDF');
        return;
      }
      const tr = e.target.closest('[data-pdu-row]');
      if (tr) { selected = parseInt(tr.getAttribute('data-pdu-row'), 10); refresh(); }
    });
    root.addEventListener('change', e => {
      if (!e.target.hasAttribute('data-pdu-sel')) return;
      selected = e.target.value === '' ? null : parseInt(e.target.value, 10);
      refresh();
    });
  }

  // TableDialogComponent — başlık + innerHTML içerik
  function openTablePopup(title, content, width) {
    const html =
      '<div class="flex flex-col h-full bg-white dark:bg-slate-900 rounded-md overflow-hidden shadow-2xl">' +
        '<div data-drag-handle class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/90 shrink-0 cursor-move">' +
          '<h2 class="text-[15px] font-bold text-slate-800 dark:text-slate-100 m-0 flex items-center gap-2 select-none"><i class="pi pi-list text-sky-500 dark:text-sky-400 text-sm"></i>' + esc(title) + '</h2>' +
          '<button type="button" data-close class="w-7 h-7 flex items-center justify-center rounded-[4px] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors cursor-pointer border-0 bg-transparent outline-none"><i class="pi pi-times text-xs"></i></button>' +
        '</div>' +
        '<div class="p-0 m-0 flex-1 overflow-y-auto custom-scrollbar" style="max-height: 60vh;"><div class="p-4 scada-table-popup-content h-full">' + content + '</div></div>' +
        '<div class="flex items-center justify-end p-3 border-t border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/90 shrink-0">' +
          '<button type="button" data-close class="px-5 py-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-[4px] text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors cursor-pointer outline-none shadow-sm">Kapat</button>' +
        '</div>' +
      '</div>';
    const p = openPane({ html, style: width ? 'width:' + width : 'min-width:420px' });
    p.pane.addEventListener('click', e => { if (e.target.closest('[data-close]')) p.close(); });
  }

  // CustomerMatchingReportPopupComponent — "Eşleşmiş Müşteri Raporu"
  function openReportPopup() {
    const rs = { data: [], loading: false, searched: false, pdf: false, excel: false };
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 sm:p-6 animate-fade-in';
    document.body.appendChild(host);
    const close = () => { host.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const TH = 'px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]';

    function render() {
      host.innerHTML =
        '<div data-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-[95vw] sm:max-w-7xl flex flex-col max-h-[90vh] transform transition-all">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 rounded-t-lg shrink-0 cursor-move">' +
            '<div class="flex items-center gap-3"><div class="w-10 h-10 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500"><i class="pi pi-chart-bar text-lg"></i></div>' +
              '<div><h2 class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">Eşleşmiş Müşteri Raporu</h2><p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Raporu oluşturmak için tüm eşleşmiş müşteri verisi çekilecektir.</p></div></div>' +
            '<button type="button" data-close class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer outline-none"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="p-5 bg-white dark:bg-surface-card border-b border-slate-200 dark:border-slate-800 shrink-0"><div class="flex flex-col sm:flex-row gap-4 items-end"><div class="w-full sm:w-auto flex-[0.5]">' +
            '<button type="button" data-fetch' + (rs.loading ? ' disabled' : '') + ' class="w-full sm:w-auto px-6 h-[38px] bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors shadow-sm flex justify-center items-center gap-2 uppercase tracking-wide cursor-pointer">' +
              (rs.loading ? '<i class="pi pi-spinner pi-spin"></i> Veri Çekiliyor...' : '<i class="pi pi-search"></i> Tüm Veriyi Getir') + '</button>' +
          '</div></div></div>' +
          (rs.data.length
            ? '<div class="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
                '<div class="flex gap-2">' +
                  '<button type="button" data-pdf' + (rs.pdf || rs.excel ? ' disabled' : '') + ' class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer">' +
                    '<i class="pi ' + (rs.pdf ? 'pi-spinner pi-spin' : 'pi-file-pdf') + '"></i> ' + (rs.pdf ? 'PDF Oluşturuluyor...' : 'PDF İndir') + '</button>' +
                  '<button type="button" data-excel' + (rs.pdf || rs.excel ? ' disabled' : '') + ' class="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer">' +
                    '<i class="pi ' + (rs.excel ? 'pi-spinner pi-spin' : 'pi-file-excel') + '"></i> ' + (rs.excel ? 'Excel Oluşturuluyor...' : 'Excel İndir') + '</button>' +
                '</div>' +
                '<div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">Toplam ' + rs.data.length + ' kayıt bulundu.</div>' +
              '</div>'
            : '') +
          '<div class="flex-1 overflow-auto bg-white dark:bg-[#0f172a] relative min-h-[300px] cp-report-table">' +
            (rs.loading ? '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10"><div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin mb-4"></div><span class="text-sm font-medium text-slate-600 dark:text-slate-300">Veriler yükleniyor...</span></div>' : '') +
            (!rs.loading && !rs.data.length && rs.searched ? '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">Eşleşmiş PDU verisi bulunamadı.</p></div>' : '') +
            (!rs.loading && !rs.searched ? '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-search text-2xl text-slate-400 dark:text-slate-500"></i></div><p class="text-sm font-medium">Lütfen veri çekmek için butona tıklayın.</p></div>' : '') +
            (!rs.loading && rs.data.length
              ? '<table class="w-full text-left border-collapse text-xs whitespace-nowrap"><thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' +
                  ['Müşteri ID', 'Hizmet Numarası', 'Müşteri Adı', 'Enerji Ürün ID', 'Paket Adı', 'Servis ID', 'PDU - Outlet Eşleştirmeleri', 'PDU IP Adresleri'].map(h => '<th class="' + TH + '">' + h + '</th>').join('') +
                '</tr></thead><tbody>' +
                rs.data.map(c =>
                  '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors group">' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">' + esc(c.cdb_id || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(c.erp_id || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(c.customer_name || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(c.energy_product_id || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title="' + esc(c.svc_desc) + '">' + esc(c.svc_desc || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(c.svc_id || 'N/A') + '</td>' +
                    '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + pduOutletPairsHtml(c) + '</td>' +
                    '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + (ipList(c).map(ip => '<div>' + esc(ip) + '</div>').join('') || 'N/A') + '</td>' +
                  '</tr>').join('') +
                '</tbody></table>'
              : '') +
          '</div>' +
        '</div>';
    }
    host.addEventListener('mousedown', e => { host._down = e.target === host; });
    host.addEventListener('click', e => {
      if (e.target === host && host._down) { close(); return; }
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-fetch]')) {
        rs.loading = true; rs.searched = true; rs.data = []; render();
        setTimeout(() => { rs.data = store.cdb.filter(c => parseMeter(c.meter).length > 0); rs.loading = false; render(); }, 900);
        return;
      }
      if (e.target.closest('[data-pdf]')) {
        rs.pdf = true; render();
        setTimeout(() => { rs.pdf = false; render(); toast('PDF raporu oluşturuldu! (' + rs.data.length + ') — Musteri_PDU_Eslesme_Raporu.pdf', 'success', 'PDF'); }, 700);
        return;
      }
      if (e.target.closest('[data-excel]')) {
        rs.excel = true; render();
        setTimeout(() => {
          rs.excel = false; render();
          kit.exportExcel('Musteri_PDU_Eslesme_Raporu', [
            { header: 'Müşteri ID', value: r => r.cdb_id || 'N/A' },
            { header: 'Hizmet Numarası', value: r => r.erp_id || 'N/A' },
            { header: 'Müşteri Adı', value: r => r.customer_name || 'N/A' },
            { header: 'Enerji Ürün ID', value: r => r.energy_product_id || 'N/A' },
            { header: 'Paket Adı', value: r => r.svc_desc || 'N/A' },
            { header: 'Servis ID', value: r => r.svc_id || 'N/A' },
            { header: 'PDU - Outlet Eşleştirmeleri', value: r => pduOutletPairsText(r) },
            { header: 'PDU IP Adresleri', value: r => conHost(r) }
          ], rs.data);
        }, 700);
      }
    });
    render();
  }

  // ---------------------------------------------------------------------------
  // Sayfa: sekme 1 — Müşteri Eşleştirme (WOR iş emirleri)
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const TAB_ALIASES = { matched: 'matched', pdu: 'matched', 'matching-pdu': 'matched', matching: 'matching', pending: 'matching' };
  let tab = TAB_ALIASES[(params.get('tab') || '').toLowerCase()] || 'matching';
  let table = null;
  const rootEl = document.getElementById('cp-root');

  const TAB_ACTIVE = 'px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer bg-sky-600 text-white font-bold shadow-xs';
  const TAB_IDLE = 'px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer bg-white dark:bg-surface-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-border-subtle font-medium';
  const tabsBar = () =>
    '<div class="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-border-subtle p-2 bg-slate-50/50 dark:bg-surface-base">' +
      '<div class="flex items-center gap-2">' +
        '<button type="button" data-tab="matching" class="' + (tab === 'matching' ? TAB_ACTIVE : TAB_IDLE) + '"><i class="pi pi-users text-xs"></i><span>Müşteri Eşleştirme</span></button>' +
        '<button type="button" data-tab="matched" class="' + (tab === 'matched' ? TAB_ACTIVE : TAB_IDLE) + '"><i class="pi pi-server text-xs"></i><span>Eşleşen Müşteriler (PDU)</span></button>' +
      '</div>' +
    '</div>';

  const T1_COLUMNS = [
    { field: 'erp_id', header: 'Hizmet Numarası' },
    { field: 'customer_name', header: 'Müşteri Adı' },
    { field: 'cdb_id', header: 'Müşteri ID' },
    { field: 'energy_product_id', header: 'Enerji Ürün ID' },
    { field: 'svc_desc', header: 'Paket Adı' },
    { field: 'svc_id', header: 'Servis ID' },
    { field: 'tim_bgn', header: 'Başlangıç', filterable: false },
    { field: 'tim_end', header: 'Bitiş', filterable: false },
    { field: 'is_matched', header: 'Eşleştir', filterable: false }
  ];
  const SEARCH_T1 = r => [r.erp_id, r.customer_name, r.cdb_id, r.energy_product_id, r.svc_desc, r.svc_id, r.tim_bgn, r.tim_end].join(' ');
  const MATCHED_BADGE = '<span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap bg-emerald-500/20 text-emerald-400">Eşleştirildi</span>';
  // 'gg.aa.yyyy SS:dd:ss' → sıralanabilir 'yyyyaaggSSddss'
  const dateKey = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(s || ''); return m ? m[3] + m[2] + m[1] + m[4] + m[5] + m[6] : String(s || ''); };
  const sortT1 = (r, f) => (f === 'tim_bgn' || f === 'tim_end' ? dateKey(r[f]) : r[f]);

  let filterSwitch = 0;
  let showMatchedPopup = false;
  let pending = [];

  function mountMatching() {
    rootEl.className = 'h-full flex flex-col min-h-0';
    rootEl.innerHTML =
      kit.pageHeader({ title: 'MÜŞTERİ EŞLEŞTİRME SAYFASI', breadcrumbs: [{ label: 'İş Emirleri' }, { label: 'MÜŞTERİ EŞLEŞTİRME SAYFASI' }], actions: '<div class="flex items-center gap-3"></div>' }) +
      tabsBar() +
      '<div class="flex-1 min-h-0"><div class="dt-host" data-table></div></div>';
    filterSwitch = 0;
    pending = pendingRows();
    const actionBtn = on => on ? 'bg-sky-600 text-white font-bold border-sky-600 hover:bg-sky-700' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
    table = DataTable(rootEl.querySelector('[data-table]'), {
      columns: T1_COLUMNS,
      rows: () => pending,
      search: params.get('q') || '',
      searchText: SEARCH_T1,
      sortValue: sortT1,
      cell: (c, r) => c.field === 'is_matched'
        ? '<div class="flex items-center gap-2">' + (r.is_matched ? MATCHED_BADGE : button({ variant: 'secondary', size: 'sm', label: 'Eşleştir', attrs: 'data-match="' + esc(r.id) + '" title="Müşteri Eşleştirmek için tıklayınız"' })) + '</div>'
        : null,
      actions: () =>
        '<div class="flex items-center gap-1.5">' +
          (filterSwitch === 1 ? '<button type="button" data-act="matched" class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] transition-all flex items-center gap-1 cursor-pointer ' + actionBtn(showMatchedPopup) + '"><i class="pi pi-check-circle text-xs"></i><span>Eşleşme Yapılanlar</span></button>' : '') +
          '<button type="button" data-act="edit" class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] transition-all flex items-center gap-1 cursor-pointer ' + actionBtn(filterSwitch === 2) + '"><i class="pi pi-pencil text-xs"></i><span>' + (filterSwitch === 2 ? 'İptal' : 'Düzenle') + '</span></button>' +
          (filterSwitch === 2 ? '<button type="button" data-act="delete" class="px-2.5 py-1 text-xs font-semibold border border-rose-500 bg-rose-500 text-white rounded-[2px] transition-all flex items-center gap-1 cursor-pointer hover:bg-rose-600"><i class="pi pi-trash text-xs"></i><span>Sil</span></button>' : '') +
        '</div>',
      onShowFilters: show => { filterSwitch = show ? 1 : 0; table.renderActions(); },
      onRefresh: () => { pending = pendingRows(); table.reload(); },
      onClick: e => {
        const m = e.target.closest('[data-match]');
        if (m) { e.stopPropagation(); processRow(pending.find(r => r.id === m.getAttribute('data-match'))); return true; }
        const a = e.target.closest('[data-act]');
        if (!a) return false;
        const act = a.getAttribute('data-act');
        if (act === 'matched') openMatchedPopup();
        else if (act === 'edit') { filterSwitch = filterSwitch === 2 ? 0 : 2; table.renderActions(); }
        else if (act === 'delete') deleteSelected();
        return true;
      }
    });
  }

  function processRow(row) {
    if (!row) return;
    const acc = row.erp_id === '0' || row.erp_id === 'NULL' || !row.erp_id ? '' : row.erp_id;
    openCustomerChange({
      customerId: row.cdb_id, customerName: row.customer_name, accountId: acc, serviceNo: row.svc_id,
      productId: row.energy_product_id, productName: row.svc_desc, timeBegin: row.tim_bgn, timeEnd: row.tim_end,
      pduIp: row.pdu_ip, outletNo: row.outlet_no, meter: row.meter
    }, result => {
      if (!result.customerId || !result.productId) return;
      const hexId = Number(result.customerId).toString(16).toUpperCase().padStart(8, '0');
      // doc('CDB/S00')/id('CDB_List')/@new
      store.cdb.unshift({
        rid: 'CD00000000' + hexId + '_' + result.productId,
        cdb_id: result.customerId,
        erp_id: row.erp_id,
        customer_name: result.customerName,
        energy_product_id: result.productId,
        svc_desc: result.productName || row.svc_desc,
        svc_id: result.serviceNo,
        tim_bgn: row.tim_end || row.tim_bgn || '',
        tim_end: '',
        meter: JSON.stringify(result.pduOutlets.filter(o => o.pduIp && o.outletNo && o.outletNo.length).map(o => ({ doc: o.doc, dev: o.pduIp, meter: o.outletNo.map(Number) })))
      });
      row.is_matched = true;
      store.matched.push(row);
      pending = pending.filter(i => i.id !== row.id);
      table.state.selected.delete(row.id);
      table.refresh();
      toast('Eşleştirme işlemi başarıyla gerçekleştirildi!', 'success', 'Başarılı');
    });
  }

  function deleteSelected() {
    const sel = table.selectedRows()[0];
    if (!sel) { toast('Lütfen silmek için bir satır seçin!', 'warning', 'UYARI'); return; }
    dialog({
      title: 'Kaydı Sil',
      subtitle: sel.customer_name + ' — ' + sel.energy_product_id,
      variant: 'danger',
      confirmLabel: 'Sil',
      confirmIcon: 'pi pi-trash',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300">Seçili kaydı silmek istediğinize emin misiniz?</p>',
      onConfirm: () => {
        // WOR/S00/WOR_List/opr/set {"cmd":-1}
        store.wor = store.wor.filter(w => w.id !== sel.id);
        pending = pending.filter(w => w.id !== sel.id);
        table.refresh();
        toast(sel.customer_name + ' iş emri kaydı silindi.', 'success', 'Silindi');
        setTimeout(() => { filterSwitch = 0; table.state.selected.clear(); pending = pendingRows(); table.refresh(); }, 1000);
      }
    });
  }

  function openMatchedPopup() {
    showMatchedPopup = true;
    table.renderActions();
    let inner = null;
    const d = dialog({
      title: 'Eşleşme Yapılanlar',
      variant: 'info',
      showCancel: false,
      maxWidth: 'max-w-5xl',
      body: '<div class="dt-host" data-matched-table></div>',
      onClose: () => {
        if (inner) inner.destroy();
        showMatchedPopup = false;
        if (table) table.renderActions();
      }
    });
    // Aynı kolonlar, yalnızca eşleşmiş kayıtlar (istemci tarafı tablo)
    inner = DataTable(d.body.querySelector('[data-matched-table]'), {
      columns: T1_COLUMNS,
      rows: () => store.matched,
      searchText: SEARCH_T1,
      sortValue: sortT1,
      cell: c => (c.field === 'is_matched' ? MATCHED_BADGE : null)
    });
  }

  // ---------------------------------------------------------------------------
  // Sayfa: sekme 2 — Eşleşen Müşteriler (PDU) (CDB_List, meter dolu)
  // ---------------------------------------------------------------------------
  const T2_COLUMNS = [
    { field: 'cdb_id', header: 'Müşteri ID', width: '85px' },
    { field: 'erp_id', header: 'Hizmet No', width: '85px' },
    { field: 'customer_name', header: 'Müşteri Adı', width: '135px' },
    { field: 'energy_product_id', header: 'Enerji Ürün ID', width: '95px' },
    { field: 'svc_desc', header: 'Paket Adı', width: '130px' },
    { field: 'svc_id', header: 'Servis ID', width: '85px' },
    { field: 'pdu_outlet', header: 'PDU - Outlet Eşleştirmeleri', width: '170px' },
    { field: 'pdu_ip', header: 'PDU IP Adresleri', width: '140px' },
    { field: 'actions', header: 'Düzenle', width: '55px' }
  ];
  const matchedRows = () => store.cdb.filter(c => c.meter && c.meter !== 'null' && c.meter !== 'undefined');

  function mountMatched() {
    rootEl.className = 'h-full flex flex-col min-h-0 overflow-hidden';
    rootEl.innerHTML =
      kit.pageHeader({
        title: 'EŞLEŞTİRİLMİŞ MÜŞTERİ LİSTESİ',
        breadcrumbs: [{ label: 'İş Emirleri' }, { label: 'MÜŞTERİ EŞLEŞTİRME SAYFASI', href: 'customer-pages.html?tab=matching' }, { label: 'EŞLEŞTİRİLMİŞ MÜŞTERİ LİSTESİ' }],
        actions: '<div class="flex items-center gap-3">' + button({ variant: 'secondary', icon: 'pi pi-file-pdf', label: 'Rapor', attrs: 'data-report' }) + '</div>'
      }) +
      tabsBar() +
      '<div class="flex-1 min-h-0 overflow-hidden relative flex flex-col"><div class="dt-host" data-table></div></div>';
    rootEl.querySelector('[data-report]').addEventListener('click', openReportPopup);
    table = DataTable(rootEl.querySelector('[data-table]'), {
      columns: T2_COLUMNS,
      rows: matchedRows,
      search: params.get('q') || '',
      searchText: r => [r.customer_name, r.cdb_id, r.erp_id, r.svc_id, r.svc_desc, r.meter, pduOutletPairsText(r), conHost(r)].join(' '),
      filterText: (r, f) => (f === 'pdu_outlet' ? r.meter + ' ' + pduOutletPairsText(r) : f === 'pdu_ip' ? conHost(r) : r[f]),
      sortValue: (r, f) => (f === 'pdu_outlet' ? pduOutletPairsText(r) : f === 'pdu_ip' ? conHost(r) : r[f]),
      emptyText: 'Veri bulunamadı',
      cell: (c, r) => {
        if (c.field === 'cdb_id') {
          return '<button type="button" data-cid="' + esc(r.rid) + '" class="font-mono text-xs text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 font-bold hover:underline cursor-pointer">' + esc(r.cdb_id || 'N/A') + '</button>';
        }
        if (c.field === 'pdu_outlet') {
          const list = pduOutletList(r);
          return '<div class="pdu-chip-container" data-pdu-pop="' + esc(r.rid) + '">' +
            (list.length
              ? list.map(i => '<div class="pdu-item-chip"><span class="pdu-dev-tag">' + esc(i.device) + '</span><span class="pdu-outlet-val">' + esc(i.outlets) + '</span></div>').join('')
              : '<span class="text-slate-400 dark:text-slate-500 italic text-[11px]">N/A</span>') + '</div>';
        }
        if (c.field === 'pdu_ip') {
          const ips = ipList(r);
          return '<div class="ip-chip-container" data-ip-pop="' + esc(r.rid) + '">' +
            (ips.length
              ? ips.map(ip => '<span class="ip-badge"><i class="pi pi-server"></i><span>' + esc(ip) + '</span></span>').join('')
              : '<span class="text-slate-400 dark:text-slate-500 italic text-[11px]">N/A</span>') + '</div>';
        }
        if (c.field === 'actions') {
          return '<div class="flex items-center gap-2"><button type="button" data-edit="' + esc(r.rid) + '" title="Durumu değiştirmek için tıklayın" class="p-1 rounded.md text-sky-500 dark:text-sky-400 hover:text-sky-600 dark:hover:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors cursor-pointer"><i class="pi pi-pencil text-xs"></i></button></div>';
        }
        return null;
      },
      onRefresh: () => table.reload(),
      onClick: e => {
        const find = attr => { const el = e.target.closest('[' + attr + ']'); return el ? store.cdb.find(c => c.rid === el.getAttribute(attr)) : null; };
        let row = find('data-cid');
        if (row) { e.stopPropagation(); openCustomerDetails(row); return true; }
        row = find('data-pdu-pop');
        if (row) { e.stopPropagation(); openTablePopup('PDU - Outlet Eşleştirmeleri', pduOutletPairsHtml(row)); return true; }
        row = find('data-ip-pop');
        if (row) {
          e.stopPropagation();
          const ips = ipList(row);
          openTablePopup('PDU IP Adresleri', ips.length ? '<div class="ip-list">' + ips.map(ip => '<div class="ip-item">' + esc(ip) + '</div>').join('') + '</div>' : esc(conHost(row)), '500px');
          return true;
        }
        row = find('data-edit');
        if (row) { e.stopPropagation(); editMatched(row); return true; }
        return false;
      }
    });
  }

  function editMatched(row) {
    openCustomerChange({
      customerId: row.cdb_id, customerName: row.customer_name, accountId: row.erp_id, serviceNo: row.svc_id,
      productId: row.energy_product_id, productName: row.svc_desc, timeBegin: row.tim_bgn, timeEnd: row.tim_end,
      pduIp: row.pdu_ip, outletNo: row.outlet_no, meter: row.meter
    }, result => {
      if (!result.customerId || !result.productId) return;
      row.erp_id = result.accountId && result.accountId !== '0' ? result.accountId : row.erp_id;
      row.customer_name = result.customerName;
      row.svc_desc = result.productName || row.svc_desc;
      row.svc_id = result.serviceNo && result.serviceNo !== '0' ? result.serviceNo : row.svc_id;
      row.meter = JSON.stringify(result.pduOutlets.filter(o => o.pduIp && o.outletNo && o.outletNo.length).map(o => ({ doc: 'CMR/T01', dev: o.pduIp, meter: o.outletNo.map(Number) })));
      table.reload();
      toast('Veri başarıyla kaydedildi!', 'success', 'Başarılı');
    });
  }

  // ---------------------------------------------------------------------------
  // Sekme değişimi (yeniden yüklemesiz, ?tab= derin bağlantı)
  // ---------------------------------------------------------------------------
  function mount() {
    closeSelectPanel();
    if (table) table.destroy();
    if (tab === 'matched') mountMatched(); else mountMatching();
    // Menüde "Müşteri Listesi" (Varlıklar) eşleşen müşteriler sekmesine bağlıdır
    DCIM.shell.setActive(tab === 'matched' ? 'customer-list' : 'customers');
  }
  function switchTab(next) {
    if (next === tab) return;
    tab = next;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    url.searchParams.delete('open');
    url.searchParams.delete('q');
    params.delete('q');
    window.history.replaceState(null, '', url.toString());
    mount();
  }
  rootEl.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { switchTab(b.getAttribute('data-tab')); return; }
    const crumb = e.target.closest('a[href^="customer-pages.html"]');
    if (crumb) { e.preventDefault(); switchTab('matching'); }
  });

  mount();

  // Sunum senaryosu için doğrudan açılış: ?open=match|matched|edit|details|report
  const open = (params.get('open') || '').toLowerCase();
  setTimeout(() => {
    if (tab === 'matching') {
      if (open === 'match' && pending.length) processRow(pending[0]);
      else if (open === 'matched') openMatchedPopup();
    } else {
      const first = matchedRows()[0];
      if (open === 'report') openReportPopup();
      else if (open === 'details' && first) openCustomerDetails(first);
      else if (open === 'edit' && first) editMatched(first);
    }
  }, 80);
})();
