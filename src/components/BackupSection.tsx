import { useState, type FormEvent } from 'react';
import { createBackupFile, openBackupFile, restoreBackup, summarize, type BackupPayload, type BackupSummary } from '../db/backup';
import { saveSettings } from '../db/settings';
import { formatDateTime } from '../domain/dates';
import { passwordProblem } from '../security/crypto';
import { canShareFile, downloadBlob, formatBytes, shareFile } from '../lib/download';
import { AutoBackupSection } from './AutoBackupSection';
import { PasswordInput } from './PasswordInput';

function SummaryText({ s }: { s: BackupSummary }) {
  return (
    <>
      {s.groups} Gruppe(n), {s.cards} Karte(n) – davon {s.assignedCards} mit Person – und {s.events} Protokolleintrag/-einträge
    </>
  );
}

/** Verschlüsseltes Backup erstellen und einspielen (z. B. vom Handy auf den Laptop). */
export function BackupSection({ lastBackupAt }: { lastBackupAt?: number }) {
  return (
    <section className="card form">
      <p className="muted">
        Das Backup enthält alle Karten, Personendaten, Fotos, Gruppen und das Protokoll – verschlüsselt mit einem eigenen
        Backup-Passwort (AES-256). Damit lassen sich Daten sichern oder auf ein anderes Gerät übertragen.
      </p>
      <p className={lastBackupAt ? 'muted' : 'hint'}>
        Letztes Backup auf diesem Gerät: {lastBackupAt ? formatDateTime(lastBackupAt) : 'noch nie'}
      </p>
      <AutoBackupSection />
      <ExportForm />
      <ImportForm />
    </section>
  );
}

function ExportForm() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string; summary: BackupSummary } | null>(null);
  const [shareMessage, setShareMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== repeat) return setError('Die beiden Passwörter stimmen nicht überein.');
    setBusy(true);
    try {
      const file = await createBackupFile(password, __APP_VERSION__);
      downloadBlob(file.blob, file.filename);
      await saveSettings({ lastBackupAt: Date.now() });
      setResult(file);
      setShareMessage(null);
      setPassword('');
      setRepeat('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={(e) => void onSubmit(e)}>
      <h3>Backup erstellen</h3>
      <label htmlFor="bk-pw1">Backup-Passwort (mindestens 8 Zeichen)</label>
      <PasswordInput id="bk-pw1" value={password} onChange={setPassword} autoComplete="new-password" />
      <label htmlFor="bk-pw2">Backup-Passwort wiederholen</label>
      <PasswordInput id="bk-pw2" value={repeat} onChange={setRepeat} autoComplete="new-password" />
      <p className="muted small">Ohne dieses Passwort lässt sich das Backup nicht öffnen. Es darf vom Admin-Passwort abweichen.</p>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !password}>
        {busy ? 'Backup wird erstellt …' : 'Backup erstellen und speichern'}
      </button>
      {result && (
        <div className="success-box card">
          <p>
            <strong>Backup gespeichert:</strong> {result.filename} ({formatBytes(result.blob.size)})
            <br />
            <SummaryText s={result.summary} />
          </p>
          <p className="muted small">
            Die Datei liegt im Download-Ordner. Zum Übertragen z. B. per Quick Share, USB-Stick oder E-Mail an das andere Gerät
            senden. Beim Teilen heißt sie „{result.filename}.txt“ – der Inhalt bleibt verschlüsselt und lässt sich genauso
            einspielen.
          </p>
          <div className="button-row">
            <button type="button" className="btn" onClick={() => downloadBlob(result.blob, result.filename)}>
              Erneut herunterladen
            </button>
            {canShareFile(result.blob, result.filename) && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void shareFile(result.blob, result.filename, 'Zutrittskontrolle-Backup').then((r) =>
                    setShareMessage(
                      r.status === 'shared'
                        ? { ok: true, text: 'Backup geteilt.' }
                        : r.status === 'failed'
                          ? { ok: false, text: `${r.message} Die Datei liegt außerdem im Download-Ordner.` }
                          : null,
                    ),
                  )
                }
              >
                Teilen …
              </button>
            )}
          </div>
          {shareMessage && <p className={shareMessage.ok ? 'form-success' : 'form-error'}>{shareMessage.text}</p>}
        </div>
      )}
    </form>
  );
}

function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [payload, setPayload] = useState<BackupPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPayload(null);
    setConfirmed(false);
    setError(null);
  };

  const onOpen = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      setPayload(await openBackupFile(await file.text(), password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup konnte nicht geöffnet werden.');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      const s = await restoreBackup(payload);
      setSuccess(`Backup eingespielt: ${s.cards} Karte(n), ${s.events} Protokolleintrag/-einträge.`);
      setPayload(null);
      setFile(null);
      setPassword('');
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wiederherstellen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={(e) => void onOpen(e)}>
      <h3>Backup einspielen</h3>
      <label htmlFor="bk-file">Backup-Datei (.zkb – geteilte Dateien heißen .zkb.txt)</label>
      <input
        id="bk-file"
        type="file"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          reset();
          setSuccess(null);
        }}
      />
      <label htmlFor="bk-pw-open">Backup-Passwort</label>
      <PasswordInput id="bk-pw-open" value={password} onChange={(v) => { setPassword(v); reset(); }} autoComplete="current-password" />
      {!payload && (
        <button type="submit" className="btn" disabled={busy || !file || !password}>
          {busy ? 'Wird geöffnet …' : 'Backup öffnen'}
        </button>
      )}
      {payload && (
        <div className="card import-preview">
          <p>
            <strong>Backup vom {formatDateTime(payload.exportedAt)}</strong> (App-Version {payload.appVersion}):
            <br />
            <SummaryText s={summarize(payload)} />
          </p>
          <p className="hint">
            Beim Einspielen werden <strong>alle aktuellen Daten auf diesem Gerät ersetzt</strong> (Karten, Gruppen, Protokoll).
            Das Admin-Passwort dieses Geräts bleibt unverändert.
          </p>
          <label className="checkbox">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            Ich möchte die Daten auf diesem Gerät ersetzen
          </label>
          <div className="button-row">
            <button type="button" className="btn btn-danger" disabled={!confirmed || busy} onClick={() => void onRestore()}>
              {busy ? 'Wird eingespielt …' : 'Jetzt wiederherstellen'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}
    </form>
  );
}
