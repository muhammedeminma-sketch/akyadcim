/* ==========================================================================
   DCIM Sunum — Import Hata Kayıtları (NewUICMPLnkFaildListComponent, /dcim/assets/lnk-faild-list)
   dbo.LNK_FAILD salt okunur listesi: başarısız LNK Excel import satırları.
   - Filtre paneli: Kategori (Tümü/DATA/PORT/SYSTEM), Import grubu (datalist), Asset (iki uç, tam eşleşme)
   - Durum şeridi: liste COUNT/MAX(faild_id) ile sabitlenir; "Yenile" yeniden sabitler
   - Tablo (app-data-table, sunucu sayfalı, 50 satır): arama kutusu = asset filtresi; "Rapor al" menüsü
   - Sayfa içi liste–detay (modal yok): kayıt, gerekçeler, konum gerekçesi + aday eşleşmeler,
     Excel uç değerleri, çözümlenen değerler, ham Excel hücreleri
   Veri: js/mock/lnk-failed.data.js (DCIM.data.lnkFailed) — kurgusal.

   Derin bağlantılar (orijinal query parametreleriyle aynı):
     ?category=DATA|PORT|SYSTEM      kategori filtresi
     ?group=<import_group>           import grubu filtresi
     ?asset=<asset_id>               asset filtresi (kaynak veya hedef uç, tam eşleşme)
     ?open=<faild_id> | ?open=first  ayrıntı panelini açar
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, button, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'lnk-failed' });

  const DATA = DCIM.data.lnkFailed || { rows: [], groups: [] };
  const CATEGORIES = ['PORT', 'DATA', 'SYSTEM'];
  const CATEGORY_OPTIONS = [{ value: '', label: 'Tümü' }, { value: 'DATA', label: 'DATA' }, { value: 'PORT', label: 'PORT' }, { value: 'SYSTEM', label: 'SYSTEM' }];
  const COLUMNS = [
    { field: 'faildId', header: 'ID', width: '64px', wrap: false },
    { field: 'createdAt', header: 'Zaman', minWidth: '120px' },
    { field: 'category', header: 'Kategori', width: '84px', wrap: false },
    { field: 'reasonCode', header: 'Neden / konum gerekçesi', minWidth: '260px' },
    { field: 'failedEnd', header: 'Uç', width: '80px', wrap: false },
    { field: 'lnkId', header: 'lnk_id', width: '72px', wrap: false },
    { field: 'srcAssetId', header: 'Kaynak uç (asset / port)', minWidth: '150px' },
    { field: 'dstAssetId', header: 'Hedef uç (asset / port)', minWidth: '150px' },
    { field: 'importGroup', header: 'Köken (import grubu / Excel)', minWidth: '220px' },
    { field: 'actions', header: ' ', width: '44px', wrap: false }
  ];

  // ---------------------------------------------------------------------------
  // Metin yardımcıları (lnk-faild.model.ts / lnk-faild-list.model.ts)
  // ---------------------------------------------------------------------------
  const failedEndText = v => ({ src: 'Kaynak uç', dst: 'Hedef uç', both: 'İki uç', row: 'Satır' }[v] || v || '—');
  const endText = v => ({ src: 'Kaynak', dst: 'Hedef', both: 'İki uç', row: 'Satır' }[v] || v || '—');
  const categoryText = v => ({ PORT: 'PORT — bağlantı yazıldı, port eşleşmedi', DATA: 'DATA — bağlantı yazılmadı', SYSTEM: 'SYSTEM — sistem/DB hatası' }[v] || v || '—');
  const categoryClass = v => ({ DATA: 'lf-cat-data', PORT: 'lf-cat-port', SYSTEM: 'lf-cat-system' }[v] || 'lf-cat-other');
  const candidateScopeText = v => ({ inside: 'kapsam içi', outside: 'kapsam dışı', unresolved: 'konum çözülemedi', conflict: 'LOC çelişkili' }[v] || v || '—');
  const asText = v => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

  function summaryFor(row) {
    if (!row.reason) {
      const t = row.reasonText || '';
      return t.length > 160 ? t.slice(0, 160) + '…' : t;
    }
    const issues = row.reason.issues || [];
    const main = issues.find(i => i.category === 'DATA' || i.category === 'PORT') || issues[0];
    if (!main) return '';
    const s = (main.end ? main.end + ': ' : '') + (main.detail || main.code);
    return s.length > 160 ? s.slice(0, 160) + '…' : s;
  }

  // ---------------------------------------------------------------------------
  // Durum + URL senkronu
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const state = {
    applied: { category: '', importGroup: '', assetId: '' },
    draft: null,
    filterError: '',
    loading: false,
    anchorMaxId: null,
    anchoredAt: '',
    total: null,
    page: 0,
    pageSize: 50,
    detailId: null
  };
  (function readUrl() {
    const cat = String(params.get('category') || '').toUpperCase();
    state.applied.category = CATEGORIES.indexOf(cat) >= 0 ? cat : '';
    state.applied.importGroup = String(params.get('group') || '').trim();
    state.applied.assetId = String(params.get('asset') || params.get('q') || '').trim();
    state.draft = Object.assign({}, state.applied);
  })();

  function writeUrl() {
    const p = new URLSearchParams();
    if (state.applied.category) p.set('category', state.applied.category);
    if (state.applied.importGroup) p.set('group', state.applied.importGroup);
    if (state.applied.assetId) p.set('asset', state.applied.assetId);
    if (state.detailId != null) p.set('open', String(state.detailId));
    const qs = p.toString();
    try { history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// */ }
  }

  function validate(f) {
    const category = String(f.category || '').trim().toUpperCase();
    const importGroup = String(f.importGroup || '').trim();
    const assetId = String(f.assetId || '').trim();
    const filter = { category: '', importGroup, assetId };
    if (category) {
      if (CATEGORIES.indexOf(category) < 0) return { ok: false, error: 'Kategori yalnız PORT, DATA veya SYSTEM olabilir.', filter };
      filter.category = category;
    }
    if (importGroup && (importGroup.length > 64 || !/^[A-Za-z0-9_.:\-]+$/.test(importGroup))) {
      return { ok: false, error: 'Import grubu en fazla 64 karakter; yalnız harf, rakam ve _ . : - içerebilir.', filter };
    }
    if (assetId && (assetId.length > 100 || /[\u0000-\u001f\u007f]/.test(assetId))) {
      return { ok: false, error: 'Asset kimliği en fazla 100 karakter olmalı ve kontrol karakteri içermemeli.', filter };
    }
    return { ok: true, error: '', filter };
  }

  // Sabitlenmiş (faild_id ≤ anchor) ve filtrelenmiş liste, faild_id DESC
  function filteredAll() {
    const f = state.applied;
    return DATA.rows.filter(r =>
      (state.anchorMaxId == null || r.faildId <= state.anchorMaxId) &&
      (!f.category || r.category === f.category) &&
      (!f.importGroup || r.importGroup === f.importGroup) &&
      (!f.assetId || r.srcAssetId === f.assetId || r.dstAssetId === f.assetId));
  }

  function anchor() {
    state.anchorMaxId = DATA.rows.reduce((m, r) => Math.max(m, r.faildId), 0);
    state.anchoredAt = new Date().toLocaleString('tr-TR');
    state.total = filteredAll().length;
    const last = Math.max(0, Math.ceil(state.total / state.pageSize) - 1);
    if (state.page > last) state.page = last;
  }

  function applyFilter(next) {
    const v = validate(next || state.draft);
    state.draft = Object.assign({}, v.filter);
    if (!v.ok) {
      state.filterError = v.error;
      renderFilter();
      renderTableBody();
      return;
    }
    state.filterError = '';
    state.applied = Object.assign({}, v.filter);
    state.page = 0;
    load();
  }

  // Sorgu taklidi: kısa yükleniyor durumu, sonra sayım + sabitleme + sayfa
  function load() {
    state.loading = true;
    renderAll();
    setTimeout(() => {
      state.loading = false;
      anchor();
      writeUrl();
      renderAll();
    }, 260);
  }

  // ---------------------------------------------------------------------------
  // Başlık
  // ---------------------------------------------------------------------------
  function renderHeader() {
    const actions = '<div class="flex items-center gap-2">' +
      (state.applied.assetId ? button({ variant: 'secondary', icon: 'pi pi-sitemap', label: 'Asset topolojisi', attrs: 'data-topology="' + esc(state.applied.assetId) + '"' }) : '') +
      button({ variant: 'secondary', icon: 'pi pi-refresh', label: 'Yenile', attrs: 'data-reload aria-label="Listeyi yeniden oku (yeni kayıtlar dahil edilir)"' + (state.loading ? ' disabled' : '') }) +
    '</div>';
    document.getElementById('lf-header').innerHTML = kit.pageHeader({
      title: 'Import Hata Kayıtları', badge: 'Salt okunur',
      breadcrumbs: [{ label: 'Varlık Yönetimi' }, { label: 'Import Hata Kayıtları' }],
      actions
    });
  }

  // ---------------------------------------------------------------------------
  // Filtre paneli
  // ---------------------------------------------------------------------------
  function renderFilter() {
    const a = state.applied;
    const d = state.draft;
    const hasActive = !!(a.category || a.importGroup || a.assetId);
    const chips = [];
    if (a.category) chips.push('<button type="button" class="lf-chip" data-clear-one="category" title="Kaldır">kategori = ' + esc(a.category) + ' <i class="pi pi-times"></i></button>');
    if (a.importGroup) chips.push('<button type="button" class="lf-chip" data-clear-one="importGroup" title="Kaldır">grup = ' + esc(a.importGroup) + ' <i class="pi pi-times"></i></button>');
    if (a.assetId) chips.push('<button type="button" class="lf-chip" data-clear-one="assetId" title="Kaldır">asset = ' + esc(a.assetId) + ' (iki uç) <i class="pi pi-times"></i></button>');
    document.getElementById('lf-filter').innerHTML =
      '<div class="flex flex-wrap items-end gap-3">' +
        '<div class="flex flex-col gap-1"><span class="lf-field-label">Kategori</span>' +
          '<div class="lf-segmented" role="group" aria-label="Kategori">' +
            CATEGORY_OPTIONS.map(c => '<button type="button" class="lf-segment' + (a.category === c.value ? ' is-on' : '') + '" data-cat="' + c.value + '"' + (state.loading ? ' disabled' : '') + '>' + c.label + '</button>').join('') +
          '</div></div>' +
        '<label class="flex flex-col gap-1 min-w-[14rem]"><span class="lf-field-label">Import grubu</span>' +
          '<input class="lf-field-input" name="importGroup" data-draft="importGroup" value="' + esc(d.importGroup) + '" list="lfGroups" maxlength="64" placeholder="ör. LNKIMP-local-..." />' +
          '<datalist id="lfGroups">' + DATA.groups.map(g => '<option value="' + esc(g.importGroup) + '">' + g.count + ' kayıt</option>').join('') + '</datalist>' +
        '</label>' +
        '<label class="flex flex-col gap-1 min-w-[12rem]"><span class="lf-field-label">Asset (kaynak veya hedef uç)</span>' +
          '<input class="lf-field-input" name="assetId" data-draft="assetId" value="' + esc(d.assetId) + '" maxlength="100" placeholder="asset_id (tam eşleşme)" />' +
        '</label>' +
        '<div class="flex items-center gap-2 pb-px">' +
          button({ variant: 'primary', icon: 'pi pi-filter', label: 'Uygula', attrs: 'type="submit"' + (state.loading ? ' disabled' : '') }).replace('type="button" ', '') +
          button({ variant: 'secondary', icon: 'pi pi-filter-slash', label: 'Temizle', attrs: 'data-clear' + (state.loading ? ' disabled' : '') }) +
        '</div>' +
      '</div>' +
      (hasActive || state.filterError
        ? '<div class="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">' +
            (hasActive ? '<span class="text-slate-500 dark:text-slate-400 font-semibold">Uygulanan:</span>' : '') + chips.join('') +
            (a.assetId ? '<span class="text-slate-400">Asset filtresi asset içermeyen DATA/SYSTEM kayıtlarını gizler; tümü için filtreyi kaldırın.</span>' : '') +
            (state.filterError ? '<span class="text-rose-600 dark:text-rose-400 font-semibold">' + esc(state.filterError) + '</span>' : '') +
          '</div>'
        : '');
  }

  // ---------------------------------------------------------------------------
  // Durum şeridi
  // ---------------------------------------------------------------------------
  function rangeText() {
    if (!state.total) return '';
    const from = state.page * state.pageSize + 1;
    const to = Math.min(state.total, from + state.pageSize - 1);
    return from + '–' + to + ' / ' + state.total;
  }
  function renderStatus() {
    const el = document.getElementById('lf-status');
    if (state.loading || state.total == null) {
      el.innerHTML = '<span><i class="pi pi-spin pi-spinner text-sky-600 dark:text-sky-400"></i>Sayım ve sabitleme sorgusu çalışıyor…</span>';
      return;
    }
    let h = '';
    if (state.total === 0) {
      h += '<span class="text-slate-700 dark:text-slate-200 font-semibold"><i class="pi pi-check-circle text-emerald-500"></i>Bu filtreye uyan LNK_FAILD kaydı yok (sayım sorgusu 0 döndürdü, ' + esc(state.anchoredAt) + ').</span>';
    } else {
      h += '<span><i class="pi pi-lock text-sky-600 dark:text-sky-400"></i>Liste ' + esc(state.anchoredAt) + ' itibarıyla sabitlendi (faild_id ≤ ' + state.anchorMaxId + '); yeni kayıtlar için Yenile.</span>' +
        '<span class="font-mono">Gösterilen ' + rangeText() + '</span>';
    }
    h += '<span class="text-slate-400">Tablo arama kutusu asset kimliğine göre (iki uç, tam eşleşme) sunucuda filtreler.</span>';
    el.innerHTML = h;
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table, sunucu sayfalı)
  // ---------------------------------------------------------------------------
  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');
  let reportMenuMounted = false;

  function renderTableShell() {
    const host = document.getElementById('lf-table');
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Asset kimliği (iki uç, tam eşleşme)" value="' + esc(state.applied.assetId) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<div data-report-menu></div>' +
          '<button type="button" data-table-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs"><tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
            COLUMNS.map(c => '<th class="py-2 px-2 text-left font-bold bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '">' + esc(c.header) + '</th>').join('') +
          '</tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0" data-footer></div>';

    DCIM.report.menu(host.querySelector('[data-report-menu]'), {
      label: 'Rapor al',
      scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki kategori, grup ve asset filtreleriyle' }],
      options: 'dateRange', defaultPreset: '90d', inTable: true,
      onExport: exportReport
    });
    reportMenuMounted = true;

    let timer = null;
    const search = host.querySelector('[data-search]');
    search.addEventListener('input', () => {
      clearTimeout(timer);
      const ctx = JSON.stringify(state.applied);
      timer = setTimeout(() => {
        if (ctx !== JSON.stringify(state.applied)) return;
        const value = search.value.trim();
        if (value === (state.applied.assetId || '')) return;
        applyFilter(Object.assign({}, state.applied, { assetId: value }));
      }, 500);
    });
    host.querySelector('[data-table-refresh]').addEventListener('click', () => { if (!state.filterError) load(); });
    host.querySelector('[data-tbody]').addEventListener('click', onBodyClick);
  }

  function endpointCell(asset, port) {
    return (asset
      ? '<div class="flex items-center gap-1 min-w-0"><button type="button" class="lf-link truncate" data-filter-asset="' + esc(asset) + '" title="Bu asset\'e göre filtrele (iki uç)">' + esc(asset) + '</button>' +
        '<button type="button" class="lf-icon-btn" data-topology="' + esc(asset) + '" title="Bu asset\'in topolojisini aç"><i class="pi pi-sitemap"></i></button></div>'
      : '<div class="text-slate-400 italic text-[10px]">asset çözülmedi</div>') +
      '<div class="lf-port' + (port ? '' : ' is-missing') + '" title="' + (port ? 'CAT port kimliği' : 'CAT port kimliği yok (NULL)') + '">' + esc(port || 'port id yok') + '</div>';
  }

  function cell(c, r) {
    switch (c.field) {
      case 'faildId': return '<span class="font-mono font-bold' + (state.detailId === r.faildId ? ' text-sky-600' : '') + '">' + r.faildId + '</span>';
      case 'createdAt': return '<span class="font-mono text-[10px] text-slate-600 dark:text-slate-300">' + esc(r.createdAt || '—') + '</span>';
      case 'category': return '<span class="lf-cat ' + categoryClass(r.category) + '" title="' + esc(categoryText(r.category)) + '">' + esc(r.category || '—') + '</span>';
      case 'reasonCode': {
        const s = summaryFor(r);
        return '<div class="min-w-0"><div class="font-mono font-bold text-[10px] text-slate-800 dark:text-slate-100">' + esc(r.reasonCode || '—') + '</div>' +
          '<div class="lf-reason-summary" title="' + esc(s) + '">' + esc(s) + '</div></div>';
      }
      case 'failedEnd': return '<span class="lf-end">' + esc(failedEndText(r.failedEnd)) + '</span>';
      case 'lnkId': return r.lnkId != null ? '<span class="font-mono" title="Bağlantı LNK\'ye yazıldı (PORT kaydı)">' + r.lnkId + '</span>' : '<span class="text-slate-400" title="Bağlantı LNK\'ye yazılmadı">—</span>';
      case 'srcAssetId': return endpointCell(r.srcAssetId, r.srcPortId);
      case 'dstAssetId': return endpointCell(r.dstAssetId, r.dstPortId);
      case 'importGroup':
        return '<div class="min-w-0 text-[10px] leading-snug">' +
          (r.importGroup ? '<button type="button" class="lf-link truncate block max-w-full" data-filter-group="' + esc(r.importGroup) + '" title="Bu import grubuna göre filtrele">' + esc(r.importGroup) + '</button>' : '') +
          '<div class="text-slate-500 dark:text-slate-400 truncate" title="' + esc(r.sourceFile + ' · ' + r.sourceSheet) + '">' + esc(r.sourceFile) + ' · ' + esc(r.sourceSheet) + '</div>' +
          '<div class="text-slate-500 dark:text-slate-400">satır ' + (r.sourceRowNo != null ? r.sourceRowNo : '—') + ' · kayıt ' + (r.sourceRecordNo != null ? r.sourceRecordNo : '—') + '</div></div>';
      case 'actions': return '<button type="button" class="lf-icon-btn" data-detail="' + r.faildId + '" title="Ayrıntı"><i class="pi pi-eye"></i></button>';
      default: return '';
    }
  }

  function pageRows() {
    const all = filteredAll();
    return all.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
  }

  function renderTableBody() {
    const host = document.getElementById('lf-table');
    const tbody = host.querySelector('[data-tbody]');
    const footer = host.querySelector('[data-footer]');
    const span = COLUMNS.length;
    if (state.filterError) {
      tbody.innerHTML = '<tr><td colspan="' + span + '" class="p-8 text-center text-rose-600 dark:text-rose-400"><i class="pi pi-exclamation-triangle text-2xl mb-1 block"></i><span class="font-semibold">Filtre geçersiz; sorgu gönderilmedi. ' + esc(state.filterError) + '</span></td></tr>';
      footer.innerHTML = '';
      return;
    }
    if (state.loading || state.total == null) {
      tbody.innerHTML = '<tr><td colspan="' + span + '" class="p-8 text-center text-slate-400"><i class="pi pi-spin pi-spinner text-2xl mb-1 block text-sky-500"></i><span class="italic">Yükleniyor…</span></td></tr>';
    } else {
      const rows = pageRows();
      tbody.innerHTML = rows.length
        ? rows.map(r => '<tr data-row="' + r.faildId + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (state.detailId === r.faildId ? ' lf-row-on' : '') + '">' +
            COLUMNS.map(c => '<td class="py-1.5 px-2 text-[11px] align-top ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, r) + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + span + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Bu filtreye uyan LNK_FAILD kaydı yok.</span></td></tr>';
    }
    const total = state.total || 0;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    const pageNo = state.page + 1;
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam Kayıt: <span class="font-bold text-slate-900 dark:text-slate-100">' + total + '</span></div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="-1"' + (pageNo <= 1 ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + pageNo + ' / ' + pages + '</span>' +
          '<button type="button" data-page="1"' + (pageNo >= pages ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
    footer.querySelector('[data-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10) || 50; state.page = 0; renderStatus(); renderTableBody(); });
    footer.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
      state.page = Math.max(0, Math.min(pages - 1, state.page + parseInt(b.getAttribute('data-page'), 10)));
      renderStatus(); renderTableBody();
      host.querySelector('[data-scroll]').scrollTop = 0;
    }));
  }

  function onBodyClick(e) {
    const fa = e.target.closest('[data-filter-asset]');
    if (fa) { e.stopPropagation(); return applyFilter(Object.assign({}, state.applied, { assetId: fa.getAttribute('data-filter-asset') })); }
    const fg = e.target.closest('[data-filter-group]');
    if (fg) { e.stopPropagation(); return applyFilter(Object.assign({}, state.applied, { importGroup: fg.getAttribute('data-filter-group') })); }
    const tp = e.target.closest('[data-topology]');
    if (tp) { e.stopPropagation(); return openTopology(tp.getAttribute('data-topology')); }
    const row = e.target.closest('[data-row]') || e.target.closest('[data-detail]');
    if (row) openDetail(Number(row.getAttribute('data-row') || row.getAttribute('data-detail')));
  }

  // Orijinal /dcim/assets/network-topology/<asset> (category/group bağlamıyla) — sunumda yok
  function openTopology(asset) {
    if (!asset) return;
    toast('Asset topolojisi (' + asset + ') bu sunumda hazır değil; orijinalde ağ topolojisi ekranı category/group bağlamıyla açılır.', 'info', 'Asset topolojisi');
  }

  // ---------------------------------------------------------------------------
  // Ayrıntı paneli (sayfa içi bölge; HTML çalıştırılmaz)
  // ---------------------------------------------------------------------------
  let detailTimer = null;
  function openDetail(id) {
    if (!Number.isSafeInteger(id)) return;
    if (state.detailId === id && !state.detailLoading) return;
    state.detailId = id;
    state.detailLoading = true;
    writeUrl();
    renderDetail();
    renderTableBody();
    clearTimeout(detailTimer);
    detailTimer = setTimeout(() => { state.detailLoading = false; renderDetail(); }, 180);
  }
  function closeDetail() {
    state.detailId = null;
    state.detailLoading = false;
    writeUrl();
    renderDetail();
    renderTableBody();
  }

  const kv = pairs => '<dl class="lf-kv">' + pairs.map(p => '<dt' + (p[2] ? ' class="font-mono"' : '') + '>' + esc(p[0]) + '</dt><dd' + (p[3] ? ' class="' + p[3] + '"' : '') + '>' + p[1] + '</dd>').join('') + '</dl>';
  const grid = (heads, rows) => '<table class="lf-grid"><thead><tr>' + heads.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  const td = (v, cls) => '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + v + '</td>';
  const nv = v => (v == null || v === '' ? '—' : esc(v));

  function renderDetail() {
    const panel = document.getElementById('lf-detail');
    const ws = document.getElementById('lf-workspace');
    const open = state.detailId != null;
    panel.classList.toggle('hidden', !open);
    ws.classList.toggle('has-detail', open);
    if (!open) { panel.innerHTML = ''; return; }
    const d = DATA.rows.find(r => r.faildId === state.detailId);
    let body;
    if (state.detailLoading) body = '<div class="lf-detail-state"><i class="pi pi-spin pi-spinner"></i> Ayrıntı okunuyor…</div>';
    else if (!d) body = '<div class="lf-detail-state lf-warn">Ayrıntı için yanıt alınamadı (zaman aşımı, bağlantı sorunu veya kayıt artık yok; ayırt edilemez).</div>';
    else body = detailBody(d);
    panel.innerHTML =
      '<header class="lf-detail-header">' +
        '<div class="flex items-center gap-2 min-w-0"><div class="lf-detail-icon"><i class="pi pi-exclamation-circle"></i></div>' +
          '<div class="min-w-0"><h3 id="lfDetailTitle" class="text-xs font-extrabold text-slate-900 dark:text-slate-100">LNK_FAILD #' + state.detailId + ' ayrıntısı</h3>' +
          '<p class="text-[10px] text-slate-500 dark:text-slate-400">Salt okunur · listeden başka satır seçerek değiştirin</p></div></div>' +
        button({ variant: 'secondary', size: 'sm', icon: 'pi pi-times', label: 'Kapat', attrs: 'data-detail-close aria-label="Ayrıntı panelini kapat"' }) +
      '</header>' +
      '<div class="lf-detail-body">' + body + '</div>';
  }

  function detailBody(d) {
    const r = d.reason;
    let h = '<section class="lf-section"><h4>Kayıt</h4>' + kv([
      ['Kategori', '<span class="lf-cat ' + categoryClass(d.category) + '">' + esc(d.category || '—') + '</span> ' + esc(categoryText(d.category))],
      ['Neden kodu', esc(d.reasonCode || '—'), false, 'font-mono'],
      ['Uç', esc(failedEndText(d.failedEnd))],
      ['lnk_id', d.lnkId != null ? String(d.lnkId) : '— (LNK yazılmadı)'],
      ['Zaman', esc(d.createdAt || '—'), false, 'font-mono'],
      ['Import grubu', esc(d.importGroup || '—'), false, 'break-all'],
      ['Excel kökeni', esc(d.sourceFile) + ' · sheet ' + esc(d.sourceSheet) + ' · satır ' + (d.sourceRowNo != null ? d.sourceRowNo : '—') + ' · kayıt ' + (d.sourceRecordNo != null ? d.sourceRecordNo : '—')],
      ['Dosya SHA-256', esc(d.sourceSha256 || '—'), false, 'font-mono break-all'],
      ['Kaynak uç', 'asm ' + nv(d.srcAsmId) + ' · asset ' + nv(d.srcAssetId) + ' · port ' + esc(d.srcPortId || 'yok')],
      ['Hedef uç', 'asm ' + nv(d.dstAsmId) + ' · asset ' + nv(d.dstAssetId) + ' · port ' + esc(d.dstPortId || 'yok')]
    ]) + '</section>';

    // Gerekçeler
    h += '<section class="lf-section"><h4>Gerekçeler</h4>';
    if (r) {
      const issues = r.issues || [];
      h += issues.length
        ? grid(['Kod', 'Kategori', 'Uç', 'Ayrıntı'], issues.map(i => '<tr>' + td(esc(i.code), 'font-mono') + td(esc(i.category)) + td(esc(endText(i.end))) + td(esc(i.detail), 'wrap') + '</tr>'))
        : '<div class="lf-muted">Gerekçe listesi boş.</div>';
      const related = [];
      if (r.related_lnk_ids && r.related_lnk_ids.length) related.push('İlgili lnk_id: ' + r.related_lnk_ids.join(', '));
      if (r.related_sheet_rows && r.related_sheet_rows.length) related.push('İlgili sheet satırları: ' + r.related_sheet_rows.join(', '));
      if (r.system_error) related.push('Sistem hatası: ' + asText(r.system_error.stage) + ' ' + asText(r.system_error.code));
      if (related.length) h += '<div class="lf-muted mt-1">' + esc(related.join(' · ')) + '</div>';
    } else {
      h += '<div class="lf-warn">reason_detail JSON olarak çözümlenemedi; ham metin (çalıştırılmaz):</div><pre class="lf-raw">' + esc(d.reasonText || '') + '</pre>';
    }
    h += '</section>';

    // Konum gerekçesi
    if (r && (r.location_scope || r.candidates)) {
      h += '<section class="lf-section"><h4>Konum gerekçesi</h4>';
      const s = r.location_scope;
      if (s) {
        h += kv([
          ['Kapsam modu', esc(s.mode === 'site' ? 'açık site: ' + s.site_location_id : s.mode === 'all' ? 'tüm tesisler' : (s.mode || '—'))],
          ['Excel KAT / SALON', esc((s.kat || '—') + ' / ' + (s.salon || '—'))],
          ['Kaynak uç kapsamı', esc(s.src_scope || 'Excel KAT/SALON salon yolları (eski kayıt: uç ayrımı yok)')],
          ['Hedef uç kapsamı', esc(s.dst_scope || 'kayıtta yok (TASK-004 öncesi importer: hedef de KAT/SALON ile sınırlıydı)')],
          ['Salon yolları', '<span>' + (s.salon_path_count || 0) + ' yol</span>' +
            ((s.salon_paths || []).length ? '<ul class="lf-path-list">' + s.salon_paths.map(p => '<li class="font-mono break-all">' + esc(p) + '</li>').join('') + '</ul>' : '')]
        ]);
      }
      Object.keys(r.candidates || {}).forEach(end => {
        const c = r.candidates[end];
        h += '<div class="lf-cand">' +
          '<div class="lf-cand-head"><span class="lf-end">' + esc(endText(end)) + '</span><span class="font-mono font-bold">' + esc(c.device || '—') + '</span><span class="lf-muted">' + esc(c.scope) + '</span></div>' +
          '<div class="lf-cand-counts"><span>toplam ' + (c.total || 0) + '</span><span class="cnt-in">kapsam içi ' + (c.in_scope || 0) + '</span><span>kapsam dışı ' + (c.outside_scope || 0) + '</span>' +
            '<span class="cnt-warn">konum çözülemedi ' + (c.location_unresolved || 0) + '</span><span class="cnt-warn">LOC çelişkili ' + (c.location_conflict || 0) + '</span></div>' +
          ((c.listed || []).length
            ? grid(['asm_id', 'asset_id', 'Konum', 'Sınıf'], c.listed.map(a => '<tr>' + td(esc(a.asm_id), 'font-mono') + td(esc(a.asset_id || '—'), 'font-mono') +
                td(esc(a.location_full_name || a.location_id || '—') + (a.note ? '<span class="lf-muted"> · ' + esc(a.note) + '</span>' : ''), 'wrap') + td(esc(candidateScopeText(a.scope))) + '</tr>'))
            : '') +
          '<div class="lf-muted">Birden fazla aday varsa importer hiçbirini seçmez (keyfi seçim yok).</div>' +
        '</div>';
      });
      h += '</section>';
    }

    // Excel uç değerleri
    if (r && r.excel && Object.keys(r.excel).length) {
      h += '<section class="lf-section"><h4>Excel uç değerleri</h4>' + kv(Object.keys(r.excel).map(k => [k, esc(asText(r.excel[k])) || '<span class="lf-muted">(boş)</span>', true, 'break-all'])) + '</section>';
    }
    // Çözümlenen değerler
    if (r && r.resolved) {
      const res = [];
      ['src', 'dst'].forEach(end => { const p = r.resolved[end]; if (p) Object.keys(p).forEach(k => res.push('<tr>' + td(esc(endText(end))) + td(esc(k), 'font-mono') + td(p[k] == null ? 'NULL' : esc(asText(p[k])), 'wrap' + (p[k] == null ? ' is-empty' : '')) + '</tr>')); });
      if (res.length) h += '<section class="lf-section"><h4>Çözümlenen değerler</h4>' + grid(['Uç', 'Alan', 'Değer'], res) + '</section>';
    }
    // Ham Excel hücreleri
    h += '<section class="lf-section"><h4>Ham Excel hücreleri</h4>';
    if (d.raw) {
      h += '<div class="lf-muted mb-1">sheet satırı ' + d.sourceRowNo + ' · kayıt ' + d.sourceRecordNo + '</div>' +
        grid(['Kolon', 'Grup', 'Başlık', 'Değer'], d.raw.cells.map(c => '<tr>' + td(esc(c.col), 'font-mono') + td(esc(c.group)) + td(esc(c.header)) + td(c.value === '' ? '(boş)' : esc(c.value), 'wrap lf-pre-wrap' + (c.value === '' ? ' is-empty' : '')) + '</tr>'));
      if (d.raw.extra_cells) h += '<div class="mt-1">' + grid(['Başlıksız kolon', 'Değer'], Object.keys(d.raw.extra_cells).map(k => '<tr>' + td(esc(k), 'font-mono') + td(esc(d.raw.extra_cells[k]), 'wrap lf-pre-wrap') + '</tr>')) + '</div>';
    } else {
      h += '<div class="lf-warn">raw_cells JSON olarak çözümlenemedi; ham metin (çalıştırılmaz):</div><pre class="lf-raw">' + esc(d.rawText || '') + '</pre>';
    }
    h += '</section>';

    h += '<footer class="lf-detail-actions">' +
      (d.srcAssetId ? button({ variant: 'secondary', size: 'sm', icon: 'pi pi-sitemap', label: 'Kaynak topoloji', attrs: 'data-topology="' + esc(d.srcAssetId) + '"' }) : '') +
      (d.dstAssetId ? button({ variant: 'secondary', size: 'sm', icon: 'pi pi-sitemap', label: 'Hedef topoloji', attrs: 'data-topology="' + esc(d.dstAssetId) + '"' }) : '') +
    '</footer>';
    return h;
  }

  // ---------------------------------------------------------------------------
  // Rapor: uygulanan filtre + sabitlenmiş liste, seçilen tarih aralığı
  // ---------------------------------------------------------------------------
  function exportReport(req) {
    if (state.anchorMaxId == null) return;
    const all = filteredAll().map(r => Object.assign({}, r, { _t: new Date(r.createdAt.replace(' ', 'T')) }));
    const rows = DCIM.report.applyRange(all, req, '_t');
    const count = c => rows.filter(r => r.category === c).length;
    const a = state.applied;
    const filters = [a.category ? 'kategori: ' + a.category : '', a.importGroup ? 'grup: ' + a.importGroup : '', a.assetId ? 'asset: ' + a.assetId + ' (iki uç)' : ''].filter(Boolean);
    DCIM.report.generate({
      title: 'Import Hata Kayıtları Raporu',
      subtitle: (filters.length ? 'Filtre: ' + filters.join(', ') : 'Tüm kayıtlar') + ' · Varlık Yönetimi · LNK_FAILD · liste ' + state.anchoredAt + ' itibarıyla (faild_id ≤ ' + state.anchorMaxId + ')',
      filename: 'Import_Hata_Kayitlari',
      kpis: [
        { label: 'Kayıt', value: rows.length, tone: 'info' },
        { label: 'DATA', value: count('DATA'), tone: 'alarm' },
        { label: 'PORT', value: count('PORT'), tone: 'warning' },
        { label: 'SYSTEM', value: count('SYSTEM'), tone: 'lost' }
      ],
      sections: [{
        title: 'Import hata kayıtları',
        columns: [
          { key: 'id', label: 'ID', align: 'right' }, { key: 'time', label: 'Zaman' }, { key: 'cat', label: 'Kategori' }, { key: 'code', label: 'Neden kodu' },
          { key: 'why', label: 'Gerekçe' }, { key: 'end', label: 'Uç' }, { key: 'lnk', label: 'lnk_id', align: 'right' }, { key: 'src', label: 'Kaynak uç' },
          { key: 'dst', label: 'Hedef uç' }, { key: 'grp', label: 'Import grubu' }, { key: 'origin', label: 'Excel kökeni' }
        ],
        rows: rows.map(r => ({
          id: r.faildId, time: r.createdAt, cat: r.category, code: r.reasonCode, why: summaryFor(r), end: failedEndText(r.failedEnd), lnk: r.lnkId != null ? r.lnkId : '',
          src: [r.srcAssetId, r.srcPortId].filter(Boolean).join(' / '), dst: [r.dstAssetId, r.dstPortId].filter(Boolean).join(' / '), grp: r.importGroup,
          origin: r.sourceFile + ' · ' + r.sourceSheet + ' · satır ' + (r.sourceRowNo != null ? r.sourceRowNo : '—') + ' · kayıt ' + (r.sourceRecordNo != null ? r.sourceRecordNo : '—'),
          tone: r.category === 'DATA' ? 'alarm' : r.category === 'PORT' ? 'warning' : 'lost'
        })),
        toneKey: 'tone'
      }],
      notes: ['Salt okunur liste; DATA kayıtlarında bağlantı LNK\'ye yazılmadı, PORT kayıtlarında bağlantı yazıldı ancak port eşleşmedi.']
    }, req.format);
  }

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderHeader();
    renderFilter();
    renderStatus();
    renderTableBody();
    const s = document.querySelector('#lf-table [data-search]');
    if (s && document.activeElement !== s) s.value = state.applied.assetId || '';
  }

  document.getElementById('lf-header').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-reload')) { if (!state.filterError) load(); return; }
    if (b.hasAttribute('data-topology')) openTopology(b.getAttribute('data-topology'));
  });
  const form = document.getElementById('lf-filter');
  form.addEventListener('submit', e => { e.preventDefault(); applyFilter(state.draft); });
  form.addEventListener('input', e => {
    const k = e.target.getAttribute('data-draft');
    if (k) state.draft[k] = e.target.value;
  });
  form.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-cat')) return applyFilter(Object.assign({}, state.applied, { category: b.getAttribute('data-cat') }));
    if (b.hasAttribute('data-clear')) return applyFilter({ category: '', importGroup: '', assetId: '' });
    const one = b.getAttribute('data-clear-one');
    if (one) { const next = Object.assign({}, state.applied); next[one] = ''; applyFilter(next); }
  });
  const detail = document.getElementById('lf-detail');
  detail.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-detail-close')) return closeDetail();
    if (b.hasAttribute('data-topology')) openTopology(b.getAttribute('data-topology'));
  });
  detail.addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  // İlk açılış
  renderTableShell();
  const v = validate(state.applied);
  if (!v.ok) { state.filterError = v.error; renderHeader(); renderFilter(); renderStatus(); renderTableBody(); }
  else {
    anchor();
    const open = params.get('open');
    if (open) {
      const first = filteredAll()[0];
      const id = open === 'first' ? (first && first.faildId) : Number(open);
      if (id) {
        const idx = filteredAll().findIndex(r => r.faildId === id);
        if (idx >= 0) state.page = Math.floor(idx / state.pageSize);
        state.detailId = id;
      }
    }
    writeUrl();
    renderAll();
    renderDetail();
    if (reportMenuMounted && state.detailId != null) renderTableBody();
  }
})();
