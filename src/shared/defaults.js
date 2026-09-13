// Standard-Einstellungen: Normwerte (Grenzwerte), Textbausteine, Vorlagen.
// Alles hier ist in der App unter "Einstellungen" editierbar.
//
// WICHTIG: Die Grenzwerte orientieren sich an den ASE/EACVI-Empfehlungen
// (Lang et al. 2015, Baumgartner et al. 2017, Zoghbi et al. 2017, Nagueh et al. 2016, ESC/ERS 2022).
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
  // base: Wert, wenn ein Messwert vorliegt, aber keine Stufe erreicht ist.
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
      base: 'normal', mode: 'max', note: 'Leitlinie: TAPSE < 17 mm bzw. RV-FAC < 35 % pathologisch. Abstufungen sind Vorschläge; der schwerere Befund gilt.',
      rules: [
        { measure: 'tapse', dir: 'low', levels: [{ at: 16, value: 'leichtgradig' }, { at: 13, value: 'mittelgradig' }, { at: 9, value: 'hochgradig' }] },
        { measure: 'rvFac', dir: 'low', levels: [{ at: 34, value: 'leichtgradig' }, { at: 24, value: 'mittelgradig' }, { at: 17, value: 'hochgradig' }] },
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
    avInsuff: {
      base: 'leichtgradig', mode: 'max', note: 'Quantitative Kriterien nach ASE 2017. Wird nur verwendet, wenn Insuffizienz-Parameter gemessen wurden; der schwerere Befund gilt.',
      rules: [
        { measure: 'arEroa', dir: 'high', levels: [{ at: 0.10, value: 'leicht- bis mittelgradig' }, { at: 0.20, value: 'mittel- bis hochgradig' }, { at: 0.30, value: 'hochgradig' }] },
        { measure: 'arRvol', dir: 'high', levels: [{ at: 30, value: 'leicht- bis mittelgradig' }, { at: 45, value: 'mittel- bis hochgradig' }, { at: 60, value: 'hochgradig' }] },
        { measure: 'arVc', dir: 'high', levels: [{ at: 3, value: 'mittelgradig' }, { at: 6.1, value: 'hochgradig' }] },
        { measure: 'arPht', dir: 'low', levels: [{ at: 500, value: 'mittelgradig' }, { at: 199, value: 'hochgradig' }] },
      ],
    },
    mvStenosis: {
      base: 'keine', mode: 'max', note: 'Abstufung der MÖF > 1,5 cm² als leichtgradig ist ein Vorschlag.',
      rules: [
        { measure: 'mva', dir: 'low', levels: [{ at: 2.0, value: 'leichtgradig' }, { at: 1.5, value: 'mittelgradig' }, { at: 0.9, value: 'hochgradig' }] },
        { measure: 'mvPmean', dir: 'high', levels: [{ at: 5, value: 'mittelgradig' }, { at: 11, value: 'hochgradig' }] },
      ],
    },
    mvInsuff: {
      base: 'leichtgradig', mode: 'max', note: 'Quantitative Kriterien der primären Mitralinsuffizienz (ASE 2017). Bei sekundärer MI gelten teils niedrigere Schwellen. Der schwerere Befund gilt.',
      rules: [
        { measure: 'mrEroa', dir: 'high', levels: [{ at: 0.20, value: 'leicht- bis mittelgradig' }, { at: 0.30, value: 'mittel- bis hochgradig' }, { at: 0.40, value: 'hochgradig' }] },
        { measure: 'mrRvol', dir: 'high', levels: [{ at: 30, value: 'leicht- bis mittelgradig' }, { at: 45, value: 'mittel- bis hochgradig' }, { at: 60, value: 'hochgradig' }] },
        { measure: 'mrVc', dir: 'high', levels: [{ at: 3, value: 'mittelgradig' }, { at: 7, value: 'hochgradig' }] },
      ],
    },
    tvInsuff: {
      base: 'leichtgradig', mode: 'max', note: 'Vena contracta ≥ 7 mm bzw. EROA ≥ 0,40 cm² hochgradig (ASE 2017). Zwischenstufen sind Vorschläge.',
      rules: [
        { measure: 'trVc', dir: 'high', levels: [{ at: 3, value: 'mittelgradig' }, { at: 7, value: 'hochgradig' }] },
        { measure: 'trEroa', dir: 'high', levels: [{ at: 0.20, value: 'mittelgradig' }, { at: 0.40, value: 'hochgradig' }] },
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
      base: 'geringe Wahrscheinlichkeit', mode: 'first', note: 'Nur TR Vmax (ESC/ERS 2022). Weitere PH-Zeichen (z. B. TAPSE/sPAP < 0,55) bitte manuell berücksichtigen.',
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
  // _wrap: Hülle für Mehrfachauswahl-Fragmente mit {liste}; _satz: ein Satz aus allen gewählten Einträgen.
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
      'minimal': 'Minimale Aortenklappeninsuffizienz{m}.',
      _grad: '{Grade} Aortenklappeninsuffizienz{m}.',
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
      'minimal': 'Minimale Mitralklappeninsuffizienz{m}.',
      _grad: '{Grade} Mitralklappeninsuffizienz{feld:mvJet}{m}.',
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

    // ---------- Stressecho ----------
    stressType: {
      'Fahrradergometrie': 'Stressechokardiographie mittels Fahrradergometrie{m}.',
      'Laufband': 'Stressechokardiographie mittels Laufbandbelastung{m}.',
      'Dobutamin': 'Dobutamin-Stressechokardiographie{m}.',
      'Dipyridamol': 'Dipyridamol-Stressechokardiographie{m}.',
      'Adenosin': 'Adenosin-Stressechokardiographie{m}.',
    },
    stressTarget: {
      'erreicht': 'Zielfrequenz erreicht{m}.',
      'nicht erreicht': 'Zielfrequenz nicht erreicht{m}.',
    },
    stressStop: {
      _satz: 'Abbruch wegen {liste}.',
      'Erschöpfung': 'muskulärer Erschöpfung',
      'Angina pectoris': 'Angina pectoris',
      'Dyspnoe': 'Dyspnoe',
      'Blutdruckanstieg': 'hypertensiver Blutdruckreaktion',
      'Blutdruckabfall': 'Blutdruckabfall',
      'Rhythmusstörungen': 'Rhythmusstörungen',
      'neue Wandbewegungsstörung': 'neu aufgetretener Wandbewegungsstörung',
    },
    stressSymptoms: {
      'keine': 'Keine Beschwerden unter Belastung{m}.',
      'Angina pectoris': 'Angina pectoris unter Belastung{m}.',
      'Dyspnoe': 'Dyspnoe unter Belastung{m}.',
      'Schwindel': 'Schwindel unter Belastung{m}.',
    },
    stressEcg: {
      'keine ischämietypischen Veränderungen': 'Keine ischämietypischen EKG-Veränderungen.',
      'ST-Senkungen': 'Ischämietypische ST-Streckensenkungen unter Belastung.',
      'nicht beurteilbar': 'EKG unter Belastung nicht beurteilbar.',
    },
    stressWma: {
      'normale Kontraktilitätszunahme': 'Unter Belastung normale Zunahme der Wandbewegung ohne neu aufgetretene Wandbewegungsstörungen{m}.',
      'neu aufgetretene Wandbewegungsstörungen': 'Unter Belastung neu aufgetretene Wandbewegungsstörungen: {segmente}{m}.',
      'nicht beurteilbar': 'Wandbewegung unter Belastung nicht sicher beurteilbar.',
    },
    stressResult: {
      'kein Ischämienachweis': 'Kein Nachweis einer belastungsinduzierten Ischämie.',
      'Ischämienachweis': 'Nachweis einer belastungsinduzierten Ischämie.',
      'nicht aussagekräftig': 'Stressechokardiographie nicht aussagekräftig.',
    },

    // ---------- TEE ----------
    teeSedation: {
      'keine Sedierung': 'Transösophageale Echokardiographie ohne Sedierung.',
      'Rachenanästhesie': 'Transösophageale Echokardiographie in Rachenanästhesie.',
      'Propofol-Sedierung': 'Transösophageale Echokardiographie unter Propofol-Sedierung.',
      'Midazolam-Sedierung': 'Transösophageale Echokardiographie unter Midazolam-Sedierung.',
    },
    teeComplications: {
      'keine': 'Komplikationslose Untersuchung.',
      'Sättigungsabfall': 'Vorübergehender Sättigungsabfall während der Untersuchung.',
      'Schluckbeschwerden': 'Schluckbeschwerden nach der Untersuchung.',
      'sonstige': 'Komplikation während der Untersuchung (siehe Ergänzungen).',
    },
    teeLaa: {
      'kein Thrombus': 'Kein Thrombus im linken Vorhof und Vorhofohr{m}.',
      'spontaner Echokontrast': 'Spontaner Echokontrast im linken Vorhof/Vorhofohr, kein Thrombus{m}.',
      'Sludge': 'Sludge im linken Vorhofohr{m}.',
      'Thrombus': 'Thrombus im linken Vorhofohr{m}.',
    },
    teeIas: {
      'intakt': 'Intaktes Vorhofseptum{feld:teeShunt}.',
      'PFO': 'Persistierendes Foramen ovale{feld:teeShunt}.',
      'ASD': 'Vorhofseptumdefekt{feld:teeShunt}.',
      'Vorhofseptumaneurysma': 'Vorhofseptumaneurysma{feld:teeShunt}.',
      'St.p. Verschluss': 'Zustand nach interventionellem Vorhofseptumverschluss{feld:teeShunt}.',
    },
    teeShunt: {
      'kein Shunt': ', kein Shunt im Kontrastmittelversuch',
      'Shunt in Ruhe': ', Rechts-links-Shunt bereits in Ruhe',
      'Shunt nach Valsalva': ', Rechts-links-Shunt nach Valsalva-Manöver',
      'nicht durchgeführt': '',
    },
    teeAorta: {
      'keine': 'Keine relevante Atheromatose der thorakalen Aorta.',
      'Plaques < 4 mm': 'Plaques der thorakalen Aorta < 4 mm.',
      'Plaques ≥ 4 mm': 'Plaques der thorakalen Aorta ≥ 4 mm.',
      'mobile Plaques': 'Mobile Plaques der thorakalen Aorta.',
    },
    teeEndocarditis: {
      'kein Hinweis auf Vegetationen': 'Kein Hinweis auf endokarditische Vegetationen.',
      'Vegetation': 'Nachweis einer Vegetation{feld:teeEndoSite}.',
      'Abszess': 'Nachweis eines Abszesses{feld:teeEndoSite}.',
    },
    teeEndoSite: {
      _wrap: ' an {liste}',
      'Aortenklappe': 'der Aortenklappe',
      'Mitralklappe': 'der Mitralklappe',
      'Trikuspidalklappe': 'der Trikuspidalklappe',
      'Pulmonalklappe': 'der Pulmonalklappe',
      'Prothese': 'der Prothese',
      'Sonde': 'der Sonde',
    },
  };

  // Felder, die nur als Fragment in andere Bausteine eingesetzt werden.
  const FRAGMENT_FIELDS = ['diastolicReason', 'mvJet', 'pericardExtras', 'vciCollapse', 'teeShunt', 'teeEndoSite'];

  // Schnellvorlagen: setzen Beurteilungen mit einem Klick (automatische Bewertung hat weiterhin Vorrang)
  const PRESETS = [
    {
      id: 'normalbefund', name: 'Normalbefund',
      assess: {
        rhythmus: 'Sinusrhythmus', lvSize: 'normal', lvHypertrophy: 'normal', lvFunction: 'normal', wma: 'keine', diastolic: 'normal',
        rvSize: 'normal', rvFunction: 'normal', laSize: 'normal', raSize: 'normal',
        avMorph: 'unauffällig', avStenosis: 'keine', avInsuff: 'keine',
        mvMorph: 'unauffällig', mvStenosis: 'keine', mvInsuff: 'keine',
        tvMorph: 'unauffällig', tvStenosis: 'keine', tvInsuff: 'keine',
        pericard: 'kein', aorta: 'normal', vciSize: 'normal', ph: 'geringe Wahrscheinlichkeit',
      },
    },
  ];

  // Einstellungen, die bei Mehrplatzbetrieb im gemeinsamen Profil liegen (alle anderen bleiben lokal)
  const SHARED_KEYS = ['measuresMode', 'sectionHeadings', 'bsaFormula', 'autoGrade', 'modules', 'practice', 'summary', 'comparison', 'norms', 'templates', 'presets', 'srMappings'];

  const SETTINGS = {
    version: 2,
    measuresMode: 'text',     // 'text' = in Klammern im Text | 'liste' = Liste am Beginn | 'keine'
    sectionHeadings: true,
    bsaFormula: 'dubois',     // 'dubois' | 'mosteller'
    autoGrade: true,
    modules: { pk: false, stress: false, tee: false }, // standardmäßig eingeblendete Zusatzmodule
    summary: { enabled: true, title: 'Beurteilung', normalText: 'Echokardiographischer Normalbefund.' },
    comparison: { enabled: true, inReport: true },
    practice: { name: '', address: '', footer: '' },
    archiveDir: '',           // leer = Standardordner im Benutzerverzeichnis der App
    updates: { check: true }, // einmal täglich bei GitHub nach neuer Version fragen (keine Patientendaten)
    profile: { path: '' },    // gemeinsames Profil für mehrere Arbeitsplätze (JSON-Datei)
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
      pickupWarnSeconds: 120, // Ampel gelb, wenn ein gesendeter Befund so lange nicht abgeholt wurde
    },
    norms: NORMS,
    templates: TEMPLATES,
    presets: PRESETS,
    srMappings: {},           // DICOM-SR: gemerkte Zuordnung "Bezeichnung|Einheit" → Messwert-ID ('' = ignorieren)
  };

  return { NORMS, TEMPLATES, FRAGMENT_FIELDS, PRESETS, SHARED_KEYS, SETTINGS };
});
