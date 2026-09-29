/* ==========================================================================
   DCIM Sunum — Cihaz Tanımlama Talep Formu (NewUICMPAddDeviceComponent)
   engineering/add-device/add-device.component.{html,ts}
   4 kart: Cihaz Bilgileri (+ PDU tanımlama seçeneği, sensör seçimleri) / Lokasyon Bilgileri /
   Ağ Ayarları (protokole göre SNMP v1/v2c, SNMP v3, Modbus TCP alanları) / Datasheet (sürükle-bırak).
   "Talep Gönder" → doğrulama → e-posta talebi (mock: DCIM.data.engAddDevice.send) + bildirim.
   PDU seçilince "Formu Doldur" veya "DCIM içinde tanımla" (→ engineering.html#device-add).
   Veri: DCIM.data.engAddDevice (js/mock/eng-add-device.data.js), DCIM.data.catList
   Derin bağlantılar (engineering.html#add-device?...):
     ?type=ENERJI_ANALIZORU_PANO|PDU|KLIMA|UPS|SENSOR|SDP|REDRESOR|JENERATOR|KLIMA_PANOSU  (orijinalde de var)
     ?klima=CRAC|INROW   ?protocol=SNMP_V1V2C|SNMP_V3|MODBUS_TCP
     ?demo=1      — örnek talep verisiyle doldurur (varsayılan tip UPS)
     ?validate=1  — "Talep Gönder"e basılmış gibi doğrulama hatalarını gösterir
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // ---------------------------------------------------------------------------
  // Metinler (messages.tr.json → addDevice.*)
  // ---------------------------------------------------------------------------
  const T = {
    title: 'CİHAZ TANIMLAMA TALEP FORMU',
    engineering: 'Mühendislik',
    back: 'Geri',
    deviceInfo: 'Cihaz Bilgileri',
    select: 'Seçiniz...',
    pduDefinitionOption: 'PDU Tanımlama Seçeneği',
    pduDefinitionHint: 'PDU cihazını iki şekilde tanımlayabilirsiniz:',
    fillForm: 'Formu Doldur',
    defineInDcim: 'DCIM içinde tanımla',
    sensorSelections: 'Sensör Seçimleri',
    humidity: 'Nem',
    temperature: 'Sıcaklık',
    locationInfo: 'Lokasyon Bilgileri',
    networkSettings: 'Ağ Ayarları',
    datasheet: 'Datasheet',
    addFile: 'Dosya Ekleyin',
    dragFileHere: 'Dosyanızı buraya sürükleyin',
    orClickToSelect: 'veya tıklayıp seçin',
    remove: 'Kaldır',
    processing: 'İşleniyor...',
    sendRequest: 'Talep Gönder',
    yes: 'Evet',
    no: 'Hayır',
    showPassword: 'Şifreyi göster',
    hidePassword: 'Şifreyi gizle',
    fieldRequired: 'Bu alan zorunludur.',
    selectAtLeastOneSensor: 'Lütfen en az bir sensör tipi seçiniz (Nem / Sıcaklık).',
    onlyAllowedFiles: 'Sadece PDF, MIB, OIDLIB veya TXT dosyası yükleyebilirsiniz.',
    fillRequiredFields: 'Lütfen formdaki zorunlu alanları eksiksiz doldurunuz.',
    emailSentSuccess: 'E-posta başarıyla gönderildi!',
    emailSentError: 'İşlem tamamlandı ancak e-posta gönderimi sırasında bir hata oluştu. (Yanıt: {res})',
    emailDeviceInfo: 'CİHAZ BİLGİLERİ',
    emailIntro: 'Sisteme yeni bir cihaz ekleme talebi iletilmiştir. İlgili detaylar aşağıda yer almaktadır:',
    sensorHumidity: 'Sensör - Nem',
    sensorTemperature: 'Sensör - Sıcaklık'
  };

  const DEVICE_TYPES = [
    { value: 'ENERJI_ANALIZORU_PANO', label: 'Enerji Analizörü / Pano' },
    { value: 'PDU', label: 'PDU' },
    { value: 'KLIMA', label: 'Klima' },
    { value: 'UPS', label: 'Kesintisiz Güç Kaynağı (UPS)' },
    { value: 'SENSOR', label: 'Sensör' },
    { value: 'SDP', label: 'SDP' },
    { value: 'REDRESOR', label: 'Redresör' },
    { value: 'JENERATOR', label: 'Jeneratör' },
    { value: 'KLIMA_PANOSU', label: 'Klima Panosu' }
  ];

  const INITIAL = {
    deviceType: '', klimaType: '', replaceCabinId: '', sensorHumidity: false, sensorTemperature: false,
    brand: '', model: '',
    floor: '', hall: '', deviceNo: '', pod: '',
    ipAddress: '', protocol: '', snmpPort: 161, readCommunity: 'public',
    v3Username: 'test', authProtocol: 'SHA', authPassword: '1234', privProtocol: 'AES', privPassword: '1234',
    modbusPort: 502, unitId: 1
  };

  // Örnek talep (?demo=1) — Salon 1 senaryosuyla tutarlı
  const DEMO = {
    UPS: { brand: 'Vertiv', model: 'Liebert EXM2 80kVA', floor: 'Kat-1', hall: 'Salon-1', deviceNo: 'UPS-A6', pod: '', ipAddress: '10.10.60.26', protocol: 'SNMP_V1V2C' },
    KLIMA: { klimaType: 'INROW', brand: 'Vertiv', model: 'Liebert CRV CR035', floor: 'Kat-1', hall: 'Salon-1', deviceNo: 'INROW-ODA1-07', pod: 'Pod 10', ipAddress: '10.10.61.47', protocol: 'MODBUS_TCP' },
    SENSOR: { sensorTemperature: true, sensorHumidity: true, brand: 'Raritan', model: 'DX2-T1H1', floor: 'Kat-1', hall: 'Salon-1', deviceNo: 'SNS-1BJ53-01', pod: 'Pod 9', ipAddress: '10.10.54.31', protocol: 'SNMP_V3' },
    PDU: { brand: 'Raritan', model: 'PX3-5528V-V2', floor: 'Kat-1', hall: 'Salon-1', deviceNo: '1BJ53-PDU-C', pod: 'Pod 9', ipAddress: '10.10.54.13', protocol: 'SNMP_V1V2C' },
    _: { brand: 'Schneider Electric', model: 'PowerLogic PM5560', floor: 'Kat-1', hall: 'Salon-1', deviceNo: 'EA-PANO-12', pod: '', ipAddress: '10.10.62.12', protocol: 'MODBUS_TCP' }
  };

  DCIM.engRegistry['add-device'] = {
    mount(el, params) {
      const { esc, toast, button } = DCIM.ui;
      const kit = DCIM.kit;
      const M = DCIM.data.engAddDevice;

      const cabinOptions = M ? M.cabinOptions() : [];

      // FieldConfig tanımları (add-device.component.ts → deviceFields / locationFields / networkFields)
      const deviceFields = [
        { key: 'deviceType', label: 'Eklenecek Cihaz Tipi', type: 'select', required: true, options: DEVICE_TYPES, errorText: 'Cihaz tipi seçiniz.' },
        { key: 'klimaType', label: 'Klima Tipi', type: 'select', options: [{ label: 'CRAC', value: 'CRAC' }, { label: 'INROW', value: 'INROW' }], showIf: () => showKlimaType() },
        { key: 'replaceCabinId', label: 'Değiştirilecek Kabin', type: 'select', options: cabinOptions.map(c => ({ label: c.name, value: c.id })), showIf: () => isKlimaInrow() },
        { key: 'brand', label: 'Marka', type: 'text', required: true, placeholder: 'Örn: Schneider / APC / ...', list: 'brand' },
        { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'Örn: Model adı / kodu', list: 'model' }
      ];
      const locationFields = [
        { key: 'floor', label: 'Kat', type: 'text', required: true, placeholder: 'Örn: Kat-1' },
        { key: 'hall', label: 'Salon', type: 'text', required: true, placeholder: 'Örn: Salon-1' },
        { key: 'deviceNo', label: 'Cihaz Kodu', type: 'text', required: true, placeholder: 'Örn: CRAC-ODA1-01' },
        { key: 'pod', label: 'Pod', type: 'text', placeholder: 'Örn: Pod 10' }
      ];
      const networkFields = [
        { key: 'ipAddress', label: 'IP Adresi', type: 'text', required: true, placeholder: '192.168.xx.xx', errorText: 'IP adresi zorunludur.' },
        { key: 'protocol', label: 'Protokol', type: 'select', required: true, errorText: 'Protokol seçiniz.',
          options: [{ label: 'SNMP v1/v2c', value: 'SNMP_V1V2C' }, { label: 'SNMP v3', value: 'SNMP_V3' }, { label: 'Modbus TCP', value: 'MODBUS_TCP' }] },
        { key: 'modbusPort', label: 'Modbus Port', type: 'number', placeholder: '502', showIf: () => isModbus() },
        { key: 'snmpPort', label: 'SNMP Port', type: 'number', placeholder: '161', showIf: () => isSnmpSelected() },
        { key: 'readCommunity', label: 'Read Community', type: 'text', placeholder: 'public', showIf: () => isSnmpV1V2c() },
        { key: 'v3Username', label: 'v3 Username', type: 'text', placeholder: 'test', showIf: () => isSnmpV3() },
        { key: 'authProtocol', label: 'Auth Protocol', type: 'select', options: [{ label: 'SHA', value: 'SHA' }, { label: 'MD5', value: 'MD5' }], showIf: () => isSnmpV3() },
        { key: 'authPassword', label: 'Auth Password', type: 'password', showIf: () => isSnmpV3() },
        { key: 'privProtocol', label: 'Priv Protocol', type: 'select', options: [{ label: 'AES', value: 'AES' }, { label: 'DES', value: 'DES' }], showIf: () => isSnmpV3() },
        { key: 'privPassword', label: 'Priv Password', type: 'password', showIf: () => isSnmpV3() }
      ];
      const ALL_FIELDS = deviceFields.concat(locationFields, networkFields);
      const REQUIRED = ALL_FIELDS.filter(f => f.required).map(f => f.key);

      const state = {
        v: Object.assign({}, INITIAL),
        touched: new Set(),
        submitted: false,
        loading: false,
        pduFlow: 'form',
        showAuthPassword: false,
        showPrivPassword: false,
        file: null,          // { name, type, size }
        fileError: '',
        dragOver: false
      };
      let timer = null;

      // --- Getter karşılıkları ---
      const isPdu = () => state.v.deviceType === 'PDU';
      const showKlimaType = () => state.v.deviceType === 'KLIMA';
      const isKlimaInrow = () => state.v.deviceType === 'KLIMA' && state.v.klimaType === 'INROW';
      const isSensor = () => state.v.deviceType === 'SENSOR';
      const isSnmpSelected = () => state.v.protocol === 'SNMP_V1V2C' || state.v.protocol === 'SNMP_V3';
      const isModbus = () => state.v.protocol === 'MODBUS_TCP';
      const isSnmpV1V2c = () => state.v.protocol === 'SNMP_V1V2C';
      const isSnmpV3 = () => state.v.protocol === 'SNMP_V3';
      const showField = f => (f.showIf ? f.showIf() : true);

      // Validators.required: null / '' geçersiz
      const empty = v => v === null || v === undefined || v === '';
      const controlInvalid = key => REQUIRED.indexOf(key) >= 0 && empty(state.v[key]);
      const isInvalid = key => controlInvalid(key) && (state.touched.has(key) || state.submitted);
      const sensorTypeError = () => isSensor() && !state.v.sensorHumidity && !state.v.sensorTemperature;
      const formInvalid = () => REQUIRED.some(controlInvalid) || sensorTypeError();
      const isSensorTypeInvalid = () => sensorTypeError() && (state.submitted || state.touched.size > 0);
      const errorOf = f => (isInvalid(f.key) ? f.errorText || T.fieldRequired : '');

      // valueChanges aboneliklerinin karşılığı
      function onDeviceTypeChange(t) {
        state.pduFlow = t === 'PDU' ? 'choose' : 'form';
        if (t !== 'KLIMA') { state.v.klimaType = ''; state.v.replaceCabinId = ''; }
        if (t !== 'SENSOR') { state.v.sensorHumidity = false; state.v.sensorTemperature = false; }
      }
      function onProtocolChange(p) {
        const v = state.v;
        if (p === 'SNMP_V1V2C') {
          v.snmpPort = v.snmpPort == null || v.snmpPort === '' ? 161 : v.snmpPort;
          v.readCommunity = v.readCommunity || 'public';
        }
        if (p === 'SNMP_V3') {
          v.snmpPort = v.snmpPort == null || v.snmpPort === '' ? 161 : v.snmpPort;
          v.v3Username = v.v3Username || 'test';
          v.authPassword = v.authPassword || '1234';
          v.privPassword = v.privPassword || '1234';
        }
      }

      // -------------------------------------------------------------------------
      // Şablon
      // -------------------------------------------------------------------------
      function control(f) {
        const val = state.v[f.key];
        if (f.type === 'select') {
          return '<select data-k="' + f.key + '" class="scada-select w-full">' +
            '<option value="" disabled' + (empty(val) ? ' selected' : '') + '>' + esc(T.select) + '</option>' +
            f.options.map(o => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
          '</select>';
        }
        if (f.type === 'password') {
          const shown = f.key === 'authPassword' ? state.showAuthPassword : state.showPrivPassword;
          return '<div class="relative w-full flex items-center">' +
            '<input data-k="' + f.key + '" type="' + (shown ? 'text' : 'password') + '" value="' + esc(val == null ? '' : val) + '" placeholder="••••" class="scada-input w-full pr-10" autocomplete="new-password" />' +
            '<button type="button" data-act="toggle-pwd" data-key="' + f.key + '" class="absolute right-2.5 text-slate-400 hover:text-slate-200 cursor-pointer p-1" aria-label="' + esc(shown ? T.hidePassword : T.showPassword) + '">' +
              '<i class="' + (shown ? 'pi pi-eye-slash text-xs' : 'pi pi-eye text-xs') + '"></i></button>' +
          '</div>';
        }
        const list = f.list && catalogFor().length ? ' list="ad-' + f.list + '-list"' : '';
        return '<input data-k="' + f.key + '" type="' + f.type + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(f.placeholder || '') + '" class="scada-input w-full" autocomplete="off"' + list + ' />';
      }

      function field(f) {
        return '<div data-wrap="' + f.key + '">' +
          kit.formField({ label: f.label, required: !!f.required, error: errorOf(f), control: control(f) }) + '</div>';
      }

      // Sunum eki: Model Kütüphanesi'nden marka/model önerileri (datalist)
      function catalogFor() { return M ? M.catalog(state.v.deviceType) : []; }
      function modelOptions() {
        const b = String(state.v.brand || '').trim().toLowerCase();
        const cat = catalogFor();
        const byBrand = cat.filter(c => c.brand.toLowerCase() === b);
        return (byBrand.length ? byBrand : cat).map(c => '<option value="' + esc(c.model) + '"></option>').join('');
      }
      function datalists() {
        const cat = catalogFor();
        if (!cat.length) return '';
        const brands = Array.from(new Set(cat.map(c => c.brand)));
        return '<datalist id="ad-brand-list">' + brands.map(b => '<option value="' + esc(b) + '"></option>').join('') + '</datalist>' +
          '<datalist id="ad-model-list">' + modelOptions() + '</datalist>';
      }

      function checkbox(key, label) {
        return '<label class="flex items-center gap-2 cursor-pointer select-none">' +
          '<input type="checkbox" data-k="' + key + '" id="' + key + '"' + (state.v[key] ? ' checked' : '') +
            ' class="w-4 h-4 rounded-[2px] bg-white dark:bg-surface-card border-slate-300 dark:border-border-subtle text-sky-600 focus:ring-sky-500" />' +
          '<span class="text-xs text-slate-700 dark:text-slate-300">' + esc(label) + '</span></label>';
      }

      function sensorErrorHtml() {
        return isSensorTypeInvalid()
          ? '<p class="text-[10px] text-rose-500 font-medium flex items-center gap-1 mt-2"><i class="pi pi-exclamation-circle text-[10px]"></i>' + esc(T.selectAtLeastOneSensor) + '</p>'
          : '';
      }

      function deviceCard() {
        const pduChoose = isPdu() && state.pduFlow === 'choose';
        const fields = deviceFields.filter(f => showField(f) && (!isPdu() || state.pduFlow === 'form' || f.key === 'deviceType'));
        return kit.card({
          title: T.deviceInfo, icon: 'pi pi-server',
          body: '<div class="flex flex-col gap-4">' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + fields.map(field).join('') + '</div>' + datalists() +
            (pduChoose
              ? '<div class="p-4 rounded bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle">' +
                  '<div class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">' + esc(T.pduDefinitionOption) + '</div>' +
                  '<p class="text-[11px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">' + esc(T.pduDefinitionHint) + '</p>' +
                  '<div class="flex flex-wrap gap-2">' +
                    button({ variant: 'primary', size: 'sm', label: T.fillForm, attrs: 'data-act="pdu-form"' }) +
                    button({ variant: 'secondary', size: 'sm', label: T.defineInDcim, attrs: 'data-act="pdu-dcim"' }) +
                  '</div>' +
                '</div>'
              : '') +
            (isSensor()
              ? '<div class="p-4 rounded bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle">' +
                  '<div class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">' + esc(T.sensorSelections) + ' <span class="text-rose-500 font-bold">*</span></div>' +
                  '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
                    checkbox('sensorHumidity', '1 - ' + T.humidity) + checkbox('sensorTemperature', '2 - ' + T.temperature) +
                  '</div>' +
                  '<div data-sensor-err>' + sensorErrorHtml() + '</div>' +
                '</div>'
              : '') +
          '</div>'
        });
      }

      function dropZone() {
        const invalid = !!state.fileError; // orijinalde datasheet kontrolünde doğrulayıcı yok (bkz. rapor)
        const zoneCls = state.dragOver
          ? 'border-sky-500 bg-sky-500/5 dark:bg-sky-500/5'
          : invalid ? 'border-rose-500 bg-rose-500/5'
            : 'border-slate-200 hover:border-slate-300 bg-slate-50 dark:border-border-subtle dark:hover:border-border-muted dark:bg-surface-panel';
        const f = state.file;
        return '<div data-drop role="button" tabindex="0" class="flex flex-col items-center justify-center p-6 border border-dashed rounded-[2px] cursor-pointer transition-colors text-center select-none ' + zoneCls + '">' +
            '<input data-file type="file" hidden accept=".pdf,application/pdf,.mib,.oidlib,.txt,text/plain" />' +
            '<i class="pi pi-upload text-3xl text-slate-400 dark:text-slate-500 mb-2"></i>' +
            '<div class="text-[11px] font-semibold text-slate-700 dark:text-slate-300">' + esc(T.dragFileHere) + '</div>' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(T.orClickToSelect) + '</div>' +
            (f
              ? '<div class="mt-3 p-2 bg-slate-100/50 dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] flex items-center gap-2 max-w-full">' +
                  '<i class="pi pi-file text-sky-500 text-xs shrink-0"></i>' +
                  '<span class="text-[10px] font-mono text-slate-700 dark:text-slate-300 truncate max-w-[200px]">' + esc(f.name) + '</span>' +
                  '<button type="button" data-act="clear-file" class="text-rose-500 hover:text-rose-400 p-0.5 rounded cursor-pointer shrink-0" title="' + esc(T.remove) + '"><i class="pi pi-trash text-[10px]"></i></button>' +
                '</div>'
              : '') +
          '</div>';
      }

      function restOfForm() {
        if (isPdu() && state.pduFlow !== 'form') return '';
        const submitBtn = '<button type="submit" class="' + DCIM.ui.buttonClasses('primary', 'md', false) + '"' + (state.loading ? ' disabled aria-busy="true"' : '') + '>' +
          (state.loading ? '<i class="pi pi-spin pi-spinner text-current"></i>' : '') +
          '<span class="truncate">' + esc(state.loading ? T.processing : T.sendRequest) + '</span></button>';
        return kit.card({ title: T.locationInfo, icon: 'pi pi-map-marker',
            body: '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + locationFields.filter(showField).map(field).join('') + '</div>' }) +
          kit.card({ title: T.networkSettings, icon: 'pi pi-globe',
            body: '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + networkFields.filter(showField).map(field).join('') + '</div>' }) +
          kit.card({ title: T.datasheet, icon: 'pi pi-file-pdf',
            body: '<div class="w-full" data-wrap="datasheet">' + kit.formField({ label: T.addFile, required: true, error: state.fileError, control: dropZone() }) + '</div>' }) +
          '<div class="flex justify-end gap-2 mt-4">' + submitBtn + '</div>';
      }

      function render() {
        const header = kit.pageHeader({
          title: T.title,
          breadcrumbs: [{ label: T.engineering, href: 'engineering.html' }, { label: T.title }],
          actions: button({ variant: 'secondary', icon: 'pi pi-chevron-left', label: T.back, attrs: 'data-act="back"' })
        });
        el.innerHTML = '<div class="p-4">' + header +
          '<form data-form novalidate class="mt-4 flex flex-col gap-4">' + deviceCard() + restOfForm() + '</form></div>';
      }

      // Tek alanın hata satırını, odağı bozmadan güncelle
      function refreshError(key) {
        const wrap = el.querySelector('[data-wrap="' + key + '"]');
        const f = ALL_FIELDS.find(x => x.key === key);
        if (!wrap || !f) return;
        const root = wrap.firstElementChild;
        const old = root.querySelector(':scope > p.text-rose-500');
        if (old) old.remove();
        const msg = errorOf(f);
        if (msg) root.insertAdjacentHTML('beforeend', '<p class="text-[10px] text-rose-500 font-medium flex items-center gap-1 mt-0.5"><i class="pi pi-exclamation-circle text-[10px]"></i>' + esc(msg) + '</p>');
      }
      function refreshSensorError() {
        const box = el.querySelector('[data-sensor-err]');
        if (box) box.innerHTML = sensorErrorHtml();
      }

      // -------------------------------------------------------------------------
      // Dosya (setPdfFile / clearFile)
      // -------------------------------------------------------------------------
      function setFile(file) {
        state.fileError = '';
        const lower = file.name.toLowerCase();
        const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
        const isTextLike = lower.endsWith('.mib') || lower.endsWith('.oidlib') || lower.endsWith('.txt') || (file.type || '').startsWith('text/');
        if (!(isPdf || isTextLike)) {
          state.file = null;
          state.fileError = T.onlyAllowedFiles;
        } else {
          state.file = { name: file.name, type: file.type, size: file.size };
        }
        render();
      }

      // -------------------------------------------------------------------------
      // Gönder (submit / sendEmailNotification)
      // -------------------------------------------------------------------------
      function buildEmail() {
        const v = state.v;
        const typeObj = DEVICE_TYPES.find(o => o.value === v.deviceType);
        const typeLabel = typeObj ? typeObj.label : v.deviceType;
        const subject = 'Yeni Cihaz Ekleme Talebi: ' + typeLabel + ' - ' + (v.brand || 'Belirtilmedi');
        let body = T.emailIntro + '\n\n';
        const section = title => { body += '-------------------------------------------------\n' + title + '\n-------------------------------------------------\n'; };
        const add = (label, value, type) => {
          if (value === null || value === undefined || value === '') return;
          body += label.padEnd(25, ' ') + ': ' + (type === 'password' ? '********' : value) + '\n';
        };
        const addFields = list => list.forEach(f => {
          if (!showField(f)) return;
          let val = v[f.key];
          if (f.type === 'select' && f.options) { const o = f.options.find(x => String(x.value) === String(val)); if (o) val = o.label; }
          add(f.label, val, f.type);
        });
        section(T.emailDeviceInfo);
        addFields(deviceFields);
        if (v.deviceType === 'SENSOR') {
          add(T.sensorHumidity, v.sensorHumidity ? T.yes : T.no);
          add(T.sensorTemperature, v.sensorTemperature ? T.yes : T.no);
        }
        body += '\n';
        section(T.locationInfo);
        addFields(locationFields);
        body += '\n';
        section(T.networkSettings);
        addFields(networkFields);
        if (v.protocol === 'MODBUS_TCP') add('Unit ID', v.unitId);
        body += '\n-------------------------------------------------\n';
        body += 'Bu e-posta sistem tarafından otomatik olarak oluşturulmuştur, lütfen yanıtlamayınız.';
        return { subject, body };
      }

      function submit() {
        state.submitted = true;
        ALL_FIELDS.forEach(f => state.touched.add(f.key));
        if (formInvalid()) {
          render();
          toast(T.fillRequiredFields, 'error');   // orijinal: alert()
          return;
        }
        state.loading = true;
        render();
        timer = setTimeout(() => {
          timer = null;
          const mail = buildEmail();
          const res = M ? M.send({ cmd: 'SEND_EMAIL', to_addr: M.to_addr, subject: mail.subject, body: mail.body, file_name: '', form: Object.assign({}, state.v), file: state.file }) : '';
          state.loading = false;
          render();
          if (res || res === 0 || res === '0' || res === 'OK') toast(T.emailSentSuccess, 'success', mail.subject);
          else toast(T.emailSentError.replace('{res}', String(res)), 'error');
        }, 900);
      }

      // -------------------------------------------------------------------------
      // Olaylar (delegasyon)
      // -------------------------------------------------------------------------
      function keyOf(t) { return t && t.getAttribute ? t.getAttribute('data-k') : null; }
      function readValue(t) {
        if (t.type === 'checkbox') return t.checked;
        if (t.type === 'number') return t.value === '' ? null : Number(t.value);
        return t.value;
      }

      function onInput(e) {
        const key = keyOf(e.target);
        if (!key || e.target.tagName === 'SELECT' || e.target.type === 'checkbox') return;
        state.v[key] = readValue(e.target);
        refreshError(key);
        if (key === 'brand') { const dl = el.querySelector('#ad-model-list'); if (dl) dl.innerHTML = modelOptions(); }
      }

      function onChange(e) {
        const t = e.target;
        if (t.matches('[data-file]')) { if (t.files && t.files[0]) setFile(t.files[0]); return; }
        const key = keyOf(t);
        if (!key) return;
        state.v[key] = readValue(t);
        state.touched.add(key);
        if (t.type === 'checkbox') { refreshSensorError(); return; }
        if (t.tagName !== 'SELECT') return;
        if (key === 'deviceType') onDeviceTypeChange(state.v.deviceType);
        if (key === 'protocol') onProtocolChange(state.v.protocol);
        if (key === 'deviceType' || key === 'klimaType' || key === 'protocol') render();
        else refreshError(key);
      }

      function onFocusOut(e) {
        const key = keyOf(e.target);
        if (!key) return;
        state.touched.add(key);
        refreshError(key);
        refreshSensorError();
      }

      function onClick(e) {
        const act = e.target.closest('[data-act]');
        if (act) {
          const a = act.getAttribute('data-act');
          if (a === 'back') {
            if (window.history.length > 1) window.history.back(); else window.location.href = 'engineering.html';
          } else if (a === 'toggle-pwd') {
            const k = act.getAttribute('data-key');
            if (k === 'authPassword') state.showAuthPassword = !state.showAuthPassword;
            if (k === 'privPassword') state.showPrivPassword = !state.showPrivPassword;
            render();
          } else if (a === 'clear-file') {
            e.stopPropagation();
            state.file = null;
            state.fileError = '';
            render();
          } else if (a === 'pdu-form') {
            state.pduFlow = 'form';
            render();
          } else if (a === 'pdu-dcim') {
            // definePduInDcim(): router.navigate(['/dcim/engineering/device-add'])
            DCIM.eng.go('device-add');
          }
          return;
        }
        if (e.target.matches('[data-file]')) return;   // inp.click() geri dönüşü
        const zone = e.target.closest('[data-drop]');
        if (zone) { const inp = zone.querySelector('[data-file]'); if (inp) inp.click(); }
      }

      function onKeyDown(e) {
        const zone = e.target.closest && e.target.closest('[data-drop]');
        if (zone && e.target === zone && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          zone.querySelector('[data-file]').click();
        }
      }

      function setDrag(on) {
        if (state.dragOver === on) return;
        state.dragOver = on;
        const zone = el.querySelector('[data-drop]');
        if (!zone) return;
        const onCls = ['border-sky-500', 'bg-sky-500/5', 'dark:bg-sky-500/5'];
        const offCls = ['border-slate-200', 'hover:border-slate-300', 'bg-slate-50', 'dark:border-border-subtle', 'dark:hover:border-border-muted', 'dark:bg-surface-panel'];
        onCls.forEach(c => zone.classList.toggle(c, on));
        offCls.forEach(c => zone.classList.toggle(c, !on && !state.fileError));
      }
      function onDragOver(e) { if (!e.target.closest('[data-drop]')) return; e.preventDefault(); setDrag(true); }
      function onDragLeave(e) { if (!e.target.closest('[data-drop]')) return; e.preventDefault(); setDrag(false); }
      function onDrop(e) {
        if (!e.target.closest('[data-drop]')) return;
        e.preventDefault();
        state.dragOver = false;
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) setFile(file); else render();
      }
      function onSubmit(e) {
        if (!e.target.matches('[data-form]')) return;
        e.preventDefault();
        if (!state.loading) submit();
      }

      el.addEventListener('input', onInput);
      el.addEventListener('change', onChange);
      el.addEventListener('focusout', onFocusOut);
      el.addEventListener('click', onClick);
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('dragover', onDragOver);
      el.addEventListener('dragleave', onDragLeave);
      el.addEventListener('drop', onDrop);
      el.addEventListener('submit', onSubmit);

      // ngOnInit: ?type= ile cihaz tipi ön seçimi (+ sunum derin bağlantıları)
      const type = params.get('type') || (params.get('demo') === '1' ? 'UPS' : '');
      if (type && DEVICE_TYPES.some(o => o.value === type)) {
        state.v.deviceType = type;
        onDeviceTypeChange(type);
      }
      if (params.get('demo') === '1') {
        Object.assign(state.v, DEMO[state.v.deviceType] || DEMO._);
        if (state.v.deviceType === 'PDU') state.pduFlow = 'form';
        onProtocolChange(state.v.protocol);
        state.file = { name: (state.v.model || 'datasheet').replace(/\s+/g, '_') + '_datasheet.pdf', type: 'application/pdf', size: 482113 };
      }
      const klima = params.get('klima');
      if (klima && showKlimaType() && (klima === 'CRAC' || klima === 'INROW')) state.v.klimaType = klima;
      const proto = params.get('protocol');
      if (proto && ['SNMP_V1V2C', 'SNMP_V3', 'MODBUS_TCP'].indexOf(proto) >= 0) { state.v.protocol = proto; onProtocolChange(proto); }

      render();
      if (params.get('validate') === '1') submit();

      return {
        destroy() {
          if (timer) clearTimeout(timer);
          el.removeEventListener('input', onInput);
          el.removeEventListener('change', onChange);
          el.removeEventListener('focusout', onFocusOut);
          el.removeEventListener('click', onClick);
          el.removeEventListener('keydown', onKeyDown);
          el.removeEventListener('dragover', onDragOver);
          el.removeEventListener('dragleave', onDragLeave);
          el.removeEventListener('drop', onDrop);
          el.removeEventListener('submit', onSubmit);
        }
      };
    }
  };
})();
