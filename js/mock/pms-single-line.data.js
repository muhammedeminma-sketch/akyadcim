/* ==========================================================================
   DCIM Sunum — PMS Tek Hat şemaları (pms.html → TEK HAT)
   KURGUSAL tesis: DCA (ana bina, A/B kolları) + DCB (ek bina). Gerçek bir sahanın SCH kaydından
   türetilmemiştir; yerleşim, etiket ve cihaz kimlikleri bu dosyadaki kurucularla (deterministik) çizilir.
   Kenar çubuğu sırası (ENERGY_List_static ağacının sunumdaki karşılığı):
     DCB        → "VERİ MERKEZİ DCB TEK HAT ŞEMASI"        OG giriş-3, TR-5/TR-6, JEN-7, C/D baraları, UPS C/D
     DCA Genel  → "VERİ MERKEZİ DCA TEK HAT ŞEMASI"        OG şalt, TR-1…TR-4, A/B ana baraları, GEN1–GEN6
     DCA A Blok → "VERİ MERKEZİ DCA A BLOK HAT ŞEMASI"     A1/A2 baraları, KDP'ler, UPS A1–A7 girişleri
     DCA B Blok → "VERİ MERKEZİ DCA B BLOK HAT ŞEMASI"     B1/B2 baraları, KDP'ler, UPS B1–B7, chiller
   Satır biçimi (SchemaService.loadSchemaFromNewJsonFormat çıktısının kısaltılmışı; 1 hücre = 40 px):
     ['g'|'t'|'a', id, etiket, devId, x, y, boyut]             jeneratör / trafo / AC kaynak (üst şemadan besleme)
                                                                (x,y sol üst; boyut = genişlik)
     ['s'|'f', id, etiket, devId, x, y, rotation, initialRot]  kesici / sabit bağlantı (x,y merkez; kapalı ⇔ rot = init)
     ['c'|'c2'|'b', id, etiket, devId, x, y, x2, y2, connectedToStart, connectedToEnd]  kablo / kablo:2 / kesikli sınır
     ['l', id, metin, devId, x, y, fontSize]                    serbest etiket
   devId '=' ise öğenin kendi id'sidir. Bağlantılar geometriden çözülür (uç noktası kesici/trafo içinde ya da
   başka bir hattın üstünde). Analizör kimlikleri js/mock/pms.data.js ile aynıdır (devId = analizör + '_DV').
   Canlı ölçümler (U, P, f, I, cosφ) ve senaryo (açık kesici, durum) sunum verisidir — js/pms/single-line.js üretir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = (DCIM.data = DCIM.data || {});

  // ---------------------------------------------------------------------------
  // Şema kurucusu: kablo, kesici, trafo, jeneratör, etiket ve çerçeve satırlarını üretir
  // ---------------------------------------------------------------------------
  function builder(key) {
    const items = [];
    let n = 0;
    const nid = kind => kind + '_' + key + '_' + (++n);
    const api = {
      items,
      cable(x1, y1, x2, y2) { items.push(['c', nid('cable'), 'Kablo', '=', x1, y1, x2, y2, '', '']); },
      /** Dikey kesici (açık: çizimde rot ≠ init). */
      vsw(label, dev, x, y, open) { items.push(['s', nid('switch'), label, dev || '=', x, y, open ? 0 : 90, 90]); },
      /** Yatay kesici (bara kuplajı). */
      hsw(label, dev, x, y, open) { items.push(['s', nid('switch'), label, dev || '=', x, y, open ? 90 : 0, 0]); },
      fixed(label, x, y, vertical) { items.push(['f', nid('switch-sabit'), label, '=', x, y, vertical ? 90 : 0, vertical ? 90 : 0]); },
      /** Trafo / jeneratör: merkezden verilir. */
      tr(label, dev, cx, cy, size) { const s = size || 70; items.push(['t', nid('transformer'), label, dev, cx - s / 2, cy - s / 2, s]); },
      /** Üst şemadan gelen besleme (AC kaynak sembolü). */
      src(label, dev, cx, cy, size) { const s = size || 50; items.push(['a', nid('ac_source'), label, dev || '=', cx - s / 2, cy - s / 2, s]); },
      gen(label, dev, cx, cy, size) { const s = size || 90; items.push(['g', nid('generator'), label, dev, cx - s / 2, cy - s / 2, s]); },
      label(text, x, y, fs) { items.push(['l', nid('label'), text, '=', x, y, fs || 20]); },
      /** Yük etiketi: hat ucunun altında ortalanmış. */
      load(text, x, y) { items.push(['l', nid('label'), text, '=', Math.round(x - text.length * 4), y + 8, 20]); },
      box(x0, y0, x1, y1, title) {
        [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]
          .forEach(s => items.push(['b', nid('line_dashed'), 'Kesikli Çizgi', '=', s[0], s[1], s[2], s[3], '', '']));
        if (title) api.label(title, x0 + 10, y0 + 8, 22);
      },
      /** Baradan aşağı çıkış: bara (y0) → kesici (ySw) → uç (y1) + yük etiketi. */
      drop(x, y0, ySw, y1, sw, dev, load, open) {
        api.cable(x, y0, x, ySw);
        api.vsw(sw, dev, x, ySw, open);
        api.cable(x, ySw, x, y1);
        if (load) api.load(load, x, y1);
      },
      /** Yukarıdan gelen besleme: başlık etiketi (yTop üstü) → kesici → bara. */
      feedIn(x, yTop, ySw, yBus, sw, dev, title, open) {
        if (title) api.load(title, x, yTop - 34);
        api.cable(x, yTop, x, ySw);
        api.vsw(sw, dev, x, ySw, open);
        api.cable(x, ySw, x, yBus);
      }
    };
    return api;
  }

  // ---------------------------------------------------------------------------
  // DCA Genel: OG şalt (iki giriş, kuplaj), TR-1…TR-4, A/B ana baraları (kuplaj açık), jeneratör baraları
  //   A kolu jeneratörleri GEN4–GEN6 haftalık yüksüz testte (senkron barasında, ATS açık),
  //   B kolu GEN1–GEN3 otomatikte hazır (kesiciler açık).
  // ---------------------------------------------------------------------------
  function dcaGenel() {
    const b = builder('gen');
    // OG şalt
    b.box(150, 20, 2290, 360, 'OG ŞALT MERKEZİ · 34,5 kV');
    b.feedIn(560, 60, 100, 150, 'K01', '=', 'OG GİRİŞ-1');
    b.feedIn(1860, 60, 100, 150, 'K02', '=', 'OG GİRİŞ-2');
    b.cable(200, 150, 1220, 150);
    b.hsw('K03', '=', 1220, 150, false);
    b.cable(1220, 150, 2240, 150);
    const trs = [
      { x: 330, tr: 'TR-1', dev: 'DCA_TR1_DV', og: 'K11', q: 'Q1', qd: 'DCA_A_TR1_Q1_DV' },
      { x: 830, tr: 'TR-2', dev: 'DCA_TR2_DV', og: 'K12', q: 'Q2', qd: 'DCA_A_TR2_Q2_DV' },
      { x: 1610, tr: 'TR-3', dev: 'DCA_TR3_DV', og: 'K13', q: 'Q3', qd: 'DCA_B_TR3_Q3_DV' },
      { x: 2110, tr: 'TR-4', dev: 'DCA_TR4_DV', og: 'K14', q: 'Q4', qd: 'DCA_B_TR4_Q4_DV' }
    ];
    trs.forEach(t => {
      b.cable(t.x, 150, t.x, 205);
      b.vsw(t.og, '=', t.x, 205);
      b.cable(t.x, 205, t.x, 265);
      b.tr(t.tr, t.dev, t.x, 300, 70);
      b.cable(t.x, 335, t.x, 410);
      b.vsw(t.q, t.qd, t.x, 410);
      b.cable(t.x, 410, t.x, 480);
    });
    // AG ana baraları + kuplaj (normalde açık)
    b.cable(160, 480, 1220, 480);
    b.hsw('Q20', 'DCA_A_KUPLAJ_Q20_DV', 1220, 480, true);
    b.cable(1220, 480, 2280, 480);
    b.label('A KOLU AG ANA BARASI', 770, 496, 20);
    b.label('B KOLU AG ANA BARASI', 1500, 496, 20);
    // A kolu çıkışları
    b.drop(220, 480, 590, 700, 'Q15', 'DCA_A_TR1_KOMP_Q15_DV', 'KOMP. PANOSU-1');
    b.drop(400, 480, 590, 700, 'Q11', 'DCA_A_ANA_CIKIS1_Q11_DV', 'A BLOK GİRİŞ-1');
    b.drop(580, 480, 590, 700, 'Q12', 'DCA_A_ANA_CIKIS2_Q12_DV', 'A BLOK GİRİŞ-2');
    b.drop(720, 480, 590, 700, 'Q16', 'DCA_A_TR2_KOMP_Q16_DV', 'KOMP. PANOSU-2');
    b.drop(960, 480, 590, 700, 'Q39', 'DCA_A_DCB_BESLEME_Q39_DV', 'DCB BESLEME');
    // B kolu çıkışları
    b.drop(1480, 480, 590, 700, 'Q17', 'DCA_B_TR3_KOMP_Q17_DV', 'KOMP. PANOSU-3');
    b.drop(1720, 480, 590, 700, 'Q61', 'DCA_B_ANA_CIKIS1_Q61_DV', 'B BLOK GİRİŞ-1');
    b.drop(1900, 480, 590, 700, 'Q62', 'DCA_B_ANA_CIKIS2_Q62_DV', 'B BLOK GİRİŞ-2');
    b.drop(2160, 480, 590, 700, 'Q18', 'DCA_B_TR4_KOMP_Q18_DV', 'KOMP. PANOSU-4');
    // Jeneratör baraları ve ATS (açık)
    b.cable(1100, 480, 1100, 640);
    b.vsw('Q19', '=', 1100, 640, true);
    b.cable(1100, 640, 1100, 840);
    b.cable(1340, 480, 1340, 640);
    b.vsw('Q69', '=', 1340, 640, true);
    b.cable(1340, 640, 1340, 840);
    b.box(150, 770, 2290, 1110, 'JENERATÖR SAHASI · 0,4 kV');
    b.cable(200, 840, 1100, 840);
    b.cable(1340, 840, 2240, 840);
    b.label('A JEN. SENKRON BARASI', 200, 812, 20);
    b.label('B JEN. SENKRON BARASI', 1880, 812, 20);
    [['GEN-4', 'DCA_GEN4_DV', 'Q5', 'DCA_A_GEN4_Q5_DV', 340], ['GEN-5', 'DCA_GEN5_DV', 'Q6', 'DCA_A_GEN5_Q6_DV', 600], ['GEN-6', 'DCA_GEN6_DV', 'Q7', 'DCA_A_GEN6_Q7_DV', 860]]
      .forEach(g => { b.cable(g[4], 840, g[4], 925); b.vsw(g[2], g[3], g[4], 925); b.cable(g[4], 925, g[4], 990); b.gen(g[0], g[1], g[4], 1035, 90); });
    [['GEN-1', 'DCA_GEN1_DV', 'Q8', 'DCA_B_GEN1_Q8_DV', 1500], ['GEN-2', 'DCA_GEN2_DV', 'Q10', 'DCA_B_GEN2_Q10_DV', 1760], ['GEN-3', 'DCA_GEN3_DV', 'Q9', 'DCA_B_GEN3_Q9_DV', 2020]]
      .forEach(g => { b.cable(g[4], 840, g[4], 925); b.vsw(g[2], g[3], g[4], 925, true); b.cable(g[4], 925, g[4], 990); b.gen(g[0], g[1], g[4], 1035, 90); });
    return b.items;
  }

  // ---------------------------------------------------------------------------
  // DCA A / B Blok: iki giriş (Genel'den), iki yarım bara + kuplaj (açık), kat dağıtım panoları (KDP),
  //   Kat-1 KDP'lerinden UPS girişleri ve klima panoları; Kat-2/Kat-3 KDP'leri kat panolarına çıkar.
  // ---------------------------------------------------------------------------
  function dcaBlok(side) {
    const A = side === 'A';
    const s = A ? 'A' : 'B';
    const b = builder(A ? 'blka' : 'blkb');
    const dv = id => 'DCA_' + s + '_' + id + '_DV';
    // Girişler ve yarım baralar
    b.src('DCA GENEL ' + (A ? 'Q11' : 'Q61'), '', A ? 420 : 300, 45, 50);
    b.src('DCA GENEL ' + (A ? 'Q12' : 'Q62'), '', A ? 1620 : 1500, 45, 50);
    b.feedIn(A ? 420 : 300, 70, 140, 230, A ? 'Q13' : 'Q63', dv(A ? 'BLOK_GIRIS1_Q13' : 'BLOK_GIRIS1_Q63'), '');
    b.feedIn(A ? 1620 : 1500, 70, 140, 230, A ? 'Q14' : 'Q64', dv(A ? 'BLOK_GIRIS2_Q14' : 'BLOK_GIRIS2_Q64'), '');
    b.cable(120, 230, 1200, 230);
    b.hsw(A ? 'Q25' : 'Q70', A ? '=' : 'DCA_B_KUPLAJ_Q70_DV', 1200, 230, true);
    b.cable(1200, 230, 2280, 230);
    b.label(s + '1 YARIM BARASI', 130, 246, 20);
    b.label(s + '2 YARIM BARASI', 2080, 246, 20);

    // 1. yarım bara çıkışları
    const k = A ? { k1: 'Q31', k2: 'Q33', k3: 'Q36', k1b: 'Q32', k2b: 'Q34', k3b: 'Q35' }
      : { k1: 'Q81', k2: 'Q83', k3: 'Q85', k1b: 'Q82', k2b: 'Q84', k3b: 'Q86' };
    if (A) {
      b.drop(200, 230, 330, 440, 'Q41', 'DCA_A_AYDINLATMA_Q41_DV', 'AYDINLATMA');
      b.drop(330, 230, 330, 440, 'Q42', 'DCA_A_REDRESOR_Q42_DV', 'REDRESÖR 48V');
    } else {
      b.drop(200, 230, 330, 440, 'Q89', 'DCA_B_CHILLER1_Q89_DV', 'CHILLER-1');
      b.drop(330, 230, 330, 440, 'Q90', 'DCA_B_KLIMA_PANO_Q90_DV', 'KLİMA PANOSU');
    }
    b.drop(840, 230, 330, 440, k.k2, dv('KAT2_KDP1_' + k.k2), 'KAT-2 KDP-' + s + '1');
    b.drop(1020, 230, 330, 440, k.k3, dv('KAT3_KDP1_' + k.k3), 'KAT-3 KDP-' + s + '1');
    // Kat-1 KDP-1 → UPS 1–4 + klima panosu
    b.cable(480, 230, 480, 330);
    b.vsw(k.k1, dv('KAT1_KDP1_' + k.k1), 480, 330);
    b.cable(480, 330, 480, 580);
    b.box(460, 520, 1180, 860, 'KAT-1 KDP-' + s + '1');
    b.cable(480, 580, 1140, 580);
    [1, 2, 3, 4].forEach((u, i) => b.drop(580 + i * 140, 580, 680, 790, 'Q' + ((A ? 100 : 140) + u), 'DCA_' + s + '_K1_UPS' + s + u + '_GIR_DV', 'UPS ' + s + u));
    b.drop(1140, 580, 680, 790, 'Q' + (A ? 109 : 149), 'DCA_' + s + '_K1_KLMP' + s + '1_DV', s + '1 KLİMA P.');

    // 2. yarım bara çıkışları
    b.cable(1380, 230, 1380, 330);
    b.vsw(k.k1b, dv('KAT1_KDP2_' + k.k1b), 1380, 330);
    b.cable(1380, 330, 1380, 580);
    b.box(1360, 520, 2080, 860, 'KAT-1 KDP-' + s + '2');
    b.cable(1380, 580, 2040, 580);
    [5, 6, 7].forEach((u, i) => b.drop(1480 + i * 140, 580, 680, 790, 'Q' + ((A ? 100 : 140) + u), 'DCA_' + s + '_K1_UPS' + s + u + '_GIR_DV', 'UPS ' + s + u));
    b.drop(1900, 580, 680, 790, 'Q' + (A ? 108 : 148), 'DCA_' + s + '_K1_KLMP' + s + '2_DV', s + '2 KLİMA P.');
    b.drop(2040, 580, 680, 790, 'Q' + (A ? 110 : 150), '=', 'YEDEK');
    b.drop(1760, 230, 330, 440, k.k2b, dv('KAT2_KDP2_' + k.k2b), 'KAT-2 KDP-' + s + '2');
    b.drop(1940, 230, 330, 440, k.k3b, dv('KAT3_KDP2_' + k.k3b), 'KAT-3 KDP-' + s + '2');
    if (!A) b.drop(2120, 230, 330, 440, 'Q91', 'DCA_B_YANGIN_POMPA_Q91_DV', 'YANGIN POMPASI');
    return b.items;
  }

  // ---------------------------------------------------------------------------
  // DCB (ek bina): DCA'dan besleme (Q39 → Q201), OG giriş-3 → TR-5 / TR-6, JEN-7 (otomatikte hazır),
  //   C ve D baraları (kuplaj açık), UPS C1/C2 ve D1/D2 girişleri, klima ve yardımcı yükler
  // ---------------------------------------------------------------------------
  function dcb() {
    const b = builder('dcb');
    b.box(660, 0, 1760, 400, 'DCB OG HÜCRELERİ');
    b.feedIn(1210, 70, 110, 150, 'K21', '=', 'OG GİRİŞ-3');
    b.cable(760, 150, 1660, 150);
    [{ x: 900, og: 'K22', tr: 'TR-5', dev: 'DCB_TR5_DV', q: 'Q205', qd: 'DCB_TR5_Q205_DV' },
      { x: 1520, og: 'K23', tr: 'TR-6', dev: 'DCB_TR6_DV', q: 'Q206', qd: 'DCB_TR6_Q206_DV' }].forEach(t => {
      b.cable(t.x, 150, t.x, 200);
      b.vsw(t.og, '=', t.x, 200);
      b.cable(t.x, 200, t.x, 255);
      b.tr(t.tr, t.dev, t.x, 290, 70);
      b.cable(t.x, 325, t.x, 450);
      b.vsw(t.q, t.qd, t.x, 450);
      b.cable(t.x, 450, t.x, 540);
    });
    // DCA'dan besleme (yedek kaynak, normalde kapalı) ve JEN-7
    b.src("DCA GENEL Q39", '', 300, 175, 50);
    b.feedIn(300, 200, 330, 540, 'Q201', 'DCB_DCA_BESLEME_Q201_DV', '');
    b.gen('JEN-7', 'DCB_JEN7_DV', 2120, 245, 90);
    b.cable(2120, 290, 2120, 400);
    b.vsw('Q207', 'DCB_JEN7_Q207_DV', 2120, 400, true);
    b.cable(2120, 400, 2120, 540);
    // C / D baraları
    b.cable(160, 540, 1220, 540);
    b.hsw('Q210', 'DCB_KUPLAJ_Q210_DV', 1220, 540, true);
    b.cable(1220, 540, 2240, 540);
    b.label('C BARASI', 170, 556, 20);
    b.label('D BARASI', 2120, 556, 20);
    b.drop(220, 540, 650, 760, 'Q211', 'DCB_UPSC1_GIR_DV', 'UPS C1');
    b.drop(400, 540, 650, 760, 'Q212', 'DCB_UPSC2_GIR_DV', 'UPS C2');
    b.drop(580, 540, 650, 760, 'Q213', 'DCB_KLMP_C_DV', 'KLİMA P.-C');
    b.drop(760, 540, 650, 760, 'Q214', 'DCB_AYD_C_DV', 'AYDINLATMA');
    b.drop(1060, 540, 650, 760, 'Q215', 'DCB_RED_C_DV', 'REDRESÖR C');
    b.drop(1380, 540, 650, 760, 'Q221', 'DCB_UPSD1_GIR_DV', 'UPS D1');
    b.drop(1560, 540, 650, 760, 'Q222', 'DCB_UPSD2_GIR_DV', 'UPS D2');
    b.drop(1740, 540, 650, 760, 'Q223', 'DCB_KLMP_D_DV', 'KLİMA P.-D');
    b.drop(1920, 540, 650, 760, 'Q224', 'DCB_YANGIN_D_DV', 'YANGIN POMPASI');
    b.box(150, 500, 2290, 820, '');
    return b.items;
  }

  /** Açılış görünümü: içerik sınırı + üstte HUD başlığı, altta lejant için pay (SCH kayıtlı viewBox karşılığı). */
  function viewBoxOf(items) {
    const xs = [], ys = [];
    items.forEach(r => {
      if (r[0] === 'c' || r[0] === 'c2' || r[0] === 'b') { xs.push(r[4], r[6]); ys.push(r[5], r[7]); }
      else if (r[0] === 'g' || r[0] === 't' || r[0] === 'a') { xs.push(r[4], r[4] + r[6] + 90); ys.push(r[5], r[5] + r[6]); }
      else if (r[0] === 'l') { xs.push(r[4], r[4] + String(r[2]).length * 9); ys.push(r[5], r[5] + 16); }
      else { xs.push(r[4] - 20, r[4] + 70); ys.push(r[5] - 20, r[5] + 20); }
    });
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const w = x1 - x0, h = y1 - y0;
    return [x0 - 40, y0 - Math.round(h * 0.07) - 30, w + 80, h + Math.round(h * 0.25) + 60];
  }

  const schemas = [
    { id: 'DCB', label: 'DCB', schId: 'EN0101010100000000', title: 'VERİ MERKEZİ DCB TEK HAT ŞEMASI', viewBox: null, items: dcb() },
    { id: 'DCA-GENEL', label: 'DCA Genel', schId: 'EN0101010201000000', title: 'VERİ MERKEZİ DCA TEK HAT ŞEMASI', viewBox: null, items: dcaGenel() },
    { id: 'DCA-A', label: 'DCA A Blok', schId: 'EN0101010202000000', title: 'VERİ MERKEZİ DCA A BLOK HAT ŞEMASI', viewBox: null, items: dcaBlok('A') },
    { id: 'DCA-B', label: 'DCA B Blok', schId: 'EN0101010203000000', title: 'VERİ MERKEZİ DCA B BLOK HAT ŞEMASI', viewBox: null, items: dcaBlok('B') }
  ];
  schemas.forEach(sc => { sc.viewBox = viewBoxOf(sc.items); });

  // Sunum senaryosu (şema başına): varsayılan işletmeden sapmalar ve öğe durum metinleri.
  //  open   : açık çizilecek kesiciler (devId) — örn. TRIP ile açan kesici; aşağı akış enerjisiz kalır
  //  status : öğe durum metni (SchemaService statusText karşılığı; ALARM/UYARI/ACİL/BAĞLANAMADI → önem halkası)
  //  overload: aşırı yüklü kesiciler (ölçümde P/I yüksek)   stale: ölçümü gelmeyen cihazlar (değerler '—')
  const scenario = {
    'DCB': { open: [], status: { 'DCB_TR6_DV': 'UYARI' }, overload: [], stale: [] },
    'DCA-GENEL': { open: [], status: {}, overload: [], stale: ['DCA_B_GEN3_Q9_DV'] },
    'DCA-A': { open: ['DCA_A_KAT3_KDP1_Q36_DV'], status: {}, overload: [], stale: [] },
    'DCA-B': { open: [], status: {}, overload: ['DCA_B_CHILLER1_Q89_DV'], stale: [] }
  };

  // Güç alarmı önerileri (PMS sayfası alarm listesi/kenar çubuğu durumu için). schemaId = resolve(rid).schemaId.
  // Önem: 'acil' | 'alarm' | 'uyari' | 'veri-yok' (K-07: beş önem rengi yalnız alarmda).
  const demoAlarms = [
    { rid: 'DCA_A_KAT3_KDP1_Q36_DV_TRIP', devId: 'DCA_A_KAT3_KDP1_Q36_DV', schemaId: 'DCA-A', severity: 'acil',
      title: 'Q36 kesici açtı (TRIP)', text: 'DCA A Blok Kat-3 KDP-A1 Q36 kesici açtı (TRIP) — çıkış enerjisiz', minutesAgo: 6 },
    { rid: 'DCA_B_CHILLER1_Q89_DV_OVL', devId: 'DCA_B_CHILLER1_Q89_DV', schemaId: 'DCA-B', severity: 'alarm',
      title: 'Q89 aşırı akım', text: 'DCA B Blok Chiller-1 Q89 aşırı akım (In %108)', minutesAgo: 14 },
    { rid: 'DCA_B_GEN3_Q9_DV_devsta', devId: 'DCA_B_GEN3_Q9_DV', schemaId: 'DCA-GENEL', severity: 'veri-yok',
      title: 'Jeneratör-3 Q9 haberleşme kaybı', text: 'DCA B Jeneratör-3 Q9 haberleşme kaybı', minutesAgo: 23 },
    { rid: 'DCB_TR6_DV_WTEMP', devId: 'DCB_TR6_DV', schemaId: 'DCB', severity: 'uyari',
      title: 'TR-6 sargı sıcaklığı yüksek', text: 'DCB TR-6 trafo sargı sıcaklığı yüksek (96 °C)', minutesAgo: 41 }
  ];

  // Şema başına cihaz listesi (jeneratör, trafo, kesici): PMS sayfası tutarlı güç alarmı üretebilsin.
  const KIND = { g: 'generator', t: 'transformer', s: 'switch' };
  const devices = {};
  schemas.forEach(s => {
    devices[s.id] = s.items.filter(i => KIND[i[0]]).map(i => ({ devId: i[3] === '=' ? i[1] : i[3], label: i[2], kind: KIND[i[0]] }));
  });

  D.pmsSingleLine = { schemas, scenario, demoAlarms, devices };
})();
