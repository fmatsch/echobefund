// Dialoge für die Archiv-Verschlüsselung: Entsperren, Einschalten, Passwort, Wiederherstellungscode, Ausschalten.
(function () {
  const { h } = window.EchoSettingsUI;
  const MIN_PASSWORD = 8;

  // Fehlermeldung aus dem Hauptprozess ohne technischen Vorspann
  function cleanError(err) {
    return String((err && err.message) || err)
      .replace(/^Error invoking remote method '[^']+': /, '')
      .replace(/^(Error: )+/, '')
      .replace(/^ARCHIVE_LOCKED: /, '');
  }

  function checkPasswords(a, b) {
    if (a.length < MIN_PASSWORD) return `Das Passwort muss mindestens ${MIN_PASSWORD} Zeichen lang sein.`;
    if (a !== b) return 'Die beiden Passwörter stimmen nicht überein.';
    return '';
  }

  const passwordInput = (autocomplete) => h('input', { type: 'password', autocomplete });

  // Öffnet den Sicherheitsdialog. build(close) liefert { body, actions }. Ergebnis = Wert von close(…).
  function modal(title, build) {
    return new Promise((resolve) => {
      const dlg = document.getElementById('security-dialog');
      let result = null;
      const close = (value) => { result = value; dlg.close(); };
      const { body, actions } = build(close);
      dlg.textContent = '';
      dlg.append(
        h('header', {}, h('h2', {}, title)),
        h('div', { class: 'security-body' }, body),
        h('footer', {}, h('div', { class: 'spacer' }), actions),
      );
      dlg.onclose = () => resolve(result);
      dlg.oncancel = (e) => { e.preventDefault(); close(null); };
      dlg.showModal();
      const first = [...dlg.querySelectorAll('input')].find((i) => !i.closest('[hidden]') && i.type !== 'checkbox');
      if (first) first.focus();
    });
  }

  // Führt eine Aktion mit Wartezustand aus und zeigt Fehler im Dialog an.
  async function run(button, errorEl, fn) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Bitte warten …';
    errorEl.textContent = '';
    try {
      await fn();
      return true;
    } catch (err) {
      errorEl.textContent = cleanError(err);
      return false;
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }

  function statusText(st) {
    if (!st.encrypted) return 'nicht verschlüsselt';
    let text = 'verschlüsselt';
    text += st.hasPassword ? `, mit Passwort${st.remembered ? ' (auf diesem Gerät gemerkt)' : ''}` : ', ohne Passwort';
    if (!st.unlocked) text += ' – derzeit gesperrt';
    return text;
  }

  // ---------- Entsperren ----------

  async function unlockFlow(api) {
    const status = await api.archiveSecurityStatus();
    if (!status.encrypted || status.unlocked) return true;
    const ok = await modal('Befundarchiv entsperren', (close) => {
      let useRecovery = !status.hasPassword;
      const pw = passwordInput('current-password');
      const code = h('input', { type: 'text', class: 'code-input', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' });
      const remember = h('input', { type: 'checkbox' });
      const error = h('p', { class: 'security-error' });
      const pwRow = h('label', { class: 'field-block' }, 'Passwort', pw);
      const codeRow = h('label', { class: 'field-block' }, 'Wiederherstellungscode (vom Ausdruck)', code);
      const rememberRow = h('label', { class: 'check' }, remember, ' Auf diesem Gerät merken – beim nächsten Start kein Passwort nötig');
      const toggle = h('button', { class: 'link', type: 'button', onclick: () => { useRecovery = !useRecovery; update(); } });
      const update = () => {
        pwRow.hidden = useRecovery;
        codeRow.hidden = !useRecovery;
        toggle.hidden = !status.hasPassword;
        toggle.textContent = useRecovery ? 'Doch mit Passwort entsperren' : 'Passwort vergessen? Wiederherstellungscode eingeben';
        rememberRow.hidden = !status.hasPassword || !status.deviceAvailable;
        error.textContent = '';
      };
      const submit = h('button', {
        class: 'primary',
        onclick: async () => {
          const opts = useRecovery ? { recoveryCode: code.value, remember: remember.checked } : { password: pw.value, remember: remember.checked };
          if (await run(submit, error, () => api.archiveUnlock(opts))) close(true);
        },
      }, 'Entsperren');
      for (const input of [pw, code]) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit.click(); });
      update();
      return {
        body: [
          h('p', {}, status.hasPassword
            ? 'Das Befundarchiv ist verschlüsselt und mit einem Passwort geschützt.'
            : 'Das Befundarchiv ist verschlüsselt. Auf diesem Gerät ist noch kein Schlüssel hinterlegt – bitte einmalig den Wiederherstellungscode eingeben.'),
          pwRow, codeRow, toggle, rememberRow, error,
        ],
        actions: [h('button', { onclick: () => close(false) }, 'Später'), submit],
      };
    });
    return !!ok;
  }

  // ---------- Wiederherstellungscode ----------

  function printRecoverySheet(api, code) {
    const view = document.getElementById('print-view');
    view.textContent = '';
    view.append(
      h('div', { class: 'pv-title' }, 'Echobefund – Wiederherstellungscode'),
      h('p', {}, `Befundarchiv, erstellt am ${new Date().toLocaleString('de-DE')}`),
      h('div', { class: 'pv-recovery' }, code),
      h('p', {}, 'Mit diesem Code lässt sich das verschlüsselte Befundarchiv öffnen, falls das Passwort vergessen wurde oder der Computer neu eingerichtet wird: Echobefund starten → „Passwort vergessen? Wiederherstellungscode eingeben“.'),
      h('p', {}, 'Sicher aufbewahren (z. B. im Praxis-Tresor). Wer diesen Code und eine Kopie des Archivs besitzt, kann die Befunde lesen.'),
    );
    api.print();
  }

  function showRecoveryCode(api, code, intro) {
    return modal('Wiederherstellungscode', (close) => {
      const confirmBox = h('input', { type: 'checkbox' });
      const done = h('button', { class: 'primary', disabled: true, onclick: () => close(true) }, 'Fertig');
      confirmBox.addEventListener('change', () => { done.disabled = !confirmBox.checked; });
      return {
        body: [
          intro ? h('p', {}, h('strong', {}, intro)) : null,
          h('p', {}, 'Mit diesem Code lässt sich das Archiv öffnen, wenn das Passwort vergessen wurde oder der Computer neu eingerichtet werden muss. Er wird ', h('strong', {}, 'nur jetzt'), ' angezeigt.'),
          h('div', { class: 'recovery-code' }, code),
          h('p', { class: 'security-warn' }, 'Bitte ausdrucken und sicher aufbewahren – nicht als Datei auf diesem Computer speichern. Ohne Code (und ohne Passwort bzw. diesen Computer) sind die Befunde unwiederbringlich verloren.'),
          h('label', { class: 'check' }, confirmBox, ' Ich habe den Code ausgedruckt bzw. sicher notiert.'),
        ],
        actions: [h('button', { onclick: () => printRecoverySheet(api, code) }, 'Drucken'), done],
      };
    });
  }

  // ---------- Einschalten ----------

  async function enableFlow(api) {
    const status = await api.archiveSecurityStatus();
    if (status.encrypted) return true;
    const result = await modal('Befundarchiv verschlüsseln', (close) => {
      const withPw = h('input', { type: 'checkbox', checked: !status.deviceAvailable, disabled: !status.deviceAvailable });
      const pw1 = passwordInput('new-password');
      const pw2 = passwordInput('new-password');
      const remember = h('input', { type: 'checkbox' });
      const error = h('p', { class: 'security-error' });
      const pwBox = h('div', { class: 'security-pw' },
        h('label', { class: 'field-block' }, `Passwort (mindestens ${MIN_PASSWORD} Zeichen)`, pw1),
        h('label', { class: 'field-block' }, 'Passwort wiederholen', pw2),
        status.deviceAvailable ? h('label', { class: 'check' }, remember, ' Auf diesem Gerät merken (Passwort nur an anderen Geräten nötig)') : null);
      const update = () => { pwBox.hidden = !withPw.checked; };
      withPw.addEventListener('change', update);
      const submit = h('button', {
        class: 'primary',
        onclick: async () => {
          if (withPw.checked) {
            const msg = checkPasswords(pw1.value, pw2.value);
            if (msg) { error.textContent = msg; return; }
          }
          let res;
          const ok = await run(submit, error, async () => {
            res = await api.archiveEnable({ password: withPw.checked ? pw1.value : null, remember: remember.checked });
          });
          if (ok) close(res);
        },
      }, 'Verschlüsselung einschalten');
      update();
      return {
        body: [
          h('p', {}, 'Alle Befunde im Archiv werden mit AES-256 verschlüsselt. Ohne den Schlüssel sind die Dateien nicht lesbar – auch nicht in einer Datensicherung oder auf einem gestohlenen Rechner.'),
          h('ul', {},
            h('li', {}, h('strong', {}, 'Ohne Passwort: '), 'Der Schlüssel liegt geschützt im Schlüsselbund (Mac) bzw. in der Windows-Anmeldung dieses Benutzers. Echobefund öffnet das Archiv automatisch.'),
            h('li', {}, h('strong', {}, 'Mit Passwort: '), 'Beim Start wird das Passwort abgefragt. Sinnvoll, wenn mehrere Personen denselben Computer-Benutzer verwenden oder das Archiv auf dem Server liegt.')),
          status.deviceAvailable ? null : h('p', { class: 'security-warn' }, 'Auf diesem Gerät gibt es keinen geschützten Schlüsselspeicher – ein Passwort ist erforderlich.'),
          h('label', { class: 'check' }, withPw, ' Zusätzlich mit Passwort schützen'),
          pwBox,
          h('p', { class: 'hint' }, 'Anschließend erhalten Sie einen Wiederherstellungscode zum Ausdrucken. Tipp: Vorher eine Datensicherung des Archiv-Ordners anlegen.'),
          error,
        ],
        actions: [h('button', { onclick: () => close(null) }, 'Abbrechen'), submit],
      };
    });
    if (!result) return false;
    const n = result.migrated;
    await showRecoveryCode(api, result.recoveryCode, `Verschlüsselung eingeschaltet – ${n} vorhandene${n === 1 ? 'r Befund wurde' : ' Befunde wurden'} verschlüsselt.`);
    return true;
  }

  // ---------- Passwort ----------

  async function passwordFlow(api) {
    if (!(await unlockFlow(api))) return false;
    const status = await api.archiveSecurityStatus();
    const ok = await modal(status.hasPassword ? 'Passwort ändern' : 'Passwort festlegen', (close) => {
      const pw1 = passwordInput('new-password');
      const pw2 = passwordInput('new-password');
      const remember = h('input', { type: 'checkbox', checked: status.hasPassword && status.remembered });
      const error = h('p', { class: 'security-error' });
      const submit = h('button', {
        class: 'primary',
        onclick: async () => {
          const msg = checkPasswords(pw1.value, pw2.value);
          if (msg) { error.textContent = msg; return; }
          if (await run(submit, error, () => api.archiveSetPassword({ password: pw1.value, remember: remember.checked }))) close(true);
        },
      }, 'Passwort speichern');
      const removeBtn = status.hasPassword && status.deviceAvailable ? h('button', {
        onclick: async () => {
          if (!confirm('Passwort entfernen? Das Archiv bleibt verschlüsselt und öffnet sich auf diesem Gerät automatisch. Andere Geräte benötigen dann den Wiederherstellungscode.')) return;
          if (await run(removeBtn, error, () => api.archiveSetPassword({ password: null }))) close(true);
        },
      }, 'Passwort entfernen') : null;
      return {
        body: [
          h('p', {}, 'Das Passwort schützt den Archivschlüssel. Die Befunde selbst müssen dafür nicht neu verschlüsselt werden.'),
          h('label', { class: 'field-block' }, `Neues Passwort (mindestens ${MIN_PASSWORD} Zeichen)`, pw1),
          h('label', { class: 'field-block' }, 'Neues Passwort wiederholen', pw2),
          status.deviceAvailable ? h('label', { class: 'check' }, remember, ' Auf diesem Gerät merken') : null,
          error,
        ],
        actions: [removeBtn, h('button', { onclick: () => close(false) }, 'Abbrechen'), submit],
      };
    });
    return !!ok;
  }

  async function renewRecoveryFlow(api) {
    if (!(await unlockFlow(api))) return false;
    if (!confirm('Neuen Wiederherstellungscode erzeugen? Der bisherige Code wird damit ungültig.')) return false;
    try {
      const { recoveryCode } = await api.archiveRenewRecovery();
      await showRecoveryCode(api, recoveryCode, 'Neuer Code erzeugt – der alte Ausdruck ist ab sofort ungültig.');
      return true;
    } catch (err) {
      alert(cleanError(err));
      return false;
    }
  }

  async function disableFlow(api) {
    if (!(await unlockFlow(api))) return false;
    if (!confirm('Verschlüsselung ausschalten?\n\nAlle Befunde werden wieder unverschlüsselt gespeichert, Passwort und Wiederherstellungscode werden ungültig.')) return false;
    try {
      const { decrypted } = await api.archiveDisable();
      alert(`Verschlüsselung ausgeschaltet – ${decrypted} Befund${decrypted === 1 ? '' : 'e'} entschlüsselt.`);
      return true;
    } catch (err) {
      alert(`Die Verschlüsselung konnte nicht ausgeschaltet werden:\n${cleanError(err)}`);
      return false;
    }
  }

  window.EchoSecurity = { unlockFlow, enableFlow, passwordFlow, renewRecoveryFlow, disableFlow, statusText, cleanError };
})();
