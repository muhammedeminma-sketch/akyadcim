/* ==========================================================================
   DCIM Sunum — Sistem Bakım (NewUICMPSystemMaintenanceComponent, K15)
   Kaynak: new-ui/pages/engineering/system-maintenance/system-maintenance.component.{html,ts}
   (9 Kas 2026, 9ec74b6dc "DAS: CMR gün bazlı saklama (CMR_KEEP_GUN) ve Sistem Bakım ekranı (K15)")
   Sol: "Veritabanı Özet Bilgileri" (CMA/CMR/CME/CTC/CTT/CTS: veri sayısı, en eski veri, durum — 45.000 altı Normal,
   45.000–50.000 Uyarı, üstü Kritik) + "Rapor al". Sağ: Otomatik Silme (aç/kapat, CMR Saklama Süresi, Manuel Silme),
   Uzak/Yerel Bağlantı, Servisi Yeniden Başlat.
   CMR Saklama Süresi: Süresiz / 2 ay / 1 / 3 / 5 / 10 yıl (kök CMR_KEEP_GUN: 0/60/365/1095/1826/3652 gün);
   yalnız admin yazabilir (kökteki satır xdb_acl ile korunur; misafir yazması reddedilir → "kaydedilemedi").
   Seçim değişince onay penceresi: "… Bu süreden eski ham ölçümler bu gece kalıcı olarak silinir, geri alınamaz."
   SUNUM: hiçbir veri silinmez; seçim yalnız bu sekmede (sessionStorage dcim_eng_cmr_keep) tutulur.
   Derin bağlantılar (engineering.html#system-maintenance?...):
     ?keep=365          → kayıtlı süre 1 yıl olarak açılır (0/60/365/1095/1826/3652 ya da özel gün sayısı)
     ?ask=1095          → 3 yıl seçilmiş ve onay penceresi açık gelir
     ?role=guest        → misafir oturumu: kaydetme reddedilir (notSaved)
     ?undefined=1       → kökte CMR_KEEP_GUN tanımlı değil (seçim kapalı, uyarı)
     ?report=1          → rapor menüsü açık
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, dialog, toast, statusBadge, storage } = DCIM.ui;
  const kit = DCIM.kit;

  // messages.tr.json → systemMaintenance.*
  const T = {
    title: 'Veritabanı Özet Bilgileri',
    tableName: 'Tablo Adı', dataCount: 'Veri Sayısı', oldestData: 'Kayıttaki En Eski Veri', status: 'Durum',
    autoDelete: 'Otomatik Silme', toggle: 'Aç/Kapat:', manualDelete: 'Manuel Silme',
    remote: 'Uzak Bağlantı', local: 'Yerel Bağlantı', restart: 'Servisi Yeniden Başlat',
    rTitle: 'CMR Saklama Süresi',
    rDesc: 'Bu süreden eski ham ölçümler (CMR) gece temizliğinde kalıcı olarak silinir. Saatlik / günlük özetler silinmez. Yalnız PostgreSQL.',
    rNotDefined: 'Kök yapılandırmada CMR_KEEP_GUN tanımlı değil; süre değiştirilemez.',
    rNotSaved: 'Saklama süresi kaydedilemedi (yetki ya da yapılandırma).',
    rConfirm: 'CMR saklama süresi "{label}" olarak kaydedilsin mi? Bu süreden eski ham ölçümler bu gece kalıcı olarak silinir, geri alınamaz.',
    rConfirmUnlimited: 'CMR saklama süresi "Süresiz" olarak kaydedilsin mi? Ham ölçümler silinmez.',
    warningTitle: 'UYARI', confirmSave: 'Kaydetmek istediğinize emin misiniz?'
  };
  const KEEP = [
    { gun: '0', label: 'Süresiz' }, { gun: '60', label: '2 ay' }, { gun: '365', label: '1 yıl' },
    { gun: '1095', label: '3 yıl' }, { gun: '1826', label: '5 yıl' }, { gun: '3652', label: '10 yıl' }
  ];
  const keepLabel = gun => { const o = KEEP.find(x => x.gun === gun); return o ? o.label : gun + ' gün (özel)'; };

  // Kurgusal tablo özeti (db_DAS_api TBL_stats yanıtının karşılığı)
  const TABLES = [
    { name: 'CMA', count: 18342, oldest: '2025-11-12 00:00:04' },
    { name: 'CMR', count: 47905, oldest: '2024-03-01 00:00:00' },
    { name: 'CME', count: 9117, oldest: '2025-06-18 09:41:22' },
    { name: 'CTC', count: 52604, oldest: '2024-09-30 23:15:10' },
    { name: 'CTT', count: 3210, oldest: '2026-01-05 14:02:51' },
    { name: 'CTS', count: 812, oldest: '2026-08-21 07:30:00' }
  ];
  const statusOf = n => (!n || isNaN(n)) ? 'Veri Yok' : n < 45000 ? 'Normal' : n <= 50000 ? 'Uyarı' : 'Kritik';
  const colorOf = n => n < 45000 ? '#16a34a' : n <= 50000 ? '#ea580c' : '#dc2626';
  const toneOf = s => s === 'Kritik' ? 'alarm' : s === 'Uyarı' ? 'warning' : s === 'Normal' ? 'normal' : 'info';
  const fmtN = n => Number(n).toLocaleString('tr-TR');

  const BTN_SEC = DCIM.ui.buttonClasses('secondary', 'sm', false);
  const BTN_PRI = DCIM.ui.buttonClasses('primary', 'sm', false);
  const BTN_DANGER_ICON = DCIM.ui.buttonClasses('danger', 'sm', true);
  const BTN_ICON = DCIM.ui.buttonClasses('ghost', 'sm', true);

  DCIM.engRegistry['system-maintenance'] = {
    mount(el, params) {
      const guest = params.get('role') === 'guest';
      const st = {
        defined: params.get('undefined') !== '1',
        keep: params.get('keep') || storage.get('dcim_eng_cmr_keep') || '0',
        error: '',
        autoDelete: true,
        remote: 'https://10.201.0.10:8443',
        local: 'http://127.0.0.1:8095'
      };
      if (!/^[0-9]+$/.test(st.keep)) st.keep = '0';
      let reportMenu = null;

      el.innerHTML =
        '<div class="p-4">' +
          kit.pageHeader({
            title: 'Sistem Bakım',
            breadcrumbs: [{ label: 'Mühendislik', href: '#home' }, { label: 'Sistem Bakım' }],
            actions: '<div class="flex items-center gap-2.5">' + statusBadge('normal', 'Bağlı') +
              '<button type="button" data-sm-refresh class="' + BTN_SEC + '"><i class="pi pi-refresh text-current shrink-0"></i><span class="truncate">Yenile</span></button>' +
              '<button type="button" data-sm-save class="' + BTN_PRI + '"><i class="pi pi-save text-current shrink-0"></i><span class="truncate">Kaydet</span></button>' +
            '</div>'
          }) +
          '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">' +
            '<div class="lg:col-span-2">' +
              kit.card({ title: T.title, icon: 'pi pi-database', actions: '<div data-sm-report></div>', body: '<div class="overflow-x-auto" data-sm-table></div>' }) +
            '</div>' +
            '<div class="flex flex-col gap-4">' +
              kit.card({ title: T.autoDelete, icon: 'pi pi-trash', body: '<div class="flex flex-col gap-4" data-sm-delete></div>' }) +
              kit.card({ title: T.remote, icon: 'pi pi-wifi', body: '<div class="flex flex-col gap-4" data-sm-conn></div>' }) +
              kit.card({ title: T.restart, icon: 'pi pi-refresh', body:
                '<div class="flex items-center justify-between">' +
                  '<div class="flex flex-col"><span class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + T.restart + '</span>' +
                  '<span class="text-[10px] text-slate-500">Hizmetleri ve haberleşmeyi yeniden başlatır.</span></div>' +
                  '<button type="button" data-sm-restart class="' + BTN_DANGER_ICON + '" title="' + T.restart + '"><i class="pi pi-power-off"></i></button>' +
                '</div>' }) +
            '</div>' +
          '</div>' +
        '</div>';

      const $ = s => el.querySelector(s);

      function renderTable() {
        const cell = (fn, cls) => TABLES.map(t => '<td class="p-3 text-center ' + (cls || '') + '">' + fn(t) + '</td>').join('');
        $('[data-sm-table]').innerHTML =
          '<table class="w-full text-left border-collapse text-xs">' +
            '<thead><tr class="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 font-semibold">' +
              '<th class="p-3 font-semibold">' + T.tableName + '</th>' + TABLES.map(t => '<th class="p-3 font-semibold text-center">' + t.name + '</th>').join('') +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/40 text-slate-700 dark:text-slate-300">' +
              '<tr class="hover:bg-slate-50/50 dark:hover:bg-surface-hover/20"><td class="p-3 font-semibold">' + T.dataCount + '</td>' + cell(t => String(t.count), 'font-mono font-medium') + '</tr>' +
              '<tr class="hover:bg-slate-50/50 dark:hover:bg-surface-hover/20"><td class="p-3 font-semibold">' + T.oldestData + '</td>' + cell(t => esc(t.oldest), 'text-[10px] font-mono') + '</tr>' +
              '<tr class="hover:bg-slate-50/50 dark:hover:bg-surface-hover/20"><td class="p-3 font-semibold">' + T.status + '</td>' +
                cell(t => '<span class="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[10px] font-bold" style="color:' + colorOf(t.count) + ';background-color:' + colorOf(t.count) + '26">' + statusOf(t.count) + '</span>') + '</tr>' +
            '</tbody>' +
          '</table>';
      }

      function keepOptions() {
        if (!st.defined) return '<option value="">-</option>';
        const custom = !KEEP.some(o => o.gun === st.keep);
        return (custom ? '<option value="' + esc(st.keep) + '" selected>' + esc(keepLabel(st.keep)) + '</option>' : '') +
          KEEP.map(o => '<option value="' + o.gun + '"' + (o.gun === st.keep ? ' selected' : '') + '>' + o.label + '</option>').join('');
      }

      function renderDelete() {
        $('[data-sm-delete]').innerHTML =
          '<div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/60">' +
            '<div class="flex flex-col"><span class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + T.autoDelete + '</span>' +
            '<span class="text-[10px] text-slate-500">' + T.toggle + '</span></div>' +
            '<button type="button" data-sm-toggle class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-sky-500 ' + (st.autoDelete ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700') + '">' +
              '<span class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ' + (st.autoDelete ? 'translate-x-4' : 'translate-x-0') + '"></span></button>' +
          '</div>' +
          '<div class="flex flex-col gap-1.5 pb-3 border-b border-slate-100 dark:border-slate-800/60">' +
            '<div class="flex items-center justify-between gap-3">' +
              '<span class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + T.rTitle + '</span>' +
              '<select data-sm-keep class="text-xs rounded-[2px] border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-sky-500"' + (st.defined ? '' : ' disabled') + '>' + keepOptions() + '</select>' +
            '</div>' +
            '<span class="text-[10px] text-slate-500">' + T.rDesc + '</span>' +
            (!st.defined ? '<span class="text-[10px] text-amber-600">' + T.rNotDefined + '</span>' : '') +
            (st.error ? '<span class="text-[10px] text-red-600">' + esc(st.error) + '</span>' : '') +
          '</div>' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex flex-col"><span class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + T.manualDelete + '</span>' +
            '<span class="text-[10px] text-slate-500">Veritabanı loglarını manuel temizleyin.</span></div>' +
            '<button type="button" data-sm-clean class="' + BTN_DANGER_ICON + '" title="' + T.manualDelete + '"><i class="pi pi-trash"></i></button>' +
          '</div>';
        $('[data-sm-toggle]').addEventListener('click', () => {
          st.autoDelete = !st.autoDelete;
          renderDelete();
          toast('Otomatik silme ' + (st.autoDelete ? 'açıldı' : 'kapatıldı') + ' (CLEANDATA = ' + (st.autoDelete ? 1 : 0) + ').', 'info');
        });
        const sel = $('[data-sm-keep]');
        sel.addEventListener('change', () => askKeep(sel.value));
        $('[data-sm-clean]').addEventListener('click', () => confirmBox(T.confirmSave, () => toast('Manuel temizleme isteği gönderildi (sunum: veri silinmedi).', 'success')));
      }

      function renderConn() {
        const row = (label, val, key, last) =>
          '<div class="flex items-center justify-between' + (last ? '' : ' pb-3 border-b border-slate-100 dark:border-slate-800/60') + '">' +
            '<div class="flex flex-col"><span class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + label + '</span>' +
            '<span class="text-[11px] font-mono mt-1 text-slate-600 dark:text-slate-400">' + esc(val || '-') + '</span></div>' +
            '<button type="button" data-sm-ip="' + key + '" class="' + BTN_ICON + '" title="' + label + '"><i class="pi pi-cog"></i></button>' +
          '</div>';
        $('[data-sm-conn]').innerHTML = row(T.remote, st.remote, 'remote') + row(T.local, st.local, 'local', true);
        el.querySelectorAll('[data-sm-ip]').forEach(b => b.addEventListener('click', () => toast('Bağlantı adresi bu sunumda değiştirilemez.', 'info')));
      }

      function confirmBox(text, ok, cancel, extra) {
        return dialog({
          title: T.warningTitle, variant: 'confirm', confirmLabel: 'Tamam', cancelLabel: 'İptal',
          body: '<div class="py-2"><p class="text-xs text-slate-700 dark:text-slate-300">' + esc(text) + '</p>' + (extra || '') + '</div>',
          onConfirm: ok, onCancel: cancel, onClose: cancel
        });
      }

      // onCmrKeepChange(): onay → XDB_SetValue(kök CMR_KEEP_GUN) → geri okuyarak doğrula → #save
      function askKeep(yeni) {
        if (!st.defined || yeni === st.keep) return;
        st.error = '';
        let done = false;
        const revert = () => { if (!done) { done = true; renderDelete(); } };
        confirmBox(yeni === '0' ? T.rConfirmUnlimited : T.rConfirm.replace('{label}', keepLabel(yeni)), () => {
          done = true;
          if (guest) {
            st.error = T.rNotSaved;
          } else {
            st.keep = yeni;
            storage.set('dcim_eng_cmr_keep', yeni);
            toast('CMR saklama süresi "' + keepLabel(yeni) + '" olarak kaydedildi.', 'success');
          }
          renderDelete();
        }, revert,
        '<p class="mt-2 text-[10px] text-slate-400"><i class="pi pi-info-circle text-[10px] mr-1"></i>Sunum: seçim yalnız bu sekmede tutulur; hiçbir veri silinmez.</p>');
        const sel = $('[data-sm-keep]');
        if (sel) sel.value = yeni;
      }

      function exportReport(req) {
        const rows = DCIM.report.applyLimit(TABLES.map(t => ({ name: t.name, count: fmtN(t.count), oldest: t.oldest, status: statusOf(t.count), tone: toneOf(statusOf(t.count)) })), req);
        DCIM.report.generate({
          title: 'Sistem Bakım Raporu',
          subtitle: T.title + ' · Mühendislik · Sistem bakımı',
          filename: 'Sistem_Bakim',
          kpis: [
            { label: T.autoDelete, value: st.autoDelete ? 'Açık' : 'Kapalı' },
            { label: T.rTitle, value: st.defined ? keepLabel(st.keep) : '-' }
          ],
          sections: [{
            title: T.title,
            columns: [{ key: 'name', label: T.tableName }, { key: 'count', label: T.dataCount, align: 'right' }, { key: 'oldest', label: T.oldestData }, { key: 'status', label: T.status }],
            rows, toneKey: 'tone'
          }],
          notes: ['Durum kayıt sayısına göre: 45.000 altı Normal, 45.000–50.000 Uyarı, üstü Kritik.']
        }, req.format);
      }

      renderTable();
      renderDelete();
      renderConn();
      reportMenu = DCIM.report.menu($('[data-sm-report]'), {
        scopes: [{ id: 'list', label: 'Veritabanı özeti', hint: 'Ekrandaki tablo' }],
        options: 'limit', unit: 'tablo', total: TABLES.length, defaultLimit: TABLES.length, onExport: exportReport
      });

      $('[data-sm-refresh]').addEventListener('click', () => { renderTable(); toast('Veritabanı özeti yenilendi.', 'info'); });
      $('[data-sm-save]').addEventListener('click', () => confirmBox(T.confirmSave, () => toast('Yapılandırma kaydedildi (#save).', 'success')));
      $('[data-sm-restart]').addEventListener('click', () => confirmBox('Servis yeniden başlatılsın mı? Haberleşme kısa süre kesilir.', () => toast('Yeniden başlatma komutu gönderildi (sunum: servis çalışmaya devam ediyor).', 'warning')));

      if (params.get('ask')) setTimeout(() => askKeep(params.get('ask')), 50);
      if (params.get('report') === '1') setTimeout(() => { const b = el.querySelector('[data-rk-btn]'); if (b) b.click(); }, 50);

      return { destroy() { if (reportMenu) reportMenu.destroy(); } };
    }
  };
})();
