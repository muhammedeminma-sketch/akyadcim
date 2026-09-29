/* ==========================================================================
   DCIM Sunum — Mühendislik / Asset Cihazı Ekleme (Model Kütüphanesine yeni cihaz modeli)
   Kaynak: user-app/src/app/new-ui/pages/engineering/asset-device-add/
           asset-device-add.component.{html,ts} (NewUICMPAssetDeviceAddComponent)
   - "Fiziksel Altyapı" kartı: Marka (öneri listesi + "Diğer" → elle marka), Model, Cihaz Türü (öneri listesi +
     "Diğer" → elle tür), U Kapasitesi, Güç (Watt), Ağırlık (kg), Güç Bağlantıları; kart başlığında Kaydet.
   - Doğrulama (dokunulmuş alan hataları, negatif değer, zorunlu alanlar, U ≠ 0), aynı model adı kontrolü
     (getAllCat) ve kayıt (createCatalogItem) TS'ten birebir port. Başarılı kayıtta form sıfırlanır,
     marka/tür listeleri 500 ms sonra yeniden yüklenir.
   - Veri: DCIM.data.engAssetDeviceAdd (js/mock/eng-asset-device-add.data.js) → DCIM.data.catList (Model Kütüphanesi)
     ve kabin varlık tipleri (HIS_getAllDeviceType). Kayıt bellekte + toast.
   Giriş noktası: Kabin Yönetimi → Cihaz Sınıfı aramasında "Sonuç bulunamadı. Yeni model eklemek için tıklayınız."
     (cabinet-manager.component.ts navigateToAssetDeviceAdd → queryParams: { comp: 'asset-device-add' };
     orijinal yalnızca comp taşır, kabin / arama metni aktarılmaz).
   Sunum eklentileri (derin bağlantılar, engineering.html#asset-device-add?...):
     ?cabinet=<kod>      Geri düğmesi Kabin Yönetimi'ne döner (cabinet-detail.html?cabinet=<kod>); orijinal /scada-2d
     ?model=<metin>      Model alanını doldur (Kabin Yönetimi'nde aranan metin)
     ?brand=<marka>      Marka alanını doldur (listede varsa seçili, yoksa yazılmış gibi)
     ?type=<tür>         Cihaz Türü alanını doldur
     ?u=<n>              U Kapasitesi
   ör. engineering.html#asset-device-add?cabinet=1BJ53&model=PowerEdge%20R760&brand=Dell&type=Sunucu&u=2
   Bilinçli sapma: showBackButton orijinalde history.length > 1 ile belirlenir; sunumda ?cabinet= varsa da gösterilir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // messages.tr.json → assetDeviceAdd.* / common.* / menu.engineering
  const TR = {
    title: 'ASSET CİHAZI EKLEME', engineering: 'Mühendislik', physicalInfra: 'Fiziksel Altyapı',
    brand: 'Marka', brandPlaceholder: 'Marka giriniz...', other: 'Diğer',
    manualBrand: 'Marka Adı (Diğer)', manualBrandPlaceholder: 'Marka girin...',
    manualDeviceType: 'Cihaz Türü (Diğer)', manualDeviceTypePlaceholder: 'Cihaz türü girin...',
    model: 'Model', modelPlaceholder: '2960, AC6605...', deviceType: 'Cihaz Türü', selectDeviceType: 'Cihaz Türü Seçiniz...',
    loadingDeviceTypes: 'Cihaz türleri yükleniyor...', noResults: 'Sonuç bulunamadı. Yazarak yeni bir tür ekleyebilirsiniz.',
    uCapacity: 'U Kapasitesi', power: 'Güç (Watt)', weight: 'Ağırlık (kg)', powerConnections: 'Güç Bağlantıları',
    err: {
      brandRequired: 'Marka alanı zorunludur.', modelRequired: 'Model alanı zorunludur.', deviceTypeRequired: 'Cihaz Türü alanı zorunludur.',
      uCapacityInvalid: "U Kapasitesi 0'dan farklı bir değer olmalıdır.", deviceExists: 'Bu cihaz kütüphanede zaten mevcut.',
      negativeNotAllowed: 'Negatif sayılar giremezsiniz.'
    },
    saved: 'Cihaz başarıyla kaydedildi.',
    save: 'Kaydet', back: 'Geri', pleaseWait: 'Lütfen bekleyin...'
  };

  const LOAD_MS = 320; // subscribe1ASM / HIS_getAllDeviceType yanıt süresi (sunum)
  const emptyInput = () => ({ manufacturer: '', model: '', deviceType: '', uCapacity: 0, power: 0, weight: 0, powerConnections: 0 });
  const isOtherText = s => !!s && (s.trim().toLowerCase() === 'other' || s.trim().toLowerCase() === TR.other.toLowerCase());
  const uniqCi = arr => {
    const out = [];
    arr.forEach(v => { const t = (v || '').trim(); if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t); });
    return out;
  };
  const sortTr = arr => arr.sort((a, b) => a.localeCompare(b));

  DCIM.engRegistry['asset-device-add'] = {
    mount(el, params) {
      const { esc, button, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const api = DCIM.data.engAssetDeviceAdd;
      const p = params || new URLSearchParams();
      const timers = new Set();
      const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
      let destroyed = false;

      const cabinet = (p.get('cabinet') || '').trim();
      const A = {
        input: emptyInput(),
        brandSearchText: '', availableBrands: [], filteredBrands: [], showBrandDropdown: false, isLoadingBrands: false,
        isOtherBrandSelected: false, manualBrandText: '', manualBrandTouched: false,
        isOtherDeviceTypeSelected: false, manualDeviceTypeText: '', manualDeviceTypeTouched: false,
        availableDeviceTypes: [], filteredDeviceTypes: [], deviceTypeSearchText: '', showDeviceTypeDropdown: false, isLoadingDeviceTypes: false,
        isCreatMode: true,
        manufacturerTouched: false, modelTouched: false, deviceTypeTouched: false, uCapacityTouched: false,
        // checkIfFromAssetCabinet (history.length > 1) — sunumda kabin parametresiyle de
        showBackButton: !!cabinet || window.history.length > 1
      };

      // Derin bağlantı ön doldurma
      if (p.get('model')) A.input.model = p.get('model');
      if (p.get('brand')) { A.input.manufacturer = p.get('brand'); A.brandSearchText = p.get('brand'); }
      if (p.get('type')) { A.input.deviceType = p.get('type'); A.deviceTypeSearchText = p.get('type'); }
      const u0 = parseInt(p.get('u'), 10);

      // -------------------------------------------------------------------
      // Doğrulama (isXxxEmpty / isUCapacityInvalid)
      // -------------------------------------------------------------------
      const blank = v => !(v && String(v).trim());
      const errors = () => ({
        brand: (A.isOtherBrandSelected ? A.manufacturerTouched && blank(A.manualBrandText) : A.manufacturerTouched && blank(A.input.manufacturer)) ? TR.err.brandRequired : '',
        manualBrand: A.manualBrandTouched && blank(A.manualBrandText) ? TR.err.brandRequired : '',
        model: A.modelTouched && blank(A.input.model) ? TR.err.modelRequired : '',
        type: (A.isOtherDeviceTypeSelected ? A.deviceTypeTouched && blank(A.manualDeviceTypeText) : A.deviceTypeTouched && blank(A.input.deviceType)) ? TR.err.deviceTypeRequired : '',
        manualType: A.manualDeviceTypeTouched && blank(A.manualDeviceTypeText) ? TR.err.deviceTypeRequired : '',
        u: A.uCapacityTouched && (A.input.uCapacity === 0 || A.input.uCapacity === null || A.input.uCapacity === undefined) ? TR.err.uCapacityInvalid : ''
      });

      // -------------------------------------------------------------------
      // Çizim — iskelet bir kez çizilir; öneri listeleri / hata metinleri / koşullu alanlar yerinde güncellenir
      // -------------------------------------------------------------------
      const ERR_TXT = { brand: TR.err.brandRequired, manualBrand: TR.err.brandRequired, model: TR.err.modelRequired, type: TR.err.deviceTypeRequired, manualType: TR.err.deviceTypeRequired, u: TR.err.uCapacityInvalid };
      const field = (key, opts) => '<div data-ff="' + key + '"' + (opts.hidden ? ' class="hidden"' : '') + '>' +
        kit.formField({ label: opts.label, required: opts.required, error: ERR_TXT[key] || '', control: opts.control }) + '</div>';
      const num = (key, extra) => '<input type="number" data-num="' + key + '" value="' + esc(A.input[key]) + '"' + (A.isCreatMode ? '' : ' readonly') + ' min="0" class="scada-input w-full"' + (extra || '') + ' />';
      const suggest = (key, value, ph) => '<div class="relative w-full">' +
        '<input type="text" data-sg="' + key + '" value="' + esc(value) + '" placeholder="' + esc(ph) + '" autocomplete="off" class="scada-input w-full" required />' +
        '<div data-dd="' + key + '"></div></div>';

      function render() {
        const backBtn = A.showBackButton
          ? button({ variant: 'secondary', icon: 'pi pi-chevron-left', label: TR.back, attrs: 'data-act="back"' + (cabinet ? ' title="Kabin ' + esc(cabinet) + ' — Kabin Yönetimi"' : '') })
          : '';
        el.innerHTML =
          '<div class="eng-adda p-4 flex flex-col gap-4">' +
            kit.pageHeader({
              title: TR.title,
              breadcrumbs: [{ label: TR.engineering, href: 'engineering.html' }, { label: TR.title }],
              actions: backBtn
            }) +
            kit.card({
              title: TR.physicalInfra,
              icon: 'pi pi-server',
              actions: '<div>' + button({ variant: 'primary', size: 'sm', icon: 'pi pi-save', label: TR.save, attrs: 'data-act="save"' }) + '</div>',
              body: '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
                field('brand', { label: TR.brand, required: true, control: suggest('brand', A.brandSearchText, TR.brandPlaceholder) }) +
                field('manualBrand', { label: TR.manualBrand, required: true, hidden: !A.isOtherBrandSelected,
                  control: '<input type="text" data-tx="manualBrand" value="' + esc(A.manualBrandText) + '" placeholder="' + esc(TR.manualBrandPlaceholder) + '" class="scada-input w-full" required />' }) +
                field('model', { label: TR.model, required: true,
                  control: '<input type="text" data-tx="model" value="' + esc(A.input.model) + '" placeholder="' + esc(TR.modelPlaceholder) + '" class="scada-input w-full" required />' }) +
                field('type', { label: TR.deviceType, required: true, control: suggest('type', A.deviceTypeSearchText, TR.selectDeviceType) }) +
                field('manualType', { label: TR.manualDeviceType, required: true, hidden: !A.isOtherDeviceTypeSelected,
                  control: '<input type="text" data-tx="manualType" value="' + esc(A.manualDeviceTypeText) + '" placeholder="' + esc(TR.manualDeviceTypePlaceholder) + '" class="scada-input w-full" required />' }) +
                field('u', { label: TR.uCapacity, required: A.isCreatMode, control: num('uCapacity') }) +
                field('power', { label: TR.power, control: num('power') }) +
                field('weight', { label: TR.weight, control: num('weight') }) +
                field('powerConnections', { label: TR.powerConnections, control: num('powerConnections') }) +
              '</div>'
            }) +
          '</div>';
        update();
      }

      const LI = 'px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors';
      const LI_OTHER = 'px-3 py-1.5 border-t border-slate-100 dark:border-border-subtle italic text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors';
      const LI_MSG = 'px-3 py-1.5 text-slate-500 dark:text-slate-400';
      function dropdown(key, show, loading, loadingText, items) {
        if (!show) return '';
        return '<ul class="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-lg py-1 text-xs">' +
          (loading ? '<li class="' + LI_MSG + '">' + esc(loadingText) + '</li>' : '') +
          (!loading && items.length === 0 ? '<li class="' + LI_MSG + '">' + esc(TR.noResults) + '</li>' : '') +
          (!loading ? items.map(v => '<li data-pick="' + key + '" data-val="' + esc(v) + '" class="' + LI + '">' + esc(v) + '</li>').join('') +
            '<li data-pick="' + key + '" data-val="Other" class="' + LI_OTHER + '">' + esc(TR.other) + '</li>' : '') +
        '</ul>';
      }

      // Koşullu alanlar, hata metinleri ve öneri listelerini günceller (odak korunur)
      function update() {
        if (destroyed) return;
        const err = errors();
        Object.keys(ERR_TXT).forEach(k => {
          const pEl = el.querySelector('[data-ff="' + k + '"] p');
          if (pEl) pEl.classList.toggle('hidden', !err[k]);
        });
        const mb = el.querySelector('[data-ff="manualBrand"]');
        if (mb) mb.classList.toggle('hidden', !A.isOtherBrandSelected);
        const mt = el.querySelector('[data-ff="manualType"]');
        if (mt) mt.classList.toggle('hidden', !A.isOtherDeviceTypeSelected);
        const db = el.querySelector('[data-dd="brand"]');
        if (db) db.innerHTML = dropdown('brand', A.showBrandDropdown, A.isLoadingBrands, TR.pleaseWait, A.filteredBrands);
        const dt = el.querySelector('[data-dd="type"]');
        if (dt) dt.innerHTML = dropdown('type', A.showDeviceTypeDropdown, A.isLoadingDeviceTypes, TR.loadingDeviceTypes, A.filteredDeviceTypes);
      }
      const setVal = (sel, v) => { const n = el.querySelector(sel); if (n && n !== document.activeElement) n.value = v; };

      // -------------------------------------------------------------------
      // Veri yükleme (loadDeviceTypes / loadBrandsAndDeviceTypesFromDb / mergeDeviceTypes)
      // -------------------------------------------------------------------
      function mergeDeviceTypes(types) {
        A.availableDeviceTypes = sortTr(Array.from(new Set(A.availableDeviceTypes.concat(types))).filter(t => t && t.trim() !== ''));
        A.filteredDeviceTypes = A.availableDeviceTypes.slice();
      }
      function loadDeviceTypes() {
        A.isLoadingDeviceTypes = true;
        update();
        later(() => {
          mergeDeviceTypes(api.getAllDeviceType().map(x => x.device_type));
          A.isLoadingDeviceTypes = false;
          if (A.showDeviceTypeDropdown) filterDeviceTypes(A.deviceTypeSearchText);
          update();
        }, LOAD_MS);
      }
      function loadBrandsAndDeviceTypesFromDb() {
        A.isLoadingBrands = true;
        update();
        later(() => {
          const result = api.getAllCat();
          A.availableBrands = sortTr(uniqCi(result.map(i => i.brand)));
          A.filteredBrands = A.availableBrands.slice();
          mergeDeviceTypes(uniqCi(result.map(i => i.nature)));
          A.isLoadingBrands = false;
          if (A.showBrandDropdown) filterBrands(A.brandSearchText);
          if (A.showDeviceTypeDropdown) filterDeviceTypes(A.deviceTypeSearchText);
          update();
        }, LOAD_MS + 80);
      }

      function filterBrands(text) {
        A.brandSearchText = text;
        if (text && !isOtherText(text)) A.isOtherBrandSelected = false;
        const q = (text || '').toLowerCase().trim();
        A.filteredBrands = !q ? A.availableBrands : A.availableBrands.filter(b => b.toLowerCase().includes(q));
      }
      function filterDeviceTypes(text) {
        A.deviceTypeSearchText = text;
        if (text && !isOtherText(text)) A.isOtherDeviceTypeSelected = false;
        const q = (text || '').toLowerCase().trim();
        A.filteredDeviceTypes = !q ? A.availableDeviceTypes : A.availableDeviceTypes.filter(d => d.toLowerCase().includes(q));
      }
      function selectBrand(brand) {
        if (brand === 'Other') { A.isOtherBrandSelected = true; A.input.manufacturer = ''; A.brandSearchText = TR.other; }
        else { A.isOtherBrandSelected = false; A.input.manufacturer = brand; A.brandSearchText = brand; }
        A.showBrandDropdown = false;
        const n = el.querySelector('[data-sg="brand"]');
        if (n) n.value = A.brandSearchText;
      }
      function selectDeviceType(t) {
        if (t === 'Other') { A.isOtherDeviceTypeSelected = true; A.input.deviceType = ''; A.deviceTypeSearchText = TR.other; }
        else { A.isOtherDeviceTypeSelected = false; A.input.deviceType = t; A.deviceTypeSearchText = t; }
        A.showDeviceTypeDropdown = false;
        const n = el.querySelector('[data-sg="type"]');
        if (n) n.value = A.deviceTypeSearchText;
      }

      // -------------------------------------------------------------------
      // saveDevice
      // -------------------------------------------------------------------
      function saveDevice() {
        const i = A.input;
        const neg = v => v !== null && v !== undefined && v < 0;
        if (neg(i.uCapacity) || neg(i.power) || neg(i.weight) || neg(i.powerConnections)) { toast(TR.err.negativeNotAllowed, 'error'); return; }
        if (A.isOtherBrandSelected) {
          if (blank(A.manualBrandText)) { toast(TR.err.brandRequired, 'error'); return; }
          i.manufacturer = A.manualBrandText.trim();
        } else if (blank(i.manufacturer)) { toast(TR.err.brandRequired, 'error'); return; }
        if (blank(i.model)) { toast(TR.err.modelRequired, 'error'); return; }
        if (A.isOtherDeviceTypeSelected) {
          if (blank(A.manualDeviceTypeText)) { toast(TR.err.deviceTypeRequired, 'error'); return; }
          i.deviceType = A.manualDeviceTypeText.trim();
        } else if (blank(i.deviceType)) { toast(TR.err.deviceTypeRequired, 'error'); return; }
        if (i.uCapacity === 0 || i.uCapacity === null || i.uCapacity === undefined) { toast(TR.err.uCapacityInvalid, 'error'); return; }

        // getAllCat → aynı model adı var mı?
        const modelLower = i.model.trim().toLowerCase();
        if (api.getAllCat().some(c => c.name && c.name.trim().toLowerCase() === modelLower)) { toast(TR.err.deviceExists, 'warning'); return; }

        const created = api.createCatalogItem(i);
        toast(TR.saved + (created ? ' (' + created.model_id + ' — ' + created.brand + ' ' + created.name + ')' : ''), 'success');
        Object.assign(A, {
          input: emptyInput(), deviceTypeSearchText: '', brandSearchText: '', manualBrandText: '', manualDeviceTypeText: '',
          isOtherBrandSelected: false, isOtherDeviceTypeSelected: false,
          manufacturerTouched: false, manualBrandTouched: false, manualDeviceTypeTouched: false,
          modelTouched: false, deviceTypeTouched: false, uCapacityTouched: false,
          showDeviceTypeDropdown: false, showBrandDropdown: false
        });
        render();
        later(loadBrandsAndDeviceTypesFromDb, 500);
      }

      function goBack() {
        // Orijinal: fromAssetList ? /assets-table-asm-list-dis : /scada-2d
        window.location.href = cabinet ? 'cabinet-detail.html?cabinet=' + encodeURIComponent(cabinet) : '2d.html';
      }

      // -------------------------------------------------------------------
      // Olaylar
      // -------------------------------------------------------------------
      function onFocusIn(e) {
        const k = e.target.getAttribute && e.target.getAttribute('data-sg');
        if (k === 'brand') {
          // openBrandDropdown
          A.showBrandDropdown = true;
          if (!A.availableBrands.length && !A.isLoadingBrands) loadBrandsAndDeviceTypesFromDb();
          filterBrands(A.brandSearchText);
          update();
        } else if (k === 'type') {
          A.showDeviceTypeDropdown = true;
          if (!A.availableDeviceTypes.length && !A.isLoadingDeviceTypes) { loadDeviceTypes(); loadBrandsAndDeviceTypesFromDb(); }
          filterDeviceTypes(A.deviceTypeSearchText);
          update();
        }
      }
      function onFocusOut(e) {
        const t = e.target;
        const sg = t.getAttribute && t.getAttribute('data-sg');
        if (sg === 'brand') {
          later(() => {
            A.showBrandDropdown = false;
            A.manufacturerTouched = true;
            if (A.brandSearchText && A.brandSearchText !== 'Other' && A.brandSearchText !== TR.other) A.input.manufacturer = A.brandSearchText;
            update();
          }, 200);
        } else if (sg === 'type') {
          later(() => {
            A.showDeviceTypeDropdown = false;
            A.deviceTypeTouched = true;
            if (A.deviceTypeSearchText && A.deviceTypeSearchText !== 'Other' && A.deviceTypeSearchText !== TR.other) A.input.deviceType = A.deviceTypeSearchText;
            update();
          }, 200);
        }
        const tx = t.getAttribute && t.getAttribute('data-tx');
        if (tx === 'manualBrand') { A.manualBrandTouched = true; update(); }
        if (tx === 'manualType') { A.manualDeviceTypeTouched = true; update(); }
        if (tx === 'model') { A.modelTouched = true; update(); }
        if (t.getAttribute && t.getAttribute('data-num') === 'uCapacity') { A.uCapacityTouched = true; update(); }
      }
      function onInput(e) {
        const t = e.target;
        const sg = t.getAttribute('data-sg');
        if (sg === 'brand') { filterBrands(t.value); A.showBrandDropdown = true; update(); return; }
        if (sg === 'type') { filterDeviceTypes(t.value); A.showDeviceTypeDropdown = true; update(); return; }
        const tx = t.getAttribute('data-tx');
        if (tx === 'manualBrand') { A.manualBrandText = t.value; update(); return; }
        if (tx === 'manualType') { A.manualDeviceTypeText = t.value; update(); return; }
        if (tx === 'model') { A.input.model = t.value; update(); return; }
        const nk = t.getAttribute('data-num');
        if (nk) { A.input[nk] = t.value === '' ? null : Number(t.value); update(); }
      }
      function onMouseDown(e) {
        const li = e.target.closest('[data-pick]');
        if (!li) return;
        if (li.getAttribute('data-pick') === 'brand') selectBrand(li.getAttribute('data-val'));
        else selectDeviceType(li.getAttribute('data-val'));
        update();
      }
      function onClick(e) {
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.getAttribute('data-act') === 'save') saveDevice();
        else if (act.getAttribute('data-act') === 'back') goBack();
      }

      el.addEventListener('focusin', onFocusIn);
      el.addEventListener('focusout', onFocusOut);
      el.addEventListener('input', onInput);
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('click', onClick);

      // ngOnInit: loadDeviceTypes + loadBrandsAndDeviceTypesFromDb + initializeAssetDeviceAdd (uCapacity = 0)
      A.input.uCapacity = u0 > 0 ? u0 : 0;
      render();
      loadDeviceTypes();
      loadBrandsAndDeviceTypesFromDb();
      // ?brand= listede varsa büyük/küçük harf farkı olmadan listedeki yazımla seç
      if (p.get('brand')) {
        later(() => {
          const hit = A.availableBrands.find(b => b.toLowerCase() === p.get('brand').trim().toLowerCase());
          if (hit) { A.input.manufacturer = hit; A.brandSearchText = hit; setVal('[data-sg="brand"]', hit); }
        }, LOAD_MS + 120);
      }

      return {
        destroy() {
          destroyed = true;
          timers.forEach(t => clearTimeout(t));
          timers.clear();
          el.removeEventListener('focusin', onFocusIn);
          el.removeEventListener('focusout', onFocusOut);
          el.removeEventListener('input', onInput);
          el.removeEventListener('mousedown', onMouseDown);
          el.removeEventListener('click', onClick);
        }
      };
    }
  };
})();
