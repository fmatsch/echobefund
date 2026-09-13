// Standard-Einstellungen: Normwerte (Grenzwerte) und Textbausteine.
// Alles hier ist in der App unter "Einstellungen" editierbar.
//
// WICHTIG: Die Grenzwerte orientieren sich an den ASE/EACVI-Empfehlungen
// (Lang et al. 2015, Baumgartner et al. 2017, Nagueh et al. 2016, ESC/ERS 2022).
// Wo Leitlinien nur einen Normbereich angeben, sind die Abstufungen Vorschläge
// (siehe `note`). Sie müssen vom verantwortlichen Arzt geprüft werden.
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.EchoDefaults = m;
})(typeof self !== 'undefined' ? self : this, function () {
  // Normwert-Regeln je Beurteilungsfeld.
  // mode: 'first' = erste Regel mit vorhandenem Messwert gilt; 'max' = schwerster Grad aller Regeln.
  // rule.dir: 'high' = Grad gilt ab Wert >= at; 'low' = Grad gilt ab Wert <= at.
  // rule.levels: aufsteigend nach Schweregrad; bei sex:true getrennt {m: [...], w: [...]}.
  const NORMS = {
    lvSize: {
      base: 'normal', mode: 'first',
      rules: [
        { measure: 'lvedd', dir: 'high', sex: true, levels: {
          m: [{ at: 59, value: 'leichtgradig' }, { at: 64, value: 'mittelgradig' }, { at: 69, value: 'hochgradig' }],
          w: [{ at: 53, value: 'leichtgradig' }, { at: 57, value: 'mittelgradig' }, { at: 62, value: 'hochgradig' }],
        } },
      ],
    },
    lvHypertrophy: {
      base: 'normal', mode: 'first',
      rules: [
        { measure: 'ivs', dir: 'high', sex: true, levels: {
          m: [{ at: 11, value: 'leichtgradig' }, { at: 14, value: 'mittelgradig' }, { at: 17, value: 'hochgradig' }],
          w: [{ at: 10, value: 'leichtgradig' }, { at: 13, value: 'mittelgradig' }, { at: 16, value: 'hochgradig' }],
        } },
      ],
    },
    lvFunction: {
      base: 'normal', mode: 'first',
      rules: [
        { measure: 'lvef', dir: 'low', sex: true, levels: {
          m: [{ at: 51, value: 'leichtgradig' }, { at: 40, value: 'mittelgradig' }, { at: 29, value: 'hochgradig' }],
          w: [{ at: 53, value: 'leichtgradig' }, { at: 40, value: 'mittelgradig' }, { at: 29, value: 'hochgradig' }],
        } },
        { measure: 'lvefSimpson', dir: 'low', sex: true, levels: {
          m: [{ at: 51, value: 'leichtgradig' }, { at: 40, value: 'mittelgradig' }, { at: 29, value: 'hochgradig' }],
          w: [{ at: 53, value: 'leichtgradig' }, { at: 40, value: 'mittelgradig' }, { at: 29, value: 'hochgradig' }],
        } },
      ],
    },
    rvSize: {
      base: 'normal', mode: 'first', note: 'Leitlinie: RVD1 normal ≤ 41 mm. Abstufungen sind Vorschläge.',
      rules: [
        { measure: 'rvBasal', dir: 'high', levels: [{ at: 42, value: 'leichtgradig' }, { at: 47, value: 'mittelgradig' }, { at: 52, value: 'hochgradig' }] },
      ],
    },
    rvFunction: {
      base: 'normal', mode: 'first', note: 'Leitlinie: TAPSE < 17 mm pathologisch. Abstufungen sind Vorschläge.',
      rules: [
        { measure: 'tapse', dir: 'low', levels: [{ at: 16, value: 'leichtgradig' }, { at: 13, value: 'mittelgradig' }, { at: 9, value: 'hochgradig' }] },
      ],
    },
    laSize: {
      base: 'normal', mode: 'first', note: 'LAVI hat Vorrang vor dem LA-Durchmesser.',
      rules: [
        { measure: 'lavi', dir: 'high', levels: [{ at: 35, value: 'leichtgradig' }, { at: 42, value: 'mittelgradig' }, { at: 49, value: 'hochgradig' }] },
        { measure: 'laDiam', dir: 'high', sex: true, levels: {
          m: [{ at: 41, value: 'leichtgradig' }, { at: 47, value: 'mittelgradig' }, { at: 53, value: 'hochgradig' }],
          w: [{ at: 39, value: 'leichtgradig' }, { at: 43, value: 'mittelgradig' }, { at: 47, value: 'hochgradig' }],
        } },
      ],
    },
    raSize: {
      base: 'normal', mode: 'first', note: 'Leitlinie: RA-Querdurchmesser normal ≤ 44 mm. Abstufungen sind Vorschläge.',
      rules: [
        { measure: 'raDiam', dir: 'high', levels: [{ at: 45, value: 'leichtgradig' }, { at: 50, value: 'mittelgradig' }, { at: 55, value: 'hochgradig' }] },
      ],
    },
    avStenosis: {
      base: 'keine', mode: 'max', note: 'Nur Vmax und Pmean. Die AÖF wird wegen Low-Flow-Konstellationen nicht automatisch bewertet.',
      rules: [
        { measure: 'avVmax', dir: 'high', levels: [{ at: 2.6, value: 'leichtgradig' }, { at: 3.0, value: 'mittelgradig' }, { at: 4.0, value: 'hochgradig' }] },
        { measure: 'avPmean', dir: 'high', levels: [{ at: 20, value: 'mittelgradig' }, { at: 40, value: 'hochgradig' }] },
      ],
    },
    mvStenosis: {
      base: 'keine', mode: 'max', note: 'Abstufung der MÖF > 1,5 cm² als leichtgradig ist ein Vorschlag.',
      rules: [
        { measure: 'mva', dir: 'low', levels: [{ at: 2.0, value: 'leichtgradig' }, { at: 1.5, value: 'mittelgradig' }, { at: 0.9, value: 'hochgradig' }] },
        { measure: 'mvPmean', dir: 'high', levels: [{ at: 5, value: 'mittelgradig' }, { at: 11, value: 'hochgradig' }] },
      ],
    },
    pvStenosis: {
      base: 'keine', mode: 'first',
      rules: [
        { measure: 'pvVmax', dir: 'high', levels: [{ at: 2.5, value: 'leichtgradig' }, { at: 3.0, value: 'mittelgradig' }, { at: 4.1, value: 'hochgradig' }] },
      ],
    },
    aorta: {
      base: 'normal', mode: 'max', note: 'Nicht KOF-/altersadjustiert.',
      rules: [
        { measure: 'aoAsc', dir: 'high', levels: [{ at: 37, value: 'grenzwertig' }, { at: 40, value: 'ektatisch' }, { at: 45, value: 'aneurysmatisch' }] },
        { measure: 'aoSinus', dir: 'high', levels: [{ at: 38, value: 'grenzwertig' }, { at: 41, value: 'ektatisch' }, { at: 45, value: 'aneurysmatisch' }] },
      ],
    },
    vciSize: {
      base: 'normal', mode: 'first',
      rules: [{ measure: 'vci', dir: 'high', levels: [{ at: 22, value: 'erweitert' }] }],
    },
    ph: {
      base: 'geringe Wahrscheinlichkeit', mode: 'first', note: 'Nur TR Vmax (ESC/ERS 2022). Weitere PH-Zeichen bitte manuell berücksichtigen.',
      rules: [
        { measure: 'trVmax', dir: 'high', levels: [{ at: 2.9, value: 'mittlere Wahrscheinlichkeit' }, { at: 3.5, value: 'hohe Wahrscheinlichkeit' }] },
      ],
    },
  };

  // Textbausteine je Feld und Option.
  // Platzhalter: {m} Messwerte in Klammern | {grad}/{Grad} "leichtgradig" |
  //   {grade}/{Grade} "leichtgradige" | {grader}/{Grader} "leichtgradiger" |
  //   {segmente} Wandbewegungsstörungen | {feld:ID} Textfragment eines anderen Feldes.
  // _grad: Vorlage für alle Schweregrade (leichtgradig ... hochgradig).
  // _wrap: Hülle für Mehrfachauswahl-Fragmente mit {liste}.
  const TEMPLATES = {
    qualitaet: {
      'gut': 'Gute Schallbedingungen.',
      'gering eingeschränkt': 'Gering eingeschränkte Schallbedingungen.',
      'deutlich eingeschränkt': 'Deutlich eingeschränkte Schallbedingungen.',
      'schlecht': 'Schlechte Schallbedingungen.',
      'keine Angabe': '',
    },
    rhythmus: {
      'Sinusrhythmus': 'Sinusrhythmus{m}.',
      'Vorhofflimmern': 'Vorhofflimmern{m}.',
      'Schrittmacherrhythmus': 'Schrittmacherrhythmus{m}.',
      'keine Angabe': '',
    },
    lvSize: {
      'kleinlumig': 'Kleinlumiger linker Ventrikel{m}.',
      'normal': 'Normal großer linker Ventrikel{m}.',
      'grenzwertig': 'Grenzwertig großer linker Ventrikel{m}.',
      _grad: '{Grad} dilatierter linker Ventrikel{m}.',
    },
    lvHypertrophy: {
      'normal': 'Normale linksventrikuläre Wanddicke{m}.',
      'grenzwertig': 'Grenzwertige linksventrikuläre Wanddicke{m}.',
      _grad: '{Grade} linksventrikuläre Hypertrophie{m}.',
    },
    lvFunction: {
      'normal': 'Normale systolische linksventrikuläre Funktion{m}.',
      'grenzwertig': 'Grenzwertige systolische linksventrikuläre Funktion{m}.',
      _grad: '{Grad} eingeschränkte systolische linksventrikuläre Funktion{m}.',
    },
    wma: {
      'keine': 'Keine regionalen Wandbewegungsstörungen.',
      'keine sicheren': 'Keine sicheren regionalen Wandbewegungsstörungen.',
      'diffus': 'Diffuse Hypokinesie.',
      'regional': 'Regionale Wandbewegungsstörungen: {segmente}.',
      'nicht beurteilbar': 'Regionale Wandbewegung nicht sicher beurteilbar.',
    },
    lvExtras: {
      'paradoxe Septumbewegung': 'Paradoxe Septumbewegung.',
      'LV-Thrombus': 'Nachweis eines linksventrikulären Thrombus.',
      'Non-Compaction-Aspekt': 'Vermehrte Trabekularisierung im Sinne eines Non-Compaction-Aspekts.',
    },
    diastolic: {
      'normal': 'Normale diastolische Funktion{m}.',
      'Grad I': 'Diastolische Dysfunktion Grad I (Relaxationsstörung){m}.',
      'Grad II': 'Diastolische Dysfunktion Grad II (pseudonormales Füllungsmuster){m}.',
      'Grad III': 'Diastolische Dysfunktion Grad III (restriktives Füllungsmuster){m}.',
      'nicht beurteilbar': 'Diastolische Funktion nicht beurteilbar{feld:diastolicReason}.',
    },
    diastolicReason: {
      'Vorhofflimmern': ' bei Vorhofflimmern',
      'Extrasystolie': ' bei Extrasystolie',
      'Tachykardie': ' bei Tachykardie',
      'keine Angabe': '',
    },
    rvSize: {
      'normal': 'Normal großer rechter Ventrikel{m}.',
      'grenzwertig': 'Grenzwertig großer rechter Ventrikel{m}.',
      _grad: '{Grad} dilatierter rechter Ventrikel{m}.',
    },
    rvFunction: {
      'normal': 'Normale rechtsventrikuläre Funktion{m}.',
      'grenzwertig': 'Grenzwertige rechtsventrikuläre Funktion{m}.',
      _grad: '{Grad} eingeschränkte rechtsventrikuläre Funktion{m}.',
    },
    laSize: {
      'normal': 'Normal großer linker Vorhof{m}.',
      'grenzwertig': 'Grenzwertig großer linker Vorhof{m}.',
      _grad: '{Grad} dilatierter linker Vorhof{m}.',
    },
    raSize: {
      'normal': 'Normal großer rechter Vorhof{m}.',
      'grenzwertig': 'Grenzwertig großer rechter Vorhof{m}.',
      _grad: '{Grad} dilatierter rechter Vorhof{m}.',
    },
    septumExtras: {
      'pendelndes Vorhofseptum': 'Pendelndes Vorhofseptum.',
      'Vorhofseptumaneurysma': 'Vorhofseptumaneurysma.',
      'V.a. PFO/ASD': 'Verdacht auf PFO/ASD.',
      'St.p. PFO/ASD-Verschluss': 'Zustand nach interventionellem PFO/ASD-Verschluss.',
    },
    avMorph: {
      'unauffällig': 'Morphologisch unauffällige Aortenklappe.',
      'verdickt': 'Verdickte Aortenklappe.',
      'leichtgradig verkalkt': 'Leichtgradig verkalkte Aortenklappe.',
      'mittelgradig verkalkt': 'Mittelgradig verkalkte Aortenklappe.',
      'hochgradig verkalkt': 'Hochgradig verkalkte Aortenklappe.',
      'St.p. biologischem Ersatz': 'Zustand nach biologischem Aortenklappenersatz.',
      'St.p. mechanischem Ersatz': 'Zustand nach mechanischem Aortenklappenersatz.',
      'St.p. TAVI': 'Zustand nach TAVI.',
    },
    avExtras: {
      'bikuspid': 'Bikuspide Aortenklappe.',
      'Aortenringverkalkung': 'Aortenringverkalkung.',
    },
    avStenosis: {
      'keine': 'Keine Aortenklappenstenose{m}.',
      'Sklerose': 'Aortenklappensklerose ohne relevante Stenose{m}.',
      _grad: '{Grade} Aortenklappenstenose{m}.',
    },
    avInsuff: {
      'keine': 'Keine Aortenklappeninsuffizienz.',
      'minimal': 'Minimale Aortenklappeninsuffizienz.',
      _grad: '{Grade} Aortenklappeninsuffizienz.',
    },
    avInsuffValv: {
      'keine': 'Keine valvuläre Insuffizienz.',
      'minimal': 'Minimale valvuläre Insuffizienz.',
      _grad: '{Grade} valvuläre Insuffizienz.',
    },
    avInsuffParav: {
      'keine': 'Kein paravalvuläres Leck.',
      'minimal': 'Minimales paravalvuläres Leck.',
      _grad: '{Grade} paravalvuläre Insuffizienz.',
    },
    mvMorph: {
      'unauffällig': 'Morphologisch unauffällige Mitralklappe.',
      'verdickt': 'Verdickte Mitralklappensegel.',
      'leichtgradig verkalkt': 'Leichtgradig verkalkte Mitralklappe.',
      'mittelgradig verkalkt': 'Mittelgradig verkalkte Mitralklappe.',
      'hochgradig verkalkt': 'Hochgradig verkalkte Mitralklappe.',
      'St.p. Rekonstruktion': 'Zustand nach Mitralklappenrekonstruktion.',
      'St.p. biologischem Ersatz': 'Zustand nach biologischem Mitralklappenersatz.',
      'St.p. mechanischem Ersatz': 'Zustand nach mechanischem Mitralklappenersatz.',
    },
    mvExtras: {
      'Mitralringverkalkung': 'Mitralringverkalkung.',
      'Prolaps anteriores Segel': 'Prolaps des anterioren Mitralsegels.',
      'Prolaps posteriores Segel': 'Prolaps des posterioren Mitralsegels.',
      'Flail leaflet': 'Flail leaflet.',
      'SAM': 'Systolic anterior motion (SAM) der Mitralklappe.',
    },
    mvStenosis: {
      'keine': 'Keine Mitralklappenstenose{m}.',
      _grad: '{Grade} Mitralklappenstenose{m}.',
    },
    mvInsuff: {
      'keine': 'Keine Mitralklappeninsuffizienz.',
      'minimal': 'Minimale Mitralklappeninsuffizienz.',
      _grad: '{Grade} Mitralklappeninsuffizienz{feld:mvJet}.',
    },
    mvJet: {
      'zentral': ' mit zentralem Jet',
      'nach anterior gerichtet': ' mit nach anterior gerichtetem Jet',
      'nach posterior gerichtet': ' mit nach posterior gerichtetem Jet',
      'keine Angabe': '',
    },
    tvMorph: {
      'unauffällig': 'Morphologisch unauffällige Trikuspidalklappe.',
      'verdickt': 'Verdickte Trikuspidalklappe.',
      'verkalkt': 'Verkalkte Trikuspidalklappe.',
      'St.p. Rekonstruktion': 'Zustand nach Trikuspidalklappenrekonstruktion.',
      'St.p. biologischem Ersatz': 'Zustand nach biologischem Trikuspidalklappenersatz.',
    },
    tvStenosis: {
      'keine': 'Keine Trikuspidalklappenstenose.',
      _grad: '{Grade} Trikuspidalklappenstenose{m}.',
    },
    tvInsuff: {
      'keine': 'Keine Trikuspidalklappeninsuffizienz.',
      'minimal': 'Minimale Trikuspidalklappeninsuffizienz{m}.',
      _grad: '{Grade} Trikuspidalklappeninsuffizienz{m}.',
    },
    pvMorph: {
      'unauffällig': 'Morphologisch unauffällige Pulmonalklappe.',
      'St.p. biologischem Ersatz': 'Zustand nach biologischem Pulmonalklappenersatz.',
      'nicht dargestellt': 'Pulmonalklappe nicht sicher dargestellt.',
    },
    pvStenosis: {
      'keine': 'Keine Pulmonalklappenstenose.',
      _grad: '{Grade} Pulmonalklappenstenose{m}.',
    },
    pvInsuff: {
      'keine': 'Keine Pulmonalklappeninsuffizienz.',
      'minimal': 'Minimale Pulmonalklappeninsuffizienz.',
      _grad: '{Grade} Pulmonalklappeninsuffizienz.',
    },
    pericard: {
      'kein': 'Kein Perikarderguss.',
      'geringer': 'Geringer Perikarderguss{feld:pericardExtras}.',
      'mäßiger': 'Mäßiger Perikarderguss{feld:pericardExtras}.',
      'ausgeprägter': 'Ausgeprägter Perikarderguss{feld:pericardExtras}.',
      'epikardiales Fett': 'Kein Perikarderguss, epikardiales Fettgewebe.',
    },
    pericardExtras: {
      _wrap: ', {liste}',
      'zirkulär': 'zirkulär',
      'lokalisiert': 'lokalisiert',
      'Zeichen hämodynamischer Relevanz': 'mit Zeichen hämodynamischer Relevanz',
    },
    aorta: {
      'normal': 'Normal weite Aorta ascendens{m}.',
      'grenzwertig': 'Grenzwertig weite Aorta ascendens{m}.',
      'ektatisch': 'Ektatische Aorta ascendens{m}.',
      'aneurysmatisch': 'Aneurysmatisch erweiterte Aorta ascendens{m}.',
      'nicht beurteilbar': 'Aorta ascendens nicht beurteilbar.',
    },
    aortaExtras: {
      'Aortensklerose': 'Aortensklerose.',
    },
    vciSize: {
      'normal': 'Normal weite Vena cava inferior{m}{feld:vciCollapse}.',
      'erweitert': 'Erweiterte Vena cava inferior{m}{feld:vciCollapse}.',
      'nicht dargestellt': 'Vena cava inferior nicht dargestellt.',
    },
    vciCollapse: {
      'normal (>50%)': ' mit normaler Atemvariabilität{m}',
      'eingeschränkt (<50%)': ' mit eingeschränkter Atemvariabilität{m}',
      'fehlend': ' ohne Atemvariabilität{m}',
      'keine Angabe': '',
    },
    ph: {
      'geringe Wahrscheinlichkeit': 'Echokardiographisch geringe Wahrscheinlichkeit einer pulmonalen Hypertonie{m}.',
      'mittlere Wahrscheinlichkeit': 'Echokardiographisch mittlere Wahrscheinlichkeit einer pulmonalen Hypertonie{m}.',
      'hohe Wahrscheinlichkeit': 'Echokardiographisch hohe Wahrscheinlichkeit einer pulmonalen Hypertonie{m}.',
      'nicht beurteilbar': 'Wahrscheinlichkeit einer pulmonalen Hypertonie nicht beurteilbar.',
    },
    devices: {
      'Sonde im RA': 'Schrittmacher-/ICD-Sonde im rechten Vorhof.',
      'Sonde im RV': 'Schrittmacher-/ICD-Sonde im rechten Ventrikel.',
    },
  };

  // Felder, die nur als Fragment in andere Bausteine eingesetzt werden.
  const FRAGMENT_FIELDS = ['diastolicReason', 'mvJet', 'pericardExtras', 'vciCollapse'];

  const SETTINGS = {
    version: 1,
    measuresMode: 'text',     // 'text' = in Klammern im Text | 'liste' = Liste am Beginn | 'keine'
    sectionHeadings: true,
    bsaFormula: 'dubois',     // 'dubois' | 'mosteller'
    autoGrade: true,
    showPulmonary: false,
    practice: { name: '', address: '', footer: '' },
    archiveDir: '',           // leer = Standardordner im Benutzerverzeichnis der App
    // Anbindung an die Praxissoftware (z. B. EOSWIN) über GDT 2.1
    gdt: {
      enabled: false,
      pvsName: 'EOSWIN',
      dir: '',                // Austauschordner, muss in der Praxissoftware identisch eingetragen sein
      ownId: 'ECHOBEF',       // 8316 GDT-ID dieses Programms (max. 8 Zeichen)
      pvsId: 'EOSWIN',        // 8315 GDT-ID der Praxissoftware (max. 8 Zeichen)
      ownShort: 'ECHO',       // Dateikürzel dieses Programms (max. 4 Zeichen)
      pvsShort: 'EOSW',       // Dateikürzel der Praxissoftware (max. 4 Zeichen)
      fileMode: 'fixed',      // 'fixed' = .GDT | 'counter' = .001, .002, ...
      charset: 'auto',        // 'auto' = wie Anfrage | '1' 7 Bit | '2' CP437 | '3' CP1252
      testType: 'SONO00',     // 8402 Untersuchungsart
      textField: '6228',      // '6228' Ergebnistext formatiert | '6220' Befund
      lineWidth: 60,
      sendMeasures: false,    // Messwerte zusätzlich einzeln (8410/8420/8421)
      attachPdf: false,       // PDF ablegen und per 6305 verweisen
      pdfDir: '',             // leer = Austauschordner
      autoSave: true,         // nach dem Senden im Archiv speichern
      minimizeAfterSend: false,
    },
    norms: NORMS,
    templates: TEMPLATES,
  };

  return { NORMS, TEMPLATES, FRAGMENT_FIELDS, SETTINGS };
});
