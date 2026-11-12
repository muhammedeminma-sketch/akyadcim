/* ==========================================================================
   DCIM Sunum — Müşteri Eşleştirme
   NewuicmpCustomerPagesComponent ("Müşteri Eşleştirme") +
   NewuicmpCustomerPagesMatchingPduComponent ("Eşleşen Müşteriler (PDU)")
   Açılır pencereler: CustomerChangeComponent (kat kat PDU / port eşleştirme penceresi: Tüm Katlar + 1./2./3. Kat sekmeleri,
   port kutucukları, başka kayıtta kullanılan çıkışlar kilitli), CustomerPagesDetailsComponent, TableDialogComponent.
   Rapor: app-report-export-menu (tablo araç çubuğunda) — Müşteri Eşleştirme Raporu / Eşleşen Müşteriler (PDU) Raporu
   (filtrelenmiş liste, ilk N kayıt; PDF / Excel / CSV). Eski 'Eşleşmiş Müşteri Raporu' penceresi orijinaldeki gibi kaldırıldı.
   PDU IP'leri (con_host) cihazın bulunduğu kat dokümanından çözülür (CMR/T01 · T02 · T03; js/mock/customer-pages.data.js).
   Tablolar varsayılan 50 satır; lg altı ekranda kart görünümü (eşleştirme / düzenleme / silme yok, yalnız görüntüleme).
   WOR/CDB XDB sorguları yerine DCIM.data.customers (js/mock-data.js + js/mock/customer-pages.data.js) bellek içi kullanılır.
   Derin bağlantı: ?tab=matching|matched  &open=match|matched|edit|details|report  &q=arama
     (?open=report rapor menüsünü açar; ?tab=matched&q=10.12. → 2. kat PDU IP'li eşleştirmeler)
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
  // getPduOutletList / getPduOutletPairs / con_host — cihaz katların dokümanlarında aranır (lookupDev; sabit 'CMR/T01' yok)
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
      const dev = m && m.dev ? CU.lookupDev(m.dev, m.doc) : null;
      return dev ? dev.con_host : (m && m.dev ? stripK(m.dev) + ' (IP bulunamadı)' : '');
    }).filter(Boolean).join(', ');
  }
  // Müşterinin tüm PDU'larındaki toplam outlet sayısı (kart özeti / rapor KPI)
  function pduOutletCount(row) {
    return parseMeter(row.meter).reduce((n, v) => n + (Array.isArray(v.meter) ? v.meter.length : 0), 0);
  }
  const isMobile = () => window.innerWidth < 1024;
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
  // cfg: { columns, rows(), cell(col,row), searchText(row), filterText(row,field), actions(), onClick(e), onRefresh, onShowFilters, onClearFilters, emptyText,
  //        mobileCards (kolonlarda mobile: 'primary'|'sub'|'secondary'|'meta'|'hide', desktopOnly, card(row)), reportHost (araç çubuğuna taşınan kalıcı öğe) }
  // Varsayılan 50 satır/sayfa (app-data-table pageSize=50).
  // ---------------------------------------------------------------------------
  function DataTable(host, cfg) {
    const st = { search: cfg.search || '', showFilters: false, colFilters: {}, sortField: '', sortOrder: 1, page: 1, pageSize: cfg.pageSize || 50, selected: new Set(), loading: false, showColMenu: false };
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
        '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">' +
          '<div class="flex flex-wrap items-center gap-2 max-lg:w-full max-lg:flex-col max-lg:items-stretch">' +
            '<div class="relative w-60 sm:w-72 max-lg:w-full">' +
              '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
              '<input type="text" data-search placeholder="Ara" value="' + esc(st.search) + '" class="w-full pl-8 pr-3 py-1 max-lg:py-2.5 text-xs max-lg:text-sm bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 shrink-0 max-lg:w-full max-lg:flex-wrap" data-right></div>' +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full' + (cfg.mobileCards ? ' max-lg:hidden' : '') + '" data-scroll' + (cfg.maxHeight ? ' style="max-height:' + cfg.maxHeight + '"' : '') + '>' +
          '<table class="scada-table w-full text-left border-collapse text-xs">' +
            '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
          '</table>' +
        '</div>' +
        (cfg.mobileCards ? '<div data-cards class="' + kit.CARDS_WRAP_CLS + '"' + (cfg.maxHeight ? ' style="max-height:' + cfg.maxHeight + '"' : '') + '></div>' : '') +
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
        (cfg.reportHost ? '<span data-report-slot></span>' : '') +
        filterBtn +
        '<div class="relative max-lg:hidden">' +
          '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
          colMenu +
        '</div>' +
        '<button type="button" data-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>';
      // Rapor menüsü kalıcı öğedir (açık menü durumu korunur): her çizimde yuvasına taşınır
      const slot = q('[data-report-slot]');
      if (slot && cfg.reportHost) slot.replaceWith(cfg.reportHost);
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
      // Mobil kart görünümü (lg altı): aynı sayfa satırları; seçim / düzenleme yok
      const cardsEl = q('[data-cards]');
      if (cardsEl) cardsEl.innerHTML = kit.dataCards(rows, cols.filter(c => c.visible !== false), { start: (st.page - 1) * st.pageSize, empty: cfg.emptyText || 'Veri bulunamadı' });
      const all = q('[data-check-all]');
      if (all) all.checked = rows.length > 0 && rows.every(r => st.selected.has(rowId(r)));
      if (cfg.onRender) cfg.onRender(lastRows);

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
      if (pg) { if (pg.disabled) return; st.page += parseInt(pg.getAttribute('data-page'), 10); renderBody(); q('[data-scroll]').scrollTop = 0; if (q('[data-cards]')) q('[data-cards]').scrollTop = 0; return; }
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
      // Ekrandaki arama, sütun filtreleri ve sıralama uygulanmış tüm satırlar (rapor)
      filteredRows() { return filtered(); },
      hasFilters() { return !!st.search.trim() || Object.keys(st.colFilters).some(k => String(st.colFilters[k] || '').trim() !== ''); },
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
  // CustomerChangeComponent — "Enerji CDR Değerleme" PDU & port eşleştirme penceresi (kat kat)
  // Sol: müşteri bilgileri + katlar (SITE_Floors; açık kat / PDU sayısı / seçili PDU-port); sağ: kat sekmeleri ve
  // her katın eşleştirme satırları (PDU seçimi + giriş/çıkış port kutucukları). Satır yalnız kendi katının PDU'larını listeler.
  // Başka kayıtlarda kullanılan çıkışlar kilitli görünür (üzerine gelince müşteri adı). PDU'nun dokümanı (doc) kata göre yazılır.
  // ---------------------------------------------------------------------------
  const OTHER_FLOOR = '__other';

  function openCustomerChange(data, onResult) {
    const isEditMode = !!data.meter;
    const myCdb = String(data.customerId || '');
    const myEp = String(data.productId || '');

    // loadFloors + loadDevices (doc('CMR/*') — bütün katlar): cihazın katı, bulunduğu dokümandır
    const devs = CU.devices();
    const devFloor = d => { const f = CU.floorOfDoc(d.doc); return f ? f.id : OTHER_FLOOR; };
    const floors = CU.siteFloors.map(f => ({ id: f.id, name: f.name, docs: f.docs, open: f.open, deviceCount: devs.filter(d => devFloor(d) === f.id).length }));
    if (devs.some(d => devFloor(d) === OTHER_FLOOR)) floors.push({ id: OTHER_FLOOR, name: 'Diğer', docs: [], open: true, deviceCount: devs.filter(d => devFloor(d) === OTHER_FLOOR).length });
    const floorDocLabel = f => f.docs.map(d => d.replace(/^CMR\//, '')).join(' + ');
    let activeFloor = 'all';

    // loadUsedPdus: diğer CDB kayıtlarında kullanılan portlar ve sahipleri (düzenlemede kendi kaydı hariç)
    const usedPduMap = new Map();
    const usedPortOwners = new Map();
    const ownerLabel = itm => {
      const name = String(itm.customer_name || '').trim() || 'Müşteri #' + (itm.cdb_id || '?');
      return myCdb && String(itm.cdb_id) === myCdb && itm.energy_product_id ? name + ' (ürün ' + itm.energy_product_id + ')' : name;
    };
    store.cdb.forEach(itm => {
      if (isEditMode && String(itm.cdb_id) === myCdb && String(itm.energy_product_id) === myEp) return;
      const owner = ownerLabel(itm);
      parseMeter(itm.meter).forEach(m => {
        if (!m.dev || !Array.isArray(m.meter)) return;
        if (!usedPduMap.has(m.dev)) usedPduMap.set(m.dev, new Set());
        if (!usedPortOwners.has(m.dev)) usedPortOwners.set(m.dev, new Map());
        m.meter.forEach(v => {
          const k = String(v);
          usedPduMap.get(m.dev).add(k);
          const ports = usedPortOwners.get(m.dev);
          const list = ports.get(k) || [];
          if (list.indexOf(owner) < 0) list.push(owner);
          ports.set(k, list);
        });
      });
    });

    const newGroup = floor => ({ pduIp: null, outletNo: [], floor: floor || null, full: false, filterText: '', filterId: '' });
    let groups = [];
    if (isEditMode) {
      groups = parseMeter(data.meter).filter(m => m && m.dev).map(m => {
        const vals = (m.meter || []).map(Number).filter(v => !isNaN(v));
        const d = CU.findDev(m.dev);
        const fl = d ? devFloor(d) : (CU.floorOfDoc(m.doc) || {}).id;
        return Object.assign(newGroup(fl), { pduIp: m.dev, outletNo: vals.filter(v => v > 0).map(v => 'in_' + v).concat(vals.filter(v => v < 0).map(String)) });
      });
    }
    const defaultFloor = () => {
      if (activeFloor !== 'all') return activeFloor;
      return (floors.find(f => f.open && f.deviceCount > 0) || floors[0] || { id: OTHER_FLOOR }).id;
    };
    if (!groups.length) groups = [newGroup(defaultFloor())];

    const outletMap = {};   // PDU → seçilebilir portlar
    const takenMap = {};    // PDU → başka kayıtlarda kullanılan çıkışlar (kilitli)
    let loading = true;
    let loadError = null;
    let flashIdx = -1;

    const portValue = o => (o.mtr_pow.charAt(0) === '-' ? o.mtr_pow : 'in_' + o.mtr_pow);
    const num = o => Math.abs(parseInt(o.mtr_pow, 10));

    // onPduIpSelected: portlar PDU'nun io listesinden; kullanılmış çıkışlar seçimden çıkar, kilitli gösterilir
    function loadPorts(id) {
      const d = CU.findDev(id);
      if (!d) return [];
      const usedSet = usedPduMap.get(id) || new Set();
      const all = d.io.map(io => ({ mtr_pow: String(io.mtr_pow) })).filter(o => o.mtr_pow.charAt(0) === '-' || parseInt(o.mtr_pow, 10) > 0);
      const list = all.filter(o => parseInt(o.mtr_pow, 10) > 0 || !usedSet.has(o.mtr_pow)).sort((a, b) => parseInt(b.mtr_pow, 10) - parseInt(a.mtr_pow, 10));
      const owners = usedPortOwners.get(id);
      takenMap[id] = all.filter(o => o.mtr_pow.charAt(0) === '-' && usedSet.has(o.mtr_pow)).map(o => ({ mtr_pow: o.mtr_pow, taken: true, owners: (owners && owners.get(o.mtr_pow)) || [] }));
      outletMap[id] = list;
      return list;
    }
    function onPduSelected(i, id, fromInit) {
      const g = groups[i];
      g.filterText = '';
      g.pduIp = id || '';
      g.full = false;
      if (!id) { g.outletNo = []; return; }
      const list = loadPorts(id);
      const usedSet = usedPduMap.get(id);
      if (fromInit) return;
      if (!list.length && usedSet && usedSet.size > 0) {
        outletMap[id] = [];
        toast('SEÇMEK İSTEDİĞİNİZ PDU DOLU', 'warning', 'UYARI');
        g.pduIp = ''; g.outletNo = [];
        return;
      }
      if (!g.outletNo || !g.outletNo.length) {
        const first = list[0];
        g.outletNo = first && parseInt(first.mtr_pow, 10) > 0 ? ['in_' + first.mtr_pow] : [];
      } else {
        const valid = list.map(portValue);
        if (g.outletNo.some(v => valid.indexOf(v) < 0)) g.outletNo = [];
      }
    }
    function portsOf(id) {
      const list = id ? outletMap[id] : null;
      if (!list) return null;
      const taken = takenMap[id] || [];
      return {
        inlets: list.filter(o => o.mtr_pow.charAt(0) !== '-').sort((a, b) => num(a) - num(b)),
        outlets: list.filter(o => o.mtr_pow.charAt(0) === '-').concat(taken).sort((a, b) => num(a) - num(b)),
        selectable: list.length,
        taken: taken.length
      };
    }
    function availablePdus(i) {
      const g = groups[i];
      const ft = (g.filterText || '').toLocaleLowerCase('tr');
      const fi = (g.filterId || '').toLowerCase();
      const others = groups.map((x, j) => (j !== i ? x.pduIp : null)).filter(Boolean);
      return devs.filter(d => others.indexOf(d.id) < 0 &&
        (!g.floor || devFloor(d) === g.floor) &&
        (ft === '' || (d.con_host || '').toLocaleLowerCase('tr').indexOf(ft) >= 0) &&
        (fi === '' || stripK(d.id).toLowerCase().indexOf(fi) >= 0));
    }
    const rowsOfFloor = fid => groups.map((g, index) => ({ g, index })).filter(r => (r.g.floor || OTHER_FLOOR) === fid);
    const floorPduCount = fid => rowsOfFloor(fid).filter(r => !!r.g.pduIp).length;
    const floorPortCount = fid => rowsOfFloor(fid).filter(r => !!r.g.pduIp).reduce((n, r) => n + (r.g.outletNo || []).length, 0);
    const totalPduCount = () => groups.filter(g => !!g.pduIp).length;
    const totalPortCount = () => floors.reduce((n, f) => n + floorPortCount(f.id), 0);
    const usedFloorCount = () => floors.filter(f => floorPduCount(f.id) > 0).length;
    const openFloorCount = () => floors.filter(f => f.id !== OTHER_FLOOR && f.open).length;
    const definedFloorCount = () => floors.filter(f => f.id !== OTHER_FLOOR).length;
    const pduHost = id => { const d = id ? CU.findDev(id) : null; return d ? d.con_host : ''; };
    const visibleFloors = () => (activeFloor === 'all' ? floors.filter(f => f.open || f.deviceCount > 0 || rowsOfFloor(f.id).length) : floors.filter(f => f.id === activeFloor));
    const takenTip = o => {
      const port = 'out_' + o.mtr_pow.substring(1);
      return o.owners && o.owners.length ? port + ' kullanımda\n' + o.owners.join('\n') : port + ' başka bir eşleştirmede kullanılıyor';
    };

    const DT = 'text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
    const info = (label, value, cls) => '<div class="px-3 py-2 min-w-0"><dt class="' + DT + '">' + label + '</dt><dd class="mt-0.5 text-[12px] select-text ' + cls + '">' + esc(value || '-') + '</dd></div>';

    function asideHtml() {
      return '<section class="rounded-[2px] border border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card">' +
          '<header class="flex items-center gap-2 px-3 h-9 border-b border-slate-200 dark:border-border-subtle"><i class="pi pi-id-card text-sky-600 dark:text-sky-400 text-[13px]"></i><span class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Müşteri Bilgileri</span></header>' +
          '<dl class="divide-y divide-slate-100 dark:divide-border-subtle">' +
            info('Müşteri Adı', data.customerName, 'font-semibold leading-snug text-slate-800 dark:text-slate-100') +
            '<div class="grid grid-cols-2 divide-x divide-slate-100 dark:divide-border-subtle">' + info('Müşteri ID', data.customerId, 'font-mono font-bold text-sky-700 dark:text-sky-400 truncate') + info('Enerji Ürün ID', data.productId, 'font-mono font-semibold truncate') + '</div>' +
            info('Paket Adı', data.productName, 'font-semibold leading-snug') +
            '<div class="grid grid-cols-2 divide-x divide-slate-100 dark:divide-border-subtle">' + info('Hizmet No', data.accountId, 'font-mono font-semibold truncate') + info('Servis ID', data.serviceNo, 'font-mono font-semibold truncate') + '</div>' +
          '</dl>' +
        '</section>' +
        '<section class="rounded-[2px] border border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card">' +
          '<header class="flex items-center gap-2 px-3 h-9 border-b border-slate-200 dark:border-border-subtle"><i class="pi pi-building text-amber-600 dark:text-amber-400 text-[13px]"></i><span class="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Katlar</span>' +
            '<span class="ml-auto inline-flex items-center gap-1 rounded-[2px] border border-slate-200 dark:border-border-muted px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span class="font-mono font-bold text-slate-900 dark:text-slate-100">' + openFloorCount() + '/' + definedFloorCount() + '</span> açık</span></header>' +
          '<ul class="divide-y divide-slate-100 dark:divide-border-subtle">' +
            floors.map(f =>
              '<li><button type="button" data-floor="' + esc(f.id) + '" class="w-full px-3 py-2 text-left transition-colors cursor-pointer border-l-2 ' + (activeFloor === f.id ? 'border-sky-500 bg-sky-500/[0.07]' : 'border-transparent hover:bg-slate-50 dark:hover:bg-surface-hover') + '">' +
                '<div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full shrink-0 bg-emerald-500"></span>' +
                  '<span class="flex-1 truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100">' + esc(f.name) + '</span>' +
                  '<span class="rounded-[2px] bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Açık</span></div>' +
                '<div class="mt-1 pl-4 flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400"><span class="font-mono truncate">' + esc(floorDocLabel(f) || '—') + '</span>' +
                  '<span class="whitespace-nowrap"><b class="font-mono text-slate-700 dark:text-slate-200">' + f.deviceCount + '</b> PDU</span></div>' +
                (floorPduCount(f.id) > 0 ? '<div class="mt-1 pl-4 flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-400"><i class="pi pi-check-circle text-[9px]"></i>' + floorPduCount(f.id) + ' PDU · ' + floorPortCount(f.id) + ' port seçili</div>' : '') +
              '</button></li>').join('') +
          '</ul>' +
          '<div class="grid grid-cols-3 divide-x divide-slate-100 dark:divide-border-subtle border-t border-slate-200 dark:border-border-subtle">' +
            [['Sahadaki PDU', devs.length, 'text-slate-900 dark:text-slate-100'], ['Seçili PDU', totalPduCount(), 'text-sky-700 dark:text-sky-400'], ['Seçili Port', totalPortCount(), 'text-sky-700 dark:text-sky-400']].map(k =>
              '<div class="px-2 py-2 text-center"><div class="font-mono text-[15px] font-bold ' + k[2] + '">' + k[1] + '</div><div class="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">' + k[0] + '</div></div>').join('') +
          '</div>' +
        '</section>';
    }

    function tabsHtml() {
      if (floors.length < 2) return '';
      const tab = (id, icon, title, sub, badge) =>
        '<button type="button" role="tab" aria-selected="' + (activeFloor === id) + '" data-floor="' + esc(id) + '" class="-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-left transition-colors cursor-pointer ' +
          (activeFloor === id ? 'border-sky-500 text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-surface-hover') + '">' +
          '<i class="pi ' + icon + ' text-[13px]"></i><span class="flex flex-col leading-tight"><span class="text-[11px] font-bold">' + esc(title) + '</span><span class="text-[10px] font-medium text-slate-500 dark:text-slate-400">' + esc(sub) + '</span></span>' +
          (badge > 0 ? '<span class="rounded-[2px] bg-sky-600 px-1.5 py-px text-[10px] font-mono font-bold text-white">' + badge + '</span>' : '') + '</button>';
      return '<nav class="shrink-0 flex items-stretch gap-0.5 overflow-x-auto px-3 border-b border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card" role="tablist" aria-label="Katlar">' +
        tab('all', 'pi-th-large', 'Tüm Katlar', definedFloorCount() + ' kat · ' + openFloorCount() + ' açık', totalPduCount()) +
        floors.map(f => tab(f.id, 'pi-building', f.name, f.deviceCount + ' PDU', floorPduCount(f.id))).join('') +
      '</nav>';
    }

    function rowHtml(r, n, f) {
      const g = r.g;
      const i = r.index;
      const p = g.pduIp ? portsOf(g.pduIp) : null;
      const sel = g.outletNo || [];
      const port = o => {
        if (o.taken) return '<span class="cc-port cc-port--taken" role="button" tabindex="0" aria-disabled="true" title="' + esc(takenTip(o)) + '"><i class="pi pi-lock"></i>out_' + esc(o.mtr_pow.substring(1)) + '</span>';
        const v = portValue(o);
        return '<button type="button" data-port="' + i + '|' + esc(v) + '" class="cc-port' + (sel.indexOf(v) >= 0 ? ' cc-port--on' : '') + '">' + (o.mtr_pow.charAt(0) === '-' ? 'out_' + esc(o.mtr_pow.substring(1)) : 'in_' + esc(o.mtr_pow)) + '</button>';
      };
      let ports;
      if (!g.pduIp) ports = '<div class="rounded-[2px] border border-dashed border-slate-300 dark:border-border-muted px-3 py-3 text-[11px] text-slate-500 dark:text-slate-400">Port seçmek için önce PDU seçin.</div>';
      else if (!p) ports = '<div class="flex items-center gap-2 px-1 py-2 text-[11px] text-slate-500 dark:text-slate-400"><i class="pi pi-spin pi-spinner text-[11px]"></i> Portlar yükleniyor...</div>';
      else if (!p.inlets.length && !p.outlets.length) ports = '<div class="rounded-[2px] border border-dashed border-slate-300 dark:border-border-muted px-3 py-3 text-[11px] text-slate-500 dark:text-slate-400">Bu PDU\'da seçilebilir port bulunamadı.</div>';
      else {
        ports = (p.inlets.length ? '<div class="flex flex-col gap-1.5"><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Giriş (Inlet)</span><div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">' + p.inlets.map(port).join('') + '</div></div>' : '') +
          (p.outlets.length ? '<div class="flex flex-col gap-1.5"><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Çıkış (Outlet)</span><div class="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">' + p.outlets.map(port).join('') + '</div>' +
            (p.taken ? '<p class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400"><i class="pi pi-info-circle text-[10px]"></i>Kilitli çıkışlar başka bir eşleştirmede kullanılıyor; hangi müşteriye ait olduğunu görmek için üzerine gelin.</p>' : '') + '</div>' : '');
      }
      return '<div data-row-index="' + i + '" class="scroll-my-4 rounded-[2px] border bg-white dark:bg-surface-card shadow-sm transition-colors border-slate-200 dark:border-border-muted hover:border-sky-300 dark:hover:border-sky-800' + (flashIdx === i ? ' cc-row--flash' : '') + '">' +
        '<div class="cc-row-grid grid @3xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">' +
          '<div class="cc-row-pdu p-3 flex flex-col gap-2 min-w-0 border-b @3xl:border-b-0 @3xl:border-r border-slate-100 dark:border-border-subtle">' +
            '<div class="flex items-center gap-2"><span class="inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-[2px] bg-slate-100 dark:bg-surface-hover font-mono text-[10px] font-bold text-slate-700 dark:text-slate-200">' + (n + 1) + '</span>' +
              '<span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">PDU</span>' +
              (groups.length > 1 || i > 0 ? '<button type="button" data-remove="' + i + '" title="Bu eşleştirmeyi sil" class="ml-auto w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 transition-colors cursor-pointer"><i class="pi pi-trash text-[11px]"></i></button>' : '') +
            '</div>' +
            '<button type="button" class="cc-select" data-pdu-select="' + i + '">' +
              (g.pduIp ? '<span class="font-mono font-bold text-sky-700 dark:text-sky-400">' + esc(stripK(g.pduIp)) + '</span>' : '<span class="cc-placeholder">PDU seçiniz</span>') +
            '</button>' +
            '<div class="flex items-center gap-1.5 text-[11px] min-h-4">' +
              (g.pduIp ? '<i class="pi pi-sitemap text-[10px] text-slate-400"></i><span class="font-mono font-semibold text-slate-600 dark:text-slate-300">' + esc(pduHost(g.pduIp) || 'IP yok') + '</span>'
                : '<span class="text-slate-400 dark:text-slate-500">Listeden bu kattaki bir PDU seçin</span>') +
            '</div>' +
          '</div>' +
          '<div class="p-3 flex flex-col gap-2.5 min-w-0">' +
            '<div class="flex items-center gap-2 flex-wrap"><span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Inlet / Outlet Portları</span>' +
              (p ? '<span class="rounded-[2px] bg-slate-100 dark:bg-surface-hover px-1.5 py-px font-mono text-[10px] font-semibold text-slate-600 dark:text-slate-300">' + sel.length + ' / ' + p.selectable + ' seçili</span>' +
                (p.taken ? '<span class="inline-flex items-center gap-1 rounded-[2px] bg-amber-500/10 border border-amber-500/25 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:text-amber-400"><i class="pi pi-lock text-[8px]"></i>' + p.taken + ' kullanımda</span>' : '') : '') +
              (g.pduIp ? '<div class="ml-auto flex items-center gap-1">' +
                '<button type="button" data-all="' + i + '"' + (p && p.selectable ? '' : ' disabled') + ' class="h-7 px-2.5 rounded-[2px] text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"><i class="pi pi-check-square text-[10px] mr-1"></i>Tümünü seç</button>' +
                '<button type="button" data-clear="' + i + '"' + (sel.length ? '' : ' disabled') + ' class="h-7 px-2.5 rounded-[2px] text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"><i class="pi pi-eraser text-[10px] mr-1"></i>Temizle</button>' +
              '</div>' : '') +
            '</div>' +
            ports +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function floorsHtml() {
      return visibleFloors().map(f => {
        const rows = rowsOfFloor(f.id);
        return '<section>' +
          '<header class="flex items-center gap-3 mb-3">' +
            '<span class="w-8 h-8 rounded-[2px] flex items-center justify-center shrink-0 border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"><i class="pi pi-building text-[13px]"></i></span>' +
            '<div class="min-w-0"><h4 class="text-[13px] font-bold text-slate-900 dark:text-slate-100">' + esc(f.name) + '</h4>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">' + (f.docs.length ? '<span class="font-mono">' + esc(floorDocLabel(f)) + '</span>' : '') +
                ' · ' + f.deviceCount + ' PDU · <b class="text-slate-700 dark:text-slate-200">' + floorPduCount(f.id) + '</b> seçili PDU · <b class="text-slate-700 dark:text-slate-200">' + floorPortCount(f.id) + '</b> port</p></div>' +
            '<div class="flex-1 h-px bg-slate-200 dark:bg-border-subtle"></div>' +
            '<button type="button" data-add="' + esc(f.id) + '" class="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold shadow-sm transition-colors cursor-pointer"><i class="pi pi-plus text-[10px]"></i> PDU Ekle</button>' +
          '</header>' +
          (rows.length ? '' :
            '<div class="flex flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed border-slate-300 dark:border-border-muted bg-white dark:bg-surface-card py-7 text-center">' +
              '<i class="pi pi-inbox text-lg text-slate-400"></i><span class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(f.name) + ' için henüz eşleştirme yok</span>' +
              '<button type="button" data-add="' + esc(f.id) + '" class="inline-flex items-center gap-1.5 h-8 px-3 rounded-[2px] border border-sky-500/50 text-sky-700 dark:text-sky-300 bg-sky-500/5 hover:bg-sky-500/15 text-[11px] font-bold transition-colors cursor-pointer"><i class="pi pi-plus text-[10px]"></i> ' + esc(f.name) + ' için PDU eşleştir</button>' +
            '</div>') +
          '<div class="grid gap-3">' + rows.map((r, n) => rowHtml(r, n, f)).join('') + '</div>' +
        '</section>';
      }).join('');
    }

    function footerSummary() {
      return '<span class="inline-flex items-center gap-1.5"><i class="pi pi-check-circle text-sky-600 dark:text-sky-400 text-[11px]"></i>Seçili: ' +
          '<b class="font-mono text-slate-900 dark:text-slate-100">' + totalPduCount() + '</b> PDU · <b class="font-mono text-slate-900 dark:text-slate-100">' + totalPortCount() + '</b> port · <b class="font-mono text-slate-900 dark:text-slate-100">' + usedFloorCount() + '</b> kat</span>' +
        '<span class="h-4 w-px bg-slate-300 dark:bg-border-muted"></span>' +
        '<span class="inline-flex items-center gap-1.5"><i class="pi pi-building text-amber-600 dark:text-amber-400 text-[11px]"></i>Sahada <b class="font-mono text-slate-900 dark:text-slate-100">' + devs.length + '</b> PDU · ' +
          '<b class="font-mono text-slate-900 dark:text-slate-100">' + openFloorCount() + '/' + definedFloorCount() + '</b> kat açık</span>';
    }

    const html =
      '<div class="customer-change-dialog @container relative h-full w-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl overflow-hidden flex flex-col text-xs text-slate-800 dark:text-slate-200 select-none">' +
        '<div class="px-4 py-2.5 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between gap-3 bg-slate-50 dark:bg-surface-base cursor-move shrink-0" data-drag-handle>' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<span class="w-8 h-8 rounded-[2px] flex items-center justify-center bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 shrink-0"><i class="pi pi-bolt text-sm"></i></span>' +
            '<div class="min-w-0"><div class="flex items-center gap-2 flex-wrap">' +
              '<h3 class="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wide uppercase">Enerji CDR Değerleme</h3>' +
              '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-wider border ' + (isEditMode ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30') + '">' + (isEditMode ? 'Düzenle' : 'Yeni Eşleştirme') + '</span>' +
              (data.customerId ? '<span class="px-1.5 py-0.5 rounded-[2px] font-mono text-[11px] bg-slate-200/70 dark:bg-surface-hover text-slate-700 dark:text-slate-300">#' + esc(data.customerId) + '</span>' : '') +
            '</div><p class="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">' + esc(data.customerName) + '</p></div>' +
          '</div>' +
          '<button class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-surface-hover transition-colors cursor-pointer shrink-0" type="button" data-cancel title="Kapat"><i class="pi pi-times text-xs"></i></button>' +
        '</div>' +
        '<div data-overlay></div>' +
        '<form class="flex flex-col flex-1 min-h-0 overflow-hidden" data-form>' +
          '<div class="cc-body flex-1 min-h-0 overflow-y-auto @4xl:overflow-hidden @4xl:grid @4xl:grid-cols-[300px_minmax(0,1fr)] @6xl:grid-cols-[330px_minmax(0,1fr)]" data-body>' +
            '<aside class="cc-aside p-3 space-y-3 bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle @4xl:border-b-0 @4xl:border-r @4xl:overflow-y-auto" data-aside></aside>' +
            '<section class="cc-right flex flex-col @4xl:min-h-0">' +
              '<div data-tabs></div>' +
              '<div class="cc-content flex-1 p-4 space-y-6 bg-slate-50/60 dark:bg-surface-base/40 @4xl:min-h-0 @4xl:overflow-y-auto" data-content></div>' +
            '</section>' +
          '</div>' +
          '<div class="px-4 py-2.5 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-base flex items-center justify-between gap-3 shrink-0">' +
            '<div class="cc-summary hidden @2xl:flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400" data-summary></div>' +
            '<div class="flex items-center gap-2 ml-auto">' +
              '<button class="h-8 px-4 rounded-[2px] border border-slate-300 dark:border-border-muted bg-white dark:bg-surface-card hover:bg-slate-100 dark:hover:bg-surface-hover text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors cursor-pointer" type="button" data-cancel>İptal</button>' +
              '<button class="h-8 px-4 rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer" type="submit"><i class="pi pi-save text-xs"></i> Kaydet</button>' +
            '</div>' +
          '</div>' +
        '</form>' +
      '</div>';

    const cancel = () => { toast('İşlem iptal edildi.', 'info', 'İPTAL EDİLDİ'); pane.close(); };
    const pane = openPane({ html, style: 'width:1320px;max-width:96vw;height:90vh', onBackdrop: cancel, onEscape: cancel });
    const root = pane.pane;

    function renderOverlay() {
      const host = root.querySelector('[data-overlay]');
      if (!loading && !loadError) { host.innerHTML = ''; return; }
      host.innerHTML =
        '<div class="absolute inset-0 mt-14 bg-white/95 dark:bg-surface-card/95 z-50 flex justify-center items-center p-5">' +
          (loading && !loadError ? '<div class="flex flex-col items-center gap-4"><div class="cp-spinner"></div><p class="text-slate-600 dark:text-slate-400 font-medium">Veriler yükleniyor...</p></div>' : '') +
          (loadError
            ? '<div class="bg-white dark:bg-surface-card border border-rose-200 dark:border-rose-900/50 rounded-[2px] shadow-lg w-full max-w-[460px] p-6 flex flex-col items-center gap-4 text-center">' +
                '<i class="pi pi-exclamation-triangle text-3xl text-rose-500"></i><h3 class="m-0 text-base font-bold text-rose-600 dark:text-rose-500">Veri Uyarısı</h3>' +
                '<div class="text-[12px] text-slate-700 dark:text-slate-300 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-[2px] border border-rose-200 dark:border-rose-900/50 w-full max-h-[180px] overflow-y-auto break-words select-text">' + esc(loadError) + '</div>' +
                '<button class="bg-rose-600 hover:bg-rose-700 text-white border-none py-2 px-6 rounded-[2px] font-semibold cursor-pointer transition-colors w-full" type="button" data-err-ok>Tamam, Devam Et</button></div>'
            : '') +
        '</div>';
    }
    function renderAll() {
      const content = root.querySelector('[data-content]');
      const top = content.scrollTop;
      root.querySelector('[data-aside]').innerHTML = asideHtml();
      root.querySelector('[data-tabs]').innerHTML = tabsHtml();
      content.innerHTML = floorsHtml();
      content.scrollTop = top;
      root.querySelector('[data-summary]').innerHTML = footerSummary();
    }
    function revealRow(i) {
      flashIdx = i;
      renderAll();
      const el = root.querySelector('[data-row-index="' + i + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const sel = el.querySelector('[data-pdu-select]');
        if (sel) sel.focus({ preventScroll: true });
      }
      setTimeout(() => { if (flashIdx === i) { flashIdx = -1; const r = root.querySelector('[data-row-index="' + i + '"]'); if (r) r.classList.remove('cc-row--flash'); } }, 2600);
    }

    // PDU seçim paneli (mat-select: arama başlığı + seçenekler; yalnız satırın katındaki PDU'lar)
    function pduOptionsHtml(i) {
      const list = availablePdus(i);
      const cur = groups[i].pduIp;
      return '<div class="mat-mdc-option text-rose-600 dark:text-rose-400 font-semibold text-[11px]" data-opt=""><i class="pi pi-times-circle text-[10px]"></i>Seçimi kaldır</div>' +
        list.map(d =>
          '<div class="mat-mdc-option' + (cur === d.id ? ' mdc-list-item--selected' : '') + '" data-opt="' + esc(d.id) + '">' +
            '<span class="flex items-center justify-between gap-3 w-full"><span class="font-mono font-bold text-[12px] text-slate-800 dark:text-slate-100">' + esc(stripK(d.id)) + '</span>' +
            '<span class="font-mono text-[11px] text-slate-500 dark:text-slate-400">' + esc(d.con_host || '-') + '</span></span></div>').join('') +
        (list.length ? '' : '<div class="mat-mdc-option is-disabled"><span class="text-[11px] italic text-slate-400">Eşleşen PDU bulunamadı</span></div>');
    }
    function openPduPanel(i, anchor) {
      const g = groups[i];
      const fl = floors.find(f => f.id === g.floor);
      const countText = () => (fl ? fl.name : 'Tüm katlar') + ' · ' + availablePdus(i).length + ' PDU listeleniyor';
      const inp = 'h-8 w-full pl-7 pr-2 text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-base text-slate-800 dark:text-slate-200 rounded-[2px] focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500';
      const el = openSelectPanel(anchor,
        '<div class="sticky top-0 z-10 bg-white dark:bg-surface-card px-3 py-2.5 border-b border-slate-200 dark:border-border-muted">' +
          '<div class="grid grid-cols-2 gap-2">' +
            '<div class="relative"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none"></i><input data-fi value="' + esc(g.filterId) + '" autocomplete="off" placeholder="PDU adı..." class="' + inp + ' font-semibold" /></div>' +
            '<div class="relative"><i class="pi pi-sitemap absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none"></i><input data-ft value="' + esc(g.filterText) + '" autocomplete="off" placeholder="IP adresi..." class="' + inp + ' font-mono" /></div>' +
          '</div>' +
          '<p class="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400" data-count>' + esc(countText()) + '</p>' +
        '</div>' +
        '<div data-opts>' + pduOptionsHtml(i) + '</div>');
      el._minWidth = 380;
      positionPanel(el, anchor);
      const refreshOpts = () => { el.querySelector('[data-opts]').innerHTML = pduOptionsHtml(i); el.querySelector('[data-count]').textContent = countText(); };
      el.querySelector('[data-ft]').addEventListener('input', e => { g.filterText = e.target.value; refreshOpts(); });
      el.querySelector('[data-fi]').addEventListener('input', e => { g.filterId = e.target.value; refreshOpts(); });
      el.addEventListener('click', e => {
        const o = e.target.closest('[data-opt]');
        if (!o) return;
        onPduSelected(i, o.getAttribute('data-opt'), false);
        closeSelectPanel();
        renderAll();
      });
      const sel = el.querySelector('.mdc-list-item--selected');
      if (sel) sel.scrollIntoView({ block: 'center' });
      el.querySelector('[data-fi]').focus();
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
        customerId: data.customerId, customerName: data.customerName, accountId: data.accountId,
        serviceNo: data.serviceNo, productId: data.productId, productName: data.productName,
        pduOutlets: groups.filter(g => !!g.pduIp).map(g => {
          const dev = CU.findDev(g.pduIp);
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
      const fl = t.closest('[data-floor]');
      if (fl) { activeFloor = fl.getAttribute('data-floor'); renderAll(); return; }
      const add = t.closest('[data-add]');
      if (add) { groups.push(newGroup(add.getAttribute('data-add'))); revealRow(groups.length - 1); return; }
      const rm = t.closest('[data-remove]');
      if (rm) {
        groups.splice(parseInt(rm.getAttribute('data-remove'), 10), 1);
        if (!groups.length) groups.push(newGroup(defaultFloor()));
        renderAll();
        return;
      }
      const pt = t.closest('[data-port]');
      if (pt) {
        const parts = pt.getAttribute('data-port').split('|');
        const g = groups[parseInt(parts[0], 10)];
        const v = parts[1];
        const cur = (g.outletNo || []).slice();
        const k = cur.indexOf(v);
        if (k >= 0) cur.splice(k, 1); else cur.push(v);
        // Kayıt sırası port listesinin sırasıdır (meter JSON aynı kalır)
        const order = (outletMap[g.pduIp] || []).map(portValue);
        g.outletNo = cur.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        renderAll();
        return;
      }
      const all = t.closest('[data-all]');
      if (all) { const g = groups[parseInt(all.getAttribute('data-all'), 10)]; g.outletNo = (outletMap[g.pduIp] || []).map(portValue); renderAll(); return; }
      const clr = t.closest('[data-clear]');
      if (clr) { groups[parseInt(clr.getAttribute('data-clear'), 10)].outletNo = []; renderAll(); return; }
      const ps = t.closest('[data-pdu-select]');
      if (ps) { if (selectPanel && selectPanel.anchor === ps) closeSelectPanel(); else openPduPanel(parseInt(ps.getAttribute('data-pdu-select'), 10), ps); }
    });
    root.querySelector('[data-form]').addEventListener('submit', e => { e.preventDefault(); submit(); });
    root.querySelector('[data-content]').addEventListener('scroll', repositionSelectPanel);
    root.querySelector('[data-body]').addEventListener('scroll', repositionSelectPanel);

    renderAll();
    renderOverlay();
    // loadDevices + loadUsedPdus → loadOutletsForExistingPdus
    setTimeout(() => {
      const notFound = [];
      groups.forEach((g, i) => {
        if (!g.pduIp) return;
        if (CU.findDev(g.pduIp)) onPduSelected(i, g.pduIp, true);
        else { notFound.push(g.pduIp); g.pduIp = null; g.outletNo = []; }
      });
      if (notFound.length) loadError = 'PDU IP\'ler bulunurken hata oluştu: ' + notFound.join(', ') + '. Lütfen kontrol ediniz.';
      loading = false;
      renderAll();
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

  // ---------------------------------------------------------------------------
  // Rapor (app-report-export-menu, tablo araç çubuğunda): 'Filtrelenmiş liste' · ilk N kayıt · PDF / Excel / CSV
  // Tablo sayfa sayfa gösterilir; rapor ekrandaki arama + sütun filtreleri uygulanmış tüm listeyi alır.
  // ---------------------------------------------------------------------------
  let reportMenu = null;
  let reportTotal = null;
  function mountReport(o) {
    if (reportMenu) reportMenu.destroy();
    const host = document.createElement('div');
    host.className = 'shrink-0';
    reportTotal = o.total;
    reportMenu = DCIM.report.menu(host, {
      label: 'Rapor al', scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: o.hint }], options: 'limit', unit: o.unit,
      total: null, inTable: true, onExport: o.onExport
    });
    return host;
  }
  function updateReportTotal(rows) {
    if (!reportMenu) return;
    const n = rows ? rows.length : reportTotal ? reportTotal() : null;
    reportMenu.update({ total: n, disabled: !n });
  }
  const reportText = v => (v === undefined || v === null || v === '' ? '' : String(v));
  const limitLabel = (req, total) => (req.limit && req.limit < total ? 'İlk ' + req.limit + ' / ' + total : 'Tümü (' + total + ')') + ' müşteri';
  const filterLabels = () => {
    const st = table.state;
    const head = {};
    (tab === 'matched' ? T2_COLUMNS : T1_COLUMNS).forEach(c => { head[c.field] = c.header; });
    return (st.search.trim() ? ['arama "' + st.search.trim() + '"'] : [])
      .concat(Object.keys(st.colFilters).filter(k => String(st.colFilters[k] || '').trim() !== '').map(k => (head[k] || k) + ': ' + String(st.colFilters[k]).trim()));
  };

  function exportMatchingReport(req) {
    const all = table.filteredRows();
    const rows = DCIM.report.applyLimit(all, req);
    const filters = filterLabels();
    DCIM.report.generate({
      title: 'Müşteri Eşleştirme Raporu',
      subtitle: [filters.length ? 'Filtre: ' + filters.join(', ') : 'Eşleştirilmemiş tüm müşteriler', limitLabel(req, all.length), 'Sipariş · ' + rows.length + ' müşteri'].join(' · '),
      filename: 'Musteri_Eslestirme',
      kpis: [{ label: 'Müşteri', value: rows.length }],
      sections: [{
        title: 'Eşleştirilmemiş müşteriler',
        columns: [
          { key: 'erp', label: 'Hizmet Numarası' }, { key: 'name', label: 'Müşteri Adı' }, { key: 'cdb', label: 'Müşteri ID' },
          { key: 'ep', label: 'Enerji Ürün ID' }, { key: 'pkg', label: 'Paket Adı' }, { key: 'svc', label: 'Servis ID' },
          { key: 'bgn', label: 'Başlangıç' }, { key: 'end', label: 'Bitiş' }
        ],
        rows: rows.map(r => ({ erp: reportText(r.erp_id), name: reportText(r.customer_name), cdb: reportText(r.cdb_id), ep: reportText(r.energy_product_id),
          pkg: reportText(r.svc_desc), svc: reportText(r.svc_id), bgn: reportText(r.tim_bgn), end: reportText(r.tim_end) }))
      }],
      notes: ['Tamamlanmış (0x0304), enerji ürün ID\'si olan ve henüz eşleştirilmemiş siparişler; CDB\'de olan ürünler ve aynı ürünün sonraki siparişleri listelenmez.']
    }, req.format);
  }

  function exportMatchedReport(req) {
    const all = table.filteredRows();
    const rows = DCIM.report.applyLimit(all, req);
    const filtered = table.hasFilters();
    DCIM.report.generate({
      title: 'Eşleşen Müşteriler (PDU) Raporu',
      subtitle: [filtered ? 'Filtrelenmiş liste' : 'Tüm eşleşen müşteriler', limitLabel(req, all.length), 'Sipariş · ' + rows.length + ' müşteri'].join(' · '),
      filename: 'Eslesen_Musteriler_PDU',
      kpis: [
        { label: 'Müşteri', value: rows.length },
        { label: 'PDU outlet', value: rows.reduce((n, r) => n + pduOutletCount(r), 0) }
      ],
      sections: [{
        title: 'Eşleşen müşteriler',
        columns: [
          { key: 'cdb', label: 'Müşteri ID' }, { key: 'erp', label: 'Hizmet No' }, { key: 'name', label: 'Müşteri Adı' },
          { key: 'ep', label: 'Enerji Ürün ID' }, { key: 'pkg', label: 'Paket Adı' }, { key: 'svc', label: 'Servis ID' },
          { key: 'pdu', label: 'PDU - Outlet Eşleştirmeleri' }, { key: 'ip', label: 'PDU IP Adresleri' }
        ],
        rows: rows.map(r => ({ cdb: reportText(r.cdb_id), erp: reportText(r.erp_id), name: reportText(r.customer_name), ep: reportText(r.energy_product_id),
          pkg: reportText(r.svc_desc), svc: reportText(r.svc_id),
          pdu: pduOutletList(r).map(p => p.device + ': ' + p.outlets).join('; '), ip: reportText(conHost(r)) }))
      }]
    }, req.format);
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
    '<div class="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-border-subtle p-2 bg-slate-50/50 dark:bg-surface-base max-lg:p-0 max-lg:mb-2 max-lg:border-b-0 max-lg:bg-transparent dark:max-lg:bg-transparent">' +
      // Mobil: ortak alt çizgili sekme çubuğu (.nu-mtabs — css/customer-pages.css)
      '<div class="flex items-center gap-2 max-lg:w-full nu-mtabs">' +
        '<button type="button" role="tab" aria-selected="' + (tab === 'matching') + '" data-tab="matching" class="' + (tab === 'matching' ? TAB_ACTIVE : TAB_IDLE) + '"><i class="pi pi-users text-xs"></i><span>Müşteri Eşleştirme</span></button>' +
        '<button type="button" role="tab" aria-selected="' + (tab === 'matched') + '" data-tab="matched" class="' + (tab === 'matched' ? TAB_ACTIVE : TAB_IDLE) + '"><i class="pi pi-server text-xs"></i><span>Eşleşen Müşteriler (PDU)</span></button>' +
      '</div>' +
    '</div>';

  // mobile: kart görünümündeki yeri (orijinal columns tanımı)
  const T1_COLUMNS = [
    { field: 'erp_id', header: 'Hizmet Numarası', mobile: 'primary' },
    { field: 'customer_name', header: 'Müşteri Adı', mobile: 'sub' },
    { field: 'cdb_id', header: 'Müşteri ID', mobile: 'meta' },
    { field: 'energy_product_id', header: 'Enerji Ürün ID', mobile: 'meta' },
    { field: 'svc_desc', header: 'Paket Adı', mobile: 'secondary' },
    { field: 'svc_id', header: 'Servis ID', mobile: 'hide' },
    { field: 'tim_bgn', header: 'Başlangıç', filterable: false, mobile: 'meta' },
    { field: 'tim_end', header: 'Bitiş', filterable: false, mobile: 'meta' },
    { field: 'is_matched', header: 'Eşleştir', filterable: false, desktopOnly: true }
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
    const reportHost = mountReport({
      unit: 'müşteri', hint: 'Ekrandaki filtrelerle', total: () => table ? table.filteredRows().length : pending.length, onExport: exportMatchingReport
    });
    table = DataTable(rootEl.querySelector('[data-table]'), {
      columns: T1_COLUMNS,
      rows: () => pending,
      mobileCards: true,
      reportHost,
      onRender: updateReportTotal,
      search: params.get('q') || '',
      searchText: SEARCH_T1,
      sortValue: sortT1,
      cell: (c, r) => c.field === 'is_matched'
        ? '<div class="flex items-center gap-2">' + (r.is_matched ? MATCHED_BADGE : button({ variant: 'secondary', size: 'sm', label: 'Eşleştir', attrs: 'data-match="' + esc(r.id) + '" title="Müşteri Eşleştirmek için tıklayınız"' })) + '</div>'
        : null,
      actions: () =>
        '<div class="flex items-center gap-1.5 max-lg:contents">' +
          (filterSwitch === 1 ? '<button type="button" data-act="matched" class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] transition-all flex items-center gap-1 cursor-pointer max-lg:w-full max-lg:justify-center max-lg:h-10 max-lg:text-[13px] max-lg:gap-2 max-lg:rounded-[3px] ' + actionBtn(showMatchedPopup) + '"><i class="pi pi-check-circle text-xs"></i><span>Eşleşme Yapılanlar</span></button>' : '') +
          '<button type="button" data-act="edit" class="max-lg:hidden px-2.5 py-1 text-xs font-semibold border rounded-[2px] transition-all flex items-center gap-1 cursor-pointer ' + actionBtn(filterSwitch === 2) + '"><i class="pi pi-pencil text-xs"></i><span>' + (filterSwitch === 2 ? 'İptal' : 'Düzenle') + '</span></button>' +
          (filterSwitch === 2 ? '<button type="button" data-act="delete" class="max-lg:hidden px-2.5 py-1 text-xs font-semibold border border-rose-500 bg-rose-500 text-white rounded-[2px] transition-all flex items-center gap-1 cursor-pointer hover:bg-rose-600"><i class="pi pi-trash text-xs"></i><span>Sil</span></button>' : '') +
        '</div>',
      onShowFilters: show => { filterSwitch = show ? 1 : 0; table.renderActions(); },
      onRefresh: () => { pending = pendingRows(); table.reload(() => updateReportTotal()); },
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
    // Mobilde eşleştirme yok (yalnızca görüntüleme)
    if (!row || isMobile()) return;
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
  // Mobil kart: PDU - outlet ve IP için tek satırlık özet (ayrıntı dokununca pencerede açılır)
  const pduCard = r => {
    const list = pduOutletList(r);
    return list.length
      ? '<button type="button" data-pdu-pop="' + esc(r.rid) + '" class="w-full h-9 px-2.5 flex items-center justify-between gap-2 rounded-[3px] border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[12.5px] font-bold cursor-pointer active:bg-sky-100 dark:active:bg-sky-500/20">' +
          '<span class="flex items-center gap-1.5 min-w-0"><i class="pi pi-server text-[12px] shrink-0"></i><span class="truncate">' + list.length + ' PDU · ' + pduOutletCount(r) + ' outlet</span></span>' +
          '<span class="flex items-center gap-1 shrink-0 text-[11px] font-semibold opacity-80">Ayrıntı<i class="pi pi-chevron-right text-[9px]"></i></span></button>'
      : '<span class="italic text-slate-400 dark:text-slate-500 text-[11px]">N/A</span>';
  };
  const ipCard = r => {
    const ips = ipList(r);
    return ips.length
      ? '<button type="button" data-ip-pop="' + esc(r.rid) + '" class="w-full h-9 px-2.5 flex items-center justify-between gap-2 rounded-[3px] border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[12.5px] font-bold cursor-pointer active:bg-emerald-100 dark:active:bg-emerald-500/20">' +
          '<span class="flex items-center gap-1.5 min-w-0"><i class="pi pi-sitemap text-[12px] shrink-0"></i><span class="truncate font-mono">' + esc(ips[0]) + '</span>' +
            (ips.length > 1 ? '<span class="shrink-0 px-1.5 py-px rounded-full bg-emerald-600/15 text-[10.5px] font-bold">+' + (ips.length - 1) + '</span>' : '') + '</span>' +
          '<span class="flex items-center gap-1 shrink-0 text-[11px] font-semibold opacity-80">Ayrıntı<i class="pi pi-chevron-right text-[9px]"></i></span></button>'
      : '<span class="italic text-slate-400 dark:text-slate-500 text-[11px]">' + esc(conHost(r) || 'N/A') + '</span>';
  };
  const T2_COLUMNS = [
    { field: 'cdb_id', header: 'Müşteri ID', width: '85px', mobile: 'primary' },
    { field: 'erp_id', header: 'Hizmet No', width: '85px', mobile: 'meta' },
    { field: 'customer_name', header: 'Müşteri Adı', width: '135px', mobile: 'sub' },
    { field: 'energy_product_id', header: 'Enerji Ürün ID', width: '95px', mobile: 'meta' },
    { field: 'svc_desc', header: 'Paket Adı', width: '130px', mobile: 'secondary' },
    { field: 'svc_id', header: 'Servis ID', width: '85px', mobile: 'meta' },
    { field: 'pdu_outlet', header: 'PDU - Outlet Eşleştirmeleri', width: '170px', mobile: 'meta', mobileBlock: true, card: pduCard },
    { field: 'pdu_ip', header: 'PDU IP Adresleri', width: '140px', mobile: 'meta', mobileBlock: true, card: ipCard },
    { field: 'actions', header: 'Düzenle', width: '55px', desktopOnly: true }
  ];
  const matchedRows = () => store.cdb.filter(c => c.meter && c.meter !== 'null' && c.meter !== 'undefined');

  function mountMatched() {
    rootEl.className = 'h-full flex flex-col min-h-0 overflow-hidden';
    rootEl.innerHTML =
      kit.pageHeader({
        title: 'EŞLEŞTİRİLMİŞ MÜŞTERİ LİSTESİ',
        breadcrumbs: [{ label: 'İş Emirleri' }, { label: 'MÜŞTERİ EŞLEŞTİRME SAYFASI', href: 'customer-pages.html?tab=matching' }, { label: 'EŞLEŞTİRİLMİŞ MÜŞTERİ LİSTESİ' }],
        actions: ''
      }) +
      tabsBar() +
      '<div class="flex-1 min-h-0 overflow-hidden relative flex flex-col"><div class="dt-host" data-table></div></div>';
    const reportHost = mountReport({
      unit: 'müşteri', hint: 'Ekrandaki arama ve filtrelerle', total: () => table ? table.filteredRows().length : matchedRows().length, onExport: exportMatchedReport
    });
    table = DataTable(rootEl.querySelector('[data-table]'), {
      columns: T2_COLUMNS,
      rows: matchedRows,
      mobileCards: true,
      reportHost,
      onRender: updateReportTotal,
      search: params.get('q') || '',
      searchText: r => [r.customer_name, r.cdb_id, r.erp_id, r.energy_product_id, r.svc_id, r.svc_desc, r.meter, pduOutletPairsText(r), conHost(r)].join(' '),
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
      onRefresh: () => table.reload(() => updateReportTotal()),
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
    // Mobilde düzenleme yok (yalnızca görüntüleme)
    if (!row || isMobile()) return;
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
      row.meter = JSON.stringify(result.pduOutlets.filter(o => o.pduIp && o.outletNo && o.outletNo.length).map(o => ({ doc: o.doc || '', dev: o.pduIp, meter: o.outletNo.map(Number) })));
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
    if (open === 'report') {
      const btn = rootEl.querySelector('[data-rk-btn]');
      if (btn) btn.click();
      return;
    }
    if (tab === 'matching') {
      if (open === 'match' && pending.length) processRow(pending[0]);
      else if (open === 'matched') openMatchedPopup();
    } else {
      const first = table.filteredRows()[0] || matchedRows()[0];
      if (open === 'details' && first) openCustomerDetails(first);
      else if (open === 'edit' && first) editMatched(first);
    }
  }, 80);
})();
