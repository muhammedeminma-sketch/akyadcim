/* ==========================================================================
   DCIM Sunum — Audit ve Loglar (NewUICMPUserLogsReportComponent)
   Kaynak: new-ui/pages/reporting/user-logs-report/user-logs-report.component.{html,ts}
           + common/pop-ups/report-pop-up/user-logs-report-popup (Rapor penceresi)
   Orijinal bir rapor bileşenidir; burada tam sayfa olarak gösterilir.
   app-data-table: arama, hızlı filtre (BİLGİ/UYARI/ALARM/KRİZ), kolon içi filtreler (Filtre butonu),
   tarih/durum sıralaması, sayfalama (15), kolon görünürlüğü.
   Veri: DCIM.data.auditLogs (api.HIS_user_log_list / CME syslog satırları) + permission-settings.html'de
   bu oturumda kaydedilen YETKİ kayıtları (sessionStorage 'dcim_audit_session').

   SUNUM EKLENTİLERİ: "Etkilenen Varlık" ve "Sonuç" (Başarılı / Reddedildi / Başarısız) kolonları,
   özet kartları, Excel (CSV) dışa aktarım butonu, satır detayı penceresi.

   Derin bağlantılar:
     ?q=1AZ39            genel arama
     ?result=denied      sonuç filtresi (success | denied | failed)
     ?user=deniz.koc     kullanıcı kolon filtresi (filtre satırını açar)
     ?cat=KAPAK          kategori kolon filtresi
     ?sta=8              hızlı filtre (1 BİLGİ, 4 UYARI, 8 ALARM, 12 KRİZ)
     ?filters=1          kolon içi filtre satırı açık
     ?report=1           Rapor penceresini açar
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, statusBadge, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'audit' });

  const SRC = DCIM.data.auditLogs;
  const params = new URLSearchParams(window.location.search);

  // messages.tr.json → userLogs.*
  const T = {
    title: 'KULLANICI LOGLARI',
    menuReporting: 'Raporlar',
    filter: 'Filtre',
    report: 'Rapor',
    fields: { no: 'No', date: 'Tarih', category: 'Kategori', description: 'Açıklama', username: 'Kullanıcı Adı', userIp: 'Kullanıcı IP', urlInfo: 'URL Bilgisi', status: 'Durum' },
    ph: { start: 'Başlangıç', end: 'Bitiş', all: '-Tümü-', searchCat: 'Kategori Ara...', searchDesc: 'Açıklama Ara...', searchUser: 'Kullanıcı Ara...', searchIp: 'IP Ara...', searchUrl: 'URL Ara...' },
    sta: {
      info: 'BİLGİ', warning: 'UYARI', warningPassed: 'UYARI-GEÇTİ', alarm: 'ALARM', alarmPassed: 'ALARM-GEÇTİ', crisis: 'KRİZ', crisisPassed: 'KRİZ-GEÇTİ',
      cancel: 'İPTAL', new: 'YENİ', waiting: 'BEKLİYOR', processing: 'İŞLİYOR', completed: 'TAMAMLANDI',
      stoppedWarning: 'DURDU-UYARI', waitingWarning: 'BEKLİYOR-UYARI', processingWarning: 'İŞLİYOR-UYARI',
      failedAlarm: 'BAŞARISIZ-ALARM', stoppedAlarm: 'DURDU-ALARM', waitingAlarm: 'BEKLİYOR-ALARM', processingAlarm: 'İŞLİYOR-ALARM',
      failedCrisis: 'BAŞARISIZ-KRİZ', stoppedCrisis: 'DURDU-KRİZ', waitingCrisis: 'BEKLİYOR-KRİZ', processingCrisis: 'İŞLİYOR-KRİZ'
    },
    popup: {
      title: 'Kullanıcı Logları Raporu', startDate: 'Başlangıç Tarihi:', endDate: 'Bitiş Tarihi:', searching: 'Aranıyor...', search: 'Ara',
      pdfGenerating: 'PDF Oluşturuluyor...', pdfDownload: 'PDF İndir', excelGenerating: 'Excel Oluşturuluyor...', excelDownload: 'Excel İndir',
      totalPrefix: 'Toplam', totalSuffix: 'kayıt', loading: 'Veriler yükleniyor...', noData: 'Seçilen tarih aralığında veri bulunamadı.',
      colRank: 'Sıra No', pageLabel: 'Sayfa', back: 'Geri', next: 'İleri',
      alertStartEnd: 'Başlangıç ve bitiş tarihlerini seçiniz.', alertDateOrder: 'Başlangıç tarihi bitiş tarihinden büyük olamaz!',
      alertNoPdfData: 'PDF oluşturmak için veri bulunmamaktadır.', alertNoExcelData: 'Excel oluşturmak için veri bulunmamaktadır.',
      pdfSuccessToast: 'PDF raporu oluşturuldu!'
    }
  };
  const RESULT = {
    success: { label: 'Başarılı', icon: 'pi pi-check-circle', cls: 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50' },
    denied: { label: 'Reddedildi', icon: 'pi pi-ban', cls: 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50' },
    failed: { label: 'Başarısız', icon: 'pi pi-times-circle', cls: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50' }
  };
  const resultBadge = r => {
    const x = RESULT[r] || RESULT.success;
    return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border ' + x.cls + '"><i class="' + x.icon + ' text-[9px]"></i>' + x.label + '</span>';
  };

  // ---------------------------------------------------------------------------
  // component.ts → parseCmePointsData / updateTableRows / getStaText
  // ---------------------------------------------------------------------------
  function parseCmePointsData(data) {
    return data.map(item => {
      let prm = {};
      try { prm = typeof item.evt_prm === 'string' ? JSON.parse(item.evt_prm) : (item.evt_prm || {}); } catch (e) { prm = {}; }
      return Object.assign({}, item, { user: prm.user || '', ip: prm.ip || '', url: prm.url || '', asset: prm.asset || '', res: prm.res || 'success' });
    });
  }
  function badgeLevel(sta) {
    const c = Number(sta) & 0x000f;
    if (c === 4 || c === 5) return 'warning';
    if (c === 8 || c === 9) return 'alarm';
    if (c >= 12) return 'alarm';
    if (c === 1) return 'info';
    return 'normal';
  }
  function getStaText(sta) {
    const S = T.sta;
    if ((sta & 0x0f00) === 0x0100) {
      const keys = ['-', S.info, '-', '-', S.warningPassed, S.warning, '-', '-', S.alarmPassed, S.alarm, '-', '-', S.crisisPassed, S.crisis, '-', '-'];
      return keys[sta & 0x000f] || '-';
    }
    if ((sta & 0x0f00) === 0x0300) {
      const keys = [S.cancel, S.new, S.waiting, S.processing, S.completed, S.stoppedWarning, S.waitingWarning, S.processingWarning,
        S.failedAlarm, S.stoppedAlarm, S.waitingAlarm, S.processingAlarm, S.failedCrisis, S.stoppedCrisis, S.waitingCrisis, S.processingCrisis];
      return keys[sta & 0x000f] || '-';
    }
    return '-';
  }
  const staMatches = (sta, f) => {
    const c = Number(sta) & 0x000f;
    if (f === '1') return c === 1;
    if (f === '4') return c === 4 || c === 5;
    if (f === '8') return c === 8 || c === 9;
    if (f === '12') return c >= 12;
    return true;
  };

  let ELEMENT_DATA = [];
  function load() {
    ELEMENT_DATA = parseCmePointsData(SRC.sessionRows().concat(SRC.rows)).sort((a, b) => b.tim - a.tim);
  }
  load();

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const state = {
    search: params.get('q') || '',
    quick: ['1', '4', '8', '12'].indexOf(params.get('sta')) >= 0 ? params.get('sta') : 'all',
    filters: { user: params.get('user') || '', cat: params.get('cat') || '', res: RESULT[params.get('result')] ? params.get('result') : '' },
    sortField: 'date',
    sortOrder: -1,
    page: 1,
    pageSize: 15,
    showFilters: params.get('filters') === '1' || !!params.get('user') || !!params.get('cat'),
    hiddenCols: {}
  };

  const COLUMNS = [
    { field: 'siraNo', header: T.fields.no, width: '52px', wrap: false, filterable: false },
    { field: 'date', header: T.fields.date, sortable: true, width: '150px', wrap: false },
    { field: 'category', header: T.fields.category, width: '112px' },
    { field: 'description', header: T.fields.description, minWidth: '280px', maxWidth: '400px' },
    { field: 'asset', header: 'Etkilenen Varlık', width: '150px', maxWidth: '150px', extra: true },
    { field: 'username', header: T.fields.username, width: '130px' },
    { field: 'userIp', header: T.fields.userIp, width: '112px', wrap: false },
    { field: 'urlInfo', header: T.fields.urlInfo, width: '170px', maxWidth: '170px' },
    { field: 'result', header: 'Sonuç', sortable: true, width: '104px', wrap: false, extra: true },
    { field: 'status', header: T.fields.status, sortable: true, width: '96px', wrap: false }
  ];
  const cols = () => COLUMNS.filter(c => !state.hiddenCols[c.field]);

  const lc = s => String(s || '').toLocaleLowerCase('tr-TR');
  const dtKey = d => fmtDateKey(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

  // inputFilter() → where koşulları (sunucu yerine istemci tarafında uygulanır)
  function filtered() {
    const f = state.filters;
    const q = lc(state.search.trim());
    let list = ELEMENT_DATA.slice();
    if (state.quick !== 'all') list = list.filter(r => staMatches(r.sta, state.quick));
    if (q) list = list.filter(r => [r.txt, r.asset, r.user, r.ip, r.cat].some(v => lc(v).indexOf(q) >= 0));
    if (f.bgn) list = list.filter(r => dtKey(r.tim) >= f.bgn);
    if (f.end) list = list.filter(r => dtKey(r.tim) <= f.end);
    if (f.cat) list = list.filter(r => lc(r.cat).indexOf(lc(f.cat)) >= 0);
    if (f.txt) list = list.filter(r => lc(r.txt).indexOf(lc(f.txt)) >= 0);
    if (f.user) list = list.filter(r => lc(r.user).indexOf(lc(f.user)) >= 0);
    if (f.ip) list = list.filter(r => lc(r.ip).indexOf(lc(f.ip)) >= 0);
    if (f.url) list = list.filter(r => lc(r.url).indexOf(lc(f.url)) >= 0);
    if (f.asset) list = list.filter(r => lc(r.asset).indexOf(lc(f.asset)) >= 0);
    if (f.sta) list = list.filter(r => staMatches(r.sta, f.sta));
    if (f.res) list = list.filter(r => r.res === f.res);

    const RES_ORDER = { denied: 2, failed: 1, success: 0 };
    const key = r => state.sortField === 'status' ? (Number(r.sta) & 0x0f) : state.sortField === 'result' ? RES_ORDER[r.res] : r.tim.getTime();
    list.sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka < kb) return -1 * state.sortOrder;
      if (ka > kb) return 1 * state.sortOrder;
      return b.tim - a.tim;
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Sayfa başlığı
  // ---------------------------------------------------------------------------
  let lastFiltered = [];
  function renderHeader() {
    const host = document.getElementById('ul-header');
    host.innerHTML = kit.pageHeader({
      title: T.title,
      compact: true,
      breadcrumbs: [{ label: T.menuReporting, href: 'reports.html' }, { label: T.title }],
      actions: '<div class="flex items-center gap-2">' +
        button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: T.filter, attrs: 'data-act="filter"' }) +
        button({ variant: 'secondary', icon: 'pi pi-file-excel', label: 'Excel', attrs: 'data-act="excel" title="Filtrelenmiş kayıtları Excel (CSV) olarak indir"' }) +
        button({ variant: 'secondary', icon: 'pi pi-file', label: T.report, attrs: 'data-act="report"' }) +
      '</div>'
    });
    host.querySelector('[data-act="filter"]').onclick = () => { state.showFilters = !state.showFilters; renderHeader(); renderHead(); };
    host.querySelector('[data-act="excel"]').onclick = () => exportRows('Kullanici_Loglari', lastFiltered);
    host.querySelector('[data-act="report"]').onclick = openPopup;
  }

  // Özet kartları (sunum eklentisi; alarms.html şiddet kartlarıyla aynı dil)
  function renderKpis() {
    const base = ELEMENT_DATA;
    const day = Date.now() - 86400000;
    const last24 = base.filter(r => r.tim.getTime() >= day);
    const n = k => base.filter(r => r.res === k).length;
    const users = new Set(base.map(r => r.user)).size;
    const ips = new Set(base.map(r => r.ip)).size;
    const defs = [
      { key: '', label: 'Toplam İşlem', icon: 'pi pi-book', tone: 'sky', value: base.length, sub: 'Son 24 saat: ' + last24.length },
      { key: 'success', label: 'Başarılı', icon: 'pi pi-check-circle', tone: 'emerald', value: n('success'), sub: '%' + Math.round((n('success') / (base.length || 1)) * 100) + ' oran' },
      { key: 'denied', label: 'Reddedildi', icon: 'pi pi-ban', tone: 'rose', value: n('denied'), sub: 'Son 24 saat: ' + last24.filter(r => r.res === 'denied').length },
      { key: 'failed', label: 'Başarısız', icon: 'pi pi-times-circle', tone: 'amber', value: n('failed'), sub: 'Sistem / cihaz hatası' },
      { key: 'users', label: 'Kullanıcı / IP', icon: 'pi pi-users', tone: 'slate', value: users + ' / ' + ips, sub: '10.130.x · 172.16.x' }
    ];
    const C = {
      sky: { on: 'border-sky-500/60 bg-sky-50 dark:bg-sky-950/25', txt: 'text-sky-600 dark:text-sky-400' },
      emerald: { on: 'border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/25', txt: 'text-emerald-600 dark:text-emerald-400' },
      rose: { on: 'border-rose-500/60 bg-rose-50/50 dark:bg-rose-950/25', txt: 'text-rose-600 dark:text-rose-400' },
      amber: { on: 'border-amber-500/60 bg-amber-50 dark:bg-amber-950/25', txt: 'text-amber-600 dark:text-amber-400' },
      slate: { on: 'border-slate-400 bg-slate-50 dark:bg-slate-900/40', txt: 'text-slate-600 dark:text-slate-300' }
    };
    const host = document.getElementById('ul-kpis');
    host.innerHTML = defs.map(d => {
      const c = C[d.tone];
      const clickable = d.key && d.key !== 'users';
      const selected = clickable && state.filters.res === d.key;
      return '<div' + (clickable ? ' data-kpi="' + d.key + '" title="' + d.label + ' kayıtları filtrele"' : '') + ' class="bg-white dark:bg-surface-card border rounded-[2px] p-2.5 shadow-2xs transition-all select-none ' +
        (clickable ? 'cursor-pointer hover:shadow-xs ' : '') + (selected ? c.on + ' ring-2 ring-sky-500/30' : 'border-slate-200 dark:border-border-subtle') + '">' +
        '<div class="flex items-center justify-between ' + c.txt + '">' +
          '<span class="text-[10px] font-black uppercase tracking-wider">' + d.label + '</span>' +
          '<div class="flex items-center gap-1">' + (clickable ? (selected ? '<i class="pi pi-filter-fill text-[10px]"></i>' : '<i class="pi pi-filter text-[10px] opacity-60"></i>') : '') + '<i class="' + d.icon + ' text-sm"></i></div>' +
        '</div>' +
        '<div class="mt-1 text-xl font-black tracking-tight font-mono text-slate-900 dark:text-slate-100">' + d.value + '</div>' +
        '<div class="mt-0.5 text-[9px] font-mono text-slate-400 truncate">' + d.sub + '</div>' +
      '</div>';
    }).join('');
    host.querySelectorAll('[data-kpi]').forEach(el => el.addEventListener('click', () => {
      const k = el.getAttribute('data-kpi');
      state.filters.res = state.filters.res === k ? '' : k;
      state.page = 1;
      renderKpis(); renderHead(); renderBody();
    }));
  }

  // ---------------------------------------------------------------------------
  // app-data-table
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const dateCls = 'w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const opt = (v, l, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>';
  const txtFilter = (k, ph) => '<input type="text" data-f="' + k + '" value="' + esc(state.filters[k] || '') + '" placeholder="' + esc(ph) + '" class="' + inputCls + '" />';

  function filterCell(col) {
    const f = state.filters;
    switch (col.field) {
      case 'date':
        return '<div class="flex flex-col gap-0.5">' +
          '<input type="datetime-local" data-f="bgn" value="' + esc(f.bgn || '') + '" class="' + dateCls + '" placeholder="' + T.ph.start + '" aria-label="' + T.ph.start + '" />' +
          '<input type="datetime-local" data-f="end" value="' + esc(f.end || '') + '" class="' + dateCls + '" placeholder="' + T.ph.end + '" aria-label="' + T.ph.end + '" /></div>';
      case 'category': return txtFilter('cat', T.ph.searchCat);
      case 'description': return txtFilter('txt', T.ph.searchDesc);
      case 'asset': return txtFilter('asset', 'Varlık Ara...');
      case 'username': return txtFilter('user', T.ph.searchUser);
      case 'userIp': return txtFilter('ip', T.ph.searchIp);
      case 'urlInfo': return txtFilter('url', T.ph.searchUrl);
      case 'result':
        return '<select data-f="res" class="' + selectCls + '">' + opt('', T.ph.all, f.res || '') + opt('success', 'Başarılı', f.res) + opt('denied', 'Reddedildi', f.res) + opt('failed', 'Başarısız', f.res) + '</select>';
      case 'status':
        return '<select data-f="sta" class="' + selectCls + '">' + opt('', T.ph.all, f.sta || '') + opt('1', T.sta.info, f.sta) + opt('4', T.sta.warning, f.sta) + opt('8', T.sta.alarm, f.sta) + opt('12', T.sta.crisis, f.sta) + '</select>';
      default: return '';
    }
  }

  const CAT_ICON = {
    'OTURUM': 'pi pi-sign-in', 'ALARM_ACK': 'pi pi-bell', 'İŞ EMRİ': 'pi pi-list-check', 'RAPOR': 'pi pi-file', 'MÜŞTERİ': 'pi pi-users', 'USER': 'pi pi-user-edit',
    'YETKİ': 'pi pi-shield', 'AYAR': 'pi pi-sliders-h', 'INFO': 'pi pi-info-circle', 'PDU LAUNCH': 'pi pi-external-link', 'KAPAK KİLİDİ': 'pi pi-lock-open', 'ENERJİ KONTROL': 'pi pi-power-off'
  };

  function cell(col, r, idx) {
    switch (col.field) {
      case 'siraNo': return '<span class="cell-nowrap">' + idx + '</span>';
      case 'date': return '<span class="cell-nowrap font-mono">' + fmtDateTime(r.tim) + '</span>';
      case 'category':
        return '<span class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300"><i class="' + (CAT_ICON[r.cat] || 'pi pi-tag') + ' text-[10px] text-sky-500"></i>' + esc(r.cat || '-') + '</span>';
      case 'description': return '<span class="cell-wrap" style="overflow-wrap: anywhere;" title="' + esc(r.txt) + '">' + esc(r.txt || '-') + '</span>';
      case 'asset': return r.asset ? '<span class="cell-wrap text-slate-600 dark:text-slate-300">' + esc(r.asset) + '</span>' : '<span class="text-slate-400">-</span>';
      case 'username':
        return r.user === 'system'
          ? '<span class="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400"><i class="pi pi-cog text-[10px]"></i>system</span>'
          : '<span class="font-mono font-semibold text-slate-800 dark:text-slate-200">' + esc(r.user || r.cid || '-') + '</span>';
      case 'userIp': return '<span class="font-mono ' + (r.ip.indexOf('172.16.') === 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300') + '">' + esc(r.ip || '-') + '</span>';
      case 'urlInfo': return r.url ? '<span class="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400" style="max-width: 160px;" title="' + esc(r.url) + '">' + esc(r.url) + '</span>' : '<span class="text-slate-400">-</span>';
      case 'result': return resultBadge(r.res);
      case 'status': return '<div class="inline-flex items-center min-w-0">' + statusBadge(badgeLevel(r.sta), getStaText(Number(r.sta))) + '</div>';
      default: return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '') + (c.maxWidth ? 'max-width:' + c.maxWidth + ';' : '');

  function renderTableShell() {
    const host = document.getElementById('ul-table');
    const quick = [{ label: T.ph.all, value: 'all' }, { label: T.sta.info, value: '1' }, { label: T.sta.warning, value: '4' }, { label: T.sta.alarm, value: '8' }, { label: T.sta.crisis, value: '12' }];
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara (işlem, varlık, kullanıcı, IP)" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex items-center gap-1">' + quick.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + q.label + '</button>').join('') + '</div>' +
          '<span data-chips class="flex items-center gap-1"></span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<div class="relative">' +
            '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-48 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
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

    let timer = null;
    host.querySelector('[data-search]').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); }, 120);
    });
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      state.quick = b.getAttribute('data-q');
      state.page = 1;
      renderQuick(); renderBody();
    }));
    const colBtn = host.querySelector('[data-colmenu]');
    const colPanel = host.querySelector('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    host.querySelector('[data-refresh]').addEventListener('click', () => {
      const icon = host.querySelector('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => {
        icon.className = 'pi pi-refresh text-xs';
        load();
        renderKpis(); renderBody();
        toast('Kullanıcı logları api.HIS_user_log_list sorgusuyla yenilendi.', 'success');
      }, 600);
    });
    host.querySelector('[data-tbody]').addEventListener('click', e => {
      const row = e.target.closest('[data-row]');
      if (row) openDetail(row.getAttribute('data-row'));
    });
  }

  function renderQuick() {
    document.querySelectorAll('#ul-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === state.quick;
      b.className = 'px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
  }

  function renderChips() {
    const host = document.querySelector('#ul-table [data-chips]');
    const f = state.filters;
    const chips = [];
    if (f.res) chips.push({ key: 'res', label: 'Sonuç: ' + RESULT[f.res].label });
    if (f.user) chips.push({ key: 'user', label: 'Kullanıcı: ' + f.user });
    if (f.cat) chips.push({ key: 'cat', label: 'Kategori: ' + f.cat });
    if (f.bgn || f.end) chips.push({ key: 'date', label: 'Tarih: ' + (f.bgn ? f.bgn.replace('T', ' ') : '…') + ' → ' + (f.end ? f.end.replace('T', ' ') : '…') });
    host.innerHTML = chips.map(c =>
      '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">' + esc(c.label) +
      '<button type="button" data-chip="' + c.key + '" class="hover:text-rose-500 cursor-pointer"><i class="pi pi-times text-[8px]"></i></button></span>').join('');
    host.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
      const k = b.getAttribute('data-chip');
      if (k === 'date') { state.filters.bgn = ''; state.filters.end = ''; } else state.filters[k] = '';
      state.page = 1;
      renderKpis(); renderHead(); renderBody();
    }));
  }

  function renderColMenu() {
    const panel = document.querySelector('#ul-table [data-colmenu-panel]');
    panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
      COLUMNS.map(c => '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
        '<input type="checkbox" data-col="' + c.field + '"' + (state.hiddenCols[c.field] ? '' : ' checked') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>').join('');
    panel.querySelectorAll('[data-col]').forEach(chk => chk.addEventListener('change', () => {
      state.hiddenCols[chk.getAttribute('data-col')] = !chk.checked;
      renderHead(); renderBody();
    }));
  }

  function renderHead() {
    const thead = document.querySelector('#ul-table [data-thead]');
    const cs = cols();
    let html = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      cs.map(c => '<th data-sort="' + (c.sortable ? c.field : '') + '" class="py-2 px-2 text-left font-bold ' + (c.sortable ? 'cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 ' : '') + 'transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
        '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
        (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
        '</div></th>').join('') + '</tr>';
    if (state.showFilters) {
      html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' +
          (c.field === 'siraNo' ? '<button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button>' : c.filterable === false ? '' : filterCell(c)) +
        '</th>').join('') + '</tr>';
    }
    thead.innerHTML = html;
    thead.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => {
      const f = th.getAttribute('data-sort');
      if (!f) return;
      if (state.sortField === f) state.sortOrder *= -1; else { state.sortField = f; state.sortOrder = -1; }
      renderHead(); renderBody();
    }));
    thead.querySelectorAll('[data-f]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'datetime-local' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        state.filters[inp.getAttribute('data-f')] = inp.value;
        state.page = 1;
        if (inp.getAttribute('data-f') === 'res') renderKpis();
        renderBody();
      });
    });
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', clearFilters);
    renderChips();
  }

  // clearFilters()
  function clearFilters() {
    state.filters = {};
    state.search = '';
    state.quick = 'all';
    state.page = 1;
    document.querySelector('#ul-table [data-search]').value = '';
    renderKpis(); renderQuick(); renderHead(); renderBody();
  }

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const rows = lastFiltered.slice(start, start + state.pageSize);
    const cs = cols();
    const tbody = document.querySelector('#ul-table [data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + cs.length + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Gösterilecek kullanıcı logu bulunamadı.</span></td></tr>';
    } else {
      tbody.innerHTML = rows.map((r, i) => {
        const tint = r.res === 'denied' ? ' bg-rose-500/5' : (Number(r.sta) & 0x0f) >= 12 ? ' bg-rose-500/5' : '';
        return '<tr data-row="' + esc(r.cid) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + tint + '">' +
          cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, r, start + i + 1) + '</td>').join('') + '</tr>';
      }).join('');
    }
    renderChips();

    const footer = document.querySelector('#ul-table [data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam Kayıt: <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span>' +
        (lastFiltered.length !== ELEMENT_DATA.length ? ' <span class="text-slate-400">/ ' + ELEMENT_DATA.length + '</span>' : '') + '</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [10, 15, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
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
      document.querySelector('#ul-table [data-scroll]').scrollTop = 0;
    }));
  }

  // ---------------------------------------------------------------------------
  // Dışa aktarım (DCIM.kit.exportExcel — ';' ayraçlı CSV)
  // ---------------------------------------------------------------------------
  function exportRows(name, list) {
    if (!list.length) { toast(T.popup.alertNoExcelData, 'warning'); return; }
    kit.exportExcel(name + '_' + fmtDateKey(new Date()), [
      { header: T.popup.colRank, value: r => list.indexOf(r) + 1 },
      { header: T.fields.date, value: r => fmtDateTime(r.tim) },
      { header: T.fields.category, value: r => r.cat },
      { header: T.fields.description, value: r => r.txt },
      { header: 'Etkilenen Varlık', value: r => r.asset || '-' },
      { header: T.fields.username, value: r => r.user },
      { header: T.fields.userIp, value: r => r.ip },
      { header: T.fields.urlInfo, value: r => r.url || '-' },
      { header: 'Sonuç', value: r => (RESULT[r.res] || RESULT.success).label },
      { header: T.fields.status, value: r => getStaText(Number(r.sta)) }
    ], list);
  }

  // ---------------------------------------------------------------------------
  // Satır detayı (sunum eklentisi)
  // ---------------------------------------------------------------------------
  function openDetail(cid) {
    const r = ELEMENT_DATA.find(x => x.cid === cid);
    if (!r) return;
    const line = (k, v, cls) => '<div class="flex justify-between gap-3 py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"><span class="text-slate-500 shrink-0">' + k + '</span><span class="text-right break-all ' + (cls || 'text-slate-800 dark:text-slate-200') + '">' + v + '</span></div>';
    let prm = r.evt_prm;
    try { prm = JSON.stringify(JSON.parse(r.evt_prm), null, 2); } catch (e) { /* ham bırak */ }
    const sameUser = ELEMENT_DATA.filter(x => x.user === r.user && x !== r).slice(0, 5);
    dialog({
      title: r.cat + ' — Log Kaydı',
      subtitle: fmtDateTime(r.tim) + ' · ' + r.cid,
      variant: r.res === 'denied' || (Number(r.sta) & 0x0f) >= 12 ? 'danger' : r.res === 'failed' || badgeLevel(r.sta) === 'warning' ? 'warning' : 'info',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-2xl',
      body:
        '<div class="text-xs font-bold text-slate-900 dark:text-slate-100 mb-2">' + esc(r.txt) + '</div>' +
        '<div class="flex items-center gap-2 mb-3">' + resultBadge(r.res) + statusBadge(badgeLevel(r.sta), getStaText(Number(r.sta))) + '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
          '<div class="p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px]">' +
            line(T.fields.username, '<span class="font-mono font-bold">' + esc(r.user) + '</span>') +
            line(T.fields.userIp, '<span class="font-mono">' + esc(r.ip) + '</span>') +
            line('Etkilenen Varlık', esc(r.asset || '-')) +
            line(T.fields.urlInfo, '<span class="font-mono text-[10px]">' + esc(r.url || '-') + '</span>') +
          '</div>' +
          '<div class="p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px]">' +
            line('Kayıt ID (cid)', '<span class="font-mono">' + esc(r.cid) + '</span>') +
            line('Kaynak (doc / rid)', '<span class="font-mono">' + esc(r.doc || '-') + (r.rid ? ' / ' + esc(r.rid) : '') + '</span>') +
            line('sta', '<span class="font-mono">0x' + Number(r.sta).toString(16).toUpperCase().padStart(4, '0') + '</span>') +
            line('evt_api', '<span class="font-mono">syslog</span>') +
          '</div>' +
        '</div>' +
        '<div class="mt-3"><div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">evt_prm</div>' +
          '<pre class="text-[10px] font-mono p-2 rounded-[2px] bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sky-700 dark:text-sky-300 overflow-x-auto">' + esc(prm) + '</pre></div>' +
        (sameUser.length
          ? '<div class="mt-3"><div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">' + esc(r.user) + ' — son işlemler</div>' +
            '<div class="border border-slate-200 dark:border-slate-800 rounded-[2px] divide-y divide-slate-200 dark:divide-slate-800">' +
            sameUser.map(x => '<div class="px-2 py-1 flex items-center gap-2 text-[11px]"><span class="font-mono text-slate-500 shrink-0">' + fmtDateTime(x.tim) + '</span><span class="truncate text-slate-700 dark:text-slate-300">' + esc(x.txt) + '</span><span class="ml-auto shrink-0">' + resultBadge(x.res) + '</span></div>').join('') +
            '</div></div>'
          : '')
    });
  }

  // ---------------------------------------------------------------------------
  // Rapor penceresi (UserLogsReportPopupComponent)
  // ---------------------------------------------------------------------------
  const pop = { open: false, startDate: '2024-07-02', endDate: fmtDateKey(new Date()), isLoading: false, hasSearched: false, data: [], page: 1, pageSize: 50, pdfBusy: false, excelBusy: false };

  function openPopup() { pop.open = true; renderPopup(); }
  function closePopup() { pop.open = false; renderPopup(); }

  function searchPopup() {
    if (!pop.startDate || !pop.endDate) { toast(T.popup.alertStartEnd, 'warning'); return; }
    if (pop.startDate > pop.endDate) { toast(T.popup.alertDateOrder, 'warning'); pop.startDate = ''; renderPopup(); return; }
    pop.isLoading = true;
    pop.hasSearched = true;
    renderPopup();
    setTimeout(() => {
      pop.data = ELEMENT_DATA.filter(r => { const k = fmtDateKey(r.tim); return k >= pop.startDate && k <= pop.endDate; });
      pop.page = 1;
      pop.isLoading = false;
      renderPopup();
    }, 500);
  }

  function renderPopup() {
    const host = document.getElementById('ul-popup');
    if (!pop.open) { host.innerHTML = ''; return; }
    const totalPages = Math.max(1, Math.ceil(pop.data.length / pop.pageSize));
    const pageRows = pop.data.slice((pop.page - 1) * pop.pageSize, pop.page * pop.pageSize);
    const busy = pop.pdfBusy || pop.excelBusy;
    let body;
    if (pop.isLoading) {
      body = '<div class="py-16 flex flex-col items-center justify-center gap-3"><i class="pi pi-spin pi-spinner text-sky-400 text-3xl"></i><p class="text-slate-500 dark:text-slate-300 text-sm font-medium">' + T.popup.loading + '</p></div>';
    } else if (pop.data.length) {
      body = '<div class="flex-1 overflow-auto border border-slate-200 dark:border-border-subtle rounded-[2px] min-h-0 custom-scrollbar">' +
        '<table class="w-full text-left text-xs border-collapse min-w-max"><thead><tr class="sticky top-0 bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 font-semibold tracking-wider uppercase z-10 shadow-sm">' +
          [T.popup.colRank, T.fields.date, T.fields.category, T.fields.description, T.fields.username, T.fields.userIp, T.fields.urlInfo, T.fields.status]
            .map(h => '<th class="px-3 py-2 whitespace-nowrap border-r border-slate-200 dark:border-border-subtle last:border-r-0 bg-slate-100 dark:bg-surface-panel text-[10px]">' + h + '</th>').join('') +
        '</tr></thead><tbody class="divide-y divide-slate-200 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' +
          pageRows.map((r, i) => '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
            '<td class="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]">' + ((pop.page - 1) * pop.pageSize + i + 1) + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]">' + fmtDateTime(r.tim) + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap text-[11px] font-bold">' + esc(r.cat) + '</td>' +
            '<td class="px-3 py-1.5 text-[11px]" style="max-width: 420px;">' + esc(r.txt) + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]">' + esc(r.user) + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap font-mono text-[11px]">' + esc(r.ip) + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap font-mono text-[10px] text-slate-500">' + esc(r.url || '-') + '</td>' +
            '<td class="px-3 py-1.5 whitespace-nowrap">' + statusBadge(badgeLevel(r.sta), getStaText(Number(r.sta))) + '</td>' +
          '</tr>').join('') +
        '</tbody></table></div>';
    } else if (pop.hasSearched) {
      body = kit.emptyState({ icon: 'pi pi-inbox', message: T.popup.noData });
    } else {
      body = kit.emptyState({ icon: 'pi pi-calendar', message: 'Tarih aralığı seçip "Ara" butonuna basın.' });
    }
    host.innerHTML =
      '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4" data-pop-overlay>' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl flex flex-col w-full max-w-[95vw] xl:max-w-7xl max-h-[85vh] overflow-hidden">' +
          '<div class="px-5 py-3.5 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel flex-shrink-0">' +
            '<div class="flex items-center gap-3"><i class="pi pi-book text-sky-600 dark:text-sky-400 text-lg"></i>' +
              '<h3 class="text-base font-bold text-slate-800 dark:text-white tracking-wide">' + T.popup.title + '</h3></div>' +
            '<button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 transition-colors" data-pop="close"><i class="pi pi-times text-lg"></i></button>' +
          '</div>' +
          '<div class="px-5 py-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-end justify-between gap-3">' +
            '<div class="flex flex-wrap items-end gap-3">' +
              '<div class="w-44">' + kit.formField({ label: T.popup.startDate, control: '<input type="date" data-pop-date="startDate" value="' + esc(pop.startDate) + '" class="scada-input" />' }) + '</div>' +
              '<div class="w-44">' + kit.formField({ label: T.popup.endDate, control: '<input type="date" data-pop-date="endDate" value="' + esc(pop.endDate) + '" class="scada-input" />' }) + '</div>' +
              button({ variant: 'primary', icon: pop.isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-search', label: pop.isLoading ? T.popup.searching : T.popup.search, attrs: 'data-pop="search"' + (pop.isLoading ? ' disabled' : '') }) +
            '</div>' +
            (pop.data.length && !pop.isLoading
              ? '<div class="flex items-center gap-2">' +
                  '<span class="text-xs text-slate-500 dark:text-slate-400 mr-1">' + T.popup.totalPrefix + ' <b class="text-slate-900 dark:text-slate-100 font-mono">' + pop.data.length + '</b> ' + T.popup.totalSuffix + '</span>' +
                  button({ variant: 'secondary', size: 'sm', icon: pop.pdfBusy ? 'pi pi-spin pi-spinner' : 'pi pi-file-pdf', label: pop.pdfBusy ? T.popup.pdfGenerating : T.popup.pdfDownload, attrs: 'data-pop="pdf"' + (busy ? ' disabled' : '') }) +
                  button({ variant: 'secondary', size: 'sm', icon: pop.excelBusy ? 'pi pi-spin pi-spinner' : 'pi pi-file-excel', label: pop.excelBusy ? T.popup.excelGenerating : T.popup.excelDownload, attrs: 'data-pop="excel"' + (busy ? ' disabled' : '') }) +
                '</div>'
              : '') +
          '</div>' +
          '<div class="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">' + body + '</div>' +
          (!pop.isLoading && pop.data.length > pop.pageSize
            ? '<div class="px-5 py-2.5 border-t border-slate-200 dark:border-border-subtle flex items-center justify-center gap-3 text-xs bg-slate-50 dark:bg-surface-panel">' +
                button({ variant: 'secondary', size: 'sm', icon: 'pi pi-chevron-left', label: T.popup.back, attrs: 'data-pop="prev"' + (pop.page <= 1 ? ' disabled' : '') }) +
                '<span class="font-bold text-slate-700 dark:text-slate-300">' + T.popup.pageLabel + ' ' + pop.page + ' / ' + totalPages + '</span>' +
                button({ variant: 'secondary', size: 'sm', icon: 'pi pi-chevron-right', label: T.popup.next, attrs: 'data-pop="next"' + (pop.page >= totalPages ? ' disabled' : '') }) +
              '</div>'
            : '') +
        '</div>' +
      '</div>';
  }

  document.getElementById('ul-popup').addEventListener('click', e => {
    const ov = e.target.closest('[data-pop-overlay]');
    if (ov && e.target === ov) { closePopup(); return; }
    const b = e.target.closest('[data-pop]');
    if (!b || b.disabled) return;
    switch (b.getAttribute('data-pop')) {
      case 'close': closePopup(); break;
      case 'search': searchPopup(); break;
      case 'prev': pop.page--; renderPopup(); break;
      case 'next': pop.page++; renderPopup(); break;
      case 'excel':
        pop.excelBusy = true; renderPopup();
        setTimeout(() => { pop.excelBusy = false; renderPopup(); exportRows('Kullanici_Loglari_' + pop.startDate + '_' + pop.endDate, pop.data); }, 400);
        break;
      case 'pdf':
        pop.pdfBusy = true; renderPopup();
        setTimeout(() => { pop.pdfBusy = false; closePopup(); toast(T.popup.pdfSuccessToast, 'success', 'Başarılı'); kit.exportPdf(); }, 500);
        break;
    }
  });
  document.getElementById('ul-popup').addEventListener('change', e => {
    const inp = e.target.closest('[data-pop-date]');
    if (!inp) return;
    pop[inp.getAttribute('data-pop-date')] = inp.value;
    // onDateChange(): başlangıç bitişten büyük olamaz
    if (pop.startDate && pop.endDate && pop.startDate > pop.endDate) { toast(T.popup.alertDateOrder, 'warning'); pop.startDate = ''; renderPopup(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.open) closePopup(); });

  // ---------------------------------------------------------------------------
  // Açılış
  // ---------------------------------------------------------------------------
  renderHeader();
  renderKpis();
  renderTableShell();
  renderQuick();
  renderHead();
  renderBody();
  if (params.get('report') === '1') openPopup();
})();
