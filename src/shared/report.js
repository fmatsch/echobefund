// Automatische Bewertung anhand der Normwerte und Erzeugung des Befundtexts.
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

  // ---------- Bewertung ----------

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

  function autoGradeAll(norms, values, sex) {
    const out = {};
    for (const f of Schema.allFields()) {
      if (!f.auto) continue;
      const v = autoGrade(f.auto, norms, values, sex);
      if (v !== undefined) out[f.id] = v;
    }
    return out;
  }

  // ---------- Formatierung ----------

  function formatNumber(v, dec) {
    return v.toFixed(dec).replace('.', ',');
  }

  function formatMeasure(id, values) {
    const m = MEASURE_BY_ID[id];
    const v = values[id];
    if (!m || !isNum(v)) return '';
    return `${m.abbr || m.label} ${formatNumber(v, m.dec)}${m.unit ? ' ' + m.unit : ''}`;
  }

  const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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
    if (!field || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
    if (!Schema.isVisible(field, ctx.assess)) return '';
    const tpls = ctx.templates[fieldId] || {};

    if (field.type === 'text') return String(value).trim();

    const measureText = ctx.settings.measuresMode === 'text' ? inlineMeasures(field, ctx.values) : '';
    const sub = { ...ctx, measureText, segmentText: segmentText(ctx.assess.wmaSegments) };

    if (field.type === 'multi') {
      const items = value.filter((o) => field.options.includes(o))
        .map((o) => renderTemplate(tpls[o] !== undefined ? tpls[o] : fallback(o, fragment), sub))
        .filter(Boolean);
      if (!items.length) return '';
      if (fragment) return renderTemplate((tpls._wrap || ' ({liste})').replace('{liste}', items.join(', ')), sub);
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

  // ---------- Befund ----------

  const LIST_GROUPS = [
    ['Allgemein', ['bsa', 'hf']],
    ['LV', ['lvedd', 'lvesd', 'ivs', 'lvpw', 'lvef', 'lvedv', 'lvesv', 'lvefSimpson', 'lvedvi', 'lvMass', 'lvmi', 'rwt']],
    ['Diastole', ['eWave', 'aWave', 'ea', 'ePrimeSept', 'ePrimeLat', 'eePrime']],
    ['Rechtes Herz / Vorhöfe', ['rvBasal', 'tapse', 'laDiam', 'laVol', 'lavi', 'raDiam', 'trVmax', 'trPmax', 'vci', 'rap', 'spap']],
    ['Klappen', ['avVmax', 'avPmax', 'avPmean', 'avVti', 'lvotD', 'lvotVti', 'sv', 'svi', 'co', 'ava', 'avai', 'dvi', 'mvPmean', 'mva', 'tvPmean', 'pvVmax', 'pvPmax']],
    ['Aorta', ['aoSinus', 'aoAsc']],
  ];

  function measureList(values) {
    return LIST_GROUPS.map(([title, ids]) => {
      const parts = ids.map((id) => formatMeasure(id, values)).filter(Boolean);
      return parts.length ? `${title}: ${parts.join(', ')}` : '';
    }).filter(Boolean);
  }

  // input: { values (inkl. berechneter), assess, settings }
  function generate({ values, assess, settings }) {
    const templates = settings.templates || Defaults.TEMPLATES;
    const ctx = { values, assess, settings, templates };
    const blocks = [];

    for (const section of Schema.SECTIONS) {
      if (section.toggle && !settings.showPulmonary) continue;
      const sentences = section.fields
        .filter((f) => !Defaults.FRAGMENT_FIELDS.includes(f.id) && f.type !== 'wma' && f.type !== 'text')
        .map((f) => renderField(f.id, ctx, false))
        .filter(Boolean);
      if (section.id === 'allgemein') {
        if (sentences.length) blocks.push(cleanup(sentences.join(' ')));
        if (settings.measuresMode === 'liste') {
          const list = measureList(values);
          if (list.length) blocks.push(['Messwerte:', ...list].join('\n'));
        }
        continue;
      }
      if (!sentences.length) continue;
      const body = cleanup(sentences.join(' '));
      blocks.push(settings.sectionHeadings ? `${section.title}: ${body}` : body);
    }

    const extra = renderField('freitext', ctx, false);
    if (extra) blocks.push(extra);
    return blocks.join('\n\n');
  }

  return { autoGrade, autoGradeAll, formatNumber, formatMeasure, renderTemplate, segmentText, measureList, generate };
});
