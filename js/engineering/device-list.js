/* ==========================================================================
   DCIM Sunum — Mühendislik / Cihaz Listesi
   Kaynak: user-app/src/app/new-ui/pages/engineering/device-list/
           device-list.component.{html,ts} (NewUICMPDeviceListComponent)
           edit-device-popup/edit-device-popup.component.{html,ts} (NewUICMPEditDevicePopupComponent)
           shared: app-data-table, app-drawer, app-location-tree, app-status-badge
   - Aktif Salon + Lokasyon Seç (sağ çekmece, lokasyon ağacı), Filtre çubuğu (Lokasyon / Kabin / PDU / Durum),
     sunucu taraflı sayfalanan tablo (varsayılan 15 kayıt), hücre tıklaması → cihaz detay / düzenleme penceresi
     (IP, SNMP Port, Proxy Index, SNMP sürümü, V1/V2C community, V3 ayarları; düzenle / sil / kaydet).
   - getDeviceQuery / getDeviceCount filtreleri (contains(@dev_loc), contains(@id), get_like(sta, '%B')) ve
     mapToDevice kimlik ayrıştırması TS'ten birebir port. Veri: DCIM.data.engDeviceList (js/mock/eng-device-list.data.js).
   Bilinçli sapmalar:
   - Durum etiketi/rozeti orijinalde sta % 8 ile hesaplanır; bu, AyXDB bitlerinde uyarı (0x0307 → "Acil") ve
     alarm (0x030B → "Normal") için yanlış sonuç verir. Sunumda projenin kendi yardımcısı
     new-ui/core/utils/ayxdb-sta.ts → resolveAyxdbDisplayStatus port edildi (filtre seçenekleriyle tutarlı).
   - Orijinal app-data-table serverSide=true iken arama kutusu, kolon filtreleri ve sıralama veri üzerinde etkisizdir;
     sunumda tüm kayıt kümesine (sunucu tarafı gibi) uygulanır. Filtre metinleri büyük/küçük harf duyarsızdır.
   - Silme onayı window.confirm yerine app-dialog (DCIM.ui.dialog) ile; kaydet/sil sonrası SysLog metni toast olarak gösterilir.
   - Kaydet orijinalde cihazı durdurup (sta 0x0000) yeniden başlatır (0x0303); sunumda cihaz durumu korunur.
   Derin bağlantılar (engineering.html#device-list?...):
     ?q=<metin>                         tablo araması (ör. q=UPS, q=1BJ53)
     ?cabinet=<kod> | ?loc=<metin> | ?pdu=<metin>   filtre çubuğunu açık ve dolu başlat (ör. cabinet=1CE51, loc=POD 9)
     ?status=normal|warning|alarm|critical|disabled|disconnected|stale   durum filtresi (ör. status=disconnected)
     ?open=<cihaz id>|1                 detay penceresini aç (1 → ilk satır; ör. open=KAT1_SAL1_B7_UPS)
     ?edit=1                            (open ile) pencereyi düzenleme modunda aç
     ?page=<n>&size=5|10|15|20|50|100   sayfa / sayfa boyutu
     ?drawer=1                          lokasyon çekmecesini açık başlat
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // messages.tr.json → deviceList.* / common.*
  const TR = {
    title: 'CİHAZ LİSTESİ', crumbEng: 'Mühendislik', crumbList: 'Cihaz Listesi',
    connected: 'Bağlı', connecting: 'Bağlanıyor', disconnected: 'Bağlantı Yok',
    activeHall: 'Aktif Salon', selectLocation: 'Lokasyon Seç', drawerSubtitle: 'Lokasyon ağacından bir salon seçin.',
    generalDevice: 'Genel Cihaz', generalUps: 'Genel UPS',
    phLoc: 'Lokasyon Ara...', phCab: 'Kabin Adı Ara...', phPdu: 'PDU Adı Ara...',
    colLoc: 'Lokasyon Bilgisi', colCab: 'Kabin Adı', colPdu: 'PDU Adı', colSta: 'Durum',
    locs: { turkTelekom: 'Türk Telekom', turkey: 'Türkiye', ankara: 'Ankara', dc: 'Veri Merkezi', floor1: 'Kat 1', hall1: 'Salon 1' },
    sta: { all: 'Hepsi', normal: 'Normal', warning: 'Uyarı', alarm: 'Alarm', critical: 'Acil', disabled: 'Devredışı', disconnected: 'Bağlanamadı', stale: 'Eski', unknown: 'Bilinmiyor' },
    pop: {
      devicePrefix: 'CİHAZ: ', basicInfo: 'TEMEL BİLGİLER', v12: 'SNMP V1/V2C AYARLARI', v3: 'SNMP V3 AYARLARI',
      fetchError: 'Cihaz detayları alınamadı.', confirmDelete: "'{deviceId}' cihazını silmek istiyor musunuz?",
      actUpdate: 'DÜZENLEME', actDelete: 'SİLME',
      logUpdate: '{user} Kullanıcısı {deviceId} ID li Cihazı Güncelledi', logDelete: '{user} {deviceId} Sildi'
    },
    c: {
      filter: 'Filtre', cancel: 'İptal', clear: 'Temizle', search: 'Ara', columns: 'Kolonlar', refresh: 'Yenile',
      noData: 'Veri bulunamadı', total: 'Toplam', recordsListed: 'kayıt listeleniyor.', perPage: 'Sayfa Başına',
      edit: 'Düzenle', delete: 'Sil', save: 'Kaydet', close: 'Kapat', loading: 'Yükleniyor...', selected: 'seçili', actions: 'İşlemler'
    }
  };

  // statusFilterOptions (get_like('sta', ...) değerleri)
  const STATUS_OPTIONS = [
    { text: TR.sta.all, value: '' }, { text: TR.sta.normal, value: '%3' }, { text: TR.sta.warning, value: '%7' },
    { text: TR.sta.alarm, value: '%B' }, { text: TR.sta.critical, value: '%F' }, { text: TR.sta.disabled, value: '%0' },
    { text: TR.sta.disconnected, value: '%1' }, { text: TR.sta.stale, value: '%2' }
  ];
  const STATUS_PARAM = { normal: '%3', warning: '%7', alarm: '%B', critical: '%F', disabled: '%0', disconnected: '%1', lost: '%1', stale: '%2' };

  const SNMP_VERSIONS = [{ value: '1', viewValue: 'V1' }, { value: '2', viewValue: 'V2C' }, { value: '3', viewValue: 'V3' }];
  const SNMP_V3_LEVELS = [{ value: 'noAuthNoPriv', viewValue: 'No Auth No Priv' }, { value: 'authNoPriv', viewValue: 'Auth No Priv' }, { value: 'authPriv', viewValue: 'Auth Priv' }];
  const SNMP_V3_PROTOS = [{ value: 'none', viewValue: 'None' }, { value: 'des', viewValue: 'DES' }, { value: 'aes', viewValue: 'AES' }];
  const PAGE_SIZES = [5, 10, 15, 20, 50, 100];

  // ---------------------------------------------------------------------------
  // AyXDB STA çözümleme (new-ui/core/utils/ayxdb-sta.ts → resolveAyxdbDisplayStatus)
  // ---------------------------------------------------------------------------
  function resolveSta(raw) {
    const s = String(raw == null ? '' : raw).trim();
    const sta = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s, 16) : /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
    if (isNaN(sta)) return 'unknown';
    if ((sta & 0x00C0) === 0x00C0) return 'disabled';
    const val = sta & 0x000C;
    if (val === 0x0004) return 'warning';
    if (val === 0x0008) return 'alarm';
    if (val === 0x000C) return 'critical';
    const eng = sta & 0x0003;
    if (eng === 0) return 'disabled';
    if (eng === 1) return 'disconnected';
    if (eng === 2) return 'stale';
    return 'normal';
  }
  // getBadgeStatus eşlemesi (disabled → inactive, disconnected → lost, stale/warning → warning ...)
  const BADGE_OF = { disabled: 'inactive', disconnected: 'lost', stale: 'warning', normal: 'active', warning: 'warning', alarm: 'alarm', critical: 'critical', unknown: 'inactive' };
  const RANK = { critical: 7, alarm: 6, warning: 5, stale: 4, disconnected: 3, disabled: 2, unknown: 1, normal: 0 };

  // app-status-badge: shell.js'te olmayan 'inactive' / 'processing' renkleri (status-badge.component.ts ile aynı)
  function badge(status, label) {
    const esc = DCIM.ui.esc;
    const local = {
      inactive: ['bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40', 'bg-slate-400'],
      processing: ['bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50', 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]']
    }[status];
    if (!local) return DCIM.ui.statusBadge(status, label);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + local[0] + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + local[1] + '"></span>' + esc(label) + '</span>';
  }

  DCIM.engRegistry['device-list'] = {
    mount(el, params) {
      const { esc, button, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const store = DCIM.data.engDeviceList;
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
      let destroyed = false;

      // ---------------------------------------------------------------------
      // Durum (bileşen alanları)
      // ---------------------------------------------------------------------
      const S = {
        connectionStatus: 'loading',
        filterSwitch: 0,
        pageCur: 0,
        pageRng: 15,
        filterValues: { podName: '', cabinetName: '', pduName: '', status: '' },
        showLocationTree: false,
        selectedDocId: 'T01',
        treeSelectedId: 'T01',
        selectedLocationDisplay: [TR.locs.turkTelekom, TR.locs.turkey, TR.locs.ankara, TR.locs.dc, TR.locs.floor1, TR.locs.hall1].join(' > '),
        devices: [],
        totalRecordCount: 0,
        // app-data-table iç durumu
        search: '', showFilters: false, colFilters: {}, sortField: '', sortOrder: 1, showColMenu: false, selected: new Set()
      };
      const columns = [
        { field: 'podName', header: TR.colLoc, visible: true },
        { field: 'cabinetName', header: TR.colCab, visible: true },
        { field: 'pduName', header: TR.colPdu, visible: true },
        { field: 'status', header: TR.colSta, visible: true, width: '120px' }
      ];
      // initLocationNodes
      const nodes = [{ id: 'turkTelekom', name: TR.locs.turkTelekom, type: 'company', expanded: true, children: [
        { id: 'turkey', name: TR.locs.turkey, type: 'city', expanded: true, children: [
          { id: 'ankara', name: TR.locs.ankara, type: 'city', expanded: true, children: [
            { id: 'dc', name: TR.locs.dc, type: 'dc', expanded: true, children: [
              { id: 'floor1', name: TR.locs.floor1, type: 'floor', expanded: true, children: [
                { id: 'T01', name: TR.locs.hall1, type: 'salon' }
              ] }
            ] }
          ] }
        ] }
      ] }];

      // ---------------------------------------------------------------------
      // Derin bağlantı parametreleri
      // ---------------------------------------------------------------------
      const p = params || new URLSearchParams();
      if (p.get('q')) S.search = p.get('q');
      if (p.get('loc')) S.filterValues.podName = p.get('loc');
      if (p.get('cabinet')) S.filterValues.cabinetName = p.get('cabinet');
      if (p.get('pdu')) S.filterValues.pduName = p.get('pdu');
      if (p.get('status')) {
        const v = p.get('status');
        S.filterValues.status = STATUS_PARAM[v.toLowerCase()] || (STATUS_OPTIONS.some(o => o.value === v) ? v : '');
      }
      if (S.filterValues.podName || S.filterValues.cabinetName || S.filterValues.pduName || S.filterValues.status) S.filterSwitch = 1;
      const size = parseInt(p.get('size'), 10);
      if (PAGE_SIZES.indexOf(size) >= 0) S.pageRng = size;
      const page = parseInt(p.get('page'), 10);
      if (page > 0) S.pageCur = page - 1;
      if (p.get('drawer') === '1') S.showLocationTree = true;
      let pendingOpen = p.get('open') || '';
      const pendingEdit = p.get('edit') === '1';

      // ---------------------------------------------------------------------
      // mapToDevice (birebir port) + görsel durum
      // ---------------------------------------------------------------------
      function mapToDevice(item, location) {
        const safeItem = item || {};
        const id = safeItem.id || safeItem.rid || 'ID_YOK';
        const rawSta = safeItem.sta || '0x0000';
        const ipAddress = safeItem.con_host || 'N/A';
        let podName = 'N/A';
        let cabinetName = 'N/A';
        let pduOrDeviceName = 'N/A';
        const parts = id.split('_');
        const devLoc = safeItem.dev_loc || TR.generalDevice;

        if (parts.length >= 4 && parts[1] === 'PDU' && parts[parts.length - 1] === 'DV') {
          podName = devLoc;
          cabinetName = parts[0].startsWith('K') ? parts[0].substring(1) : parts[0];
          pduOrDeviceName = parts.slice(1, parts.length - 1).join('_');
        } else if (parts.length >= 4 && parts[2] === 'PDU') {
          podName = parts[0];
          cabinetName = parts[1];
          pduOrDeviceName = parts[3];
        } else if (parts.length >= 3 && parts[1] === 'BCM') {
          podName = parts[0];
          cabinetName = parts[2];
          pduOrDeviceName = parts[1];
        } else if (parts.length >= 4 && parts[3] === 'UPS') {
          podName = TR.generalUps;
          cabinetName = parts.slice(0, 3).join('_');
          pduOrDeviceName = parts.slice(3).join('_');
        } else if (parts.length >= 3 && parts[parts.length - 1] === 'DV' && parts[parts.length - 2].startsWith('ID')) {
          podName = parts[0];
          cabinetName = parts[1];
          pduOrDeviceName = parts.slice(2, parts.length - 1).join('_');
          if (pduOrDeviceName === '') pduOrDeviceName = id;
        } else if (id !== 'ID_YOK') {
          podName = TR.generalDevice;
          cabinetName = '-';
          pduOrDeviceName = id;
        }
        const key = resolveSta(rawSta);
        return {
          id, location, podName, cabinetName, pduName: pduOrDeviceName,
          status: key === 'normal' ? 'green' : key === 'warning' || key === 'stale' ? 'yellow' : 'red',
          rawStatus: rawSta, ipAddress, staKey: key
        };
      }
      const staText = key => TR.sta[key] || TR.sta.unknown;

      // get_contains / get_like karşılıkları (XPath contains, sta son ek eşleşmesi)
      const norm = v => String(v == null ? '' : v).toLocaleUpperCase('tr-TR');
      const contains = (attr, val) => norm(attr).indexOf(norm(val).trim()) >= 0;
      function like(attr, val) {
        const a = String(attr || '');
        let bgn = val.indexOf('%');
        if (bgn < 0) return a === val;
        if (bgn === 0) {
          let v = val.substr(1);
          if (!v.length) return true;
          const end = v.indexOf('%');
          if (end === -1) return a.substring(a.length - v.length) === v;
          v = v.substr(0, end);
          return !v.length || a.indexOf(v) >= 0;
        }
        return a.indexOf(val.substr(0, bgn)) === 0;
      }

      // doc('CMR/T01')/descendant::dev[koşullar] + tablo arama/kolon filtresi/sıralama → toplam + sayfa
      function runQuery() {
        const f = S.filterValues;
        let rows = store.devices().filter(d =>
          (!f.podName || contains(d.dev_loc, f.podName)) &&
          (!f.cabinetName || contains(d.id, f.cabinetName)) &&
          (!f.pduName || contains(d.id, f.pduName)) &&
          (!f.status || like(d.sta, f.status))
        ).map(d => mapToDevice(d, S.selectedLocationDisplay));
        // fetchPduNames: _NFO_PDUNAME değerleri sahada '-' (tanımsız) → PDU adı kimlikten kalır
        const q = S.search.trim();
        if (q) rows = rows.filter(r => [r.id, r.podName, r.cabinetName, r.pduName, staText(r.staKey)].some(v => contains(v, q)));
        Object.keys(S.colFilters).forEach(field => {
          const v = String(S.colFilters[field] || '').trim();
          if (!v) return;
          rows = rows.filter(r => contains(field === 'status' ? staText(r.staKey) : r[field], v));
        });
        if (S.sortField) {
          const f2 = S.sortField;
          rows = rows.slice().sort((a, b) => {
            if (f2 === 'status') return (RANK[b.staKey] - RANK[a.staKey]) * S.sortOrder;
            return String(a[f2]).localeCompare(String(b[f2]), 'tr', { numeric: true }) * S.sortOrder;
          });
        }
        S.totalRecordCount = rows.length;
        const pages = Math.max(1, Math.ceil(rows.length / S.pageRng));
        if (S.pageCur > pages - 1) S.pageCur = pages - 1;
        const ofs = S.pageCur * S.pageRng;
        S.devices = rows.slice(ofs, ofs + S.pageRng);
      }

      // refreshDevices: bağlantı rozeti "Bağlanıyor" → sorgu yanıtı (qry_out) → "Bağlı"
      let reqSeq = 0;
      function refreshDevices() {
        const my = ++reqSeq;
        S.connectionStatus = 'loading';
        renderHeaderBadge();
        later(() => {
          if (destroyed || my !== reqSeq) return;
          runQuery();
          S.connectionStatus = 'success';
          render();
          if (pendingOpen) {
            const want = pendingOpen;
            pendingOpen = '';
            const dev = want === '1' || want === 'first' ? S.devices[0] : store.devices().find(d => d.id === want) || store.devices().find(d => contains(d.id, want));
            if (dev) openEditForm(dev.id, pendingEdit);
          }
        }, 260);
      }
      // Tablo içi arama / kolon filtresi / sıralama: anında (istemci tarafında)
      function requery() { runQuery(); render(); }

      // ---------------------------------------------------------------------
      // Çizim
      // ---------------------------------------------------------------------
      const shortLocationDisplay = () => S.selectedLocationDisplay.split('>').map(x => x.trim()).slice(-2).join(' > ');
      const INPUT_TBL = 'w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
      const TOGGLE_ON = 'bg-sky-600 text-white font-bold border-sky-600';
      const TOGGLE_OFF = 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
      const CHECK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
      const PAGER_BTN = 'w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';
      const colStyle = c => c.width ? ' style="width: ' + c.width + '; min-width: ' + c.width + ';"' : '';

      function connBadge() {
        const s = S.connectionStatus;
        return badge(s === 'success' ? 'active' : s === 'loading' ? 'processing' : 'lost', s === 'success' ? TR.connected : s === 'loading' ? TR.connecting : TR.disconnected);
      }

      function renderFilterBar() {
        if (S.filterSwitch !== 1) return '';
        const f = S.filterValues;
        const input = (key, ph) => '<input type="text" data-key="fv-' + key + '" data-fv="' + key + '" value="' + esc(f[key]) + '" placeholder="' + esc(ph) + '" class="scada-input" />';
        return '<div class="p-3 bg-slate-50 dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] space-y-2">' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">' +
            kit.formField({ label: TR.colLoc, control: input('podName', TR.phLoc) }) +
            kit.formField({ label: TR.colCab, control: input('cabinetName', TR.phCab) }) +
            kit.formField({ label: TR.colPdu, control: input('pduName', TR.phPdu) }) +
            kit.formField({ label: TR.colSta, control: '<select data-fv="status" class="scada-select">' +
              STATUS_OPTIONS.map(o => '<option value="' + esc(o.value) + '"' + (o.value === f.status ? ' selected' : '') + '>' + esc(o.text) + '</option>').join('') + '</select>' }) +
          '</div>' +
          '<div class="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/50 dark:border-border-subtle">' +
            button({ variant: 'secondary', size: 'sm', label: TR.c.clear, attrs: 'data-act="fv-clear"' }) +
            button({ variant: 'primary', size: 'sm', label: TR.c.filter, attrs: 'data-act="fv-apply"' }) +
          '</div>' +
        '</div>';
      }

      function renderTable() {
        const vis = columns.filter(c => c.visible !== false);
        const rows = S.devices;
        const allSel = rows.length > 0 && rows.every(r => S.selected.has(r.id));
        const totalPages = Math.ceil(S.totalRecordCount / S.pageRng) || 1;
        const cur = S.pageCur + 1;
        const cell = (r, c) => {
          const val = r[c.field];
          if (c.field === 'status') {
            return '<div data-open="' + esc(r.id) + '" class="cursor-pointer py-1 block">' + badge(BADGE_OF[r.staKey], staText(r.staKey)) + '</div>';
          }
          const cls = c.field === 'pduName' ? 'cursor-pointer py-1.5 font-mono font-bold hover:text-sky-600 dark:hover:text-sky-400 hover:underline' : 'cursor-pointer py-1.5 font-medium hover:text-sky-600 dark:hover:text-sky-400 hover:underline';
          return '<div data-open="' + esc(r.id) + '" class="' + cls + '">' + esc(val || '—') + '</div>';
        };
        return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden w-full">' +
          // Başlık & kontroller
          '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
            '<div class="flex flex-wrap items-center gap-2">' +
              '<div class="relative w-60 sm:w-72"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
                '<input type="text" data-key="tbl-search" data-tbl-search value="' + esc(S.search) + '" placeholder="' + TR.c.search + '" class="' + INPUT_TBL + '" /></div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
              '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
              (S.selected.size > 0 ? '<div class="px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"><span>' + S.selected.size + ' ' + TR.c.selected + '</span><button type="button" data-act="bulk" class="underline hover:text-sky-800 dark:hover:text-sky-300">' + TR.c.actions + '</button></div>' : '') +
              '<button type="button" data-act="tbl-filters" class="' + (S.showFilters ? TOGGLE_ON : TOGGLE_OFF) + ' px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer" title="' + TR.c.filter + '"><i class="pi pi-filter text-xs"></i><span>' + TR.c.filter + '</span></button>' +
              '<div class="relative">' +
                '<button type="button" data-act="col-menu" class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>' + TR.c.columns + '</span></button>' +
                (S.showColMenu ? '<div data-col-menu class="absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1">' +
                  '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">' + TR.c.columns + '</span>' +
                  columns.map(c => '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer"><input type="checkbox" data-col="' + c.field + '"' + (c.visible !== false ? ' checked' : '') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>').join('') +
                '</div>' : '') +
              '</div>' +
              '<button type="button" data-act="refresh" class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="' + TR.c.refresh + '"><i class="pi pi-refresh text-xs"></i></button>' +
            '</div>' +
          '</div>' +
          // Tablo
          '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full">' +
            '<table class="scada-table w-full text-left border-collapse text-xs">' +
              '<thead class="sticky top-0 z-10 shadow-2xs">' +
                '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
                  '<th class="py-2 px-1 text-center bg-slate-100 dark:bg-surface-base" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-sel-all' + (allSel ? ' checked' : '') + ' class="' + CHECK + '" /></th>' +
                  vis.map(c => '<th data-sort="' + c.field + '" class="py-2 px-2 text-left font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap"' + colStyle(c) + ' title="' + esc(c.header) + '">' +
                    '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
                    (S.sortField === c.field ? '<i class="' + (S.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') + '</div></th>').join('') +
                '</tr>' +
                (S.showFilters ? '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
                  '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-[#0b121e]" style="width: 36px; min-width: 36px; max-width: 36px;"><button type="button" data-act="clear-filters" title="' + TR.c.clear + '" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button></th>' +
                  vis.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal"' + colStyle(c) + '><input type="text" data-key="cf-' + c.field + '" data-cf="' + c.field + '" value="' + esc(S.colFilters[c.field] || '') + '" placeholder="' + TR.c.filter + '" class="w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" /></th>').join('') +
                '</tr>' : '') +
              '</thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200">' +
                (rows.length === 0
                  ? '<tr><td colspan="' + (vis.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">' + TR.c.noData + '</span></td></tr>'
                  : rows.map(r => '<tr data-row="' + esc(r.id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (S.selected.has(r.id) ? ' bg-sky-500/5' : '') + '">' +
                      '<td data-stop class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-sel="' + esc(r.id) + '"' + (S.selected.has(r.id) ? ' checked' : '') + ' class="' + CHECK + '" /></td>' +
                      vis.map(c => '<td class="py-1.5 px-2 text-[11px] cell-wrap"' + colStyle(c) + '>' + cell(r, c) + '</td>').join('') +
                    '</tr>').join('')) +
              '</tbody>' +
            '</table>' +
          '</div>' +
          // Sayfalama
          '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0">' +
            '<div class="text-slate-500 dark:text-slate-400 font-medium">' + TR.c.total + ' <span class="font-bold text-slate-900 dark:text-slate-100">' + S.totalRecordCount + '</span> ' + TR.c.recordsListed + '</div>' +
            '<div class="flex items-center gap-3 self-end sm:self-auto">' +
              '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>' + TR.c.perPage + ':</span>' +
                '<select data-page-size class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
                  PAGE_SIZES.map(n => '<option value="' + n + '"' + (n === S.pageRng ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
              '<div class="flex items-center gap-1">' +
                '<button type="button" data-page="' + (cur - 1) + '"' + (cur === 1 ? ' disabled' : '') + ' class="' + PAGER_BTN + '"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
                '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + cur + ' / ' + totalPages + '</span>' +
                '<button type="button" data-page="' + (cur + 1) + '"' + (cur >= totalPages ? ' disabled' : '') + ' class="' + PAGER_BTN + '"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // app-location-tree (özyinelemeli)
      function nodeIcon(type) {
        switch (type) {
          case 'company': return 'pi pi-globe text-sky-500';
          case 'city': return 'pi pi-map-marker text-sky-500';
          case 'dc': return 'pi pi-building text-sky-500';
          case 'floor': return 'pi pi-layers text-sky-500';
          case 'salon': return 'pi pi-th-large text-sky-500';
          case 'pod': return 'pi pi-server text-sky-500';
          case 'cabinet': return 'pi pi-box text-sky-500';
          case 'pdu': return 'pi pi-bolt text-amber-500';
          default: return 'pi pi-folder text-sky-500';
        }
      }
      function renderTree(list) {
        return '<div class="space-y-1 text-xs select-none">' + list.map(n => {
          const on = n.id === S.treeSelectedId;
          const kids = n.children && n.children.length > 0;
          return '<div><div data-node="' + esc(n.id) + '" class="' + (on ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300') + ' flex items-center gap-1.5 px-2 py-1 rounded-[2px] cursor-pointer transition-colors justify-between">' +
              '<div class="flex items-center gap-1.5 min-w-0 flex-1">' +
                (kids ? '<button type="button" data-expand="' + esc(n.id) + '" class="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"><i class="' + (n.expanded ? 'pi pi-chevron-down text-[9px]' : 'pi pi-chevron-right text-[9px]') + '"></i></button>' : '<span class="w-4 shrink-0"></span>') +
                '<i class="' + nodeIcon(n.type) + ' text-xs shrink-0"></i>' +
                '<span class="truncate flex-1 font-medium">' + esc(n.name) + '</span>' +
              '</div>' +
            '</div>' +
            (n.expanded && kids ? '<div class="pl-3.5 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">' + renderTree(n.children) + '</div>' : '') +
          '</div>';
        }).join('') + '</div>';
      }
      // app-drawer
      function renderDrawer() {
        if (!S.showLocationTree) return '';
        return '<div data-drawer-backdrop class="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 transition-opacity animate-fade-in">' +
          '<div class="fixed inset-y-0 right-0 max-w-full flex pl-8">' +
            '<div data-drawer-panel class="w-screen max-w-xl bg-white dark:bg-surface-card border-l border-slate-200 dark:border-border-subtle shadow-xl flex flex-col justify-between">' +
              '<div class="p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
                '<div><h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-th-large text-sky-600 dark:text-sky-400 text-sm"></i>' + TR.selectLocation + '</h2>' +
                  '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + TR.drawerSubtitle + '</p></div>' +
                '<button type="button" data-act="drawer-close" class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="pi pi-times text-xs"></i></button>' +
              '</div>' +
              '<div class="p-4 overflow-y-auto flex-1 text-xs text-slate-800 dark:text-slate-200"><div class="py-2">' + renderTree(nodes) + '</div></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }

      function renderHeaderBadge() {
        const h = el.querySelector('[data-conn]');
        if (h) h.innerHTML = connBadge();
      }

      function render() {
        if (destroyed) return;
        // Odaktaki girdiyi (arama / filtre) yeniden çizimden sonra geri yükle
        const a = document.activeElement;
        const key = a && el.contains(a) ? a.getAttribute('data-key') : null;
        let s0 = null, s1 = null;
        if (key) { try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) { /* yok say */ } }
        el.innerHTML =
          '<div class="eng-dl space-y-4">' +
            kit.pageHeader({
              title: TR.title,
              breadcrumbs: [{ label: TR.crumbEng }, { label: TR.crumbList }],
              actions: '<div class="flex items-center gap-2" data-conn>' + connBadge() + '</div>'
            }) +
            // Lokasyon seçimi & filtre çubuğu
            '<div class="flex items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-2">' +
              '<div class="flex items-center gap-2">' +
                '<span class="text-xs font-semibold text-slate-500 dark:text-slate-400">' + TR.activeHall + ':</span>' +
                '<span class="text-xs font-bold text-sky-600 dark:text-sky-400">' + esc(shortLocationDisplay()) + '</span>' +
                button({ variant: 'secondary', size: 'sm', icon: 'pi pi-th-large', label: TR.selectLocation, attrs: 'data-act="tree"' }) +
              '</div>' +
              '<div class="flex items-center gap-2">' +
                button({ variant: S.filterSwitch === 1 ? 'primary' : 'secondary', size: 'sm', icon: 'pi pi-filter', label: S.filterSwitch === 0 ? TR.c.filter : TR.c.cancel, attrs: 'data-act="filter"' }) +
              '</div>' +
            '</div>' +
            renderFilterBar() +
            renderDrawer() +
            renderTable() +
          '</div>';
        if (key) {
          const n = el.querySelector('[data-key="' + key + '"]');
          if (n) { n.focus(); try { if (s0 != null) n.setSelectionRange(s0, s1); } catch (e) { /* yok say */ } }
        }
      }

      // ---------------------------------------------------------------------
      // Olaylar (delegasyon)
      // ---------------------------------------------------------------------
      function applyFilters() { S.pageCur = 0; refreshDevices(); }
      function findNode(list, id) {
        for (const n of list) {
          if (n.id === id) return n;
          const k = n.children ? findNode(n.children, id) : null;
          if (k) return k;
        }
        return null;
      }

      function onClick(e) {
        const t = e.target;
        // Çekmece: arka plan tıklaması kapatır, panel tıklaması yayılmaz
        if (t.closest('[data-drawer-backdrop]') && !t.closest('[data-drawer-panel]')) { S.showLocationTree = false; render(); return; }
        const exp = t.closest('[data-expand]');
        if (exp) { const n = findNode(nodes, exp.getAttribute('data-expand')); if (n) n.expanded = !n.expanded; render(); return; }
        const nodeEl = t.closest('[data-node]');
        if (nodeEl) {
          const n = findNode(nodes, nodeEl.getAttribute('data-node'));
          S.treeSelectedId = n.id;
          // onLocationNodeSelected: yalnızca salon seçimi listeyi değiştirir
          if (n.type === 'salon') {
            S.selectedDocId = n.id;
            if (n.id === 'T01') S.selectedLocationDisplay = [TR.locs.turkTelekom, TR.locs.turkey, TR.locs.ankara, TR.locs.dc, TR.locs.floor1, TR.locs.hall1].join(' > ');
            S.showLocationTree = false;
            render();
            refreshDevices();
          } else render();
          return;
        }
        if (t.closest('[data-col-menu]')) return; // menü içi tıklama yayılmaz ($event.stopPropagation)

        const open = t.closest('[data-open]');
        if (open) openEditForm(open.getAttribute('data-open'), false);

        const act = t.closest('[data-act]');
        if (act) {
          switch (act.getAttribute('data-act')) {
            case 'tree': S.showLocationTree = !S.showLocationTree; render(); break;
            case 'drawer-close': S.showLocationTree = false; render(); break;
            case 'filter':
              // openFilter
              S.filterSwitch = (S.filterSwitch + 1) % 2;
              if (S.filterSwitch === 0) { S.filterValues = { podName: '', cabinetName: '', pduName: '', status: '' }; render(); applyFilters(); } else render();
              break;
            case 'fv-clear':
              S.filterValues = { podName: '', cabinetName: '', pduName: '', status: '' };
              S.filterSwitch = 0;
              render();
              applyFilters();
              break;
            case 'fv-apply': applyFilters(); break;
            case 'tbl-filters': S.showFilters = !S.showFilters; render(); break;
            case 'col-menu': S.showColMenu = !S.showColMenu; render(); break;
            case 'refresh': refreshDevices(); break;
            case 'clear-filters':
              // triggerClearFilters
              S.colFilters = {}; S.search = ''; S.pageCur = 0; requery();
              break;
            case 'bulk': break; // (bulkAction) cihaz listesinde bağlı değil
          }
          return;
        }
        const th = t.closest('[data-sort]');
        if (th) {
          const f = th.getAttribute('data-sort');
          if (S.sortField === f) S.sortOrder *= -1; else { S.sortField = f; S.sortOrder = 1; }
          requery();
          return;
        }
        const pg = t.closest('[data-page]');
        if (pg && !pg.disabled) {
          const n = parseInt(pg.getAttribute('data-page'), 10);
          const total = Math.ceil(S.totalRecordCount / S.pageRng) || 1;
          if (n >= 1 && n <= total) { S.pageCur = n - 1; refreshDevices(); }
          return;
        }
        if (t.closest('[data-stop]')) return; // onay kutusu hücresi satır tıklamasını tetiklemez
        const tr = t.closest('[data-row]');
        if (tr) {
          // toggleRowSelection (hücre şablonu tıklaması da satıra yayılır — orijinal davranış)
          const id = tr.getAttribute('data-row');
          if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
          render();
        }
      }

      function onChange(e) {
        const t = e.target;
        if (t.matches('[data-fv="status"]')) { S.filterValues.status = t.value; applyFilters(); return; }
        if (t.matches('[data-page-size]')) { S.pageRng = parseInt(t.value, 10); S.pageCur = 0; refreshDevices(); return; }
        if (t.matches('[data-col]')) { const c = columns.find(x => x.field === t.getAttribute('data-col')); c.visible = !c.visible; render(); return; }
        if (t.matches('[data-sel-all]')) {
          if (t.checked) S.devices.forEach(r => S.selected.add(r.id)); else S.selected.clear();
          render();
          return;
        }
        if (t.matches('[data-sel]')) {
          const id = t.getAttribute('data-sel');
          if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
          render();
        }
      }

      function onInput(e) {
        const t = e.target;
        if (t.matches('[data-fv]') && t.tagName === 'INPUT') { S.filterValues[t.getAttribute('data-fv')] = t.value; return; }
        if (t.matches('[data-tbl-search]')) { S.search = t.value; S.pageCur = 0; requery(); return; }
        if (t.matches('[data-cf]')) { S.colFilters[t.getAttribute('data-cf')] = t.value; S.pageCur = 0; requery(); }
      }

      function onKey(e) {
        if (e.key === 'Enter' && e.target.matches && e.target.matches('input[data-fv]')) applyFilters();
      }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
      el.addEventListener('keyup', onKey);

      // ---------------------------------------------------------------------
      // Cihaz detay / düzenleme penceresi (NewUICMPEditDevicePopupComponent, MatDialog 700px / 90vw)
      // ---------------------------------------------------------------------
      const formatVerCode = v => v === 'V1' ? '1' : v === 'V3' ? '3' : '2';
      const formatVerDisplay = c => c === '1' ? 'V1' : c === '3' ? 'V3' : 'V2C';
      let popup = null;

      function openEditForm(deviceId, editMode) {
        closePopup();
        const P = { id: deviceId, details: null, edited: null, isEdit: false, isLoading: true, displayName: '' };
        const host = document.createElement('div');
        host.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
        host.innerHTML = '<div data-pop-panel class="w-[700px] max-w-[90vw] animate-modal-pop"></div>';
        document.body.appendChild(host);
        const panel = host.querySelector('[data-pop-panel]');
        popup = { P, host, panel };

        const view = (v, mono) => '<div class="px-2.5 py-1.5 bg-slate-50 dark:bg-surface-base border border-slate-100 dark:border-slate-800 rounded-[2px] ' + (mono ? 'font-mono ' : '') + 'text-slate-800 dark:text-slate-200">' + esc(v) + '</div>';
        const inp = (k, type, extra) => '<input type="' + type + '" data-pf="' + k + '" value="' + esc(P.edited[k]) + '"' + (extra || '') + ' />';
        const sel = (k, opts) => '<select data-pf="' + k + '" class="scada-select">' + opts.map(o => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(P.edited[k]) ? ' selected' : '') + '>' + esc(o.viewValue) + '</option>').join('') + '</select>';
        const field = (label, viewHtml, editHtml) => kit.formField({ label, control: P.isEdit ? editHtml : viewHtml });
        const section = (icon, title, body) =>
          '<div><div class="flex items-center gap-1.5 pb-1 mb-3 border-b border-slate-100 dark:border-slate-800"><i class="' + icon + ' text-sky-500"></i>' +
            '<span class="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">' + esc(title) + '</span></div>' +
          '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + body + '</div></div>';
        const iconBtn = (act, icon, title, tone) => '<button type="button" data-pact="' + act + '" class="w-7 h-7 rounded-[2px] flex items-center justify-center ' + tone + ' hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="' + esc(title) + '"><i class="' + icon + ' text-xs"></i></button>';

        function draw() {
          const d = P.details;
          const e = P.edited;
          let body;
          if (P.isLoading) {
            body = '<div class="p-8 text-center text-slate-400"><i class="pi pi-spin pi-spinner text-xl text-sky-600 dark:text-sky-400 mb-2"></i><p class="font-semibold">' + TR.c.loading + '</p></div>';
          } else if (!d) {
            body = '<div class="p-6 text-center text-rose-500 dark:text-rose-400 bg-rose-500/10 rounded-[2px] border border-rose-500/20"><i class="pi pi-exclamation-triangle text-xl mb-1.5 block"></i><span>' + TR.pop.fetchError + '</span></div>';
          } else {
            body = '<div class="space-y-4">' +
              section('pi pi-info-circle', TR.pop.basicInfo,
                field('IP Adresi', view(d.ipAddress, true), inp('ipAddress', 'text', ' class="scada-input font-mono"')) +
                field('SNMP Port', view(d.snmpPort, true), inp('snmpPort', 'number', ' class="scada-input font-mono"')) +
                field('Proxy Index', view(d.proxyIndex, true), inp('proxyIndex', 'text', ' class="scada-input font-mono"')) +
                field('SNMP Versiyonu', view(d.snmpVersionDisplay), sel('snmpVersion', SNMP_VERSIONS))) +
              (e.snmpVersion === '1' || e.snmpVersion === '2' ? section('pi pi-sliders-h', TR.pop.v12,
                field('Read Community', view(d.readCommunity, true), inp('readCommunity', 'text', ' class="scada-input font-mono"')) +
                field('Write Community', view(d.writeCommunity, true), inp('writeCommunity', 'password', ' placeholder="********" class="scada-input font-mono"'))) : '') +
              (e.snmpVersion === '3' ? section('pi pi-shield', TR.pop.v3,
                field('Kullanıcı Adı', view(d.snmpV3Username), inp('snmpV3Username', 'text', ' class="scada-input"')) +
                field('Güvenlik Seviyesi', view(d.snmpV3AuthLevel), sel('snmpV3AuthLevel', SNMP_V3_LEVELS)) +
                field('Yetkilendirme Protokolü', view(d.snmpV3AuthProtocol), sel('snmpV3AuthProtocol', SNMP_V3_PROTOS)) +
                field('Şifre', view('********', true), inp('snmpV3AuthPassword', 'password', ' placeholder="********" class="scada-input font-mono"'))) : '') +
            '</div>';
          }
          const showView = !P.isEdit && !P.isLoading && d;
          panel.innerHTML =
            '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl w-full text-xs">' +
              '<div class="p-3.5 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
                '<div class="flex items-center gap-2">' +
                  '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center bg-sky-500/10 text-sky-500 border border-sky-500/20 text-xs"><i class="pi pi-server"></i></span>' +
                  '<div><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><span>' + esc(TR.pop.devicePrefix) + '</span>' +
                    '<span class="font-mono text-[13px] text-sky-600 dark:text-sky-400">' + esc(P.displayName || P.id) + '</span></h3></div>' +
                '</div>' +
                '<div class="flex items-center gap-1">' +
                  (showView ? iconBtn('edit', 'pi pi-pencil', TR.c.edit, 'text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400') : '') +
                  (showView ? iconBtn('delete', 'pi pi-trash', TR.c.delete, 'text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400') : '') +
                  (P.isEdit && !P.isLoading ? iconBtn('save', 'pi pi-check', TR.c.save, 'text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300') : '') +
                  iconBtn('close', 'pi pi-times', TR.c.close, 'text-slate-400 hover:text-slate-800 dark:hover:text-slate-200') +
                '</div>' +
              '</div>' +
              '<div class="p-4 max-h-[75vh] overflow-y-auto">' + body + '</div>' +
              (P.isEdit && !P.isLoading ? '<div class="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex justify-end gap-2">' +
                button({ variant: 'secondary', size: 'sm', label: 'İptal', attrs: 'data-pact="cancel"' }) +
                button({ variant: 'primary', size: 'sm', label: 'Kaydet', attrs: 'data-pact="save"' }) +
              '</div>' : '') +
            '</div>';
        }
        popup.draw = draw;

        // fetchPduName + fetchDeviceDetails (setDeviceDetails)
        draw();
        later(() => {
          if (!popup || popup.P !== P) return;
          const item = store.details(deviceId);
          P.displayName = deviceId; // _NFO_PDUNAME '-' → cihaz kimliği
          if (item) {
            P.details = {
              ipAddress: item.con_host || '-', snmpPort: item.con_port || '-', plugin: item.plg || '-', proxyIndex: item.pro_adr || '-',
              externalKey: item.ext_key || '-', customField1: item.cst_fld_one || '-', customField2: item.cst_fld_two || '-',
              snmpVersion: formatVerCode(item.pro_ver), snmpVersionDisplay: item.pro_ver || 'N/A',
              readCommunity: item.pro_getc || '-', writeCommunity: '******',
              snmpV3Username: item.pro_usr || '-', snmpV3AuthLevel: item.pro_v3_auth_level || '-', snmpV3Authorization: item.pro_v3_auth || '-',
              snmpV3AuthProtocol: item.pro_v3_auth_proto || '-', snmpV3AuthPassword: '******'
            };
            P.edited = Object.assign({}, P.details);
            if (editMode) P.isEdit = true;
          }
          P.isLoading = false;
          draw();
        }, 280);

        host.addEventListener('click', ev => {
          if (ev.target === host) { closePopup(); return; } // disableClose = false
          const b = ev.target.closest('[data-pact]');
          if (!b) return;
          switch (b.getAttribute('data-pact')) {
            case 'close': closePopup(); break;
            case 'edit': P.isEdit = true; if (!P.edited && P.details) P.edited = Object.assign({}, P.details); draw(); break;
            case 'cancel': P.isEdit = false; if (P.details) P.edited = Object.assign({}, P.details); draw(); break;
            case 'save': onSave(P); break;
            case 'delete': onDelete(P); break;
          }
        });
        host.addEventListener('input', ev => { const k = ev.target.getAttribute('data-pf'); if (k) P.edited[k] = ev.target.value; });
        host.addEventListener('change', ev => {
          const k = ev.target.getAttribute('data-pf');
          if (!k) return;
          P.edited[k] = ev.target.value;
          if (k === 'snmpVersion') draw(); // SNMP V1/V2C ↔ V3 bölümleri
        });
      }

      // onSave → updateDeviceDetails (yalnızca orijinalin yazdığı öznitelikler) + SysLog
      function onSave(P) {
        const e = P.edited;
        if (!e) return;
        const attrs = {
          con_host: e.ipAddress, con_port: e.snmpPort, plg: e.plugin, pro_adr: e.proxyIndex, ext_key: e.externalKey,
          cst_fld_one: e.customField1, cst_fld_two: e.customField2, pro_ver: formatVerDisplay(e.snmpVersion), pro_getc: e.readCommunity
        };
        if (e.writeCommunity !== '******') attrs.pro_setc = e.writeCommunity;
        store.update(P.id, attrs);
        P.details = Object.assign({}, e, { snmpVersionDisplay: formatVerDisplay(e.snmpVersion) });
        P.isEdit = false;
        popup.draw();
        const user = (DCIM.session.user().fullname || DCIM.session.user().usr || '');
        toast(TR.pop.logUpdate.replace('{user}', user).replace('{deviceId}', P.id), 'success', TR.pop.actUpdate);
      }

      // onDelete → onay → {"cmd":2,"id":...} → pencere kapanır ({deleted:true}) → refreshDevices
      function onDelete(P) {
        DCIM.ui.dialog({
          title: TR.c.delete, variant: 'danger', confirmLabel: TR.c.delete, confirmIcon: 'pi pi-trash',
          body: '<p>' + esc(TR.pop.confirmDelete.replace('{deviceId}', P.id)) + '</p>',
          onConfirm() {
            store.remove(P.id);
            S.selected.delete(P.id);
            closePopup();
            const user = (DCIM.session.user().fullname || DCIM.session.user().usr || '');
            toast(TR.pop.logDelete.replace('{user}', user).replace('{deviceId}', P.id), 'warning', TR.pop.actDelete);
            refreshDevices();
          }
        });
      }

      function closePopup() {
        if (!popup) return;
        popup.host.remove();
        popup = null;
      }
      function onDocKey(e) {
        if (e.key !== 'Escape') return;
        if (document.querySelector('[data-dialog-panel]')) return; // önce onay penceresi kapanır
        if (popup) { closePopup(); return; }
        if (S.showLocationTree) { S.showLocationTree = false; render(); }
      }
      document.addEventListener('keydown', onDocKey);

      // ngOnInit
      render();
      refreshDevices();

      return {
        destroy() {
          destroyed = true;
          timers.forEach(t => clearTimeout(t));
          timers.clear();
          closePopup();
          document.removeEventListener('keydown', onDocKey);
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          el.removeEventListener('input', onInput);
          el.removeEventListener('keyup', onKey);
        }
      };
    }
  };
})();
