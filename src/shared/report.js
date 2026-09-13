// Automatische Bewertung, Befundtext, Beurteilung und Verlaufsvergleich.
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const deps = isNode
    ? [require('./schema'), require('./defaults')]
    : [root.EchoSchema, root.EchoDefaults];
  const m = factory(...deps);
  if (isNode) module.exports = m;
  else root.EchoReport = m;
})(typeof self !== 'undefined' ? self : this, function (Schema, Defaults) {
  const FIELD_BY_ID = Object.fromEntries(Schema.allFields().map((f) => [f.id, f]));
  const MEASURE_BY_ID = Object.fromEntries(Schema.MEASURES.map((m) => [m.id, m]));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const isEmpty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

  // ---------- Bewertung nach Normwerten ----------

  function gradeRule(rule, value, sex) {
    let levels = rule.levels;
    if (rule.sex) {
      if (sex !== 'm' && sex !== 'w') return undefined;
      levels = levels[sex];
    }
    let result = null; // null = im Normbereich
    for (const lvl of levels || []) {
      const hit = rule.dir === 'low' ? value <= lvl.at : value >= lvl.at;
      if (hit) result = lvl.value;
    }
    return result;
  }

  // Liefert den vorgeschlagenen Wert für ein Feld oder undefined (keine Aussage möglich).
  function autoGrade(fieldId, norms, values, sex) {
    const norm = norms[fieldId];
    const field = FIELD_BY_ID[fieldId];
    if (!norm || !field) return undefined;
    const severity = (val) => field.options.indexOf(val);
    let best;
    for (const rule of norm.rules || []) {
      const x = values[rule.measure];
      if (!isNum(x)) continue;
      const g = gradeRule(rule, x, sex);
      if (g === undefined) continue;
      const val = g === null ? norm.base : g;
      if (norm.mode !== 'max') return val;
      if (best === undefined || severity(val) > severity(best)) best = val;
    }
    return best;
  }

  // ---------- Diastolische Funktion (ASE/EACVI 2016, Nagueh et al.) ----------
  // Liefert 'normal' | 'Grad I' | 'Grad II' | 'Grad III' | 'nicht beurteilbar' oder undefined (zu wenige Daten).
  function diastolicGrade(v, assess = {}) {
    if (assess.rhythmus === 'Vorhofflimmern') return undefined; // Algorithmus gilt nicht bei Vorhofflimmern
    const criterion = (ok, test) => (ok ? test : undefined);
    const avgEe = criterion(isNum(v.eePrime), v.eePrime > 14);
    const tr = criterion(isNum(v.trVmax), v.trVmax > 2.8);
    const lavi = criterion(isNum(v.lavi), v.lavi > 34);
    const ePrime = isNum(v.ePrimeSept) || isNum(v.ePrimeLat)
      ? (isNum(v.ePrimeSept) && v.ePrimeSept < 7) || (isNum(v.ePrimeLat) && v.ePrimeLat < 10)
      : undefined;
    const ef = isNum(v.lvef) ? v.lvef : v.lvefSimpson;
    const reducedEf = isNum(ef) && ef < 50;

    if (!reducedEf) {
      const crits = [avgEe, ePrime, tr, lavi].filter((c) => c !== undefined);
      if (crits.length < 3) return undefined;
      const share = crits.filter(Boolean).length / crits.length;
      if (share < 0.5) return 'normal';
      if (share === 0.5) return 'nicht beurteilbar';
      return fillingPressureGrade(v, avgEe, tr, lavi);
    }
    return fillingPressureGrade(v, avgEe, tr, lavi);
  }

  function fillingPressureGrade(v, avgEe, tr, lavi) {
    if (!isNum(v.ea) || !isNum(v.eWave)) return undefined;
    if (v.ea <= 0.8 && v.eWave <= 50) return 'Grad I';
    if (v.ea >= 2) return 'Grad III';
    const crits = [avgEe, tr, lavi].filter((c) => c !== undefined);
    if (crits.length < 2) return 'nicht beurteilbar';
    const pos = crits.filter(Boolean).length;
    const neg = crits.length - pos;
    if (pos >= 2) return 'Grad II';
    if (neg >= 2) return 'Grad I';
    return 'nicht beurteilbar';
  }

  function autoGradeAll(norms, values, sex, assess = {}) {
    const out = {};
    for (const f of Schema.allFields()) {
      if (!f.auto) continue;
      const v = f.auto === 'diastolic' ? diastolicGrade(values, assess) : autoGrade(f.auto, norms, values, sex);
      if (v !== undefined) out[f.id] = v;
    }
    return out;
  }

  // ---------- Formatierung ----------

  function formatNumber(v, dec) {
    return v.toFixed(dec).replace('.', ',');
  }

  function formatValue(id, v) {
    const m = MEASURE_BY_ID[id];
    return m && isNum(v) ? `${formatNumber(v, m.dec)}${m.unit ? ' ' + m.unit : ''}` : '';
  }

  function formatMeasure(id, values) {
    const m = MEASURE_BY_ID[id];
    const v = values[id];
    if (!m || !isNum(v)) return '';
    return `${m.abbr || m.label} ${formatValue(id, v)}`;
  }

  const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

  function joinList(items) {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}` : items.join('');
  }

  function renderTemplate(tpl, ctx) {
    return tpl.replace(/\{(feld:)?([A-Za-zÄÖÜäöü]+)\}/g, (all, isField, key) => {
      if (isField) return renderField(key, ctx, true);
      if (key === 'm') return ctx.measureText || '';
      if (key === 'segmente') return ctx.segmentText || '';
      const base = ctx.grade || '';
      switch (key) {
        case 'grad': return base;
        case 'Grad': return capitalize(base);
        case 'grade': return base && base + 'e';
        case 'Grade': return capitalize(base && base + 'e');
        case 'grader': return base && base + 'er';
        case 'Grader': return capitalize(base && base + 'er');
        default: return all;
      }
    });
  }

  function segmentText(segments) {
    const byState = {};
    for (const [idx, state] of Object.entries(segments || {})) {
      if (!state || state === 'normal') continue;
      (byState[state] ||= []).push(Number(idx));
    }
    const parts = Schema.WMA_STATES.filter((s) => byState[s]).map((s) =>
      `${s} ${byState[s].sort((a, b) => a - b).map((i) => Schema.SEGMENTS[i]).join(', ')}`
    );
    return parts.length ? parts.join('; ') : 'Segmente nicht näher bezeichnet';
  }

  // Rendert ein Feld. fragment=true: als Einschub in einen anderen Baustein.
  function renderField(fieldId, ctx, fragment) {
    const field = FIELD_BY_ID[fieldId];
    const value = ctx.assess[fieldId];
    if (!field || isEmpty(value)) return '';
    if (!Schema.isVisible(field, ctx.assess)) return '';
    const tpls = ctx.templates[fieldId] || {};

    if (field.type === 'text') return String(value).trim();

    const measureText = ctx.settings.measuresMode === 'text' ? inlineMeasures(field, ctx.values) : '';
    const sub = { ...ctx, measureText, segmentText: segmentText(ctx.assess[field.segments || 'wmaSegments']) };

    if (field.type === 'multi') {
      const items = value.filter((o) => field.options.includes(o))
        .map((o) => renderTemplate(tpls[o] !== undefined ? tpls[o] : fallback(o, fragment || !!tpls._satz), sub))
        .filter(Boolean);
      if (!items.length) return '';
      if (fragment) return renderTemplate((tpls._wrap || ' ({liste})').replace('{liste}', joinList(items)), sub);
      if (tpls._satz) return renderTemplate(tpls._satz.replace('{liste}', joinList(items)), sub);
      return items.join(' ');
    }

    let tpl = tpls[value];
    if (tpl === undefined && Schema.GRADES.includes(value)) tpl = tpls._grad;
    if (tpl === undefined) tpl = fallback(value, fragment);
    return renderTemplate(tpl, { ...sub, grade: Schema.GRADES.includes(value) ? value : '' });
  }

  function fallback(option, fragment) {
    return fragment ? ` ${option}` : `${capitalize(option)}.`;
  }

  function inlineMeasures(field, values) {
    const parts = (field.measures || []).map((id) => formatMeasure(id, values)).filter(Boolean);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }

  function cleanup(text) {
    return text.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;])/g, '$1').replace(/\.\./g, '.').trim();
  }

  const moduleActive = (section, settings) => !section.module || !!(settings.modules && settings.modules[section.module]);

  // ---------- Beurteilung ----------

  const NOT_PATHOLOGICAL = new Set([
    'normal', 'grenzwertig', 'keine', 'kein', 'keine sicheren', 'unauffällig', 'minimal', 'keine Angabe',
    'Sinusrhythmus', 'geringe Wahrscheinlichkeit', 'Sklerose', 'normal (>50%)', 'nicht beurteilbar', 'nicht dargestellt',
    'kein Thrombus', 'intakt', 'kein Hinweis auf Vegetationen', 'kein Ischämienachweis', 'keine ischämietypischen Veränderungen',
    'epikardiales Fett',
  ]);

  function isPathological(field, value) {
    if (Array.isArray(value)) return value.length > 0;
    return !NOT_PATHOLOGICAL.has(value);
  }

  function summaryText(ctx) {
    const cfg = ctx.settings.summary || {};
    if (cfg.enabled === false) return '';
    const noMeasures = { ...ctx, settings: { ...ctx.settings, measuresMode: 'keine' } };
    const items = [];
    let assessed = 0;
    for (const section of Schema.SECTIONS) {
      if (!moduleActive(section, ctx.settings)) continue;
      for (const f of section.fields) {
        if (f.summary === false || f.type === 'wma' || f.type === 'text' || Defaults.FRAGMENT_FIELDS.includes(f.id)) continue;
        const v = ctx.assess[f.id];
        if (isEmpty(v) || v === 'keine Angabe' || !Schema.isVisible(f, ctx.assess)) continue;
        assessed++;
        if (!f.summaryAlways && !isPathological(f, v)) continue;
        const s = cleanup(renderField(f.id, noMeasures, false));
        if (s) items.push(s);
      }
    }
    if (!assessed) return '';
    const body = items.length ? items.join(' ') : (cfg.normalText || '');
    return body ? `${cfg.title || 'Beurteilung'}: ${body}` : '';
  }

  // ---------- Verlaufsvergleich ----------

  const COMPARE_MEASURES = ['lvedd', 'ivs', 'lvef', 'lvefSimpson', 'gls', 'lavi', 'laDiam', 'rvBasal', 'tapse', 'trVmax', 'spap',
    'avVmax', 'avPmean', 'ava', 'mvPmean', 'mrEroa', 'mrRvol', 'arVc', 'aoSinus', 'aoAsc'];
  const COMPARE_FIELDS = {
    lvSize: 'LV-Größe', lvHypertrophy: 'LV-Wanddicke', lvFunction: 'LV-Funktion', diastolic: 'diastolische Funktion',
    rvSize: 'RV-Größe', rvFunction: 'RV-Funktion', laSize: 'linker Vorhof', avStenosis: 'Aortenklappenstenose',
    avInsuff: 'Aortenklappeninsuffizienz', mvStenosis: 'Mitralklappenstenose', mvInsuff: 'Mitralklappeninsuffizienz',
    tvInsuff: 'Trikuspidalklappeninsuffizienz', pericard: 'Perikarderguss', aorta: 'Aorta ascendens', ph: 'PH-Wahrscheinlichkeit',
  };

  const deDate = (iso) => (iso ? String(iso).split('-').reverse().join('.') : '');

  // current/previous: { values (inkl. berechneter), assess }
  function comparisonItems(current, previous) {
    const items = [];
    let compared = 0;
    for (const id of COMPARE_MEASURES) {
      const a = current.values[id];
      const b = previous.values[id];
      if (!isNum(a) || !isNum(b)) continue;
      compared++;
      if (formatValue(id, a) !== formatValue(id, b)) items.push(`${formatMeasure(id, current.values)} (zuvor ${formatValue(id, b)})`);
    }
    for (const [id, label] of Object.entries(COMPARE_FIELDS)) {
      const a = current.assess[id];
      const b = previous.assess && previous.assess[id];
      if (isEmpty(a) || isEmpty(b) || a === 'keine Angabe' || b === 'keine Angabe') continue;
      compared++;
      if (a !== b) items.push(`${label} ${a} (zuvor ${b})`);
    }
    return { items, compared };
  }

  function comparisonText(current, previous) {
    if (!previous) return '';
    const { items, compared } = comparisonItems(current, previous);
    if (!compared) return '';
    const date = deDate(previous.datum);
    return items.length
      ? `Im Vergleich zur Voruntersuchung vom ${date}: ${items.join('; ')}.`
      : `Im Vergleich zur Voruntersuchung vom ${date}: Messwerte und Beurteilungen unverändert.`;
  }

  // ---------- Befund ----------

  const LIST_GROUPS = [
    ['Allgemein', ['bsa', 'hf']],
    ['LV', ['lvedd', 'lvesd', 'ivs', 'lvpw', 'lvef', 'lvedv', 'lvesv', 'lvefSimpson', 'lvedvi', 'lvMass', 'lvmi', 'rwt', 'gls']],
    ['Diastole', ['eWave', 'aWave', 'ea', 'ePrimeSept', 'ePrimeLat', 'eePrime']],
    ['Rechtes Herz / Vorhöfe', ['rvBasal', 'tapse', 'rvFac', 'laDiam', 'laVol', 'lavi', 'raDiam', 'trVmax', 'trPmax', 'vci', 'rap', 'spap', 'tapseSpap']],
    ['Klappen', ['avVmax', 'avPmax', 'avPmean', 'avVti', 'lvotD', 'lvotVti', 'sv', 'svi', 'co', 'ava', 'avai', 'dvi', 'mvPmean', 'mva', 'tvPmean', 'pvVmax', 'pvPmax']],
    ['Insuffizienzen', ['mrVc', 'mrEroa', 'mrRvol', 'arVc', 'arPht', 'arEroa', 'arRvol', 'trVc', 'trEroa']],
    ['Aorta', ['aoSinus', 'aoAsc']],
    ['Stressecho', ['stressWatt', 'stressHfMax', 'stressHfTarget', 'stressHfPercent', 'stressRrMax', 'stressLvefRest', 'stressLvefPeak'], 'stress'],
    ['TEE', ['laaVel'], 'tee'],
  ];

  function measureList(values, settings = {}) {
    return LIST_GROUPS.map(([title, ids, module]) => {
      if (module && !(settings.modules && settings.modules[module])) return '';
      const parts = ids.map((id) => formatMeasure(id, values)).filter(Boolean);
      return parts.length ? `${title}: ${parts.join(', ')}` : '';
    }).filter(Boolean);
  }

  // input: { values (inkl. berechneter), assess, settings, previous? { datum, values, assess } }
  function generate({ values, assess, settings, previous }) {
    const templates = settings.templates || Defaults.TEMPLATES;
    const ctx = { values, assess, settings, templates };
    const blocks = [];
    const heading = (title, body) => (settings.sectionHeadings ? `${title}: ${body}` : body);

    for (const section of Schema.SECTIONS) {
      if (!moduleActive(section, settings)) continue;
      const sentences = section.fields
        .filter((f) => !Defaults.FRAGMENT_FIELDS.includes(f.id) && f.type !== 'wma' && f.type !== 'text')
        .map((f) => renderField(f.id, ctx, false))
        .filter(Boolean);
      if (section.id === 'allgemein') {
        if (sentences.length) blocks.push(cleanup(sentences.join(' ')));
        if (settings.measuresMode === 'liste') {
          const list = measureList(values, settings);
          if (list.length) blocks.push(['Messwerte:', ...list].join('\n'));
        }
        continue;
      }
      if (!sentences.length) continue;
      blocks.push(heading(section.title, cleanup(sentences.join(' '))));
    }

    const extra = renderField('freitext', ctx, false);
    if (extra) blocks.push(extra);

    if (previous && settings.comparison && settings.comparison.enabled !== false) {
      const cmp = comparisonText({ values, assess }, previous);
      if (cmp) blocks.push(heading('Verlauf', cmp));
    }

    const summary = summaryText(ctx);
    if (summary) blocks.push(summary);
    return blocks.join('\n\n');
  }

  return {
    autoGrade, diastolicGrade, autoGradeAll, formatNumber, formatValue, formatMeasure, renderTemplate, segmentText,
    joinList, measureList, summaryText, comparisonItems, comparisonText, generate,
  };
});
