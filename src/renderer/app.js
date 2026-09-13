(function () {
  const { MEASURES, MEASURE_GROUPS, SECTIONS, allFields, isVisible } = window.EchoSchema;
  const { SHARED_KEYS } = window.EchoDefaults;
  const { h, merge } = window.EchoSettingsUI;
  const Calc = window.EchoCalc;
  const Report = window.EchoReport;
  const SrMap = window.EchoSrMap;
  const api = window.api;
  const $ = (sel) => document.querySelector(sel);
  const FIELDS = allFields();
  const FIELD_IDS = new Set(FIELDS.map((f) => f.id));
  const MEASURE_BY_ID = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  let settings;
  let state;
  let autoSet = new Set(); // Felder, deren Wert aktuell von der Automatik stammt
  let dirty = false;
  let profileStamp = null; // Stand des gemeinsamen Profils beim letzten Lesen/Schreiben
  const fieldViews = {};    // id -> { root, update }
  const derivedOutputs = {}; // id -> <output>
  const measureInputs = {};  // id -> <input>
  const prevHints = {};      // id -> <small> "zuvor …"
  const groupEls = [];       // { el, group }
  const moduleCards = [];    // { card, section }

  const today = () => new Date().toLocaleDateString('sv-SE'); // JJJJ-MM-TT in lokaler Zeit
  const deDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
  const fmt = (v, dec) => v.toFixed(dec).replace('.', ',');

  function emptyState() {
    const assess = {};
    for (const f of FIELDS) if (f.default) assess[f.id] = f.default;
    return {
      id: null, created: null,
      patient: { name: '', vorname: '', geburtsdatum: '', patId: '', sex: '', datum: today(), untersucher: settings.lastExaminer || '', indikation: '' },
      values: {}, assess, manual: [],
      modules: { ...settings.modules },
      compare: settings.comparison.inReport !== false,
      reportText: '',
      gdt: null,      // { charset, testType, senderId, sentAt, file } bei Auftrag aus der Praxissoftware
      previous: null, // Vorbefund aus dem Archiv (wird nicht mitgespeichert)
    };
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function setDirty(v) {
    dirty = v;
    const p = state.patient;
    const who = [p.name, p.vorname].filter(Boolean).join(', ');
    $('#record-status').textContent = `${state.id ? who || 'Befund' : 'Neuer Befund'}${dirty ? ' • ungespeichert' : ''}`;
  }

  // ---------- Einstellungen & gemeinsames Profil ----------

  const sharedSubset = (s) => Object.fromEntries(SHARED_KEYS.map((k) => [k, s[k]]));

  function applyShared(data) {
    const next = { ...settings };
    for (const k of SHARED_KEYS) if (data[k] !== undefined) next[k] = data[k];
    settings = merge(next);
  }

  async function connectProfile(path) {
    const r = await api.profileRead(path);
    if (r.ok) {
      const when = r.data.stamp ? new Date(r.data.stamp).toLocaleString('de-DE') : 'unbekannt';
      const from = r.data.savedBy ? ` an „${r.data.savedBy}“` : '';
      if (confirm(`Im gewählten Ordner liegt bereits ein gemeinsames Profil (zuletzt gespeichert ${when}${from}).\n\nOK = Einstellungen aus dem Profil übernehmen\nAbbrechen = das Profil mit den Einstellungen dieses Arbeitsplatzes überschreiben`)) {
        applyShared(r.data);
      }
      profileStamp = r.data.stamp || null;
      return true;
    }
    if (r.missing) {
      profileStamp = null;
      return true;
    }
    alert(`Das gemeinsame Profil kann nicht gelesen werden:\n${r.error}`);
    return false;
  }

  // Speichert lokal und – falls verbunden und gemeinsame Einstellungen betroffen – im gemeinsamen Profil.
  async function persistSettings(sharedChanged) {
    await api.saveSettings(settings);
    if (!sharedChanged || !settings.profile.path) return;
    let w = await api.profileWrite(settings.profile.path, sharedSubset(settings), profileStamp, false);
    if (w.conflict) {
      const overwrite = confirm('Das gemeinsame Profil wurde inzwischen an einem anderen Arbeitsplatz geändert.\n\nOK = Ihre Änderungen trotzdem speichern (überschreibt die anderen Änderungen)\nAbbrechen = Profil neu laden (Ihre Änderungen an gemeinsamen Einstellungen gehen verloren)');
      if (!overwrite) {
        applyShared(w.current);
        profileStamp = w.current.stamp || null;
        await api.saveSettings(settings);
        refreshAll();
        return;
      }
      w = await api.profileWrite(settings.profile.path, sharedSubset(settings), profileStamp, true);
    }
    if (w.ok) profileStamp = w.stamp;
    else toast('Gemeinsames Profil nicht erreichbar – Einstellungen nur an diesem Arbeitsplatz gespeichert');
  }

  // Übernimmt Änderungen anderer Arbeitsplätze (beim Zurückkehren ins Fenster).
  async function syncProfile() {
    if (!settings.profile.path || document.querySelector('dialog[open]')) return;
    const r = await api.profileRead(settings.profile.path);
    if (!r.ok || !r.data.stamp || r.data.stamp === profileStamp) return;
    applyShared(r.data);
    profileStamp = r.data.stamp;
    await api.saveSettings(settings);
    refreshAll();
    toast('Gemeinsame Einstellungen wurden von einem anderen Arbeitsplatz aktualisiert');
  }

  function refreshAll() {
    updateGdtUI();
    refresh(false);
  }

  // ---------- Messwerte ----------

  function parseNum(s) {
    const t = String(s).trim().replace(',', '.');
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function buildMeasures() {
    const root = $('#measures');
    root.append(h('button', { class: 'import-btn', id: 'btn-sr', title: 'Messwerte aus einer DICOM-SR-Datei des Echogeräts übernehmen', onclick: importSr }, 'DICOM-SR importieren …'));
    for (const group of MEASURE_GROUPS) {
      const rows = MEASURES.filter((m) => m.group === group.id).map((m) => {
        let control;
        if (m.derived) {
          control = derivedOutputs[m.id] = h('output', {}, '–');
        } else {
          control = measureInputs[m.id] = h('input', {
            inputmode: 'decimal',
            oninput: (e) => {
              const n = parseNum(e.target.value);
              e.target.classList.toggle('invalid', Number.isNaN(n));
              if (n === undefined || Number.isNaN(n)) delete state.values[m.id];
              else state.values[m.id] = n;
              refresh(true);
            },
          });
        }
        prevHints[m.id] = h('small', { class: 'prev', hidden: true });
        return h('label', { class: 'measure' }, h('span', {}, m.label), control, h('span', { class: 'unit' }, m.unit), prevHints[m.id]);
      });
      const el = group.collapsible
        ? h('details', { class: 'measure-group', open: !group.collapsed }, h('summary', {}, group.title), rows)
        : h('div', { class: 'measure-group' }, h('h3', {}, group.title), rows);
      groupEls.push({ el, group });
      root.append(el);
    }
  }

  const ageOf = (p) => Calc.ageYears(p.geburtsdatum, p.datum);

  function computedValues() {
    return Calc.compute(state.values, state.assess, { bsaFormula: settings.bsaFormula, age: ageOf(state.patient) });
  }

  function previousComputed() {
    const prev = state.previous;
    if (!prev) return null;
    const assess = prev.assess || {};
    return {
      datum: prev.datum,
      assess,
      values: Calc.compute(prev.values || {}, assess, { bsaFormula: settings.bsaFormula, age: ageOf(prev.patient || {}) }),
    };
  }

  // ---------- Beurteilungen ----------

  function buildAssessments() {
    const root = $('#assessments');
    for (const section of SECTIONS) {
      const card = h('div', { class: 'card', 'data-section': section.id });
      const heading = h('h3', {}, section.title);
      if (section.module) {
        const cb = h('input', { type: 'checkbox', onchange: (e) => { state.modules[section.module] = e.target.checked; refresh(true); } });
        heading.append(h('label', {}, cb, ' einblenden'));
        card._toggle = cb;
        moduleCards.push({ card, section });
      }
      card.append(heading);
      for (const field of section.fields) {
        const view = buildField(field);
        fieldViews[field.id] = view;
        card.append(view.root);
      }
      root.append(card);
    }
  }

  function markManual(field) {
    if (!state.manual.includes(field.id)) state.manual.push(field.id);
    autoSet.delete(field.id);
  }

  function buildField(field) {
    const badge = h('span', { class: 'badge', hidden: true }, 'auto');
    const revert = h('button', {
      class: 'revert', hidden: true, title: 'Wieder automatisch bewerten',
      onclick: () => { state.manual = state.manual.filter((id) => id !== field.id); refresh(true); },
    }, '↺ auto');
    const label = h('div', { class: 'field-label' }, field.label, badge, revert);
    const root = h('div', { class: 'field' }, label);
    let update;

    if (field.type === 'radio' || field.type === 'multi') {
      const chips = field.options.map((opt) => h('button', {
        class: `chip${field.type === 'multi' ? ' multi' : ''}`,
        onclick: () => {
          if (field.type === 'multi') {
            const cur = new Set(state.assess[field.id] || []);
            cur.has(opt) ? cur.delete(opt) : cur.add(opt);
            state.assess[field.id] = field.options.filter((o) => cur.has(o));
          } else {
            state.assess[field.id] = state.assess[field.id] === opt ? '' : opt;
            markManual(field);
          }
          refresh(true);
        },
      }, opt));
      root.append(h('div', { class: 'chips' }, chips));
      update = () => {
        const v = state.assess[field.id];
        chips.forEach((c, i) => {
          const opt = field.options[i];
          c.setAttribute('aria-pressed', String(Array.isArray(v) ? v.includes(opt) : v === opt));
        });
      };
    } else if (field.type === 'wma') {
      const container = h('div');
      root.append(container);
      const bull = window.EchoBullseye.render(container, () => state.assess[field.id] || {}, (segs) => {
        state.assess[field.id] = segs;
        refresh(true);
      });
      update = bull.update;
    } else if (field.type === 'text') {
      const ta = h('textarea', { placeholder: 'Freitext, wird am Ende des Befunds angefügt', oninput: (e) => { state.assess[field.id] = e.target.value; setDirty(true); } });
      root.append(ta);
      update = () => { if (document.activeElement !== ta) ta.value = state.assess[field.id] || ''; };
    }

    return {
      root,
      update: (autoAvailable) => {
        update();
        root.hidden = !isVisible(field, state.assess);
        const isAuto = autoSet.has(field.id);
        root.classList.toggle('is-auto', isAuto);
        badge.hidden = !isAuto;
        revert.hidden = !(field.auto && state.manual.includes(field.id) && autoAvailable);
      },
    };
  }

  function applyAuto(values) {
    const auto = Report.autoGradeAll(settings.norms, values, state.patient.sex, state.assess);
    if (!settings.autoGrade) return auto;
    for (const f of FIELDS) {
      if (!f.auto || state.manual.includes(f.id)) continue;
      if (auto[f.id] !== undefined) {
        state.assess[f.id] = auto[f.id];
        autoSet.add(f.id);
      } else if (autoSet.has(f.id)) {
        delete state.assess[f.id];
        autoSet.delete(f.id);
      }
    }
    return auto;
  }

  function refresh(changed) {
    const values = computedValues();
    const auto = applyAuto(values);
    for (const m of MEASURES) {
      if (!m.derived) continue;
      const v = values[m.id];
      derivedOutputs[m.id].textContent = isNum(v) ? fmt(v, m.dec) : '–';
    }
    updatePreviousUI();
    for (const f of FIELDS) fieldViews[f.id].update(auto[f.id] !== undefined);
    for (const { card, section } of moduleCards) {
      const on = !!state.modules[section.module];
      card._toggle.checked = on;
      card.classList.toggle('collapsed', !on);
    }
    for (const { el, group } of groupEls) if (group.module) el.hidden = !state.modules[group.module];
    if (changed) setDirty(true);
  }

  // ---------- Vorbefund ----------

  let prevTimer = null;
  let prevSeq = 0;

  function schedulePreviousLookup() {
    clearTimeout(prevTimer);
    prevTimer = setTimeout(lookupPrevious, 350);
  }

  async function lookupPrevious() {
    const p = state.patient;
    const seq = ++prevSeq;
    if (settings.comparison.enabled === false || !(p.patId || (p.name && p.geburtsdatum))) {
      if (state.previous) { state.previous = null; refresh(false); }
      return;
    }
    const prev = await api.findPrevious({ patient: p, excludeId: state.id, beforeDate: p.datum });
    if (seq !== prevSeq) return; // inzwischen neue Suche gestartet
    state.previous = prev || null;
    refresh(false);
  }

  function updatePreviousUI() {
    const prev = settings.comparison.enabled !== false ? previousComputed() : null;
    $('#prev-strip').hidden = !prev;
    for (const m of MEASURES) {
      // Alter und KOF ändern sich ohnehin – kein Vergleichshinweis
      const v = prev && m.group !== 'basis' && prev.values[m.id];
      const hint = prevHints[m.id];
      hint.hidden = !isNum(v);
      hint.textContent = isNum(v) ? `zuvor ${fmt(v, m.dec)}` : '';
    }
    if (prev) {
      $('#prev-date').textContent = deDate(prev.datum) || 'ohne Datum';
      $('#prev-compare').checked = !!state.compare;
    }
  }

  function showPreviousReport() {
    const prev = state.previous;
    if (!prev) return;
    $('#prev-dialog-title').textContent = `Vorbefund vom ${deDate(prev.datum) || 'ohne Datum'}`;
    $('#prev-dialog-text').textContent = prev.reportText || '(Für diesen Befund wurde kein Befundtext gespeichert.)';
    $('#prev-dialog').showModal();
  }

  // ---------- Vorlagen ----------

  function hidePresetMenu() {
    $('#preset-menu').hidden = true;
  }

  function renderPresetMenu() {
    const menu = $('#preset-menu');
    menu.textContent = '';
    for (const preset of settings.presets) {
      menu.append(h('button', { class: 'menu-item', onclick: () => { hidePresetMenu(); applyPreset(preset); } }, preset.name));
    }
    if (!settings.presets.length) menu.append(h('div', { class: 'menu-empty' }, 'Noch keine Vorlagen'));
    menu.append(h('hr'), h('button', { class: 'menu-item', onclick: () => { hidePresetMenu(); saveAsPreset(); } }, 'Aktuelle Auswahl als Vorlage speichern …'));
  }

  function applyPreset(preset) {
    for (const [id, value] of Object.entries(preset.assess || {})) {
      if (!FIELD_IDS.has(id)) continue;
      state.assess[id] = structuredClone(value);
      state.manual = state.manual.filter((x) => x !== id);
      autoSet.delete(id);
    }
    if (preset.modules) state.modules = { ...state.modules, ...preset.modules };
    refresh(true); // Messwerte und automatische Bewertung haben Vorrang
    toast(`Vorlage „${preset.name}“ angewendet`);
  }

  async function saveAsPreset() {
    const name = await askText('Vorlage speichern', 'Name der Vorlage (z. B. „Kontrolle nach TAVI“)', '');
    if (!name) return;
    const assess = {};
    for (const f of FIELDS) {
      const v = state.assess[f.id];
      if (f.type === 'text' || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
      assess[f.id] = structuredClone(v);
    }
    const existing = settings.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirm(`Vorlage „${existing.name}“ überschreiben?`)) return;
    const preset = { id: existing ? existing.id : `v${Date.now()}`, name, assess, modules: { ...state.modules } };
    settings.presets = existing ? settings.presets.map((p) => (p === existing ? preset : p)) : [...settings.presets, preset];
    await persistSettings(true);
    toast(`Vorlage „${name}“ gespeichert`);
  }

  function askText(title, label, value) {
    return new Promise((resolve) => {
      const dlg = $('#prompt-dialog');
      let result = null;
      dlg.textContent = '';
      const input = h('input', { type: 'text', value: value || '' });
      const form = h('form', { onsubmit: (e) => { e.preventDefault(); result = input.value.trim() || null; dlg.close(); } },
        h('header', {}, h('h2', {}, title)),
        h('div', { class: 'prompt-body' }, h('label', {}, label, input)),
        h('footer', {}, h('div', { class: 'spacer' }),
          h('button', { type: 'button', onclick: () => dlg.close() }, 'Abbrechen'),
          h('button', { type: 'submit', class: 'primary' }, 'OK')));
      dlg.append(form);
      dlg.onclose = () => resolve(result);
      dlg.showModal();
      input.focus();
    });
  }

  // ---------- DICOM-SR-Import ----------

  async function importSr() {
    const results = await api.importSr();
    if (!results) return;
    const errors = results.filter((r) => r.error);
    const files = results.filter((r) => !r.error && r.measurements.length);
    if (!files.length) {
      const reasons = [
        ...errors.map((r) => `${r.file}: ${r.error}`),
        ...results.filter((r) => !r.error && !r.measurements.length).map((r) => `${r.file}: keine Messwerte enthalten`),
      ];
      alert(`Es konnten keine Messwerte gelesen werden.\n\n${reasons.join('\n')}`);
      return;
    }
    openSrDialog(files, errors);
  }

  function patientWarnings(files) {
    const p = state.patient;
    const current = SrMap.normalizeName(`${p.name} ${p.vorname}`);
    const out = [];
    for (const f of files) {
      const idMismatch = f.patient.id && p.patId && f.patient.id.trim() !== p.patId.trim();
      const srName = SrMap.normalizeName(f.patient.name);
      const nameMismatch = srName && current && srName !== current;
      const birthMismatch = f.patient.birthDate && p.geburtsdatum && f.patient.birthDate !== p.geburtsdatum;
      if (idMismatch || nameMismatch || birthMismatch) {
        out.push(`${f.file}: ${f.patient.name || 'ohne Name'} · ID ${f.patient.id || '–'} · geb. ${deDate(f.patient.birthDate) || '–'}`);
      }
    }
    return out;
  }

  function openSrDialog(files, errors) {
    const dlg = $('#sr-dialog');
    dlg.textContent = '';
    const targets = MEASURES.filter((m) => !m.derived);
    const rows = [];
    const tbody = h('tbody');

    for (const f of files) {
      const info = [f.file, f.patient.name || 'ohne Name', f.studyDate && deDate(f.studyDate), f.manufacturer, `${f.measurements.length} Messwerte`].filter(Boolean).join(' · ');
      tbody.append(h('tr', { class: 'sr-file' }, h('td', { colspan: 5 }, info)));
      for (const item of f.measurements) {
        const mapping = SrMap.resolveMapping(item, settings.srMappings);
        const row = { item, measureId: mapping.measureId, source: mapping.source, touched: false, converted: null };
        const preview = h('td', { class: 'sr-preview' });
        const badge = h('span', { class: `sr-badge ${mapping.source || ''}` },
          mapping.source === 'gemerkt' ? 'gemerkt' : mapping.source === 'vorschlag' ? 'Vorschlag – bitte prüfen' : '');
        const updatePreview = () => {
          const m = MEASURE_BY_ID[row.measureId];
          row.converted = m ? SrMap.convertUnit(item.value, item.unit, m.unit) : null;
          preview.classList.toggle('bad', !!m && row.converted === null);
          preview.textContent = !m ? '' : row.converted === null ? 'Einheit passt nicht' : `→ ${fmt(row.converted, m.dec)} ${m.unit}`;
        };
        const select = h('select', {
          onchange: (e) => {
            row.measureId = e.target.value;
            row.touched = true;
            badge.textContent = '';
            badge.className = 'sr-badge';
            updatePreview();
          },
        },
        h('option', { value: '' }, '— nicht übernehmen —'),
        targets.map((m) => h('option', { value: m.id, selected: m.id === row.measureId }, `${m.label}${m.unit ? ` [${m.unit}]` : ''}`)));
        updatePreview();
        rows.push(row);
        tbody.append(h('tr', {},
          h('td', { class: 'sr-label' }, item.label),
          h('td', { class: 'num' }, String(item.value).replace('.', ',')),
          h('td', {}, item.unitMeaning || item.unit),
          h('td', {}, select, ' ', badge),
          preview));
      }
    }

    const warnings = patientWarnings(files);
    const remember = h('input', { type: 'checkbox', checked: true });
    const applyBtn = h('button', { class: 'primary', disabled: warnings.length > 0, onclick: apply }, 'Übernehmen');
    const confirmBox = h('input', { type: 'checkbox', onchange: (e) => { applyBtn.disabled = !e.target.checked; } });

    dlg.append(
      h('header', {}, h('h2', {}, 'Messwerte aus DICOM-SR übernehmen')),
      h('div', { class: 'sr-body' },
        warnings.length ? h('div', { class: 'sr-warning' },
          h('strong', {}, 'Achtung: Die Datei gehört möglicherweise zu einem anderen Patienten!'),
          h('ul', {}, warnings.map((w) => h('li', {}, w))),
          h('label', {}, confirmBox, ' Ich habe geprüft, dass die Messwerte zu diesem Patienten gehören.')) : null,
        errors.length ? h('div', { class: 'sr-errors' }, `Nicht lesbar: ${errors.map((r) => `${r.file} (${r.error})`).join('; ')}`) : null,
        h('p', { class: 'hint' }, 'Wählen Sie für jeden Messwert das passende Feld. Vorschläge beruhen auf der englischen Gerätebezeichnung und müssen geprüft werden. Einheiten werden automatisch umgerechnet; bereits eingetragene Werte werden überschrieben.'),
        h('table', { class: 'sr-table' },
          h('thead', {}, h('tr', {}, ['Messung (laut Gerät)', 'Wert', 'Einheit', 'Übernehmen als', 'Ergebnis'].map((t) => h('th', {}, t)))),
          tbody)),
      h('footer', {},
        h('label', {}, remember, ' Zuordnungen für künftige Importe merken'),
        h('div', { class: 'spacer' }),
        h('button', { onclick: () => dlg.close() }, 'Abbrechen'),
        applyBtn));
    dlg.showModal();

    async function apply() {
      const taken = new Set();
      const skipped = [];
      let count = 0;
      for (const row of rows) {
        const m = MEASURE_BY_ID[row.measureId];
        if (!m) continue;
        if (row.converted === null) { skipped.push(`${row.item.label}: Einheit passt nicht zu ${m.label}`); continue; }
        if (taken.has(m.id)) { skipped.push(`${row.item.label}: ${m.label} ist bereits aus einer anderen Messung belegt`); continue; }
        taken.add(m.id);
        const value = Number(row.converted.toFixed(m.dec));
        state.values[m.id] = value;
        measureInputs[m.id].value = String(value).replace('.', ',');
        measureInputs[m.id].classList.remove('invalid');
        count++;
      }
      if (remember.checked) {
        let changed = false;
        for (const row of rows) {
          if (!row.touched && !(row.measureId && row.source === 'vorschlag')) continue;
          settings.srMappings[SrMap.keyOf(row.item)] = row.measureId;
          changed = true;
        }
        if (changed) await persistSettings(true);
      }
      dlg.close();
      refresh(true);
      toast(`${count} Messwert${count === 1 ? '' : 'e'} übernommen`);
      if (skipped.length) alert(`Nicht übernommen:\n\n${skipped.join('\n')}`);
    }
  }

  // ---------- Befund ----------

  function generateReport() {
    const text = Report.generate({
      values: computedValues(),
      assess: state.assess,
      settings: { ...settings, modules: state.modules },
      previous: state.compare ? previousComputed() : null,
    });
    $('#report').value = text;
    state.reportText = text;
    setDirty(true);
    api.copyText(text).then(() => toast('Befund erstellt und in die Zwischenablage kopiert'));
  }

  function fillPrintView() {
    const p = state.patient;
    const pr = settings.practice;
    const row = (k, v) => [h('dt', {}, k), h('dd', {}, v || '–')];
    const view = $('#print-view');
    view.textContent = '';
    view.append(
      h('div', { class: 'pv-head' },
        h('div', { class: 'pv-title' }, 'Echokardiographie'),
        h('div', { class: 'pv-practice' }, [pr.name, pr.address].filter(Boolean).join('\n'))),
      h('dl', { class: 'pv-patient' },
        row('Patient', [p.name, p.vorname].filter(Boolean).join(', ')), row('Geburtsdatum', deDate(p.geburtsdatum)),
        row('Pat.-ID', p.patId), row('Untersuchung', deDate(p.datum)),
        row('Indikation', p.indikation), row('Untersucher', p.untersucher)),
      h('div', { class: 'pv-text' }, $('#report').value),
      h('div', { class: 'pv-sign' }, p.untersucher || 'Unterschrift'),
      pr.footer ? h('div', { class: 'pv-footer' }, pr.footer) : null,
    );
  }

  function ensureReport() {
    if (!$('#report').value.trim()) generateReport();
    fillPrintView();
  }

  function pdfName() {
    const p = state.patient;
    const parts = ['Echo', p.name, p.vorname, p.datum].filter(Boolean).join('_');
    return `${parts.replace(/[^\p{L}\p{N}_.-]+/gu, '-')}.pdf`;
  }

  // ---------- Laden / Speichern ----------

  function loadIntoUI() {
    for (const input of document.querySelectorAll('[data-p]')) input.value = state.patient[input.dataset.p] || '';
    for (const [id, input] of Object.entries(measureInputs)) {
      const v = state.values[id];
      input.value = typeof v === 'number' ? String(v).replace('.', ',') : '';
      input.classList.remove('invalid');
    }
    $('#report').value = state.reportText || '';
    autoSet = new Set();
    refresh(false);
    setDirty(false);
    lookupPrevious();
  }

  function confirmDiscard() {
    return !dirty || confirm('Ungespeicherte Änderungen verwerfen?');
  }

  async function save() {
    const p = state.patient;
    if (!p.name && !p.patId) {
      toast('Bitte Name oder Patienten-ID eingeben');
      document.querySelector('[data-p="name"]').focus();
      return;
    }
    state.reportText = $('#report').value;
    const saved = await api.saveRecord({
      id: state.id, created: state.created, patient: p, values: state.values, assess: state.assess,
      manual: state.manual, modules: state.modules, reportText: state.reportText, gdt: state.gdt,
    });
    state.id = saved.id;
    state.created = saved.created;
    if (p.untersucher && p.untersucher !== settings.lastExaminer) {
      settings.lastExaminer = p.untersucher;
      persistSettings(false);
    }
    setDirty(false);
    toast('Befund gespeichert');
  }

  function stateFromRecord(rec) {
    const base = emptyState();
    const next = {
      ...base,
      ...rec,
      patient: { ...base.patient, ...rec.patient },
      modules: rec.modules ? { ...base.modules, ...rec.modules } : { pk: !!rec.showPk, stress: false, tee: false },
      compare: base.compare,
      previous: null,
    };
    delete next.showPk;
    return next;
  }

  async function openArchive(initialSearch) {
    const dialog = $('#archive-dialog');
    const list = $('#archive-list');
    const search = $('#archive-search');
    $('#archive-path').textContent = await api.archiveDir();
    let records = await api.listRecords();

    const render = () => {
      const q = search.value.trim().toLowerCase();
      const rows = records.filter((r) => {
        const p = r.patient || {};
        return !q || [p.name, p.vorname, p.patId, deDate(p.datum), deDate(p.geburtsdatum)].join(' ').toLowerCase().includes(q);
      });
      list.textContent = '';
      if (!rows.length) { list.append(h('p', { class: 'hint' }, records.length ? 'Keine Treffer.' : 'Noch keine Befunde gespeichert.')); return; }
      list.append(h('table', {},
        h('thead', {}, h('tr', {}, ['Untersuchung', 'Name', 'Geb.-Datum', 'Pat.-ID', 'Geändert', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, rows.map((r) => {
          const p = r.patient || {};
          return h('tr', { class: 'clickable', ondblclick: () => openRecord(r.id) },
            h('td', {}, deDate(p.datum)),
            h('td', {}, [p.name, p.vorname].filter(Boolean).join(', ')),
            h('td', {}, deDate(p.geburtsdatum)),
            h('td', {}, p.patId || ''),
            h('td', {}, new Date(r.updated).toLocaleString('de-DE')),
            h('td', {},
              h('button', { onclick: () => openRecord(r.id) }, 'Öffnen'), ' ',
              h('button', { onclick: async () => {
                if (!confirm('Befund in den Papierkorb verschieben?')) return;
                await api.deleteRecord(r.id);
                records = records.filter((x) => x.id !== r.id);
                if (state.id === r.id) { state.id = null; setDirty(true); }
                render();
              } }, 'Löschen')));
        }))));
    };

    async function openRecord(id) {
      if (!confirmDiscard()) return;
      const rec = await api.loadRecord(id);
      if (!rec) { toast('Befund konnte nicht geladen werden'); return; }
      state = stateFromRecord(rec);
      loadIntoUI();
      dialog.close();
    }

    search.oninput = render;
    search.value = typeof initialSearch === 'string' ? initialSearch : '';
    render();
    dialog.showModal();
  }

  // ---------- Praxissoftware (GDT) ----------

  let pendingGdt = null;
  let gdtStatus = { state: 'off' };

  // Ampel: Zustand aus dem Hauptprozess → Farbe, Text, Hinweis, Sprungmarke in der Anleitung
  function statusView(status, g) {
    const name = g.pvsName || 'Praxissoftware';
    const time = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    switch (status.state) {
      case 'unconfigured':
        return { cls: 'err', text: 'GDT: kein Ordner', anchor: 'teil3',
          tip: 'Kein Austauschordner eingestellt. Einstellungen → Praxissoftware (GDT) → Austauschordner wählen.' };
      case 'unreachable':
        return { cls: 'err', text: 'GDT-Ordner nicht erreichbar', anchor: 'p-ordner',
          tip: `Der Austauschordner ${g.dir} ist nicht erreichbar – z. B. Server ausgeschaltet, Netzwerk getrennt oder Ordner gelöscht. Aufträge aus ${name} kommen so nicht an. Klicken für Hilfe.` };
      case 'waiting':
        return { cls: 'warn', text: 'Befund wartet auf Abholung', anchor: 'p-abholung',
          tip: `Der gesendete Befund (${status.file}) liegt seit ${time(status.since)} Uhr im Austauschordner und wurde von ${name} noch nicht abgeholt. Klicken für Hilfe.` };
      case 'ok':
        return { cls: 'ok', text: `GDT: ${name}`, anchor: 'alltag',
          tip: `Verbunden: Austauschordner ${g.dir} ist erreichbar, keine Befunde warten auf Abholung.` };
      default:
        return null;
    }
  }

  function updateGdtUI() {
    const g = settings.gdt;
    const name = g.pvsName || 'Praxissoftware';
    $('#btn-gdt-send').hidden = !g.enabled;
    $('#btn-gdt-send').textContent = `An ${name} senden`;
    const badge = $('#gdt-badge');
    // Bis der erste Status eintrifft, den Zustand aus den Einstellungen annehmen
    const status = !g.enabled ? { state: 'off' } : gdtStatus.state === 'off' ? { state: g.dir ? 'ok' : 'unconfigured' } : gdtStatus;
    const view = statusView(status, g);
    badge.hidden = !view;
    if (!view) return;
    badge.className = `gdt-badge ${view.cls}`;
    badge.textContent = view.text;
    badge.title = view.tip;
    badge.dataset.anchor = view.anchor;
  }

  function handleGdtRequest(req) {
    const who = [req.patient.name, req.patient.vorname].filter(Boolean).join(', ') || req.patient.patId || 'unbekannt';
    if (req.type === 'anzeigen') {
      openArchive(req.patient.patId || req.patient.name);
      return;
    }
    if (req.type !== 'untersuchung' && req.type !== 'stammdaten') {
      toast(`GDT-Satzart ${req.satzart} wird nicht unterstützt`);
      return;
    }
    if (dirty) {
      pendingGdt = req;
      $('#gdt-banner-text').textContent = `Neuer Auftrag von ${settings.gdt.pvsName || 'der Praxissoftware'}: ${who}`;
      $('#gdt-banner').hidden = false;
      return;
    }
    applyGdtRequest(req);
  }

  function applyGdtRequest(req) {
    pendingGdt = null;
    $('#gdt-banner').hidden = true;
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    state = emptyState();
    for (const [k, v] of Object.entries(req.patient)) if (v) state.patient[k] = v;
    if (req.datum) state.patient.datum = req.datum;
    if (req.groesse) state.values.groesse = req.groesse;
    if (req.gewicht) state.values.gewicht = req.gewicht;
    state.gdt = { charset: req.charset, testType: req.testType, senderId: req.senderId };
    loadIntoUI();
    const who = [state.patient.name, state.patient.vorname].filter(Boolean).join(', ');
    toast(`Patient übernommen: ${who || state.patient.patId}`);
  }

  async function sendToPvs() {
    const p = state.patient;
    const name = settings.gdt.pvsName || 'Praxissoftware';
    if (!$('#report').value.trim()) generateReport();
    if (!p.patId && !confirm(`Keine Patientennummer vorhanden. ${name} ordnet den Befund dann dem gerade geöffneten Patienten zu. Trotzdem senden?`)) return;
    fillPrintView();
    const values = computedValues();
    const measures = MEASURES
      .filter((m) => !['groesse', 'gewicht', 'age'].includes(m.id) && isNum(values[m.id]))
      .map((m) => ({ id: m.id.toUpperCase().slice(0, 20), label: m.label, value: values[m.id].toFixed(m.dec), unit: m.unit }));
    const res = await api.gdtSend({
      patient: p,
      reportText: $('#report').value,
      measures,
      groesse: values.groesse,
      gewicht: values.gewicht,
      charset: state.gdt && state.gdt.charset,
      testType: state.gdt && state.gdt.testType,
    });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    state.reportText = $('#report').value;
    state.gdt = { ...(state.gdt || {}), sentAt: new Date().toISOString(), file: res.file };
    if (settings.gdt.autoSave && (p.name || p.patId)) await save();
    else setDirty(true);
    toast(`Befund an ${name} übergeben`);
  }

  // ---------- Update-Hinweis ----------

  function showUpdate(info) {
    if (!info || info.status !== 'available') return;
    $('#update-text').textContent = `Neue Version ${info.version} von Echobefund verfügbar (installiert: ${info.current}).`;
    $('#update-open').onclick = () => api.openRelease(info.url);
    $('#update-later').onclick = () => { $('#update-banner').hidden = true; };
    $('#update-banner').hidden = false;
  }

  // ---------- Start ----------

  function bindUI() {
    const PREV_KEYS = ['patId', 'name', 'vorname', 'geburtsdatum', 'datum'];
    for (const input of document.querySelectorAll('[data-p]')) {
      input.addEventListener('input', () => {
        state.patient[input.dataset.p] = input.value;
        refresh(true);
        if (PREV_KEYS.includes(input.dataset.p)) schedulePreviousLookup();
      });
    }
    $('#report').addEventListener('input', () => setDirty(true));
    $('#btn-generate').onclick = generateReport;
    $('#btn-copy').onclick = () => api.copyText($('#report').value).then(() => toast('In die Zwischenablage kopiert'));
    $('#btn-pdf').onclick = async () => { ensureReport(); if (await api.exportPdf(pdfName())) toast('PDF gespeichert'); };
    $('#btn-print').onclick = () => { ensureReport(); api.print(); };
    $('#btn-save').onclick = save;
    $('#btn-archive').onclick = () => openArchive();
    $('#btn-gdt-send').onclick = sendToPvs;
    $('#gdt-banner-apply').onclick = () => { if (pendingGdt) applyGdtRequest(pendingGdt); };
    $('#gdt-banner-dismiss').onclick = () => {
      if (!confirm('Auftrag wirklich ignorieren? Er müsste in der Praxissoftware neu gestartet werden.')) return;
      pendingGdt = null;
      $('#gdt-banner').hidden = true;
    };
    $('#btn-new').onclick = () => { if (confirmDiscard()) { state = emptyState(); loadIntoUI(); } };
    $('#btn-reset-auto').onclick = () => {
      state.manual = state.manual.filter((id) => !FIELDS.find((f) => f.id === id && f.auto));
      refresh(true);
      toast('Automatische Bewertung angewendet');
    };
    $('#btn-presets').onclick = (e) => {
      e.stopPropagation();
      const menu = $('#preset-menu');
      if (menu.hidden) { renderPresetMenu(); menu.hidden = false; } else menu.hidden = true;
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('#preset-menu')) hidePresetMenu(); });
    $('#prev-show').onclick = showPreviousReport;
    $('#prev-compare').onchange = (e) => { state.compare = e.target.checked; };
    $('#btn-settings').onclick = () => window.EchoSettingsUI.open(settings, {
      api,
      onSave: async (s) => {
        const previousPath = settings.profile.path;
        settings = s;
        if (s.profile.path && s.profile.path !== previousPath && !(await connectProfile(s.profile.path))) {
          settings.profile.path = previousPath;
        }
        await persistSettings(true);
        refreshAll();
        lookupPrevious();
        toast('Einstellungen gespeichert');
      },
    });
    for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => btn.closest('dialog').close();

    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); generateReport(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
    window.addEventListener('focus', () => { syncProfile(); });
  }

  async function init() {
    settings = merge(await api.loadSettings());
    if (settings.profile.path) {
      const r = await api.profileRead(settings.profile.path);
      if (r.ok) {
        applyShared(r.data);
        profileStamp = r.data.stamp || null;
      } else if (!r.missing) {
        setTimeout(() => toast('Gemeinsames Profil nicht erreichbar – es werden die lokal gespeicherten Einstellungen verwendet'), 800);
      }
    }
    state = emptyState();
    buildMeasures();
    buildAssessments();
    bindUI();
    loadIntoUI();
    updateGdtUI();
    api.onGdtRequest(handleGdtRequest);
    api.onGdtStatus((s) => { gdtStatus = s; updateGdtUI(); });
    api.onUpdateAvailable(showUpdate);
    $('#gdt-badge').onclick = () => api.openGuide($('#gdt-badge').dataset.anchor);
    const initial = await api.gdtReady();
    if (initial) { gdtStatus = initial; updateGdtUI(); }
  }

  init();
})();
