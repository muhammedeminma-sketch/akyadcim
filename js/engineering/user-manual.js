/* ==========================================================================
   DCIM Sunum — Kullanım Kılavuzu oluşturucu (NewUICMPUserManualComponent)
   Kaynak: new-ui/pages/engineering/user-manual/user-manual.component.{html,ts}
   Kılavuz modül kaydını (assets/user-manual/modules.json) navbar ile karşılaştırır: yeni / taşınan / adı ya da
   izni değişen sayfalar üstteki sarı kutuda listelenir. Modül tablosundan seçim yapılır; seçime göre
   Claude Code komutu ("/user-manual 6,13") hazırlanır ve "Kopyala" ile panoya alınır.
   SUNUM: modül kaydı aşağıdaki sabit listedir (basit mock); ekran yakalama / bölüm üretimi yapılmaz.
   Kılavuzu okumak için başlıktaki "Kullanım Kılavuzu & SSS" (DCIM.manual.open) kullanılır.
   Derin bağlantılar (engineering.html#user-manual?...):
     ?pick=all|notCreated|changed      → hazır seçim
     ?sel=6,13                         → belirli modüller seçili
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, statusBadge, toast } = DCIM.ui;
  const kit = DCIM.kit;

  // messages.tr.json → userManual.*
  const T = {
    title: 'Kullanım Kılavuzu',
    subtitle: "Oluşturulacak veya güncellenecek kılavuz modüllerini seçin, ardından komutu Claude Code'da çalıştırın.",
    changesTitle: 'Modül listesine henüz işlenmemiş navbar değişiklikleri',
    changesHint: 'Modül seçici bir sonraki çalışmasında yeni sayfalara numara verir ve bu değişiklikleri kaydeder. Menü taşımaları ve navbar bileşenine yazılmış bağlantılar yalnızca orada kontrol edilir.',
    listTitle: 'Modüller', listSub: '{date} tarihli modül listesi',
    selectAll: 'Tümünü seç', selectNotCreated: 'Oluşturulmamışları seç', selectChanged: 'Değişenleri seç', clear: 'Temizle',
    colNo: 'No', colPage: 'Sayfa', colAddress: 'Adres', colStatus: 'Durum', colNotes: 'Notlar',
    removedTitle: "Navbar'dan kaldırılanlar (bölümler saklanır)",
    commandTitle: 'Claude Code komutu', commandEmpty: 'Oluşturulacak veya güncellenecek modülleri işaretleyin',
    copy: 'Kopyala', copied: 'Kopyalandı',
    commandHint: "Komutu DCIM klasöründe başlatılmış Claude Code'da çalıştırın. Ekran yakalama; yerel AyXDB, ng serve ve yakalama Chrome'u olan bir geliştirici makinesi gerektirir; bu sayfa onu başlatmaz."
  };

  const CHECKED_ON = '2026-11-04';
  // Modül kaydı (mock). status: done | started | new; changed: navbar'da ad/izin farkı bulundu (tarayıcı kontrolü)
  const ROWS = [
    { group: 'Genel Bakış', n: 1, prefix: 'OV', title: 'Overview', route: '/dcim/dashboard', status: 'done', updated: '2026-11-02' },
    { group: 'Operasyon', n: 2, prefix: 'DT', title: '2D General View', route: '/dcim/operations/digital-twin-2d', status: 'done', updated: '2026-10-14', menuChanged: '2026-11-09' },
    { group: 'Operasyon', n: 3, prefix: 'D3', title: 'Digital Twin 3D', route: '/dcim/operations/digital-twin-3d', status: 'done', updated: '2026-10-15', menuChanged: '2026-11-10' },
    { group: 'Operasyon', n: 4, prefix: 'WO', title: 'Work Orders', route: '/dcim/work-orders', status: 'done', updated: '2026-10-15' },
    { group: 'Operasyon', n: 5, prefix: 'CM', title: 'Customer Matching', route: '/dcim/newuicmp-customer-pages', status: 'done', updated: '2026-10-15' },
    { group: 'Operasyon', n: null, title: 'CCTV', route: '/dcim/operations/cctv' },
    { group: 'Tesis', n: 6, prefix: 'BM', title: 'BMS · Bina Yönetimi', route: '/dcim/showcase/bms', status: 'done', updated: '2026-11-03' },
    { group: 'Tesis', n: 7, prefix: 'EO', title: 'Energy Overview', route: '/dcim/energy/scada-energy', status: 'done', updated: '2026-10-19', changed: true },
    { group: 'Tesis', n: 8, prefix: 'CT', title: 'SDP Cable Topology', route: '/dcim/energy/connectivity', status: 'done', updated: '2026-10-19' },
    { group: 'Varlıklar', n: 9, prefix: 'CA', title: 'Customer Assets', route: '/dcim/assets/all-assets', status: 'done', updated: '2026-10-16' },
    { group: 'Varlıklar', n: 10, prefix: 'PD', title: 'PDU Detail Page', route: '/dcim/assets/pdu-detail', status: 'done', updated: '2026-10-16' },
    { group: 'Varlıklar', n: 11, prefix: 'LS', title: 'Location Schema', route: '/dcim/assets/location-list', status: 'done', updated: '2026-10-16' },
    { group: 'Varlıklar', n: 12, prefix: 'ML', title: 'Model Library', route: '/dcim/assets/category-list', status: 'done', updated: '2026-10-16' },
    { group: 'Varlıklar', n: 13, prefix: 'IE', title: 'Import Hata Kayıtları', route: '/dcim/assets/lnk-faild-list', status: 'done', updated: '2026-11-03' },
    { group: 'İzleme', n: 14, prefix: 'AA', title: 'Active Alarms', route: '/dcim/active-alarms', status: 'done', updated: '2026-10-20' },
    { group: 'İzleme', n: 15, prefix: 'HA', title: 'Historical Alarms', route: '/dcim/historical-alarms', status: 'done', updated: '2026-10-20' },
    { group: 'İzleme', n: 16, prefix: 'AE', title: 'Autonomous Events', route: '/dcim/events', status: 'done', updated: '2026-10-20' },
    { group: 'İzleme', n: 17, prefix: 'TP', title: 'Telemetry Points', route: '/dcim/telemetry-points', status: 'done', updated: '2026-10-20' },
    { group: 'İzleme', n: 18, prefix: 'TM', title: 'Ticket Management', route: '/dcim/engineering/ticket-management', status: 'done', updated: '2026-11-03' },
    { group: 'İzleme', n: null, title: 'Bakım Modülü', route: '/dcim/maintenance' },
    { group: 'İzleme', n: 19, prefix: 'SH', title: 'Sistem Sağlığı (System Health)', route: '/dcim/monitoring/system-health', status: 'done', updated: '2026-10-20' },
    { group: 'İzleme', n: 20, prefix: 'CL', title: 'Cabinet Locks', route: '/dcim/monitoring/sensplorer-locks', status: 'started', updated: '2026-11-06' },
    { group: 'İzleme', n: 21, prefix: 'CX', title: 'Cabinet Anomaly', route: '/dcim/analytics/cabin-anomaly', status: 'done', updated: '2026-11-03' },
    { group: 'Raporlar', n: 22, prefix: 'RP, PUE, CUE, UPS, SDP…', title: 'Reports', route: '/dcim/reports', status: 'done', updated: '2026-11-03' },
    { group: 'Yönetim', n: 23, prefix: 'EN', title: 'Engineering', route: '/dcim/engineering', status: 'done', updated: '2026-11-04', menuChanged: '2026-11-09' },
    { group: 'Yönetim', n: 24, prefix: 'AS', title: 'Account Settings', route: '/dcim/account-settings', status: 'done', updated: '2026-11-04' },
    { group: 'Yönetim', n: 25, prefix: 'PS', title: 'Permission Settings', route: '/dcim/permission-settings', status: 'done', updated: '2026-11-04' },
    { group: 'Yönetim', n: 26, prefix: 'AL', title: 'Audit & Logs', route: '/dcim/logs', status: 'done', updated: '2026-11-04' },
    { group: 'Yönetim', n: 28, prefix: 'LA', title: 'Lock Authorization', route: '/dcim/lock-authorization', status: 'new', added: '2026-11-05' },
    { group: 'Navbar links (mobile menu)', n: 27, prefix: 'MH', title: 'Mobile Application', route: '/dcim/mobile-dashboard', status: 'done', updated: '2026-11-04' }
  ];
  const CHANGES = [
    'Yeni sayfa: CCTV (/dcim/operations/cctv)',
    'Yeni sayfa: Bakım Modülü (/dcim/maintenance)',
    'Adı değişti: 7. Energy Overview → PMS Dashboard'
  ];
  const REMOVED = [];

  function statusOf(r) {
    if (!r.n) return { badge: 'info', label: 'Yeni sayfa' };
    if (r.status === 'done') return (r.menuChanged || r.changed) ? { badge: 'warning', label: 'Güncelleme önerilir' } : { badge: 'normal', label: 'Tamamlandı' };
    if (r.status === 'started') return { badge: 'pending', label: 'Başlandı' };
    return { badge: 'inactive', label: 'Oluşturulmadı' };
  }
  function describe(r) {
    if (!r.n) return 'Modül seçici bir sonraki çalışmasında numara verir';
    if (r.status === 'done') {
      const base = 'Son görünüm: ' + r.updated;
      if (r.menuChanged) return base + ' · navbar girişi ' + r.menuChanged + ' tarihinde değişti';
      return r.changed ? base + ' · liste kaydedildikten sonra navbar girişi değişti' : base;
    }
    if (r.status === 'started') return r.updated + ' tarihinde başlandı, tamamlanmadı';
    return r.added ? r.added + " tarihinden beri navbar'da, henüz oluşturulmadı" : 'Henüz oluşturulmadı';
  }
  const isWarn = r => !r.n || r.changed || !!r.menuChanged;

  DCIM.engRegistry['user-manual'] = {
    mount(el, params) {
      const selected = new Set();
      let copied = false, copyTimer = null;
      const BTN = DCIM.ui.buttonClasses('secondary', 'sm', false);

      function pick(kind) {
        selected.clear();
        ROWS.forEach(r => {
          if (!r.n) return;
          const take = kind === 'all' || (kind === 'notCreated' && r.status !== 'done') ||
            (kind === 'changed' && (r.changed || !!r.menuChanged || !!r.added));
          if (take) selected.add(r.n);
        });
        copied = false;
      }
      const command = () => selected.size ? '/user-manual ' + Array.from(selected).sort((a, b) => a - b).join(',') : '';

      if (params.get('pick')) pick(params.get('pick'));
      (params.get('sel') || '').split(',').map(Number).filter(Boolean).forEach(n => selected.add(n));

      el.innerHTML =
        '<div class="p-4">' +
          kit.pageHeader({ title: T.title, breadcrumbs: [{ label: 'Mühendislik', href: '#home' }, { label: T.title }] }) +
          '<p class="-mt-2 mb-2 text-[11px] text-slate-500 dark:text-slate-400">' + esc(T.subtitle) + '</p>' +
          '<div class="flex flex-col gap-4 mt-2">' +
            '<div class="px-3 py-2.5 rounded-[2px] border text-xs border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">' +
              '<p class="font-bold">' + esc(T.changesTitle) + '</p>' +
              '<ul class="mt-1 list-disc pl-5 space-y-0.5">' + CHANGES.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
              '<p class="mt-1.5 text-[11px] opacity-80">' + esc(T.changesHint) + '</p>' +
            '</div>' +
            kit.card({
              title: T.listTitle, subtitle: T.listSub.replace('{date}', CHECKED_ON), icon: 'pi pi-book',
              actions: '<div class="flex flex-wrap items-center gap-2">' +
                [['all', T.selectAll], ['notCreated', T.selectNotCreated], ['changed', T.selectChanged], ['none', T.clear]]
                  .map(p => '<button type="button" data-um-pick="' + p[0] + '" class="' + BTN + '"><span class="truncate">' + esc(p[1]) + '</span></button>').join('') +
              '</div>',
              body: '<div class="overflow-x-auto" data-um-table></div>' +
                (REMOVED.length ? '<p class="mt-3 text-[11px] text-slate-500 dark:text-slate-400"><span class="font-bold">' + esc(T.removedTitle) + ':</span> ' + REMOVED.map(esc).join(', ') + '</p>' : '')
            }) +
            kit.card({
              title: T.commandTitle, icon: 'pi pi-code',
              body: '<div class="flex flex-wrap items-center gap-2">' +
                  '<input data-um-cmd readonly type="text" class="flex-1 min-w-[16rem] h-8 px-2.5 rounded-[2px] border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-base font-mono text-xs text-slate-900 dark:text-slate-100" placeholder="' + esc(T.commandEmpty) + '">' +
                  '<button type="button" data-um-copy class="' + DCIM.ui.buttonClasses('primary', 'md', false) + '"></button>' +
                '</div>' +
                '<p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">' + esc(T.commandHint) + '</p>'
            }) +
          '</div>' +
        '</div>';

      const $ = s => el.querySelector(s);

      function renderTable() {
        let prevGroup = null;
        $('[data-um-table]').innerHTML =
          '<table class="w-full text-left border-collapse text-xs">' +
            '<thead><tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle">' +
              '<th class="py-1.5 px-2.5 w-8"></th><th class="py-1.5 px-2.5 w-12">' + T.colNo + '</th><th class="py-1.5 px-2.5">' + T.colPage + '</th>' +
              '<th class="py-1.5 px-2.5">' + T.colAddress + '</th><th class="py-1.5 px-2.5">' + T.colStatus + '</th><th class="py-1.5 px-2.5">' + T.colNotes + '</th>' +
            '</tr></thead><tbody class="text-slate-800 dark:text-slate-200">' +
            ROWS.map(r => {
              const head = r.group !== prevGroup
                ? '<tr class="bg-slate-50 dark:bg-surface-panel"><td colspan="6" class="pt-3 pb-1 px-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(r.group) + '</td></tr>' : '';
              prevGroup = r.group;
              const s = statusOf(r);
              return head +
                '<tr class="border-b border-slate-100 dark:border-border-subtle hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors duration-100">' +
                  '<td class="py-1.5 px-2.5">' + (r.n ? '<input type="checkbox" data-um-n="' + r.n + '" class="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"' + (selected.has(r.n) ? ' checked' : '') + '>' : '') + '</td>' +
                  '<td class="py-1.5 px-2.5 font-mono font-semibold tabular-nums">' + (r.n || '—') + '</td>' +
                  '<td class="py-1.5 px-2.5 font-semibold">' + esc(r.title) + (r.prefix ? '<span class="ml-1 text-[10px] font-mono text-slate-400">' + esc(r.prefix) + '</span>' : '') + '</td>' +
                  '<td class="py-1.5 px-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">' + esc(r.route) + '</td>' +
                  '<td class="py-1.5 px-2.5">' + statusBadge(s.badge, s.label) + '</td>' +
                  '<td class="py-1.5 px-2.5 text-[11px] ' + (isWarn(r) ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400') + '">' + esc(describe(r)) + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table>';
        el.querySelectorAll('[data-um-n]').forEach(cb => cb.addEventListener('change', () => {
          const n = Number(cb.getAttribute('data-um-n'));
          if (cb.checked) selected.add(n); else selected.delete(n);
          copied = false;
          renderCommand();
        }));
      }

      function renderCommand() {
        const cmd = command();
        $('[data-um-cmd]').value = cmd;
        const btn = $('[data-um-copy]');
        btn.disabled = !cmd;
        btn.innerHTML = '<i class="' + (copied ? 'pi pi-check' : 'pi pi-copy') + ' text-current shrink-0"></i><span class="truncate">' + (copied ? T.copied : T.copy) + '</span>';
      }

      el.querySelectorAll('[data-um-pick]').forEach(b => b.addEventListener('click', () => {
        const k = b.getAttribute('data-um-pick');
        if (k === 'none') { selected.clear(); copied = false; } else pick(k);
        renderTable();
        renderCommand();
      }));
      $('[data-um-copy]').addEventListener('click', () => {
        const cmd = command();
        if (!cmd) return;
        const done = () => {
          copied = true;
          renderCommand();
          clearTimeout(copyTimer);
          copyTimer = setTimeout(() => { copied = false; renderCommand(); }, 2000);
        };
        if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(cmd).then(done, () => toast('Panoya kopyalanamadı.', 'warning')); return; }
        const input = $('[data-um-cmd]');
        input.select();
        try { if (document.execCommand('copy')) done(); } catch (e) { toast('Panoya kopyalanamadı.', 'warning'); }
      });

      renderTable();
      renderCommand();
      return { destroy() { clearTimeout(copyTimer); } };
    }
  };
})();
