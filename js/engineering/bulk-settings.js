/* ==========================================================================
   DCIM Sunum — Toplu Parametre Ayarları (NewUICMPBulkSettingsComponent)
   Kaynak: new-ui/pages/engineering/bulk-settings/bulk-settings.component.{html,ts}
   - 4 grup kartı (Sensör / Klima Panoları / SDP Panoları / PDU), her parametre tipi için
     Alarm Üst, Uyarı Üst, Uyarı Alt, Alarm Alt (+ gecikmeli gruplarda Alarma Geçiş / Normalleşme Süresi)
   - "Tümüne Uygula": en az bir değer yoksa uyarı; varsa getTargetXPath() ile üretilen XPath'e
     val_alm_onlhi_alm / val_alm_onlhi_wrn / val_alm_onllo_wrn / val_alm_onllo_alm / alm_dly_set / alm_dly_rst
     yazılır, 800 ms sonra doc('CMR/T0x')/#save ve başarı bildirimi (DCIM.data.bulkSettings.setValue)
   Derin bağlantılar (sunum):
     engineering.html#bulk-settings?fill=recommended   → tüm alanlar önerilen değerlerle dolu açılır
     engineering.html#bulk-settings?group=PDU           → ilgili grup kartına kaydırır (SENSOR|KLIMA|SDP|PDU)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → bulkSettings.*
  const T = {
    title: 'TOPLU PARAMETRE AYARLARI',
    menuEngineering: 'Mühendislik',
    back: 'Geri',
    alarmHi: 'Alarm Üst',
    warningHi: 'Uyarı Üst',
    warningLo: 'Uyarı Alt',
    alarmLo: 'Alarm Alt',
    almDlySet: 'Alarma Geçiş Süresi (sn)',
    almDlyRst: 'Normalleşme Süresi (sn)',
    processing: 'İşleniyor...',
    applyToAll: 'Tümüne Uygula',
    recommended: 'Önerilen: {value}',
    enterAtLeastOneLimit: 'Lütfen en az bir limit değeri giriniz.',
    dbUpdateFailed: 'Veritabanı güncellemesi başarısız oldu.',
    appliedToAll: '{group} - {type} ayarları tüm cihazlara uygulandı.'
  };

  const GROUPS = [
    { id: 'SENSOR', label: 'SENSÖR GRUBU (Tüm Kabinler)', types: ['TEMP_TOP', 'TEMP_MID', 'TEMP_BOT', 'HUM_MID'], hasDelay: true },
    { id: 'KLIMA', label: 'KLİMA PANOLARI (A ve B Grupları)', deviceClass: 'cls_DEV_KLM_PANO', types: ['VOLT', 'CURR', 'POW'] },
    { id: 'SDP', label: 'SDP PANOLARI', deviceClass: 'cls_DEV_SDP', types: ['VOLT', 'CURR', 'POW'] },
    { id: 'PDU', label: 'PDU GRUBU', types: ['OCP'], hasDelay: true }
  ];

  const LABELS = {
    TEMP_TOP: 'Üst Sıcaklık', TEMP_MID: 'Orta Sıcaklık', TEMP_BOT: 'Alt Sıcaklık', HUM_MID: 'Nem Oranı',
    VOLT: 'Gerilim', CURR: 'Akım Sınırı', POW: 'Aktif Güç', OCP: 'OCP Akım Sınırı'
  };

  const RECOMMENDED = {
    TEMP: { alm_hi: 35, wrn_hi: 30, wrn_lo: 15, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40, unit: '°C' },
    HUM: { alm_hi: 80, wrn_hi: 70, wrn_lo: 20, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40, unit: '%' },
    VOLT: { alm_hi: 255, wrn_hi: 245, wrn_lo: 195, alm_lo: 185, alm_dly_set: 40, alm_dly_rst: 40, unit: 'V' },
    CURR: { alm_hi: 1000, wrn_hi: 800, wrn_lo: 0, alm_lo: 0, alm_dly_set: 40, alm_dly_rst: 40, unit: 'A' },
    POW: { alm_hi: 50000, wrn_hi: 40000, wrn_lo: 0, alm_lo: 0, alm_dly_set: 40, alm_dly_rst: 40, unit: 'W' }
  };

  const FIELDS = ['alm_hi', 'wrn_hi', 'wrn_lo', 'alm_lo', 'alm_dly_set', 'alm_dly_rst'];

  // Şablondaki input sınıfı (birebir)
  const INPUT = 'scada-input w-full py-1 px-2.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-slate-300 dark:focus:border-border-muted transition-colors font-medium';
  const LBL = 'text-[10px] font-medium text-slate-500 dark:text-slate-400';

  function unitOf(type) {
    if (type.indexOf('HUM') >= 0) return '%';
    if (type.indexOf('VOLT') >= 0) return 'V';
    if (type.indexOf('CURR') >= 0 || type === 'OCP') return 'A';
    if (type.indexOf('POW') >= 0) return 'W';
    return '°C';
  }
  function catOf(type) {
    if (type.indexOf('HUM') >= 0) return 'HUM';
    if (type.indexOf('VOLT') >= 0) return 'VOLT';
    if (type.indexOf('CURR') >= 0 || type === 'OCP') return 'CURR';
    if (type.indexOf('POW') >= 0) return 'POW';
    return 'TEMP';
  }
  function placeholderOf(type, field) {
    const cfg = RECOMMENDED[catOf(type)];
    if (cfg && cfg[field] != null) return T.recommended.replace('{value}', cfg[field]);
    return '---';
  }

  // getTargetXPath() birebir
  function targetXPath(groupId, type) {
    const docPath = groupId === 'PDU' ? 'CMR/T01' : 'CMR/T00';
    const doc = "doc('" + docPath + "')";
    if (groupId === 'SENSOR') {
      const idMap = {
        TEMP_TOP: "contains(@id, 'TEMP_TOP') or contains(@id, 'UST_SIC')",
        TEMP_MID: "contains(@id, 'TEMP_MID') or contains(@id, 'ORTA_SIC')",
        TEMP_BOT: "contains(@id, 'TEMP_BOT') or contains(@id, 'ALT_SIC')",
        HUM_MID: "contains(@id, 'HUM_MID') or contains(@id, 'NEM')"
      };
      return doc + '//io[' + idMap[type] + ']';
    }
    if (groupId === 'KLIMA') {
      const clsMap = {
        VOLT: "@xdb_cls='KLM_PN_VOL'",
        CURR: "@xdb_cls='KLM_PN_CURRA' or @xdb_cls='KLM_PN_CURRB'",
        POW: "@xdb_cls='KLM_PN_POWTA' or @xdb_cls='KLM_PN_POWTB'"
      };
      return doc + "//dev[@xdb_cls='cls_DEV_KLM_PANO']//io[" + clsMap[type] + ']';
    }
    if (groupId === 'SDP') {
      const clsMap = { VOLT: "@xdb_cls='SDP_VOL'", CURR: "@xdb_cls='SDP_CUR'", POW: "@xdb_cls='SDP_POW'" };
      return doc + "//dev[@xdb_cls='cls_DEV_SDP']//io[" + clsMap[type] + ']';
    }
    if (groupId === 'PDU') return doc + "//tio[contains(@id, '_OCP')]";
    return '';
  }

  const groupIcon = id => id === 'SENSOR' ? 'pi pi-sliders-h' : id === 'KLIMA' ? 'pi pi-cloud' : id === 'SDP' ? 'pi pi-server' : 'pi pi-bolt';

  function mount(el, params) {
    const { esc, button, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.bulkSettings;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    // initializeLimits()
    const limits = {};
    const loading = {};
    const fillRecommended = params && params.get('fill') === 'recommended';
    GROUPS.forEach(g => g.types.forEach(t => {
      const row = {};
      FIELDS.forEach(f => { row[f] = null; });
      if (fillRecommended) {
        const cfg = RECOMMENDED[catOf(t)];
        ['alm_hi', 'wrn_hi', 'wrn_lo', 'alm_lo'].concat(g.hasDelay ? ['alm_dly_set', 'alm_dly_rst'] : []).forEach(f => { row[f] = cfg[f]; });
      }
      limits[g.id + '_' + t] = row;
    }));

    const inputHtml = (key, type, field, label) =>
      '<div class="flex flex-col gap-1">' +
        '<label class="' + LBL + '">' + esc(label) + '</label>' +
        '<input type="number" class="' + INPUT + '" data-limit="' + esc(key) + '" data-field="' + field + '"' +
          ' value="' + (limits[key][field] == null ? '' : esc(limits[key][field])) + '" placeholder="' + esc(placeholderOf(type, field)) + '" />' +
      '</div>';

    function applyButton(key) {
      const busy = !!loading[key];
      return button({
        variant: 'primary', size: 'sm',
        icon: busy ? 'pi pi-spin pi-spinner' : '',
        label: busy ? T.processing : T.applyToAll,
        attrs: 'data-apply="' + esc(key) + '"' + (busy ? ' disabled aria-busy="true"' : '')
      }).replace('class="', 'class="w-full xl:w-auto ');
    }

    function renderGroup(g) {
      const unitLbl = t => ' (' + unitOf(t) + ')';
      const rows = g.types.map(t => {
        const key = g.id + '_' + t;
        return '<div class="py-4 first:pt-0 last:pb-0">' +
          '<div class="mb-2 select-none"><span class="text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(LABELS[t] || t) + '</span></div>' +
          '<div class="flex flex-col xl:flex-row xl:items-end gap-3">' +
            '<div class="grid gap-3 flex-grow ' + (g.hasDelay ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-4') + '">' +
              inputHtml(key, t, 'alm_hi', T.alarmHi + unitLbl(t)) +
              inputHtml(key, t, 'wrn_hi', T.warningHi + unitLbl(t)) +
              inputHtml(key, t, 'wrn_lo', T.warningLo + unitLbl(t)) +
              inputHtml(key, t, 'alm_lo', T.alarmLo + unitLbl(t)) +
              (g.hasDelay ? inputHtml(key, t, 'alm_dly_set', T.almDlySet) + inputHtml(key, t, 'alm_dly_rst', T.almDlyRst) : '') +
            '</div>' +
            '<div class="shrink-0 w-full xl:w-auto xl:pb-0.5" data-apply-host="' + esc(key) + '">' + applyButton(key) + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      return kit.card({
        title: g.label,
        icon: groupIcon(g.id),
        attrs: 'data-group="' + g.id + '"',
        body: '<div class="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">' + rows + '</div>'
      });
    }

    el.innerHTML =
      '<div class="p-4">' +
        kit.pageHeader({
          title: T.title,
          breadcrumbs: [{ label: T.menuEngineering, href: 'engineering.html' }, { label: T.title }],
          actions: button({ variant: 'secondary', icon: 'pi pi-chevron-left', label: T.back, attrs: 'data-action="back"' })
        }) +
        '<div class="flex flex-col gap-4 mt-2">' + GROUPS.map(renderGroup).join('') + '</div>' +
      '</div>';

    function refreshButton(key) {
      const host = el.querySelector('[data-apply-host="' + key + '"]');
      if (host) host.innerHTML = applyButton(key);
    }

    // saveBulkLimits() birebir
    function saveBulkLimits(key) {
      const i = key.indexOf('_');
      const groupId = key.slice(0, i);
      const type = key.slice(i + 1);
      const group = GROUPS.find(g => g.id === groupId);
      const row = limits[key];
      const targetPath = targetXPath(groupId, type);
      if (!group || !targetPath) return;

      if (FIELDS.every(f => row[f] == null)) {
        toast(T.enterAtLeastOneLimit, 'warning');
        return;
      }

      loading[key] = true;
      refreshButton(key);
      try {
        const updates = [
          { attr: 'val_alm_onlhi_alm', val: row.alm_hi },
          { attr: 'val_alm_onlhi_wrn', val: row.wrn_hi },
          { attr: 'val_alm_onllo_wrn', val: row.wrn_lo },
          { attr: 'val_alm_onllo_alm', val: row.alm_lo },
          { attr: 'alm_dly_set', val: row.alm_dly_set },
          { attr: 'alm_dly_rst', val: row.alm_dly_rst }
        ];
        updates.forEach(u => { if (u.val != null) M.setValue(targetPath + '/@' + u.attr, u.val.toString()); });

        later(() => {
          M.setValue("doc('" + (groupId === 'PDU' ? 'CMR/T01' : 'CMR/T00') + "')/#save", 1);
          loading[key] = false;
          refreshButton(key);
          toast(T.appliedToAll.replace('{group}', group.label).replace('{type}', LABELS[type] || type), 'success');
        }, 800);
      } catch (e) {
        loading[key] = false;
        refreshButton(key);
        toast(T.dbUpdateFailed, 'error');
      }
    }

    function onClick(e) {
      const ap = e.target.closest('[data-apply]');
      if (ap && !ap.disabled) { saveBulkLimits(ap.getAttribute('data-apply')); return; }
      const act = e.target.closest('[data-action="back"]');
      // Orijinalde (back) çıktısı rota bileşeninde bağlı değildir; sunumda tarayıcı geçmişine döner
      if (act) { if (window.history.length > 1) window.history.back(); else DCIM.eng.go('data-query-period'); }
    }
    // [(ngModel)] type=number: boş → null
    function onInput(e) {
      const t = e.target;
      if (!t.hasAttribute('data-limit')) return;
      const v = t.value;
      limits[t.getAttribute('data-limit')][t.getAttribute('data-field')] = v === '' || isNaN(Number(v)) ? null : Number(v);
    }

    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);

    const focusGroup = params && (params.get('group') || '').toUpperCase();
    if (focusGroup) {
      const card = el.querySelector('[data-group="' + focusGroup + '"]');
      if (card) later(() => card.scrollIntoView({ block: 'start' }), 0);
    }

    return {
      destroy() {
        timers.forEach(id => clearTimeout(id));
        timers.clear();
        el.removeEventListener('click', onClick);
        el.removeEventListener('input', onInput);
      }
    };
  }

  DCIM.engRegistry = DCIM.engRegistry || {};
  DCIM.engRegistry['bulk-settings'] = { mount };
})();
