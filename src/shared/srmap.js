// DICOM-SR-Import: Einheiten umrechnen und Messungen Echobefund-Feldern zuordnen.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const m = factory(isNode ? require('./schema') : root.EchoSchema);
  if (isNode) module.exports = m;
  else root.EchoSrMap = m;
})(typeof self !== 'undefined' ? self : this, function (Schema) {
  const MEASURE_BY_ID = Object.fromEntries(Schema.MEASURES.map((m) => [m.id, m]));

  // Umrechnungsfaktoren je Größe (Wert × Faktor = Basiseinheit)
  const UNIT_GROUPS = [
    { mm: 1, cm: 10, m: 1000 },
    { 'mm/s': 0.1, 'cm/s': 1, 'm/s': 100 },
    { mm2: 0.01, cm2: 1, m2: 10000 },
    { ml: 1, cm3: 1, l: 1000 },
    { mmhg: 1, 'mm[hg]': 1, kpa: 7.50062 },
    { '%': 1 },
    { ms: 1, s: 1000 },
    { '': 1, '1': 1, '{ratio}': 1, ratio: 1 },
    { g: 1, kg: 1000 },
    { '/min': 1, '1/min': 1, '{h.b}/min': 1, '{beats}/min': 1, bpm: 1 },
    { w: 1 },
    { 'mm/mmhg': 1, 'mm/mm[hg]': 1 },
    { 'ml/m2': 1 },
    { 'g/m2': 1 },
    { 'cm2/m2': 1 },
    { 'l/min': 1 },
  ];

  function normalizeUnit(u) {
    return String(u == null ? '' : u).trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/\s+/g, '');
  }

  // Liefert den umgerechneten Wert oder null, wenn die Einheiten nicht zusammenpassen.
  function convertUnit(value, fromUnit, toUnit) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (from === to) return value;
    for (const group of UNIT_GROUPS) {
      if (from in group && to in group) return (value * group[from]) / group[to];
    }
    return null;
  }

  const keyOf = (item) => `${item.label}|${item.unit || ''}`;

  // Konservative Namensregeln (englische DICOM-Bezeichnungen). Nur Vorschläge – der Arzt bestätigt.
  const has = (l, re) => re.test(l);
  const RULES = [
    [(l) => has(l, /ejection fraction/) && !has(l, /right/), 'lvef'],
    [(l) => has(l, /global longitudinal strain|\bgls\b/), 'gls'],
    [(l) => has(l, /fractional area change/) && has(l, /right|\brv\b/), 'rvFac'],
    [(l) => has(l, /tricuspid annular plane systolic excursion|\btapse\b/), 'tapse'],
    [(l) => has(l, /(internal|lvid).*systol|lvids|lvesd/), 'lvesd'],
    [(l) => has(l, /(internal|lvid).*diastol|lvidd|lvedd/), 'lvedd'],
    [(l) => has(l, /septum.*diastol|ivsd/), 'ivs'],
    [(l) => has(l, /posterior wall.*diastol|lvpwd/), 'lvpw'],
    [(l) => has(l, /end diastolic volume|lvedv/) && has(l, /left ventric|\blv\b|lvedv/), 'lvedv'],
    [(l) => has(l, /end systolic volume|lvesv/) && has(l, /left ventric|\blv\b|lvesv/), 'lvesv'],
    [(l) => has(l, /left atri.*volume/) && !has(l, /index/), 'laVol'],
    [(l) => has(l, /left atri.*(dimension|diameter)/), 'laDiam'],
    [(l) => has(l, /sinus of valsalva|aortic root/), 'aoSinus'],
    [(l) => has(l, /ascending aorta/), 'aoAsc'],
    [(l) => has(l, /inferior vena cava|\bivc\b/) && has(l, /diam|dimension/), 'vci'],
    [(l) => has(l, /(lvot|left ventricular outflow tract)/) && has(l, /diameter|dimension/), 'lvotD'],
    [(l) => has(l, /(lvot|left ventricular outflow tract)/) && has(l, /velocity time integral|\bvti\b/), 'lvotVti'],
    [(l) => has(l, /vena contracta/) && has(l, /mitral/), 'mrVc'],
    [(l) => has(l, /vena contracta/) && has(l, /aortic/), 'arVc'],
    [(l) => has(l, /vena contracta/) && has(l, /tricuspid/), 'trVc'],
    [(l) => has(l, /effective regurgitant orifice|\beroa\b/) && has(l, /mitral/), 'mrEroa'],
    [(l) => has(l, /effective regurgitant orifice|\beroa\b/) && has(l, /aortic/), 'arEroa'],
    [(l) => has(l, /effective regurgitant orifice|\beroa\b/) && has(l, /tricuspid/), 'trEroa'],
    [(l) => has(l, /regurgitant volume/) && has(l, /mitral/), 'mrRvol'],
    [(l) => has(l, /regurgitant volume/) && has(l, /aortic/), 'arRvol'],
    [(l) => has(l, /pressure half[- ]?time/) && has(l, /aortic/), 'arPht'],
    [(l) => has(l, /aortic valve/) && has(l, /velocity time integral|\bvti\b/), 'avVti'],
    [(l) => has(l, /aortic valve/) && has(l, /mean/) && has(l, /gradient/), 'avPmean'],
    [(l) => has(l, /aortic valve/) && has(l, /peak velocity/), 'avVmax'],
    [(l) => has(l, /mitral valve/) && has(l, /mean/) && has(l, /gradient/), 'mvPmean'],
    [(l) => has(l, /tricuspid/) && has(l, /mean/) && has(l, /gradient/), 'tvPmean'],
    [(l) => has(l, /tricuspid/) && has(l, /regurg/) && has(l, /velocity/), 'trVmax'],
    [(l) => has(l, /pulmon/) && has(l, /valve/) && has(l, /peak velocity/), 'pvVmax'],
    [(l) => has(l, /(e'|e prime|e-prime|tissue)/) && has(l, /septal|medial/), 'ePrimeSept'],
    [(l) => has(l, /(e'|e prime|e-prime|tissue)/) && has(l, /lateral/), 'ePrimeLat'],
    [(l) => has(l, /mitral/) && has(l, /\be[- ]?wave/) && has(l, /velocity/), 'eWave'],
    [(l) => has(l, /mitral/) && has(l, /\ba[- ]?wave/) && has(l, /velocity/), 'aWave'],
  ];

  // Vorschlag für eine Messung. Nur Felder, deren Einheit sich umrechnen lässt.
  function suggestMeasure(label, unit) {
    const l = String(label || '').toLowerCase();
    for (const [test, id] of RULES) {
      if (!test(l)) continue;
      const m = MEASURE_BY_ID[id];
      if (m && convertUnit(1, unit, m.unit) !== null) return id;
      return null;
    }
    return null;
  }

  // Zuordnung für eine Messung: gemerkt > Vorschlag. source: 'gemerkt' | 'vorschlag' | null
  function resolveMapping(item, remembered = {}) {
    const key = keyOf(item);
    if (Object.prototype.hasOwnProperty.call(remembered, key)) {
      const id = remembered[key];
      return { measureId: id && MEASURE_BY_ID[id] ? id : '', source: 'gemerkt' };
    }
    const id = suggestMeasure(item.label, item.unit);
    return { measureId: id || '', source: id ? 'vorschlag' : null };
  }

  // Namen für den Patientenabgleich vergleichbar machen
  function normalizeName(s) {
    return String(s || '').toLowerCase().replace(/[\^,]/g, ' ').replace(/[^a-zäöüß ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
  }

  return { normalizeUnit, convertUnit, keyOf, suggestMeasure, resolveMapping, normalizeName };
});
