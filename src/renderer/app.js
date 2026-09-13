(function () {
  const { MEASURES, SECTIONS, allFields, isVisible } = window.EchoSchema;
  const { h, merge } = window.EchoSettingsUI;
  const api = window.api;
  const $ = (sel) => document.querySelector(sel);
  const FIELDS = allFields();

  let settings;
  let state;
  let autoSet = new Set(); // Felder, deren Wert aktuell von der Automatik stammt
  let dirty = false;
  const fieldViews = {};    // id -> { root, update }
  const derivedOutputs = {}; // id -> <output>
  const measureInputs = {};  // id -> <input>

  const today = () => new Date().toISOString().slice(0, 10);
  const deDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

  function emptyState() {
    const assess = {};
    for (const f of FIELDS) if (f.default) assess[f.id] = f.default;
    return {
      id: null, created: null,
      patient: { name: '', vorname: '', geburtsdatum: '', patId: '', sex: '', datum: today(), untersucher: settings.lastExaminer || '', indikation: '' },
      values: {}, assess, manual: [], showPk: !!settings.showPulmonary, reportText: '',
      gdt: null, // { charset, testType, senderId, sentAt, file } bei Auftrag aus der Praxissoftware
    };
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function setDirty(v) {
    dirty = v;
    const p = state.patient;
    const who = [p.name, p.vorname].filter(Boolean).join(', ');
    $('#record-status').textContent = `${state.id ? who || 'Befund' : 'Neuer Befund'}${dirty ? ' • ungespeichert' : ''}`;
  }

  // ---------- Messwerte ----------

  function parseNum(s) {
    const t = String(s).trim().replace(',', '.');
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }
  const fmt = (v, dec) => v.toFixed(dec).replace('.', ',');

  function buildMeasures() {
    const root = $('#measures');
    const groups = [['basis', 'Körpermaße'], ['standard', 'Messwerte'], ['weitere', 'Weitere Messwerte'], ['berechnet', 'Berechnet']];
    for (const [gid, title] of groups) {
      const rows = MEASURES.filter((m) => m.group === gid).map((m) => {
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
        return h('label', { class: 'measure' }, h('span', {}, m.label), control, h('span', { class: 'unit' }, m.unit));
      });
      const group = gid === 'weitere'
        ? h('details', { class: 'measure-group', open: true }, h('summary', {}, title), rows)
        : h('div', { class: 'measure-group' }, h('h3', {}, title), rows);
      root.append(group);
    }
  }

  function computedValues() {
    return window.EchoCalc.compute(state.values, state.assess, { bsaFormula: settings.bsaFormula });
  }

  // ---------- Beurteilungen ----------

  function buildAssessments() {
    const root = $('#assessments');
    for (const section of SECTIONS) {
      const card = h('div', { class: 'card', 'data-section': section.id });
      const heading = h('h3', {}, section.title);
      if (section.toggle) {
        const cb = h('input', { type: 'checkbox', onchange: (e) => { state.showPk = e.target.checked; refresh(true); } });
        heading.append(h('label', {}, cb, ' einblenden'));
        card._toggle = cb;
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
      const bull = window.EchoBullseye.render(container, () => state.assess.wmaSegments || {}, (segs) => {
        state.assess.wmaSegments = segs;
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
    const auto = window.EchoReport.autoGradeAll(settings.norms, values, state.patient.sex);
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
    // VCI-Kollaps beeinflusst RAP → sPAP → PH, daher zweimal rechnen ist nicht nötig:
    // Berechnung nutzt die Beurteilungen, Automatik nutzt die berechneten Werte.
    const values = computedValues();
    const auto = applyAuto(values);
    for (const m of MEASURES) {
      if (!m.derived) continue;
      const v = values[m.id];
      derivedOutputs[m.id].textContent = typeof v === 'number' && Number.isFinite(v) ? fmt(v, m.dec) : '–';
    }
    for (const f of FIELDS) fieldViews[f.id].update(auto[f.id] !== undefined);
    const pkCard = document.querySelector('[data-section="pk"]');
    pkCard._toggle.checked = state.showPk;
    pkCard.classList.toggle('collapsed', !state.showPk);
    if (changed) setDirty(true);
  }

  // ---------- Befund ----------

  function generateReport() {
    const text = window.EchoReport.generate({
      values: computedValues(),
      assess: state.assess,
      settings: { ...settings, showPulmonary: state.showPk },
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
      const m = MEASURES.find((x) => x.id === id);
      input.value = typeof v === 'number' ? String(v).replace('.', ',') : '';
      input.classList.remove('invalid');
      void m;
    }
    $('#report').value = state.reportText || '';
    autoSet = new Set();
    refresh(false);
    setDirty(false);
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
      id: state.id, created: state.created, patient: p, values: state.values,
      assess: state.assess, manual: state.manual, showPk: state.showPk, reportText: state.reportText, gdt: state.gdt,
    });
    state.id = saved.id;
    state.created = saved.created;
    if (p.untersucher && p.untersucher !== settings.lastExaminer) {
      settings.lastExaminer = p.untersucher;
      api.saveSettings(settings);
    }
    setDirty(false);
    toast('Befund gespeichert');
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
      .filter((m) => !['groesse', 'gewicht'].includes(m.id) && typeof values[m.id] === 'number' && Number.isFinite(values[m.id]))
      .map((m) => ({
        id: (m.abbr || m.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || m.id,
        label: m.label,
        value: values[m.id].toFixed(m.dec),
        unit: m.unit,
      }));
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
      state = { ...emptyState(), ...rec, patient: { ...emptyState().patient, ...rec.patient } };
      loadIntoUI();
      dialog.close();
    }

    search.oninput = render;
    search.value = typeof initialSearch === 'string' ? initialSearch : '';
    render();
    dialog.showModal();
  }

  // ---------- Start ----------

  function bindUI() {
    for (const input of document.querySelectorAll('[data-p]')) {
      input.addEventListener('input', () => {
        state.patient[input.dataset.p] = input.value;
        refresh(true);
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
    $('#btn-settings').onclick = () => window.EchoSettingsUI.open(settings, {
      api,
      onSave: async (s) => {
        settings = s;
        await api.saveSettings(s);
        updateGdtUI();
        refresh(false);
        toast('Einstellungen gespeichert');
      },
    });
    for (const btn of document.querySelectorAll('[data-close]')) btn.onclick = () => btn.closest('dialog').close();

    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); generateReport(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    });
  }

  async function init() {
    settings = merge(await api.loadSettings());
    state = emptyState();
    buildMeasures();
    buildAssessments();
    bindUI();
    loadIntoUI();
    updateGdtUI();
    api.onGdtRequest(handleGdtRequest);
    api.onGdtStatus((s) => { gdtStatus = s; updateGdtUI(); });
    $('#gdt-badge').onclick = () => api.openGuide($('#gdt-badge').dataset.anchor);
    const initial = await api.gdtReady();
    if (initial) { gdtStatus = initial; updateGdtUI(); }
  }

  init();
})();
