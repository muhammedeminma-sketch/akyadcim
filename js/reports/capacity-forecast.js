/* ==========================================================================
   DCIM Sunum — Kapasite Tahmini (NewUICMPCapacityForecastComponent, /dcim/reports/capacity-forecast)
   Boyutlar: Enerji (IT gücü), Soğutma (ısı yükü), Yer (U), Ağırlık, Kabin sayısı, Sıcaklık.
   Seviyeler: Genel / Salon / POD / Kabin. Geçmiş penceresi 90/180/365 gün, ufuk 6/12/24 ay.
   Algoritmalar orijinalden birebir (forecast.util.ts + forecast.models.ts):
     - Tablo satırları: düğüm başına en küçük kareler doğrusu (HIS_Forecast_Nodes'un SQL istatistiği)
     - Seçili satır: Doğrusal, Theil–Sen, Holt (sönümlü), Holt–Winters (haftalık) → geri test (WAPE) ile otomatik seçim,
       tahmin aralıkları %50/%80/%95, "Model analizi" paneli
     - 2D: ECharts (günlük, 7 günlük ortalama, tahmin + bantlar, eşik/kapasite bölgeleri, kesişim işaretleri)
     - 3D: "olasılık dağları" (forecast-chart-3d.component) — Three.js (vendor/three.bundle.min.js, gerektiğinde yüklenir);
       her gelecek ayın normal tahmin dağılımı, eşiği aşma olasılığı. WebGL yoksa ECharts ısı haritası.
     - "Ne Zaman Doluyor" (salonların eşiğe kalan süresi), İş Emri Talebi (kabin sayısı), Salon Limitleri (CAP_LIMIT)
   Veri: kurgusal bina (DCIM_FLOOR_LAYOUTS + DCIM.data kabinleri) üzerinde tohumlu 365 günlük geçmiş seriler.
   Derin bağlantılar: reports.html?metric=cabinets&level=salon&node=K2S2#capacity-forecast, ?chart=3d, ?limits=1,
     ?node=1DU06 (kabin seviyesi), ?window=365, ?horizon=24
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // ======================================================================
  // forecast.util.ts
  // ======================================================================
  const Z50 = 0.674, Z80 = 1.282, Z95 = 1.96;

  function fitLine(points) {
    const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, xLast = -Infinity;
    for (const p of pts) {
      sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y;
      if (p.x > xLast) xLast = p.x;
    }
    const den = n * sxx - sx * sx;
    if (den === 0) return null;
    const slope = (n * sxy - sx * sy) / den;
    const intercept = (sy - slope * sx) / n;
    const r2den = den * (n * syy - sy * sy);
    const r2 = r2den > 0 ? Math.pow(n * sxy - sx * sy, 2) / r2den : null;
    const sse = Math.abs(syy - intercept * sy - slope * sxy);
    const sd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
    return { n, slope, intercept, r2, sd, xLast, xMean: sx / n, sxx: den / n };
  }

  function predictionSe(fit, x) {
    if (fit.xMean === undefined || !fit.sxx || fit.n < 3) return fit.sd;
    return fit.sd * Math.sqrt(1 + 1 / fit.n + Math.pow(x - fit.xMean, 2) / fit.sxx);
  }

  function daysToReach(fit, fittedNow, current, target) {
    if (current !== null && current >= target) return 0;
    if (fittedNow >= target) return 0;
    if (fit.slope <= 0) return null;
    return (target - fittedNow) / fit.slope;
  }

  function forecast(fit, current, capacity, thresholdValue, horizonDays) {
    const fittedNow = fit.intercept + fit.slope * fit.xLast;
    const horizonValue = fittedNow + fit.slope * horizonDays;
    const cap = capacity !== null && capacity > 0 ? capacity : null;
    return {
      current, fittedNow, capacity: cap, threshold: thresholdValue,
      usagePct: cap !== null && current !== null ? (current / cap) * 100 : null,
      monthlyGrowth: fit.slope * 30,
      daysToThreshold: thresholdValue !== null ? daysToReach(fit, fittedNow, current, thresholdValue) : null,
      daysToFull: cap !== null ? daysToReach(fit, fittedNow, current, cap) : null,
      horizonValue,
      horizonPct: cap !== null ? (horizonValue / cap) * 100 : null
    };
  }

  function movingAverage(values, w) {
    w = w || 7;
    const out = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= w) sum -= values[i - w];
      out.push(sum / Math.min(i + 1, w));
    }
    return out;
  }

  function addDays(d, days) {
    const r = new Date(d.getTime());
    r.setDate(r.getDate() + Math.round(days));
    return r;
  }
  const p2 = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  function parseYmd(s) { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }

  function locationLevel(fullName) {
    const seg = (fullName || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(s => s.length > 0);
    const fi = seg.findIndex(s => s.toUpperCase().includes('FLOOR') || s.toUpperCase().includes('KAT'));
    if (fi === -1) return 'site';
    const depth = seg.length - fi - 1;
    if (depth === 1) return 'salon';
    if (depth === 2) return 'pod';
    return depth === 0 ? 'site' : 'other';
  }
  function locationLabel(fullName) {
    const seg = (fullName || '').replace(/\\/g, '/').split('/').map(s => s.trim()).filter(s => s.length > 0);
    const fi = seg.findIndex(s => s.toUpperCase().includes('FLOOR') || s.toUpperCase().includes('KAT'));
    if (fi === -1) return seg.slice(-2).join(' / ') || fullName;
    return seg.slice(Math.max(0, fi - 1)).join(' / ');
  }

  // ======================================================================
  // forecast.models.ts — çoklu model + geri testle otomatik seçim
  // ======================================================================
  const MODEL_KEYS = ['linear', 'theilsen', 'holt', 'hw'];

  function median(a) {
    const s = a.slice().sort((p, q) => p - q);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function fitLinear(pts) {
    const f = fitLine(pts);
    if (!f) return null;
    return { params: '', at: h => { const x = f.xLast + h; return { y: f.intercept + f.slope * x, se: predictionSe(f, x) }; } };
  }

  function fitTheilSen(pts) {
    const n = pts.length;
    if (n < 3) return null;
    const step = Math.max(1, Math.ceil(n / 280));
    const s = pts.filter((_, i) => i % step === 0);
    const slopes = [];
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j < s.length; j++)
        if (s[j].x !== s[i].x) slopes.push((s[j].y - s[i].y) / (s[j].x - s[i].x));
    if (!slopes.length) return null;
    const b = median(slopes);
    const a = median(pts.map(p => p.y - b * p.x));
    const xLast = Math.max.apply(null, pts.map(p => p.x));
    const xMean = pts.reduce((t, p) => t + p.x, 0) / n;
    const sxx = pts.reduce((t, p) => t + Math.pow(p.x - xMean, 2), 0);
    const sd = Math.sqrt(pts.reduce((t, p) => t + Math.pow(p.y - a - b * p.x, 2), 0) / Math.max(1, n - 2));
    return {
      params: '',
      at: h => {
        const x = xLast + h;
        const se = sxx > 0 ? sd * Math.sqrt(1 + 1 / n + Math.pow(x - xMean, 2) / sxx) : sd;
        return { y: a + b * x, se };
      }
    };
  }

  function daily(pts) {
    const s = pts.slice().sort((a, b) => a.x - b.x);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      if (i > 0) {
        const gap = s[i].x - s[i - 1].x;
        for (let k = 1; k < gap; k++) out.push(s[i - 1].y + (s[i].y - s[i - 1].y) * k / gap);
      }
      out.push(s[i].y);
    }
    return out;
  }

  function fitHolt(y) {
    const n = y.length;
    if (n < 14) return null;
    const k = Math.min(7, n - 1);
    let best = null;
    for (const a of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9])
      for (const b of [0.01, 0.05, 0.1, 0.2])
        for (const f of [0.9, 0.95, 0.98, 1]) {
          let l = y[0], t = (y[k] - y[0]) / k, sse = 0;
          for (let i = 1; i < n; i++) {
            const pred = l + f * t;
            const e = y[i] - pred;
            sse += e * e;
            const lp = l;
            l = pred + a * e;
            t = b * (l - lp) + (1 - b) * f * t;
          }
          if (!best || sse < best.sse) best = { sse, a, b, f, l, t };
        }
    if (!best) return null;
    const { a, b, f, l, t } = best;
    const sd = Math.sqrt(best.sse / Math.max(1, n - 4));
    return {
      params: 'α=' + a + ' β=' + b + ' φ=' + f,
      at: h => {
        let phiSum = 0, varSum = 1, pj = 0;
        for (let j = 1; j <= h; j++) phiSum += Math.pow(f, j);
        for (let j = 1; j < h; j++) { pj += Math.pow(f, j); varSum += Math.pow(a * (1 + b * pj), 2); }
        return { y: l + phiSum * t, se: sd * Math.sqrt(varSum) };
      }
    };
  }

  function fitHoltWinters(y, m) {
    m = m || 7;
    const n = y.length;
    if (n < 4 * m) return null;
    const mean = i0 => { let s = 0; for (let i = i0; i < i0 + m; i++) s += y[i]; return s / m; };
    const m1 = mean(0), m2 = mean(m);
    let best = null;
    for (const a of [0.1, 0.3, 0.5, 0.7])
      for (const b of [0.01, 0.05, 0.1])
        for (const g of [0.05, 0.1, 0.3])
          for (const f of [0.95, 0.98, 1]) {
            const s = [];
            for (let i = 0; i < m; i++) s.push(y[i] - m1);
            let l = m1, t = (m2 - m1) / m, sse = 0;
            for (let i = m; i < n; i++) {
              const si = s[i - m];
              const pred = l + f * t + si;
              const e = y[i] - pred;
              sse += e * e;
              const lp = l;
              l = a * (y[i] - si) + (1 - a) * (lp + f * t);
              t = b * (l - lp) + (1 - b) * f * t;
              s.push(g * (y[i] - l) + (1 - g) * si);
            }
            if (!best || sse < best.sse) best = { sse, a, b, g, f, l, t, s };
          }
    if (!best) return null;
    const { a, b, g, f, l, t, s } = best;
    const sd = Math.sqrt(best.sse / Math.max(1, n - m - 5));
    return {
      params: 'α=' + a + ' β=' + b + ' γ=' + g + ' φ=' + f,
      at: h => {
        let phiSum = 0, varSum = 1, pj = 0;
        for (let j = 1; j <= h; j++) phiSum += Math.pow(f, j);
        for (let j = 1; j < h; j++) { pj += Math.pow(f, j); varSum += Math.pow(a * (1 + b * pj) + (j % m === 0 ? g : 0), 2); }
        const season = h <= 0 ? s[s.length - 1] : s[s.length - m + ((h - 1) % m)];
        return { y: l + phiSum * t + season, se: sd * Math.sqrt(varSum) };
      }
    };
  }

  function fitModel(key, pts) {
    switch (key) {
      case 'linear': return fitLinear(pts);
      case 'theilsen': return fitTheilSen(pts);
      case 'holt': return fitHolt(daily(pts));
      case 'hw': return fitHoltWinters(daily(pts));
    }
    return null;
  }

  function analyze(points) {
    const pts = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
    if (pts.length < 2) return null;
    const xLast = pts[pts.length - 1].x;
    const span = xLast - pts[0].x;
    const holdoutDays = Math.min(90, Math.floor(span / 3));
    const scores = [];
    if (holdoutDays >= 7) {
      const cut = xLast - holdoutDays;
      const train = pts.filter(p => p.x <= cut), test = pts.filter(p => p.x > cut);
      const sum = test.reduce((t, p) => t + Math.abs(p.y), 0);
      for (const key of MODEL_KEYS) {
        const f = train.length >= 14 && sum > 0 ? fitModel(key, train) : null;
        if (!f) { scores.push({ key, error: null, params: '' }); continue; }
        let err = 0;
        for (const p of test) err += Math.abs(p.y - f.at(p.x - cut).y);
        scores.push({ key, error: err / sum * 100, params: f.params });
      }
    } else {
      for (const key of MODEL_KEYS) scores.push({ key, error: null, params: '' });
    }
    let best = 'linear', bestErr = null;
    for (const sc of scores) {
      if (sc.error === null) continue;
      if (bestErr === null || sc.error < bestErr - 0.1) { best = sc.key; bestErr = sc.error; }
    }
    let full = fitModel(best, pts);
    if (!full) { best = 'linear'; bestErr = scores[0].error; full = fitModel('linear', pts); }
    if (!full) return null;
    const fitted = full;
    return {
      best, scores, error: bestErr, holdoutDays, trainDays: holdoutDays >= 7 ? span - holdoutDays : span, nObs: pts.length,
      level: bestErr === null ? null : bestErr < 5 ? 'high' : bestErr < 15 ? 'medium' : 'low',
      params: fitted.params, fittedNow: fitted.at(0).y, at: h => fitted.at(h)
    };
  }

  function analysisProjection(a, lastDate, horizonDays, stepDays) {
    stepDays = stepDays || 7;
    const out = [];
    const point = d => {
      const r = a.at(d);
      const y = r.y, se = r.se;
      return { date: addDays(lastDate, d), y, lo50: y - Z50 * se, hi50: y + Z50 * se, lo80: y - Z80 * se, hi80: y + Z80 * se, lo: y - Z95 * se, hi: y + Z95 * se };
    };
    for (let d = 0; d <= horizonDays; d += stepDays) out.push(point(d));
    if (horizonDays % stepDays !== 0) out.push(point(horizonDays));
    return out;
  }

  function daysTo(a, current, target) {
    if (current !== null && current >= target) return 0;
    if (a.fittedNow >= target) return 0;
    for (let h = 1; h <= 3650; h++) if (a.at(h).y >= target) return h;
    return null;
  }

  function analysisForecast(a, current, capacity, threshold, horizonDays) {
    const cap = capacity !== null && capacity > 0 ? capacity : null;
    const horizonValue = a.at(horizonDays).y;
    return {
      current, fittedNow: a.fittedNow, capacity: cap, threshold,
      usagePct: cap !== null && current !== null ? (current / cap) * 100 : null,
      monthlyGrowth: horizonDays > 0 ? (horizonValue - a.fittedNow) / horizonDays * 30 : 0,
      daysToThreshold: threshold !== null ? daysTo(a, current, threshold) : null,
      daysToFull: cap !== null ? daysTo(a, current, cap) : null,
      horizonValue,
      horizonPct: cap !== null ? (horizonValue / cap) * 100 : null
    };
  }

  function shiftAnalysis(a, d) {
    return Object.assign({}, a, { fittedNow: a.fittedNow + d, at: h => { const p = a.at(h); return { y: p.y + d, se: p.se }; } });
  }

  // forecast-chart-3d.component.ts
  function normCdf(z) {
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function pAbove(mean, se, target) {
    if (!(se > 0)) return mean >= target ? 1 : 0;
    return 1 - normCdf((target - mean) / se);
  }
  const pctTxt = p => p < 0.01 && p > 0 ? '<1' : p > 0.99 && p < 1 ? '>99' : String(Math.round(p * 100));

  // ======================================================================
  // messages.tr.json → reportCapacityForecast.*
  // ======================================================================
  const T = {
    title: 'Kapasite Tahmini',
    subtitle: 'Geçmiş eğilime göre yer, enerji, soğutma ve ağırlık kapasitesinin ne zaman dolacağı',
    refresh: 'Yenile', exportExcel: "Excel'e Aktar", filters: 'Tahmin Ayarları',
    metric: 'Boyut', level: 'Seviye', window: 'Geçmiş Penceresi', horizon: 'Tahmin Ufku',
    thresholdPct: 'Uyarı Eşiği (%)', tempLimit: 'Sıcaklık Eşiği (°C)', agg: 'Değer Tipi', aggMax: 'Günlük tepe', aggAvg: 'Günlük ortalama',
    coolingCapacity: 'Soğutma Kapasitesi (kW)', days: 'gün', months: 'ay', month: 'ay', loading: 'Yükleniyor...',
    noData: 'Seçilen ayarlar için geçmiş veri bulunamadı.', noCapacity: 'Kapasite bilgisi yok (limit tanımlı değil)',
    exceeded: 'Eşik aşıldı', notReached: 'Bu eğilimle ulaşılmıyor', beyondHorizon: '· ufuk dışında',
    threshold: 'Eşik', capacity: 'Kapasite', today: 'Bugün', daily: 'Günlük değer', avg7: '7 günlük ortalama', forecastLine: 'Tahmin',
    remainingCap: 'Kalan pay', toThresholdIn: 'Eşiğe', saveImage: 'PNG olarak indir',
    chartNote: 'Gölgeli alan %50 / %80 / %95 tahmin aralığıdır ve ufuk uzadıkça genişler. Arka plan: yeşil normal, sarı eşik üstü, kırmızı kapasite üstü. 3D görünümde grafiği sürükleyerek çevirin, tekerlekle yakınlaştırın; ↻ görünümü sıfırlar.',
    tableHint: 'En erken eşiğe ulaşacak konum en üstte (liste düğüm başına doğrusal eğilimle sıralanır; seçili satır seçilen modelle hesaplanır). Satıra tıklayınca grafik güncellenir.',
    unitCab: 'kabin', pendingShort: 'bekleyen iş emri', committedShort: 'Taahhüt dahil', committed: 'Taahhüt dahil tahmin',
    metrics: { energy: 'Enerji (IT gücü)', cooling: 'Soğutma (ısı yükü)', space: 'Yer (U)', weight: 'Ağırlık', cabinets: 'Kabin sayısı', temp: 'Sıcaklık' },
    levels: { general: 'Genel', salon: 'Salon', pod: 'POD', cabinet: 'Kabin' },
    cards: { current: 'Mevcut', monthlyGrowth: 'Aylık Artış', toThreshold: 'Eşiğe Kalan Süre', toFull: 'Dolmaya Kalan Süre', confidence: 'Model Güveni' },
    columns: {
      location: 'Konum', current: 'Mevcut', capacity: 'Kapasite', usage: 'Kullanım', monthlyGrowth: 'Aylık Artış', toThreshold: 'Eşiğe Kalan',
      toFull: 'Dolmaya Kalan', horizonValue: 'Ufuk Sonu Değer', confidence: 'Güven (R²)', pending: 'Bekleyen Talep', committedToThreshold: 'Taahhütle Eşiğe Kalan'
    },
    notes: {
      energy: 'Kabin PDU giriş gücü toplamı. Kapasite: kabin modellerinin nominal güç limitlerinin toplamı (katalog).',
      cooling: 'IT ısı yükü (PDU ortalama güç toplamı ≈ ısı). Kapasite: salon soğutma limiti; genelde tanımlı değilse Kapasite Raporu ayarı.',
      space: 'Dolu U (günlük kapasite anlık görüntüsü). Kapasite: kabin U toplamı.',
      weight: 'Cihaz ve kabin ağırlıkları (katalog). Kapasite: salon zemin kapasitesi (kg/m² × m²); tanımlı değilse kabin taşıma kapasiteleri.',
      cabinets: 'Kurulu kabin sayısı (günlük kapasite kaydı). Kapasite: salonun en fazla kabin sayısı. Turuncu çizgi bekleyen iş emirlerini ekler.',
      temp: 'Konumdaki en yüksek günlük kabin sıcaklığı; eşik ayarlanabilir.'
    },
    quality: { high: 'Yüksek', medium: 'Orta', low: 'Düşük', error: 'Geri test hatası', na: 'Geri test için veri az' },
    models: { linear: 'Doğrusal regresyon', theilsen: 'Theil–Sen (dayanıklı eğilim)', holt: 'Holt (sönümlü eğilim)', hw: 'Holt–Winters (haftalık mevsimsellik)' },
    modelDesc: {
      linear: 'En küçük kareler doğrusu: sabit hızlı büyüme varsayar.',
      theilsen: 'İkili eğimlerin medyanı: tek tük sıçrama ve düşüşlerden etkilenmez.',
      holt: 'Üstel düzeltme, sönümlü eğilim: son döneme daha çok ağırlık verir, büyüme yavaşlıyorsa bunu yakalar.',
      hw: 'Üstel düzeltme + haftalık mevsimsellik: hafta içi / hafta sonu döngüsünü ve eğilimi birlikte modeller.'
    },
    analysis: {
      title: 'Model analizi', hint: 'Bu konum için tahmin modelleri geri testle karşılaştırıldı; en düşük hatalı model tahminde kullanılıyor.',
      data: 'Veri', dataTxt: 'günlük ölçüm okundu', train: 'Eğitim', trainTxt: 'model eğitildi', backtest: 'Geri test',
      backtestTxt: 'gün saklanıp her modelle tahmin edildi', select: 'Seçilen model', errorAxis: 'Geri test hatası (WAPE, kısa çubuk daha iyi)'
    },
    chart3d: {
      expected: 'Beklenen değer', interval80: '%80 aralık', pThr: 'Eşiği aşma olasılığı', pCap: 'Kapasiteyi aşma olasılığı',
      density: 'Olasılık yoğunluğu', hint: '3D: her gelecek ayın tahmin dağılımı; dağın eşik üstündeki kırmızı kısmı eşiği aşma olasılığıdır.'
    },
    runway: { title: 'Ne Zaman Doluyor', hint: 'Salonların eşiğe kalan süresi; en yakın en üstte. Çubuğa tıklayınca salon seçilir.' },
    demand: {
      title: 'İş Emri Talebi', hint: 'Aylık kabin talebi: tamamlanan iş emirleri (bitiş ayı) ve bekleyenler (açılış ayı). İptal edilenler sayılmaz.',
      none: 'Bu konum için iş emri talebi yok.', done: 'Tamamlanan', open: 'Bekleyen',
      unmatched: 'Salonla eşleşmeyen bekleyen iş emirleri (konum bilgisi kontrol edilmeli):'
    },
    limits: {
      title: 'Salon Limitleri', hint: 'Kabin, zemin yükü ve soğutma kapasitesi. Bir konumun limiti, altındaki bütün kabinler limitli salonlarda ise hesaplanır.',
      show: 'Limitleri göster', hide: 'Limitleri gizle', readOnly: 'Limitleri yalnız Mühendis/Admin değiştirebilir.',
      nCab: 'Kabin', maxCab: 'En Fazla Kabin', floorKgM2: 'Zemin (kg/m²)', areaM2: 'Alan (m²)', floorKg: 'Zemin Kapasitesi (kg)',
      coolKw: 'Soğutma (kW)', updated: 'Son Değişiklik', save: 'Kaydet', saved: 'Limit kaydedildi.', saveFailed: 'Limit kaydedilemedi (yetki ya da değer hatası).'
    }
  };

  const METRICS = [
    { key: 'energy', unit: 'kW', levels: ['general', 'salon', 'pod', 'cabinet'], decimals: 1 },
    { key: 'cooling', unit: 'kW', levels: ['general', 'salon', 'pod'], decimals: 1 },
    { key: 'space', unit: 'U', levels: ['general', 'salon', 'pod', 'cabinet'], decimals: 0 },
    { key: 'weight', unit: 'kg', levels: ['general', 'salon', 'pod', 'cabinet'], decimals: 0 },
    { key: 'cabinets', unit: '', levels: ['general', 'salon', 'pod'], decimals: 0 },
    { key: 'temp', unit: '°C', levels: ['general', 'salon', 'pod', 'cabinet'], decimals: 1 }
  ];

  function chartColors(isDark) {
    return {
      text: isDark ? '#cbd5e1' : '#334155', muted: isDark ? '#94a3b8' : '#475569', grid: isDark ? '#334155' : '#cbd5e1',
      surface: isDark ? '#0f172a' : '#ffffff', series: isDark ? '#38bdf8' : '#0284c7', band: isDark ? '56,189,248' : '2,132,199',
      committed: '#f97316', ok: '#10b981', warn: '#f59e0b', danger: '#e11d48', soon: '#f97316',
      zoneOk: isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.14)',
      zoneWarn: isDark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.20)',
      zoneOver: isDark ? 'rgba(225,29,72,0.14)' : 'rgba(225,29,72,0.16)',
      daily: isDark ? 0.35 : 0.6, fill: isDark ? 1 : 1.8
    };
  }

  // ======================================================================
  // Kurgusal geçmiş: 365 günlük kabin serileri → POD / salon / genel toplamları
  // (HIS_Forecast_Nodes / HIS_Forecast_Series / FC_DEMAND / CAP_LIMIT karşılığı)
  // ======================================================================
  const HIST_DAYS = 365;
  // Salon profilleri (kurgusal senaryo): yıllık büyüme, pencere içinde kurulan kabin payı, hedef dolulukları
  const PROFILE = {
    K1S1: { rate: 0.12, install: 0.05, eUse: 0.70, cabUse: 0.78, coolUse: 0.66, floorKgM2: 650, tempTrend: 0.6, by: 'zeynep.arslan', ago: 41 },
    K2S1: { rate: 0.05, install: 0.08, eUse: 0.83, cabUse: 0.70, coolUse: 0.82, floorKgM2: 800, tempTrend: 0.2, by: 'burak.sahin', ago: 96 },
    K2S2: { rate: 0.08, install: 0.42, eUse: 0.50, cabUse: 0.62, coolUse: 0.48, floorKgM2: null, tempTrend: 0.9, by: 'zeynep.arslan', ago: 12 },
    K3S1: { rate: -0.05, install: 0, eUse: 0.44, cabUse: 0.50, coolUse: null, floorKgM2: 1000, tempTrend: -0.2, by: '', ago: 0 }
  };
  const NOMINAL_KW = [3.7, 5, 7.4, 11, 14.8, 22];

  let DATA = null;
  function buildData() {
    if (DATA) return DATA;
    const D = DCIM.data;
    const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() - 1);   // dün
    const dates = [];
    for (let i = 0; i < HIST_DAYS; i++) dates.push(ymd(addDays(end, -(HIST_DAYS - 1 - i))));
    const dow = dates.map(s => parseYmd(s).getDay());

    const salons = [];      // { node, path, floor, sid, profile, cabs:[] , area }
    const pods = {};        // node → { node, path, salon, cabs:[] }
    const cabs = [];
    (D.floors || []).forEach(f => {
      const lay = D.layoutOf ? D.layoutOf(f.digit) : null;
      const list = f.digit === 1 ? D.cabinets : D.getLockFloor(f.id).map(c => c.cabinet);
      ((lay && lay.salons) || [{ id: 'S1', w: 1200, h: 900 }]).forEach(s => {
        const no = (String(s.id).match(/\d+/) || ['1'])[0];
        const node = 'K' + f.digit + 'S' + no;
        salons.push({
          node, floor: f.digit, sid: s.id, path: 'DCA / KAT-' + f.digit + ' / SALON-' + no, profile: PROFILE[node] || PROFILE.K1S1,
          area: Math.round((s.w || 1200) * (s.h || 900) / 10000), cabs: []
        });
      });
      list.forEach(c => {
        const sal = salons.find(s => s.floor === f.digit && s.sid === (c.salonId || 'S1')) || salons.find(s => s.floor === f.digit);
        if (!sal) return;
        const podNode = sal.node + '/' + (c.pod || 'POD');
        const pod = pods[podNode] || (pods[podNode] = { node: podNode, path: sal.path + ' / ' + (c.pod || 'POD'), salon: sal, cabs: [] });
        const cab = { code: c.code, salon: sal, pod, src: c };
        sal.cabs.push(cab); pod.cabs.push(cab); cabs.push(cab);
      });
    });

    // --- kabin serileri
    cabs.forEach(cab => {
      const c = cab.src, pr = cab.salon.profile;
      const rnd = D.rng(D.hash('fc-' + cab.code));
      const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
      const inst = rnd() < pr.install ? Math.floor(20 + rnd() * 320) : -1;
      cab.installDay = inst;
      const pNow = Math.max(0.8, +c.powerKw || 3.5);
      const rate = pr.rate + (rnd() - 0.5) * 0.08;
      const step = rnd() < 0.22 ? { day: Math.floor(rnd() * HIST_DAYS), kw: pNow * (0.12 + rnd() * 0.2) } : null;
      // katalog nominal gücü (kW): hedef doluluğa en yakın standart değer
      const want = pNow / (pr.eUse * (0.85 + rnd() * 0.3));
      cab.nominalKw = NOMINAL_KW.reduce((b, k) => Math.abs(k - want) < Math.abs(b - want) && k >= pNow * 1.05 ? k : b, NOMINAL_KW[NOMINAL_KW.length - 1]);
      cab.carryKg = rnd() < 0.3 ? 1200 : 1000;
      cab.totalU = 42;
      const uNow = Math.max(2, +c.usedU || 10);
      const uEvents = [];
      const nEv = pr.rate > 0 ? Math.floor(rnd() * 4) : 0;
      for (let k = 0; k < nEv; k++) uEvents.push({ day: Math.floor(rnd() * HIST_DAYS), u: 1 + Math.floor(rnd() * 4) });
      const tNow = Number.isFinite(+c.tempTop) ? +c.tempTop : 23 + rnd() * 3;
      const avg = new Float64Array(HIST_DAYS), mx = new Float64Array(HIST_DAYS), U = new Float64Array(HIST_DAYS),
        W = new Float64Array(HIST_DAYS), TT = new Float64Array(HIST_DAYS);
      for (let i = 0; i < HIST_DAYS; i++) {
        if (inst >= 0 && i < inst) { avg[i] = mx[i] = U[i] = W[i] = TT[i] = NaN; continue; }
        const back = (HIST_DAYS - 1 - i) / 365;
        let p = pNow * (1 - rate * back);
        if (step && i < step.day) p -= step.kw;
        if (inst >= 0) p *= Math.min(1, 0.35 + 0.65 * (i - inst) / 45);
        p *= (dow[i] === 0 || dow[i] === 6 ? 0.975 : 1.007) * (1 + 0.018 * gauss());
        avg[i] = Math.max(0.15, p);
        mx[i] = avg[i] * (1.06 + 0.07 * rnd());
        let u = uNow;
        uEvents.forEach(e => { if (e.day > i) u -= e.u; });
        U[i] = Math.max(2, u);
        W[i] = 135 + 21.5 * U[i];
        TT[i] = tNow - pr.tempTrend * back + 0.35 * Math.sin(2 * Math.PI * i / 7) + 0.4 * gauss();
      }
      cab.series = { energyAvg: avg, energyMax: mx, space: U, weight: W, temp: TT };
    });

    // --- limitler (CAP_LIMIT): salon başına
    const lastIdx = HIST_DAYS - 1;
    const limits = salons.map(s => {
      const heat = s.cabs.reduce((t, c) => t + (Number.isFinite(c.series.energyAvg[lastIdx]) ? c.series.energyAvg[lastIdx] : 0), 0);
      const pr = s.profile;
      const d = new Date(); d.setDate(d.getDate() - pr.ago); d.setHours(10, 12, 0, 0);
      return {
        location_id: s.node, path: s.path, label: locationLabel(s.path), n_cab: s.cabs.length,
        max_cab: Math.ceil(s.cabs.length / pr.cabUse),
        floor_kg_m2: pr.floorKgM2, area_m2: pr.floorKgM2 ? s.area : (s.area || null),
        cool_kw: pr.coolUse ? Math.round(heat / pr.coolUse / 10) * 10 : null,
        usr: pr.by, tim: pr.by ? d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''
      };
    });
    // K2S2: zemin yükü tanımlı değil, alan tanımlı (zemin kapasitesi hesaplanmaz → kabin taşıma kapasiteleri)

    // --- iş emri talebi (FC_DEMAND): tamamlananlar kurulum günlerinden, bekleyenler kurgusal
    const demand = [];
    const ymOf = s => s.slice(0, 7);
    const addDemand = (node, path, kind, ym, qty) => {
      const hit = demand.find(d => d.node === node && d.path === path && d.kind === kind && d.ym === ym);
      if (hit) { hit.qty += qty; hit.cnt += 1; } else demand.push({ node, path, kind, ym, qty, cnt: 1 });
    };
    cabs.forEach(c => { if (c.installDay >= 0) addDemand(c.salon.node, c.pod.path, 'done', ymOf(dates[c.installDay]), 1); });
    // pencere öncesi 6 ay (son 18 ay)
    salons.forEach(s => {
      const rnd = D.rng(D.hash('fc-dem-' + s.node));
      for (let m = 13; m <= 18; m++) {
        const d = new Date(end); d.setDate(1); d.setMonth(d.getMonth() - m);
        const q = Math.floor(rnd() * (s.profile.install * 10 + 1.2));
        if (q > 0) addDemand(s.node, s.path, 'done', ymOf(ymd(d)), q);
      }
    });
    const ymNow = ymOf(ymd(end));
    const ymPrev = (() => { const d = new Date(end); d.setDate(1); d.setMonth(d.getMonth() - 1); return ymOf(ymd(d)); })();
    const sal = k => salons.find(s => s.node === k);
    if (sal('K1S1')) { addDemand('K1S1', sal('K1S1').path, 'open', ymPrev, 2); addDemand('K1S1', sal('K1S1').path + ' / POD-8', 'open', ymNow, 3); }
    if (sal('K2S2')) { addDemand('K2S2', sal('K2S2').path, 'open', ymNow, 6); const pd = Object.values(pods).find(p => p.salon.node === 'K2S2'); if (pd) addDemand('K2S2', pd.path, 'open', ymPrev, 4); }
    if (sal('K2S1')) addDemand('K2S1', sal('K2S1').path, 'open', ymNow, 2);
    addDemand('', 'DCA / KAT-4 / SALON-1', 'open', ymNow, 3);   // konum metni hatalı (eşleşmez)

    DATA = { end, endDate: ymd(end), dates, salons, pods: Object.values(pods), cabs, limits, demand };
    return DATA;
  }

  // Düğüm serisi: metrik + değer tipi
  function nodeCabs(node) {
    const d = buildData();
    if (node === 'ALL') return d.cabs;
    const s = d.salons.find(x => x.node === node); if (s) return s.cabs;
    const p = d.pods.find(x => x.node === node); if (p) return p.cabs;
    const c = d.cabs.find(x => x.code === node); return c ? [c] : [];
  }
  function nodeSeries(node, metric, agg) {
    const list = nodeCabs(node);
    const out = new Float64Array(HIST_DAYS);
    const key = metric === 'energy' ? (agg === 'avg' ? 'energyAvg' : 'energyMax') : metric === 'cooling' ? 'energyAvg' : metric;
    for (let i = 0; i < HIST_DAYS; i++) {
      let v = metric === 'temp' ? -Infinity : 0, any = false;
      for (const c of list) {
        if (metric === 'cabinets') { if (c.installDay < 0 || i >= c.installDay) { v += 1; any = true; } continue; }
        const x = c.series[key][i];
        if (!Number.isFinite(x)) continue;
        any = true;
        if (metric === 'temp') { if (x > v) v = x; } else v += x;
      }
      out[i] = any ? v : NaN;
    }
    return out;
  }
  // Düğüm kapasitesi (lim): bir konumun limiti, altındaki bütün kabinler limitli salonlarda ise hesaplanır
  function nodeLimit(node, level, metric) {
    const d = buildData();
    const list = nodeCabs(node);
    const lim = id => d.limits.find(l => l.location_id === id);
    const salonsOf = node === 'ALL' ? d.salons : level === 'salon' ? d.salons.filter(s => s.node === node) : [];
    const sumSalon = fn => {
      if (!salonsOf.length) return null;
      let t = 0;
      for (const s of salonsOf) { const v = fn(lim(s.node), s); if (v === null) return null; t += v; }
      return t;
    };
    switch (metric) {
      case 'energy': return list.reduce((t, c) => t + c.nominalKw, 0);
      case 'space': return list.reduce((t, c) => t + c.totalU, 0);
      case 'cooling': return sumSalon(l => l && l.cool_kw !== null && l.cool_kw !== '' ? +l.cool_kw : null);
      case 'cabinets': return sumSalon(l => l && l.max_cab !== null && l.max_cab !== '' ? +l.max_cab : null);
      case 'weight': {
        const carry = cs => cs.reduce((t, c) => t + c.carryKg, 0);
        if (!salonsOf.length) return carry(list);
        return salonsOf.reduce((t, s) => {
          const l = lim(s.node);
          return t + (l && l.floor_kg_m2 && l.area_m2 ? l.floor_kg_m2 * l.area_m2 : carry(s.cabs));
        }, 0);
      }
    }
    return null;
  }

  // ======================================================================
  // 3D olasılık dağları (forecast-chart-3d.component) — Three.js, CSS2D yerine izdüşümlü HTML etiketleri
  // ======================================================================
  const WX = 16, HY = 4.6, RES = 140;

  function loadThree(cb) {
    if (window.THREE && window.THREE.OrbitControls) { cb(true); return; }
    let s = document.querySelector('script[data-fc-three]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'vendor/three.bundle.min.js';
      s.setAttribute('data-fc-three', '');
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => cb(!!window.THREE));
    s.addEventListener('error', () => cb(false));
  }

  function Ridge3D(host, tip, dark) {
    const THREE = window.THREE;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    const labelLayer = document.createElement('div');
    labelLayer.className = 'fc3d-labels';
    host.appendChild(labelLayer);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 2, 0.1, 500);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.3));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-6, 14, 10);
    scene.add(key);
    const chart = new THREE.Group();
    scene.add(chart);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, enablePan: false, minPolarAngle: 0.5, maxPolarAngle: 1.45, minDistance: 8, maxDistance: 45, rotateSpeed: 0.6 });
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2(-9, -9);
    let mousePx = { x: 0, y: 0 };
    let labels = [], ridges = [], hovered = -1, buildAt = 0, xMin = 0, xMax = 1, dz = 0.9, data = null, raf = 0, alive = true;
    const cv = renderer.domElement;
    cv.addEventListener('pointermove', e => {
      const r = cv.getBoundingClientRect();
      mousePx = { x: e.clientX - r.left, y: e.clientY - r.top };
      mouse.set((mousePx.x / r.width) * 2 - 1, -(mousePx.y / r.height) * 2 + 1);
    });
    cv.addEventListener('pointerleave', () => { mouse.set(-9, -9); setHover(-1); });

    function resize() {
      const w = host.clientWidth || 800, h = host.clientHeight || 460;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(host);
    resize();

    const X = v => (v - xMin) / Math.max(1e-9, xMax - xMin) * WX;
    const fmt = v => v.toLocaleString('tr-TR', { minimumFractionDigits: data ? data.decimals : 1, maximumFractionDigits: data ? data.decimals : 1 });
    function colors() {
      return {
        near: new THREE.Color(dark ? '#38bdf8' : '#0284c7'), far: new THREE.Color(dark ? '#a78bfa' : '#7c3aed'),
        warn: '#f59e0b', danger: '#e11d48', grid: dark ? '#334155' : '#cbd5e1', floor: dark ? '#0f172a' : '#e2e8f0',
        label: dark ? '#cbd5e1' : '#475569', k: dark ? 1 : 1.35
      };
    }
    function line(pts, color, opacity, dashed, parent) {
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: opacity < 1, opacity, dashSize: 0.25, gapSize: 0.18 })
        : new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
      const l = new THREE.Line(g, m);
      if (dashed) l.computeLineDistances();
      (parent || chart).add(l);
      return l;
    }
    function label(text, pos, cls, color, parent) {
      const anchor = new THREE.Object3D();
      anchor.position.copy(pos);
      (parent || chart).add(anchor);
      const el = document.createElement('div');
      el.className = 'fc3d-label ' + (cls || '');
      el.textContent = text;
      if (color) el.style.color = color;
      labelLayer.appendChild(el);
      labels.push({ anchor, el });
      return el;
    }
    function niceStep(raw) {
      const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
      const n = raw / p;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
    }
    function clear() {
      chart.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
      chart.clear();
      labels.forEach(l => l.el.remove());
      labels = []; ridges = []; hovered = -1;
    }
    function resetView() {
      const depth = (data ? data.months.length : 12) * dz;
      const target = new THREE.Vector3(WX / 2, HY * 0.25, -depth * 0.45);
      const dist = Math.max(18, depth * 1.1) * Math.max(1, 1.8 / Math.max(0.5, camera.aspect));
      camera.position.set(WX / 2 - dist * 0.32, HY + dist * 0.42, dist * 0.62);
      controls.target.copy(target);
      controls.update();
    }
    function build(d, animate) {
      clear();
      data = d;
      if (!d || !d.months.length) return;
      const c = colors();
      const M = d.months;
      dz = Math.min(1.0, 16 / M.length);
      const zOf = i => -(i + 1) * dz;
      const depth = (M.length + 1) * dz;
      let lo = Math.min.apply(null, M.map(m => m.mean - 3 * m.se)), hi = Math.max.apply(null, M.map(m => m.mean + 3 * m.se));
      [d.current, d.threshold, d.capacity].forEach(v => { if (v !== null && v !== undefined) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
      if (lo < 0 && M.every(m => m.mean >= 0) && (d.current || 0) >= 0) lo = 0;
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.04;
      xMin = lo - pad; xMax = hi + pad;
      const peak = se => se > 0 ? 1 / (se * Math.sqrt(2 * Math.PI)) : 0;
      const maxPeak = Math.max.apply(null, M.map(m => peak(m.se)).concat([1e-12]));
      const hScale = dens => Math.pow(dens / maxPeak, 0.55) * HY;

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(WX + 1, depth + 1), new THREE.MeshStandardMaterial({ color: c.floor, transparent: true, opacity: 0.6, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(WX / 2, -0.02, -depth / 2);
      chart.add(floor);
      const step = niceStep((xMax - xMin) / 6);
      for (let v = Math.ceil(xMin / step) * step; v <= xMax + 1e-9; v += step) {
        const x = X(v);
        line([new THREE.Vector3(x, 0, 0.3), new THREE.Vector3(x, 0, -depth)], c.grid, 0.7);
        label(fmt(v), new THREE.Vector3(x, -0.05, 0.85), '', c.label);
      }
      label(d.unit, new THREE.Vector3(WX + 0.6, -0.05, 0.85), 'font-semibold', c.label);
      if (d.current !== null) {
        const x = X(d.current);
        line([new THREE.Vector3(x, 0.01, 0.3), new THREE.Vector3(x, 0.01, -depth)], c.near.getStyle(), 0.9, true);
        label(d.names.now + ' ' + fmt(d.current), new THREE.Vector3(x, 0.15, 0.5), 'font-semibold', c.label);
      }
      const wall = (v, color, text) => {
        const x = X(v);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(depth + 0.3, HY + 0.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1 * c.k, side: THREE.DoubleSide, depthWrite: false }));
        p.rotation.y = Math.PI / 2;
        p.position.set(x, (HY + 0.6) / 2, -depth / 2 + 0.15);
        chart.add(p);
        line([new THREE.Vector3(x, 0.02, 0.3), new THREE.Vector3(x, 0.02, -depth)], color, 1);
        line([new THREE.Vector3(x, HY + 0.6, 0.3), new THREE.Vector3(x, HY + 0.6, -depth)], color, 0.6);
        label(text, new THREE.Vector3(x, HY + 0.85, 0.3), 'fc3d-chip font-semibold', color);
      };
      if (d.threshold !== null) wall(d.threshold, c.warn, d.thresholdText);
      if (d.capacity !== null) wall(d.capacity, c.danger, d.names.capacity + ' ' + fmt(d.capacity) + ' ' + d.unit);

      const every = Math.max(1, Math.ceil(M.length / 8));
      M.forEach((m, i) => {
        const g = new THREE.Group();
        g.position.z = zOf(i);
        const col = c.near.clone().lerp(c.far, M.length > 1 ? i / (M.length - 1) : 0);
        const xs = [], ys = [];
        for (let k = 0; k <= RES; k++) {
          const v = xMin + (xMax - xMin) * k / RES;
          const dens = m.se > 0 ? Math.exp(-0.5 * Math.pow((v - m.mean) / m.se, 2)) / (m.se * Math.sqrt(2 * Math.PI)) : (Math.abs(v - m.mean) < (xMax - xMin) / RES ? maxPeak : 0);
          xs.push(X(v)); ys.push(hScale(dens));
        }
        const fill = (from, to, color, opacity) => {
          if (to - from < 1) return;
          const s = new THREE.Shape();
          s.moveTo(xs[from], 0);
          for (let k = from; k <= to; k++) s.lineTo(xs[k], ys[k]);
          s.lineTo(xs[to], 0);
          const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: dz * 0.18, bevelEnabled: false, curveSegments: 1 }),
            new THREE.MeshStandardMaterial({ color, transparent: true, opacity: Math.min(0.95, opacity * c.k), roughness: 0.35, metalness: 0.05, depthWrite: true }));
          mesh.userData.ridge = true;
          g.add(mesh);
        };
        const cut = d.threshold !== null ? Math.max(0, Math.min(RES, Math.round((X(d.threshold) / WX) * RES))) : RES;
        fill(0, cut, col, 0.55);
        if (cut < RES) fill(cut, RES, new THREE.Color(c.danger), 0.75);
        line(xs.map((x, k) => new THREE.Vector3(x, ys[k], dz * 0.19)), col.getStyle(), 1, false, g);
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: col }));
        top.position.set(X(m.mean), hScale(peak(m.se)) + 0.02, dz * 0.19);
        g.add(top);
        if (i % every === 0 || i === M.length - 1) {
          label(m.label, new THREE.Vector3(-0.35, 0.05, dz * 0.1), 'fc3d-left', c.label, g);
          if (d.threshold !== null) {
            const p = pAbove(m.mean, m.se, d.threshold);
            label('%' + pctTxt(p), new THREE.Vector3(WX + 0.4, 0.25, dz * 0.1), 'fc3d-right font-bold', p >= 0.5 ? c.danger : p >= 0.1 ? c.warn : '#10b981', g);
          }
        }
        const hit = new THREE.Mesh(new THREE.BoxGeometry(WX, HY, dz * 0.9), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.set(WX / 2, HY / 2, dz * 0.1);
        g.add(hit);
        g.scale.y = animate ? 0.001 : 1;
        chart.add(g);
        ridges.push({ group: g, hit, i, delay: i * 55 });
      });
      if (d.threshold !== null) label(d.names.pThr, new THREE.Vector3(WX + 0.4, 0.25, 0.6), 'fc3d-right font-semibold', c.label);
      buildAt = performance.now();
      resetView();
    }
    const v3 = new THREE.Vector3();
    function frame() {
      const now = performance.now() - buildAt;
      ridges.forEach(r => {
        if (r.group.scale.y < 1) {
          const f = Math.max(0, Math.min(1, (now - r.delay) / 700));
          r.group.scale.y = Math.max(0.001, 1 - Math.pow(1 - f, 3));
        }
      });
      ray.setFromCamera(mouse, camera);
      const hits = ray.intersectObjects(ridges.map(r => r.hit), false);
      setHover(hits.length ? ridges.find(r => r.hit === hits[0].object).i : -1);
      controls.update();
      renderer.render(scene, camera);
      const w = host.clientWidth, h = host.clientHeight;
      labels.forEach(l => {
        l.anchor.getWorldPosition(v3);
        v3.project(camera);
        const vis = v3.z < 1 && v3.z > -1;
        l.el.style.display = vis ? '' : 'none';
        if (vis) l.el.style.transform = 'translate(' + ((v3.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v3.y) / 2 * h).toFixed(1) + 'px)';
      });
    }
    function setHover(i) {
      if (i !== hovered) {
        ridges.forEach(r => r.group.children.forEach(o => { if (o.userData && o.userData.ridge && o.material.emissive) o.material.emissive.setScalar(r.i === i ? 0.25 : 0); }));
        hovered = i;
      }
      if (!tip) return;
      if (i < 0 || !data) { tip.classList.add('hidden'); return; }
      const m = data.months[i];
      const u = ' ' + data.unit;
      let html = '<b>' + m.label + '</b> (+' + (i + 1) + ' ' + data.names.month + ')<br>' + data.names.expected + ': <b>' + fmt(m.mean) + u + '</b>' +
        '<br>' + data.names.interval80 + ': ' + fmt(m.mean - 1.2816 * m.se) + ' – ' + fmt(m.mean + 1.2816 * m.se) + u;
      if (data.threshold !== null) html += '<br>' + data.names.pThr + ': <b>%' + pctTxt(pAbove(m.mean, m.se, data.threshold)) + '</b>';
      if (data.capacity !== null) html += '<br>' + data.names.pCap + ': <b>%' + pctTxt(pAbove(m.mean, m.se, data.capacity)) + '</b>';
      tip.innerHTML = html;
      tip.classList.remove('hidden');
      const w = host.clientWidth;
      tip.style.left = (mousePx.x > w * 0.62 ? mousePx.x - tip.offsetWidth - 16 : mousePx.x + 16) + 'px';
      tip.style.top = Math.max(6, mousePx.y - 20) + 'px';
    }
    // Otomasyon (headless doğrulama, navigator.webdriver) altında yazılım WebGL'i boğulmasın: ~5 kare/sn (3d.js ile aynı)
    const throttled = !!navigator.webdriver;
    let lastFrame = 0;
    const loop = ts => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (throttled && ts - lastFrame < 200) return;
      lastFrame = ts || 0;
      frame();
    };
    loop();
    return {
      build, resetView,
      setDark(v) { dark = v; build(data, false); },
      destroy() {
        alive = false;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        controls.dispose();
        clear();
        renderer.dispose();
        cv.remove();
        labelLayer.remove();
      }
    };
  }

  // ======================================================================
  // Bileşen
  // ======================================================================
  const registry = (DCIM.reportRegistry = DCIM.reportRegistry || {});
  registry['capacity-forecast'] = {
    mount(el) {
      const { esc, button, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const D = buildData();
      const qs = new URLSearchParams(window.location.search);

      const st = {
        metric: 'energy', level: 'general', windowDays: 180, horizonMonths: 12, thresholdPct: 80, agg: 'max',
        coolingCapacityKw: 1500, tempLimitC: 27,
        rows: [], selected: null, runwayRows: [], analysis: null, quality: null, ridge: null, chartMode: '2d',
        showLimits: false, limitMsg: '', isLoading: false, errorText: ''
      };
      // loadCoolingCapacity(): doc('ASM/S00')/id('CAPACITY_CFG') → klima.maxCapacity
      try {
        const cfg = DCIM.data.reports && DCIM.data.reports.capacity && DCIM.data.reports.capacity.config;
        const cap = cfg && cfg.klima && cfg.klima.maxCapacity;
        if (Number.isFinite(+cap) && +cap > 0) st.coolingCapacityKw = +cap;
      } catch (e) { /* varsayılan kalır */ }

      // derin bağlantı
      const qMetric = qs.get('metric'), qLevel = qs.get('level'), qNode = qs.get('node');
      if (METRICS.some(m => m.key === qMetric)) st.metric = qMetric;
      if (['general', 'salon', 'pod', 'cabinet'].indexOf(qLevel) >= 0) st.level = qLevel;
      if (qNode && !qLevel) {
        if (D.cabs.some(c => c.code === qNode.toUpperCase())) st.level = 'cabinet';
        else if (D.salons.some(s => s.node === qNode.toUpperCase())) st.level = 'salon';
        else if (D.pods.some(p => p.node.toUpperCase() === qNode.toUpperCase())) st.level = 'pod';
      }
      const def0 = METRICS.find(m => m.key === st.metric);
      if (def0.levels.indexOf(st.level) < 0) st.level = 'general';
      if ([90, 180, 365].indexOf(+qs.get('window')) >= 0) st.windowDays = +qs.get('window');
      if ([6, 12, 24].indexOf(+qs.get('horizon')) >= 0) st.horizonMonths = +qs.get('horizon');
      if (qs.get('chart') === '3d') st.chartMode = '3d';
      if (qs.get('limits') === '1') st.showLimits = true;
      let pendingSelect = qNode ? qNode.toUpperCase() : null;

      const def = () => METRICS.find(m => m.key === st.metric);
      const unit = () => st.metric === 'cabinets' ? T.unitCab : def().unit;
      const horizonDays = () => Math.round(st.horizonMonths * 30.4);
      const isDark = () => DCIM.theme.mode() === 'dark';
      const fmt = (v, decimals) => {
        if (decimals === undefined) decimals = def().decimals;
        if (v === null || v === undefined || !Number.isFinite(v)) return '-';
        return v.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      };
      const pct = v => v === null || v === undefined || !Number.isFinite(v) ? '-' : '%' + v.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
      const monthYear = d => d.toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });
      function remaining(days, lastDate) {
        if (days === null) return T.notReached;
        if (days <= 0) return T.exceeded;
        const date = monthYear(addDays(parseYmd(lastDate), days));
        const months = days / 30.4;
        const txt = (months < 1 ? '<1' : months.toLocaleString('tr-TR', { maximumFractionDigits: 1 })) + ' ' + T.months + ' (' + date + ')';
        return days > horizonDays() ? txt + ' ' + T.beyondHorizon : txt;
      }
      function severity(r) {
        const d = r.result.daysToThreshold;
        if (r.result.threshold === null) return 'none';
        if (d === 0) return 'danger';
        if (d !== null && d <= horizonDays()) return 'warning';
        return 'ok';
      }
      const modelName = k => T.models[k];

      // ---- iskelet
      el.innerHTML =
        '<div class="space-y-4 fc-root">' +
          '<div data-h="header"></div>' +
          '<div data-h="filters"></div>' +
          '<div data-h="empty"></div>' +
          '<div data-h="cards" class="grid grid-cols-2 lg:grid-cols-5 gap-3.5"></div>' +
          '<div data-h="chart"></div>' +
          '<div data-h="analysis"></div>' +
          '<div data-h="runway"></div>' +
          '<div data-h="demand"></div>' +
          '<div data-h="table"></div>' +
          '<div data-h="limits"></div>' +
        '</div>';
      const H = {};
      el.querySelectorAll('[data-h]').forEach(n => { H[n.getAttribute('data-h')] = n; });
      const charts = {};
      let ridge3d = null, ridgeToken = 0;

      function disposeChart(k) { if (charts[k]) { charts[k].dispose(); delete charts[k]; } }
      function chartOn(k, host, option) {
        if (!window.echarts || !host) return null;
        let c = charts[k];
        if (c && c.getDom() !== host) { c.dispose(); c = null; }
        if (!c) c = charts[k] = window.echarts.init(host, null, { renderer: 'canvas' });
        c.setOption(option, true);
        return c;
      }

      // ---- başlık
      function renderHeader() {
        const actions =
          button({ variant: 'secondary', icon: st.isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-sync', label: T.refresh, attrs: 'data-act="reload"' }) +
          button({ variant: 'primary', icon: 'pi pi-file-excel', label: T.exportExcel, attrs: 'data-act="excel"' + (st.rows.length ? '' : ' disabled') });
        H.header.innerHTML = kit.pageHeader({ title: T.title, breadcrumbs: [{ label: 'Raporlar' }, { label: T.title }], actions }) +
          '<p class="-mt-2 mb-1 text-xs text-slate-500 dark:text-slate-400">' + esc(T.subtitle) + '</p>';
      }

      // ---- filtreler
      const SEL = 'scada-input h-8 w-full';
      function opt(v, l, on) { return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(l) + '</option>'; }
      function renderFilters() {
        const d = def();
        let f =
          kit.formField({ label: T.metric, control: '<select class="' + SEL + '" data-f="metric">' +
            METRICS.map(m => opt(m.key, T.metrics[m.key] + ' (' + (m.key === 'cabinets' ? T.unitCab : m.unit) + ')', m.key === st.metric)).join('') + '</select>' }) +
          kit.formField({ label: T.level, control: '<select class="' + SEL + '" data-f="level">' + d.levels.map(l => opt(l, T.levels[l], l === st.level)).join('') + '</select>' }) +
          kit.formField({ label: T.window, control: '<select class="' + SEL + '" data-f="windowDays">' + [90, 180, 365].map(w => opt(w, w + ' ' + T.days, w === st.windowDays)).join('') + '</select>' }) +
          kit.formField({ label: T.horizon, control: '<select class="' + SEL + '" data-f="horizonMonths">' + [6, 12, 24].map(h => opt(h, h + ' ' + T.months, h === st.horizonMonths)).join('') + '</select>' });
        if (st.metric !== 'temp') f += kit.formField({ label: T.thresholdPct, control: '<input type="number" min="1" max="100" class="' + SEL + '" data-f="thresholdPct" value="' + st.thresholdPct + '">' });
        else f += kit.formField({ label: T.tempLimit, control: '<input type="number" min="10" max="60" step="0.5" class="' + SEL + '" data-f="tempLimitC" value="' + st.tempLimitC + '">' });
        if (st.metric === 'energy') f += kit.formField({ label: T.agg, control: '<select class="' + SEL + '" data-f="agg">' + opt('max', T.aggMax, st.agg === 'max') + opt('avg', T.aggAvg, st.agg === 'avg') + '</select>' });
        if (st.metric === 'cooling') f += kit.formField({ label: T.coolingCapacity, control: '<input type="number" min="1" class="' + SEL + '" data-f="coolingCapacityKw" value="' + st.coolingCapacityKw + '">' });
        H.filters.innerHTML = kit.card({
          title: T.filters, icon: 'pi pi-filter',
          body: '<div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3.5">' + f + '</div>' +
            '<p class="mt-3 text-xs text-slate-500 dark:text-slate-400">' + esc(T.notes[st.metric]) + '</p>'
        });
      }

      // ---- veri (reload / recompute)
      const nodeList = level => {
        if (level === 'general') return [{ node: 'ALL', label: '' }];
        if (level === 'salon') return D.salons.map(s => ({ node: s.node, label: s.path }));
        if (level === 'pod') return D.pods.map(p => ({ node: p.node, label: p.path }));
        return D.cabs.map(c => ({ node: c.code, label: c.code + ' | ' + c.pod.path }));
      };
      const seriesCache = {};
      function windowSeries(node) {
        const k = node + '|' + st.metric + '|' + st.agg;
        const full = seriesCache[k] || (seriesCache[k] = nodeSeries(node, st.metric, st.agg));
        const out = [];
        for (let i = HIST_DAYS - st.windowDays; i < HIST_DAYS; i++) if (Number.isFinite(full[i])) out.push({ tim: D.dates[i], v: full[i], i });
        return out;
      }
      function capacityFor(lim, node) {
        if (st.metric === 'temp') return { capacity: null, threshold: st.tempLimitC };
        let cap = lim === null || lim === undefined ? null : +lim;
        if (st.metric === 'cooling' && cap === null && node === 'ALL') cap = st.coolingCapacityKw;
        if (cap === null || !Number.isFinite(cap) || cap <= 0) return { capacity: null, threshold: null };
        return { capacity: cap, threshold: cap * st.thresholdPct / 100 };
      }
      function pendingFor(node, path) {
        let n = 0;
        D.demand.forEach(d => { if (d.kind === 'open' && (node === 'ALL' || (d.node && path && d.path.indexOf(path) === 0))) n += d.qty; });
        return n;
      }
      function displayLabel(node, label, level) {
        if (node === 'ALL') return T.levels.general;
        if (level === 'cabinet') { const parts = label.split(' | '); return parts[0] + (parts[1] ? '  —  ' + locationLabel(parts[1]) : ''); }
        return locationLabel(label);
      }
      // HIS_Forecast_Nodes: düğüm başına doğrusal eğilim istatistiği (SQL'deki gibi en küçük kareler)
      function buildRow(n, level) {
        const pts = windowSeries(n.node);
        if (pts.length < 2) return null;
        const x0 = parseYmd(pts[0].tim).getTime();
        const fit = fitLine(pts.map(p => ({ x: Math.round((parseYmd(p.tim).getTime() - x0) / 86400000), y: p.v })));
        if (!fit) return null;
        const current = pts[pts.length - 1].v;
        const lim = nodeLimit(n.node, level, st.metric);
        const cf = capacityFor(lim, n.node);
        const path = n.node === 'ALL' || level === 'cabinet' ? '' : n.label;
        const pending = st.metric === 'cabinets' ? pendingFor(n.node, path) : 0;
        return {
          node: n.node, label: displayLabel(n.node, n.label, level), path, fit, lim, lastDate: pts[pts.length - 1].tim, pending,
          result: forecast(fit, current, cf.capacity, cf.threshold, horizonDays()),
          committed: pending > 0 ? forecast(Object.assign({}, fit, { intercept: fit.intercept + pending }), current + pending, cf.capacity, cf.threshold, horizonDays()) : null
        };
      }
      function recompute() {
        const rows = nodeList(st.level).map(n => buildRow(n, st.level)).filter(Boolean);
        const runway = st.level === 'cabinet' ? [] : nodeList('salon').map(n => buildRow(n, 'salon')).filter(r => r && r.result.threshold !== null);
        const key = x => x.result.daysToThreshold === null ? Number.POSITIVE_INFINITY : x.result.daysToThreshold;
        const order = (a, b) => key(a) - key(b) || (b.result.usagePct || 0) - (a.result.usagePct || 0);
        rows.sort(order);
        runway.sort(order);
        st.rows = rows;
        st.runwayRows = runway.slice(0, 15);
        const want = pendingSelect || (st.selected && st.selected.node);
        pendingSelect = null;
        st.selected = (want && rows.find(r => r.node.toUpperCase() === String(want).toUpperCase())) || rows[0] || null;
        st.errorText = rows.length ? '' : T.noData;
        computeSelected();
        renderAll();
      }
      function reload() {
        st.isLoading = true;
        renderHeader();
        setTimeout(() => { st.isLoading = false; recompute(); }, 250);
      }

      // ---- seçili düğüm: çoklu model analizi
      let sel = null;   // { pts, proj, committed, capacity, threshold, lastDate, avg, crossings, thrDate }
      function computeSelected() {
        const row = st.selected;
        sel = null; st.analysis = null; st.quality = null; st.ridge = null;
        if (!row) return;
        const pts = windowSeries(row.node);
        if (!pts.length) return;
        const start = parseYmd(pts[0].tim);
        const xy = pts.map(p => ({ x: Math.round((parseYmd(p.tim).getTime() - start.getTime()) / 86400000), y: p.v }));
        const an = analyze(xy);
        st.analysis = an;
        st.quality = an && an.error !== null && an.level ? { error: an.error, holdoutDays: an.holdoutDays, level: an.level } : null;
        const lastDate = parseYmd(pts[pts.length - 1].tim);
        const proj = an ? analysisProjection(an, lastDate, horizonDays()) : [];
        const cf = capacityFor(row.lim, row.node);
        const committed = an && row.pending > 0 ? proj.map(p => Object.assign({}, p, { y: p.y + row.pending })) : [];
        if (an) {
          const cur = pts[pts.length - 1].v;
          row.result = analysisForecast(an, cur, cf.capacity, cf.threshold, horizonDays());
          row.committed = row.pending > 0 ? analysisForecast(shiftAnalysis(an, row.pending), cur + row.pending, cf.capacity, cf.threshold, horizonDays()) : null;
        }
        st.ridge = an ? {
          months: Array.from({ length: st.horizonMonths }, (_, k) => {
            const h = Math.round((k + 1) * 30.4);
            const p = an.at(h);
            return { label: monthYear(addDays(lastDate, h)), mean: p.y, se: p.se };
          }),
          current: pts[pts.length - 1].v, threshold: cf.threshold, capacity: cf.capacity,
          thresholdText: cf.threshold === null ? '' : T.threshold + ' ' + (st.metric === 'temp' ? '' : '%' + st.thresholdPct + ' · ') + fmt(cf.threshold) + ' ' + unit(),
          unit: unit(), decimals: def().decimals,
          names: { expected: T.chart3d.expected, interval80: T.chart3d.interval80, pThr: T.chart3d.pThr, pCap: T.chart3d.pCap, capacity: T.capacity, now: T.today, month: T.month, density: T.chart3d.density }
        } : null;
        sel = { pts, proj, committed, capacity: cf.capacity, threshold: cf.threshold, lastDate, start, avg: movingAverage(pts.map(p => p.v), 7) };
      }

      // ---- kartlar
      function renderCards() {
        const s = st.selected;
        H.empty.innerHTML = !st.isLoading && st.errorText ? kit.emptyState({ message: st.errorText, icon: 'pi pi-chart-line' }) : '';
        if (!s) { H.cards.innerHTML = ''; return; }
        const r = s.result, u = unit();
        const sevCls = { danger: 'text-rose-600 dark:text-rose-400', warning: 'text-amber-600 dark:text-amber-400', ok: 'text-emerald-600 dark:text-emerald-400', none: '' }[severity(s)];
        const q = st.quality, an = st.analysis;
        const qCls = !q ? 'text-slate-900 dark:text-white' : q.level === 'high' ? 'text-emerald-600 dark:text-emerald-400' : q.level === 'medium' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
        const card = (title, icon, body) => kit.card({ title, icon, body, cls: 'h-full' });
        const sub = t => '<div class="text-xs text-slate-500 dark:text-slate-400">' + t + '</div>';
        H.cards.innerHTML =
          card(T.cards.current, 'pi pi-gauge',
            '<div class="text-2xl font-bold text-slate-900 dark:text-white">' + fmt(r.current) + ' <span class="text-sm font-normal">' + esc(u) + '</span></div>' +
            (r.capacity !== null ? sub(pct(r.usagePct) + ' / ' + fmt(r.capacity) + ' ' + esc(u)) : '') +
            (r.capacity === null && st.metric !== 'temp' ? '<div class="text-xs text-amber-600 dark:text-amber-400">' + esc(T.noCapacity) + '</div>' : '') +
            (st.metric === 'cabinets' && s.pending > 0 ? '<div class="text-xs text-orange-600 dark:text-orange-400">+ ' + s.pending + ' ' + esc(u) + ' ' + esc(T.pendingShort) + '</div>' : '')) +
          card(T.cards.monthlyGrowth, 'pi pi-arrow-up-right',
            '<div class="text-2xl font-bold text-slate-900 dark:text-white">' + (r.monthlyGrowth >= 0 ? '+' : '') + fmt(r.monthlyGrowth) + ' <span class="text-sm font-normal">' + esc(u) + '</span></div>' +
            (r.capacity ? sub(pct(r.monthlyGrowth / r.capacity * 100) + ' / ' + T.month) : '')) +
          card(T.cards.toThreshold, 'pi pi-exclamation-triangle',
            '<div class="text-base font-bold ' + sevCls + '">' + esc(r.threshold !== null ? remaining(r.daysToThreshold, s.lastDate) : '-') + '</div>' +
            (r.threshold !== null ? sub(st.metric === 'temp' ? fmt(r.threshold) + ' ' + esc(u) : '%' + st.thresholdPct + ' = ' + fmt(r.threshold) + ' ' + esc(u)) : '') +
            (s.committed && r.threshold !== null ? '<div class="text-xs text-orange-600 dark:text-orange-400">' + esc(T.committedShort) + ': ' + esc(remaining(s.committed.daysToThreshold, s.lastDate)) + '</div>' : '')) +
          card(T.cards.toFull, 'pi pi-ban',
            '<div class="text-base font-bold text-slate-900 dark:text-white">' + esc(r.capacity !== null ? remaining(r.daysToFull, s.lastDate) : '-') + '</div>' +
            sub(st.horizonMonths + ' ' + T.months + ': ' + fmt(r.horizonValue) + ' ' + esc(u) + (r.horizonPct !== null ? ' (' + pct(r.horizonPct) + ')' : ''))) +
          card(T.cards.confidence, 'pi pi-check-circle',
            '<div class="text-2xl font-bold ' + qCls + '">' + (q ? esc(T.quality[q.level]) : '-') + '</div>' +
            (q ? sub(T.quality.error + ' ' + pct(q.error) + ' (' + q.holdoutDays + ' ' + T.days + ')') : sub(T.quality.na)) +
            (an ? sub(esc(modelName(an.best)) + ' · ' + an.nObs + ' ' + T.days) : ''));
      }

      // ---- grafik kartı (2D / 3D)
      function renderChartCard() {
        disposeChart('main');
        if (ridge3d) { ridge3d.destroy(); ridge3d = null; }
        const s = st.selected;
        if (!s) { H.chart.innerHTML = ''; return; }
        const tgl = m => '<button type="button" data-mode="' + m + '" aria-pressed="' + (st.chartMode === m) + '" class="px-3 py-1 transition-colors' + (m === '3d' ? ' border-l border-slate-300 dark:border-slate-600' : '') + ' ' +
          (st.chartMode === m ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' + m.toUpperCase() + '</button>';
        const body =
          '<div class="flex justify-end mb-2"><div class="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-xs font-semibold" role="group" aria-label="2D / 3D">' + tgl('2d') + tgl('3d') + '</div></div>' +
          (st.chartMode === '2d'
            ? '<div data-chart="main" class="h-96 w-full"></div>'
            : '<div data-fc3d-summary class="flex flex-wrap items-center gap-2 mb-2 text-xs"></div>' +
              '<div data-fc3d-host class="fc3d-host relative w-full h-[460px] rounded-xl overflow-hidden ' + (isDark() ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950' : 'bg-gradient-to-b from-white via-slate-50 to-slate-100') + '">' +
                '<div data-fc3d-tip class="pointer-events-none absolute z-10 hidden rounded-lg px-3 py-2 text-xs shadow-lg leading-5 border ' + (isDark() ? 'bg-slate-800/95 text-slate-100 border-slate-700' : 'bg-white/95 text-slate-800 border-slate-200') + '"></div>' +
              '</div>') +
          '<p class="mt-2 text-xs text-slate-500 dark:text-slate-400">' + esc(st.chartMode === '3d' ? T.chart3d.hint : T.chartNote) + '</p>';
        H.chart.innerHTML = kit.card({ title: s.label, icon: 'pi pi-chart-line', body });
        if (st.chartMode === '2d') chartOn('main', H.chart.querySelector('[data-chart="main"]'), mainOption());
        else render3d();
      }

      function render3dSummary() {
        const host = H.chart.querySelector('[data-fc3d-summary]');
        const d = st.ridge;
        if (!host || !d) return;
        const chips = [3, 6, 12, 24].map(m => {
          const r = d.months[m - 1];
          if (!r) return '';
          const p = d.threshold !== null ? pAbove(r.mean, r.se, d.threshold) : null;
          const cls = p === null ? 'border-slate-300 dark:border-slate-600' : p >= 0.5 ? 'border-rose-400 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : p >= 0.1 ? 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-400 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
          return '<div class="rounded-lg px-2.5 py-1.5 border ' + cls + '"><div class="opacity-80">+' + m + ' ' + T.month + ' · ' + esc(r.label) + '</div>' +
            '<div class="font-bold text-sm">' + (p === null ? fmt(r.mean) + ' ' + esc(d.unit) : '%' + pctTxt(p)) + '</div></div>';
        }).join('');
        host.innerHTML = chips +
          (d.threshold !== null ? '<span class="text-slate-500 dark:text-slate-400">' + esc(T.chart3d.pThr) + ' (' + esc(d.thresholdText) + ')</span>' : '') +
          '<button type="button" data-fc3d-reset class="ml-auto text-slate-500 hover:text-sky-500" title="Görünümü sıfırla"><i class="pi pi-refresh"></i></button>';
        host.querySelector('[data-fc3d-reset]').addEventListener('click', () => { if (ridge3d) ridge3d.resetView(); });
      }

      function render3d() {
        render3dSummary();
        const host = H.chart.querySelector('[data-fc3d-host]');
        if (!host || !st.ridge) return;
        const token = ++ridgeToken;
        loadThree(ok => {
          if (token !== ridgeToken || !host.isConnected) return;
          let r = null;
          if (ok) {
            try { r = Ridge3D(host, host.querySelector('[data-fc3d-tip]'), isDark()); } catch (e) { console.warn('3D görünüm açılamadı (WebGL):', e && e.message); r = null; }
          }
          if (r) { ridge3d = r; r.build(st.ridge, true); return; }
          // WebGL / Three.js yok: ECharts ısı haritası (ay × değer, renk = yoğunluk)
          host.innerHTML = '<div data-chart="ridgeHeat" class="absolute inset-0"></div>';
          chartOn('main', host.querySelector('[data-chart="ridgeHeat"]'), heatOption());
        });
      }

      function heatOption() {
        const d = st.ridge, c = chartColors(isDark());
        const M = d.months, BINS = 40;
        let lo = Math.min.apply(null, M.map(m => m.mean - 3 * m.se)), hi = Math.max.apply(null, M.map(m => m.mean + 3 * m.se));
        [d.current, d.threshold, d.capacity].forEach(v => { if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
        const step = (hi - lo) / BINS || 1;
        const data = [];
        let maxD = 0;
        M.forEach((m, i) => {
          for (let b = 0; b < BINS; b++) {
            const v0 = lo + b * step, v1 = v0 + step;
            const pr = m.se > 0 ? normCdf((v1 - m.mean) / m.se) - normCdf((v0 - m.mean) / m.se) : (m.mean >= v0 && m.mean < v1 ? 1 : 0);
            maxD = Math.max(maxD, pr);
            data.push([i, b, pr]);
          }
        });
        const yLabels = Array.from({ length: BINS }, (_, b) => fmt(lo + (b + 0.5) * step));
        const thrBin = d.threshold !== null ? Math.floor((d.threshold - lo) / step) : null;
        return {
          backgroundColor: 'transparent',
          tooltip: { formatter: p => esc(M[p.value[0]].label) + '<br>' + yLabels[p.value[1]] + ' ' + esc(d.unit) + ': %' + (p.value[2] * 100).toFixed(1) +
            (d.threshold !== null ? '<br>' + esc(T.chart3d.pThr) + ': %' + pctTxt(pAbove(M[p.value[0]].mean, M[p.value[0]].se, d.threshold)) : '') },
          grid: { left: 70, right: 30, top: 20, bottom: 70 },
          xAxis: { type: 'category', data: M.map(m => m.label), axisLabel: { color: c.text } },
          yAxis: { type: 'category', data: yLabels, name: d.unit, axisLabel: { color: c.text, interval: 4 } },
          visualMap: { min: 0, max: maxD || 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 6, itemHeight: 120, textStyle: { color: c.text },
            inRange: { color: isDark() ? ['#0f172a', '#0369a1', '#38bdf8', '#a78bfa'] : ['#f8fafc', '#7dd3fc', '#0284c7', '#7c3aed'] }, formatter: v => '%' + (v * 100).toFixed(0) },
          series: [{ type: 'heatmap', data,
            markLine: thrBin !== null ? { symbol: 'none', silent: true, data: [{ yAxis: yLabels[Math.max(0, Math.min(BINS - 1, thrBin))] }], lineStyle: { color: c.warn, type: 'dashed' }, label: { formatter: d.thresholdText, color: c.text } } : undefined }]
        };
      }

      function mainOption() {
        const row = st.selected;
        if (!sel || !row) return {};
        const c = chartColors(isDark());
        const an = st.analysis, pts = sel.pts, proj = sel.proj, committed = sel.committed;
        const capacity = sel.capacity, threshold = sel.threshold, lastDate = sel.lastDate, start = sel.start, avg = sel.avg;
        const u = unit();
        const vals = pts.map(p => p.v).concat(proj.reduce((a, p) => a.concat([p.lo, p.hi]), []), committed.map(p => p.y));
        if (threshold !== null) vals.push(threshold);
        if (capacity !== null) vals.push(capacity);
        let yMin = Math.min.apply(null, vals), yMax = Math.max.apply(null, vals);
        const span = yMax - yMin || Math.abs(yMax) || 1;
        yMin -= span * 0.05; yMax += span * 0.05;
        if (Math.min.apply(null, pts.map(p => p.v)) >= 0) yMin = Math.max(0, yMin);
        const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
        yMin = Math.floor(yMin / mag) * mag; yMax = Math.ceil(yMax / mag) * mag;

        const crossings = [];
        let thrDate = null;
        const mark = (target, days, color, text) => {
          if (days === null || days <= 0 || days > horizonDays()) return null;
          const date = addDays(lastDate, days);
          crossings.push({ t: date.getTime(), v: target, color, text: text + ' → ' + monthYear(date) });
          return date;
        };
        if (an) {
          if (threshold !== null) thrDate = mark(threshold, row.result.daysToThreshold, c.warn, st.metric === 'temp' ? fmt(threshold) + ' ' + u : '%' + st.thresholdPct);
          if (capacity !== null) mark(capacity, row.result.daysToFull, c.danger, T.capacity);
        }
        const zones = [];
        if (threshold !== null) {
          zones.push([{ yAxis: yMin, itemStyle: { color: c.zoneOk } }, { yAxis: threshold }]);
          zones.push([{ yAxis: threshold, itemStyle: { color: capacity !== null ? c.zoneWarn : c.zoneOver } }, { yAxis: capacity !== null ? capacity : yMax }]);
          if (capacity !== null) zones.push([{ yAxis: capacity, itemStyle: { color: c.zoneOver } }, { yAxis: yMax }]);
        }
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const markLines = [{ xAxis: today.getTime(), lineStyle: { color: c.muted, type: 'dotted', width: 1 }, label: { formatter: T.today, position: 'end', color: c.text } }];
        if (threshold !== null) markLines.push({ yAxis: threshold, lineStyle: { color: c.warn, type: 'dashed' }, label: { formatter: T.threshold + ' ' + fmt(threshold) + ' ' + u, position: 'insideStartTop', color: c.text } });
        if (capacity !== null) markLines.push({ yAxis: capacity, lineStyle: { color: c.danger, type: 'solid' }, label: { formatter: T.capacity + ' ' + fmt(capacity) + ' ' + u, position: 'insideStartTop', color: c.text } });
        const x0 = start.getTime(), x1 = addDays(lastDate, horizonDays()).getTime();
        const markPoints = crossings.map(k => {
          const frac = (k.t - x0) / Math.max(1, x1 - x0);
          const align = frac > 0.8 ? 'right' : frac < 0.2 ? 'left' : 'center';
          return {
            coord: [ymd(new Date(k.t)), k.v], symbol: 'circle', symbolSize: 12,
            itemStyle: { color: k.color, borderColor: c.surface, borderWidth: 2 },
            label: { show: true, position: 'bottom', distance: 10, align, offset: [align === 'right' ? 8 : align === 'left' ? -8 : 0, 0], formatter: k.text,
              color: c.text, backgroundColor: c.surface, borderColor: k.color, borderWidth: 1, borderRadius: 4, padding: [4, 6], fontSize: 12 }
          };
        });
        const bandSeries = (name, values, alpha) => ({
          name, type: 'line', stack: 'band', showSymbol: false, silent: true, z: 1,
          data: proj.map((p, i) => [ymd(p.date), values[i]]), lineStyle: { opacity: 0 },
          areaStyle: alpha === null ? { opacity: 0 } : { color: 'rgba(' + c.band + ',' + Math.min(1, alpha * c.fill) + ')' },
          tooltip: { show: false }, emphasis: { disabled: true }
        });
        const band = proj.length ? [
          bandSeries('b95lo', proj.map(p => p.lo), null),
          bandSeries('b95a', proj.map(p => p.lo80 - p.lo), 0.08),
          bandSeries('b80a', proj.map(p => p.lo50 - p.lo80), 0.13),
          bandSeries('b50', proj.map(p => p.hi50 - p.lo50), 0.2),
          bandSeries('b80b', proj.map(p => p.hi80 - p.hi50), 0.13),
          bandSeries('b95b', proj.map(p => p.hi - p.hi80), 0.08)
        ] : [];
        const n = { daily: T.daily, avg: T.avg7, fc: T.forecastLine + (an ? ' · ' + modelName(an.best) : ''), committed: T.committed };
        const shown = new Set([n.daily, n.avg, n.fc, n.committed]);
        return {
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'axis',
            formatter: params => {
              const list = (Array.isArray(params) ? params : [params]).filter(p => shown.has(p.seriesName));
              if (!list.length) return '';
              const time = list[0].axisValue;
              const head = new Date(time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
              const lines = list.map(p => {
                const v = Array.isArray(p.value) ? +p.value[1] : +p.value;
                const share = capacity !== null ? ' (' + pct(v / capacity * 100) + ')' : '';
                return p.marker + p.seriesName + ': <b>' + fmt(v) + ' ' + esc(u) + '</b>' + share;
              });
              const main = list.find(p => p.seriesName === n.fc) || list.find(p => p.seriesName === n.avg) || list[0];
              const mv = Array.isArray(main.value) ? +main.value[1] : +main.value;
              if (capacity !== null) lines.push(T.remainingCap + ': ' + fmt(capacity - mv) + ' ' + esc(u));
              if (threshold !== null) {
                if (mv >= threshold) lines.push(T.exceeded);
                else if (thrDate) lines.push(T.toThresholdIn + ': ' + Math.round((thrDate.getTime() - new Date(time).getTime()) / 86400000) + ' ' + T.days);
              }
              return head + '<br/>' + lines.join('<br/>');
            }
          },
          legend: { top: 0, left: 0, textStyle: { color: c.text }, data: [n.daily, n.avg, n.fc].concat(committed.length ? [n.committed] : []) },
          toolbox: { right: 8, top: 0, iconStyle: { borderColor: c.muted },
            feature: { saveAsImage: { title: T.saveImage, name: 'kapasite_tahmini_' + st.metric + '_' + D.endDate, backgroundColor: c.surface, pixelRatio: 2 } } },
          grid: { left: 64, right: 30, top: 56, bottom: 40 },
          xAxis: { type: 'time', axisLabel: { color: c.text }, splitLine: { show: false } },
          yAxis: { type: 'value', name: u, nameTextStyle: { color: c.text }, axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } }, min: yMin, max: yMax },
          series: band.concat([
            { name: n.daily, type: 'line', showSymbol: false, z: 2, data: pts.map(p => [p.tim, p.v]), lineStyle: { width: 1, color: c.series, opacity: c.daily }, itemStyle: { color: c.series } },
            { name: n.avg, type: 'line', showSymbol: false, smooth: 0.3, z: 3, data: pts.map((p, i) => [p.tim, avg[i]]), lineStyle: { width: 2, color: c.series }, itemStyle: { color: c.series },
              areaStyle: { color: 'rgba(' + c.band + ',' + (0.08 * c.fill) + ')', origin: 'start' },
              markArea: { silent: true, data: zones },
              markLine: { symbol: 'none', silent: true, data: markLines } },
            { name: n.fc, type: 'line', showSymbol: false, z: 3, data: proj.map(p => [ymd(p.date), p.y]), lineStyle: { type: 'dashed', width: 2, color: c.series }, itemStyle: { color: c.series },
              markPoint: { silent: true, data: markPoints } }
          ]).concat(committed.length ? [{ name: n.committed, type: 'line', showSymbol: false, z: 3, data: committed.map(p => [ymd(p.date), p.y]), lineStyle: { type: 'dotted', width: 2, color: c.committed }, itemStyle: { color: c.committed } }] : [])
        };
      }

      // ---- model analizi
      function renderAnalysis() {
        const an = st.analysis;
        if (!st.selected || !an) { H.analysis.innerHTML = ''; return; }
        const errs = an.scores.map(x => x.error || 0);
        const max = Math.max.apply(null, errs.concat([0.0001]));
        const width = sc => sc.error === null ? 0 : Math.max(3, sc.error / max * 100);
        const step = (icon, iconCls, delay, html) => '<li class="fc-step flex items-start gap-2" style="animation-delay: ' + delay + 'ms"><i class="' + icon + ' ' + iconCls + ' mt-0.5"></i><span>' + html + '</span></li>';
        const body =
          '<div class="grid grid-cols-1 lg:grid-cols-2 gap-5">' +
            '<ol class="space-y-2.5 text-sm">' +
              step('pi pi-database', 'text-sky-500', 0, '<b>' + T.analysis.data + ':</b> ' + an.nObs + ' ' + T.analysis.dataTxt) +
              step('pi pi-cog', 'text-sky-500', 250, '<b>' + T.analysis.train + ':</b> ' + an.scores.length + ' ' + T.analysis.trainTxt + ' (' + an.trainDays + ' ' + T.days + ')') +
              step('pi pi-replay', 'text-sky-500', 500, '<b>' + T.analysis.backtest + ':</b> ' + an.holdoutDays + ' ' + T.analysis.backtestTxt) +
              step('pi pi-check-circle', 'text-emerald-500', 750, '<b>' + T.analysis.select + ':</b> ' + esc(modelName(an.best)) + (an.error !== null ? ' — ' + T.quality.error + ' ' + pct(an.error) : '')) +
            '</ol>' +
            '<div class="space-y-2">' +
              '<div class="text-xs text-slate-500 dark:text-slate-400">' + T.analysis.errorAxis + '</div>' +
              an.scores.map(sc =>
                '<div class="flex items-center gap-2 text-xs">' +
                  '<span class="w-44 truncate ' + (sc.key === an.best ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300') + '">' + esc(modelName(sc.key)) + '</span>' +
                  '<div class="flex-1 h-2.5 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="fc-bar h-2.5 rounded ' + (sc.key === an.best ? 'bg-sky-500' : 'bg-slate-400 dark:bg-slate-500') + '" style="width:' + width(sc).toFixed(1) + '%"></div></div>' +
                  '<span class="w-14 text-right tabular-nums">' + (sc.error === null ? '-' : pct(sc.error)) + '</span>' +
                  '<i class="pi w-4 ' + (sc.key === an.best ? 'pi-check text-sky-500' : '') + '"></i>' +
                '</div>').join('') +
              '<p class="text-xs text-slate-500 dark:text-slate-400 pt-1">' + esc(T.modelDesc[an.best]) + (an.params ? ' (' + esc(an.params) + ')' : '') + '</p>' +
            '</div>' +
          '</div>';
        H.analysis.innerHTML = kit.card({ title: T.analysis.title, subtitle: T.analysis.hint, icon: 'pi pi-sitemap', body });
      }

      // ---- ne zaman doluyor
      function renderRunway() {
        disposeChart('runway');
        const rows = st.runwayRows;
        if (!rows.length) { H.runway.innerHTML = ''; return; }
        const height = Math.max(140, rows.length * 34 + 60);
        H.runway.innerHTML = kit.card({ title: T.runway.title, subtitle: T.runway.hint, icon: 'pi pi-hourglass', body: '<div data-chart="runway" class="w-full" style="height:' + height + 'px"></div>' });
        const c = chartColors(isDark());
        const cap = st.horizonMonths * 1.25;
        const items = rows.map(r => {
          const d = r.result.daysToThreshold;
          let value, color, text;
          if (d === 0) { value = cap * 0.02; color = c.danger; text = T.exceeded; }
          else if (d === null) { value = cap; color = c.ok; text = T.notReached; }
          else {
            value = Math.min(d / 30.4, cap);
            color = d <= 182 ? c.soon : d <= horizonDays() ? c.warn : c.ok;
            text = (d / 30.4).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' ' + T.months + ' · ' + monthYear(addDays(parseYmd(r.lastDate), d));
          }
          return { value, text, itemStyle: { color, borderRadius: [0, 4, 4, 0] } };
        });
        const chart = chartOn('runway', H.runway.querySelector('[data-chart="runway"]'), {
          backgroundColor: 'transparent', tooltip: { show: false },
          grid: { left: 10, right: 150, top: 24, bottom: 24, containLabel: true },
          xAxis: { type: 'value', min: 0, max: cap, axisLabel: { color: c.text, formatter: v => v + ' ' + T.months }, splitLine: { lineStyle: { color: c.grid } } },
          yAxis: { type: 'category', inverse: true, data: rows.map(r => r.label), axisLabel: { color: c.text }, axisTick: { show: false }, axisLine: { show: false } },
          series: [{
            type: 'bar', barMaxWidth: 22, cursor: 'pointer', data: items,
            label: { show: true, position: 'right', color: c.text, formatter: p => items[p.dataIndex].text },
            markLine: { symbol: 'none', silent: true, data: [{ xAxis: st.horizonMonths }], lineStyle: { color: c.muted, type: 'dashed' }, label: { formatter: T.horizon, color: c.muted, position: 'end' } }
          }]
        });
        if (chart) chart.on('click', e => {
          const row = rows[e && e.dataIndex];
          if (!row) return;
          if (st.level === 'salon') { select(st.rows.find(r => r.node === row.node) || row); return; }
          st.level = 'salon';
          pendingSelect = row.node;
          renderFilters();
          reload();
        });
      }

      // ---- iş emri talebi
      function demandFor(row) {
        const m = {};
        D.demand.forEach(d => {
          if (!(row.node === 'ALL' || (d.node && row.path && d.path.indexOf(row.path) === 0))) return;
          const e = m[d.ym] || (m[d.ym] = { done: 0, open: 0 });
          e[d.kind] += d.qty;
        });
        return m;
      }
      function renderDemand() {
        disposeChart('demand');
        const row = st.selected;
        if (!row || st.metric !== 'cabinets') { H.demand.innerHTML = ''; return; }
        const m = demandFor(row);
        const months = Object.keys(m).sort();
        const um = {};
        D.demand.forEach(d => { if (!d.node && d.kind === 'open') um[d.path] = (um[d.path] || 0) + d.qty; });
        const unmatched = Object.keys(um).map(p => ({ path: p, qty: um[p] }));
        H.demand.innerHTML = kit.card({
          title: T.demand.title, subtitle: T.demand.hint, icon: 'pi pi-briefcase',
          body: (months.length ? '<div data-chart="demand" class="h-56 w-full"></div>' : '<p class="text-xs text-slate-500 dark:text-slate-400">' + esc(T.demand.none) + '</p>') +
            (unmatched.length ? '<div class="mt-2 text-xs text-amber-600 dark:text-amber-400">' + esc(T.demand.unmatched) + ' ' + unmatched.map(u => esc(u.path) + ' (' + u.qty + ')').join(', ') + '</div>' : '')
        });
        if (!months.length) return;
        const c = chartColors(isDark());
        chartOn('demand', H.demand.querySelector('[data-chart="demand"]'), {
          backgroundColor: 'transparent', tooltip: { trigger: 'axis' }, legend: { top: 0, textStyle: { color: c.text } },
          grid: { left: 50, right: 20, top: 36, bottom: 30 },
          xAxis: { type: 'category', data: months, axisLabel: { color: c.text } },
          yAxis: { type: 'value', minInterval: 1, axisLabel: { color: c.text }, splitLine: { lineStyle: { color: c.grid } } },
          series: [
            { name: T.demand.done, type: 'bar', stack: 'd', data: months.map(k => m[k].done), itemStyle: { color: '#0ea5e9' } },
            { name: T.demand.open, type: 'bar', stack: 'd', data: months.map(k => m[k].open), itemStyle: { color: '#f97316' } }
          ]
        });
      }

      // ---- seviye tablosu
      function renderTable() {
        if (!st.rows.length) { H.table.innerHTML = ''; return; }
        const u = unit(), t = st.metric !== 'temp', cb = st.metric === 'cabinets';
        const th = (l, right) => '<th class="py-2 pr-3' + (right ? ' text-right' : '') + '">' + esc(l) + '</th>';
        const sevCls = r => ({ danger: 'text-rose-600 dark:text-rose-400 font-semibold', warning: 'text-amber-600 dark:text-amber-400 font-semibold' }[severity(r)] || '');
        const bar = r => { const v = r.result.usagePct || 0; return v >= 100 ? 'bg-rose-500' : v >= st.thresholdPct ? 'bg-amber-500' : 'bg-emerald-500'; };
        const body =
          '<div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-border-subtle">' +
            th(T.columns.location) + th(T.columns.current + ' (' + u + ')', true) +
            (t ? th(T.columns.capacity + ' (' + u + ')', true) + th(T.columns.usage, true) : '') +
            th(T.columns.monthlyGrowth, true) + th(T.columns.toThreshold) + (t ? th(T.columns.toFull) : '') +
            (cb ? th(T.columns.pending, true) + th(T.columns.committedToThreshold) : '') + th(T.columns.confidence, true) +
          '</tr></thead><tbody>' +
          st.rows.map((r, i) =>
            '<tr data-row="' + i + '" class="border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-surface-hover' + (st.selected && st.selected.node === r.node ? ' bg-sky-50 dark:bg-sky-900/20' : '') + '">' +
              '<td class="py-1.5 pr-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">' + esc(r.label) + '</td>' +
              '<td class="py-1.5 pr-3 text-right">' + fmt(r.result.current) + '</td>' +
              (t ? '<td class="py-1.5 pr-3 text-right">' + fmt(r.result.capacity) + '</td>' +
                '<td class="py-1.5 pr-3"><div class="flex items-center justify-end gap-2">' +
                  (r.result.usagePct !== null ? '<div class="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div class="h-full rounded-full ' + bar(r) + '" style="width:' + Math.max(0, Math.min(100, r.result.usagePct)).toFixed(1) + '%"></div></div>' : '') +
                  '<span class="w-12 text-right">' + pct(r.result.usagePct) + '</span></div></td>' : '') +
              '<td class="py-1.5 pr-3 text-right">' + (r.result.monthlyGrowth >= 0 ? '+' : '') + fmt(r.result.monthlyGrowth) + '</td>' +
              '<td class="py-1.5 pr-3 ' + sevCls(r) + '">' + esc(r.result.threshold !== null ? remaining(r.result.daysToThreshold, r.lastDate) : '-') + '</td>' +
              (t ? '<td class="py-1.5 pr-3">' + esc(r.result.capacity !== null ? remaining(r.result.daysToFull, r.lastDate) : '-') + '</td>' : '') +
              (cb ? '<td class="py-1.5 pr-3 text-right">' + (r.pending || '-') + '</td><td class="py-1.5 pr-3">' + esc(r.committed && r.result.threshold !== null ? remaining(r.committed.daysToThreshold, r.lastDate) : '-') + '</td>' : '') +
              '<td class="py-1.5 pr-3 text-right">' + (r.fit.r2 !== null ? fmt(r.fit.r2, 2) : '-') + '</td>' +
            '</tr>').join('') +
          '</tbody></table></div>';
        H.table.innerHTML = kit.card({ title: T.levels[st.level], subtitle: T.tableHint, icon: 'pi pi-list', body });
      }

      // ---- salon limitleri (CAP_LIMIT)
      const canEditLimits = true;   // sunum oturumu: Admin
      const floorCapacity = l => l.floor_kg_m2 !== null && l.floor_kg_m2 !== '' && l.area_m2 !== null && l.area_m2 !== '' ? l.floor_kg_m2 * l.area_m2 : null;
      function renderLimits() {
        const inp = (l, k, step) => '<input type="number" min="0"' + (step ? ' step="' + step + '"' : '') + ' class="scada-input w-24 h-7" data-lim="' + esc(l.location_id) + '" data-k="' + k + '" value="' + (l[k] === null ? '' : l[k]) + '"' + (canEditLimits ? '' : ' disabled') + '>';
        const table = !st.showLimits ? '' :
          '<div class="mt-3 overflow-x-auto">' +
            (!canEditLimits ? '<p class="mb-2 text-xs text-slate-500 dark:text-slate-400">' + esc(T.limits.readOnly) + '</p>' : '') +
            (st.limitMsg ? '<p class="mb-2 text-xs text-sky-600 dark:text-sky-400">' + esc(st.limitMsg) + '</p>' : '') +
            '<table class="w-full text-xs"><thead><tr class="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-border-subtle">' +
              '<th class="py-2 pr-3">' + T.columns.location + '</th><th class="py-2 pr-3 text-right">' + T.limits.nCab + '</th><th class="py-2 pr-3">' + T.limits.maxCab + '</th>' +
              '<th class="py-2 pr-3">' + T.limits.floorKgM2 + '</th><th class="py-2 pr-3">' + T.limits.areaM2 + '</th><th class="py-2 pr-3 text-right">' + T.limits.floorKg + '</th>' +
              '<th class="py-2 pr-3">' + T.limits.coolKw + '</th><th class="py-2 pr-3">' + T.limits.updated + '</th>' + (canEditLimits ? '<th class="py-2 pr-3"></th>' : '') +
            '</tr></thead><tbody>' +
            D.limits.map(l =>
              '<tr class="border-b border-slate-100 dark:border-slate-800">' +
                '<td class="py-1.5 pr-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">' + esc(l.label) + '</td>' +
                '<td class="py-1.5 pr-3 text-right">' + l.n_cab + '</td>' +
                '<td class="py-1.5 pr-3">' + inp(l, 'max_cab', 1) + '</td>' +
                '<td class="py-1.5 pr-3">' + inp(l, 'floor_kg_m2') + '</td>' +
                '<td class="py-1.5 pr-3">' + inp(l, 'area_m2') + '</td>' +
                '<td class="py-1.5 pr-3 text-right">' + fmt(floorCapacity(l), 0) + '</td>' +
                '<td class="py-1.5 pr-3">' + inp(l, 'cool_kw') + '</td>' +
                '<td class="py-1.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">' + esc(l.usr + ' ' + l.tim) + '</td>' +
                (canEditLimits ? '<td class="py-1.5 pr-3">' + button({ variant: 'primary', size: 'sm', icon: 'pi pi-save', label: T.limits.save, attrs: 'data-save="' + esc(l.location_id) + '"' }) + '</td>' : '') +
              '</tr>').join('') +
            '</tbody></table></div>';
        H.limits.innerHTML = kit.card({
          title: T.limits.title, subtitle: T.limits.hint, icon: 'pi pi-sliders-h',
          body: button({ variant: 'secondary', icon: 'pi pi-sliders-h', label: st.showLimits ? T.limits.hide : T.limits.show, attrs: 'data-act="limits"' }) + table
        });
      }
      function saveLimit(id) {
        const l = D.limits.find(x => x.location_id === id);
        if (!l) return;
        const vals = {};
        let bad = false;
        H.limits.querySelectorAll('[data-lim="' + id + '"]').forEach(inp => {
          const v = inp.value.trim();
          const n = v === '' ? null : +v;
          if (n !== null && (!Number.isFinite(n) || n < 0)) bad = true;
          vals[inp.getAttribute('data-k')] = n;
        });
        if (bad) { st.limitMsg = T.limits.saveFailed; renderLimits(); return; }
        Object.assign(l, vals);
        const d = new Date();
        l.usr = (DCIM.session && DCIM.session.user && DCIM.session.user().usr) || 'admin';
        l.tim = d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        st.limitMsg = T.limits.saved;
        toast(l.label + ': ' + T.limits.saved, 'success', T.limits.title);
        recompute();
      }

      // ---- dışa aktarma (XLSX yerine ';' ayraçlı CSV)
      function exportExcel() {
        const h = k => T.columns[k];
        const u = unit();
        const cols = [
          { header: h('location'), value: r => r.label },
          { header: h('current') + ' (' + u + ')', value: r => r.result.current !== null ? +r.result.current.toFixed(2) : '' },
          { header: h('capacity') + ' (' + u + ')', value: r => r.result.capacity !== null ? +r.result.capacity.toFixed(2) : '' },
          { header: h('usage') + ' (%)', value: r => r.result.usagePct !== null ? +r.result.usagePct.toFixed(1) : '' },
          { header: h('monthlyGrowth') + ' (' + u + ')', value: r => +r.result.monthlyGrowth.toFixed(2) },
          { header: h('toThreshold'), value: r => remaining(r.result.daysToThreshold, r.lastDate) },
          { header: h('toFull'), value: r => st.metric === 'temp' ? '-' : remaining(r.result.daysToFull, r.lastDate) },
          { header: h('horizonValue') + ' (' + u + ')', value: r => +r.result.horizonValue.toFixed(2) },
          { header: h('confidence') + ' (R²)', value: r => r.fit.r2 !== null ? +r.fit.r2.toFixed(3) : '' }
        ];
        if (st.metric === 'cabinets') {
          cols.push({ header: h('pending'), value: r => r.pending });
          cols.push({ header: h('committedToThreshold'), value: r => r.committed ? remaining(r.committed.daysToThreshold, r.lastDate) : '-' });
        }
        kit.exportExcel('kapasite_tahmini_' + st.metric + '_' + st.level + '_' + D.endDate, cols, st.rows);
      }

      function select(row) {
        st.selected = row;
        computeSelected();
        renderCards();
        renderChartCard();
        renderAnalysis();
        renderDemand();
        renderTable();
      }

      function renderAll() {
        renderHeader();
        renderCards();
        renderChartCard();
        renderAnalysis();
        renderRunway();
        renderDemand();
        renderTable();
        renderLimits();
      }

      // ---- olaylar
      el.addEventListener('change', e => {
        const f = e.target.getAttribute && e.target.getAttribute('data-f');
        if (!f) return;
        const v = e.target.value;
        if (f === 'metric') {
          st.metric = v;
          if (def().levels.indexOf(st.level) < 0) st.level = 'general';
          renderFilters();
          reload();
        } else if (f === 'level' || f === 'windowDays' || f === 'agg') {
          st[f] = f === 'windowDays' ? +v : v;
          reload();
        } else {
          const n = +v;
          if (!Number.isFinite(n) || n <= 0) return;
          st[f] = n;
          recompute();
        }
      });
      el.addEventListener('click', e => {
        const t = e.target.closest('[data-act],[data-mode],[data-row],[data-save]');
        if (!t || !el.contains(t)) return;
        if (t.hasAttribute('data-mode')) {
          const m = t.getAttribute('data-mode');
          if (m !== st.chartMode) { st.chartMode = m; renderChartCard(); }
        } else if (t.hasAttribute('data-row')) {
          const r = st.rows[+t.getAttribute('data-row')];
          if (r) select(r);
        } else if (t.hasAttribute('data-save')) {
          saveLimit(t.getAttribute('data-save'));
        } else {
          const a = t.getAttribute('data-act');
          if (a === 'reload') reload();
          else if (a === 'excel') exportExcel();
          else if (a === 'limits') { st.showLimits = !st.showLimits; renderLimits(); }
        }
      });
      const onResize = () => Object.keys(charts).forEach(k => charts[k].resize());
      window.addEventListener('resize', onResize);
      const onTheme = () => { renderChartCard(); renderRunway(); renderDemand(); };
      document.addEventListener('dcim:theme', onTheme);

      renderFilters();
      recompute();
      if (st.showLimits) setTimeout(() => { if (H.limits.scrollIntoView) H.limits.scrollIntoView({ block: 'start' }); }, 50);

      return {
        destroy() {
          ridgeToken++;
          window.removeEventListener('resize', onResize);
          document.removeEventListener('dcim:theme', onTheme);
          Object.keys(charts).forEach(disposeChart);
          if (ridge3d) { ridge3d.destroy(); ridge3d = null; }
        }
      };
    }
  };
})();
