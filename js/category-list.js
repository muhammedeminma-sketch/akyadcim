/* ==========================================================================
   DCIM Sunum — Model Kütüphanesi
   Kaynak: new-ui/pages/assets/category-list   (NewUICMPCategoryListComponent)
           new-ui/pages/assets/category-manager (NewUICMPCategoryManagerComponent)
           shared/components/data-table (app-data-table: arama, sütun filtre satırı, 50 satır/sayfa, mobil kartlar)
           shared/components/report-export-menu ("Model Kütüphanesi Raporu": Filtrelenmiş liste, 'limit', birim 'model')
   Tek sayfa: liste varsayılan; /dcim/assets/category-manager/:cat_id rotası aynı sayfada
   yönetim görünümü olarak açılır (liste → yönetim geçişi URL hash'i ile, geri tuşu çalışır).
   Model kütüphanesi tek CAT tablosudur (eski CAT_IDC4 ayrımı yok): liste "SELECT … FROM CAT", yönetim CAT'ten cat_id / model_id ile.
   Liste süzgeçleri (arama, sütun filtreleri, nitelik çipi, filtre satırı, sayfa) sessionStorage 'dcim_catlist_state'te
   tutulur (orijinal catService.catListState): yönetimden ya da başka sayfadan dönünce korunur.
   Veri: DCIM.data.catList (js/mock-data.js) — SQL_QueryCat / getCatById / updateCatalogItem yerine.

   Derin bağlantılar:
     category-list.html?cat=CAT1003          → CAT1003 kategori yönetimi (ayrıca #cat=CAT1003)
     category-list.html?cat=CAT1003&port=PSU1 → yönetim + ilgili portun düzenleme penceresi
     category-list.html?view=cards           → kart görünümü (tablo varsayılan)
     category-list.html?nature=PDU           → nitelik (kategori) filtresi
     category-list.html?q=dell               → arama çubuğu
     category-list.html?filter=1             → sütun filtre satırı açık
     category-list.html?new=model            → Yeni Model penceresi (?new=nature → Yeni Nitelik)
     category-list.html?report=1             → rapor menüsü açık
     category-list.html?reset=1              → kayıtlı liste süzgeçlerini temizle
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtNum, dialog, toast, storage } = DCIM.ui;
  const K = DCIM.kit;
  const C = DCIM.data.catList;
  DCIM.shell.init({ active: 'models' });

  // ---------------------------------------------------------------------------
  // Etiketler (messages.tr.json → assetCatList / assetCatManager / assetCatReport)
  // ---------------------------------------------------------------------------
  const L = {
    assetManagement: 'Varlık Yönetimi',
    listTitle: 'KATEGORİ LİSTESİ',
    filter: 'Filtre', toggleFilter: 'Filtreyi Aç/Kapat', refresh: 'Yenile', refreshTitle: 'Yenile', report: 'Rapor', apply: 'Uygula',
    pageSize: 'Sayfa Başına Kayıt', totalRecords: 'Toplam Kayıt:',
    firstTitle: 'İlk Sayfa', lastTitle: 'Son Sayfa', prevTitle: 'Önceki Sayfa', nextTitle: 'Sonraki Sayfa',
    phName: 'Model Adı', phBrand: 'Marka', phNature: 'Nitelik', phFullName: 'Tam Ad',
    colName: 'Model Adı', colBrand: 'Marka', colNature: 'Nitelik', colFullName: 'Tam Model Adı',
    errConnection: 'Bağlantı hatası! Veri alınamıyor.', errNoData: 'Veri bulunamadı veya bekleniyor...', errEmpty: 'Gösterilecek veri bulunamadı.',
    mgrTitle: 'KATEGORİ YÖNETİMİ', save: 'Kaydet', deviceDetails: 'Cihaz Detayları', imagesAndPorts: 'Cihaz Görselleri & Port Yönetimi',
    labelModelId: 'Model ID', labelModelName: 'Model Adı', labelBrand: 'Marka', labelNature: 'Nitelik', labelFullModelName: 'Tam Model Adı',
    labelUCapacity: 'U Kapasitesi', labelWeight: 'Ağırlık', labelNominalPower: 'Nominal Güç', labelPower: 'Güç', labelPowerConnCount: 'Güç Bağlantı Sayısı',
    frontImage: 'Ön Görsel', backImage: 'Arka Görsel', zoomIn: 'Yakınlaştır', zoomOut: 'Uzaklaştır', resetView: 'Görünümü Sıfırla',
    aiAnalyzing: 'YZ Portları Analiz Ediyor...', noImage: 'Görsel Yok', changeImage: 'Görseli Değiştir', addImage: 'Görsel Ekle', removeImage: 'Görseli Kaldır',
    sorting: 'Sıralama:', analyzing: 'Analiz Ediliyor...', analyzeWithAI: 'YZ ile Analiz Et', stopAddingPort: 'Port Eklemeyi Durdur', addPort: 'Port Ekle',
    clickImageToAddPort: 'Yeni port eklemek için görsele tıklayın'
  };
  const PM = {
    titleEdit: 'Port Düzenle', titleNew: 'Yeni Port Ekle', newPort: 'Yeni Port', capacityDetail: '(Kapasite Detayları)',
    section1Title: '1. Kimlik & Mantık (Core Identity)', section2Title: '2. Fiziksel Konektör (Connector)',
    section3Title: '3. Ağ Yetenekleri (Capabilities)', section4Title: '4. Güç Kapasiteleri (Power Capabilities)',
    uiSettingsTitle: 'Görsel Arayüz (UI) Ayarları', mgmtNotesTitle: 'Yönetim & Notlar',
    labelPortName: 'Port Adı *', placeholderPortName: 'ör. Eth1/1, p25',
    warnDuplicatePort: 'Uyarı: Bu port adı zaten mevcut. Kaydedilirse tüm portlar yeniden numaralandırılacak.',
    labelHardwareLabel: 'Donanım Etiketi', labelAdminRole: 'Admin Rolü', autoNumber: 'Otomatik Numaralandırmaya Dahil Et',
    labelConnectorType: 'Konektör Tipi', labelSupportedMedia: 'Desteklenen Ortam Tipleri', labelSupportedProtocols: 'Desteklenen Protokoller',
    labelSpeedCapabilities: 'Hız Yetenekleri', labelPoeCap: 'PoE Yeteneği', labelPowerIo: 'Giriş / Çıkış', labelMaxWatt: 'Max Güç (Watt)',
    warnPowerPre: 'Redundancy Riski: Tek port (', warnPowerMid: 'W) cihazın Typical gücünü (', warnPowerSuf: 'W) karşılamıyor.',
    labelMaxAmp: 'Max Akım (Amper)', labelShape: 'Şekil', shapeCircle: 'Daire', shapeSquare: 'Kare', shapeRect: 'Dikdörtgen', labelColor: 'Renk',
    labelDefaultStatus: 'Varsayılan Durum', statusEnabled: 'Aktif (Enabled)', statusDisabled: 'Pasif (Disabled)', labelDescription: 'Açıklama',
    btnDelete: 'SİL', btnCancel: 'İPTAL', btnUpdate: 'GÜNCELLE', btnSave: 'KAYDET',
    warnInconsistent: 'Dikkat: Seçilen port rolü ve konektör tipi fiziksel olarak uyumsuz görünüyor. Emin misiniz?'
  };
  const RP = {
    title: 'Kategori Listesi (CAT) Raporu', description: 'Rapor, sistemdeki tüm kategori listesini içerecektir.',
    fetchingData: 'Veri Çekiliyor...', fetchAllData: 'Tüm Veriyi Getir', pdfGenerating: 'PDF Oluşturuluyor...', pdfDownload: 'PDF İndir',
    excelGenerating: 'Excel Oluşturuluyor...', excelDownload: 'Excel İndir', recordCount1: 'Toplam ', recordCount2: ' kayıt bulundu.',
    loading: 'Veriler yükleniyor...', noData: 'Sistemde kategori kaydı bulunamadı.', moreResults1: '...ve ', moreResults2: ' kayıt daha (PDF veya Excel raporlarında tümü eklenecek).'
  };

  // ---------------------------------------------------------------------------
  // Şablon sınıfları (orijinal şablonlardan birebir)
  // ---------------------------------------------------------------------------
  const BTN_SEC = 'px-2.5 py-1.5 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed';
  const BTN_ON = 'px-2.5 py-1.5 text-xs font-bold rounded-[2px] border border-sky-600 bg-sky-600 text-white hover:bg-sky-500 flex items-center gap-1.5 transition-all cursor-pointer select-none';
  const BTN_PRI = 'px-3 py-1.5 text-xs font-bold rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed';
  const BTN_ADD = 'px-3 py-1.5 text-xs font-bold rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer select-none';
  const INP = 'w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const INP_M = 'w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const LBL = 'block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1';
  const PG_BTN = 'w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer';
  const SM_BTN = 'px-2.5 py-1 text-xs font-semibold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const SECTION = 'p-3 bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px] space-y-3';
  const SECTION_H = 'font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 pb-1.5 text-xs';
  const CHIP = 'px-2.5 py-1 text-[11px] font-semibold rounded-[2px] border transition-all cursor-pointer select-none';
  const CHIP_ON = CHIP + ' bg-sky-600 text-white border-sky-600';
  const CHIP_OFF = CHIP + ' border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
  const BOX_HEAD = 'p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-base text-xs select-none';
  const CARD_BOX = 'bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden';

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const natureIcon = n => { const x = C.natures.find(k => k.key === n); return x ? x.icon : 'pi pi-tag'; };
  const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const fmtW = v => { const n = num(v); return n == null ? '-' : fmtNum(n, 0); };
  const fmtKg = v => { const n = num(v); return n == null ? '-' : fmtNum(n, n % 1 ? 1 : 0); };
  const fmtU = v => { const n = num(v); return n == null ? '-' : n + 'U'; };
  const portCount = (jsn, side) => ((jsn && jsn.ports) || []).filter(p => p.side === side).length;
  const clone = o => JSON.parse(JSON.stringify(o));
  const qs = new URLSearchParams(window.location.search);

  // formatModelId (category-list.component.ts)
  function formatModelId(rawId, fallbackId) {
    const val = rawId != null && String(rawId).trim() !== '' ? String(rawId).trim()
      : (fallbackId != null && String(fallbackId).trim() !== '' ? String(fallbackId).trim() : '');
    if (!val) return '';
    if (/^m\d+$/i.test(val)) return 'M' + val.substring(1).padStart(4, '0');
    if (/^\d+$/.test(val)) return 'M' + val.padStart(4, '0');
    return val;
  }
  function parseCatListData(data) {
    return data.map(item => ({
      cat_id: item.cat_id != null ? item.cat_id : (item.model_id != null ? item.model_id : (item.id != null ? item.id : '')),
      name: item.name != null ? item.name : (item.cat_name || ''),
      brand: item.brand != null ? item.brand : (item.manufacturer || ''),
      nature: item.nature != null ? item.nature : (item.device_type || ''),
      full_name: item.full_name != null ? item.full_name : (item.fullname || ''),
      model_id: formatModelId(item.model_id, item.cat_id != null ? item.cat_id : item.id),
      // Sunum eki: katalog kartı / ek kolonlar için jsn özet alanları
      jsn: item.jsn || {},
      installed: item.installed || 0
    }));
  }

  // ===========================================================================
  // LİSTE (NewUICMPCategoryListComponent)
  // ===========================================================================
  const listEl = document.getElementById('cl-list');
  const listHost = document.getElementById('cl-list-host');
  const mgrHost = document.getElementById('cl-manager-host');
  const mgrEl = document.getElementById('cl-manager');

  // Liste durumu: arama, sütun filtreleri, nitelik çipi, filtre satırı ve sayfa sessionStorage 'dcim_catlist_state'te
  // tutulur (orijinal catService.catListState — yönetim ekranından / başka sayfadan dönünce süzgeçler korunur).
  const STORE_KEY = 'dcim_catlist_state';
  if (qs.get('reset') === '1') storage.sessionRemove(STORE_KEY);
  let saved = null;
  try { saved = JSON.parse(storage.sessionGet(STORE_KEY) || 'null'); } catch (e) { saved = null; }
  if (['q', 'nature', 'filter'].some(k => qs.has(k))) saved = null;
  saved = saved || {};
  const st = {
    allRaw: [], rows: [], isLoading: false, cnt1: 0,
    // Sunum eki: liste / kart (katalog) görünümü
    view: qs.get('view') === 'cards' ? 'cards' : qs.get('view') === 'table' ? 'table' : (storage.get('dcim_catlist_view') === 'cards' ? 'cards' : 'table'),
    nature: qs.get('nature') || saved.nature || '',
    search: qs.get('q') || saved.search || '',
    showFilters: qs.get('filter') === '1' || !!saved.showFilters,
    filters: saved.filters || {},
    page: saved.page || 1,
    pageSize: saved.pageSize || 50   // orijinal page_rng = 50
  };
  let dt = null;
  let reportMenu = null;
  let loadTimer = null;

  function getConClass() { return st.cnt1 >= 2 ? 'con0' : 'con1'; }
  function saveState() {
    if (!dt) return;
    const s = dt.state;
    st.search = s.search; st.filters = s.filters; st.showFilters = s.showFilters; st.page = s.page; st.pageSize = s.pageSize; st.nature = s.quick || '';
    storage.sessionSet(STORE_KEY, JSON.stringify({ search: st.search, filters: st.filters, showFilters: st.showFilters, page: st.page, pageSize: st.pageSize, nature: st.nature }));
  }

  // refresh1(forceReload) — SQL_QueryCat ("SELECT … FROM CAT", tek model kütüphanesi tablosu) yerine DCIM.data.catList.list()
  function refresh1(force) {
    if (!force && st.allRaw.length) { processCatData(st.allRaw); return; }
    st.isLoading = true;
    st.cnt1 = 2;
    if (dt) dt.renderTools();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      st.allRaw = C.list();
      processCatData(st.allRaw);
    }, force ? 380 : 0);
  }
  function processCatData(raw) {
    st.rows = parseCatListData(raw);
    st.cnt1 = 0;
    st.isLoading = false;
    if (!dt) return;
    dt.renderTools();
    dt.setRows(st.rows);
  }

  // ---- Sütunlar (columns: model_id_label → primary, name → sub pi-tag, brand / nature → meta, full_name → secondary) ----
  const modelBtn = (el, card) => '<button type="button" data-open-cat="' + esc(el.cat_id) + '" class="font-mono ' +
    (card ? 'font-extrabold' : 'font-bold text-[11px] hover:underline') + ' text-sky-600 dark:text-sky-400 text-left cursor-pointer">' + esc(el.model_id) + '</button>';
  const COLS = [
    { field: 'model_id', header: 'Model ID', width: '110px', wrap: false, sortable: true, mobile: 'primary',
      value: r => r.model_id, render: r => modelBtn(r, false), card: r => modelBtn(r, true) },
    { field: 'name', header: L.colName, sortable: true, mobile: 'sub', mobileIcon: 'pi-tag', render: r => '<span class="font-bold text-slate-900 dark:text-slate-100">' + esc(r.name) + '</span>', card: r => esc(r.name) },
    { field: 'brand', header: L.colBrand, sortable: true, mobile: 'meta' },
    { field: 'nature', header: L.colNature, sortable: true, mobile: 'meta',
      render: r => '<span class="inline-flex items-center gap-1.5"><i class="' + natureIcon(r.nature) + ' text-[10px] text-sky-600 dark:text-sky-400"></i>' + esc(r.nature) + '</span>' },
    // Sunum eki kolonlar: U / Güç / Ağırlık / Ön-Arka port (mobilde "Detayları Göster")
    { field: 'u', header: 'U', width: '56px', wrap: false, sortable: true, filterable: false, mobile: 'extra', value: r => num(r.jsn.ucapacity), render: r => '<span class="font-mono">' + fmtU(r.jsn.ucapacity) + '</span>', card: r => fmtU(r.jsn.ucapacity) },
    { field: 'power', header: 'Güç (W)', width: '80px', wrap: false, sortable: true, filterable: false, mobile: 'extra', value: r => num(r.jsn.power), render: r => '<span class="font-mono">' + fmtW(r.jsn.power) + '</span>', card: r => fmtW(r.jsn.power) },
    { field: 'weight', header: 'Ağırlık (kg)', width: '92px', wrap: false, sortable: true, filterable: false, mobile: 'extra', value: r => num(r.jsn.weight), render: r => '<span class="font-mono">' + fmtKg(r.jsn.weight) + '</span>', card: r => fmtKg(r.jsn.weight) },
    { field: 'ports', header: 'Ön / Arka Port', width: '104px', wrap: false, filterable: false, mobile: 'extra', value: r => portCount(r.jsn, 'front'),
      render: r => '<span class="font-mono whitespace-nowrap">' + portCount(r.jsn, 'front') + ' <span class="text-slate-400">/</span> ' + (r.nature === 'Patch Panel' ? '<span class="text-slate-400">—</span>' : portCount(r.jsn, 'back')) + '</span>' },
    { field: 'full_name', header: L.colFullName, sortable: true, mobile: 'secondary', render: r => '<span class="text-slate-600 dark:text-slate-400">' + esc(r.full_name) + '</span>' }
  ];

  // ---- Kart (katalog) görünümü — sunum eki; tablo kutusunun içinde, aynı süzme ve sayfalama ----
  function cardsHtml(rows) {
    if (!rows.length) return '<div class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="text-xs font-semibold">' + L.errEmpty + '</span></div>';
    const tile = (label, val) => '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-800 rounded-[2px] px-1 py-1 text-center min-w-0">' +
      '<div class="text-[9px] font-bold text-slate-400 uppercase tracking-wide">' + label + '</div><div class="text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 truncate">' + val + '</div></div>';
    return '<div class="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">' +
      rows.map(el => {
        const j = el.jsn || {};
        const pp = el.nature === 'Patch Panel';
        const img = j.front_img
          ? '<img src="' + esc(j.front_img) + '" alt="" class="block max-w-full max-h-full w-auto h-auto object-contain rounded-[2px] select-none pointer-events-none" />'
          : '<div class="text-slate-400 dark:text-slate-600 text-xs flex flex-col items-center gap-1"><i class="' + natureIcon(el.nature) + ' text-3xl"></i><span class="text-[10px]">' + L.noImage + '</span></div>';
        return '<button type="button" data-open-cat="' + esc(el.cat_id) + '" class="group text-left bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px] hover:border-sky-500 dark:hover:border-sky-500/60 hover:shadow-md transition-all flex flex-col overflow-hidden cursor-pointer">' +
          '<div class="cl-card-thumb relative h-28 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-center p-3">' + img +
            '<span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/30 flex items-center gap-1 backdrop-blur-xs"><i class="' + natureIcon(el.nature) + ' text-[9px]"></i>' + esc(el.nature) + '</span>' +
            '<span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-extrabold bg-slate-900/70 text-white border border-slate-700">' + fmtU(j.ucapacity) + '</span>' +
          '</div>' +
          '<div class="p-2.5 flex flex-col gap-2 flex-1">' +
            '<div class="flex items-center justify-between gap-2"><span class="font-mono text-[10px] font-bold text-sky-600 dark:text-sky-400">' + esc(el.model_id) + '</span><span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">' + esc(el.brand) + '</span></div>' +
            '<div class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-tight line-clamp-2 min-h-[2rem] group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">' + esc(el.name) + '</div>' +
            '<div class="grid grid-cols-4 gap-1">' + tile('Güç', fmtW(j.power) + (num(j.power) != null ? 'W' : '')) + tile('Ağırlık', fmtKg(j.weight) + (num(j.weight) != null ? 'kg' : '')) + tile('Ön', portCount(j, 'front')) + tile('Arka', pp ? '—' : portCount(j, 'back')) + '</div>' +
            '<div class="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-auto pt-1 border-t border-slate-200 dark:border-slate-800">' +
              '<span class="flex items-center gap-1"><i class="pi pi-building text-[10px]"></i>' + (el.installed ? 'Sahada <b class="text-slate-700 dark:text-slate-200 font-mono">' + el.installed + '</b> adet' : 'Sahada kurulu yok') + '</span>' +
              '<span class="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">Yönet <i class="pi pi-arrow-right text-[9px]"></i></span>' +
            '</div>' +
          '</div>' +
        '</button>';
      }).join('') + '</div>';
  }
  function afterBody(pageRows, start, host) {
    const scroll = host.querySelector('[data-dt-scroll]');
    const table = scroll.querySelector('table');
    let grid = scroll.querySelector('[data-cl-grid]');
    if (!grid) { grid = document.createElement('div'); grid.setAttribute('data-cl-grid', ''); scroll.appendChild(grid); }
    const cards = st.view === 'cards';
    table.style.display = cards ? 'none' : '';
    grid.innerHTML = cards ? cardsHtml(pageRows) : '';
    renderViewToggle();
    const filtered = dt ? dt.getFiltered() : [];
    if (reportMenu) reportMenu.update({ total: filtered.length, disabled: !filtered.length });
  }
  function renderViewToggle() {
    const vt = listEl.querySelector('[data-viewtoggle]');
    if (!vt) return;
    const b = (v, icon, label) => '<button type="button" data-view="' + v + '" title="' + label + ' görünümü" class="px-2 py-1 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ' +
      (st.view === v ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700') + '"><i class="' + icon + ' text-xs"></i><span class="hidden 2xl:inline">' + label + '</span></button>';
    vt.innerHTML = b('table', 'pi pi-list', 'Liste') + b('cards', 'pi pi-objects-column', 'Kart');
  }

  // Nitelik çipleri (sunum eki) → data-table hızlı filtreleri; sayı tüm katalog üzerinden
  function quickFilters() {
    const counts = {};
    st.rows.forEach(i => { counts[i.nature] = (counts[i.nature] || 0) + 1; });
    const keys = C.natures.map(n => n.key);
    Object.keys(counts).forEach(k => { if (keys.indexOf(k) < 0) keys.push(k); });
    return [{ label: 'Tümü (' + st.rows.length + ')', value: '' }].concat(keys.map(k => ({ label: k + ' (' + (counts[k] || 0) + ')', value: k })));
  }

  // ---- Başlık + data-table ----------------------------------------------------
  function headerActionsHtml() {
    return '<div class="flex items-center gap-2 max-lg:hidden">' +
      // Sunum eki: yeni nitelik / yeni model
      '<button type="button" data-act="new-nature" class="' + BTN_SEC + '" title="Yeni nitelik (kategori) tanımla"><i class="pi pi-folder-plus text-xs"></i><span>Yeni Nitelik</span></button>' +
      '<button type="button" data-act="new-model" class="' + BTN_ADD + '" title="Kataloğa yeni cihaz modeli ekle"><i class="pi pi-plus text-xs"></i><span>Yeni Model</span></button>' +
    '</div>';
  }
  function renderHeaderActions() { /* başlık düğmeleri durumdan bağımsız */ }
  function renderChips() {
    // Yeni nitelik eklenince hızlı filtre çiplerini yeniden kur (durum korunur)
    if (!dt) return;
    saveState();
    mountTable();
  }

  function mountTable() {
    const host = listEl.querySelector('[data-databox]');
    if (reportMenu) { reportMenu.destroy(); reportMenu = null; }
    dt = K.dataTable(host, {
      columns: COLS,
      rows: st.rows,
      rowKey: r => r.cat_id,
      search: st.search, filters: st.filters, showFilters: st.showFilters,
      quickFilters: quickFilters(), quick: st.nature, quickFn: (r, v) => !v || r.nature === v,
      page: st.page, pageSize: st.pageSize, mobileCards: true,
      conStatus: getConClass,
      emptyText: st.isLoading ? L.errNoData : L.errEmpty,
      actions: '<div data-viewtoggle class="flex items-center border border-slate-200 dark:border-slate-700 rounded-[2px] overflow-hidden shrink-0 max-lg:hidden"></div><div data-cl-report></div>',
      onRefresh: () => refresh1(true),
      onChange: saveState,
      afterBody
    });
    reportMenu = DCIM.report.menu(host.querySelector('[data-cl-report]'), {
      scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }],
      options: 'limit', unit: 'model', total: dt.getFiltered().length, inTable: true, disabled: !dt.getFiltered().length,
      onExport: exportReport
    });
    renderViewToggle();
  }

  function renderList() {
    listEl.innerHTML =
      K.pageHeader({
        title: L.listTitle,
        breadcrumbs: [{ label: L.assetManagement }, { label: L.listTitle }],
        actions: headerActionsHtml()
      }).replace('mb-3 pb-2', 'shrink-0 mb-0 pb-2') +
      '<div data-databox class="flex-1 min-h-0 flex flex-col"></div>';
    if (!st.rows.length) st.rows = parseCatListData(C.list());
    mountTable();
  }

  // ---- Olaylar (liste) ------------------------------------------------------
  listEl.addEventListener('click', e => {
    const open = e.target.closest('[data-open-cat]');
    if (open) { saveState(); openCatManager(open.getAttribute('data-open-cat')); return; }
    const vw = e.target.closest('[data-view]');
    if (vw) { st.view = vw.getAttribute('data-view'); storage.set('dcim_catlist_view', st.view); dt.renderBody(); return; }
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    const a = act.getAttribute('data-act');
    if (a === 'new-model') openNewModel();
    else if (a === 'new-nature') openNewNature();
  });

  // ===========================================================================
  // RAPOR (app-report-export-menu → exportReport: "Model Kütüphanesi Raporu")
  // ===========================================================================
  function reportFilterText() {
    const labels = { model_id: 'Model ID', name: 'Model Adı', brand: 'Marka', nature: 'Nitelik', full_name: 'Tam Model Adı' };
    const f = (dt && dt.state.filters) || {};
    const parts = Object.keys(labels).filter(k => f[k] && String(f[k]).trim()).map(k => labels[k] + ': ' + String(f[k]).trim());
    if (dt && dt.state.quick) parts.push('Nitelik: ' + dt.state.quick);
    return parts.join(', ');
  }
  function exportReport(req) {
    const all = dt.getFiltered();
    const rows = DCIM.report.applyLimit(all, req);
    const fmt = req.format === 'pdf' ? 'PDF' : req.format === 'xlsx' ? 'Excel' : 'CSV';
    const q = dt.state.search.trim();
    const filters = [q ? 'arama "' + q + '"' : '', reportFilterText()].filter(Boolean);
    const b = DCIM.report.busy(rows.length + ' model · ' + fmt + ' raporu hazırlanıyor');
    setTimeout(() => {
      b.close();
      DCIM.report.generate({
        title: 'Model Kütüphanesi Raporu',
        subtitle: [filters.length ? 'Filtre: ' + filters.join(', ') : 'Tüm modeller', req.limit ? 'İlk ' + req.limit + ' / ' + all.length + ' model' : 'Tümü (' + all.length + ' model)'].join(' · '),
        filename: 'Model_Kutuphanesi',
        kpis: [
          { label: 'Model', value: rows.length },
          { label: 'Marka', value: new Set(rows.map(i => i.brand).filter(Boolean)).size },
          { label: 'Nitelik', value: new Set(rows.map(i => i.nature).filter(Boolean)).size }
        ],
        sections: [{
          title: 'Model listesi',
          columns: [
            { key: 'model_id', label: 'Model ID' }, { key: 'name', label: 'Model Adı' }, { key: 'brand', label: 'Marka' },
            { key: 'nature', label: 'Nitelik' }, { key: 'full_name', label: 'Tam Model Adı' }
          ],
          rows: rows.map(i => ({ model_id: i.model_id, name: i.name, brand: i.brand, nature: i.nature, full_name: i.full_name }))
        }],
        notes: ['Varlık Yönetimi · ' + rows.length + ' / ' + st.rows.length + ' model']
      }, req.format);
      toast('Model Kütüphanesi Raporu (' + fmt + ') oluşturuldu: ' + rows.length + ' kayıt.', 'success', 'Rapor');
    }, 600);
  }
  function openReport() {
    const btn = listEl.querySelector('[data-cl-report] [data-rk-btn]');
    if (btn) btn.click();
  }

  // ===========================================================================
  // YENİ MODEL / YENİ NİTELİK (sunum eki — orijinalde CAT kaydı XDB/SQL tarafında açılır)
  // ===========================================================================
  function openNewModel() {
    const natureOpts = C.natures.map(n => '<option value="' + esc(n.key) + '"></option>').join('');
    const f = (id, label, ph, type, req, extra) =>
      '<div><label for="' + id + '" class="' + LBL + '">' + label + (req ? ' <span class="text-rose-500">*</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" data-nm="' + id + '" placeholder="' + esc(ph || '') + '" class="' + INP_M + '" ' + (extra || '') + ' /></div>';
    const body =
      '<div class="space-y-3">' +
        '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">Model Kimliği</h4>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
            f('brand', 'Marka', 'ör. Dell, HPE, Raritan', 'text', true, 'list="cl-brand-list"') +
            f('name', 'Model Adı', 'ör. PowerEdge R760', 'text', true) +
            '<div><label for="nature" class="' + LBL + '">Nitelik (Kategori) <span class="text-rose-500">*</span></label>' +
              '<input id="nature" type="text" data-nm="nature" list="cl-nature-list" value="' + esc(st.nature || 'Sunucu') + '" class="' + INP_M + '" /><datalist id="cl-nature-list">' + natureOpts + '</datalist></div>' +
            f('full_name', 'Tam Model Adı', 'Boş bırakılırsa Marka + Model') +
          '</div>' +
          '<datalist id="cl-brand-list">' + Array.from(new Set(C.list().map(c => c.brand))).sort().map(b => '<option value="' + esc(b) + '"></option>').join('') + '</datalist>' +
        '</div>' +
        '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">Fiziksel & Güç</h4>' +
          '<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">' +
            f('ucapacity', 'U Kapasitesi', '1', 'number', false, 'min="0" max="52" value="1"') +
            f('weight', 'Ağırlık (kg)', '0', 'number', false, 'min="0" step="0.1"') +
            f('power', 'Güç (W)', '0', 'number', false, 'min="0"') +
            f('nominal_power', 'Nominal Güç (W)', '0', 'number', false, 'min="0"') +
            f('power_connection_numbers', 'Güç Bağlantı Sayısı', '2', 'number', false, 'min="0" value="2"') +
          '</div>' +
        '</div>' +
        '<p data-nm-err class="hidden text-[11px] text-rose-500 font-semibold flex items-center gap-1"><i class="pi pi-exclamation-circle text-[10px]"></i>Marka, Model Adı ve Nitelik zorunludur.</p>' +
        '<p class="text-[10px] text-slate-400">Kayıttan sonra kategori yönetimi açılır; ön/arka görsel ve port şablonu orada tanımlanır.</p>' +
      '</div>';
    dialog({
      title: 'Yeni Model Ekle', subtitle: 'Donanım kataloğuna (CAT) yeni cihaz modeli', variant: 'confirm', maxWidth: 'max-w-2xl',
      confirmLabel: 'Oluştur ve Yönet', confirmIcon: 'pi pi-check', body,
      onConfirm(h) {
        const v = k => { const el = h.querySelector('[data-nm="' + k + '"]'); return el ? el.value.trim() : ''; };
        if (!v('brand') || !v('name') || !v('nature')) { h.querySelector('[data-nm-err]').classList.remove('hidden'); return false; }
        const n = k => (v(k) === '' ? '' : Number(v(k)));
        const c = C.create(
          { name: v('name'), brand: v('brand'), nature: v('nature'), full_name: v('full_name') || (v('brand') + ' ' + v('name')) },
          { ucapacity: n('ucapacity'), weight: n('weight'), power: n('power'), nominal_power: n('nominal_power'), power_connection_numbers: n('power_connection_numbers') }
        );
        if (!C.natures.some(x => x.key === c.nature)) C.natures.push({ key: c.nature, icon: 'pi pi-tag' });
        st.allRaw = C.list();
        toast(c.model_id + ' — ' + c.full_name + ' kataloğa eklendi.', 'success', 'Yeni Model');
        setTimeout(() => openCatManager(c.cat_id), 0);
        return true;
      }
    });
  }

  function openNewNature() {
    const ICONS = [['pi pi-tag', 'Etiket'], ['pi pi-desktop', 'Konsol / KVM'], ['pi pi-microchip', 'Donanım Modülü'], ['pi pi-wifi', 'Kablosuz'], ['pi pi-box', 'Aksesuar'], ['pi pi-sun', 'Soğutma'], ['pi pi-lock', 'Kilit / Erişim'], ['pi pi-warehouse', 'Depo Rafı']];
    const body =
      '<div class="space-y-3">' +
        '<div><label for="nn_name" class="' + LBL + '">Nitelik Adı <span class="text-rose-500">*</span></label><input id="nn_name" type="text" data-nn="name" placeholder="ör. KVM, Rack Soğutucu, Kilit Denetleyici" class="' + INP_M + '" /></div>' +
        '<div><label class="' + LBL + '">İkon</label><div class="flex flex-wrap gap-1.5">' +
          ICONS.map((ic, i) => '<label class="cursor-pointer"><input type="radio" name="nn_icon" value="' + ic[0] + '"' + (i === 0 ? ' checked' : '') + ' class="peer hidden" />' +
            '<span class="' + CHIP + ' flex items-center gap-1.5 border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-300 peer-checked:bg-sky-600 peer-checked:text-white peer-checked:border-sky-600"><i class="' + ic[0] + ' text-[10px]"></i>' + ic[1] + '</span></label>').join('') +
        '</div></div>' +
        '<p class="text-[10px] text-slate-400">Mevcut nitelikler: ' + esc(C.natures.map(n => n.key).join(', ')) + '</p>' +
        '<p data-nn-err class="hidden text-[11px] text-rose-500 font-semibold">Nitelik adı boş olamaz veya zaten mevcut.</p>' +
      '</div>';
    dialog({
      title: 'Yeni Nitelik (Kategori)', subtitle: 'Model kataloğu için cihaz niteliği', variant: 'info', confirmLabel: 'Ekle', confirmIcon: 'pi pi-plus', body,
      onConfirm(h) {
        const name = h.querySelector('[data-nn="name"]').value.trim();
        if (!name || C.natures.some(n => lc(n.key) === lc(name))) { h.querySelector('[data-nn-err]').classList.remove('hidden'); return false; }
        const icon = (h.querySelector('input[name="nn_icon"]:checked') || {}).value || 'pi pi-tag';
        C.natures.push({ key: name, icon });
        renderChips();
        toast('"' + name + '" niteliği eklendi. Yeni model eklerken seçebilirsiniz.', 'success', 'Yeni Nitelik');
        return true;
      }
    });
  }

  // ===========================================================================
  // KATEGORİ YÖNETİMİ (NewUICMPCategoryManagerComponent)
  // ===========================================================================
  const adminRoleOptions = ['Network', 'Console', 'Serial/Console', 'Management', 'Power', 'Power-Input', 'Power-Output', 'Ground', 'USB', 'Stack', 'Fiber-Patch'];
  const connectorTypeOptions = ['RJ45', 'LC-Duplex', 'SC-Simplex', 'MPO', 'SFP-Slot', 'SFP+Slot', 'C13', 'C14', 'C19', 'Schuko', 'L6-30P', 'USB-A', 'USB-B', 'USB-C', 'Micro-USB', 'DB9'];
  const mediaOptions = ['Copper', 'Fiber-SM', 'Fiber-MM OM3/4', 'Twinax', 'Wireless'];
  const protocolOptions = ['Ethernet', 'FibreChannel', 'Infiniband', 'Serial-RS232'];
  const speedOptions = ['10M', '100M', '1G', '10G', '25G', '40G', '100G'];
  const poeOptions = ['None', 'af', 'at', 'bt_Type3', 'bt_Type4'];

  let mg = null;
  const SIDES = ['front', 'back'];

  function loadCatDetails(catId) {
    const res = C.get(catId);
    if (!res) return null;
    let jsn = {};
    try { jsn = typeof res.jsn === 'string' && res.jsn.trim() ? JSON.parse(res.jsn) : (res.jsn || {}); } catch (e) { jsn = {}; }
    const s = v => (v !== undefined && v !== null ? String(v) : '');
    const d = {
      model_id: res.model_id || '', name: res.name || '', full_name: res.full_name || '', brand: res.brand || '', nature: res.nature || '',
      ucapacity: s(jsn.ucapacity), weight: s(jsn.weight), nominal_power: s(jsn.nominal_power), power: s(jsn.power),
      power_connection_numbers: s(jsn.power_connection_numbers),
      front_img: jsn.front_img || '', back_img: jsn.back_img || '',
      ports: Array.isArray(jsn.ports) ? jsn.ports : [],
      naming_logics: jsn.naming_logics || { front: jsn.naming_logic || 'linear', back: jsn.naming_logic || 'linear' }
    };
    return {
      catId, d,
      preview: { front: jsn.front_img || '', back: jsn.back_img || '' },
      customImg: { front: false, back: false },
      scale: { front: 1, back: 1 }, pan: { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } },
      loaded: { front: false, back: false }, analyzing: { front: false, back: false },
      panning: null, hasDragged: false,
      isEditMode: true, isCreatMode: false, portEditMode: '', zoomMenu: '',
      showPortModal: false, editingPort: null, portFormData: {}, uiOpen: false,
      isPatchPanel: d.nature === 'Patch Panel',
      namingLogics: clone(d.naming_logics),
      fromList: false
    };
  }

  const getPorts = side => (mg.d.ports || []).filter(p => p.side === side);
  const isPortSelected = p => !!(mg.editingPort && mg.editingPort.id === p.id);
  const wrapTransform = side => 'translate(' + mg.pan[side].x + 'px, ' + mg.pan[side].y + 'px) scale(' + mg.scale[side] + ')';

  function portGroupOf(role) {
    if (['Network', 'Management', 'Stack', 'Fiber-Patch'].indexOf(role) >= 0) return 'DATA';
    if ((role && role.indexOf('Power') === 0) || role === 'Ground') return 'POWER';
    if (['Console', 'Serial/Console'].indexOf(role) >= 0) return 'SERIAL';
    if (role === 'USB') return 'USB';
    return 'OTHER';
  }
  const portGroup = () => portGroupOf(mg.portFormData.admin_role);

  // ---- Şablon parçaları -----------------------------------------------------
  function mgrHeaderHtml() {
    const d = mg.d;
    return K.pageHeader({
      title: L.mgrTitle,
      breadcrumbs: [{ label: L.assetManagement }, { label: L.listTitle, href: 'category-list.html' }, { label: d.name || d.model_id || L.mgrTitle }],
      actions: '<div class="flex items-center gap-2">' +
        '<button type="button" data-mg="back" class="' + BTN_SEC + '"><i class="pi pi-arrow-left text-xs"></i><span>Geri</span></button>' +
        '<button type="button" id="btnSaveCat" data-mg="save" class="' + BTN_PRI + '"><i class="pi pi-save text-xs"></i><span>' + L.save + '</span></button>' +
      '</div>'
    });
  }

  function detailsHtml() {
    const d = mg.d;
    const fld = (id, label, ro) => '<div><label for="' + id + '" class="' + LBL + '">' + label + '</label>' +
      '<input type="text" id="' + id + '" name="' + id + '" data-dd="' + id + '" value="' + esc(d[id]) + '"' +
      (ro ? ' readonly class="w-full px-2.5 py-1.5 text-xs bg-slate-100 dark:bg-surface-base/60 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 font-mono cursor-not-allowed opacity-80"' : ' class="' + INP + '"') + ' /></div>';
    return '<div class="' + CARD_BOX + '">' +
      '<div class="' + BOX_HEAD + '"><div class="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200"><i class="pi pi-info-circle text-sky-600 dark:text-sky-400"></i><span>' + L.deviceDetails + '</span></div>' +
        '<span class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400"><i class="' + natureIcon(d.nature) + ' text-sky-600 dark:text-sky-400"></i>' + esc(d.nature) + '</span></div>' +
      '<div class="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">' +
        fld('model_id', L.labelModelId, true) + fld('name', L.labelModelName) + fld('brand', L.labelBrand) + fld('nature', L.labelNature) + fld('full_name', L.labelFullModelName) +
        fld('ucapacity', L.labelUCapacity) + fld('weight', L.labelWeight) + fld('nominal_power', L.labelNominalPower) + fld('power', L.labelPower) + fld('power_connection_numbers', L.labelPowerConnCount) +
      '</div></div>';
  }

  function hotspotsHtml(side) {
    if (!mg.loaded[side] || !mg.preview[side]) return '';
    const inv = +(1 / (mg.scale[side] || 1)).toFixed(4);
    const edit = mg.isEditMode || mg.isCreatMode;
    return getPorts(side).map(p =>
      '<div class="port-hotspot' + (edit ? ' edit-mode' : '') + (edit && isPortSelected(p) ? ' selected' : '') + ' shape-' + esc(p.shape || 'circle') + '" data-port-id="' + esc(p.id) + '" ' +
        'style="left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;background-color:' + esc(p.color || '#2196F3') + ';border-radius:' + ((p.shape || 'circle') === 'circle' ? '50%' : '2px') + ';transform:translate(-50%, -50%) scale(' + inv + ');position:absolute">' +
        '<span class="port-label">' + esc(p.name) + '</span></div>').join('');
  }

  function sideHtml(side) {
    const front = side === 'front';
    const label = front ? L.frontImage : L.backImage;
    const prev = mg.preview[side];
    const edit = mg.isEditMode || mg.isCreatMode;
    const adding = edit && mg.portEditMode === side;
    const logic = mg.namingLogics[side];
    const radio = (v, l) => '<label class="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="naming' + (front ? 'Front' : 'Back') + '" value="' + v + '" data-naming="' + side + '"' + (logic === v ? ' checked' : '') + ' class="accent-sky-600" /><span>' + l + '</span></label>';
    return '<div class="flex items-center justify-between">' +
        '<label class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><i class="pi pi-image text-sky-500 text-xs"></i><span>' + label + '</span>' +
          '<span class="ml-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">' + getPorts(side).length + ' port</span></label>' +
        '<div class="relative">' +
          '<button type="button" data-mg="zoom-menu" data-side="' + side + '" class="px-2 py-1 text-xs font-semibold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer" title="' + (front ? 'Görünüm Ayarları' : 'Arka Görsel Görünüm Ayarları') + '"><i class="pi pi-search text-xs"></i><i class="pi pi-chevron-down text-[10px]"></i></button>' +
          (mg.zoomMenu === side ? '<div class="cl-zoom-menu animate-fade-in">' +
            '<button type="button" data-mg="zoom-in" data-side="' + side + '"><i class="pi pi-search-plus text-xs mr-2"></i><span>' + L.zoomIn + '</span></button>' +
            '<button type="button" data-mg="zoom-out" data-side="' + side + '"><i class="pi pi-search-minus text-xs mr-2"></i><span>' + L.zoomOut + '</span></button>' +
            '<button type="button" data-mg="zoom-reset" data-side="' + side + '"><i class="pi pi-refresh text-xs mr-2"></i><span>' + L.resetView + '</span></button>' +
          '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div id="' + side + 'ImgViewport" data-img-vp="' + side + '" class="relative overflow-hidden border border-slate-200 dark:border-slate-800 rounded-[2px] bg-slate-100 dark:bg-slate-900 h-[260px] min-h-[260px] max-h-[260px] flex items-center justify-center p-3 select-none cursor-grab active:cursor-grabbing">' +
        '<div data-img-wrap="' + side + '" class="relative inline-block origin-center' + (adding ? ' cursor-crosshair' : '') + '" style="transform:' + wrapTransform(side) + ';transition:transform 0.15s ease-out">' +
          (mg.analyzing[side] ? '<div class="absolute inset-0 bg-sky-950/60 z-20 flex flex-col items-center justify-center border border-sky-400/50 rounded-[2px] overflow-hidden"><div class="absolute inset-0 bg-gradient-to-b from-sky-500/20 via-sky-400/40 to-sky-500/20 animate-pulse"></div><div class="relative z-10 flex flex-col items-center gap-2 text-sky-300 font-bold text-xs"><i class="pi pi-spin pi-spinner text-2xl"></i><span>' + L.aiAnalyzing + '</span></div></div>' : '') +
          (prev ? '<img src="' + esc(prev) + '" alt="' + label + '" data-img="' + side + '" class="block max-w-full max-h-[220px] w-auto h-auto rounded-[2px] select-none pointer-events-none" />'
            : '<div class="text-slate-400 dark:text-slate-600 text-xs flex flex-col items-center gap-1 py-8"><i class="pi pi-image text-3xl"></i><span>' + L.noImage + '</span></div>') +
          hotspotsHtml(side) +
        '</div>' +
      '</div>' +
      (edit ? '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-mg="upload" data-side="' + side + '" class="' + SM_BTN + '"><i class="pi pi-upload text-xs"></i><span>' + (prev ? L.changeImage : L.addImage) + '</span></button>' +
        '<button type="button" data-mg="remove-img" data-side="' + side + '"' + (prev ? '' : ' disabled') + ' class="px-2.5 py-1 text-xs font-semibold rounded-[2px] border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><i class="pi pi-trash text-xs"></i><span>' + L.removeImage + '</span></button>' +
        '<div class="flex items-center gap-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-xs"><span class="font-bold text-slate-500 dark:text-slate-400 text-[11px]">' + L.sorting + '</span>' + radio('linear', 'Linear') + radio('zigzag', 'Zigzag') + '</div>' +
        '<button type="button" data-mg="ai" data-side="' + side + '"' + (!prev || mg.analyzing[side] ? ' disabled' : '') + ' class="px-2.5 py-1 text-xs font-bold rounded-[2px] bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><i class="pi pi-sparkles text-xs' + (mg.analyzing[side] ? ' animate-spin' : '') + '"></i><span>' + (mg.analyzing[side] ? L.analyzing : L.analyzeWithAI) + '</span></button>' +
        '<button type="button" data-mg="add-port" data-side="' + side + '"' + (prev ? '' : ' disabled') + ' class="' + (adding
          ? 'px-2.5 py-1 text-xs font-bold rounded-[2px] border border-emerald-600 bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 transition-all cursor-pointer'
          : 'px-2.5 py-1 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed') + '">' +
          '<i class="pi ' + (adding ? 'pi-check' : 'pi-plus') + '"></i><span>' + (adding ? L.stopAddingPort : L.addPort) + '</span></button>' +
        '<input type="file" data-file="' + side + '" accept="image/*" class="hidden" />' +
      '</div>' : '') +
      (adding ? '<div class="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold rounded-[2px] flex items-center gap-2 animate-pulse"><i class="pi pi-info-circle text-xs"></i><span>' + L.clickImageToAddPort + '</span></div>' : '');
  }

  function imagesHtml() {
    return '<div class="' + CARD_BOX + '">' +
      '<div class="' + BOX_HEAD + '"><div class="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200"><i class="pi pi-image text-sky-600 dark:text-sky-400"></i><span>' + L.imagesAndPorts + '</span></div></div>' +
      '<div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">' +
        '<div data-side-box="front" class="p-3 bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px] flex flex-col gap-3">' + sideHtml('front') + '</div>' +
        (!mg.isPatchPanel ? '<div data-side-box="back" class="p-3 bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px] flex flex-col gap-3">' + sideHtml('back') + '</div>' : '') +
      '</div></div>';
  }

  // Port Portföyü (sunum eki): ön/arka port listesi + grup özetleri
  const GROUP_META = {
    DATA: { label: 'Veri', icon: 'pi pi-sitemap', cls: 'text-sky-600 dark:text-sky-400' },
    POWER: { label: 'Güç', icon: 'pi pi-bolt', cls: 'text-amber-600 dark:text-amber-400' },
    SERIAL: { label: 'Konsol', icon: 'pi pi-desktop', cls: 'text-slate-500 dark:text-slate-400' },
    USB: { label: 'USB', icon: 'pi pi-box', cls: 'text-purple-600 dark:text-purple-400' },
    OTHER: { label: 'Diğer', icon: 'pi pi-circle', cls: 'text-slate-500 dark:text-slate-400' }
  };
  function capacityText(p) {
    const g = portGroupOf(p.admin_role);
    if (g === 'DATA') return ((p.speed_capability || []).join(' / ') || '-') + (p.poe_capability && p.poe_capability !== 'None' ? ' · PoE ' + p.poe_capability : '');
    if (g === 'POWER') return (p.power_io_type || '-') + (p.max_watt ? ' · ' + fmtNum(p.max_watt, 0) + ' W' : '') + (p.max_amp ? ' · ' + p.max_amp + ' A' : '');
    return '-';
  }
  function portfolioSideHtml(side) {
    const list = getPorts(side).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const counts = {};
    list.forEach(p => { const g = portGroupOf(p.admin_role); counts[g] = (counts[g] || 0) + 1; });
    const chips = Object.keys(GROUP_META).filter(g => counts[g]).map(g =>
      '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 flex items-center gap-1"><i class="' + GROUP_META[g].icon + ' text-[9px] ' + GROUP_META[g].cls + '"></i>' + GROUP_META[g].label + ' <span class="font-mono">' + counts[g] + '</span></span>').join('');
    const rows = list.map(p => {
      const g = portGroupOf(p.admin_role);
      return '<tr data-port-row="' + esc(p.id) + '" class="hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer' + (isPortSelected(p) ? ' bg-sky-500/10' : '') + '">' +
        '<td class="py-1.5 px-2"><span class="inline-flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-100"><span class="w-2 h-2 shrink-0 ' + ((p.shape || 'circle') === 'circle' ? 'rounded-full' : 'rounded-[1px]') + '" style="background-color:' + esc(p.color || '#2196F3') + '"></span>' + esc(p.name) + '</span></td>' +
        '<td class="py-1.5 px-2 font-mono text-slate-500 dark:text-slate-400">' + esc(p.hardware_label || '-') + '</td>' +
        '<td class="py-1.5 px-2"><span class="inline-flex items-center gap-1 ' + GROUP_META[g].cls + '"><i class="' + GROUP_META[g].icon + ' text-[9px]"></i>' + esc(p.admin_role || '-') + '</span></td>' +
        '<td class="py-1.5 px-2 font-mono text-slate-700 dark:text-slate-300">' + esc(p.connector_type || '-') + '</td>' +
        '<td class="py-1.5 px-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">' + esc(capacityText(p)) + '</td>' +
        '<td class="py-1.5 px-2 text-right">' + (p.admin_status_default === 'Disabled'
          ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700">Pasif</span>'
          : '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">Aktif</span>') + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="p-3 bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px] flex flex-col gap-2 min-w-0">' +
      '<div class="flex flex-wrap items-center justify-between gap-2">' +
        '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><i class="pi pi-list text-sky-500 text-xs"></i>' + (side === 'front' ? 'Ön Yüz Portları' : 'Arka Yüz Portları') +
          '<span class="font-mono text-slate-400 font-semibold">(' + list.length + ')</span></span>' +
        '<div class="flex flex-wrap items-center gap-1">' + chips + '</div>' +
      '</div>' +
      (list.length
        ? '<div class="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-[2px] bg-white dark:bg-surface-card"><table class="w-full text-left border-collapse text-[11px]">' +
            '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900"><tr class="text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">' +
              '<th class="py-1.5 px-2">Port</th><th class="py-1.5 px-2">Etiket</th><th class="py-1.5 px-2">Rol</th><th class="py-1.5 px-2">Konektör</th><th class="py-1.5 px-2">Kapasite</th><th class="py-1.5 px-2 text-right">Durum</th></tr></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">' + rows + '</tbody></table></div>'
        : K.emptyState({ message: 'Bu yüzde tanımlı port yok', description: 'Görsel üzerinde "Port Ekle" veya "YZ ile Analiz Et" kullanın.', compact: true })) +
    '</div>';
  }
  function portfolioHtml() {
    const all = mg.d.ports || [];
    const tot = g => all.filter(p => portGroupOf(p.admin_role) === g).length;
    return '<div class="' + CARD_BOX + '">' +
      '<div class="' + BOX_HEAD + '"><div class="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200"><i class="pi pi-sitemap text-sky-600 dark:text-sky-400"></i><span>Port Portföyü</span>' +
          '<span class="text-slate-400 font-normal text-[11px]">Ön ' + getPorts('front').length + (mg.isPatchPanel ? '' : ' · Arka ' + getPorts('back').length) + '</span></div>' +
        '<div class="hidden sm:flex items-center gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">' +
          '<span class="flex items-center gap-1"><i class="pi pi-sitemap text-sky-500 text-[9px]"></i>Veri ' + tot('DATA') + '</span>' +
          '<span class="flex items-center gap-1"><i class="pi pi-bolt text-amber-500 text-[9px]"></i>Güç ' + tot('POWER') + '</span>' +
          '<span class="flex items-center gap-1"><i class="pi pi-desktop text-slate-400 text-[9px]"></i>Konsol ' + tot('SERIAL') + '</span>' +
          '<span class="flex items-center gap-1"><i class="pi pi-box text-purple-500 text-[9px]"></i>USB ' + tot('USB') + '</span>' +
        '</div></div>' +
      '<div class="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">' + portfolioSideHtml('front') + (mg.isPatchPanel ? '' : portfolioSideHtml('back')) + '</div>' +
    '</div>';
  }

  function renderManager() {
    mgrEl.innerHTML = '<div class="space-y-4">' + mgrHeaderHtml() + detailsHtml() + imagesHtml() + '<div data-portfolio>' + portfolioHtml() + '</div></div>';
    SIDES.forEach(bindImg);
  }
  function renderSide(side) {
    const box = mgrEl.querySelector('[data-side-box="' + side + '"]');
    if (box) { box.innerHTML = sideHtml(side); bindImg(side); }
  }
  function renderPortfolio() {
    const el = mgrEl.querySelector('[data-portfolio]');
    if (el) el.innerHTML = portfolioHtml();
  }
  function refreshPorts(side) {
    renderSide(side);
    renderPortfolio();
  }
  // onImageLoad(side): görsel yüklendikten sonra hotspot'lar çizilir
  function bindImg(side) {
    const img = mgrEl.querySelector('[data-img="' + side + '"]');
    if (!img) return;
    const done = () => {
      if (!mg || mg.loaded[side]) return;
      mg.loaded[side] = true;
      const wrap = mgrEl.querySelector('[data-img-wrap="' + side + '"]');
      if (wrap) wrap.insertAdjacentHTML('beforeend', hotspotsHtml(side));
    };
    if (img.complete && img.naturalWidth) done();
    else img.addEventListener('load', done, { once: true });
  }
  function applyTransform(side) {
    const wrap = mgrEl.querySelector('[data-img-wrap="' + side + '"]');
    if (!wrap) return;
    wrap.style.transform = wrapTransform(side);
    const inv = +(1 / mg.scale[side]).toFixed(4);
    wrap.querySelectorAll('.port-hotspot').forEach(h => { h.style.transform = 'translate(-50%, -50%) scale(' + inv + ')'; });
  }
  const zoom = (side, delta) => { mg.scale[side] = delta > 0 ? Math.min(5, +(mg.scale[side] + 0.25).toFixed(2)) : Math.max(0.5, +(mg.scale[side] - 0.25).toFixed(2)); applyTransform(side); };
  const resetView = side => { mg.scale[side] = 1; mg.pan[side] = { x: 0, y: 0 }; applyTransform(side); };

  // ---- sortAndNamePorts (birebir port) ---------------------------------------
  function sortAndNamePorts(side, logic) {
    if (!mg.d.ports) return;
    const currentLogic = typeof logic === 'string' ? logic : (mg.namingLogics[side] || 'linear');
    const config = { pattern: currentLogic.toLowerCase() === 'zigzag' ? 'Zigzag' : 'Linear', prefix: 'Port-', startIndex: 1, yTolerance: 0.10, xTolerance: 0.05 };
    const sidePorts = mg.d.ports.filter(p => p.side === side && p.is_included_in_sequence !== false && p.isAutoNumbered !== false);
    if (!sidePorts.length) return;
    let n = config.startIndex;
    if (config.pattern === 'Zigzag') {
      const yAvg = sidePorts.reduce((s, p) => s + p.y, 0) / sidePorts.length;
      const top = sidePorts.filter(p => p.y < yAvg).sort((a, b) => a.x - b.x);
      const bot = sidePorts.filter(p => p.y >= yAvg).sort((a, b) => a.x - b.x);
      let i = 0, j = 0;
      while (i < top.length || j < bot.length) {
        if (i < top.length && j < bot.length) {
          if (Math.abs(top[i].x - bot[j].x) <= config.xTolerance) { top[i].name = config.prefix + n++; bot[j].name = config.prefix + n++; i++; j++; }
          else if (top[i].x < bot[j].x) { top[i].name = config.prefix + n++; i++; }
          else { bot[j].name = config.prefix + n++; j++; }
        } else if (i < top.length) { top[i].name = config.prefix + n++; i++; }
        else { bot[j].name = config.prefix + n++; j++; }
      }
    } else {
      const rows = [];
      sidePorts.forEach(port => {
        const row = rows.find(r => Math.abs(port.y - r.reduce((s, p) => s + p.y, 0) / r.length) <= config.yTolerance);
        if (row) row.push(port); else rows.push([port]);
      });
      rows.sort((a, b) => a.reduce((s, p) => s + p.y, 0) / a.length - b.reduce((s, p) => s + p.y, 0) / b.length);
      rows.forEach(r => { r.sort((a, b) => a.x - b.x); r.forEach(p => { p.name = config.prefix + n++; }); });
    }
  }

  // ---- Görsel yükleme (handleImageSelection: max 1200px, JPEG 0.75) -----------
  function handleImageSelection(file, side) {
    if (!file) return;
    if (!file.type.match('image.*')) { toast('Lütfen geçerli bir resim dosyası seçin', 'error'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const maxDim = 1200;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; } else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL('image/jpeg', 0.75);
        mg.preview[side] = url;
        mg.d[side === 'front' ? 'front_img' : 'back_img'] = url;
        mg.customImg[side] = true;
        mg.loaded[side] = false;
        resetView(side);
        renderSide(side);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ---- YZ ile Analiz (localhost:8000/api/detect yerine şablon tespiti) --------
  function analyzeImageWithAI(side) {
    if (!mg.preview[side]) { toast('Lütfen önce bir görsel yükleyin.', 'warning'); return; }
    mg.analyzing[side] = true;
    renderSide(side);
    const catId = mg.catId;
    setTimeout(() => {
      if (!mg || mg.catId !== catId) return;
      mg.analyzing[side] = false;
      const found = mg.customImg[side] ? [] : C.detectTemplate(mg.d.model_id, side)
        .filter(t => !getPorts(side).some(p => Math.abs(p.x - t.x) < 0.012 && Math.abs(p.y - t.y) < 0.03));
      if (found.length) {
        const stamp = Date.now();
        found.forEach((t, i) => {
          mg.d.ports.push({
            id: 'ai_port_' + stamp + '_' + i, name: 'YZ-Port-' + (mg.d.ports.length + 1), side, x: t.x, y: t.y,
            shape: 'circle', type: 'eth', admin_role: 'Network', connector_type: 'RJ45', supported_media: ['Copper'], supported_protocols: ['Ethernet'],
            speed_capability: ['1G'], poe_capability: 'None', max_mtu: 1500, admin_status_default: 'Enabled', hardware_label: '', description: '',
            is_included_in_sequence: true, isAutoNumbered: true
          });
        });
        sortAndNamePorts(side, mg.namingLogics[side]);
        toast(found.length + ' adet port başarıyla tespit edildi.', 'success');
      } else {
        toast('Bu görselde port tespit edilemedi.', 'info');
      }
      refreshPorts(side);
    }, 2000);
  }

  // ---- Port modalı ----------------------------------------------------------
  const pmHost = document.createElement('div');
  document.body.appendChild(pmHost);

  function isPortNameDuplicate() {
    const f = mg.portFormData;
    if (!f.name) return false;
    return !!(mg.d.ports || []).find(p => p.name === f.name && p.side === f.side && (!mg.editingPort || p.id !== mg.editingPort.id));
  }
  function isPortInconsistent() {
    const role = mg.portFormData.admin_role;
    const conn = mg.portFormData.connector_type;
    if (!role || !conn) return false;
    const net = ['RJ45', 'SFP-Slot', 'SFP+Slot', 'LC-Duplex', 'SC-Simplex', 'MPO'];
    const pwr = ['C13', 'C14', 'C19', 'Schuko', 'L6-30P'];
    const usbC = ['USB-A', 'USB-B', 'USB-C', 'Micro-USB'];
    const con = ['RJ45', 'DB9', 'USB-C', 'Micro-USB'];
    if (['Network', 'Stack', 'Fiber-Patch', 'Management'].indexOf(role) >= 0) return net.indexOf(conn) < 0;
    if (['Power', 'Power-Input', 'Power-Output'].indexOf(role) >= 0) return pwr.indexOf(conn) < 0;
    if (role === 'USB') return usbC.indexOf(conn) < 0;
    if (['Console', 'Serial/Console'].indexOf(role) >= 0) return con.indexOf(conn) < 0;
    return false;
  }
  function getEstimatedAmp() {
    const w = mg.portFormData.max_watt;
    if (!w) return 'Örn: 2.17';
    return 'Tahmini: ' + (Number(w) / 230).toFixed(2) + 'A';
  }
  function isPowerInsufficient() {
    const f = mg.portFormData;
    if (portGroup() !== 'POWER' || !f.max_watt || !mg.d.power) return false;
    return Number(f.max_watt) < Number(mg.d.power);
  }

  function portModalHtml() {
    const f = mg.portFormData;
    const g = portGroup();
    const sel = (id, field, opts) => '<select id="' + id + '" name="' + id + '" data-pf="' + field + '" class="' + INP_M + '">' +
      opts.map(o => { const v = Array.isArray(o) ? o[0] : o; const l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(f[field]) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
    const ms = (field, opts) => '<div class="flex flex-wrap gap-1.5">' + opts.map(o => {
      const on = (f[field] || []).indexOf(o) >= 0;
      return '<button type="button" data-ms="' + field + '" data-opt="' + esc(o) + '" class="px-2.5 py-1 text-[11px] font-semibold rounded-[2px] border transition-all cursor-pointer select-none ' +
        (on ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' + esc(o) + '</button>';
    }).join('') + '</div>';
    const numInp = (id, field, ph) => '<input type="number" id="' + id + '" name="' + id + '" data-pf="' + field + '" value="' + esc(f[field] == null ? '' : f[field]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' class="' + INP_M + '" />';
    const roleIcon = { Console: 'pi pi-desktop text-slate-500', Network: 'pi pi-sitemap text-sky-500', Power: 'pi pi-bolt text-amber-500', Management: 'pi pi-cog text-emerald-500', Ground: 'pi pi-circle text-stone-500', USB: 'pi pi-box text-purple-500' }[f.admin_role];

    return '<div data-pm-overlay class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">' +
      '<div data-pm-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 animate-modal-pop">' +
        '<div class="p-3 px-4 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
          '<h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">' + (mg.editingPort ? PM.titleEdit : PM.titleNew) + '</h3>' +
          '<button type="button" data-pm="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base cursor-pointer">&times;</button>' +
        '</div>' +
        '<div class="px-4 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 font-mono">' +
          (roleIcon ? '<i class="' + roleIcon + '"></i>' : '') +
          '<span class="font-bold text-slate-800 dark:text-slate-200">' + esc(mg.d.model_id) + '</span>' +
          '<span data-pm-subtitle>- ' + esc(f.name || PM.newPort) + ' ' + PM.capacityDetail + '</span>' +
          '<span class="ml-auto text-[10px] text-slate-400">' + (f.side === 'front' ? 'Ön' : 'Arka') + ' · x ' + (f.x != null ? Number(f.x).toFixed(3) : '-') + ' · y ' + (f.y != null ? Number(f.y).toFixed(3) : '-') + '</span>' +
        '</div>' +
        '<div data-pm-body class="p-4 overflow-y-auto space-y-4 text-xs">' +
          '<div class="space-y-4">' +
            // 1. Kimlik & Mantık
            '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">' + PM.section1Title + '</h4>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                '<div><label for="portName" class="' + LBL + '">' + PM.labelPortName + '</label>' +
                  '<input type="text" id="portName" name="portName" data-pf="name" value="' + esc(f.name || '') + '" maxlength="50" placeholder="' + esc(PM.placeholderPortName) + '" class="' + INP_M + '" />' +
                  '<div data-pm-dup class="' + (isPortNameDuplicate() ? '' : 'hidden ') + 'text-amber-600 dark:text-amber-400 text-[11px] font-semibold mt-1">' + PM.warnDuplicatePort + '</div></div>' +
                '<div><label for="hardwareLabel" class="' + LBL + '">' + PM.labelHardwareLabel + '</label>' +
                  '<input type="text" id="hardwareLabel" name="hardwareLabel" data-pf="hardware_label" value="' + esc(f.hardware_label || '') + '" maxlength="50" placeholder="Örn: L5" class="' + INP_M + '" /></div>' +
              '</div>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                '<div><label for="adminRole" class="' + LBL + '">' + PM.labelAdminRole + '</label>' + sel('adminRole', 'admin_role', adminRoleOptions) + '</div>' +
                '<div class="flex items-end pb-1.5"><label class="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300 font-semibold' + (f.admin_role === 'Console' ? ' opacity-50' : '') + '">' +
                  '<input type="checkbox" name="is_included_in_sequence" data-pf="is_included_in_sequence"' + (f.is_included_in_sequence ? ' checked' : '') + (f.admin_role === 'Console' ? ' disabled' : '') + ' class="accent-sky-600" /><span>' + PM.autoNumber + '</span></label></div>' +
              '</div>' +
            '</div>' +
            // 2. Fiziksel Konektör
            '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">' + PM.section2Title + '</h4>' +
              '<div><label for="connectorType" class="' + LBL + '">' + PM.labelConnectorType + '</label>' + sel('connectorType', 'connector_type', connectorTypeOptions) + '</div>' +
              (g === 'DATA' ? '<div><label class="' + LBL + '">' + PM.labelSupportedMedia + '</label>' + ms('supported_media', mediaOptions) + '</div>' : '') +
            '</div>' +
            // 3. Ağ Yetenekleri
            (g === 'DATA' ? '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">' + PM.section3Title + '</h4>' +
              '<div><label class="' + LBL + '">' + PM.labelSupportedProtocols + '</label>' + ms('supported_protocols', protocolOptions) + '</div>' +
              '<div><label class="' + LBL + '">' + PM.labelSpeedCapabilities + '</label>' + ms('speed_capability', speedOptions) + '</div>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                '<div><label for="poeCap" class="' + LBL + '">' + PM.labelPoeCap + '</label>' + sel('poeCap', 'poe_capability', poeOptions) + '</div>' +
                '<div><label for="maxMtu" class="' + LBL + '">Max MTU</label>' + numInp('maxMtu', 'max_mtu') + '</div>' +
              '</div>' +
            '</div>' : '') +
            // 4. Güç Kapasiteleri
            (g === 'POWER' ? '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">' + PM.section4Title + '</h4>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                '<div><label for="powerIo" class="' + LBL + '">' + PM.labelPowerIo + '</label>' + sel('powerIo', 'power_io_type', ['Input', 'Output']) + '</div>' +
                '<div><label for="maxWatt" class="' + LBL + '">' + PM.labelMaxWatt + '</label>' + numInp('maxWatt', 'max_watt') +
                  '<div data-pm-pwr class="' + (isPowerInsufficient() ? '' : 'hidden ') + 'mt-1 p-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[11px] rounded-[2px] flex items-center gap-1"><i class="pi pi-exclamation-triangle text-xs"></i><span data-pm-pwr-text>' +
                    esc(PM.warnPowerPre + (f.max_watt || '') + PM.warnPowerMid + (mg.d.power || '') + PM.warnPowerSuf) + '</span></div></div>' +
              '</div>' +
              '<div><label for="maxAmp" class="' + LBL + '">' + PM.labelMaxAmp + '</label>' + numInp('maxAmp', 'max_amp', getEstimatedAmp()) + '</div>' +
            '</div>' : '') +
            // Görsel Arayüz Ayarları
            '<details data-pm-ui class="p-3 bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-800 rounded-[2px]"' + (mg.uiOpen ? ' open' : '') + '>' +
              '<summary class="font-bold text-slate-800 dark:text-slate-200 text-xs cursor-pointer select-none">' + PM.uiSettingsTitle + '</summary>' +
              '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">' +
                '<div><label for="portShape" class="' + LBL + '">' + PM.labelShape + '</label>' + sel('portShape', 'shape', [['circle', PM.shapeCircle], ['square', PM.shapeSquare], ['rect', PM.shapeRect]]) + '</div>' +
                '<div><label for="portColor" class="' + LBL + '">' + PM.labelColor + '</label><input type="color" id="portColor" name="portColor" data-pf="color" value="' + esc(f.color || '#2196F3') + '" class="w-full h-8 p-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] cursor-pointer" /></div>' +
              '</div>' +
            '</details>' +
            // 5. Yönetim & Notlar
            '<div class="' + SECTION + '"><h4 class="' + SECTION_H + '">' + PM.mgmtNotesTitle + '</h4>' +
              '<div><label for="adminStatus" class="' + LBL + '">' + PM.labelDefaultStatus + '</label>' + sel('adminStatus', 'admin_status_default', [['Enabled', PM.statusEnabled], ['Disabled', PM.statusDisabled]]) + '</div>' +
              '<div><label for="description" class="' + LBL + '">' + PM.labelDescription + '</label><textarea id="description" name="description" data-pf="description" rows="2" class="' + INP_M + '">' + esc(f.description || '') + '</textarea></div>' +
            '</div>' +
            // Eylemler
            '<div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">' +
              (mg.editingPort ? '<button type="button" data-pm="delete" class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-rose-600 hover:bg-rose-500 text-white transition-all cursor-pointer mr-auto">' + PM.btnDelete + '</button>' : '<div class="mr-auto"></div>') +
              (isPortInconsistent() ? '<div class="text-amber-500 cursor-help flex items-center justify-center" title="' + esc(PM.warnInconsistent) + '"><i class="pi pi-exclamation-triangle text-base"></i></div>' : '') +
              '<button type="button" data-pm="close" class="px-3 py-1.5 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer">' + PM.btnCancel + '</button>' +
              '<button type="button" data-pm="save"' + ((f.name || '').trim() ? '' : ' disabled') + ' class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">' + (mg.editingPort ? PM.btnUpdate : PM.btnSave) + '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function renderPortModal() {
    if (!mg || !mg.showPortModal) { pmHost.innerHTML = ''; return; }
    const body = pmHost.querySelector('[data-pm-body]');
    const top = body ? body.scrollTop : 0;
    pmHost.innerHTML = portModalHtml();
    const nb = pmHost.querySelector('[data-pm-body]');
    if (nb && top) nb.scrollTop = top;
  }
  function openPortModal(port, fresh) {
    mg.editingPort = port || null;
    mg.portFormData = fresh || clone(port);
    if (mg.portFormData.is_included_in_sequence === undefined) {
      mg.portFormData.is_included_in_sequence = mg.portFormData.isAutoNumbered !== undefined ? mg.portFormData.isAutoNumbered : true;
    }
    mg.showPortModal = true;
    renderPortModal();
    // Seçili pin vurgusu
    if (mg.portFormData.side) refreshPorts(mg.portFormData.side);
  }
  function closePortModal() {
    const side = mg.portFormData && mg.portFormData.side;
    mg.showPortModal = false;
    mg.editingPort = null;
    mg.portFormData = {};
    renderPortModal();
    if (side) refreshPorts(side);
  }
  function onAdminRoleChange() {
    const f = mg.portFormData;
    const g = portGroup();
    f.is_included_in_sequence = g === 'DATA';
    f.color = g === 'DATA' ? '#2196F3' : '#F44336';
    if (g !== 'DATA') { f.supported_media = []; f.supported_protocols = []; f.poe_capability = 'None'; }
    if (g !== 'POWER') { f.max_watt = null; f.max_amp = null; }
  }
  function doSavePort(reindex) {
    const f = mg.portFormData;
    if (!mg.d.ports) mg.d.ports = [];
    if (f.is_included_in_sequence === undefined) f.is_included_in_sequence = true;
    f.isAutoNumbered = f.is_included_in_sequence;
    if (mg.editingPort) {
      const idx = mg.d.ports.findIndex(p => p.id === mg.editingPort.id);
      if (idx !== -1) mg.d.ports[idx] = Object.assign({}, f);
    } else {
      mg.d.ports.push(Object.assign({}, f));
    }
    const side = f.side;
    closePortModal();
    sortAndNamePorts(side, mg.namingLogics[side]);
    refreshPorts(side);
    if (reindex) toast('Port isimleri fiziksel konuma göre yeniden düzenlendi.', 'info', 'Akıllı Sıralama');
  }
  function savePort() {
    if (!(mg.portFormData.name || '').trim()) return;
    if (isPortNameDuplicate()) {
      dialog({
        title: 'Port Adı Mevcut', variant: 'warning', confirmLabel: 'Yeniden Sırala ve Kaydet',
        body: '<p>Bu port ismi mevcut. İsimleri fiziksel konuma göre yeniden sıralayıp kaydırmak ister misiniz?</p>',
        onConfirm() { doSavePort(true); }
      });
      return;
    }
    doSavePort(false);
  }
  function deletePortFromModal() {
    if (!mg.editingPort) return;
    dialog({
      title: 'Port Sil', variant: 'danger', confirmLabel: 'Sil', confirmIcon: 'pi pi-trash',
      body: '<p>Bu portu silmek istediğinize emin misiniz?</p><p class="mt-1 font-mono text-slate-500">' + esc(mg.d.model_id + ' · ' + mg.editingPort.name) + '</p>',
      onConfirm() {
        const side = mg.editingPort.side;
        mg.d.ports = mg.d.ports.filter(p => p.id !== mg.editingPort.id);
        sortAndNamePorts(side, mg.namingLogics[side]);
        closePortModal();
        toast('Port silindi.', 'success');
      }
    });
  }

  pmHost.addEventListener('click', e => {
    if (!mg) return;
    if (e.target.matches('[data-pm-overlay]')) { closePortModal(); return; }
    const msb = e.target.closest('[data-ms]');
    if (msb) {
      const field = msb.getAttribute('data-ms');
      const opt = msb.getAttribute('data-opt');
      const arr = mg.portFormData[field] = mg.portFormData[field] || [];
      const i = arr.indexOf(opt);
      if (i === -1) arr.push(opt); else arr.splice(i, 1);
      renderPortModal();
      return;
    }
    const b = e.target.closest('[data-pm]');
    if (!b || b.disabled) return;
    const a = b.getAttribute('data-pm');
    if (a === 'close') closePortModal();
    else if (a === 'save') savePort();
    else if (a === 'delete') deletePortFromModal();
  });
  pmHost.addEventListener('input', e => {
    if (!mg || !e.target.matches('[data-pf]')) return;
    const field = e.target.getAttribute('data-pf');
    if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') return; // change ile işlenir
    const f = mg.portFormData;
    f[field] = e.target.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value;
    if (field === 'name') {
      const dup = pmHost.querySelector('[data-pm-dup]');
      if (dup) dup.classList.toggle('hidden', !isPortNameDuplicate());
      const sub = pmHost.querySelector('[data-pm-subtitle]');
      if (sub) sub.textContent = '- ' + (f.name || PM.newPort) + ' ' + PM.capacityDetail;
      const sv = pmHost.querySelector('[data-pm="save"]');
      if (sv) sv.disabled = !(f.name || '').trim();
    } else if (field === 'max_watt') {
      const w = pmHost.querySelector('[data-pm-pwr]');
      if (w) {
        w.classList.toggle('hidden', !isPowerInsufficient());
        w.querySelector('[data-pm-pwr-text]').textContent = PM.warnPowerPre + (f.max_watt || '') + PM.warnPowerMid + (mg.d.power || '') + PM.warnPowerSuf;
      }
      const amp = pmHost.querySelector('[data-pf="max_amp"]');
      if (amp) amp.placeholder = getEstimatedAmp();
    }
  });
  pmHost.addEventListener('change', e => {
    if (!mg || !e.target.matches('[data-pf]')) return;
    const field = e.target.getAttribute('data-pf');
    const f = mg.portFormData;
    if (e.target.type === 'checkbox') {
      f[field] = e.target.checked;
      // onAutoNumberChange
      f.color = f.is_included_in_sequence ? '#2196F3' : '#F44336';
      f.isAutoNumbered = f.is_included_in_sequence;
      renderPortModal();
    } else if (e.target.tagName === 'SELECT') {
      f[field] = e.target.value;
      if (field === 'admin_role') onAdminRoleChange();
      renderPortModal();
    }
  });
  pmHost.addEventListener('toggle', e => { if (mg && e.target.matches && e.target.matches('[data-pm-ui]')) mg.uiOpen = e.target.open; }, true);

  // ---- Port tooltip (showPortTooltip / hidePortTooltip) ----------------------
  const tip = document.createElement('div');
  tip.className = 'fixed z-50 pointer-events-none bg-slate-900/90 text-white text-xs px-2.5 py-1.5 rounded-[2px] shadow-lg border border-slate-700 font-mono hidden';
  document.body.appendChild(tip);
  const hideTip = () => tip.classList.add('hidden');

  // ---- Yönetim olayları -----------------------------------------------------
  mgrEl.addEventListener('click', e => {
    if (!mg) return;
    const crumb = e.target.closest('a[href="category-list.html"]');
    if (crumb) { e.preventDefault(); goBack(); return; }
    const hs = e.target.closest('.port-hotspot');
    if (hs) {
      e.stopPropagation();
      if (!(mg.isEditMode || mg.isCreatMode)) return;
      const p = mg.d.ports.find(x => x.id === hs.getAttribute('data-port-id'));
      if (p) openPortModal(p);
      return;
    }
    const row = e.target.closest('[data-port-row]');
    if (row) {
      const p = mg.d.ports.find(x => x.id === row.getAttribute('data-port-row'));
      if (p) openPortModal(p);
      return;
    }
    const b = e.target.closest('[data-mg]');
    if (b) {
      if (b.disabled) return;
      const a = b.getAttribute('data-mg');
      const side = b.getAttribute('data-side');
      if (a === 'back') goBack();
      else if (a === 'save') saveCat(b);
      else if (a === 'zoom-menu') { e.stopPropagation(); const prev = mg.zoomMenu; mg.zoomMenu = prev === side ? '' : side; if (prev && prev !== side) renderSide(prev); renderSide(side); }
      else if (a === 'zoom-in' || a === 'zoom-out' || a === 'zoom-reset') {
        mg.zoomMenu = '';
        renderSide(side);
        if (a === 'zoom-in') zoom(side, 1); else if (a === 'zoom-out') zoom(side, -1); else resetView(side);
      }
      else if (a === 'upload') { const fi = mgrEl.querySelector('[data-file="' + side + '"]'); if (fi) fi.click(); }
      else if (a === 'remove-img') {
        mg.preview[side] = ''; mg.d[side === 'front' ? 'front_img' : 'back_img'] = ''; mg.loaded[side] = false; mg.customImg[side] = false;
        resetView(side); renderSide(side);
      }
      else if (a === 'ai') analyzeImageWithAI(side);
      else if (a === 'add-port') { mg.portEditMode = mg.portEditMode === side ? '' : side; SIDES.forEach(renderSide); }
      return;
    }
    // onImageClick → yeni port
    const wrap = e.target.closest('[data-img-wrap]');
    if (wrap) {
      const side = wrap.getAttribute('data-img-wrap');
      if (mg.hasDragged || !(mg.isEditMode || mg.isCreatMode) || mg.portEditMode !== side) return;
      const r = wrap.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const xr = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const yr = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      openPortModal(null, {
        id: 'port_' + Date.now(),
        name: 'Port-' + ((mg.d.ports || []).filter(p => p.is_included_in_sequence !== false && p.isAutoNumbered !== false).length + 1),
        side, x: +xr.toFixed(4), y: +yr.toFixed(4), color: '#2196F3', shape: 'circle', type: 'eth',
        admin_role: 'Network', connector_type: 'RJ45', supported_media: ['Copper'], supported_protocols: ['Ethernet'], speed_capability: ['1G'],
        poe_capability: 'None', max_mtu: 1500, admin_status_default: 'Enabled', hardware_label: '', description: '',
        is_included_in_sequence: true, isAutoNumbered: true
      });
    }
  });
  mgrEl.addEventListener('input', e => {
    if (!mg) return;
    if (e.target.matches('[data-dd]')) {
      const k = e.target.getAttribute('data-dd');
      if (k !== 'model_id') mg.d[k] = e.target.value;
    }
  });
  mgrEl.addEventListener('change', e => {
    if (!mg) return;
    if (e.target.matches('[data-naming]')) mg.namingLogics[e.target.getAttribute('data-naming')] = e.target.value;
    else if (e.target.matches('[data-file]')) { handleImageSelection(e.target.files && e.target.files[0], e.target.getAttribute('data-file')); e.target.value = ''; }
  });
  mgrEl.addEventListener('mouseover', e => {
    const hs = e.target.closest('.port-hotspot');
    if (!hs || !mg) return;
    const p = mg.d.ports.find(x => x.id === hs.getAttribute('data-port-id'));
    if (!p) return;
    tip.innerHTML = '<pre class="m-0 font-mono text-xs">' + esc('Port: ' + p.name) + '</pre>';
    tip.style.left = (e.clientX + 10) + 'px';
    tip.style.top = (e.clientY + 10) + 'px';
    tip.classList.remove('hidden');
  });
  mgrEl.addEventListener('mouseout', e => { if (e.target.closest('.port-hotspot') || e.target.closest('[data-img-wrap]')) hideTip(); });
  // Pan / sürükleme
  mgrEl.addEventListener('mousedown', e => {
    if (!mg || e.button !== 0) return;
    const vp = e.target.closest('[data-img-vp]');
    if (!vp || e.target.closest('.port-hotspot') || e.target.closest('button') || e.target.closest('input')) return;
    const side = vp.getAttribute('data-img-vp');
    mg.panning = { side, startX: e.clientX, startY: e.clientY, initX: mg.pan[side].x, initY: mg.pan[side].y };
    mg.hasDragged = false;
    const wrap = vp.querySelector('[data-img-wrap]');
    if (wrap) wrap.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!mg || !mg.panning) return;
    const p = mg.panning;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) mg.hasDragged = true;
    mg.pan[p.side] = { x: p.initX + dx, y: p.initY + dy };
    const wrap = mgrEl.querySelector('[data-img-wrap="' + p.side + '"]');
    if (wrap) wrap.style.transform = wrapTransform(p.side);
  });
  document.addEventListener('mouseup', () => {
    if (!mg || !mg.panning) return;
    const side = mg.panning.side;
    mg.panning = null;
    const wrap = mgrEl.querySelector('[data-img-wrap="' + side + '"]');
    if (wrap) wrap.style.transition = 'transform 0.15s ease-out';
    setTimeout(() => { if (mg) mg.hasDragged = false; }, 60);
  });
  mgrEl.addEventListener('wheel', e => {
    if (!mg) return;
    const vp = e.target.closest('[data-img-vp]');
    if (!vp) return;
    e.preventDefault();
    zoom(vp.getAttribute('data-img-vp'), e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  document.addEventListener('click', () => {
    if (mg && mg.zoomMenu) { const s = mg.zoomMenu; mg.zoomMenu = ''; renderSide(s); }
  });

  // ---- Kaydet (saveCat → catService.updateCatalogItem) ------------------------
  function saveCat(btn) {
    btn.setAttribute('disabled', 'true');
    const d = mg.d;
    d.naming_logics = clone(mg.namingLogics);
    d.front_img = mg.preview.front || '';
    d.back_img = mg.preview.back || '';
    const jsn = {
      ucapacity: d.ucapacity, weight: d.weight, nominal_power: d.nominal_power, power: d.power, power_connection_numbers: d.power_connection_numbers,
      front_img: d.front_img, back_img: d.back_img, ports: d.ports || [], naming_logics: d.naming_logics
    };
    const catData = { name: d.name || '', brand: d.brand || '', nature: d.nature || '', full_name: d.full_name || '' };
    setTimeout(() => {
      const ok = C.update(d.model_id, catData, jsn);
      if (ok) {
        st.allRaw = C.list();
        toast('Kategori başarıyla güncellendi', 'success');
        const crumb = mgrEl.querySelectorAll('nav span');
        if (crumb.length) crumb[crumb.length - 1].textContent = d.name || d.model_id;
      } else toast('Kategori güncellenirken hata oluştu', 'error');
      btn.removeAttribute('disabled');
    }, 450);
  }

  // ===========================================================================
  // Görünüm yönlendirme (liste ↔ yönetim)
  // ===========================================================================
  let initialCat = qs.get('cat');
  let initialPort = qs.get('port');
  const hashCat = () => { const m = /(?:^|[#&])cat=([^&]+)/.exec(window.location.hash); return m ? decodeURIComponent(m[1]) : ''; };

  function openCatManager(catId) {
    if (!catId) return;
    window.location.hash = 'cat=' + encodeURIComponent(catId);
  }
  function goBack() {
    if (hashCat()) {
      if (mg && mg.fromList) window.history.back();
      else window.location.hash = '';
    } else {
      initialCat = null;
      try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* file:// — yok say */ }
      route();
    }
  }
  function showList() {
    mg = null;
    pmHost.innerHTML = '';
    hideTip();
    mgrHost.classList.add('hidden');
    listHost.style.display = 'flex';
    document.title = 'DCIM TT — Model Kütüphanesi';
    if (!listEl.childElementCount) renderList();
    refresh1(!st.allRaw.length);
  }
  function showManager(catId, fromList) {
    const m = loadCatDetails(catId);
    if (!m) {
      toast(catId + ' kodlu kategori bulunamadı.', 'warning', 'Kategori Yönetimi');
      initialCat = null;
      if (hashCat()) window.location.hash = ''; else showList();
      return;
    }
    mg = m;
    mg.fromList = !!fromList;
    listHost.style.display = 'none';
    mgrHost.classList.remove('hidden');
    mgrHost.scrollTop = 0;
    document.title = 'DCIM TT — ' + (m.d.name || m.d.model_id) + ' · Kategori Yönetimi';
    renderManager();
    if (initialPort) {
      const p = m.d.ports.find(x => x.name === initialPort || x.hardware_label === initialPort || x.id === initialPort);
      initialPort = null;
      if (p) setTimeout(() => { if (mg === m) openPortModal(p); }, 60);
    }
  }
  let lastRoute = '';
  function route() {
    const h = hashCat();
    if (h) { showManager(h, lastRoute === 'list'); lastRoute = 'mgr'; }
    else if (initialCat) { showManager(initialCat, false); lastRoute = 'mgr'; }
    else { showList(); lastRoute = 'list'; }
  }
  window.addEventListener('hashchange', route);

  // Açılış: listeyi hazırla (veri yükleme simülasyonu), sonra yönlendir
  renderList();
  route();
  const nw = qs.get('new');
  if (nw === 'model') setTimeout(openNewModel, 450);
  else if (nw === 'nature') setTimeout(openNewNature, 450);
  if (qs.get('report') === '1') setTimeout(openReport, 450);
})();
