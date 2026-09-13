// Einstellungsdialog: Allgemein, Normwerte, Textbausteine, Vorlagen, Praxissoftware, Mehrplatz & Updates.
(function () {
  const { SECTIONS, MEASURES, GRADES, MODULES, allFields } = window.EchoSchema;
  const { SETTINGS, FRAGMENT_FIELDS } = window.EchoDefaults;
  const MEASURE_BY_ID = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
  const FIELD_BY_ID = Object.fromEntries(allFields().map((f) => [f.id, f]));

  // Gespeicherte Normwerte behalten, aber Regeln neuer Versionen (z. B. RV-FAC) ergänzen.
  function mergeNorms(defaults, stored) {
    const out = { ...defaults };
    for (const [key, norm] of Object.entries(stored || {})) {
      const def = defaults[key];
      if (!norm || !Array.isArray(norm.rules)) continue;
      if (!def) { out[key] = norm; continue; }
      const have = new Set(norm.rules.map((r) => r.measure));
      const added = def.rules.filter((r) => !have.has(r.measure));
      out[key] = { ...def, ...norm, mode: added.length ? def.mode : norm.mode, note: def.note, rules: [...norm.rules, ...structuredClone(added)] };
    }
    return out;
  }

  // Gespeicherte Einstellungen mit Standardwerten ergänzen (neue Felder in neuen Versionen).
  function merge(stored) {
    const d = structuredClone(SETTINGS);
    if (!stored) return d;
    const templates = { ...d.templates };
    for (const [k, v] of Object.entries(stored.templates || {})) templates[k] = { ...(d.templates[k] || {}), ...v };
    const modules = { ...d.modules, ...(stored.modules || {}) };
    if (!stored.modules && stored.showPulmonary !== undefined) modules.pk = !!stored.showPulmonary;
    const out = {
      ...d,
      ...stored,
      modules,
      summary: { ...d.summary, ...(stored.summary || {}) },
      comparison: { ...d.comparison, ...(stored.comparison || {}) },
      practice: { ...d.practice, ...(stored.practice || {}) },
      updates: { ...d.updates, ...(stored.updates || {}) },
      profile: { ...d.profile, ...(stored.profile || {}) },
      gdt: { ...d.gdt, ...(stored.gdt || {}) },
      norms: mergeNorms(d.norms, stored.norms),
      templates,
      presets: Array.isArray(stored.presets) ? stored.presets : d.presets,
      srMappings: { ...(stored.srMappings || {}) },
    };
    delete out.showPulmonary;
    return out;
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
    const TABS = [
      ['allgemein', 'Allgemein'], ['normwerte', 'Normwerte'], ['texte', 'Textbausteine'], ['vorlagen', 'Vorlagen'],
      ['gdt', 'Praxissoftware (GDT)'], ['mehrplatz', 'Mehrplatz & Updates'],
    ];

    function renderTabs() {
      tabs.textContent = '';
      for (const [id, label] of TABS) {
        tabs.append(h('button', { 'aria-selected': String(id === tab), onclick: () => { tab = id; renderTabs(); renderBody(); } }, label));
      }
    }

    function renderBody() {
      body.textContent = '';
      body.scrollTop = 0;
      ({ allgemein: renderGeneral, normwerte: renderNorms, texte: renderTemplates, vorlagen: renderPresets, gdt: renderGdt, mehrplatz: renderMultiUser })[tab]();
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
            'KOF-Formel', select(draft.bsaFormula, [['dubois', 'DuBois'], ['mosteller', 'Mosteller']], (v) => { draft.bsaFormula = v; }),
          )),
        h('section', {},
          h('h4', {}, 'Zusatzmodule bei neuen Befunden einblenden'),
          h('div', { class: 'form-grid' },
            MODULES.flatMap((m) => [m.label, checkbox(!!draft.modules[m.id], (v) => { draft.modules[m.id] = v; })]))),
        h('section', {},
          h('h4', {}, 'Beurteilung am Ende des Befunds'),
          h('p', { class: 'note' }, 'Fasst alle auffälligen Befunde zusammen. Sind alle Beurteilungen unauffällig, erscheint der Text für den Normalbefund.'),
          h('div', { class: 'form-grid' },
            'Beurteilung erzeugen', checkbox(draft.summary.enabled, (v) => { draft.summary.enabled = v; }),
            'Überschrift', text(draft.summary.title, (v) => { draft.summary.title = v; }),
            'Text bei Normalbefund', text(draft.summary.normalText, (v) => { draft.summary.normalText = v; }),
          )),
        h('section', {},
          h('h4', {}, 'Vergleich mit dem Vorbefund'),
          h('p', { class: 'note' }, 'Sucht im Archiv den letzten Befund desselben Patienten (Patientennummer, sonst Name und Geburtsdatum) und zeigt die früheren Werte an.'),
          h('div', { class: 'form-grid' },
            'Vorbefund anzeigen', checkbox(draft.comparison.enabled, (v) => { draft.comparison.enabled = v; }),
            'Vergleich standardmäßig in den Befund', checkbox(draft.comparison.inReport, (v) => { draft.comparison.inReport = v; }),
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
        h('section', {},
          h('h4', {}, 'Diastolische Funktion'),
          h('p', { class: 'note' }, "Automatisch nach dem Algorithmus der ASE/EACVI 2016 (Nagueh et al.): E/e' (Mittel) > 14, e' septal < 7 bzw. lateral < 10 cm/s, TR Vmax > 2,8 m/s, LAVI > 34 ml/m²; bei LVEF < 50 % Graduierung über E/A und E. Bei Vorhofflimmern und zu wenigen Messwerten erfolgt kein Vorschlag. Die Schwellen sind fest hinterlegt.")),
      );
      for (const [key, norm] of Object.entries(draft.norms)) {
        const field = FIELD_BY_ID[key];
        const section = field && SECTIONS.find((s) => s.id === field.section);
        const sec = h('section', {}, h('h4', {}, field ? `${field.label} (${section.title})` : key));
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
        h('p', { class: 'note' }, 'Platzhalter: {m} Messwerte · {Grad}/{grad} „leichtgradig“ · {Grade} „leichtgradige“ · {Grader} „leichtgradiger“ · {segmente} Wandbewegungsstörungen · {feld:ID} Einschub eines anderen Feldes · {liste} gewählte Einträge. Leerer Text = Satz entfällt.'),
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
          if (tpls._satz !== undefined) keys.unshift('_satz');
          sec.append(h('div', { class: 'note' }, `${field.label}${FRAGMENT_FIELDS.includes(field.id) ? ` – Einschub {feld:${field.id}}` : ''}`));
          for (const k of keys) {
            const label = { _grad: 'alle Schweregrade', _wrap: 'Hülle ({liste})', _satz: 'Satz ({liste})' }[k] || k;
            sec.append(h('div', { class: 'tpl-row' }, h('span', {}, label),
              h('input', { value: tpls[k] ?? '', oninput: (e) => { tpls[k] = e.target.value; } })));
          }
        }
        body.append(sec);
      }
    }

    function renderPresets() {
      body.append(
        h('p', { class: 'note' }, 'Vorlagen setzen mit einem Klick mehrere Beurteilungen (Hauptfenster → „Vorlagen“). Neue Vorlagen: Beurteilungen auswählen, dann „Vorlagen“ → „Aktuelle Auswahl als Vorlage speichern“. Messwerte und automatische Bewertung haben weiterhin Vorrang.'),
        resetButton('Vorlagen', 'presets'),
      );
      const list = h('section', {}, h('h4', {}, 'Gespeicherte Vorlagen'));
      if (!draft.presets.length) list.append(h('p', { class: 'hint' }, 'Keine Vorlagen vorhanden.'));
      draft.presets.forEach((p, i) => {
        list.append(h('div', { class: 'preset-row' },
          h('input', { type: 'text', value: p.name, oninput: (e) => { p.name = e.target.value; } }),
          h('span', { class: 'hint' }, `${Object.keys(p.assess || {}).length} Beurteilungen`),
          h('button', { onclick: () => { if (confirm(`Vorlage „${p.name}“ löschen?`)) { draft.presets.splice(i, 1); renderBody(); } } }, 'Löschen')));
      });
      body.append(list);
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

    function renderMultiUser() {
      const profileLabel = h('span', { class: 'hint' }, draft.profile.path || 'nicht verbunden');
      const updateResult = h('span', { class: 'hint' });
      const mappingCount = Object.keys(draft.srMappings || {}).length;

      body.append(
        h('section', {},
          h('h4', {}, 'Gemeinsames Profil für mehrere Arbeitsplätze'),
          h('p', { class: 'note' }, 'Liegt das Profil in einem gemeinsamen Ordner (z. B. auf dem Praxis-Server), verwenden alle verbundenen Arbeitsplätze dieselben Befund-Optionen, Zusatzmodule, Praxisdaten, Beurteilung, Normwerte, Textbausteine, Vorlagen und DICOM-Zuordnungen. GDT-Anbindung, Archiv-Ordner und Update-Einstellung bleiben pro Arbeitsplatz. Änderungen anderer Plätze werden übernommen, sobald Echobefund wieder in den Vordergrund kommt.'),
          h('div', { class: 'form-grid' },
            'Profil-Datei', h('div', {}, profileLabel, ' ',
              h('button', { onclick: async () => { const p = await api.chooseProfile(); if (p) { draft.profile.path = p; profileLabel.textContent = p; } } }, 'Ordner wählen…'), ' ',
              h('button', { onclick: () => { draft.profile.path = ''; profileLabel.textContent = 'nicht verbunden'; } }, 'Trennen')),
          ),
          h('p', { class: 'note' }, 'Beim Speichern wird geprüft, ob im gewählten Ordner schon ein Profil liegt – dann können Sie wählen, ob es übernommen oder mit Ihren Einstellungen überschrieben wird.')),
        h('section', {},
          h('h4', {}, 'Updates'),
          h('p', { class: 'note' }, 'Echobefund fragt höchstens einmal täglich bei GitHub nach, ob es eine neue Version gibt. Dabei werden keine Patientendaten übertragen – nur die übliche Anfrage mit IP-Adresse. Die neue Version wird nicht automatisch installiert.'),
          h('div', { class: 'form-grid' },
            'Auf neue Versionen prüfen', checkbox(draft.updates.check, (v) => { draft.updates.check = v; }),
            'Jetzt prüfen', h('div', {},
              h('button', { onclick: async () => {
                updateResult.textContent = 'Prüfe …';
                const r = await api.checkUpdate();
                updateResult.textContent = '';
                if (r.status === 'available') {
                  updateResult.append(`Neue Version ${r.version} verfügbar (installiert: ${r.current}). `,
                    h('button', { onclick: () => api.openRelease(r.url) }, 'Download-Seite öffnen'));
                } else if (r.status === 'current') {
                  updateResult.textContent = `✓ Sie verwenden die neueste Version (${r.current}).`;
                } else {
                  updateResult.textContent = `Prüfung nicht möglich: ${r.error || r.status}`;
                }
              } }, 'Jetzt prüfen'), ' ', updateResult),
          )),
        h('section', {},
          h('h4', {}, 'DICOM-SR-Import'),
          h('p', { class: 'note' }, 'Beim Import gemerkte Zuordnungen von Gerätemesswerten zu Echobefund-Feldern.'),
          h('div', { class: 'form-grid' },
            'Gemerkte Zuordnungen', h('div', {}, `${mappingCount} `,
              h('button', { disabled: !mappingCount, onclick: () => { if (confirm('Alle gemerkten DICOM-Zuordnungen löschen?')) { draft.srMappings = {}; renderBody(); } } }, 'Zurücksetzen')),
          )),
      );
    }

    dialog.textContent = '';
    dialog.append(
      h('header', {}, h('h2', {}, 'Einstellungen'), tabs),
      body,
      h('footer', {}, h('div', { class: 'spacer' }),
        h('button', { onclick: () => dialog.close() }, 'Abbrechen'),
        h('button', { class: 'primary', onclick: async () => { dialog.close(); await onSave(draft); } }, 'Speichern')),
    );
    renderTabs();
    renderBody();
    dialog.showModal();
  }

  window.EchoSettingsUI = { open, merge, h };
})();
