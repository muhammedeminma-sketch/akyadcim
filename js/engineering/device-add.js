/* ==========================================================================
   DCIM Sunum — PDU Ekleme Formu (NewUICMPDeviceAddEngComponent)
   engineering/device-add/device-add.component.{html,ts} + pdu-preset.service.ts
   Menüde görünmez; "Cihaz Tanımlama Formu" → PDU → "DCIM içinde tanımla" ile açılır
   (kabuk bu rotada "Cihaz Tanımlama Formu"nu vurgular).
   - PDU Temel Bilgileri: kat / salon / pod (+ Non-Standart) / kabin (öneri listesi, 300 ms) /
     PDU tanımlayıcı (kabindeki mevcut PDU'lar + çakışma doğrulaması) / marka-model ön ayarı /
     IP (desen) / SNMP port (1–65535) / SNMP versiyonu
   - SNMP v1/v2c community veya SNMP v3 kimlik kartı
   - Inlet / Outlet ekle-düzenle formları + listeleri (ön ayar seçilince otomatik doldurulur, formlar kilitlenir)
   - Kaydet → deviceId/description üretimi + AyXDB <dev> XML'i (generatePduXml birebir) →
     bellekte ekleme (DCIM.data.engDeviceAdd.addDev) + başarı bildirimi + formların sıfırlanması
   Veri: DCIM.data.engDeviceAdd (js/mock/eng-device-add.data.js — CMR/TMP pdu_presets, CMR/T01 dev kimlikleri)
   Derin bağlantılar (engineering.html#device-add?...):
     ?floor=1&hall=1&pod=9&ns=1&cabinet=1BJ53&pdu=C&preset=PX3-5528V-V2&ip=10.10.54.13&snmp=1|2|3
     ?demo=1      — 1BJ53 kabinine PDU-C örneği (PX3-5528V-V2 ön ayarı) ile doldurur
     ?validate=1  — "Kaydet"e basılmış gibi doğrulama hatalarını gösterir
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // ---------------------------------------------------------------------------
  // Metinler (messages.tr.json → pduAdd.*, addDevice.errors.fieldRequired, common.*)
  // ---------------------------------------------------------------------------
  const T = {
    addNewPdu: 'YENİ PDU EKLE',
    engineering: 'Mühendislik',
    back: 'Geri',
    save: 'Kaydet',
    basicInfo: 'PDU Temel Bilgileri',
    floorNumber: 'Kat Numarası',
    loungeNumber: 'Salon Numarası',
    podNumber: 'Pod Numarası (Varsa Giriniz)',
    nonStandardCabinet: 'Non-Standart Kabin',
    cabinetName: 'Kabin İsmi',
    pduIdentifier: 'PDU Tanımlayıcı',
    brandModel: 'PDU Marka Modeli',
    ipAddress: 'IP Adresi',
    snmpPort: 'SNMP Port',
    snmpVersion: 'SNMP Versyonu',
    snmpCommunityInfo: 'SNMP v1/v2c Community Bilgileri',
    readCommunity: 'Okuma Community String',
    writeCommunity: 'Yazma Community String',
    snmpV3Info: 'SNMP v3 Kimlik Bilgileri',
    username: 'Kullanıcı Adı',
    authLevel: 'Yetki Düzeyi',
    select: 'Seçiniz...',
    authorization: 'Yetkilendirme',
    authProtocol: 'Yetkilendirme Protokolü',
    authPassword: 'Yetkilendirme Şifresi',
    confirmAuthPassword: 'Yetkilendirme Şifresini Onayla',
    addEditInlet: 'Inlet Ekle / Düzenle',
    inletMainOid: 'Inlet Ana OID',
    inletCurrAddress: 'Inlet Akım IO pro_adr',
    inletVoltAddress: 'Inlet Voltaj IO pro_adr',
    inletPowAddress: 'Inlet Güç IO pro_adr',
    updateInlet: "Inlet'i Güncelle",
    addInletToList: "Inlet'i Listeye Ekle",
    cancel: 'İptal Et',
    addEditOutlet: 'Outlet Ekle / Düzenle',
    outletIdentifier: 'Outlet Tanımlayıcı',
    currAddress: 'Akım IO pro_adr',
    voltAddress: 'Voltaj IO pro_adr',
    powAddress: 'Güç IO pro_adr',
    updateOutlet: "Outlet'i Güncelle",
    addOutletToList: "Outlet'i Listeye Ekle",
    addedInlets: 'Eklenen Inletler',
    addedOutlets: 'Eklenen Outletler',
    existingPdus: "Mevcut PDU'lar: {pdus}",
    noPdusFound: 'Bu kabinde mevcut PDU bulunamadı.',
    ph: {
      example1: 'Örn: 1', example3: 'Örn: 3', exampleCabinet: 'Örn: 1XX00', examplePduId: 'Örn: A, B veya 1, 2',
      exampleIp: 'Örnek: 192.168.40.11', exampleSnmpPort: 'Örn: 161', public: 'Örn: public', private: 'Örn: private',
      username: 'SNMPv3 Kullanıcı Adı', authorization: 'Yetkilendirme', authPassword: 'Yetkilendirme Şifresi',
      confirmAuthPassword: 'Yetkilendirme Şifresini Onayla', oidExample: 'Örn: 1.3.6.1.4.1.XXXX.X.X.X.X.X',
      indexExample: 'Örn: 1.1', outletIdExample: 'Örn: 01, A'
    },
    authLevels: {
      noAuthNoPriv: 'No Auth, No Priv (Güvenlik Yok)',
      authNoPriv: 'Auth, No Priv (Yetkilendirme)',
      authPriv: 'Auth, Priv (Yetkilendirme ve Gizlilik)'
    },
    table: { mainOid: 'Ana OID', currAddress: 'Akım Adresi', voltAddress: 'Voltaj Adresi', powAddress: 'Güç Adresi', actions: 'İşlem', identifier: 'Tanımlayıcı' },
    edit: 'Düzenle',
    del: 'Sil',
    fieldRequired: 'Bu alan zorunludur.',
    err: {
      existingPdu: 'Bu PDU tanımlayıcısı zaten mevcut. Lütfen farklı bir tanımlayıcı kullanın.',
      errorTitle: 'HATA',
      duplicateOutletId: 'Lütfen benzersiz bir tanımlayıcı kullanın.',
      duplicateOutletTitle: 'Tanimlayıcıya Ait Outlet Mevcut',
      invalidOutletForm: 'Outlet formu geçersiz.',
      fillRequiredFields: 'Lütfen tüm zorunlu alanları doğru şekilde doldurun.',
      invalidFormTitle: 'Form geçersiz.'
    },
    ok: { pduAdded: 'PDU Eklendi: {deviceId}', successTitle: 'BAŞARILI', alertMessage: 'PDU başarıyla eklendi!' },
    xml: {
      brand: 'PDU MARKASI', model: 'PDU MODELI', serialNo: 'PDU SERİ NO', ipAddress: 'PDU IP ADRESİ', pduName: 'PDU ADI',
      inletCount: 'PDU INLET SAYISI', outletCount: 'PDU OUTLET SAYISI', ratedVolt: 'PDU ANMA GERİLİMİ', ratedCurr: 'PDU ANMA AKIMI',
      ratedVa: 'PDU ANMA VA DEGERI', inletCurr: 'INLET AKIM', inletVolt: 'INLET VOLTAJ', inletActivePower: 'INLET AKTİF GÜÇ',
      inletAppPower: 'INLET GÖRÜNÜR GÜÇ', inletPowerFactor: 'INLET GÜÇ FAKTÖRÜ', inletActiveEnergy: 'INLET AKTİF ENERJİ',
      inletFreq: 'INLET FREKANS', outlet: 'OUTLET', curr: 'AKIM', volt: 'VOLTAJ', activePower: 'AKTİF GÜÇ', appPower: 'GÖRÜNÜR GÜÇ',
      powerFactor: 'GÜÇ FAKTÖRÜ', activeEnergy: 'AKTİF ENERJİ', status: 'DURUM', freq: 'FREKANS',
      ocpHiAlarm: 'AKIM ÜST ALARM LİMİTİ', ocpHiWarn: 'AKIM ÜST UYARI LİMİTİ', ocpCurr: 'AKIMI', ocpStatus: 'DURUMU'
    }
  };

  const PDU_DEFAULTS = {
    floorNumber: '', loungeNumber: '', isNonStandard: false, podNumber: '', cabinetName: '', pduIdentifier: '',
    brandModel: 'NONE', ipAddress: '', snmpPort: 161, plugin: '', proxyIndex: '1', externalKey: '', customField1: '', customField2: '',
    snmpVersion: '2', readCommunity: 'public', writeCommunity: 'private',
    snmpV3Username: '', snmpV3AuthLevel: '', snmpV3Authorization: '', snmpV3AuthProtocol: '', snmpV3AuthPassword: '', snmpV3AuthPasswordConfirm: ''
  };
  const INLET_KEYS = ['inletBiProAdr', 'inletCurrIoProAdr', 'inletVoltIoProAdr', 'inletPowIoProAdr'];
  const OUTLET_KEYS = ['identifier', 'currIoProAdr', 'voltIoProAdr', 'powIoProAdr'];
  const REQUIRED = ['floorNumber', 'loungeNumber', 'cabinetName', 'pduIdentifier', 'ipAddress', 'snmpPort', 'snmpVersion'];
  const IP_RE = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

  const blank = keys => keys.reduce((o, k) => { o[k] = ''; return o; }, {});

  DCIM.engRegistry['device-add'] = {
    mount(el, params) {
      const { esc, toast, button, buttonClasses } = DCIM.ui;
      const kit = DCIM.kit;
      const M = DCIM.data.engDeviceAdd;

      const state = {
        f: Object.assign({}, PDU_DEFAULTS),
        touched: new Set(),
        inlet: { v: blank(INLET_KEYS), disabled: false },
        outlet: { v: blank(OUTLET_KEYS), disabled: false },
        savedInlets: [],
        savedOutlets: [],
        editingInletIndex: null,
        editingOutletIndex: null,
        presets: [],
        selectedPreset: null,
        cabinetSuggestions: [],
        showCabinetSuggestions: false,
        existingPdusInCabinet: [],
        existingPdusMessage: '',
        showSuccessNotification: false
      };
      const timers = { debounce: null, hide: null, success: null };
      let lastCabinetValue = '';

      // -------------------------------------------------------------------------
      // Doğrulama (Validators.required / pattern / min / max + existingPduValidator)
      // -------------------------------------------------------------------------
      const empty = v => v === null || v === undefined || v === '';
      function errorsOf(key) {
        const v = state.f[key];
        const e = {};
        if (REQUIRED.indexOf(key) >= 0 && empty(v)) e.required = true;
        if (key === 'ipAddress' && !empty(v) && !IP_RE.test(String(v))) e.pattern = true;
        if (key === 'snmpPort' && !empty(v) && (Number(v) < 1 || Number(v) > 65535)) e.range = true;
        if (key === 'pduIdentifier' && !empty(v) && state.existingPdusInCabinet.indexOf(String(v).toUpperCase()) >= 0) e.existingPdu = true;
        return e;
      }
      const invalid = key => Object.keys(errorsOf(key)).length > 0;
      const isInvalid = key => invalid(key) && state.touched.has(key);
      const formInvalid = () => Object.keys(state.f).some(invalid);
      function errorText(key) {
        if (key === 'pduIdentifier' && errorsOf(key).existingPdu && state.touched.has(key)) return T.err.existingPdu;
        return isInvalid(key) ? T.fieldRequired : '';
      }
      const subValid = (sub, keys) => !sub.disabled && keys.every(k => !empty(sub.v[k]));
      const hasPreset = () => !!(state.selectedPreset && state.selectedPreset.id !== 'NONE');

      // -------------------------------------------------------------------------
      // Şablon parçaları
      // -------------------------------------------------------------------------
      const input = (key, type, ph, extra) =>
        '<input type="' + type + '" data-k="' + key + '" value="' + esc(state.f[key] == null ? '' : state.f[key]) + '" placeholder="' + esc(ph || '') + '" class="' + (extra || 'scada-input w-full') + '" autocomplete="off" />';
      const sel = (key, options) =>
        '<select data-k="' + key + '" class="scada-select w-full">' +
          options.map(o => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(state.f[key]) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
        '</select>';
      const field = (key, label, required, ctrl) =>
        '<div data-wrap="' + key + '">' + kit.formField({ label, required, error: required ? errorText(key) : '', control: ctrl }) + '</div>';

      function suggestionsHtml() {
        if (!(state.showCabinetSuggestions && state.cabinetSuggestions.length > 0)) return '';
        return '<ul class="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-lg py-1 text-xs">' +
          state.cabinetSuggestions.map(s =>
            '<li data-sugg="' + esc(s) + '" class="px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors">' + esc(s) + '</li>').join('') +
        '</ul>';
      }
      function existingHtml() {
        return state.existingPdusMessage
          ? '<div class="text-[10px] text-amber-500 dark:text-amber-400 font-semibold flex items-center gap-1 mb-1"><i class="pi pi-info-circle"></i><span>' + esc(state.existingPdusMessage) + '</span></div>'
          : '';
      }

      function basicCard() {
        const f = state.f;
        const saveBtn = '<div card-header-actions><button type="submit" class="' + buttonClasses('primary', 'sm', false) + '"><span class="truncate">' + esc(T.save) + '</span></button></div>';
        const body = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
          field('floorNumber', T.floorNumber, true, input('floorNumber', 'text', T.ph.example1)) +
          field('loungeNumber', T.loungeNumber, true, input('loungeNumber', 'text', T.ph.example1)) +
          field('podNumber', T.podNumber, false,
            '<div class="flex items-center gap-4 w-full">' + input('podNumber', 'number', T.ph.example3, 'scada-input flex-1') +
              '<label class="flex items-center gap-2 cursor-pointer select-none shrink-0">' +
                '<input type="checkbox" data-k="isNonStandard"' + (f.isNonStandard ? ' checked' : '') + ' class="w-4 h-4 rounded-[2px] bg-surface-card border-border-subtle text-sky-600 focus:ring-sky-500" />' +
                '<span class="text-xs text-slate-700 dark:text-slate-300">' + esc(T.nonStandardCabinet) + '</span>' +
              '</label>' +
            '</div>') +
          field('cabinetName', T.cabinetName, true,
            '<div class="relative w-full">' + input('cabinetName', 'text', T.ph.exampleCabinet) + '<div data-sugg-box>' + suggestionsHtml() + '</div></div>') +
          field('pduIdentifier', T.pduIdentifier, true,
            '<div class="w-full flex flex-col gap-1"><div data-existing>' + existingHtml() + '</div>' + input('pduIdentifier', 'text', T.ph.examplePduId) + '</div>') +
          field('brandModel', T.brandModel, false,
            // XML'deki çift kimlik (PX2-5292R) orijinaldeki gibi aynı value ile listelenir
            '<select data-k="brandModel" class="scada-select w-full">' +
              state.presets.map((p, i) => '<option value="' + esc(p.id) + '"' + (state.selectedPreset === p || (!state.selectedPreset && i === 0) ? ' selected' : '') + '>' + esc(p.brandName + ' - ' + p.modelName) + '</option>').join('') +
            '</select>') +
          field('ipAddress', T.ipAddress, true, input('ipAddress', 'text', T.ph.exampleIp)) +
          field('snmpPort', T.snmpPort, true, input('snmpPort', 'number', T.ph.exampleSnmpPort)) +
          '<div data-wrap="snmpVersion">' + kit.formField({ label: T.snmpVersion, required: true,
            control: sel('snmpVersion', [{ value: '1', label: 'SNMP v1' }, { value: '2', label: 'SNMP v2c' }, { value: '3', label: 'SNMP v3' }]) }) + '</div>' +
        '</div>';
        return kit.card({ title: T.basicInfo, icon: 'pi pi-info-circle', actions: saveBtn, body });
      }

      function snmpCard() {
        const ver = state.f.snmpVersion;
        const plain = (key, label, ctrl) => kit.formField({ label, control: ctrl });
        if (ver === '1' || ver === '2') {
          return kit.card({ title: T.snmpCommunityInfo, icon: 'pi pi-shield',
            body: '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
              plain('readCommunity', T.readCommunity, input('readCommunity', 'text', T.ph.public)) +
              plain('writeCommunity', T.writeCommunity, input('writeCommunity', 'password', T.ph.private)) +
            '</div>' });
        }
        if (ver === '3') {
          return kit.card({ title: T.snmpV3Info, icon: 'pi pi-key',
            body: '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
              plain('snmpV3Username', T.username, input('snmpV3Username', 'text', T.ph.username)) +
              plain('snmpV3AuthLevel', T.authLevel, sel('snmpV3AuthLevel', [
                { value: '', label: T.select },
                { value: 'noAuthNoPriv', label: T.authLevels.noAuthNoPriv },
                { value: 'authNoPriv', label: T.authLevels.authNoPriv },
                { value: 'authPriv', label: T.authLevels.authPriv }])) +
              plain('snmpV3Authorization', T.authorization, input('snmpV3Authorization', 'text', T.ph.authorization)) +
              plain('snmpV3AuthProtocol', T.authProtocol, sel('snmpV3AuthProtocol', [{ value: '', label: T.select }, { value: 'MD5', label: 'MD5' }, { value: 'SHA', label: 'SHA' }])) +
              plain('snmpV3AuthPassword', T.authPassword, input('snmpV3AuthPassword', 'password', T.ph.authPassword)) +
              plain('snmpV3AuthPasswordConfirm', T.confirmAuthPassword, input('snmpV3AuthPasswordConfirm', 'password', T.ph.confirmAuthPassword)) +
            '</div>' });
        }
        return '';
      }

      function subInput(kind, key, label, ph) {
        const sub = state[kind];
        return kit.formField({ label, required: true, control:
          '<input type="text" data-sub="' + kind + '" data-k="' + key + '" value="' + esc(sub.v[key] || '') + '" placeholder="' + esc(ph) + '" class="scada-input w-full" autocomplete="off"' + (sub.disabled ? ' disabled' : '') + ' />' });
      }

      function listTable(kind, rows, cols) {
        return '<div class="overflow-x-auto"><table class="w-full text-left border-collapse text-xs">' +
          '<thead><tr class="bg-slate-100 dark:bg-surface-panel border-b border-border-subtle text-[10px] font-semibold text-slate-500 uppercase tracking-wider">' +
            cols.map(c => '<th class="py-2 px-3">' + esc(c.label) + '</th>').join('') +
            '<th class="py-2 px-3 text-right">' + esc(T.table.actions) + '</th></tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-800 dark:text-slate-200">' +
            rows.map((r, i) => '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/20 transition-colors">' +
              cols.map(c => '<td class="py-2 px-3 font-mono text-[10px]">' + esc(r[c.key]) + '</td>').join('') +
              '<td class="py-2 px-3 text-right"><div class="flex items-center justify-end gap-1.5">' +
                '<button type="button" data-act="edit-' + kind + '" data-i="' + i + '" class="text-sky-500 hover:text-sky-400 p-1 cursor-pointer" title="' + esc(T.edit) + '"><i class="pi pi-pencil text-xs"></i></button>' +
                '<button type="button" data-act="remove-' + kind + '" data-i="' + i + '" class="text-rose-500 hover:text-rose-400 p-1 cursor-pointer" title="' + esc(T.del) + '"><i class="pi pi-trash text-xs"></i></button>' +
              '</div></td></tr>').join('') +
          '</tbody></table></div>';
      }

      function ioSection() {
        const inletEditing = state.editingInletIndex !== null;
        const outletEditing = state.editingOutletIndex !== null;
        const inletCard = kit.card({ title: T.addEditInlet, icon: 'pi pi-download', attrs: 'data-inlet-card',
          body: '<div class="flex flex-col gap-3">' +
            subInput('inlet', 'inletBiProAdr', T.inletMainOid, T.ph.oidExample) +
            subInput('inlet', 'inletCurrIoProAdr', T.inletCurrAddress, T.ph.indexExample) +
            subInput('inlet', 'inletVoltIoProAdr', T.inletVoltAddress, T.ph.indexExample) +
            subInput('inlet', 'inletPowIoProAdr', T.inletPowAddress, T.ph.indexExample) +
            '<div class="flex justify-end gap-2 mt-2">' +
              button({ variant: 'primary', size: 'sm', label: inletEditing ? T.updateInlet : T.addInletToList, attrs: 'data-act="save-inlet"' }) +
              (inletEditing ? button({ variant: 'secondary', size: 'sm', label: T.cancel, attrs: 'data-act="cancel-edit"' }) : '') +
            '</div></div>' });
        const outletCard = kit.card({ title: T.addEditOutlet, icon: 'pi pi-upload', attrs: 'data-outlet-card',
          body: '<div class="flex flex-col gap-3">' +
            subInput('outlet', 'identifier', T.outletIdentifier, T.ph.outletIdExample) +
            subInput('outlet', 'currIoProAdr', T.currAddress, T.ph.indexExample) +
            subInput('outlet', 'voltIoProAdr', T.voltAddress, T.ph.indexExample) +
            subInput('outlet', 'powIoProAdr', T.powAddress, T.ph.indexExample) +
            '<div class="flex justify-end gap-2 mt-2">' +
              button({ variant: 'primary', size: 'sm', label: outletEditing ? T.updateOutlet : T.addOutletToList, attrs: 'data-act="save-outlet"' }) +
              (outletEditing ? button({ variant: 'secondary', size: 'sm', label: T.cancel, attrs: 'data-act="cancel-edit"' }) : '') +
            '</div></div>' });
        const inletList = state.savedInlets.length > 0
          ? kit.card({ title: T.addedInlets, icon: 'pi pi-list', body: listTable('inlet', state.savedInlets, [
              { key: 'inletBiProAdr', label: T.table.mainOid }, { key: 'inletCurrIoProAdr', label: T.table.currAddress },
              { key: 'inletVoltIoProAdr', label: T.table.voltAddress }, { key: 'inletPowIoProAdr', label: T.table.powAddress }]) })
          : '';
        const outletList = state.savedOutlets.length > 0
          ? kit.card({ title: T.addedOutlets, icon: 'pi pi-list', body: listTable('outlet', state.savedOutlets, [
              { key: 'identifier', label: T.table.identifier }, { key: 'currIoProAdr', label: T.table.currAddress },
              { key: 'voltIoProAdr', label: T.table.voltAddress }, { key: 'powIoProAdr', label: T.table.powAddress }]) })
          : '';
        return '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">' +
          '<div class="flex flex-col gap-4">' + inletCard + inletList + '</div>' +
          '<div class="flex flex-col gap-4">' + outletCard + outletList + '</div>' +
        '</div>';
      }

      function render() {
        const header = kit.pageHeader({
          title: T.addNewPdu,
          breadcrumbs: [{ label: T.engineering, href: 'engineering.html' }, { label: T.addNewPdu }],
          actions: button({ variant: 'secondary', icon: 'pi pi-chevron-left', label: T.back, attrs: 'data-act="back"' })
        });
        el.innerHTML = '<div class="p-4">' + header +
          (state.showSuccessNotification
            ? '<div class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-[2px] text-emerald-500 text-xs font-semibold flex items-center gap-2"><i class="pi pi-check-circle"></i>' + esc(T.ok.alertMessage) + '</div>'
            : '') +
          '<form data-form novalidate class="mt-4 flex flex-col gap-4">' + basicCard() + snmpCard() + '</form>' +
          ioSection() +
        '</div>';
      }

      // Odak kaybetmeden kısmi güncellemeler
      function refreshError(key) {
        if (REQUIRED.indexOf(key) < 0) return;
        const wrap = el.querySelector('[data-wrap="' + key + '"]');
        if (!wrap) return;
        const root = wrap.firstElementChild;
        const old = root.querySelector(':scope > p.text-rose-500');
        if (old) old.remove();
        const msg = errorText(key);
        if (msg) root.insertAdjacentHTML('beforeend', '<p class="text-[10px] text-rose-500 font-medium flex items-center gap-1 mt-0.5"><i class="pi pi-exclamation-circle text-[10px]"></i>' + esc(msg) + '</p>');
      }
      function refreshSuggestions() { const b = el.querySelector('[data-sugg-box]'); if (b) b.innerHTML = suggestionsHtml(); }
      function refreshExisting() { const b = el.querySelector('[data-existing]'); if (b) b.innerHTML = existingHtml(); }
      function setInputValue(key, val) { const i = el.querySelector('[data-k="' + key + '"]:not([data-sub])'); if (i) i.value = val == null ? '' : val; }

      // -------------------------------------------------------------------------
      // Kabin önerileri / mevcut PDU'lar (CMR/T01 XDBT sorgularının karşılığı)
      // -------------------------------------------------------------------------
      function podPrefix() {
        const pod = state.f.podNumber;
        return empty(pod) ? '' : (state.f.isNonStandard ? 'NS' : 'POD') + pod + '_';
      }
      function searchCabinetName(name) {
        state.cabinetSuggestions = [];
        if (!name || String(name).trim() === '') { state.showCabinetSuggestions = false; refreshSuggestions(); return; }
        const up = String(name).toUpperCase();
        const pfx = podPrefix();
        // doc('CMR/T01')/descendant::dev[contains(@id, pfx) and contains(@id, NAME)] — ilk 100 kayıt
        const items = M.cmrDevs().filter(d => d.rid.indexOf(pfx) >= 0 && d.rid.indexOf(up) >= 0).slice(0, 100);
        state.cabinetSuggestions = Array.from(new Set(items.map(it => { const p = it.rid.split('_'); return p.length > 1 ? p[1] : it.rid; })))
          .filter(id => id.indexOf(up) >= 0);
        // Sunum: seçimden sonra (odak dışındayken) liste yeniden açılmaz
        const focused = document.activeElement && document.activeElement.getAttribute('data-k') === 'cabinetName';
        state.showCabinetSuggestions = focused && state.cabinetSuggestions.length > 0;
        refreshSuggestions();
      }
      function fetchExistingPdusInCabinet(name) {
        state.existingPdusInCabinet = [];
        state.existingPdusMessage = '';
        if (name && String(name).trim() !== '') {
          const up = String(name).toUpperCase();
          const needle = '_' + up + '_PDU_';
          // doc('CMR/T01')/descendant::dev[contains(@id, '_NAME_PDU_')]
          state.existingPdusInCabinet = M.cmrDevs()
            .map(d => d.rid).filter(rid => rid.indexOf(needle) >= 0).slice(0, 100)
            .map(rid => { const p = rid.split('_'); return p.length >= 4 && p[2] === 'PDU' ? p[3] : null; })
            .filter(x => x !== null);
          state.existingPdusMessage = state.existingPdusInCabinet.length > 0
            ? T.existingPdus.replace('{pdus}', state.existingPdusInCabinet.join(', '))
            : T.noPdusFound;
        }
        refreshExisting();
        refreshError('pduIdentifier');
      }
      function onCabinetValue(val) {
        clearTimeout(timers.debounce);
        timers.debounce = setTimeout(() => {
          timers.debounce = null;
          if (val === lastCabinetValue) return;   // distinctUntilChanged
          lastCabinetValue = val;
          searchCabinetName(val);
          fetchExistingPdusInCabinet(val);
        }, 300);
      }
      function clearCabinetInputAndSuggestions() {
        state.f.cabinetName = '';
        setInputValue('cabinetName', '');
        lastCabinetValue = '';
        state.cabinetSuggestions = [];
        state.showCabinetSuggestions = false;
        refreshSuggestions();
        fetchExistingPdusInCabinet('');
        state.f.pduIdentifier = '';
        setInputValue('pduIdentifier', '');
        refreshError('pduIdentifier');
        refreshError('cabinetName');
      }

      // -------------------------------------------------------------------------
      // Ön ayar / inlet / outlet işlemleri
      // -------------------------------------------------------------------------
      function onBrandModelChange(presetId) {
        state.savedInlets = [];
        state.savedOutlets = [];
        state.editingInletIndex = null;
        state.editingOutletIndex = null;
        state.inlet.v = blank(INLET_KEYS);
        state.outlet.v = blank(OUTLET_KEYS);
        state.selectedPreset = state.presets.find(p => p.id === presetId) || null;
        const p = state.selectedPreset;
        if (p && p.id !== 'NONE') {
          if (p.inletCount > 0) {
            state.savedInlets.push({ inletBiProAdr: p.inletBiProAdr, inletCurrIoProAdr: p.inletCurrIoProAdr, inletVoltIoProAdr: p.inletVoltIoProAdr, inletPowIoProAdr: p.inletPowIoProAdr });
          }
          for (let i = 1; i <= p.outletCount; i++) {
            state.savedOutlets.push({
              identifier: i < 10 ? '0' + i : '' + i,
              currIoProAdr: p.outletOidBase + '.' + i + p.outletCurrOffset,
              voltIoProAdr: p.outletOidBase + '.' + i + p.outletVoltOffset,
              powIoProAdr: p.outletOidBase + '.' + i + p.outletPowOffset
            });
          }
          state.inlet.disabled = true;
          state.outlet.disabled = true;
        } else {
          state.inlet.disabled = false;
          state.outlet.disabled = false;
        }
      }
      function saveInlet() {
        if (!subValid(state.inlet, INLET_KEYS)) return;   // orijinal: markAllAsTouched (görsel geri bildirim yok)
        const val = Object.assign({}, state.inlet.v);
        if (state.editingInletIndex !== null) { state.savedInlets[state.editingInletIndex] = val; state.editingInletIndex = null; }
        else state.savedInlets.push(val);
        state.inlet.v = blank(INLET_KEYS);
        if (hasPreset()) state.inlet.disabled = true;
        render();
      }
      function saveOutlet() {
        if (!subValid(state.outlet, OUTLET_KEYS)) { toast(T.err.invalidOutletForm, 'error', T.err.errorTitle); return; }
        const val = Object.assign({}, state.outlet.v);
        if (state.editingOutletIndex === null && state.savedOutlets.some(o => o.identifier === val.identifier)) {
          toast(T.err.duplicateOutletId, 'error', T.err.duplicateOutletTitle);
          return;
        }
        if (state.editingOutletIndex !== null) { state.savedOutlets[state.editingOutletIndex] = val; state.editingOutletIndex = null; }
        else state.savedOutlets.push(val);
        state.outlet.v = blank(OUTLET_KEYS);
        if (hasPreset()) state.outlet.disabled = true;
        render();
      }
      function editInlet(i) {
        state.editingInletIndex = i;
        state.editingOutletIndex = null;
        state.inlet.v = Object.assign({}, state.savedInlets[i]);
        state.inlet.disabled = false;
        state.outlet.disabled = true;
        render();
        const c = el.querySelector('[data-inlet-card]');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function editOutlet(i) {
        state.editingOutletIndex = i;
        state.editingInletIndex = null;
        state.outlet.v = Object.assign({}, state.savedOutlets[i]);
        state.outlet.disabled = false;
        state.inlet.disabled = true;
        render();
        const c = el.querySelector('[data-outlet-card]');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function cancelEdit() {
        state.inlet.v = blank(INLET_KEYS);
        state.outlet.v = blank(OUTLET_KEYS);
        state.editingInletIndex = null;
        state.editingOutletIndex = null;
        state.inlet.disabled = hasPreset();
        state.outlet.disabled = hasPreset();
        render();
      }
      function resetAllForms() {
        // pduForm.reset({...}): listede olmayan alanlar (kat, salon, Non-Standart) boşalır
        state.f = Object.assign({}, PDU_DEFAULTS);
        state.touched.clear();
        state.inlet = { v: blank(INLET_KEYS), disabled: false };
        state.outlet = { v: blank(OUTLET_KEYS), disabled: false };
        state.savedInlets = [];
        state.savedOutlets = [];
        state.editingInletIndex = null;
        state.editingOutletIndex = null;
        // brandModel 'NONE' → valueChanges → onBrandModelChange('NONE')
        state.selectedPreset = state.presets.find(p => p.id === 'NONE') || null;
        lastCabinetValue = '';
        state.cabinetSuggestions = [];
        state.showCabinetSuggestions = false;
        state.existingPdusInCabinet = [];
        state.existingPdusMessage = '';
      }

      // -------------------------------------------------------------------------
      // Kaydet (onSubmit + generatePduXml)
      // -------------------------------------------------------------------------
      function generatePduXml(data) {
        const X = T.xml;
        const parts = [];
        const preset = state.selectedPreset;
        const baseId = data.deviceId.replace(/_DV$/, '');
        const d = data.description;
        const bi = (id, adr, len) => '<bi id="' + id + '" xdb_fnc="[XDB.evt]" xdb_log="4" desc="" sta="0x0302" sta_typ="0x1142" sta_fnc="[EVT.sta,PRO.sta]" evt="0" evt_typ="0x1204" evt_fnc="[PRO.pol]" evt_cfg="0x0002" evt_per="30" evt_dly="0.0" evt_syn="0.0" pro="" pro_typ="0xC412" pro_fnc="[]" pro_adr="' + adr + '" pro_len="' + len + '" pro_fni="GET">';
        const si = (suffix, desc, adr) => '<io id="' + baseId + '_' + suffix + '" xdb_cls="cls_SI" desc="' + d + ' ' + desc + '" unit="-" pro="-" sta="0x0302" pro_adr="' + adr + '" val="-" his="-1" his_tim="0"/>';
        const io = (suffix, cls, desc, unit, adr, his, extra) => '<io id="' + baseId + '_' + suffix + '" xdb_cls="' + cls + '" desc="' + d + ' ' + desc + '" unit="' + unit + '" pro="0" sta="0x0302" pro_adr="' + adr + '" val="0" his="' + his + '" his_tim="0"' + (extra || '') + '/>';

        parts.push('<dev id="' + data.deviceId + '" pro_adr="' + data.proxyIndex + '" pro_con="CN_snmp1" con_host="' + data.ipAddress + '" con_port="' + data.snmpPort + '" pro_ver="' + data.snmpVersionXml + '" pro_getc="' + data.readCommunity + '" pro_setc="' + data.writeCommunity + '" plg="' + data.plugin + '" ext_key="' + data.externalKey + '" cst_fld_one="' + data.customField1 + '" cst_fld_two="' + data.customField2 + '" sta="0x0302" sta_typ="0x1142" sta_fnc="[PRO.sta]" pro_inp_rcv="0" pro_pol_snd="2005" pro_pol_rcv="0" pro_pol_dur="0" pro_out_snd="0" pro_out_rcv="0" pro_out_dur="0">');

        parts.push(bi(baseId + '_NFO_BL1', '1.3.6.1.4.1.13742.6.3.2', 10));
        parts.push(si('NFO_PDUMANUF', X.brand, '1.1.2.1'));
        parts.push(si('NFO_PDUMODEL', X.model, '1.1.3.1'));
        parts.push(si('NFO_PDUSERNO', X.serialNo, '1.1.4.1'));
        parts.push(si('NFO_PDUIPADDR', X.ipAddress, '2.1.8.1'));
        parts.push(si('NFO_PDUNAME', X.pduName, '2.1.13.1'));
        parts.push(si('NFO_PDUINCNT', X.inletCount, '2.1.2.1'));
        parts.push(si('NFO_PDUOUTCNT', X.outletCount, '2.1.4.1'));
        parts.push('</bi>');

        parts.push(bi(baseId + '_RTD_BL1', '1.3.6.1.4.1.13742.6.3', 10));
        parts.push(si('RTD_VOLT', X.ratedVolt, '2.1.1.5.1'));
        parts.push(si('RTD_CURR', X.ratedCurr, '2.1.1.6.1'));
        parts.push(si('RTD_VA', X.ratedVa, '2.1.1.8.1'));
        if (preset && preset.ocpCount > 0 && preset.ocpRtdCapPattern) {
          for (let i = 1; i <= preset.ocpCount; i++) parts.push(si('RTD_OCP' + i + '_CURR', 'PDU OCP' + i + ' ' + X.ratedCurr, preset.ocpRtdCapPattern.replace('{i}', String(i))));
        }
        parts.push('</bi>');

        // PduPresetService *_class özniteliklerini okumadığı için orijinalde de her zaman varsayılanlar kullanılır
        const inletCurrClass = (preset && preset.inletCurrClass) || 'CABIN_PDU_CURR04';
        const inletVoltClass = (preset && preset.inletVoltClass) || 'CABIN_PDU_VOLT01';
        const inletPowClass = (preset && preset.inletPowClass) || 'CABIN_PDU_POW';
        const outletCurrClass = (preset && preset.outletCurrClass) || 'CABIN_PDU_CURR01';
        const outletVoltClass = (preset && preset.outletVoltClass) || 'CABIN_PDU_VOLT01';
        const outletPowClass = (preset && preset.outletPowClass) || 'CABIN_PDU_POW';
        const ocpCurrClass = (preset && preset.ocpCurrClass) || 'CABIN_PDU_CURR01_OCP';
        const ocpAlarmClass = 'CABIN_PDU_CURR01';
        const ocpWarnClass = 'CABIN_PDU_CURR01';

        data.inlets.forEach((inlet, index) => {
          const n = index + 1;
          const base = inlet.inletBiProAdr;
          parts.push(bi(baseId + '_IN_BL' + n, base, 10));
          parts.push(io('IN_CURR', inletCurrClass, X.inletCurr, 'A', inlet.inletCurrIoProAdr.substring(base.length + 1), ''));
          parts.push(io('IN_VOLT', inletVoltClass, X.inletVolt, 'V', inlet.inletVoltIoProAdr.substring(base.length + 1), '-1'));
          parts.push(io('IN_POW', inletPowClass, X.inletActivePower, 'W', inlet.inletPowIoProAdr.substring(base.length + 1), '', ' mtr_pow="' + n + '"'));
          if (preset && preset.inletAppOffset) parts.push(io('IN_APPOW', 'cls_TI2', X.inletAppPower, 'VA', preset.inletAppOffset, '-1'));
          if (preset && preset.inletPfOffset) parts.push(io('IN_PF', 'CABIN_PDU_PF01', X.inletPowerFactor, '-', preset.inletPfOffset, '-1'));
          if (preset && preset.inletEngOffset) parts.push(io('IN_AENRG', 'cls_TI2', X.inletActiveEnergy, 'Wh', preset.inletEngOffset, '-1'));
          if (preset && preset.inletFreqOffset) parts.push(io('IN_FREQ', 'CABIN_PDU_FR01', X.inletFreq, 'Hz', preset.inletFreqOffset, '-1'));
          parts.push('</bi>');
        });

        if (data.outlets.length > 0) {
          const outBase = (preset && preset.outletOidBase) || '1.3.6.1.4.1.13742.6.5.4.3.1.4.1';
          parts.push(bi(baseId + '_OUT_BL1', outBase, 100));
          const rel = adr => (adr.startsWith(outBase) ? adr.substring(outBase.length + 1) : adr);
          data.outlets.forEach((o, index) => {
            const id = String(o.identifier).padStart(2, '0');
            const curr = rel(o.currIoProAdr);
            const prefix = curr.split('.')[0];
            const lbl = X.outlet + ' ' + id + ' ';
            parts.push(io('OUT' + id + '_CURR', outletCurrClass, lbl + X.curr, 'A', curr, '-1'));
            parts.push(io('OUT' + id + '_VOLT', outletVoltClass, lbl + X.volt, 'V', rel(o.voltIoProAdr), '-1'));
            parts.push(io('OUT' + id + '_POW', outletPowClass, lbl + X.activePower, 'W', rel(o.powIoProAdr), '', ' mtr_pow="-' + (index + 1) + '"'));
            if (preset && preset.outletAppOffset) parts.push(io('OUT' + id + '_APPOW', 'cls_TI2', lbl + X.appPower, 'VA', prefix + preset.outletAppOffset, '-1'));
            if (preset && preset.outletPfOffset) parts.push(io('OUT' + id + '_PF', 'CABIN_PDU_PF01', lbl + X.powerFactor, '-', prefix + preset.outletPfOffset, '-1'));
            if (preset && preset.outletEngOffset) parts.push(io('OUT' + id + '_AENRG', 'cls_TI2', lbl + X.activeEnergy, 'Wh', prefix + preset.outletEngOffset, '-1'));
            if (preset && preset.outletStatusOffset) parts.push(io('OUT' + id + '_STATUS', 'cls_TI2', lbl + X.status, '-', prefix + preset.outletStatusOffset, '-1'));
            if (preset && preset.outletFreqOffset) parts.push(io('OUT' + id + '_FREQ', 'CABIN_PDU_FR01', lbl + X.freq, 'Hz', prefix + preset.outletFreqOffset, '-1'));
          });
          parts.push('</bi>');
        }

        if (preset && preset.ocpCount > 0 && preset.ocpBaseOid) {
          parts.push(bi(baseId + '_OCP_BL1', preset.ocpBaseOid, 15));
          const ocp = (suffix, cls, desc, adr, extra, his) => '<io id="' + baseId + '_' + suffix + '" xdb_cls="' + cls + '"' + (extra || '') + ' desc="' + d + ' ' + desc + '" unit="' + (suffix.endsWith('STATUS') ? '-' : 'A') + '" pro="-" sta="0x0302" pro_adr="' + adr + '" val="-" his="' + his + '" his_tim="0"/>';
          for (let i = 1; i <= preset.ocpCount; i++) {
            const r = p => p.replace('{i}', String(i));
            if (preset.ocpAlarmPattern) parts.push(ocp('OCP_C' + i + '_ONLVLHIALM', ocpAlarmClass, 'OCP C' + i + ' ' + X.ocpHiAlarm, r(preset.ocpAlarmPattern), '', '-1'));
            if (preset.ocpWarnPattern) parts.push(ocp('OCP_C' + i + '_ONLVLHIWRN', ocpWarnClass, 'OCP C' + i + ' ' + X.ocpHiWarn, r(preset.ocpWarnPattern), '', '-1'));
            if (preset.ocpCurrPattern) parts.push(ocp('OCP_C' + i + '_CURR', ocpCurrClass, 'OCP C' + i + ' ' + X.ocpCurr, r(preset.ocpCurrPattern), ' val_alm_onlhi_alm="7.8" val_alm_onlhi_wrn="7.5"', ''));
            if (preset.ocpStatusPattern) parts.push(ocp('OCP_C' + i + '_STATUS', 'CABIN_PDU_VOLT01', 'OCP C' + i + ' ' + X.ocpStatus, r(preset.ocpStatusPattern), '', '-1'));
          }
          parts.push('</bi>');
        }

        parts.push('</dev>');
        return parts.join('').replace(/[\n\t]/g, '');
      }

      function onSubmit() {
        if (formInvalid()) {
          toast(T.err.fillRequiredFields, 'error', T.err.invalidFormTitle);
          Object.keys(state.f).forEach(k => state.touched.add(k));
          render();
          return;
        }
        const f = state.f;
        const floorVal = parseInt(f.floorNumber, 10);
        const cabinetName = String(f.cabinetName).toUpperCase();
        const pduIdentifier = String(f.pduIdentifier).toUpperCase();
        let deviceId, description;
        if (floorVal === 1) {
          const pod = empty(f.podNumber) ? '' : (f.isNonStandard ? 'NS' : 'POD') + f.podNumber;
          deviceId = (pod ? pod + '_' : '') + cabinetName + '_PDU_' + pduIdentifier + '_DV';
          description = (pod ? pod + '-' : '') + cabinetName + '-PDU-' + pduIdentifier;
        } else {
          deviceId = 'K' + cabinetName + '_PDU_' + pduIdentifier + '_DV';
          description = 'K' + cabinetName + '-PDU-' + pduIdentifier;
        }
        const snmpVersionXml = { '1': 'V1', '2': 'V2C', '3': 'V3' }[f.snmpVersion] || 'V2C';
        const data = Object.assign({}, f, { deviceId, description, snmpVersionXml, inlets: state.savedInlets, outlets: state.savedOutlets });
        delete data.floorNumber; delete data.loungeNumber; delete data.isNonStandard; delete data.podNumber;
        delete data.cabinetName; delete data.pduIdentifier; delete data.brandModel;

        const xml = generatePduXml(data);
        console.log('Oluşturulan XML:', xml);
        const floorStr = floorVal < 10 ? '0' + floorVal : '' + floorVal;
        // XDB_SetValue(doc('CMR/Txx')/xdb/@opr, {cmd:1, xml}) + #save → bellekte ekleme
        M.addDev({ deviceId, description, doc: 'CMR/T' + floorStr, target: "doc('CMR/T" + floorStr + "')/xdb/@opr", xml, data, tim: new Date() });

        state.showSuccessNotification = true;
        resetAllForms();
        render();
        toast(T.ok.pduAdded.replace('{deviceId}', deviceId), 'success', T.ok.successTitle);
        clearTimeout(timers.success);
        timers.success = setTimeout(() => {
          timers.success = null;
          state.showSuccessNotification = false;
          render();
        }, 3000);
      }

      // -------------------------------------------------------------------------
      // Olaylar (delegasyon)
      // -------------------------------------------------------------------------
      function readValue(t) {
        if (t.type === 'checkbox') return t.checked;
        if (t.type === 'number') return t.value === '' ? null : Number(t.value);
        return t.value;
      }

      function onInput(e) {
        const t = e.target;
        const key = t.getAttribute && t.getAttribute('data-k');
        if (!key || t.tagName === 'SELECT' || t.type === 'checkbox') return;
        const sub = t.getAttribute('data-sub');
        if (sub) { state[sub].v[key] = t.value; return; }
        state.f[key] = readValue(t);
        if (key === 'podNumber') { clearCabinetInputAndSuggestions(); return; }
        if (key === 'cabinetName') onCabinetValue(state.f.cabinetName);
        refreshError(key);
      }

      function onChange(e) {
        const t = e.target;
        const key = t.getAttribute && t.getAttribute('data-k');
        if (!key || t.getAttribute('data-sub')) return;
        if (t.type === 'checkbox') {
          state.f[key] = t.checked;
          if (key === 'isNonStandard') clearCabinetInputAndSuggestions();
          return;
        }
        if (t.tagName !== 'SELECT') return;
        state.f[key] = t.value;
        if (key === 'brandModel') {
          // Aynı id'li çift ön ayarda orijinal gibi ilk eşleşme seçilir
          onBrandModelChange(t.value);
          render();
        } else if (key === 'snmpVersion') {
          render();
        }
      }

      function onFocusIn(e) {
        if (e.target.getAttribute && e.target.getAttribute('data-k') === 'cabinetName' && state.cabinetSuggestions.length > 0) {
          state.showCabinetSuggestions = true;
          refreshSuggestions();
        }
      }
      function onFocusOut(e) {
        const t = e.target;
        const key = t.getAttribute && t.getAttribute('data-k');
        if (!key || t.getAttribute('data-sub')) return;
        state.touched.add(key);
        refreshError(key);
        if (key === 'cabinetName') {
          clearTimeout(timers.hide);
          timers.hide = setTimeout(() => {
            timers.hide = null;
            state.showCabinetSuggestions = false;
            state.cabinetSuggestions = [];
            refreshSuggestions();
          }, 150);
        }
      }

      function onMouseDown(e) {
        const li = e.target.closest('[data-sugg]');
        if (!li) return;
        const s = li.getAttribute('data-sugg');
        state.f.cabinetName = s;
        setInputValue('cabinetName', s);
        state.showCabinetSuggestions = false;
        state.cabinetSuggestions = [];
        refreshSuggestions();
        refreshError('cabinetName');
        onCabinetValue(s);
      }

      function onClick(e) {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const a = btn.getAttribute('data-act');
        const i = parseInt(btn.getAttribute('data-i'), 10);
        if (a === 'back') {
          if (window.history.length > 1) window.history.back(); else DCIM.eng.go('add-device');
        } else if (a === 'save-inlet') saveInlet();
        else if (a === 'save-outlet') saveOutlet();
        else if (a === 'cancel-edit') cancelEdit();
        else if (a === 'edit-inlet') editInlet(i);
        else if (a === 'edit-outlet') editOutlet(i);
        else if (a === 'remove-inlet') { state.savedInlets.splice(i, 1); cancelEdit(); }
        else if (a === 'remove-outlet') { state.savedOutlets.splice(i, 1); cancelEdit(); }
      }

      function onFormSubmit(e) {
        if (!e.target.matches('[data-form]')) return;
        e.preventDefault();
        onSubmit();
      }

      el.addEventListener('input', onInput);
      el.addEventListener('change', onChange);
      el.addEventListener('focusin', onFocusIn);
      el.addEventListener('focusout', onFocusOut);
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('click', onClick);
      el.addEventListener('submit', onFormSubmit);

      // ngOnInit: presetler (PduPresetService.getPresets) → brandModel 'NONE'
      state.presets = M ? M.presets() : [];
      if (!state.presets.length) state.presets = [{ id: 'NONE', brandName: 'Yok', modelName: 'Ön Ayar Seçin', inletCount: 0, outletCount: 0 }];
      onBrandModelChange('NONE');

      // Derin bağlantı / demo ön doldurma
      const demo = params.get('demo') === '1';
      const p = k => params.get(k);
      const pre = {
        floorNumber: p('floor') || (demo ? '1' : ''),
        loungeNumber: p('hall') || (demo ? '1' : ''),
        podNumber: p('pod') || (demo ? '9' : ''),
        cabinetName: (p('cabinet') || (demo ? '1BJ53' : '')).toUpperCase(),
        pduIdentifier: p('pdu') || (demo ? 'C' : ''),
        ipAddress: p('ip') || (demo ? '10.10.54.13' : '')
      };
      Object.keys(pre).forEach(k => { if (pre[k]) state.f[k] = k === 'podNumber' ? Number(pre[k]) : pre[k]; });
      if (p('ns') === '1') state.f.isNonStandard = true;
      if (['1', '2', '3'].indexOf(p('snmp')) >= 0) state.f.snmpVersion = p('snmp');
      const presetId = p('preset') || (demo ? 'PX3-5528V-V2' : '');
      if (presetId && state.presets.some(x => x.id === presetId)) { state.f.brandModel = presetId; onBrandModelChange(presetId); }

      render();
      if (state.f.cabinetName) { lastCabinetValue = state.f.cabinetName; fetchExistingPdusInCabinet(state.f.cabinetName); }
      if (p('validate') === '1') onSubmit();

      return {
        destroy() {
          Object.keys(timers).forEach(k => clearTimeout(timers[k]));
          el.removeEventListener('input', onInput);
          el.removeEventListener('change', onChange);
          el.removeEventListener('focusin', onFocusIn);
          el.removeEventListener('focusout', onFocusOut);
          el.removeEventListener('mousedown', onMouseDown);
          el.removeEventListener('click', onClick);
          el.removeEventListener('submit', onFormSubmit);
        }
      };
    }
  };
})();
