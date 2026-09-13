// Abgeleitete Messwerte (KOF, LV-Masse, AÖF, sPAP, ...).
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.EchoCalc = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const has = (...vs) => vs.every((v) => num(v) !== undefined);

  function bsa(heightCm, weightKg, formula) {
    if (!has(heightCm, weightKg) || heightCm <= 0 || weightKg <= 0) return undefined;
    if (formula === 'mosteller') return Math.sqrt((heightCm * weightKg) / 3600);
    return 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725); // DuBois
  }

  // Alter in vollen Jahren am Untersuchungstag (Datumsangaben als JJJJ-MM-TT)
  function ageYears(birthIso, examIso) {
    const b = String(birthIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const e = String(examIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!b || !e) return undefined;
    let age = Number(e[1]) - Number(b[1]);
    if (e[2] + e[3] < b[2] + b[3]) age -= 1;
    return age >= 0 && age < 130 ? age : undefined;
  }

  // ASE-Empfehlung: V. cava ≤ 21 mm + Kollaps > 50 % → 3; > 21 mm + Kollaps < 50 % → 15; sonst 8.
  function estimateRap(vciMm, collapse) {
    if (!has(vciMm) || !collapse || collapse === 'keine Angabe') return undefined;
    const normalCollapse = collapse.startsWith('normal');
    if (vciMm <= 21 && normalCollapse) return 3;
    if (vciMm > 21 && !normalCollapse) return 15;
    return 8;
  }

  // values: eingegebene Messwerte (Zahlen), assess: Beurteilungen, opts: { bsaFormula, age }
  function compute(values, assess = {}, opts = {}) {
    const v = { ...values };
    const out = {};
    const put = (k, x) => { if (num(x) !== undefined) out[k] = x; };

    put('bsa', bsa(v.groesse, v.gewicht, opts.bsaFormula));
    const kof = out.bsa;
    put('age', opts.age);

    if (has(v.lvedv, v.lvesv) && v.lvedv > 0) put('lvefSimpson', ((v.lvedv - v.lvesv) / v.lvedv) * 100);
    if (has(v.lvedv, kof)) put('lvedvi', v.lvedv / kof);

    if (has(v.ivs, v.lvedd, v.lvpw)) {
      const cm = (mm) => mm / 10;
      const mass = 0.8 * 1.04 * (Math.pow(cm(v.ivs) + cm(v.lvedd) + cm(v.lvpw), 3) - Math.pow(cm(v.lvedd), 3)) + 0.6;
      put('lvMass', mass);
      if (has(kof)) put('lvmi', mass / kof);
    }
    if (has(v.lvpw, v.lvedd) && v.lvedd > 0) put('rwt', (2 * v.lvpw) / v.lvedd);
    if (has(v.laVol, kof)) put('lavi', v.laVol / kof);

    if (has(v.eWave, v.aWave) && v.aWave > 0) put('ea', v.eWave / v.aWave);
    const ePrimes = [v.ePrimeSept, v.ePrimeLat].filter((x) => num(x) !== undefined && x > 0);
    if (has(v.eWave) && ePrimes.length) put('eePrime', v.eWave / (ePrimes.reduce((a, b) => a + b, 0) / ePrimes.length));

    put('rap', estimateRap(v.vci, assess.vciCollapse));
    if (has(v.trVmax)) put('trPmax', 4 * v.trVmax * v.trVmax);
    if (has(v.spapManual)) put('spap', v.spapManual);
    else if (has(out.trPmax, out.rap)) put('spap', out.trPmax + out.rap);
    if (has(v.tapse, out.spap) && out.spap > 0) put('tapseSpap', v.tapse / out.spap);

    if (has(v.avVmax)) put('avPmax', 4 * v.avVmax * v.avVmax);
    if (has(v.pvVmax)) put('pvPmax', 4 * v.pvVmax * v.pvVmax);

    if (has(v.lvotD, v.lvotVti)) {
      const area = Math.PI * Math.pow(v.lvotD / 20, 2); // mm → Radius in cm
      const sv = area * v.lvotVti;
      put('sv', sv);
      if (has(kof)) put('svi', sv / kof);
      if (has(v.hf)) put('co', (sv * v.hf) / 1000);
      if (has(v.avVti) && v.avVti > 0) {
        put('ava', sv / v.avVti);
        put('dvi', v.lvotVti / v.avVti);
        if (has(kof)) put('avai', out.ava / kof);
      }
    }

    // Stressecho: Zielfrequenz 85 % von (220 − Alter)
    if (has(opts.age)) {
      const hfMaxPred = 220 - opts.age;
      put('stressHfTarget', 0.85 * hfMaxPred);
      if (has(v.stressHfMax) && hfMaxPred > 0) put('stressHfPercent', (v.stressHfMax / hfMaxPred) * 100);
    }

    return { ...v, ...out };
  }

  return { bsa, ageYears, estimateRap, compute };
});
