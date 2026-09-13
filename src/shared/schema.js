// Formular-Definition: Messwerte und Beurteilungen.
// Wird im Renderer (als Global `EchoSchema`) und in Node (require) verwendet.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.EchoSchema = m;
})(typeof self !== 'undefined' ? self : this, function () {
  const GRADES = [
    'leichtgradig',
    'leicht- bis mittelgradig',
    'mittelgradig',
    'mittel- bis hochgradig',
    'hochgradig',
  ];
  const NORMAL_GRADES = ['normal', 'grenzwertig', ...GRADES];
  const INSUFF = ['keine', 'minimal', ...GRADES];
  const STENOSIS = ['keine', ...GRADES];
  const PROSTHESES = ['St.p. biologischem Ersatz', 'St.p. mechanischem Ersatz', 'St.p. TAVI'];

  // Messwerte. derived: wird berechnet (nicht eingebbar).
  const MEASURES = [
    // Basis
    { id: 'groesse', group: 'basis', label: 'Größe', unit: 'cm', dec: 0 },
    { id: 'gewicht', group: 'basis', label: 'Gewicht', unit: 'kg', dec: 0 },
    { id: 'hf', group: 'basis', label: 'Herzfrequenz', abbr: 'HF', unit: '/min', dec: 0 },
    { id: 'bsa', group: 'basis', label: 'KOF', abbr: 'KOF', unit: 'm²', dec: 2, derived: true },

    // Standard
    { id: 'aoSinus', group: 'standard', label: 'Aorta Sinus', abbr: 'Ao-Sinus', unit: 'mm', dec: 0 },
    { id: 'aoAsc', group: 'standard', label: 'Aorta ascendens', abbr: 'Ao asc', unit: 'mm', dec: 0 },
    { id: 'lvedd', group: 'standard', label: 'LVEDD', abbr: 'LVEDD', unit: 'mm', dec: 0 },
    { id: 'lvesd', group: 'standard', label: 'LVESD', abbr: 'LVESD', unit: 'mm', dec: 0 },
    { id: 'ivs', group: 'standard', label: 'IVSd', abbr: 'IVSd', unit: 'mm', dec: 0 },
    { id: 'lvpw', group: 'standard', label: 'LVPWd', abbr: 'LVPWd', unit: 'mm', dec: 0 },
    { id: 'lvef', group: 'standard', label: 'LVEF', abbr: 'LVEF', unit: '%', dec: 0 },
    { id: 'rvBasal', group: 'standard', label: 'RV basal', abbr: 'RVD1', unit: 'mm', dec: 0 },
    { id: 'tapse', group: 'standard', label: 'TAPSE', abbr: 'TAPSE', unit: 'mm', dec: 0 },
    { id: 'laDiam', group: 'standard', label: 'LA (PLAX)', abbr: 'LA', unit: 'mm', dec: 0 },
    { id: 'raDiam', group: 'standard', label: 'RA (quer)', abbr: 'RA', unit: 'mm', dec: 0 },
    { id: 'eWave', group: 'standard', label: 'E', abbr: 'E', unit: 'cm/s', dec: 0 },
    { id: 'aWave', group: 'standard', label: 'A', abbr: 'A', unit: 'cm/s', dec: 0 },
    { id: 'ePrimeSept', group: 'standard', label: "e' septal", abbr: "e' sept", unit: 'cm/s', dec: 1 },
    { id: 'ePrimeLat', group: 'standard', label: "e' lateral", abbr: "e' lat", unit: 'cm/s', dec: 1 },
    { id: 'trVmax', group: 'standard', label: 'TR Vmax', abbr: 'TR Vmax', unit: 'm/s', dec: 1 },
    { id: 'vci', group: 'standard', label: 'VCI', abbr: 'VCI', unit: 'mm', dec: 0 },
    { id: 'spapManual', group: 'standard', label: 'sPAP (manuell)', abbr: 'sPAP', unit: 'mmHg', dec: 0 },

    // Weitere
    { id: 'lvedv', group: 'weitere', label: 'LVEDV', abbr: 'LVEDV', unit: 'ml', dec: 0 },
    { id: 'lvesv', group: 'weitere', label: 'LVESV', abbr: 'LVESV', unit: 'ml', dec: 0 },
    { id: 'laVol', group: 'weitere', label: 'LA-Volumen', abbr: 'LAV', unit: 'ml', dec: 0 },
    { id: 'avVmax', group: 'weitere', label: 'AK Vmax', abbr: 'AK Vmax', unit: 'm/s', dec: 1 },
    { id: 'avPmean', group: 'weitere', label: 'AK Pmean', abbr: 'AK Pmean', unit: 'mmHg', dec: 0 },
    { id: 'avVti', group: 'weitere', label: 'AK VTI', abbr: 'AK VTI', unit: 'cm', dec: 0 },
    { id: 'lvotVti', group: 'weitere', label: 'LVOT VTI', abbr: 'LVOT VTI', unit: 'cm', dec: 0 },
    { id: 'lvotD', group: 'weitere', label: 'LVOT Diameter', abbr: 'LVOT', unit: 'mm', dec: 0 },
    { id: 'mvPmean', group: 'weitere', label: 'MK Pmean', abbr: 'MK Pmean', unit: 'mmHg', dec: 0 },
    { id: 'mva', group: 'weitere', label: 'MÖF (planimetr.)', abbr: 'MÖF', unit: 'cm²', dec: 1 },
    { id: 'tvPmean', group: 'weitere', label: 'TK Pmean', abbr: 'TK Pmean', unit: 'mmHg', dec: 0 },
    { id: 'pvVmax', group: 'weitere', label: 'PK Vmax', abbr: 'PK Vmax', unit: 'm/s', dec: 1 },

    // Berechnet
    { id: 'lvefSimpson', group: 'berechnet', label: 'LVEF (aus Volumina)', abbr: 'LVEF biplan', unit: '%', dec: 0, derived: true },
    { id: 'lvedvi', group: 'berechnet', label: 'LVEDVI', abbr: 'LVEDVI', unit: 'ml/m²', dec: 0, derived: true },
    { id: 'lvMass', group: 'berechnet', label: 'LV-Masse', abbr: 'LV-Masse', unit: 'g', dec: 0, derived: true },
    { id: 'lvmi', group: 'berechnet', label: 'LVMI', abbr: 'LVMI', unit: 'g/m²', dec: 0, derived: true },
    { id: 'rwt', group: 'berechnet', label: 'RWT', abbr: 'RWT', unit: '', dec: 2, derived: true },
    { id: 'lavi', group: 'berechnet', label: 'LAVI', abbr: 'LAVI', unit: 'ml/m²', dec: 0, derived: true },
    { id: 'ea', group: 'berechnet', label: 'E/A', abbr: 'E/A', unit: '', dec: 1, derived: true },
    { id: 'eePrime', group: 'berechnet', label: "E/e' (Mittel)", abbr: "E/e'", unit: '', dec: 1, derived: true },
    { id: 'trPmax', group: 'berechnet', label: 'TR Pmax', abbr: 'TR Pmax', unit: 'mmHg', dec: 0, derived: true },
    { id: 'rap', group: 'berechnet', label: 'RAP (geschätzt)', abbr: 'RAP', unit: 'mmHg', dec: 0, derived: true },
    { id: 'spap', group: 'berechnet', label: 'sPAP', abbr: 'sPAP', unit: 'mmHg', dec: 0, derived: true },
    { id: 'avPmax', group: 'berechnet', label: 'AK Pmax', abbr: 'AK Pmax', unit: 'mmHg', dec: 0, derived: true },
    { id: 'ava', group: 'berechnet', label: 'AÖF (Kontinuität)', abbr: 'AÖF', unit: 'cm²', dec: 2, derived: true },
    { id: 'avai', group: 'berechnet', label: 'AÖFI', abbr: 'AÖFI', unit: 'cm²/m²', dec: 2, derived: true },
    { id: 'dvi', group: 'berechnet', label: 'DVI (LVOT/AK VTI)', abbr: 'DVI', unit: '', dec: 2, derived: true },
    { id: 'sv', group: 'berechnet', label: 'Schlagvolumen', abbr: 'SV', unit: 'ml', dec: 0, derived: true },
    { id: 'svi', group: 'berechnet', label: 'SVI', abbr: 'SVI', unit: 'ml/m²', dec: 0, derived: true },
    { id: 'co', group: 'berechnet', label: 'HZV', abbr: 'HZV', unit: 'l/min', dec: 1, derived: true },
    { id: 'pvPmax', group: 'berechnet', label: 'PK Pmax', abbr: 'PK Pmax', unit: 'mmHg', dec: 0, derived: true },
  ];

  // Beurteilungen. type: 'radio' (Einfachauswahl) | 'multi' (Mehrfachauswahl) | 'wma'
  // auto: id des Normwert-Eintrags (siehe defaults.js NORMS) für automatische Bewertung.
  // measures: Messwerte, die im Text in Klammern ergänzt werden.
  // showIf: { field, in: [...] } bzw. { field, notIn: [...] } bzw. { toggle }
  const SECTIONS = [
    {
      id: 'allgemein', title: 'Allgemein', fields: [
        { id: 'qualitaet', label: 'Bildqualität', type: 'radio', options: ['gut', 'gering eingeschränkt', 'deutlich eingeschränkt', 'schlecht', 'keine Angabe'], default: 'keine Angabe' },
        { id: 'rhythmus', label: 'Rhythmus', type: 'radio', options: ['Sinusrhythmus', 'Vorhofflimmern', 'Schrittmacherrhythmus', 'keine Angabe'], default: 'keine Angabe', measures: ['hf'] },
      ],
    },
    {
      id: 'lv', title: 'Linker Ventrikel', fields: [
        { id: 'lvSize', label: 'LV-Größe', type: 'radio', options: ['kleinlumig', ...NORMAL_GRADES], auto: 'lvSize', measures: ['lvedd', 'lvedvi'] },
        { id: 'lvHypertrophy', label: 'Wanddicke', type: 'radio', options: [...NORMAL_GRADES], auto: 'lvHypertrophy', measures: ['ivs', 'lvpw', 'lvmi', 'rwt'] },
        { id: 'lvFunction', label: 'Systolische Funktion', type: 'radio', options: [...NORMAL_GRADES], auto: 'lvFunction', measures: ['lvef'] },
        { id: 'wma', label: 'Wandbewegung', type: 'radio', options: ['keine', 'keine sicheren', 'diffus', 'regional', 'nicht beurteilbar'] },
        { id: 'wmaSegments', label: 'Segmente', type: 'wma', showIf: { field: 'wma', in: ['regional'] } },
        { id: 'lvExtras', label: 'Weiteres', type: 'multi', options: ['paradoxe Septumbewegung', 'LV-Thrombus', 'Non-Compaction-Aspekt'] },
        { id: 'diastolic', label: 'Diastolische Funktion', type: 'radio', options: ['normal', 'Grad I', 'Grad II', 'Grad III', 'nicht beurteilbar'], measures: ['ea', 'eePrime', 'lavi'] },
        { id: 'diastolicReason', label: 'nicht beurteilbar wegen', type: 'radio', options: ['Vorhofflimmern', 'Extrasystolie', 'Tachykardie', 'keine Angabe'], default: 'keine Angabe', showIf: { field: 'diastolic', in: ['nicht beurteilbar'] } },
      ],
    },
    {
      id: 'rechts', title: 'Rechter Ventrikel & Vorhöfe', fields: [
        { id: 'rvSize', label: 'RV-Größe', type: 'radio', options: [...NORMAL_GRADES], auto: 'rvSize', measures: ['rvBasal'] },
        { id: 'rvFunction', label: 'RV-Funktion', type: 'radio', options: [...NORMAL_GRADES], auto: 'rvFunction', measures: ['tapse'] },
        { id: 'laSize', label: 'Linker Vorhof', type: 'radio', options: [...NORMAL_GRADES], auto: 'laSize', measures: ['laDiam', 'lavi'] },
        { id: 'raSize', label: 'Rechter Vorhof', type: 'radio', options: [...NORMAL_GRADES], auto: 'raSize', measures: ['raDiam'] },
        { id: 'septumExtras', label: 'Vorhofseptum', type: 'multi', options: ['pendelndes Vorhofseptum', 'Vorhofseptumaneurysma', 'V.a. PFO/ASD', 'St.p. PFO/ASD-Verschluss'] },
      ],
    },
    {
      id: 'ak', title: 'Aortenklappe', fields: [
        { id: 'avMorph', label: 'Morphologie', type: 'radio', options: ['unauffällig', 'verdickt', 'leichtgradig verkalkt', 'mittelgradig verkalkt', 'hochgradig verkalkt', ...PROSTHESES] },
        { id: 'avExtras', label: 'Weiteres', type: 'multi', options: ['bikuspid', 'Aortenringverkalkung'] },
        { id: 'avStenosis', label: 'Stenose', type: 'radio', options: ['keine', 'Sklerose', ...GRADES], auto: 'avStenosis', measures: ['avVmax', 'avPmean', 'ava', 'avai', 'dvi'] },
        { id: 'avInsuff', label: 'Insuffizienz', type: 'radio', options: INSUFF, showIf: { field: 'avMorph', notIn: PROSTHESES } },
        { id: 'avInsuffValv', label: 'valvuläre Insuffizienz', type: 'radio', options: INSUFF, showIf: { field: 'avMorph', in: PROSTHESES } },
        { id: 'avInsuffParav', label: 'paravalvuläre Insuffizienz', type: 'radio', options: INSUFF, showIf: { field: 'avMorph', in: PROSTHESES } },
      ],
    },
    {
      id: 'mk', title: 'Mitralklappe', fields: [
        { id: 'mvMorph', label: 'Morphologie', type: 'radio', options: ['unauffällig', 'verdickt', 'leichtgradig verkalkt', 'mittelgradig verkalkt', 'hochgradig verkalkt', 'St.p. Rekonstruktion', 'St.p. biologischem Ersatz', 'St.p. mechanischem Ersatz'] },
        { id: 'mvExtras', label: 'Weiteres', type: 'multi', options: ['Mitralringverkalkung', 'Prolaps anteriores Segel', 'Prolaps posteriores Segel', 'Flail leaflet', 'SAM'] },
        { id: 'mvStenosis', label: 'Stenose', type: 'radio', options: STENOSIS, auto: 'mvStenosis', measures: ['mvPmean', 'mva'] },
        { id: 'mvInsuff', label: 'Insuffizienz', type: 'radio', options: INSUFF },
        { id: 'mvJet', label: 'Jet-Richtung', type: 'radio', options: ['zentral', 'nach anterior gerichtet', 'nach posterior gerichtet', 'keine Angabe'], default: 'keine Angabe', showIf: { field: 'mvInsuff', notIn: ['', 'keine', 'minimal'] } },
      ],
    },
    {
      id: 'tk', title: 'Trikuspidalklappe', fields: [
        { id: 'tvMorph', label: 'Morphologie', type: 'radio', options: ['unauffällig', 'verdickt', 'verkalkt', 'St.p. Rekonstruktion', 'St.p. biologischem Ersatz'] },
        { id: 'tvStenosis', label: 'Stenose', type: 'radio', options: STENOSIS, measures: ['tvPmean'] },
        { id: 'tvInsuff', label: 'Insuffizienz', type: 'radio', options: INSUFF, measures: ['trVmax'] },
      ],
    },
    {
      id: 'pk', title: 'Pulmonalklappe', toggle: true, fields: [
        { id: 'pvMorph', label: 'Morphologie', type: 'radio', options: ['unauffällig', 'St.p. biologischem Ersatz', 'nicht dargestellt'] },
        { id: 'pvStenosis', label: 'Stenose', type: 'radio', options: STENOSIS, auto: 'pvStenosis', measures: ['pvVmax', 'pvPmax'] },
        { id: 'pvInsuff', label: 'Insuffizienz', type: 'radio', options: INSUFF },
      ],
    },
    {
      id: 'sonstiges', title: 'Sonstiges', fields: [
        { id: 'pericard', label: 'Perikarderguss', type: 'radio', options: ['kein', 'geringer', 'mäßiger', 'ausgeprägter', 'epikardiales Fett'] },
        { id: 'pericardExtras', label: 'Erguss-Details', type: 'multi', options: ['zirkulär', 'lokalisiert', 'Zeichen hämodynamischer Relevanz'], showIf: { field: 'pericard', in: ['geringer', 'mäßiger', 'ausgeprägter'] } },
        { id: 'aorta', label: 'Aorta ascendens', type: 'radio', options: ['normal', 'grenzwertig', 'ektatisch', 'aneurysmatisch', 'nicht beurteilbar'], auto: 'aorta', measures: ['aoSinus', 'aoAsc'] },
        { id: 'aortaExtras', label: 'Weiteres', type: 'multi', options: ['Aortensklerose'] },
        { id: 'vciSize', label: 'VCI-Kaliber', type: 'radio', options: ['normal', 'erweitert', 'nicht dargestellt'], auto: 'vciSize', measures: ['vci'] },
        { id: 'vciCollapse', label: 'Atemvariabilität', type: 'radio', options: ['normal (>50%)', 'eingeschränkt (<50%)', 'fehlend', 'keine Angabe'], default: 'keine Angabe', measures: ['rap'] },
        { id: 'ph', label: 'Pulmonale Hypertonie', type: 'radio', options: ['geringe Wahrscheinlichkeit', 'mittlere Wahrscheinlichkeit', 'hohe Wahrscheinlichkeit', 'nicht beurteilbar'], auto: 'ph', measures: ['trVmax', 'spap'] },
        { id: 'devices', label: 'Sonden', type: 'multi', options: ['Sonde im RA', 'Sonde im RV'] },
        { id: 'freitext', label: 'Ergänzungen', type: 'text' },
      ],
    },
  ];

  const WMA_STATES = ['normal', 'Hypokinesie', 'Akinesie', 'Dyskinesie', 'Aneurysma'];

  // AHA 17-Segment-Modell
  const SEGMENTS = [
    'basal anterior', 'basal anteroseptal', 'basal inferoseptal', 'basal inferior', 'basal inferolateral', 'basal anterolateral',
    'mittventrikulär anterior', 'mittventrikulär anteroseptal', 'mittventrikulär inferoseptal', 'mittventrikulär inferior', 'mittventrikulär inferolateral', 'mittventrikulär anterolateral',
    'apikal anterior', 'apikal septal', 'apikal inferior', 'apikal lateral',
    'Apex',
  ];

  function allFields() {
    return SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id })));
  }

  function isVisible(field, assess, toggles) {
    const cond = field.showIf;
    if (!cond) return true;
    const v = assess[cond.field] || '';
    if (cond.in) return cond.in.includes(v);
    if (cond.notIn) return !cond.notIn.includes(v);
    return true;
  }

  return { GRADES, NORMAL_GRADES, MEASURES, SECTIONS, WMA_STATES, SEGMENTS, allFields, isVisible };
});
