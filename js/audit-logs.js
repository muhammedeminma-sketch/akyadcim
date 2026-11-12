/* ==========================================================================
   DCIM Sunum — Audit ve Loglar (NewUICMPLogsComponent, /dcim/logs)
   Kaynak: new-ui/pages/logs/logs.component.{html,ts}
           + system-logs/system-logs.component   (Sistem Logları sekmesi — HIS_cme_list)
           + user-logs/user-logs.component       (Kullanıcı Logları sekmesi — HIS_user_log_list)
           + popups/event-detail-popup           (Sistem logunda kategoriye tıklayınca evt_prm "Olay Detayları")
           + popups/user-logs-report-popup / system-logs-report-popup (Kasım 2026 görünümü; ?popup=1)
           + app-report-export-menu (Kasım 2026: eski "Rapor" düğmesinin yerine; kapsam açık sekme,
             tarih aralığı seçimi; rapor ekrandaki süzgeçlerle eşleşen tüm kayıtları içerir)
   Sekmeler: Sistem Logları (orijinalde varsayılan) · Kullanıcı Logları. Tablolar varsayılan 50 satır.
   Mobil (lg altı): sekmeler alt çizgili tam genişlik (.nu-mtabs), satırlar kart olur
     (sistem: tarih başlık, kategori alt başlık, açıklama, durum rozeti; kullanıcı: tarih, kullanıcı, açıklama, durum),
     kayıt sayısı rozeti gizlenir (tablonun altında "Toplam … kayıt" yazar).
   Kullanıcı Logları verisi: DCIM.data.auditLogs (CME syslog satırları) + lock-authorization.html /
     permission-settings.html'de bu oturumda kaydedilen YETKİ kayıtları (sessionStorage 'dcim_audit_session').
   Sistem Logları verisi: DCIM.data.events (CME olay geçmişi) + aynı syslog satırları (HIS_cme_list ikisini de içerir).

   SUNUM EKLENTİLERİ (kullanıcı sekmesi): "Etkilenen Varlık" ve "Sonuç" (Başarılı / Reddedildi / Başarısız)
   kolonları, özet kartları, durum hızlı filtreleri, satır detayı penceresi.

   Derin bağlantılar:
     ?tab=system|user    sekme (verilmezse: kullanıcı süzgeci varsa Kullanıcı, yoksa Sistem Logları)
     ?q=1DA03            genel arama (Kullanıcı Logları)
     ?result=denied      sonuç filtresi (success | denied | failed)
     ?user=deniz.koc     kullanıcı kolon filtresi (filtre satırını açar)
     ?cat=KAPAK          kategori kolon filtresi
     ?sta=8              hızlı filtre (1 BİLGİ, 4 UYARI, 8 ALARM, 12 KRİZ)
     ?filters=1          kolon içi filtre satırı açık
     ?report=1           rapor menüsünü (Rapor al) açık başlatır
     ?popup=1            tarih aralıklı rapor penceresi (user/system-logs-report-popup) açık başlar
     ?cme=first          (Sistem Logları) ilk kaydın "Olay Detayları" penceresi
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, statusBadge, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'audit' });

  const SRC = DCIM.data.auditLogs;
  const EV = DCIM.data.events;
  const params = new URLSearchParams(window.location.search);

  // messages.tr.json → userLogs.* / historicalEvents.* / report.*
  const T = {
    title: 'Audit ve Loglar',
    management: 'Yönetim',
    systemLogs: 'Sistem Logları',
    userLogs: 'Kullanıcı Logları',
    filter: 'Filtre',
    fields: { no: 'No', date: 'Tarih', category: 'Kategori', description: 'Açıklama', username: 'Kullanıcı Adı', userIp: 'Kullanıcı IP', urlInfo: 'URL Bilgisi', status: 'Durum' },
    sys: { date: 'Kayıt Tarihi', code: 'Kod', category: 'Kategori', source: 'Kaynak', desc: 'Açıklama', status: 'Durum' },
    ph: { start: 'Başlangıç', end: 'Bitiş', all: '-Tümü-', searchCat: 'Kategori Ara...', searchDesc: 'Açıklama Ara...', searchUser: 'Kullanıcı Ara...', searchIp: 'IP Ara...', searchUrl: 'URL Ara...' },
    sta: {
      info: 'BİLGİ', warning: 'UYARI', warningPassed: 'UYARI-GEÇTİ', alarm: 'ALARM', alarmPassed: 'ALARM-GEÇTİ', crisis: 'KRİZ', crisisPassed: 'KRİZ-GEÇTİ',
      cancel: 'İPTAL', new: 'YENİ', waiting: 'BEKLİYOR', processing: 'İŞLİYOR', completed: 'TAMAMLANDI',
      stoppedWarning: 'DURDU-UYARI', waitingWarning: 'BEKLİYOR-UYARI', processingWarning: 'İŞLİYOR-UYARI',
      failedAlarm: 'BAŞARISIZ-ALARM', stoppedAlarm: 'DURDU-ALARM', waitingAlarm: 'BEKLİYOR-ALARM', processingAlarm: 'İŞLİYOR-ALARM',
      failedCrisis: 'BAŞARISIZ-KRİZ', stoppedCrisis: 'DURDU-KRİZ', waitingCrisis: 'BEKLİYOR-KRİZ', processingCrisis: 'İŞLİYOR-KRİZ'
    },
    popup: {
      userTitle: 'Kullanıcı Logları Raporu', systemTitle: 'Rapor Oluştur', startDate: 'Başlangıç Tarihi', endDate: 'Bitiş Tarihi',
      searching: 'Aranıyor...', search: 'Ara', pdfDownload: 'PDF İndir', excelDownload: 'Excel İndir', pdfGenerating: 'PDF Oluşturuluyor...', excelGenerating: 'Excel Oluşturuluyor...',
      total: 'Toplam', records: 'kayıt', loading: 'Veriler yükleniyor...', noData: 'Seçilen tarih aralığında veri bulunamadı.', colRank: 'Sıra No',
      back: 'Geri', next: 'İleri', alertStartEnd: 'Başlangıç ve bitiş tarihlerini seçiniz.', alertDateOrder: 'Başlangıç tarihi bitiş tarihinden büyük olamaz!'
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
  // Ortak yardımcılar (component.ts → getStaText / logs-status.util getLogBadgeLevel)
  // ---------------------------------------------------------------------------
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
  // getLogBadgeLevel(): 1 = bilgi, 4-7 = uyarı, 8-11 = alarm, 12-15 = kriz
  function logLevel(sta) {
    const code = Number(sta) & 0x000f;
    switch (code & 0x000c) {
      case 0x0004: return 'warning';
      case 0x0008: return 'alarm';
      case 0x000c: return 'crisis';
      default: return code === 1 ? 'info' : 'normal';
    }
  }
  // AppStatusBadgeComponent 'crisis' → mor (shell statusBadge'de yok)
  function levelBadge(level, label) {
    if (level !== 'crisis') return statusBadge(level, label);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>' + esc(label) + '</span>';
  }
  const staBadge = sta => (getStaText(Number(sta)) === '-' ? '<span class="text-slate-400">—</span>' : levelBadge(logLevel(sta), getStaText(Number(sta))));
  // Kullanıcı logu rozeti (user-logs getBadgeLevel: 4-5 uyarı, 8-9 ve 12+ alarm, 1 bilgi)
  function userLevel(sta) {
    const c = Number(sta) & 0x000f;
    if (c === 4 || c === 5) return 'warning';
    if (c === 8 || c === 9 || c >= 12) return 'alarm';
    if (c === 1) return 'info';
    return 'normal';
  }
  const pad = n => String(n).padStart(2, '0');
  const fmtMs = d => fmtDateTime(d) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  const fmtShort = d => (d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : '…');
  const requestLabel = req => (req && (req.from || req.to) ? fmtShort(req.from) + ' – ' + fmtShort(req.to) : '');
  const lc = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');

  // Kurgusal ağ: başka sayfaların oturum kuyruğuna yazdığı eski adresler kurgusal karşılığına çevrilir
  const fixNet = v => String(v == null ? '' : v).replace(/http:\/\/10\.130\.1\.111/g, 'https://dcim.dca.local').replace(/\b10\.130\./g, '10.24.').replace(/\b172\.16\./g, '192.168.');

  // ---------------------------------------------------------------------------
  // Veri
  // ---------------------------------------------------------------------------
  // user-logs parseCmePointsData(): kullanıcı / IP / URL evt_prm içindedir
  function parseCmePointsData(data) {
    return data.map(item => {
      let prm = {};
      try { prm = typeof item.evt_prm === 'string' ? JSON.parse(item.evt_prm) : (item.evt_prm || {}); } catch (e) { prm = {}; }
      return Object.assign({}, item, { user: prm.user || '', ip: fixNet(prm.ip), url: fixNet(prm.url), asset: prm.asset || '', res: prm.res || 'success' });
    });
  }
  // HIS_cme_list: CME olay geçmişi (otonom olaylar) + syslog satırları; kaynak = doc/rid/atr
  const EV_ATR = { locks: 'sta', ups: 'val', climate: 'val', pdu: 'val', sensor: 'val', user: 'usr', system: 'evt' };
  function buildSystemRows() {
    const ev = (EV ? EV.list : []).map(e => ({
      tim: e.tim, cid: e.id, cat: e.cat, doc: e.doc, rid: e.ref || '-', atr: EV_ATR[e.grp] || 'val', txt: e.src + ': ' + e.txt, sta: e.sta,
      evt_prm: JSON.stringify({ src: e.src, grp: e.grp, doc: e.doc, rid: e.ref, sev: e.sev, evt: { txt: e.txt, sta: '0x' + e.sta.toString(16).toUpperCase().padStart(4, '0') } })
    }));
    const sys = USER_DATA.map(r => ({
      tim: r.tim, cid: r.cid, cat: r.cat, doc: r.doc || 'DAS', rid: r.rid || r.user || '-', atr: r.atr || 'syslog', txt: r.txt, sta: r.sta,
      evt_prm: JSON.stringify({ evt_api: 'syslog', user: r.user, ip: r.ip, url: r.url, asset: r.asset, res: r.res })
    }));
    return ev.concat(sys).sort((a, b) => b.tim - a.tim);
  }

  let USER_DATA = [];
  let SYSTEM_DATA = [];
  function load() {
    USER_DATA = parseCmePointsData(SRC.sessionRows().concat(SRC.rows)).sort((a, b) => b.tim - a.tim);
    SYSTEM_DATA = buildSystemRows();
  }
  load();

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const userParam = ['q', 'result', 'user', 'cat', 'sta', 'filters'].some(k => params.get(k));
  const view = { tab: params.get('tab') === 'system' || params.get('tab') === 'user' ? params.get('tab') : (userParam ? 'user' : 'system') };

  const state = {
    search: params.get('q') || '',
    quick: ['1', '4', '8', '12'].indexOf(params.get('sta')) >= 0 ? params.get('sta') : 'all',
    filters: { user: params.get('user') || '', cat: params.get('cat') || '', res: RESULT[params.get('result')] ? params.get('result') : '' },
    sortField: 'date',
    sortOrder: -1,
    page: 1,
    pageSize: 50,
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
  const dtKey = d => fmtDateKey(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const staMatches = (sta, f) => {
    const c = Number(sta) & 0x000f;
    if (f === '1') return c === 1;
    if (f === '4') return c === 4 || c === 5;
    if (f === '8') return c === 8 || c === 9;
    if (f === '12') return c >= 12;
    return true;
  };
  const isExternalIp = ip => !!ip && ip.indexOf('10.24.') !== 0;

  // inputFilter() → where koşulları (sunucu yerine istemci tarafında uygulanır)
  function filtered() {
    const f = state.filters;
    const q = lc(state.search.trim());
    let list = USER_DATA.slice();
    if (state.quick !== 'all') list = list.filter(r => staMatches(r.sta, state.quick));
    if (q) list = list.filter(r => [r.txt, r.asset, r.user, r.ip, r.cat, r.url].some(v => lc(v).indexOf(q) >= 0));
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
  // Sayfa başlığı + rapor menüsü (logs.component: [scopes] açık sekmeye göre, options="dateRange")
  // ---------------------------------------------------------------------------
  let reportMenu = null;
  function renderHeader() {
    const host = document.getElementById('al-header');
    host.innerHTML = kit.pageHeader({
      title: T.title,
      compact: true,
      breadcrumbs: [{ label: T.management }, { label: T.title }],
      actions: '<div class="flex items-center gap-2"><div data-report-menu></div></div>'
    });
    mountReportMenu();
  }
  function mountReportMenu() {
    if (reportMenu) reportMenu.destroy();
    reportMenu = DCIM.report.menu(document.querySelector('#al-header [data-report-menu]'), {
      scopes: view.tab === 'system'
        ? [{ id: 'system', label: 'Sistem logları', hint: 'Ekrandaki arama ve filtrelerle' }]
        : [{ id: 'user', label: 'Kullanıcı logları', hint: 'Ekrandaki arama ve filtrelerle' }],
      options: 'dateRange',
      unit: 'kayıt',
      onExport: exportReport
    });
  }

  // ---------------------------------------------------------------------------
  // Sekmeler (Sistem Logları / Kullanıcı Logları) — mobilde .nu-mtabs alt çizgili tam genişlik
  // ---------------------------------------------------------------------------
  function renderTabs() {
    const host = document.getElementById('al-tabs');
    const tab = (key, icon, label) => {
      const on = view.tab === key;
      const count = key === 'system' ? (sysTable ? sysTable.getFiltered().length : SYSTEM_DATA.length) : lastFiltered.length;
      return '<button type="button" role="tab" aria-selected="' + on + '" data-tab="' + key + '" class="px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-surface-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-border-subtle font-medium') + '">' +
        '<i class="pi ' + icon + ' text-xs"></i><span>' + label + '</span>' +
        (on ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] bg-slate-100 dark:bg-surface-base text-slate-700 dark:text-slate-300 font-bold max-lg:hidden">' + count + '</span>' : '') +
        '</button>';
    };
    host.innerHTML = '<div class="flex items-center gap-2 max-lg:w-full nu-mtabs" role="tablist">' + tab('system', 'pi-cog', T.systemLogs) + tab('user', 'pi-users', T.userLogs) + '</div>';
    host.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.getAttribute('data-tab'))));
  }
  function switchTab(tab) {
    if (view.tab === tab) return;
    view.tab = tab;
    document.getElementById('al-system').classList.toggle('hidden', tab !== 'system');
    document.getElementById('al-user').classList.toggle('hidden', tab !== 'user');
    if (tab === 'system') ensureSystemTable();
    mountReportMenu();
    renderTabs();
  }

  // ---------------------------------------------------------------------------
  // Sistem Logları (system-logs.component → app-data-table, kart görünümü)
  // ---------------------------------------------------------------------------
  const SYS_STATUS_OPTS = ['BİLGİ', 'UYARI', 'UYARI-GEÇTİ', 'ALARM', 'ALARM-GEÇTİ', 'KRİZ', 'İPTAL', 'YENİ', 'BEKLİYOR', 'İŞLİYOR', 'TAMAMLANDI',
    'DURDU-UYARI', 'BEKLİYOR-UYARI', 'İŞLİYOR-UYARI', 'BAŞARISIZ-ALARM', 'DURDU-ALARM', 'BEKLİYOR-ALARM', 'İŞLİYOR-ALARM', 'BAŞARISIZ-KRİZ', 'DURDU-KRİZ', 'BEKLİYOR-KRİZ', 'İŞLİYOR-KRİZ']
    .map(v => ({ value: v, label: v }));
  const catButton = r => '<button type="button" data-cme="' + esc(r.cid) + '" class="text-sky-600 dark:text-sky-400 font-bold hover:underline cursor-pointer text-left" title="Olay Detayları">' + esc(r.cat || '-') + '</button>';
  const SYS_COLUMNS = [
    { field: 'date', header: T.sys.date, sortable: true, width: '200px', wrap: false, mobile: 'primary', filterable: false,
      value: r => r.tim.getTime(), render: r => '<span class="font-mono">' + fmtMs(r.tim) + '</span>', card: r => '<span class="font-mono">' + fmtDateTime(r.tim) + '</span>' },
    { field: 'code', header: T.sys.code, width: '110px', wrap: false, mobile: 'meta', value: r => r.cid, render: r => '<span class="font-mono text-slate-600 dark:text-slate-300">' + esc(r.cid) + '</span>' },
    { field: 'category', header: T.sys.category, width: '120px', mobile: 'sub', mobileIcon: 'pi-tag', value: r => r.cat, render: catButton, card: catButton },
    { field: 'source', header: T.sys.source, width: '240px', minWidth: '240px', maxWidth: '300px', mobile: 'meta', mobileBlock: true, value: r => r.doc + '/' + r.rid + '/' + r.atr,
      render: r => '<span class="font-mono text-[10.5px] text-slate-600 dark:text-slate-300" style="overflow-wrap:anywhere">' + esc(r.doc + '/' + r.rid + '/' + r.atr) + '</span>' },
    { field: 'description', header: T.sys.desc, mobile: 'secondary', minWidth: '280px', maxWidth: '560px', value: r => r.txt },
    { field: 'status', header: T.sys.status, width: '150px', sortable: true, wrap: false, mobile: 'badge', value: r => getStaText(Number(r.sta)),
      filter: { type: 'select', options: SYS_STATUS_OPTS }, render: r => staBadge(r.sta) }
  ];
  let sysTable = null;
  function ensureSystemTable() {
    if (sysTable) return;
    sysTable = kit.dataTable(document.getElementById('al-system'), {
      columns: SYS_COLUMNS,
      rows: SYSTEM_DATA,
      searchFields: ['code', 'category', 'source', 'description', 'status'],
      sortField: 'date',
      sortOrder: -1,
      emptyText: 'Gösterilecek kayıt bulunamadı.',
      onRefresh: () => { load(); sysTable.setRows(SYSTEM_DATA); toast('Sistem logları api.HIS_cme_list sorgusuyla yenilendi.', 'success'); },
      onChange: () => renderTabs()
    });
    document.getElementById('al-system').addEventListener('click', e => {
      const b = e.target.closest('[data-cme]');
      if (!b) return;
      e.stopPropagation();
      const r = SYSTEM_DATA.find(x => x.cid === b.getAttribute('data-cme'));
      if (r) openEventDetail(r.evt_prm);
    });
  }

  // event-detail-popup: evt_prm iç içe tablo; mobilde alttan açılan sayfa
  function openEventDetail(evtPrm) {
    let obj = evtPrm;
    try { if (typeof obj === 'string') obj = JSON.parse(obj); } catch (e) { obj = null; }
    const entries = o => Object.keys(o || {}).map(k => {
      let v = o[k];
      if (typeof v === 'string') { try { const p = JSON.parse(v); if (p && typeof p === 'object') v = p; } catch (e) { /* metin */ } }
      return { key: k, value: v };
    });
    const table = (items, level) =>
      '<table class="w-full border-collapse text-[11px] max-lg:text-[12px]' + (level > 0 ? ' mt-1' : '') + '"><tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
      items.map(en => '<tr>' +
        '<td class="py-1.5 pr-3 align-top font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap max-lg:whitespace-normal max-lg:break-words max-lg:w-[38%] w-1/3 border-r border-slate-100 dark:border-border-subtle">' + esc(en.key) + '</td>' +
        '<td class="py-1.5 pl-3 align-top text-slate-900 dark:text-slate-100 break-words max-lg:break-all">' +
          (en.value && typeof en.value === 'object'
            ? '<div class="pl-2 border-l-2 border-sky-500/30">' + table(entries(en.value), level + 1) + '</div>'
            : esc(en.value == null || en.value === '' ? '-' : en.value)) +
        '</td></tr>').join('') + '</tbody></table>';
    const list = obj && typeof obj === 'object' ? entries(obj) : [];
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 max-lg:p-0 max-lg:items-end bg-slate-950/75 backdrop-blur-xs animate-fade-in select-none';
    host.innerHTML =
      '<div data-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-2xl max-h-[85vh] max-lg:max-h-[92vh] max-lg:rounded-b-none max-lg:rounded-t-[10px] flex flex-col overflow-hidden animate-modal-pop">' +
        '<div class="px-4 py-3 max-lg:py-3.5 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between gap-2 bg-slate-50 dark:bg-surface-base shrink-0">' +
          '<div class="flex items-center gap-2"><div class="w-7 h-7 rounded-[2px] bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0"><i class="pi pi-info-circle text-xs"></i></div>' +
          '<h3 class="text-xs max-lg:text-sm font-bold text-slate-800 dark:text-slate-200">Olay Detayları</h3></div>' +
          '<button type="button" data-close title="Kapat" class="w-6 h-6 max-lg:w-9 max-lg:h-9 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><i class="pi pi-times text-xs"></i></button>' +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-auto p-4 max-lg:p-3 text-xs select-text">' +
          (list.length ? table(list, 0) : '<div class="py-6 text-center text-slate-400 italic">Olay detayları bulunamadı.</div>') +
        '</div>' +
        '<div class="px-4 py-2.5 max-lg:px-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-base flex items-center justify-end shrink-0">' +
          '<button type="button" data-close class="max-lg:w-full max-lg:h-10 max-lg:text-[13px] max-lg:rounded-[3px] px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold rounded-[2px] text-xs hover:bg-slate-300 dark:hover:bg-slate-700 cursor-pointer transition-colors">Kapat</button>' +
        '</div>' +
      '</div>';
    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    host.addEventListener('click', e => { if (!e.target.closest('[data-panel]') || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(host);
  }

  // ---------------------------------------------------------------------------
  // Kullanıcı Logları — özet kartları (sunum eklentisi; alarms.html şiddet kartlarıyla aynı dil)
  // ---------------------------------------------------------------------------
  let lastFiltered = [];
  function renderKpis() {
    const base = USER_DATA;
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
      { key: 'users', label: 'Kullanıcı / IP', icon: 'pi pi-users', tone: 'slate', value: users + ' / ' + ips, sub: '10.24.x · 192.168.x' }
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
  // Kullanıcı Logları — app-data-table
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const dateCls = 'w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const MOBILE_INPUT = ' max-lg:h-10 max-lg:px-2.5 max-lg:text-base max-lg:font-medium max-lg:rounded-[3px]';
  const opt = (v, l, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + l + '</option>';
  const txtFilter = (k, ph) => '<input type="text" data-f="' + k + '" value="' + esc(state.filters[k] || '') + '" placeholder="' + esc(ph) + '" class="' + inputCls + MOBILE_INPUT + '" />';

  function filterCell(col) {
    const f = state.filters;
    switch (col.field) {
      case 'date':
        return '<div class="flex flex-col gap-0.5">' +
          '<input type="datetime-local" data-f="bgn" value="' + esc(f.bgn || '') + '" class="' + dateCls + MOBILE_INPUT + '" placeholder="' + T.ph.start + '" aria-label="' + T.ph.start + '" />' +
          '<input type="datetime-local" data-f="end" value="' + esc(f.end || '') + '" class="' + dateCls + MOBILE_INPUT + '" placeholder="' + T.ph.end + '" aria-label="' + T.ph.end + '" /></div>';
      case 'category': return txtFilter('cat', T.ph.searchCat);
      case 'description': return txtFilter('txt', T.ph.searchDesc);
      case 'asset': return txtFilter('asset', 'Varlık Ara...');
      case 'username': return txtFilter('user', T.ph.searchUser);
      case 'userIp': return txtFilter('ip', T.ph.searchIp);
      case 'urlInfo': return txtFilter('url', T.ph.searchUrl);
      case 'result':
        return '<select data-f="res" class="' + selectCls + MOBILE_INPUT + '">' + opt('', T.ph.all, f.res || '') + opt('success', 'Başarılı', f.res) + opt('denied', 'Reddedildi', f.res) + opt('failed', 'Başarısız', f.res) + '</select>';
      case 'status':
        return '<select data-f="sta" class="' + selectCls + MOBILE_INPUT + '">' + opt('', T.ph.all, f.sta || '') + opt('1', T.sta.info, f.sta) + opt('4', T.sta.warning, f.sta) + opt('8', T.sta.alarm, f.sta) + opt('12', T.sta.crisis, f.sta) + '</select>';
      default: return '';
    }
  }

  const CAT_ICON = {
    'OTURUM': 'pi pi-sign-in', 'ALARM_ACK': 'pi pi-bell', 'İŞ EMRİ': 'pi pi-list-check', 'RAPOR': 'pi pi-file', 'MÜŞTERİ': 'pi pi-users', 'USER': 'pi pi-user-edit',
    'YETKİ': 'pi pi-shield', 'AYAR': 'pi pi-sliders-h', 'INFO': 'pi pi-info-circle', 'PDU LAUNCH': 'pi pi-external-link', 'KAPAK KİLİDİ': 'pi pi-lock-open', 'ENERJİ KONTROL': 'pi pi-power-off'
  };
  const userCell = r => r.user === 'system'
    ? '<span class="inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400"><i class="pi pi-cog text-[10px]"></i>system</span>'
    : '<span class="font-mono font-semibold text-slate-800 dark:text-slate-200">' + esc(r.user || r.cid || '-') + '</span>';
  const ipCell = r => '<span class="font-mono ' + (isExternalIp(r.ip) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300') + '">' + esc(r.ip || '-') + '</span>';

  function cell(col, r, idx) {
    switch (col.field) {
      case 'siraNo': return '<span class="cell-nowrap">' + idx + '</span>';
      case 'date': return '<span class="cell-nowrap font-mono">' + fmtDateTime(r.tim) + '</span>';
      case 'category':
        return '<span class="inline-flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300"><i class="' + (CAT_ICON[r.cat] || 'pi pi-tag') + ' text-[10px] text-sky-500"></i>' + esc(r.cat || '-') + '</span>';
      case 'description': return '<span class="cell-wrap" style="overflow-wrap: anywhere;" title="' + esc(r.txt) + '">' + esc(r.txt || '-') + '</span>';
      case 'asset': return r.asset ? '<span class="cell-wrap text-slate-600 dark:text-slate-300">' + esc(r.asset) + '</span>' : '<span class="text-slate-400">-</span>';
      case 'username': return userCell(r);
      case 'userIp': return ipCell(r);
      case 'urlInfo': return r.url ? '<span class="block truncate font-mono text-[10px] text-slate-500 dark:text-slate-400" style="max-width: 160px;" title="' + esc(r.url) + '">' + esc(r.url) + '</span>' : '<span class="text-slate-400">-</span>';
      case 'result': return resultBadge(r.res);
      case 'status': return '<div class="inline-flex items-center min-w-0">' + statusBadge(userLevel(r.sta), getStaText(Number(r.sta))) + '</div>';
      default: return '';
    }
  }

  // Mobil kart sütunları (logColumns → mobile: hide | primary | meta | secondary | sub | badge)
  const USER_CARD_COLS = [
    { field: 'date', header: T.fields.date, mobile: 'primary', card: r => '<span class="font-mono">' + fmtDateTime(r.tim) + '</span>' },
    { field: 'status', header: T.fields.status, mobile: 'badge', card: r => statusBadge(userLevel(r.sta), getStaText(Number(r.sta))) },
    { field: 'username', header: T.fields.username, mobile: 'sub', mobileIcon: 'pi-user', card: r => esc(r.user || '-') },
    { field: 'description', header: T.fields.description, mobile: 'secondary', card: r => esc(r.txt || '-') },
    { field: 'category', header: T.fields.category, mobile: 'meta', card: r => esc(r.cat || '-') },
    { field: 'userIp', header: T.fields.userIp, mobile: 'meta', card: ipCell },
    { field: 'result', header: 'Sonuç', mobile: 'meta', card: r => resultBadge(r.res) },
    { field: 'urlInfo', header: T.fields.urlInfo, mobile: 'meta', mobileBlock: true, card: r => '<span class="font-mono text-[10.5px] break-all">' + esc(r.url || '-') + '</span>' },
    { field: 'asset', header: 'Etkilenen Varlık', mobile: 'extra', mobileBlock: true, card: r => esc(r.asset || '-') }
  ];

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '') + (c.maxWidth ? 'max-width:' + c.maxWidth + ';' : '');
  const TOOL_BTN = 'px-2.5 py-1 max-lg:py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer';

  function renderTableShell() {
    const host = document.getElementById('ul-table');
    const quick = [{ label: T.ph.all, value: 'all' }, { label: T.sta.info, value: '1' }, { label: T.sta.warning, value: '4' }, { label: T.sta.alarm, value: '8' }, { label: T.sta.crisis, value: '12' }];
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">' +
        '<div class="flex flex-wrap items-center gap-2 max-lg:w-full max-lg:flex-col max-lg:items-stretch">' +
          '<div class="relative w-60 sm:w-72 max-lg:w-full">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara (işlem, varlık, kullanıcı, IP)" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 max-lg:py-2.5 text-xs max-lg:text-sm bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex items-center gap-1 max-lg:max-w-full max-lg:overflow-x-auto max-lg:pb-0.5">' + quick.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + q.label + '</button>').join('') + '</div>' +
          '<span data-chips class="flex flex-wrap items-center gap-1"></span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0 max-lg:w-full max-lg:flex-wrap">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0 max-lg:hidden" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<button type="button" data-filter-toggle title="Filtre" class="' + TOOL_BTN + '"><i class="pi pi-filter text-xs"></i><span>' + T.filter + '</span></button>' +
          '<div class="relative max-lg:hidden">' +
            '<button type="button" data-colmenu class="' + TOOL_BTN + '"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-48 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
          '</div>' +
          '<button type="button" data-refresh class="' + TOOL_BTN + '" title="Yenile"><i class="pi pi-refresh text-xs"></i><span>Yenile</span></button>' +
        '</div>' +
      '</div>' +
      '<div data-mfilters class="hidden lg:hidden shrink-0 max-h-[42vh] overflow-y-auto p-2 grid grid-cols-1 gap-1.5 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-[#0b121e]"></div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar max-lg:hidden" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div data-cards class="' + kit.CARDS_WRAP_CLS + '"></div>' +
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
    host.querySelector('[data-filter-toggle]').addEventListener('click', () => { state.showFilters = !state.showFilters; renderQuick(); renderHead(); });
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
    const onRow = e => {
      if (e.target.closest('summary,a')) return;
      const row = e.target.closest('[data-row]');
      if (row) openDetail(row.getAttribute('data-row'));
    };
    host.querySelector('[data-tbody]').addEventListener('click', onRow);
    host.querySelector('[data-cards]').addEventListener('click', onRow);
  }

  function renderQuick() {
    document.querySelectorAll('#ul-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === state.quick;
      b.className = 'px-2 py-1 max-lg:px-3 max-lg:py-1.5 max-lg:whitespace-nowrap max-lg:shrink-0 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
    const ft = document.querySelector('#ul-table [data-filter-toggle]');
    ft.className = state.showFilters
      ? 'px-2.5 py-1 max-lg:py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer bg-sky-600 text-white font-bold border-sky-600'
      : TOOL_BTN;
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

  function wireFilterInputs(scope) {
    scope.querySelectorAll('[data-f]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'datetime-local' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        state.filters[inp.getAttribute('data-f')] = inp.value;
        state.page = 1;
        if (inp.getAttribute('data-f') === 'res') renderKpis();
        renderBody();
      });
    });
    const clr = scope.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', clearFilters);
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
    wireFilterInputs(thead);

    // Mobil süzgeç paneli (kartların üstünde; aynı kolon filtreleri, etiketli)
    const mf = document.querySelector('#ul-table [data-mfilters]');
    mf.classList.toggle('hidden', !state.showFilters);
    mf.innerHTML = state.showFilters
      ? COLUMNS.filter(c => c.filterable !== false).map(c =>
          '<label class="flex flex-col gap-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">' + esc(c.header) + filterCell(c) + '</label>').join('') +
        '<button type="button" data-clear-filters class="h-9 rounded-[3px] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 cursor-pointer"><i class="pi pi-filter-slash text-xs"></i>Temizle</button>'
      : '';
    wireFilterInputs(mf);
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
    document.querySelector('#ul-table [data-cards]').innerHTML = kit.dataCards(rows, USER_CARD_COLS, {
      start,
      empty: 'Gösterilecek kullanıcı logu bulunamadı.',
      rowAttrs: r => 'data-row="' + esc(r.cid) + '"',
      cardCls: () => 'cursor-pointer'
    });
    renderChips();

    const footer = document.querySelector('#ul-table [data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span> kayıt listeleniyor.' +
        (lastFiltered.length !== USER_DATA.length ? ' <span class="text-slate-400">/ ' + USER_DATA.length + '</span>' : '') + '</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto max-lg:w-full max-lg:justify-between">' +
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
      document.querySelector('#ul-table [data-scroll]').scrollTop = 0;
      document.querySelector('#ul-table [data-cards]').scrollTop = 0;
    }));
    if (view.tab === 'user') renderTabs();
  }

  // ---------------------------------------------------------------------------
  // Satır detayı (sunum eklentisi)
  // ---------------------------------------------------------------------------
  function openDetail(cid) {
    const r = USER_DATA.find(x => x.cid === cid);
    if (!r) return;
    const line = (k, v, cls) => '<div class="flex justify-between gap-3 py-1 border-b border-slate-100 dark:border-slate-800 last:border-b-0"><span class="text-slate-500 shrink-0">' + k + '</span><span class="text-right break-all ' + (cls || 'text-slate-800 dark:text-slate-200') + '">' + v + '</span></div>';
    let prm = r.evt_prm;
    try { prm = JSON.stringify(JSON.parse(r.evt_prm), null, 2); } catch (e) { /* ham bırak */ }
    prm = fixNet(prm);
    const sameUser = USER_DATA.filter(x => x.user === r.user && x !== r).slice(0, 5);
    dialog({
      title: r.cat + ' — Log Kaydı',
      subtitle: fmtDateTime(r.tim) + ' · ' + r.cid,
      variant: r.res === 'denied' || (Number(r.sta) & 0x0f) >= 12 ? 'danger' : r.res === 'failed' || userLevel(r.sta) === 'warning' ? 'warning' : 'info',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-2xl',
      body:
        '<div class="text-xs font-bold text-slate-900 dark:text-slate-100 mb-2">' + esc(r.txt) + '</div>' +
        '<div class="flex items-center gap-2 mb-3">' + resultBadge(r.res) + statusBadge(userLevel(r.sta), getStaText(Number(r.sta))) + '</div>' +
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
  // Rapor (app-report-export-menu → exportReport): açık sekmenin süzgeçleri + kayıt zamanı aralığı
  // ---------------------------------------------------------------------------
  const TONE = { info: 'info', warning: 'warning', alarm: 'alarm', crisis: 'acil', normal: '' };

  function userFilterText() {
    const f = state.filters;
    const quick = { '1': T.sta.info, '4': T.sta.warning, '8': T.sta.alarm, '12': T.sta.crisis };
    return [
      state.search.trim() ? 'arama "' + state.search.trim() + '"' : '',
      (f.user || '').trim() ? 'kullanıcı "' + f.user.trim() + '"' : '',
      (f.cat || '').trim() ? 'kategori "' + f.cat.trim() + '"' : '',
      (f.ip || '').trim() ? 'IP "' + f.ip.trim() + '"' : '',
      (f.url || '').trim() ? 'URL "' + f.url.trim() + '"' : '',
      (f.txt || '').trim() ? 'açıklama "' + f.txt.trim() + '"' : '',
      (f.asset || '').trim() ? 'varlık "' + f.asset.trim() + '"' : '',
      f.res ? 'sonuç: ' + RESULT[f.res].label : '',
      f.sta || state.quick !== 'all' ? 'durum: ' + quick[f.sta || state.quick] : '',
      f.bgn || f.end ? 'tarih sütunu: ' + (f.bgn || '…').replace('T', ' ') + ' – ' + (f.end || '…').replace('T', ' ') : ''
    ].filter(Boolean);
  }

  function buildUserReport(rows, req, label) {
    const filters = userFilterText();
    const tone = r => userLevel(r.sta);
    const count = k => rows.filter(r => tone(r) === k).length;
    const users = new Set(rows.map(r => r.user || r.cid).filter(Boolean)).size;
    const range = requestLabel(req);
    return {
      title: 'Kullanıcı Logları Raporu',
      subtitle: (range ? 'Kayıt zamanı: ' + range : label || 'Kullanıcı logları') + (filters.length ? ' · Filtre: ' + filters.join(', ') : '') + ' · Audit ve Loglar · ' + rows.length + ' kayıt',
      filename: 'Kullanici_Loglari',
      kpis: [
        { label: 'Kayıt', value: rows.length },
        { label: 'Kullanıcı', value: users },
        { label: 'Uyarı', value: count('warning'), tone: count('warning') ? 'warning' : 'normal' },
        { label: 'Alarm / Kriz', value: count('alarm'), tone: count('alarm') ? 'alarm' : 'normal' }
      ],
      sections: [{
        title: 'Kullanıcı logları',
        toneKey: 'tone',
        columns: [{ key: 'tim', label: 'Tarih' }, { key: 'cat', label: 'Kategori' }, { key: 'txt', label: 'Açıklama' }, { key: 'user', label: 'Kullanıcı' },
          { key: 'ip', label: 'IP' }, { key: 'url', label: 'URL' }, { key: 'sta', label: 'Durum' }],
        rows: rows.map(r => ({ tim: fmtMs(r.tim), cat: r.cat, txt: r.txt, user: r.user || r.cid, ip: r.ip, url: r.url, sta: getStaText(Number(r.sta)), tone: TONE[tone(r)] }))
      }],
      notes: ['Kayıtlar kullanıcı log geçmişinden (HIS_user_log_list) okunur; kullanıcı, IP ve URL kaydın parametrelerinden (evt_prm) alınır.']
        .concat(rows.length ? [] : ['Seçilen aralıkta kayıt yok.'])
    };
  }

  function systemFilterText() {
    const st = sysTable ? sysTable.state : { search: '', filters: {} };
    const label = { code: 'kod', category: 'kategori', source: 'kaynak', description: 'açıklama', status: 'durum' };
    return [st.search.trim() ? 'arama "' + st.search.trim() + '"' : '']
      .concat(Object.keys(st.filters).filter(k => String(st.filters[k] || '').trim()).map(k => (label[k] || k) + (k === 'status' ? ': ' : ' "') + String(st.filters[k]).trim() + (k === 'status' ? '' : '"')))
      .filter(Boolean);
  }

  function buildSystemReport(rows, req, label) {
    const filters = systemFilterText();
    const count = ks => rows.filter(r => ks.indexOf(logLevel(r.sta)) >= 0).length;
    const range = requestLabel(req);
    return {
      title: 'Sistem Logları Raporu',
      subtitle: (range ? 'Kayıt zamanı: ' + range : label || 'Sistem logları') + (filters.length ? ' · Filtre: ' + filters.join(', ') : '') + ' · Audit ve Loglar · ' + rows.length + ' kayıt',
      filename: 'Sistem_Loglari',
      kpis: [
        { label: 'Kayıt', value: rows.length },
        { label: 'Bilgi', value: count(['info']), tone: 'info' },
        { label: 'Uyarı', value: count(['warning']), tone: count(['warning']) ? 'warning' : 'normal' },
        { label: 'Alarm / Kriz', value: count(['alarm', 'crisis']), tone: count(['alarm', 'crisis']) ? 'alarm' : 'normal' }
      ],
      sections: [{
        title: 'Sistem logları',
        toneKey: 'tone',
        columns: [{ key: 'tim', label: 'Tarih' }, { key: 'cid', label: 'Kod' }, { key: 'cat', label: 'Kategori' }, { key: 'src', label: 'Kaynak' },
          { key: 'txt', label: 'Açıklama' }, { key: 'sta', label: 'Durum' }],
        rows: rows.map(r => ({ tim: fmtMs(r.tim), cid: r.cid, cat: r.cat, src: r.doc + '/' + r.rid + '/' + r.atr, txt: r.txt, sta: getStaText(Number(r.sta)), tone: TONE[logLevel(r.sta)] }))
      }],
      notes: ['Kayıtlar olay geçmişinden (HIS_cme_list) okunur; durum kaydın sta değerinden çevrilir.'].concat(rows.length ? [] : ['Seçilen aralıkta kayıt yok.'])
    };
  }

  function exportReport(req) {
    if (req.scope === 'system') {
      ensureSystemTable();
      DCIM.report.generate(buildSystemReport(DCIM.report.applyRange(sysTable.getFiltered(), req, 'tim'), req), req.format);
    } else {
      DCIM.report.generate(buildUserReport(DCIM.report.applyRange(filtered(), req, 'tim'), req), req.format);
    }
  }

  // ---------------------------------------------------------------------------
  // Rapor penceresi (user-logs-report-popup / system-logs-report-popup — Kasım 2026 görünümü; ?popup=1)
  // ---------------------------------------------------------------------------
  const pop = { open: false, startDate: fmtDateKey(new Date(Date.now() - 7 * 86400000)), endDate: fmtDateKey(new Date()), isLoading: false, hasSearched: false, data: [], page: 1, pageSize: 50, pdfBusy: false, excelBusy: false };
  const popIsSystem = () => view.tab === 'system';

  function openPopup() { pop.open = true; pop.hasSearched = false; pop.data = []; renderPopup(); }
  function closePopup() { pop.open = false; renderPopup(); }

  function searchPopup() {
    if (!pop.startDate || !pop.endDate) { toast(T.popup.alertStartEnd, 'warning'); return; }
    if (pop.startDate > pop.endDate) { toast(T.popup.alertDateOrder, 'warning'); pop.startDate = ''; renderPopup(); return; }
    pop.isLoading = true;
    pop.hasSearched = true;
    renderPopup();
    setTimeout(() => {
      const src = popIsSystem() ? SYSTEM_DATA : USER_DATA;
      pop.data = src.filter(r => { const k = fmtDateKey(r.tim); return k >= pop.startDate && k <= pop.endDate; });
      pop.page = 1;
      pop.isLoading = false;
      renderPopup();
    }, 500);
  }

  function renderPopup() {
    const host = document.getElementById('ul-popup');
    if (!pop.open) { host.innerHTML = ''; return; }
    const sys = popIsSystem();
    const totalPages = Math.max(1, Math.ceil(pop.data.length / pop.pageSize));
    const pageRows = pop.data.slice((pop.page - 1) * pop.pageSize, pop.page * pop.pageSize);
    const busy = pop.pdfBusy || pop.excelBusy;
    const th = h => '<th class="px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + h + '</th>';
    const td = v => '<td class="px-3 py-2 text-xs">' + v + '</td>';
    const heads = sys ? [T.popup.colRank, T.fields.date, T.sys.code, T.sys.category, T.sys.source, T.sys.desc, T.sys.status]
      : [T.popup.colRank, T.fields.date, T.fields.category, T.fields.description, T.fields.username, T.fields.userIp, T.fields.urlInfo, T.fields.status];
    const dateInput = (key, label) =>
      '<div class="w-full sm:w-auto flex-1"><label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">' + label + '</label>' +
        '<div class="relative"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><i class="pi pi-calendar text-sm"></i></span>' +
        '<input type="date" data-pop-date="' + key + '" value="' + esc(pop[key]) + '" class="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-base border border-slate-300 dark:border-slate-700 rounded text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all cursor-pointer" /></div></div>';
    let body;
    if (pop.isLoading) {
      body = '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">' +
        '<div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin mb-4"></div>' +
        '<span class="text-sm font-medium text-slate-600 dark:text-slate-300">' + T.popup.loading + '</span></div>';
    } else if (pop.data.length) {
      body = '<table class="w-full text-left border-collapse text-xs whitespace-nowrap"><thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' + heads.map(th).join('') + '</tr></thead><tbody>' +
        pageRows.map((r, i) => '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors text-slate-700 dark:text-slate-300">' +
          td((pop.page - 1) * pop.pageSize + i + 1) + td(fmtMs(r.tim)) +
          (sys
            ? td(esc(r.cid)) + td(esc(r.cat)) + td(esc(r.doc + '/' + r.rid + '/' + r.atr)) + td(esc(r.txt)) + td(staBadge(r.sta))
            : td(esc(r.cat)) + td(esc(r.txt)) + td(esc(r.user)) + td(esc(r.ip)) + td(esc(r.url)) +
              td(getStaText(Number(r.sta)) === '-' ? '<span class="text-slate-400">—</span>' : statusBadge(userLevel(r.sta), getStaText(Number(r.sta))))) +
          '</tr>').join('') + '</tbody></table>';
    } else if (pop.hasSearched) {
      body = '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">' + T.popup.noData + '</p></div>';
    } else {
      body = '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
        '<div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-search text-2xl text-slate-400 dark:text-slate-500"></i></div>' +
        '<p class="text-sm font-medium">' + T.popup.startDate + ': ' + esc(pop.startDate) + ' · ' + T.popup.endDate + ': ' + esc(pop.endDate) + '</p></div>';
    }
    host.innerHTML =
      '<div class="fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 sm:p-6" data-pop-overlay>' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-[95vw] sm:max-w-7xl flex flex-col max-h-[90vh] transform transition-all">' +
          // Header
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 rounded-t-lg shrink-0">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500"><i class="pi pi-file text-lg"></i></div>' +
              '<div><h2 class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">' + (sys ? T.popup.systemTitle : T.popup.userTitle) + '</h2>' +
              (pop.startDate && pop.endDate ? '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">' + esc(pop.startDate) + ' – ' + esc(pop.endDate) + '</p>' : '') + '</div>' +
            '</div>' +
            '<button type="button" data-pop="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer outline-none"><i class="pi pi-times"></i></button>' +
          '</div>' +
          // Filters Section (referans: Olay Raporu Oluştur)
          '<div class="p-5 bg-white dark:bg-surface-card border-b border-slate-200 dark:border-slate-800 shrink-0">' +
            '<div class="flex flex-col sm:flex-row gap-4 items-end">' +
              dateInput('startDate', T.popup.startDate) + dateInput('endDate', T.popup.endDate) +
              '<div class="w-full sm:w-auto flex-[0.5]"><button type="button" data-pop="search"' + (pop.isLoading ? ' disabled' : '') + ' class="w-full h-[38px] bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors shadow-sm flex justify-center items-center gap-2 uppercase tracking-wide cursor-pointer">' +
                '<i class="pi ' + (pop.isLoading ? 'pi-spinner pi-spin' : 'pi-search') + '"></i><span>' + (pop.isLoading ? T.popup.searching : T.popup.search) + '</span></button></div>' +
            '</div>' +
          '</div>' +
          // Export Actions Section
          (pop.data.length && !pop.isLoading
            ? '<div class="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
                '<div class="flex gap-2">' +
                  '<button type="button" data-pop="pdf"' + (busy ? ' disabled' : '') + ' class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi ' + (pop.pdfBusy ? 'pi-spinner pi-spin' : 'pi-file-pdf') + '"></i>' + (pop.pdfBusy ? T.popup.pdfGenerating : T.popup.pdfDownload) + '</button>' +
                  '<button type="button" data-pop="excel"' + (busy ? ' disabled' : '') + ' class="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi ' + (pop.excelBusy ? 'pi-spinner pi-spin' : 'pi-file-excel') + '"></i>' + (pop.excelBusy ? T.popup.excelGenerating : T.popup.excelDownload) + '</button>' +
                '</div>' +
                '<div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">' + T.popup.total + ' ' + pop.data.length + ' ' + T.popup.records + '</div>' +
              '</div>'
            : '') +
          // Table Container
          '<div class="flex-1 overflow-auto bg-white dark:bg-[#0f172a] relative min-h-[300px] custom-scrollbar">' + body + '</div>' +
          (!pop.isLoading && pop.data.length > pop.pageSize
            ? '<div class="px-5 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 text-xs bg-slate-50 dark:bg-slate-900/40 rounded-b-lg shrink-0">' +
                button({ variant: 'secondary', size: 'sm', icon: 'pi pi-chevron-left', label: T.popup.back, attrs: 'data-pop="prev"' + (pop.page <= 1 ? ' disabled' : '') }) +
                '<span class="font-bold text-slate-700 dark:text-slate-300">Sayfa ' + pop.page + ' / ' + totalPages + '</span>' +
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
    const req = { from: new Date(pop.startDate + 'T00:00'), to: new Date(pop.endDate + 'T23:59') };
    const doc = () => (popIsSystem() ? buildSystemReport(pop.data, req) : buildUserReport(pop.data, req));
    switch (b.getAttribute('data-pop')) {
      case 'close': closePopup(); break;
      case 'search': searchPopup(); break;
      case 'prev': pop.page--; renderPopup(); break;
      case 'next': pop.page++; renderPopup(); break;
      case 'excel':
        pop.excelBusy = true; renderPopup();
        setTimeout(() => { pop.excelBusy = false; renderPopup(); DCIM.report.generate(doc(), 'xlsx'); }, 400);
        break;
      case 'pdf':
        pop.pdfBusy = true; renderPopup();
        setTimeout(() => { pop.pdfBusy = false; renderPopup(); DCIM.report.generate(doc(), 'pdf'); }, 500);
        break;
    }
  });
  document.getElementById('ul-popup').addEventListener('change', e => {
    const inp = e.target.closest('[data-pop-date]');
    if (!inp) return;
    pop[inp.getAttribute('data-pop-date')] = inp.value;
    // onDateChange(): başlangıç bitişten büyük olamaz
    if (pop.startDate && pop.endDate && pop.startDate > pop.endDate) { toast(T.popup.alertDateOrder, 'warning'); pop.startDate = ''; }
    renderPopup();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.open) closePopup(); });

  // ---------------------------------------------------------------------------
  // Açılış
  // ---------------------------------------------------------------------------
  renderKpis();
  renderTableShell();
  renderQuick();
  renderHead();
  renderBody();
  document.getElementById('al-system').classList.toggle('hidden', view.tab !== 'system');
  document.getElementById('al-user').classList.toggle('hidden', view.tab !== 'user');
  if (view.tab === 'system') ensureSystemTable();
  renderHeader();
  renderTabs();

  if (params.get('popup') === '1') { if (pop.startDate) { openPopup(); searchPopup(); } }
  else if (params.get('report') === '1') { const b = document.querySelector('#al-header [data-rk-btn]'); if (b) b.click(); }
  if (params.get('cme') && view.tab === 'system') {
    const r = params.get('cme') === 'first' ? sysTable.getFiltered()[0] : SYSTEM_DATA.find(x => x.cid === params.get('cme'));
    if (r) openEventDetail(r.evt_prm);
  }
})();
