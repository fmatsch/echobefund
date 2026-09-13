// Einstellungsdialog: Allgemein, Normwerte, Textbausteine.
(function () {
  const { SECTIONS, MEASURES, GRADES, allFields } = window.EchoSchema;
  const { SETTINGS, FRAGMENT_FIELDS } = window.EchoDefaults;
  const MEASURE_BY_ID = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
  const FIELD_BY_ID = Object.fromEntries(allFields().map((f) => [f.id, f]));

  // Gespeicherte Einstellungen mit Standardwerten ergänzen (neue Felder in neuen Versionen).
  function merge(stored) {
    const d = structuredClone(SETTINGS);
    if (!stored) return d;
    const templates = { ...d.templates };
    for (const [k, v] of Object.entries(stored.templates || {})) templates[k] = { ...(d.templates[k] || {}), ...v };
    return {
      ...d,
      ...stored,
      practice: { ...d.practice, ...(stored.practice || {}) },
      gdt: { ...d.gdt, ...(stored.gdt || {}) },
      norms: { ...d.norms, ...(stored.norms || {}) },
      templates,
    };
  }

  function h(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) e.append(c);
    return e;
  }

  const parseNum = (s) => {
    const n = Number(String(s).trim().replace(',', '.'));
    return String(s).trim() === '' || !Number.isFinite(n) ? null : n;
  };

  function open(current, { api, onSave }) {
    const dialog = document.getElementById('settings-dialog');
    let draft = structuredClone(current);
    let tab = 'allgemein';

    const body = h('div', { class: 'settings-body' });
    const tabs = h('div', { class: 'tabs' });
    const TABS = [['allgemein', 'Allgemein'], ['normwerte', 'Normwerte'], ['texte', 'Textbausteine'], ['gdt', 'Praxissoftware (GDT)']];

    function renderTabs() {
      tabs.textContent = '';
      for (const [id, label] of TABS) {
        tabs.append(h('button', { 'aria-selected': String(id === tab), onclick: () => { tab = id; renderTabs(); renderBody(); } }, label));
      }
    }

    function renderBody() {
      body.textContent = '';
      body.scrollTop = 0;
      if (tab === 'allgemein') renderGeneral();
      if (tab === 'normwerte') renderNorms();
      if (tab === 'texte') renderTemplates();
      if (tab === 'gdt') renderGdt();
    }

    function renderGdt() {
      const g = draft.gdt;
      const input = (key, maxLength, transform = (v) => v) => {
        const el = h('input', { type: 'text', value: g[key] ?? '', oninput: (e) => { g[key] = transform(e.target.value); updatePreview(); } });
        if (maxLength) el.maxLength = maxLength;
        return el;
      };
      const upper = (v) => v.toUpperCase();
      const dirLabel = h('span', { class: 'hint' }, g.dir || 'nicht gewählt');
      const pdfDirLabel = h('span', { class: 'hint' }, g.pdfDir || 'wie Austauschordner');
      const checkResult = h('span', { class: 'hint' });
      const preview = h('p', { class: 'note' });

      function updatePreview() {
        const s = (x) => String(x || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 4).toUpperCase();
        const ext = g.fileMode === 'counter' ? '001' : 'GDT';
        preview.textContent = `Auftrag von ${g.pvsName || 'Praxissoftware'}: ${s(g.ownShort)}${s(g.pvsShort)}.${ext}  ·  Befund an ${g.pvsName || 'Praxissoftware'}: ${s(g.pvsShort)}${s(g.ownShort)}.${ext}`;
      }
      updatePreview();

      body.append(
        h('section', {},
          h('p', { class: 'note' }, 'Anbindung über GDT 2.1: Die Praxissoftware legt einen Auftrag (Satzart 6301/6302) im Austauschordner ab und startet Echobefund. Die Patientendaten werden übernommen; mit „An … senden“ geht der Befund als Satzart 6310 zurück in die Kartei. Satzart 6311 öffnet das Archiv für den Patienten.'),
          h('div', { class: 'form-grid' },
            'GDT-Anbindung aktiv', checkbox(g.enabled, (v) => { g.enabled = v; }),
            'Name der Praxissoftware', input('pvsName', 30),
            'Austauschordner', h('div', {}, dirLabel, ' ',
              h('button', { onclick: async () => { const d = await api.chooseArchiveDir(); if (d) { g.dir = d; dirLabel.textContent = d; } } }, 'Wählen…'), ' ',
              h('button', { onclick: async () => {
                if (!g.dir) { checkResult.textContent = 'Bitte zuerst einen Ordner wählen.'; return; }
                const r = await api.gdtCheckDir(g.dir);
                checkResult.textContent = r.ok ? '✓ Ordner ist beschreibbar' : `✗ ${r.error}`;
              } }, 'Testen'), ' ', checkResult),
          )),
        h('section', {},
          h('h4', {}, 'Kennungen (müssen in der Praxissoftware identisch eingetragen sein)'),
          h('div', { class: 'form-grid' },
            'GDT-ID Echobefund (8316)', input('ownId', 8, upper),
            'GDT-ID Praxissoftware (8315)', input('pvsId', 8, upper),
            'Dateikürzel Echobefund', input('ownShort', 4, upper),
            'Dateikürzel Praxissoftware', input('pvsShort', 4, upper),
            'Dateiendung', select(g.fileMode, [['fixed', 'fest (.GDT)'], ['counter', 'hochzählend (.001, .002 …)']], (v) => { g.fileMode = v; updatePreview(); }),
          ),
          preview),
        h('section', {},
          h('h4', {}, 'Übertragung'),
          h('div', { class: 'form-grid' },
            'Zeichensatz (9206)', select(g.charset, [['auto', 'automatisch (wie im Auftrag)'], ['2', 'IBM CP437 (GDT-Standard)'], ['3', 'ANSI CP1252 (Windows)'], ['1', '7 Bit (Umlaute als ae, oe, ue)']], (v) => { g.charset = v; }),
            'Untersuchungsart (8402)', input('testType', 6, upper),
            'Befundtext als', select(g.textField, [['6228', 'Ergebnistext formatiert (6228)'], ['6220', 'Befund (6220)']], (v) => { g.textField = v; }),
            'Max. Zeilenlänge', h('input', { type: 'number', min: 20, max: 200, value: g.lineWidth, oninput: (e) => { g.lineWidth = Number(e.target.value) || 60; } }),
            'Messwerte einzeln übertragen', checkbox(g.sendMeasures, (v) => { g.sendMeasures = v; }),
            'PDF-Befund ablegen und verknüpfen', checkbox(g.attachPdf, (v) => { g.attachPdf = v; }),
            'PDF-Ordner', h('div', {}, pdfDirLabel, ' ',
              h('button', { onclick: async () => { const d = await api.chooseArchiveDir(); if (d) { g.pdfDir = d; pdfDirLabel.textContent = d; } } }, 'Wählen…'), ' ',
              h('button', { onclick: () => { g.pdfDir = ''; pdfDirLabel.textContent = 'wie Austauschordner'; } }, 'Zurücksetzen')),
            'Nach dem Senden archivieren', checkbox(g.autoSave, (v) => { g.autoSave = v; }),
            'Nach dem Senden minimieren', checkbox(g.minimizeAfterSend, (v) => { g.minimizeAfterSend = v; }),
            'Warnung „nicht abgeholt“ nach (Sekunden)', h('input', { type: 'number', min: 30, max: 3600, value: g.pickupWarnSeconds, oninput: (e) => { g.pickupWarnSeconds = Math.max(30, Number(e.target.value) || 120); } }),
          ),
          h('p', { class: 'note' }, 'Der PDF-Pfad wird so übertragen, wie er auf diesem Rechner lautet. Bei mehreren Arbeitsplätzen einen Netzwerkpfad (z. B. \\\\SERVER\\GDT) verwenden.')),
      );
    }

    function select(value, options, onchange) {
      return h('select', { onchange: (e) => onchange(e.target.value) },
        options.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
    }
    function checkbox(checked, onchange) {
      return h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) });
    }
    function text(value, onchange, multiline) {
      return multiline
        ? h('textarea', { rows: 3, oninput: (e) => onchange(e.target.value) }, value || '')
        : h('input', { type: 'text', value: value || '', oninput: (e) => onchange(e.target.value) });
    }

    function renderGeneral() {
      const archivePath = h('span', { class: 'hint' }, draft.archiveDir || '');
      if (!draft.archiveDir) api.archiveDir().then((p) => { archivePath.textContent = `${p} (Standard)`; });

      body.append(
        h('section', {},
          h('h4', {}, 'Befund'),
          h('div', { class: 'form-grid' },
            'Messwerte ausgeben', select(draft.measuresMode, [['text', 'in Klammern im Text'], ['liste', 'als Liste am Beginn'], ['keine', 'nicht ausgeben']], (v) => { draft.measuresMode = v; }),
            'Abschnittsüberschriften', checkbox(draft.sectionHeadings, (v) => { draft.sectionHeadings = v; }),
            'Automatische Bewertung', checkbox(draft.autoGrade, (v) => { draft.autoGrade = v; }),
            'Pulmonalklappe standardmäßig', checkbox(draft.showPulmonary, (v) => { draft.showPulmonary = v; }),
            'KOF-Formel', select(draft.bsaFormula, [['dubois', 'DuBois'], ['mosteller', 'Mosteller']], (v) => { draft.bsaFormula = v; }),
          )),
        h('section', {},
          h('h4', {}, 'Praxis (PDF/Druck)'),
          h('div', { class: 'form-grid' },
            'Name', text(draft.practice.name, (v) => { draft.practice.name = v; }),
            'Adresse', text(draft.practice.address, (v) => { draft.practice.address = v; }, true),
            'Fußzeile', text(draft.practice.footer, (v) => { draft.practice.footer = v; }, true),
          )),
        h('section', {},
          h('h4', {}, 'Archiv'),
          h('p', { class: 'note' }, 'Befunde werden als JSON-Dateien gespeichert. Bitte Festplattenverschlüsselung (FileVault/BitLocker) aktivieren. Beim Ändern des Ordners werden vorhandene Befunde nicht verschoben.'),
          h('div', { class: 'form-grid' },
            'Speicherort', h('div', {}, archivePath, ' ',
              h('button', { onclick: async () => { const d = await api.chooseArchiveDir(); if (d) { draft.archiveDir = d; archivePath.textContent = d; } } }, 'Ändern…'),
              ' ',
              h('button', { onclick: () => { draft.archiveDir = ''; renderBody(); } }, 'Standard'),
            ),
          )),
        h('section', {},
          h('h4', {}, 'Einstellungen übertragen'),
          h('div', { class: 'row' },
            h('button', { onclick: () => api.exportSettings(draft) }, 'Exportieren…'),
            h('button', { onclick: async () => { const s = await api.importSettings(); if (s) { draft = merge(s); renderBody(); } } }, 'Importieren…'),
          )),
      );
    }

    function resetButton(label, key) {
      return h('button', {
        onclick: () => {
          if (!confirm(`${label} auf Standardwerte zurücksetzen?`)) return;
          draft[key] = structuredClone(SETTINGS[key]);
          renderBody();
        },
      }, `${label} zurücksetzen`);
    }

    function levelInputs(levels) {
      return h('div', { class: 'norm-levels' }, levels.map((lvl) =>
        h('label', {}, lvl.value,
          h('input', { value: String(lvl.at).replace('.', ','), oninput: (e) => {
            const n = parseNum(e.target.value);
            e.target.classList.toggle('invalid', n === null);
            if (n !== null) lvl.at = n;
          } }))));
    }

    function renderNorms() {
      body.append(
        h('p', { class: 'note' }, 'Grenzwert = ab diesem Messwert gilt der Grad ("≥" bei Vergrößerung, "≤" bei Funktionseinschränkung). Standardwerte nach ASE/EACVI; bitte vor dem Einsatz prüfen.'),
        resetButton('Normwerte', 'norms'),
      );
      for (const [key, norm] of Object.entries(draft.norms)) {
        const field = FIELD_BY_ID[key];
        const sec = h('section', {}, h('h4', {}, field ? field.label + ` (${SECTIONS.find((s) => s.id === field.section).title})` : key));
        if (norm.note) sec.append(h('p', { class: 'note' }, norm.note));
        for (const rule of norm.rules) {
          const m = MEASURE_BY_ID[rule.measure];
          const name = `${m ? m.label : rule.measure}${m && m.unit ? ` [${m.unit}]` : ''} ${rule.dir === 'low' ? '≤' : '≥'}`;
          if (rule.sex) {
            sec.append(
              h('div', { class: 'norm-rule' }, h('span', {}, `${name} (Männer)`), levelInputs(rule.levels.m)),
              h('div', { class: 'norm-rule' }, h('span', {}, `${name} (Frauen)`), levelInputs(rule.levels.w)),
            );
          } else {
            sec.append(h('div', { class: 'norm-rule' }, h('span', {}, name), levelInputs(rule.levels)));
          }
        }
        body.append(sec);
      }
    }

    function renderTemplates() {
      body.append(
        h('p', { class: 'note' }, 'Platzhalter: {m} Messwerte · {Grad}/{grad} „leichtgradig“ · {Grade} „leichtgradige“ · {Grader} „leichtgradiger“ · {segmente} Wandbewegungsstörungen · {feld:ID} Einschub eines anderen Feldes. Leerer Text = Satz entfällt.'),
        resetButton('Textbausteine', 'templates'),
      );
      for (const section of SECTIONS) {
        const sec = h('section', {}, h('h4', {}, section.title));
        for (const field of section.fields) {
          if (!field.options) continue;
          const tpls = (draft.templates[field.id] ||= {});
          const keys = field.options.filter((o) => !(GRADES.includes(o) && tpls[o] === undefined));
          if (field.options.some((o) => GRADES.includes(o))) keys.push('_grad');
          if (field.type === 'multi' && FRAGMENT_FIELDS.includes(field.id)) keys.unshift('_wrap');
          sec.append(h('div', { class: 'note' }, `${field.label}${FRAGMENT_FIELDS.includes(field.id) ? ` – Einschub {feld:${field.id}}` : ''}`));
          for (const k of keys) {
            const label = k === '_grad' ? 'alle Schweregrade' : k === '_wrap' ? 'Hülle ({liste})' : k;
            sec.append(h('div', { class: 'tpl-row' }, h('span', {}, label),
              h('input', { value: tpls[k] ?? '', oninput: (e) => { tpls[k] = e.target.value; } })));
          }
        }
        body.append(sec);
      }
    }

    dialog.textContent = '';
    dialog.append(
      h('header', {}, h('h2', {}, 'Einstellungen'), tabs),
      body,
      h('footer', {}, h('div', { class: 'spacer' }),
        h('button', { onclick: () => dialog.close() }, 'Abbrechen'),
        h('button', { class: 'primary', onclick: async () => { await onSave(draft); dialog.close(); } }, 'Speichern')),
    );
    renderTabs();
    renderBody();
    dialog.showModal();
  }

  window.EchoSettingsUI = { open, merge, h };
})();
