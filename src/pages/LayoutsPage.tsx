import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { PresentationView } from '../components/PresentationView';
import { SettingsShell } from './settings/SettingsShell';
import { listGroups } from '../db/groups';
import { deleteLayout, duplicateLayout, layoutUsage, listLayouts, saveLayout } from '../db/layouts';
import { placeholderAvatar } from '../db/seed';
import { saveSettings } from '../db/settings';
import {
  PLACEHOLDERS,
  STANDARD_LAYOUT,
  STANDARD_LAYOUT_ID,
  buildLayoutResult,
  type LayoutArrangement,
  type LayoutTexts,
  type PresentationLayout,
  type ResultInput,
} from '../domain/presentationLayout';
import { useSettings } from '../hooks/useSettings';
import { fileToScaledDataUrl } from '../lib/image';

type PreviewState = 'idle' | 'in' | 'out' | 'deny' | 'wait';

const PREVIEW_STATES: { value: PreviewState; label: string }[] = [
  { value: 'idle', label: 'Ruhebildschirm' },
  { value: 'in', label: 'Willkommen' },
  { value: 'out', label: 'Auf Wiedersehen' },
  { value: 'deny', label: 'Kein Zutritt' },
  { value: 'wait', label: 'Bitte warten' },
];

const ARRANGEMENTS: { value: LayoutArrangement; label: string; hint: string }[] = [
  { value: 'center', label: 'Zentriert', hint: 'Titel, Foto, Name und Text untereinander' },
  { value: 'side', label: 'Foto links', hint: 'großes Foto links, Texte rechts' },
  { value: 'minimal', label: 'Nur Text', hint: 'großer Titel und Name, ohne Foto und Gruppe' },
];

const TEXT_FIELDS: { key: keyof LayoutTexts; label: string }[] = [
  { key: 'idleTitle', label: 'Ruhebildschirm – Überschrift' },
  { key: 'idleHint', label: 'Ruhebildschirm – Hinweis' },
  { key: 'inTitle', label: 'Eingang – Titel' },
  { key: 'inText', label: 'Eingang – Text' },
  { key: 'outTitle', label: 'Ausgang – Titel' },
  { key: 'outText', label: 'Ausgang – Text' },
  { key: 'denyTitle', label: 'Kein Zutritt – Titel' },
  { key: 'denyText', label: 'Kein Zutritt – Text' },
  { key: 'waitTitle', label: 'Bitte warten – Titel (bei Bestätigungspflicht)' },
  { key: 'waitText', label: 'Bitte warten – Text' },
];

/** Beispielergebnis für die Vorschau – nur fiktive Daten. */
function sampleResult(layout: PresentationLayout, state: PreviewState, group: { name: string; color: string }, orgName: string) {
  if (state === 'idle') return null;
  const tones: Record<Exclude<PreviewState, 'idle'>, ResultInput['tone']> = { in: 'ok', out: 'out', deny: 'deny', wait: 'warn' };
  return buildLayoutResult(layout, {
    tone: tones[state],
    kind: state,
    fallbackTitle: '',
    fallbackText: '',
    reason: state === 'deny' ? 'Berechtigung abgelaufen.' : undefined,
    person: {
      firstName: 'Erika',
      lastName: 'Musterfrau',
      company: 'Vertrieb',
      photo: placeholderAvatar('Erika', 'Musterfrau', 2),
      groupName: group.name,
      groupColor: group.color,
    },
    at: Date.now(),
    orgName,
  });
}

export function LayoutsPage() {
  const settings = useSettings();
  const layouts = useLiveQuery(listLayouts, [], [STANDARD_LAYOUT]);
  const usage = useLiveQuery(layoutUsage, [], new Map<string, { groups: string[]; cards: number }>());
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editLayout = layouts.find((l) => l.id === editing && !l.builtIn);

  const create = async (sourceId: string) => {
    const l = await duplicateLayout(sourceId);
    setEditing(l.id);
    setMessage(null);
  };
  const remove = async (l: PresentationLayout) => {
    const use = usage.get(l.id);
    const where = use ? ` Es wird von ${[...use.groups.map((g) => `Gruppe „${g}“`), use.cards ? `${use.cards} Karte(n)` : ''].filter(Boolean).join(', ')} verwendet – dort gilt danach wieder das Standardlayout.` : '';
    if (!window.confirm(`Layout „${l.name}“ löschen?${where}`)) return;
    await deleteLayout(l.id);
    if (editing === l.id) setEditing(null);
    setMessage(`Layout „${l.name}“ gelöscht.`);
  };

  return (
    <SettingsShell
      title="Präsentation"
      wide
      actions={
        <button type="button" className="btn btn-primary" onClick={() => void create(STANDARD_LAYOUT_ID)}>
          + Neues Layout
        </button>
      }
    >
      <p className="muted">
        Layouts bestimmen Aufbau, Texte und Hintergrund des Gästebildschirms. Zuweisen lassen sie sich ganzen Gruppen
        (<Link to="/einstellungen/gruppen">Gruppen verwalten</Link>) oder einzelnen Karten (Kartenseite). Es gilt: Karte vor Gruppe
        vor Standard. Das mitgelieferte Layout „Standard“ bleibt unverändert und kann als Vorlage kopiert werden.
      </p>
      {message && <p className="form-success">{message}</p>}

      {editLayout ? (
        <LayoutEditor key={editLayout.id} initial={editLayout} orgName={settings.orgName} onClose={() => setEditing(null)} />
      ) : (
        <ul className="layout-list">
          {layouts.map((l) => {
            const use = usage.get(l.id);
            const isDefault = settings.defaultLayoutId === l.id;
            return (
              <li key={l.id} className="card layout-row">
                <div className="layout-thumb">
                  <PresentationView layout={l} result={null} orgName={settings.orgName} now={new Date()} preview />
                </div>
                <div className="layout-row-main">
                  <h2>
                    {l.name} {l.builtIn && <span className="badge">mitgeliefert</span>}{' '}
                    {isDefault && <span className="badge badge-active">Standard für Ruhebildschirm und alle ohne Zuweisung</span>}
                  </h2>
                  <p className="muted small">
                    {use?.groups.length ? `Gruppen: ${use.groups.join(', ')}` : 'keiner Gruppe zugewiesen'}
                    {use?.cards ? ` · ${use.cards} Karte(n)` : ''}
                  </p>
                  <div className="button-row">
                    {!l.builtIn && (
                      <button type="button" className="btn btn-primary" onClick={() => setEditing(l.id)}>
                        Bearbeiten
                      </button>
                    )}
                    <button type="button" className="btn" onClick={() => void create(l.id)}>
                      Kopieren
                    </button>
                    {!isDefault && (
                      <button type="button" className="btn" onClick={() => void saveSettings({ defaultLayoutId: l.id })}>
                        Als Standard verwenden
                      </button>
                    )}
                    {!l.builtIn && (
                      <button type="button" className="btn btn-danger" onClick={() => void remove(l)}>
                        Löschen
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsShell>
  );
}

interface EditorProps {
  initial: PresentationLayout;
  orgName: string;
  onClose: () => void;
}

function LayoutEditor({ initial, orgName, onClose }: EditorProps) {
  const [layout, setLayout] = useState<PresentationLayout>(initial);
  const [state, setState] = useState<PreviewState>('in');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const groups = useLiveQuery(listGroups, [], []);
  const sampleGroup = groups[1] ?? groups[0] ?? { name: 'Besucher', color: '#ea580c' };
  const result = useMemo(() => sampleResult(layout, state, sampleGroup, orgName), [layout, state, sampleGroup, orgName]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const set = (patch: Partial<PresentationLayout>) => {
    setLayout((l) => ({ ...l, ...patch }));
    setSaved(false);
  };
  const setBg = (patch: Partial<PresentationLayout['background']>) => set({ background: { ...layout.background, ...patch } });
  const setShow = (patch: Partial<PresentationLayout['show']>) => set({ show: { ...layout.show, ...patch } });
  const setText = (key: keyof LayoutTexts, value: string) => set({ texts: { ...layout.texts, [key]: value } });

  const onImage = async (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      if (target === 'background') {
        setBg({ kind: 'image', image: await fileToScaledDataUrl(file, { maxWidth: 1920, maxHeight: 1080, type: 'image/jpeg', quality: 0.8 }) });
      } else {
        set({ logo: await fileToScaledDataUrl(file, { maxWidth: 800, maxHeight: 400, type: 'image/png' }) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Bild konnte nicht übernommen werden.');
    }
  };

  const save = async () => {
    setError(null);
    try {
      await saveLayout(layout);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const bg = layout.background;

  return (
    <div className="layout-editor">
      <div className="layout-preview">
        <div className="segmented segmented-light segmented-small layout-states" role="tablist" aria-label="Vorschau">
          {PREVIEW_STATES.map((s) => (
            <button key={s.value} type="button" role="tab" aria-selected={state === s.value} className={state === s.value ? 'active' : ''} onClick={() => setState(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <PresentationView layout={layout} result={result} orgName={orgName} now={now} preview />
        <p className="muted small">Vorschau mit fiktiven Beispieldaten. So erscheint es auf dem Gästebildschirm.</p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Speichern
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {saved ? 'Fertig' : 'Schließen ohne Speichern'}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {saved && <p className="form-success">Gespeichert.</p>}
      </div>

      <div className="card form layout-form">
        <label>
          Name des Layouts
          <input value={layout.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
        </label>

        <fieldset>
          <legend>Aufbau</legend>
          <div className="choice-grid">
            {ARRANGEMENTS.map((a) => (
              <label key={a.value} className={layout.arrangement === a.value ? 'choice active' : 'choice'}>
                <input type="radio" name="arrangement" checked={layout.arrangement === a.value} onChange={() => set({ arrangement: a.value })} />
                <strong>{a.label}</strong>
                <span className="muted small">{a.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Hintergrund</legend>
          <div className="form-grid">
            <label>
              Hintergrundart
              <select value={bg.kind} onChange={(e) => setBg({ kind: e.target.value as PresentationLayout['background']['kind'] })}>
                <option value="color">Einfarbig</option>
                <option value="gradient">Farbverlauf</option>
                <option value="image">Bild</option>
              </select>
            </label>
            <label>
              {bg.kind === 'gradient' ? 'Farbe außen' : 'Farbe'}
              <input type="color" value={bg.color} onChange={(e) => setBg({ color: e.target.value })} />
            </label>
            {bg.kind === 'gradient' && (
              <label>
                Farbe innen
                <input type="color" value={bg.color2} onChange={(e) => setBg({ color2: e.target.value })} />
              </label>
            )}
            <label>
              Schriftfarbe
              <select value={layout.textColor} onChange={(e) => set({ textColor: e.target.value as 'light' | 'dark' })}>
                <option value="light">Hell (für dunkle Hintergründe)</option>
                <option value="dark">Dunkel (für helle Hintergründe)</option>
              </select>
            </label>
          </div>
          {bg.kind === 'image' && (
            <div className="subform">
              <label htmlFor="layout-bg">Hintergrundbild (wird verkleinert und nur auf diesem Gerät gespeichert)</label>
              <input id="layout-bg" type="file" accept="image/*" onChange={(e) => void onImage(e, 'background')} />
              {bg.image ? (
                <>
                  <label>
                    Abdunkeln für bessere Lesbarkeit: {Math.round(bg.dim * 100)} %
                    <input type="range" min={0} max={70} step={5} value={Math.round(bg.dim * 100)} onChange={(e) => setBg({ dim: Number(e.target.value) / 100 })} />
                  </label>
                  <button type="button" className="btn btn-small" onClick={() => setBg({ image: undefined, kind: 'color' })}>
                    Bild entfernen
                  </button>
                </>
              ) : (
                <p className="hint">Noch kein Bild gewählt – bis dahin wird die Farbe verwendet.</p>
              )}
            </div>
          )}
          <label className="checkbox">
            <input
              type="radio"
              name="result-bg"
              checked={layout.resultBackground === 'outcome'}
              onChange={() => set({ resultBackground: 'outcome' })}
            />
            Bei Ergebnissen: Ergebnisfarbe als Hintergrund (grün / blau / rot – am deutlichsten)
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name="result-bg"
              checked={layout.resultBackground === 'custom'}
              onChange={() => set({ resultBackground: 'custom' })}
            />
            Bei Ergebnissen: eigener Hintergrund mit farbigem Streifen oben und unten
          </label>
        </fieldset>

        <fieldset>
          <legend>Logo (optional)</legend>
          <input type="file" accept="image/*" aria-label="Logo wählen" onChange={(e) => void onImage(e, 'logo')} />
          {layout.logo && (
            <div className="button-row">
              <img src={layout.logo} alt="Logo" className="layout-logo-preview" />
              <button type="button" className="btn btn-small" onClick={() => set({ logo: undefined })}>
                Logo entfernen
              </button>
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend>Anzeigen</legend>
          <label>
            Name des Gastes
            <select value={layout.nameFormat} onChange={(e) => set({ nameFormat: e.target.value as PresentationLayout['nameFormat'] })}>
              <option value="full">Vor- und Nachname</option>
              <option value="first">Nur Vorname (Datenschutz)</option>
              <option value="none">Keinen Namen anzeigen</option>
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={layout.show.photo} onChange={(e) => setShow({ photo: e.target.checked })} /> Foto
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={layout.show.group} onChange={(e) => setShow({ group: e.target.checked })} /> Gruppe
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={layout.show.company} onChange={(e) => setShow({ company: e.target.checked })} /> Firma / Abteilung
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={layout.show.org} onChange={(e) => setShow({ org: e.target.checked })} /> Ruhebildschirm: Name der
            Organisation
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={layout.show.clock} onChange={(e) => setShow({ clock: e.target.checked })} /> Ruhebildschirm: Uhrzeit
            und Datum
          </label>
        </fieldset>

        <fieldset>
          <legend>Texte</legend>
          <p className="muted small">
            Platzhalter: {PLACEHOLDERS.map((p) => `${p.key} = ${p.label}`).join(' · ')}. Bitte keine Personendaten direkt
            eintippen – Layouts werden unverschlüsselt gespeichert; Platzhalter werden erst beim Scan gefüllt.
          </p>
          {TEXT_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                value={layout.texts[f.key]}
                maxLength={160}
                onChange={(e) => setText(f.key, e.target.value)}
                onFocus={() => {
                  const map: Record<string, PreviewState> = { idle: 'idle', in: 'in', out: 'out', deny: 'deny', wait: 'wait' };
                  const prefix = f.key.replace(/(Title|Text|Hint)$/, '');
                  if (map[prefix]) setState(map[prefix]);
                }}
              />
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}
