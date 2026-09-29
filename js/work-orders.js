/* ==========================================================================
   DCIM Sunum — İş Emirleri (NewUICMPWorkOrdersComponent)
   Kaynak: new-ui/pages/work-orders/work-orders.component.{html,ts,scss}
     + app-data-table (AppDataTableComponent): arama, hızlı filtre, kolon filtreleri, sıralama,
       sayfalama (page_rng = 15), seçim, kolon görünürlüğü, Online rozeti, yenile
     + WorkOrderDetailsComponent   (İş Emri Numarası → detay penceresi, not güncelleme, PDF)
     + WorkOrderStaComponent       (durum rozeti → durum akış diyagramı + zorunlu açıklama)
     + WorkOrderReportPopupComponent (Rapor → tarih aralığı, PDF / Excel)
   Veri: DCIM.data.workOrders.list (js/mock/work-orders.data.js) — doc('WOR/S00')/id('WOR_List')/item.
   Sunum ekleri (orijinalde yok): durum özet kartları, Öncelik / Atanan Teknisyen / Termin Tarihi
     kolonları, "Yeni İş Emri Oluştur" formu, satıra tıklayınca detay, arama kutusunun istemci tarafı
     çalışması, detayda kabin / ekipman derin bağlantıları.
   Derin bağlantılar:
     ?q=<metin>          arama kutusunu doldurur            (work-orders.html?q=1AV42)
     ?sta=<0x030N>       hızlı durum filtresi               (work-orders.html?sta=0x0303)
     ?kpi=open|progress|waiting|done   özet kartı filtresi  (work-orders.html?kpi=waiting)
     ?open=<rid|kabin|ekipman>  detay penceresini açar      (work-orders.html?open=1AV42)
     ?status=<rid|kabin|ekipman> durum işlemi penceresini açar (work-orders.html?status=KLIMA%20109)
     ?new=1              Yeni İş Emri formunu açar
     ?report=1           Rapor penceresini açar
     ?cols=all           gizli (varsayılanda kapalı) kolonları da gösterir
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateKey, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'work-orders' });

  const WO = DCIM.data.workOrders;
  const LIST = WO.list;
  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------------------
  // Sözlükler (messages.tr.json → workOrderPages / workOrderSta / workOrderDetails)
  // ---------------------------------------------------------------------------
  // NewUICMPWorkOrdersComponent.staList — getStaText: staList[val + 1]
  const STA_LIST = [
    { value: 'all', label: 'Tüm Durumlar' },
    { value: '16', label: 'İPTAL' },
    { value: '0x0301', label: 'YENİ' },
    { value: '0x0302', label: 'PLANLANIYOR' },
    { value: '0x0303', label: 'İŞLİYOR-NORMAL' },
    { value: '0x0304', label: 'TAMAMLANDI' },
    { value: '0x0305', label: 'DURDU-İK' },
    { value: '0x0306', label: 'BEKLİYOR-UYARI' }
  ];
  // WorkOrderDetailsComponent.staList (0x0300 … 0x030F)
  const STA_FULL = ['İPTAL', 'YENİ', 'PLANLANIYOR', 'İŞLİYOR-NORMAL', 'TAMAMLANDI', 'DURDU-İK', 'BEKLİYOR-UYARI', 'İŞLİYOR-UYARI',
    'BAŞARISIZ-ALARM', 'DURDU-TEDARİK', 'BEKLİYOR-ALARM', 'İŞLİYOR-ALARM', 'BAŞARISIZ-KRİZ', 'DURDU-ARIZA', 'BEKLİYOR-KRİZ', 'İŞLİYOR-KRİZ'];
  const QUICK = [
    { label: 'Tüm Durumlar', value: 'all' },
    { label: 'YENİ', value: '0x0301' },
    { label: 'PLANLANIYOR', value: '0x0302' },
    { label: 'İŞLİYOR-NORMAL', value: '0x0303' },
    { label: 'BEKLİYOR-UYARI', value: '0x0306' },
    { label: 'TAMAMLANDI', value: '0x0304' },
    { label: 'DURDU-İK', value: '0x0305' }
  ];
  const STA_FLOW = { 0: 'İPTAL', 1: 'YENİ', 2: 'PLANLA', 3: 'İŞLE', 4: 'TAMAMLANDI', 5: 'DUR-İK', 6: 'BEKLE' };

  // Öncelik (sunum eki) — alarm şiddet rozetleriyle aynı görsel dil
  const PRIORITY = {
    critical: { label: 'Kritik', rank: 4, cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/40', dot: 'bg-rose-500' },
    high: { label: 'Yüksek', rank: 3, cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/40', dot: 'bg-orange-500' },
    medium: { label: 'Orta', rank: 2, cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40', dot: 'bg-amber-500' },
    low: { label: 'Düşük', rank: 1, cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40', dot: 'bg-sky-500' }
  };

  // Özet kartı grupları (sunum eki): durum numarası (sta & 0x000F) kümeleri
  const KPI = [
    { key: 'open', label: 'Açık', icon: 'pi pi-inbox', color: 'sky', nos: [1, 2], sub: 'Yeni + Planlanıyor' },
    { key: 'progress', label: 'Devam Eden', icon: 'pi pi-cog', color: 'emerald', nos: [3], sub: 'İşliyor-Normal' },
    { key: 'waiting', label: 'Beklemede', icon: 'pi pi-pause-circle', color: 'amber', nos: [5, 6], sub: 'Bekliyor-Uyarı + Durdu-İK' },
    { key: 'done', label: 'Tamamlanan', icon: 'pi pi-check-circle', color: 'green', nos: [4], sub: 'Tamamlandı' }
  ];
  const KPI_COLORS = {
    sky: { on: 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/25', txt: 'text-sky-600 dark:text-sky-400', num: 'text-sky-600 dark:text-sky-300' },
    emerald: { on: 'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/25', txt: 'text-emerald-600 dark:text-emerald-400', num: 'text-emerald-600 dark:text-emerald-300' },
    amber: { on: 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/25', txt: 'text-amber-600 dark:text-amber-400', num: 'text-amber-600 dark:text-amber-300' },
    green: { on: 'border-green-500/60 bg-green-50 dark:bg-green-950/25', txt: 'text-green-600 dark:text-green-400', num: 'text-green-600 dark:text-green-300' }
  };

  // ---------------------------------------------------------------------------
  // TS yardımcılarının portu
  // ---------------------------------------------------------------------------
  const getClassNo = sta => (sta === undefined || sta === null ? -1 : Number(sta) & 0x000f);
  const getStaText = sta => (STA_LIST[getClassNo(sta) + 1] || STA_LIST[0]).label;
  const pad = n => String(n).padStart(2, '0');
  // sta-c{no} rozet / sta-r{no} satır sınıfları (css/work-orders.css)
  const staC = n => 'sta-c' + n;
  const staR = n => 'sta-r' + n;
  function formatDate(v) {
    if (!v) return '-';
    const d = v instanceof Date ? v : new Date(String(v).replace(' ', 'T'));
    if (isNaN(d.getTime())) return '-';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  const formatDateSec = v => (v ? formatDate(v) + ':' + pad(new Date(v).getSeconds()) : '-');
  function parseJsonObj(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v) || {}; } catch (e) { return {}; }
  }
  function getLastJsonValue(v) {
    if (!v) return '';
    let obj;
    if (typeof v === 'string') { try { obj = JSON.parse(v); } catch (e) { return v; } } else obj = v;
    const keys = Object.keys(obj || {});
    return keys.length ? obj[keys[keys.length - 1]] || '' : '';
  }
  function calculateElapsedTime(w) {
    if (!w || !w.tim_open) return '-';
    const open = new Date(w.tim_open);
    const end = getClassNo(w.sta) === 4 && w.tim_end ? new Date(w.tim_end) : new Date();
    const diff = end.getTime() - open.getTime();
    if (diff < 0) return '---';
    const mins = Math.floor(diff / 60000);
    return Math.floor(mins / 1440) + ' gün, ' + Math.floor((mins % 1440) / 60) + ' saat, ' + (mins % 60) + ' dakika';
  }

  // mapTableRows() karşılığı (rid tekilleştirme dahil)
  function mapRow(item, idx) {
    const val = getClassNo(item.sta);
    const jsn = item.jsn || {};
    return {
      seqNo: idx + 1,
      rid: item.rid || '-',
      ord_id: item.ord_id || '-',
      erp_id: item.erp_id || '-',
      tim_open_formatted: formatDate(item.tim_open),
      tim_plan_formatted: item.tim_plan ? formatDate(item.tim_plan) : '-',
      tim_begn_formatted: item.tim_begn ? formatDate(item.tim_begn) : '-',
      tim_end_formatted: val === 4 && item.tim_end ? formatDate(item.tim_end) : '-',
      elp_tim: calculateElapsedTime(item),
      customerName: (jsn.prm1 && jsn.prm1.customer_name) || '-',
      energyProductId: (jsn.prm2 && jsn.prm2.energy_product_id) || '-',
      svc_desc: item.svc_desc || '-',
      wor_name: item.wor_name || '-',
      prio: item.prio || 'medium',
      asn_usr: item.asn_usr || '-',
      tim_due_formatted: item.tim_due ? formatDate(item.tim_due) : '-',
      usr_last: getLastJsonValue(item.usr) || '-',
      note_last: getLastJsonValue(item.note) || '-',
      sta: item.sta,
      statusNo: val,
      statusText: getStaText(item.sta),
      canChangeStatus: true,
      rawItem: item
    };
  }

  // ---------------------------------------------------------------------------
  // Kolonlar (columns: ColumnDef[]) — hidden: sunumda varsayılan kapalı (Kolonlar menüsünden açılır)
  // ---------------------------------------------------------------------------
  const COLUMNS = [
    { field: 'seqNo', header: 'Sıra', width: '40px', filterable: false, wrap: false },
    { field: 'rid', header: 'İş Emri Numarası', sortable: true, wrap: false },
    { field: 'ord_id', header: 'Sipariş Numarası', sortable: true, wrap: false, hidden: true },
    { field: 'erp_id', header: 'Hizmet No', sortable: true, hidden: true },
    { field: 'tim_open_formatted', header: 'Sipariş Bildirim Zamanı', sortable: true, type: 'date', wrap: false },
    { field: 'tim_plan_formatted', header: 'Sipariş Planlama Zamanı', type: 'date', hidden: true, wrap: false },
    { field: 'tim_begn_formatted', header: 'Sipariş Başlama Zamanı', type: 'date', hidden: true, wrap: false },
    { field: 'tim_end_formatted', header: 'Sipariş Tamamlanma Zamanı', type: 'date', hidden: true, wrap: false },
    { field: 'elp_tim', header: 'Geçen Zaman', filterable: false, minWidth: '120px' },
    { field: 'customerName', header: 'Müşteri Adı', minWidth: '140px' },
    { field: 'energyProductId', header: 'Enerji Ürün ID', hidden: true },
    { field: 'svc_desc', header: 'Paket Adı', hidden: true, minWidth: '160px' },
    { field: 'wor_name', header: 'Sipariş Adı', sortable: true, minWidth: '220px' },
    { field: 'prio', header: 'Öncelik', sortable: true, wrap: false, filterable: false },
    { field: 'asn_usr', header: 'Atanan Teknisyen', sortable: true, wrap: false },
    { field: 'tim_due_formatted', header: 'Termin Tarihi', sortable: true, type: 'date', wrap: false },
    { field: 'usr_last', header: 'En Son İşlem Yapan Kullanıcı', minWidth: '110px', hidden: true },
    { field: 'note_last', header: 'En Son Not', minWidth: '180px' },
    { field: 'sta', header: 'Durum', filterable: false, wrap: false }
  ];

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const qsSta = params.get('sta') || '';
  const qsKpi = params.get('kpi') || '';
  const state = {
    search: params.get('q') || '',
    quick: QUICK.some(q => q.value === qsSta) ? qsSta : 'all',
    kpi: KPI.some(k => k.key === qsKpi) ? qsKpi : '',
    filters: {},
    sortField: '',
    sortOrder: 1,
    page: 1,
    pageSize: 15,
    showFilters: false,
    selected: new Set(),
    hiddenCols: {},
    flashRid: ''
  };
  if (params.get('cols') !== 'all') COLUMNS.forEach(c => { if (c.hidden) state.hiddenCols[c.field] = true; });
  const cols = () => COLUMNS.filter(c => !state.hiddenCols[c.field]);
  const findItem = rid => LIST.find(x => x.rid === rid);

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama (buildWhereQuery + get_qry sıralamasının istemci tarafı karşılığı)
  // ---------------------------------------------------------------------------
  // tr-TR küçültme + ı/i katlama: "klima" araması "KLIMA 109" (→ klıma) kaydını da bulsun
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  function sortKey(r, f) {
    switch (f) {
      case 'tim_open_formatted': return r.rawItem.tim_open ? +new Date(r.rawItem.tim_open) : 0;
      case 'tim_plan_formatted': return r.rawItem.tim_plan ? +new Date(r.rawItem.tim_plan) : 0;
      case 'tim_begn_formatted': return r.rawItem.tim_begn ? +new Date(r.rawItem.tim_begn) : 0;
      case 'tim_end_formatted': return r.rawItem.tim_end ? +new Date(r.rawItem.tim_end) : 0;
      case 'tim_due_formatted': return r.rawItem.tim_due ? +new Date(r.rawItem.tim_due) : 0;
      case 'prio': return (PRIORITY[r.prio] || PRIORITY.medium).rank;
      case 'sta': return r.statusNo;
      default: return lc(r[f]);
    }
  }
  function filtered() {
    const seen = new Set();
    let items = LIST.filter(it => { if (seen.has(it.rid)) return false; seen.add(it.rid); return true; });
    if (state.quick !== 'all') items = items.filter(it => it.sta === state.quick);
    if (state.kpi) {
      const k = KPI.find(x => x.key === state.kpi);
      items = items.filter(it => k.nos.indexOf(getClassNo(it.sta)) >= 0);
    }
    // XDB varsayılan sırası yerine en yeni bildirim üstte
    items.sort((a, b) => new Date(b.tim_open) - new Date(a.tim_open));
    let rows = items.map(mapRow);

    const q = lc(state.search.trim());
    if (q) {
      rows = rows.filter(r => [r.rid, r.ord_id, r.erp_id, r.customerName, r.energyProductId, r.svc_desc, r.wor_name, r.asn_usr, r.usr_last, r.note_last,
        r.statusText, (PRIORITY[r.prio] || {}).label, r.rawItem.target, r.rawItem.loc_sub1].some(v => lc(v).indexOf(q) >= 0));
    }
    Object.keys(state.filters).forEach(f => {
      const v = lc(String(state.filters[f] || '').trim());
      if (v) rows = rows.filter(r => lc(r[f]).indexOf(v) >= 0);
    });
    if (state.sortField) {
      const f = state.sortField;
      rows.sort((a, b) => {
        const ka = sortKey(a, f), kb = sortKey(b, f);
        return ka < kb ? -state.sortOrder : ka > kb ? state.sortOrder : 0;
      });
    }
    rows.forEach((r, i) => { r.seqNo = i + 1; });
    return rows;
  }

  // ---------------------------------------------------------------------------
  // Sayfa başlığı (app-page-header)
  // ---------------------------------------------------------------------------
  function renderHeader() {
    const host = document.getElementById('wo-header');
    host.innerHTML = kit.pageHeader({
      title: 'SİPARİŞ LİSTESİ',
      breadcrumbs: [{ label: 'İş Emirleri' }, { label: 'SİPARİŞ LİSTESİ' }],
      actions: '<div class="flex items-center gap-3">' +
        button({ variant: 'secondary', icon: 'pi pi-file', label: 'Rapor', attrs: 'data-act="report"' }) +
        button({ variant: 'primary', icon: 'pi pi-plus', label: 'Yeni İş Emri Oluştur', attrs: 'data-act="new"' }) +
      '</div>'
    });
    host.querySelector('[data-act="report"]').addEventListener('click', openReport);
    host.querySelector('[data-act="new"]').addEventListener('click', openCreate);
  }

  // ---------------------------------------------------------------------------
  // Durum özet kartları (sunum eki; alarms.html şiddet kartlarıyla aynı görsel dil)
  // ---------------------------------------------------------------------------
  const isOverdue = it => it.tim_due && [0, 4].indexOf(getClassNo(it.sta)) < 0 && new Date(it.tim_due).getTime() < Date.now();
  function renderKpis() {
    const host = document.getElementById('wo-kpis');
    host.innerHTML = KPI.map(k => {
      const c = KPI_COLORS[k.color];
      const items = LIST.filter(it => k.nos.indexOf(getClassNo(it.sta)) >= 0);
      const n = items.length;
      const crit = items.filter(it => it.prio === 'critical').length;
      const late = items.filter(isOverdue).length;
      const sel = state.kpi === k.key;
      let foot;
      if (k.key === 'done') {
        const today = fmtDateKey(new Date());
        foot = items.filter(it => it.tim_end && fmtDateKey(new Date(it.tim_end)) === today).length + ' bugün tamamlandı';
      } else {
        foot = (crit ? crit + ' kritik' : '0 kritik') + ' · ' + late + ' gecikmiş';
      }
      return '<div data-kpi="' + k.key + '" title="' + esc(k.label) + ' iş emirlerini filtrele" class="bg-white dark:bg-surface-card border rounded-[2px] p-2.5 sm:p-3 shadow-2xs transition-all select-none cursor-pointer ' +
        (sel ? c.on + ' ring-2 ring-sky-500/30' : (n > 0 ? c.on.split(' ')[0] + ' hover:shadow-xs' : 'border-slate-200 dark:border-border-subtle hover:border-slate-300')) + '">' +
        '<div class="flex items-center justify-between ' + c.txt + '">' +
          '<div class="flex items-center gap-1.5"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">' + esc(k.label) + '</span>' +
          (k.key !== 'done' && late > 0 ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="Termini geçmiş iş emri var"></span>' : '') + '</div>' +
          '<div class="flex items-center gap-1">' + (sel ? '<i class="pi pi-filter-fill text-[10px]"></i>' : '<i class="pi pi-filter text-[10px] opacity-60"></i>') + '<i class="' + k.icon + ' text-sm"></i></div>' +
        '</div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black tracking-tight ' + (n > 0 ? c.num : 'text-slate-900 dark:text-slate-100') + '">' + n + '</span>' +
          '<span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">iş emri</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] font-mono flex items-center justify-between gap-1 text-slate-400">' +
          '<span class="truncate">' + esc(k.sub) + '</span><span class="shrink-0' + (k.key !== 'done' && late > 0 ? ' text-rose-500 dark:text-rose-400 font-bold' : '') + '">' + esc(foot) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('[data-kpi]').forEach(el => el.addEventListener('click', () => {
      const k = el.getAttribute('data-kpi');
      state.kpi = state.kpi === k ? '' : k;
      state.quick = 'all';
      state.page = 1;
      renderAll();
    }));
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const filterInputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '') + (c.maxWidth ? 'max-width:' + c.maxWidth + ';' : '');

  function priorityBadge(p) {
    const s = PRIORITY[p] || PRIORITY.medium;
    return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-black uppercase tracking-wider border ' + s.cls + '"><span class="w-1.5 h-1.5 rounded-full ' + s.dot + '"></span>' + s.label + '</span>';
  }
  function statusChip(row, big) {
    // staTemplate: sta-c{no} + (yetkiliyse) hover efekti ve kalem ikonu
    const hover = row.canChangeStatus ? ' cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:brightness-110 hover:ring-1 hover:ring-current' : ' cursor-default';
    return '<span' + (row.canChangeStatus ? ' data-status="' + esc(row.rid) + '" title="Durumu değiştirmek için tıklayın"' : '') +
      ' class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap transition-all duration-200 ' + staC(row.statusNo) + hover + (big ? ' text-xs' : '') + '">' +
      '<span>' + esc(row.statusText) + '</span>' + (row.canChangeStatus ? '<i class="pi pi-pencil text-[8px] opacity-70"></i>' : '') + '</span>';
  }
  function dueCell(row) {
    const it = row.rawItem;
    if (!it.tim_due) return '-';
    const no = row.statusNo;
    const left = new Date(it.tim_due).getTime() - Date.now();
    let tag = '';
    let cls = 'text-slate-700 dark:text-slate-300';
    if ([0, 4].indexOf(no) < 0) {
      if (left < 0) { cls = 'text-rose-600 dark:text-rose-400 font-bold'; tag = '<span class="ml-1 px-1 py-px rounded-[2px] text-[9px] font-black uppercase bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/40">Gecikti</span>'; }
      else if (left < 24 * 3600000) { cls = 'text-amber-600 dark:text-amber-400 font-bold'; tag = '<span class="ml-1 px-1 py-px rounded-[2px] text-[9px] font-black uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40">24 sa</span>'; }
    }
    return '<span class="font-mono ' + cls + '">' + esc(row.tim_due_formatted) + '</span>' + tag;
  }

  function cell(col, r) {
    switch (col.field) {
      case 'rid':
        return '<button type="button" data-detail="' + esc(r.rid) + '" class="font-mono text-xs text-sky-400 hover:text-sky-300 font-bold hover:underline cursor-pointer">' + esc(r.rid) + '</button>';
      case 'prio':
        return priorityBadge(r.prio);
      case 'tim_due_formatted':
        return dueCell(r);
      case 'sta':
        return '<div class="flex items-center gap-2">' + statusChip(r) + '</div>';
      case 'wor_name':
        return '<span class="cell-wrap font-semibold text-slate-900 dark:text-slate-100" title="' + esc(r.wor_name) + '">' + esc(r.wor_name) + '</span>';
      default: {
        const v = r[col.field];
        const mono = col.type === 'date' || col.field === 'ord_id' || col.field === 'erp_id' || col.field === 'energyProductId';
        return '<span class="' + (col.wrap === false ? 'cell-nowrap' : 'cell-wrap') + (mono ? ' font-mono' : '') + '" title="' + esc(v == null ? '' : v) + '">' + esc(v == null ? '' : v) + '</span>';
      }
    }
  }

  function renderTableShell() {
    const host = document.getElementById('wo-table');
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-1" data-quick>' +
            QUICK.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + esc(q.label) + '</button>').join('') +
          '</div>' +
          '<span data-chips class="flex items-center gap-1"></span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<div data-bulk class="hidden px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"></div>' +
          '<button type="button" data-filter-toggle class="px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer" title="Filtre"><i class="pi pi-filter text-xs"></i><span>Filtre</span></button>' +
          '<div class="relative">' +
            '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-56 max-h-[60vh] overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
          '</div>' +
          '<button type="button" data-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0" data-footer></div>';

    let searchTimer = null;
    host.querySelector('[data-search]').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); }, 120);
    });
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      state.quick = b.getAttribute('data-q');
      state.kpi = '';
      state.page = 1;
      renderAll();
    }));
    host.querySelector('[data-filter-toggle]').addEventListener('click', () => { state.showFilters = !state.showFilters; renderToolbar(); renderHead(); });
    const colBtn = host.querySelector('[data-colmenu]');
    const colPanel = host.querySelector('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    host.querySelector('[data-refresh]').addEventListener('click', () => {
      const icon = host.querySelector('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => { icon.className = 'pi pi-refresh text-xs'; renderAll(); toast('İş emri listesi WOR/S00 kaynağından yenilendi.', 'success'); }, 600);
    });

    // Tablo içi delegasyon: İş Emri No → detay, durum rozeti → durum işlemi, onay kutusu → seçim, satır → detay
    host.querySelector('[data-tbody]').addEventListener('click', e => {
      const det = e.target.closest('[data-detail]');
      const sta = e.target.closest('[data-status]');
      const chk = e.target.closest('[data-row-check-cell]');
      if (det) { e.stopPropagation(); openDetails(det.getAttribute('data-detail')); return; }
      if (sta) { e.stopPropagation(); openStatus(sta.getAttribute('data-status')); return; }
      const row = e.target.closest('[data-row]');
      if (!row) return;
      const rid = row.getAttribute('data-row');
      if (chk) {
        if (state.selected.has(rid)) state.selected.delete(rid); else state.selected.add(rid);
        renderBody();
        return;
      }
      openDetails(rid);
    });
  }

  function renderToolbar() {
    document.querySelectorAll('#wo-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === state.quick;
      b.className = 'px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
    const ft = document.querySelector('#wo-table [data-filter-toggle]');
    ft.className = 'px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
      (state.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');

    const chips = document.querySelector('#wo-table [data-chips]');
    const k = KPI.find(x => x.key === state.kpi);
    chips.innerHTML = k
      ? '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">Grup: ' + esc(k.label) +
        '<button type="button" data-chip class="hover:text-rose-500 cursor-pointer"><i class="pi pi-times text-[8px]"></i></button></span>'
      : '';
    const cb = chips.querySelector('[data-chip]');
    if (cb) cb.addEventListener('click', () => { state.kpi = ''; state.page = 1; renderAll(); });
  }

  function renderColMenu() {
    const panel = document.querySelector('#wo-table [data-colmenu-panel]');
    panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
      COLUMNS.map(c =>
        '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
        '<input type="checkbox" data-col="' + c.field + '"' + (state.hiddenCols[c.field] ? '' : ' checked') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>'
      ).join('');
    panel.querySelectorAll('[data-col]').forEach(chk => chk.addEventListener('change', () => {
      state.hiddenCols[chk.getAttribute('data-col')] = !chk.checked;
      renderHead();
      renderBody();
    }));
  }

  function renderHead() {
    const thead = document.querySelector('#wo-table [data-thead]');
    const cs = cols();
    let html = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      '<th class="py-2 px-1 text-center bg-slate-100 dark:bg-surface-base" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-check-all class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
      cs.map(c =>
        '<th data-sort="' + (c.field === 'seqNo' ? '' : c.field) + '" class="py-2 px-2 text-left font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
          '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
          (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
          '</div></th>'
      ).join('') + '</tr>';
    if (state.showFilters) {
      html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-[#0b121e]" style="width: 36px; min-width: 36px; max-width: 36px;"><button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button></th>' +
        cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' +
          (c.filterable === false ? '' : '<input type="text" data-f="' + c.field + '" value="' + esc(state.filters[c.field] || '') + '" placeholder="Filtre" class="' + filterInputCls + '" />') + '</th>').join('') +
        '</tr>';
    }
    thead.innerHTML = html;

    thead.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => {
      const f = th.getAttribute('data-sort');
      if (!f) return;
      if (state.sortField === f) state.sortOrder *= -1; else { state.sortField = f; state.sortOrder = 1; }
      state.page = 1;
      renderHead();
      renderBody();
    }));
    thead.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
      state.filters[inp.getAttribute('data-f')] = inp.value;
      state.page = 1;
      renderBody();
    }));
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', () => {
      // onClearFilters(): kolon filtreleri + arama + hızlı filtre sıfırlanır
      state.filters = {}; state.search = ''; state.quick = 'all'; state.kpi = ''; state.page = 1;
      document.querySelector('#wo-table [data-search]').value = '';
      renderAll();
    });
    thead.querySelector('[data-check-all]').addEventListener('change', e => {
      if (e.target.checked) currentPageRows().forEach(r => state.selected.add(r.rid)); else state.selected.clear();
      renderBody();
    });
  }

  let lastFiltered = [];
  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return lastFiltered.slice(start, start + state.pageSize);
  }

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const rows = currentPageRows();
    const cs = cols();
    const tbody = document.querySelector('#wo-table [data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + (cs.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Veri bulunamadı</span></td></tr>';
    } else {
      tbody.innerHTML = rows.map(r => {
        const sel = state.selected.has(r.rid);
        return '<tr data-row="' + esc(r.rid) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer ' + staR(r.statusNo) + (sel ? ' bg-sky-500/5' : '') + (state.flashRid === r.rid ? ' wo-row-new' : '') + '">' +
          '<td data-row-check-cell class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox"' + (sel ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
          cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, r) + '</td>').join('') +
          '</tr>';
      }).join('');
    }
    state.flashRid = '';
    const checkAll = document.querySelector('#wo-table [data-check-all]');
    if (checkAll) checkAll.checked = rows.length > 0 && rows.every(r => state.selected.has(r.rid));

    // Toplu işlem bilgisi ("N seçili · İşlemler")
    const bulk = document.querySelector('#wo-table [data-bulk]');
    if (state.selected.size > 0) {
      bulk.classList.remove('hidden');
      bulk.innerHTML = '<span>' + state.selected.size + ' seçili</span><button type="button" data-bulk-act class="underline hover:text-sky-800 dark:hover:text-sky-300" title="Seçili iş emirlerini Excel\'e aktar">İşlemler</button>';
      bulk.querySelector('[data-bulk-act]').onclick = () => {
        const sel = LIST.filter(it => state.selected.has(it.rid)).map(mapRow);
        exportRows('is_emirleri_secili', sel);
      };
    } else {
      bulk.classList.add('hidden');
    }

    // Footer / sayfalama
    const footer = document.querySelector('#wo-table [data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span> kayıt listeleniyor.</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="-1"' + (state.page <= 1 ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + state.page + ' / ' + totalPages + '</span>' +
          '<button type="button" data-page="1"' + (state.page >= totalPages ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
    footer.querySelector('[data-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderBody(); });
    footer.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
      state.page += parseInt(b.getAttribute('data-page'), 10);
      renderBody();
      document.querySelector('#wo-table [data-scroll]').scrollTop = 0;
    }));
  }

  // Excel (CSV) dışa aktarım — rapor penceresindeki kolon düzeni
  function exportRows(name, rows) {
    kit.exportExcel(name, [
      { header: 'Sıra', value: r => r.seqNo },
      { header: 'İş Emri No', value: r => r.rid },
      { header: 'Sipariş No', value: r => r.ord_id },
      { header: 'Hizmet No', value: r => r.erp_id },
      { header: 'Sipariş Bildirim', value: r => r.tim_open_formatted },
      { header: 'Sipariş Planlama', value: r => r.tim_plan_formatted },
      { header: 'Sipariş Başlama', value: r => r.tim_begn_formatted },
      { header: 'Sipariş Tamamlanma', value: r => r.tim_end_formatted },
      { header: 'Geçen Zaman', value: r => r.elp_tim },
      { header: 'Müşteri Adı', value: r => r.customerName },
      { header: 'Enerji Ürün ID', value: r => r.energyProductId },
      { header: 'Paket Adı', value: r => r.svc_desc },
      { header: 'Sipariş Adı', value: r => r.wor_name },
      { header: 'Öncelik', value: r => (PRIORITY[r.prio] || PRIORITY.medium).label },
      { header: 'Atanan Teknisyen', value: r => r.asn_usr },
      { header: 'Termin Tarihi', value: r => r.tim_due_formatted },
      { header: 'En Son Not', value: r => r.note_last },
      { header: 'Durum', value: r => r.statusText }
    ], rows);
  }

  // ---------------------------------------------------------------------------
  // İş emri detayı (WorkOrderDetailsComponent)
  // ---------------------------------------------------------------------------
  const infoRow = (label, value, trunc) =>
    '<div class="flex justify-between items-center gap-3 border-b border-dashed border-slate-200 dark:border-slate-700 pb-2 last:border-0 last:pb-0">' +
      '<span class="text-xs text-slate-500 dark:text-slate-400 shrink-0">' + esc(label) + '</span>' +
      '<span class="text-xs font-medium text-slate-800 dark:text-slate-200 text-right' + (trunc ? ' truncate max-w-[150px]' : '') + '" title="' + esc(value || '-') + '">' + esc(value || '-') + '</span>' +
    '</div>';
  const infoCard = (icon, title, rows) =>
    '<div class="bg-white dark:bg-surface-card rounded-md border border-slate-200 dark:border-border-subtle p-4">' +
      '<h3 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2"><i class="' + icon + ' mr-2"></i>' + esc(title) + '</h3>' +
      '<div class="space-y-3">' + rows + '</div>' +
    '</div>';
  const timeBox = (label, value, done) => done
    ? '<div class="flex flex-col p-2 bg-emerald-50/50 dark:bg-emerald-900/10 rounded border border-emerald-100 dark:border-emerald-900/30"><span class="text-[10px] uppercase text-emerald-600/70 dark:text-emerald-400/70 mb-1">' + esc(label) + '</span><span class="text-xs font-medium text-emerald-700 dark:text-emerald-300">' + esc(value) + '</span></div>'
    : '<div class="flex flex-col p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-100 dark:border-slate-800"><span class="text-[10px] uppercase text-slate-400 mb-1">' + esc(label) + '</span><span class="text-xs font-medium text-slate-700 dark:text-slate-300">' + esc(value) + '</span></div>';
  function kvTable(icon, title, obj) {
    const keys = Object.keys(obj);
    return '<div class="bg-white dark:bg-surface-card rounded-md border border-slate-200 dark:border-border-subtle overflow-hidden">' +
      '<h3 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800"><i class="' + icon + ' mr-2 text-slate-500"></i>' + esc(title) + '</h3>' +
      '<div class="p-0 overflow-x-auto"><table class="w-full text-left border-collapse">' +
        '<thead><tr class="bg-slate-50/50 dark:bg-slate-900/20">' + keys.map(k => '<th class="p-3 text-xs font-medium text-slate-500 border-b border-slate-200 dark:border-slate-800 whitespace-nowrap">' + esc(k) + '</th>').join('') + '</tr></thead>' +
        '<tbody><tr>' + keys.map(k => '<td class="p-3 text-xs text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 max-w-[200px] truncate" title="' + esc(obj[k]) + '">' + esc(obj[k]) + '</td>').join('') + '</tr></tbody>' +
      '</table></div></div>';
  }
  // Sunum eki: kabin / ekipman derin bağlantıları
  function targetLinks(it) {
    if (it.target_kind === 'cabinet') {
      return '<div class="flex flex-wrap gap-1.5 pt-1">' +
        '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(it.target) + '" class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 flex items-center gap-1"><i class="pi pi-th-large text-[9px]"></i>Kabin Yönetimi</a>' +
        '<a href="2d.html?cabinet=' + encodeURIComponent(it.target) + '" class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/30 hover:bg-slate-500/20 flex items-center gap-1"><i class="pi pi-map text-[9px]"></i>2D\'de Göster</a>' +
      '</div>';
    }
    if (/^(UPS|KLIMA) /.test(it.target || '')) {
      return '<div class="flex flex-wrap gap-1.5 pt-1"><a href="3d.html?focus=' + encodeURIComponent(it.target) + '" class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 hover:bg-sky-500/20 flex items-center gap-1"><i class="pi pi-box text-[9px]"></i>3D\'de Göster</a></div>';
    }
    return '';
  }

  function detailsBody(it) {
    const no = getClassNo(it.sta);
    const jsn = it.jsn || {};
    const p1 = jsn.prm1 || {};
    const p2 = jsn.prm2 || {};
    const noteObj = parseJsonObj(it.note);
    const usrObj = parseJsonObj(it.usr);
    const hasNote = Object.keys(noteObj).length > 0;
    const hasUsr = Object.keys(usrObj).length > 0;
    return '<div class="flex flex-col gap-6 -m-1">' +
      // Durum & ana bilgi
      '<div class="flex flex-wrap gap-4 items-center justify-between p-4 bg-white dark:bg-surface-card rounded-md border border-slate-200 dark:border-border-subtle">' +
        '<div class="min-w-0"><div class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1">Sipariş Adı</div>' +
          '<div class="text-sm font-medium text-slate-800 dark:text-slate-200">' + esc(it.wor_name || '-') + '</div></div>' +
        '<div class="flex items-center gap-4">' +
          '<div class="flex flex-col items-end"><div class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1">Öncelik</div>' + priorityBadge(it.prio) + '</div>' +
          '<div class="flex flex-col items-end"><div class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold mb-1">Durum</div>' +
            '<div data-detail-status="' + esc(it.rid) + '" title="Durumu değiştirmek için tıklayın" class="px-2.5 py-1 rounded text-xs font-bold cursor-pointer hover:brightness-110 ' + staC(no) + '">' + esc(STA_FULL[no] || '-') + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-5">' +
        infoCard('pi pi-info-circle text-sky-500', 'Genel Bilgiler',
          infoRow('Sipariş Numarası', it.ord_id) + infoRow('Hizmet Numarası', it.erp_id) + infoRow('Hizmet Tipi', it.cat_sub1) + infoRow('Ekip Bilgisi', it.asn_grp) +
          infoRow('Atanan Teknisyen', it.asn_usr) + infoRow('Termin Tarihi', it.tim_due ? formatDate(it.tim_due) : '-')) +
        infoCard('pi pi-bolt text-amber-500', 'Enerji & Müşteri',
          infoRow('Müşteri Adı', p1.customer_name, true) + infoRow('Enerji Limit', p2.energy_limit) + infoRow('Enerji Ürün ID', p2.energy_product_id) + infoRow('Servis Numarası', p2.service_number)) +
        infoCard('pi pi-box text-emerald-500', 'Servis Detayları',
          infoRow('Servis ID', it.svc_id) + infoRow('Servis Adı', it.svc_name, true) + infoRow('Paket Adı', it.svc_desc, true)) +
        infoCard('pi pi-map-marker text-rose-500', 'Lokasyon Bilgileri',
          infoRow('Lokasyon', it.loc_main, true) + infoRow('Kabin Lokasyon Adresi', it.loc_sub1, true) + infoRow('Kabin Bilgisi', p1.cabinet_info, true) + infoRow('Oda Bilgisi', p1.room_info, true) + targetLinks(it)) +
      '</div>' +
      // Zaman çizelgesi
      '<div class="bg-white dark:bg-surface-card rounded-md border border-slate-200 dark:border-border-subtle p-4">' +
        '<h3 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-2"><i class="pi pi-clock mr-2 text-indigo-500"></i>Zaman Çizelgesi</h3>' +
        '<div class="grid grid-cols-2 sm:grid-cols-5 gap-3">' +
          timeBox('Sipariş Bildirim Zamanı', formatDateSec(it.tim_open)) +
          timeBox('Planlanma Zamanı', formatDateSec(it.tim_plan)) +
          timeBox('Başlama Zamanı', formatDateSec(it.tim_begn)) +
          timeBox('Tamamlanma Zamanı', no === 4 && it.tim_end ? formatDateSec(it.tim_end) : 'Sipariş Tamamlanmamış', true) +
          timeBox('Güncelleme Zamanı', formatDateSec(it.tim_upd || it.tim_end)) +
        '</div>' +
      '</div>' +
      (hasNote || hasUsr
        ? '<div class="grid grid-cols-1 md:grid-cols-2 gap-5">' +
            (hasNote ? kvTable('pi pi-file-edit', 'Kayıtlı Notlar', noteObj) : '') +
            (hasUsr ? kvTable('pi pi-users', 'İşlem Yapan Kullanıcılar', usrObj) : '') +
          '</div>'
        : '') +
      // Not güncelleme (sta > 769 → YENİ dışındaki durumlar)
      (Number(it.sta) > 769
        ? '<div class="bg-slate-100/50 dark:bg-slate-800/20 rounded-md border border-slate-200 dark:border-slate-700/50 p-5 mt-2">' +
            '<h4 class="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center"><i class="pi pi-pencil mr-2 text-sky-500"></i>Sipariş Notu Güncelle</h4>' +
            '<textarea data-note-text rows="3" placeholder="Notunuzu yazın..." class="w-full bg-white dark:bg-surface-base border border-slate-300 dark:border-slate-700 rounded p-3 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all resize-y mb-3"></textarea>' +
            '<div data-saved-note class="hidden bg-sky-50 dark:bg-sky-900/10 border-l-4 border-sky-500 p-3 mb-3 rounded-r"><h5 class="text-xs font-bold text-sky-700 dark:text-sky-400 mb-1">Kaydedilen Not:</h5><p class="text-xs text-sky-600 dark:text-sky-300"></p></div>' +
            '<div class="flex justify-end"><button type="button" data-note-save class="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded transition-colors shadow-sm cursor-pointer">Notu Kaydet</button></div>' +
          '</div>'
        : '') +
    '</div>';
  }

  function openDetails(rid) {
    const it = findItem(rid);
    if (!it) return;
    const d = dialog({
      title: 'SİPARİŞ LİSTESİ',
      subtitle: 'ID: ' + it.rid,
      variant: 'info',
      maxWidth: 'max-w-3xl', // orijinal w-[800px] (768px en yakın derlenmiş sınıf)
      cancelLabel: 'Kapat',
      confirmLabel: 'PDF İNDİR',
      confirmIcon: 'pi pi-file-pdf',
      body: detailsBody(it),
      onConfirm: () => { kit.exportPdf(); return false; }
    });
    // Orijinalde PDF düğmesi yeşil (bg-emerald-600)
    const pdfBtn = d.el.querySelector('[data-dialog-confirm]');
    pdfBtn.classList.remove('bg-sky-600', 'hover:bg-sky-700');
    pdfBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    d.body.classList.add('bg-slate-50/50', 'dark:bg-surface-base/30');

    const st = d.body.querySelector('[data-detail-status]');
    if (st) st.addEventListener('click', () => { d.close(); openStatus(it.rid); });
    const save = d.body.querySelector('[data-note-save]');
    if (save) save.addEventListener('click', () => {
      // saveNote(): son durum anahtarının notunu günceller (cmd: 20)
      const txt = d.body.querySelector('[data-note-text]').value;
      if (!txt || !txt.trim()) { toast('Lütfen bir not giriniz', 'error', 'UYARI!'); return; }
      const noteObj = parseJsonObj(it.note);
      const keys = Object.keys(noteObj);
      if (!keys.length) { toast('Not alanı boş', 'warning'); return; }
      noteObj[keys[keys.length - 1]] = txt.trim();
      it.note = JSON.stringify(noteObj);
      it.tim_upd = new Date();
      const box = d.body.querySelector('[data-saved-note]');
      box.classList.remove('hidden');
      box.querySelector('p').textContent = txt.trim();
      d.body.querySelector('[data-note-text]').value = '';
      toast('Not kaydedildi!', 'success', 'Başarılı');
      renderBody();
    });
  }

  // ---------------------------------------------------------------------------
  // Durum işlemi (WorkOrderStaComponent) — akış diyagramı + zorunlu açıklama
  // ---------------------------------------------------------------------------
  const STATUS_NEXT = {
    0: [], 1: ['2', '0'], 2: ['3', '6', '10', '14', '5', '9', '13'], 3: ['4', '8', '12', '5', '9', '13', '6', '7', '11', '15'],
    4: [], 5: ['3', '8', '12'], 6: ['7', '10', '14', '5', '9', '13', '3']
  };
  // statusDefinitions: yalnızca 1, 2, 3, 4, 6 tanımlı (0, 5, 7…15 orijinalde yorum satırı)
  const STATUS_DEF = { 1: 'sta-c1', 2: 'sta-c2', 3: 'sta-c3', 4: 'sta-c4', 6: 'sta-c6' };
  const STATUS_COLOR = {
    'sta-c1': 'bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-200 border-sky-300 dark:border-sky-700',
    'sta-c2': 'bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700',
    'sta-c3': 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700',
    'sta-c4': 'bg-green-500 dark:bg-green-600 text-white border-green-600 dark:border-green-500',
    'sta-c6': 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700'
  };

  function openStatus(rid) {
    const it = findItem(rid);
    if (!it) return;
    const current = String(getClassNo(it.sta));
    const enabled = STATUS_NEXT[current] || [];
    const energyId = (it.jsn && it.jsn.prm2 && it.jsn.prm2.energy_product_id) || '';
    let selected = current;
    let note = '';

    const option = v => {
      const cls = STATUS_DEF[v];
      if (!cls) return '';
      const disabled = !(enabled.indexOf(v) >= 0 || v === selected);
      let c = (STATUS_COLOR[cls] || 'border-transparent') + ' px-3 py-3 border-2 rounded-md cursor-pointer text-center font-medium text-sm transition-all duration-200 w-full select-none ';
      if (selected === v) c += 'border-sky-500 ring-2 ring-sky-500/50 ';
      else if (!disabled) c += 'hover:-translate-y-0.5 hover:shadow-md ';
      if (disabled) c += 'opacity-30 cursor-not-allowed pointer-events-none ';
      return '<div data-opt="' + v + '" class="' + c + '">' + v + ' - ' + esc(STA_FLOW[v]) + '</div>';
    };
    const arrow = (extra, inner) => '<div class="flex flex-col items-center justify-start ' + extra + ' text-sky-500 dark:text-sky-400 font-bold text-2xl wo-arrow">' + inner + '</div>';
    const flow = () =>
      '<div class="w-full overflow-x-auto pb-4"><div class="flex items-start justify-center gap-4 min-w-max">' +
        '<div class="flex flex-col min-w-[140px]">' + option('1') + '</div>' +
        arrow('pt-3', '→') +
        '<div class="flex flex-col min-w-[140px]">' + option('2') + '</div>' +
        arrow('pt-3 gap-6', '<div>→</div><div class="transform rotate-45 mt-4">→</div>') +
        '<div class="flex flex-col min-w-[140px] gap-4">' +
          '<div class="flex flex-col">' + option('3') + '</div>' +
          '<div class="flex items-center justify-center gap-4 text-sky-500 dark:text-sky-400 font-bold text-2xl wo-arrow"><div>↑</div><div>↓</div></div>' +
          '<div class="flex flex-col gap-2">' + ['5', '9', '13', '6', '10', '14', '7', '11', '15'].map(option).join('') + '</div>' +
        '</div>' +
        arrow('pt-5', '→') +
        '<div class="flex flex-col min-w-[140px] gap-2">' + option('0') + ['4', '8', '12'].map(option).join('') + '</div>' +
      '</div></div>';
    const textArea = () => selected !== '1'
      ? '<div class="mt-6 flex flex-col gap-1.5"><label class="text-sm font-medium text-slate-700 dark:text-slate-300">Açıklama</label>' +
        '<textarea data-sta-note rows="4" maxlength="300" placeholder="Açıklama giriniz..." class="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-y transition-colors">' + esc(note) + '</textarea>' +
        '<div class="text-xs text-slate-500 dark:text-slate-400 text-right" data-sta-count>' + note.length + '/300</div></div>'
      : '';

    const d = dialog({
      title: 'İş Emri İşlemi',
      subtitle: it.rid + ' · ' + it.wor_name,
      variant: 'info',
      maxWidth: 'max-w-4xl',
      cancelLabel: 'İptal',
      confirmLabel: 'Onayla',
      body: '<div data-sta-flow></div><div data-sta-text></div>',
      onConfirm: () => {
        if (!canConfirm()) {
          if (!note.trim()) toast('TAMAMLANDI durumu için açıklama girmek zorunludur.', 'warning');
          return false;
        }
        applyStatus(it, Number(selected), note.trim());
        if (selected === '4' && energyId) {
          toast('Siparişle ilgili müşteri eşleştirmesi yapılmadı. İşleme devam edebilirsiniz, ancak daha sonra tamamlamanız önerilir.', 'warning', 'Hatırlatma');
        } else {
          toast('İşlem başarılı şekilde onaylandı.', 'success', 'Başarılı');
        }
        return true;
      }
    });
    const confirmBtn = d.el.querySelector('[data-dialog-confirm]');
    confirmBtn.classList.add('disabled:opacity-50', 'disabled:cursor-not-allowed');
    // Müşteri eşleştirme hatırlatması (footer solunda, animate-pulse)
    const reminder = document.createElement('div');
    reminder.className = 'hidden animate-pulse text-rose-500 font-medium cursor-pointer mr-auto text-xs';
    reminder.textContent = 'Sipariş Eşleştirme Eksik - Lütfen Tamamlayın!';
    reminder.addEventListener('click', () => { window.location.href = 'customer-pages.html'; });
    confirmBtn.parentElement.insertBefore(reminder, confirmBtn.parentElement.firstChild);

    function canConfirm() { return !!selected && selected !== current && note.trim().length > 0; }
    function sync() {
      confirmBtn.disabled = !canConfirm();
      reminder.classList.toggle('hidden', !(selected === '4' && energyId));
    }
    function draw() {
      d.body.querySelector('[data-sta-flow]').innerHTML = flow();
      d.body.querySelector('[data-sta-text]').innerHTML = textArea();
      d.body.querySelectorAll('[data-opt]').forEach(el => el.addEventListener('click', () => {
        selected = el.getAttribute('data-opt');
        note = ''; // Her yeni seçimde notu temizle
        draw();
        const ta = d.body.querySelector('[data-sta-note]');
        if (ta) ta.focus();
      }));
      const ta = d.body.querySelector('[data-sta-note]');
      if (ta) {
        ta.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
        ta.addEventListener('input', () => { note = ta.value; d.body.querySelector('[data-sta-count]').textContent = note.length + '/300'; sync(); });
      }
      sync();
    }
    draw();
  }

  // processWor() sonucu: durum + usr/note JSON güncellemesi (WOR/S00/WOR_List/opr/set simülasyonu)
  function applyStatus(it, sta, note) {
    if (sta === 0) sta = 16; // orijinal: sta == 0 → 16 (İPTAL)
    const hex = sta === 16 ? '0x0300' : '0x030' + sta.toString(16).toUpperCase();
    const staText = getStaText(sta);
    const noteObj = parseJsonObj(it.note);
    const usrObj = parseJsonObj(it.usr);
    delete noteObj[staText]; noteObj[staText] = note;
    delete usrObj[staText]; usrObj[staText] = DCIM.session.user().fullname || DCIM.session.user().usr;
    it.note = JSON.stringify(noteObj);
    it.usr = JSON.stringify(usrObj);
    it.sta = hex;
    const now = new Date();
    const no = getClassNo(hex);
    if (no === 2 && !it.tim_plan) it.tim_plan = now;
    if (no === 3 && !it.tim_begn) it.tim_begn = now;
    if (no === 4) it.tim_end = now;
    it.tim_upd = now;
    // setTimeout(() => this.refresh1(), 1000) karşılığı
    setTimeout(renderAll, 300);
  }

  // ---------------------------------------------------------------------------
  // Rapor (WorkOrderReportPopupComponent)
  // ---------------------------------------------------------------------------
  function openReport() {
    const today = new Date();
    const start = new Date(today.getTime() - 30 * 86400000);
    let data = [];
    const body =
      '<div class="-m-5 flex flex-col">' +
        '<div class="p-5 bg-white dark:bg-surface-card border-b border-slate-200 dark:border-slate-800 shrink-0">' +
          '<div class="flex flex-col sm:flex-row gap-4 items-end">' +
            '<div class="w-full sm:w-auto flex-1"><label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Başlangıç Tarihi (Açılış):</label>' +
              '<div class="relative"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><i class="pi pi-calendar text-sm"></i></span>' +
              '<input type="date" data-r-start value="' + fmtDateKey(start) + '" class="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-base border border-slate-300 dark:border-slate-700 rounded text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all cursor-pointer"></div></div>' +
            '<div class="w-full sm:w-auto flex-1"><label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Bitiş Tarihi (Açılış):</label>' +
              '<div class="relative"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><i class="pi pi-calendar text-sm"></i></span>' +
              '<input type="date" data-r-end value="' + fmtDateKey(today) + '" class="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-base border border-slate-300 dark:border-slate-700 rounded text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all cursor-pointer"></div></div>' +
            '<div class="w-full sm:w-auto flex-[0.5]"><button type="button" data-r-search class="w-full h-[38px] bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors shadow-sm flex justify-center items-center gap-2 uppercase tracking-wide cursor-pointer"><i class="pi pi-search"></i>Ara</button></div>' +
          '</div>' +
        '</div>' +
        '<div data-r-actions class="hidden px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
          '<div class="flex gap-2">' +
            '<button type="button" data-r-pdf class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-pdf"></i>PDF İndir</button>' +
            '<button type="button" data-r-excel class="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-excel"></i>Excel İndir</button>' +
          '</div>' +
          '<div data-r-count class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700"></div>' +
        '</div>' +
        '<div data-r-table class="flex-1 overflow-auto bg-white dark:bg-[#0f172a] relative min-h-[300px] max-h-[50vh] custom-scrollbar">' +
          '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
            '<div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-calendar-times text-2xl text-slate-400 dark:text-slate-500"></i></div>' +
            '<p class="text-sm font-medium">Lütfen bir tarih aralığı seçip arama yapın.</p>' +
          '</div>' +
        '</div>' +
      '</div>';
    const d = dialog({
      title: 'Sipariş Listesi Raporu Oluştur',
      subtitle: 'Sipariş verilerini filtreleyin ve dışa aktarın',
      variant: 'info',
      maxWidth: 'max-w-7xl',
      showCancel: false,
      confirmLabel: 'Kapat',
      body
    });
    const $ = s => d.body.querySelector(s);
    $('[data-r-search]').addEventListener('click', () => {
      const s = $('[data-r-start]').value;
      const e = $('[data-r-end]').value;
      if (!s || !e) { toast('Lütfen başlangıç ve bitiş tarihlerini seçiniz.', 'warning'); return; }
      if (s > e) { toast('Başlangıç tarihi bitiş tarihinden büyük olamaz!', 'error'); return; }
      const btn = $('[data-r-search]');
      btn.disabled = true;
      btn.innerHTML = '<i class="pi pi-spinner pi-spin"></i>Aranıyor...';
      $('[data-r-table]').innerHTML = '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">' +
        '<div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin mb-4"></div>' +
        '<span class="text-sm font-medium text-slate-600 dark:text-slate-300">Veriler yükleniyor...</span></div>';
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="pi pi-search"></i>Ara';
        data = LIST.filter(it => { const k = fmtDateKey(new Date(it.tim_open)); return k >= s && k <= e; })
          .sort((a, b) => new Date(a.tim_open) - new Date(b.tim_open)).map(mapRow);
        data.forEach((r, i) => { r.seqNo = i + 1; });
        renderReportTable();
      }, 650);
    });
    $('[data-r-pdf]').addEventListener('click', () => { toast('PDF raporu oluşturuldu!', 'success'); kit.exportPdf(); });
    $('[data-r-excel]').addEventListener('click', () => {
      if (!data.length) { toast('Excel oluşturmak için veri bulunmamaktadır.', 'warning'); return; }
      exportRows('Siparis_Listesi_Raporu_' + $('[data-r-start]').value + '_' + $('[data-r-end]').value, data);
    });

    function renderReportTable() {
      const actions = $('[data-r-actions]');
      const tbl = $('[data-r-table]');
      if (!data.length) {
        actions.classList.add('hidden');
        tbl.innerHTML = '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">Seçilen tarih aralığında veri bulunamadı.</p></div>';
        return;
      }
      actions.classList.remove('hidden');
      $('[data-r-count]').textContent = 'Toplam ' + data.length + ' kayıt';
      const th = l => '<th class="px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + esc(l) + '</th>';
      tbl.innerHTML = '<table class="w-full text-left border-collapse text-xs whitespace-nowrap">' +
        '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' +
          ['Sıra', 'İş Emri No', 'Sipariş No', 'Hizmet No', 'Sipariş Bildirim', 'Sipariş Planlama', 'Sipariş Başlama', 'Sipariş Tamamlanma', 'Geçen Zaman', 'Müşteri Adı', 'Enerji Ürün ID', 'Paket Adı', 'Sipariş Adı', 'En Son Not', 'Durum'].map(th).join('') +
        '</tr></thead><tbody>' +
        data.map(r => '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors ' + staR(r.statusNo) + '">' +
          '<td class="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono">' + r.seqNo + '</td>' +
          '<td class="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">' + esc(r.rid) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(r.ord_id) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(r.erp_id) + '</td>' +
          '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + esc(r.tim_open_formatted) + '</td>' +
          '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + esc(r.tim_plan_formatted) + '</td>' +
          '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + esc(r.tim_begn_formatted) + '</td>' +
          '<td class="px-3 py-2 text-slate-600 dark:text-slate-400">' + esc(r.tim_end_formatted) + '</td>' +
          '<td class="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">' + esc(r.elp_tim) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(r.customerName) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(r.energyProductId) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[150px] truncate" title="' + esc(r.svc_desc) + '">' + esc(r.svc_desc) + '</td>' +
          '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[150px] truncate" title="' + esc(r.wor_name) + '">' + esc(r.wor_name) + '</td>' +
          '<td class="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-[200px] truncate" title="' + esc(r.note_last) + '">' + esc(r.note_last) + '</td>' +
          '<td class="px-3 py-2"><span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ' + staC(r.statusNo) + '">' + esc(STA_FULL[r.statusNo] || r.statusText) + '</span></td>' +
        '</tr>').join('') +
        '</tbody></table>';
    }
    return d;
  }

  // ---------------------------------------------------------------------------
  // Yeni İş Emri Oluştur (sunum eki — orijinalde iş emirleri ERP/WOR entegrasyonundan gelir)
  // ---------------------------------------------------------------------------
  const toLocalInput = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + 'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());

  function openCreate() {
    const I = kit.INPUT_CLS;
    const due = new Date(Date.now() + 48 * 3600000);
    due.setMinutes(0, 0, 0);
    const techOpts = WO.technicians.map(t => ({ value: t.name, label: t.name + ' — ' + t.team }));
    const body =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3" data-form>' +
        '<div class="sm:col-span-2">' + kit.formField({ label: 'Sipariş Adı', hint: 'İş emri başlığı', required: true, control: '<input type="text" data-in="title" maxlength="120" placeholder="Örn. Kabin 1AV43 Server Montajı (4U)" class="' + I + '" />' }) + '</div>' +
        kit.formField({ label: 'Hizmet Tipi', control: kit.select('data-in="type"', WO.services.map(s => ({ value: s.value, label: s.label })), 'fault') }) +
        kit.formField({ label: 'Öncelik', required: true, control: kit.select('data-in="prio"', Object.keys(PRIORITY).map(k => ({ value: k, label: PRIORITY[k].label })), 'medium') }) +
        kit.formField({ label: 'Kabin / Ekipman', required: true, control: kit.select('data-in="target"', [{ value: '', label: '-Seçiniz-' }].concat(WO.targets), '') }) +
        kit.formField({ label: 'Müşteri Adı', control: '<input type="text" data-in="customer" placeholder="Kabin seçildiğinde otomatik doldurulur" class="' + I + '" />' }) +
        kit.formField({ label: 'Atanan Teknisyen', required: true, control: kit.select('data-in="tech"', techOpts, 'Emre Çelik') }) +
        kit.formField({ label: 'Termin Tarihi', required: true, control: '<input type="datetime-local" data-in="due" value="' + toLocalInput(due) + '" class="' + I + '" />' }) +
        '<div class="sm:col-span-2">' + kit.formField({ label: 'Açıklama', hint: 'En fazla 300 karakter', control: '<textarea data-in="note" rows="3" maxlength="300" placeholder="Arıza / çalışma açıklaması..." class="' + I + ' resize-y"></textarea>' }) + '</div>' +
        '<div class="sm:col-span-2 p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] flex items-center gap-2 text-slate-500 dark:text-slate-400">' +
          '<i class="pi pi-info-circle text-sky-500"></i><span>Kayıt <b class="text-slate-700 dark:text-slate-200">YENİ</b> durumunda WOR/S00 iş emri listesine eklenir; planlama ve atama akışı durum rozetinden yürütülür.</span>' +
        '</div>' +
      '</div>';
    const d = dialog({
      title: 'Yeni İş Emri Oluştur',
      subtitle: WO.locMain,
      variant: 'info',
      maxWidth: 'max-w-2xl',
      confirmLabel: 'Kaydet',
      confirmIcon: 'pi pi-save',
      cancelLabel: 'İptal',
      body,
      onConfirm: () => save()
    });
    const $ = k => d.body.querySelector('[data-in="' + k + '"]');
    $('target').addEventListener('change', () => {
      const t = $('target').value;
      if (!t) return;
      $('customer').value = WO.locate(t).customer;
      if (!$('title').value.trim()) $('title').value = t + ' ';
    });
    setTimeout(() => $('title').focus(), 50);

    function mark(el, bad) {
      el.classList.toggle('border-rose-500', bad);
      el.classList.toggle('dark:border-rose-500', bad);
    }
    function save() {
      const title = $('title').value.trim();
      const target = $('target').value;
      const dueVal = $('due').value;
      mark($('title'), !title); mark($('target'), !target); mark($('due'), !dueVal);
      if (!title || !target || !dueVal) { toast('Lütfen zorunlu alanları doldurun.', 'warning', 'UYARI!'); return false; }
      const dueDate = new Date(dueVal);
      if (dueDate.getTime() < Date.now()) { mark($('due'), true); toast('Termin tarihi geçmiş bir zaman olamaz.', 'warning', 'UYARI!'); return false; }

      const loc = WO.locate(target);
      const svc = WO.services.find(s => s.value === $('type').value) || WO.services[0];
      const tech = $('tech').value;
      const noteTxt = $('note').value.trim();
      const user = DCIM.session.user();
      const item = {
        rid: 'WR' + String(WO.nextSeq()).padStart(12, '0'),
        ord_id: WO.nextOrd(),
        erp_id: '-',
        sta: '0x0301',
        tim_open: new Date(),
        tim_plan: null,
        tim_begn: null,
        tim_end: null,
        cat_main: 'DCIM Operasyon',
        cat_sub1: svc.label,
        asn_grp: (WO.technicians.find(t => t.name === tech) || {}).team || '-',
        svc_id: svc.id,
        svc_name: svc.label + ' — ' + target,
        svc_desc: svc.pkg,
        loc_area: 'Ankara',
        loc_main: WO.locMain,
        loc_sub1: loc.loc_sub1,
        wor_name: title,
        usr: noteTxt ? JSON.stringify({ 'YENİ': user.fullname || user.usr }) : '',
        note: noteTxt ? JSON.stringify({ 'YENİ': noteTxt }) : '',
        jsn: { prm1: { customer_name: $('customer').value.trim() || loc.customer, cabinet_info: loc.cabinet || target, room_info: WO.room }, prm2: { energy_limit: '', energy_product_id: '', service_number: '' } },
        prio: $('prio').value,
        asn_usr: tech,
        tim_due: dueDate,
        target: target,
        target_kind: loc.kind
      };
      LIST.unshift(item);
      // Yeni kayıt görünür olsun: YENİ'yi gizleyen filtreleri kaldır, ilk sayfaya dön
      if (state.quick !== 'all' && state.quick !== '0x0301') state.quick = 'all';
      if (state.kpi && state.kpi !== 'open') state.kpi = '';
      state.sortField = '';
      state.page = 1;
      state.flashRid = item.rid;
      renderAll();
      toast(item.rid + ' numaralı iş emri oluşturuldu ve ' + tech + ' adına atandı.', 'success', 'İş Emri Oluşturuldu');
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Ana çizim
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderKpis();
    renderToolbar();
    renderHead();
    renderBody();
  }

  renderHeader();
  renderTableShell();
  renderAll();

  // interval(30000) → detectChanges karşılığı: Geçen Zaman / termin rozetleri tazelenir
  setInterval(renderBody, 30000);

  // Derin bağlantılar
  const byKey = key => {
    if (!key) return null;
    const k = key.toUpperCase();
    return LIST.find(x => x.rid === key) || LIST.find(x => (x.target || '').toUpperCase() === k && [0, 4].indexOf(getClassNo(x.sta)) < 0) ||
      LIST.find(x => (x.target || '').toUpperCase() === k);
  };
  const openKey = byKey(params.get('open'));
  const statusKey = byKey(params.get('status'));
  if (openKey) openDetails(openKey.rid);
  else if (statusKey) openStatus(statusKey.rid);
  else if (params.get('new') === '1') openCreate();
  else if (params.get('report') === '1') openReport();
})();
