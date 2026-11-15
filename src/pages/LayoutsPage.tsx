import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { PresentationView } from '../components/PresentationView';
import { newId } from '../db/db';
import { listGroups } from '../db/groups';
import { createLayout, deleteLayout, duplicateLayout, layoutUsage, listLayouts, saveLayout } from '../db/layouts';
import { placeholderAvatar } from '../db/seed';
import { saveSettings } from '../db/settings';
import {
  BUILT_IN_LAYOUTS,
  ELEMENT_TYPES,
  IDLE_TEMPLATES,
  PLACEHOLDERS,
  RESULT_TEMPLATES,
  buildLayoutResult,
  isVisibleFor,
  moveElement,
  newElement,
  type ElementType,
  type LayoutElement,
  type PresentationLayout,
  type ResultKind,
  type ResultTexts,
  type ScreenKind,
} from '../domain/presentationLayout';
import { useSettings } from '../hooks/useSettings';
import { fileToScaledDataUrl } from '../lib/image';
import { SettingsShell } from './settings/SettingsShell';

const RESULT_STATES: { value: ResultKind; label: string }[] = [
  { value: 'in', label: 'Eingang' },
  { value: 'out', label: 'Ausgang' },
  { value: 'deny', label: 'Kein Zutritt' },
  { value: 'wait', label: 'Bitte warten / Hinweis' },
];
const TONES: Record<ResultKind, 'ok' | 'out' | 'deny' | 'warn'> = { in: 'ok', out: 'out', deny: 'deny', wait: 'warn' };

const TEXT_FIELDS: { key: keyof ResultTexts; label: string }[] = [
  { key: 'inTitle', label: 'Eingang – Titel' },
  { key: 'inText', label: 'Eingang – Meldung' },
  { key: 'outTitle', label: 'Ausgang – Titel' },
  { key: 'outText', label: 'Ausgang – Meldung' },
  { key: 'denyTitle', label: 'Kein Zutritt – Titel' },
  { key: 'denyText', label: 'Kein Zutritt – Meldung' },
  { key: 'waitTitle', label: 'Bitte warten – Titel (bei Bestätigungspflicht)' },
  { key: 'waitText', label: 'Bitte warten – Meldung' },
];

const TYPE_LABEL: Record<ElementType, string> = {
  text: 'Textfeld',
  photo: 'Foto',
  group: 'Gruppe',
  clock: 'Uhrzeit',
  date: 'Datum',
  logo: 'Logo',
};

function elementLabel(e: LayoutElement): string {
  if (e.type !== 'text') return TYPE_LABEL[e.type];
  const t = (e.text ?? '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : 'Textfeld (leer)';
}

/** Beispielergebnis für Vorschauen – nur fiktive Daten. */
function sampleResult(layout: PresentationLayout, state: ResultKind, group: { name: string; color: string }, orgName: string) {
  return buildLayoutResult(layout, {
    tone: TONES[state],
    kind: state,
    fallbackTitle: 'Hinweis',
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

function useSampleGroup() {
  const groups = useLiveQuery(listGroups, [], []);
  return groups[1] ?? groups[0] ?? { name: 'Besucher', color: '#ea580c' };
}

export function LayoutsPage() {
  const settings = useSettings();
  const layouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const usage = useLiveQuery(layoutUsage, [], new Map<string, { groups: string[]; cards: number }>());
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editLayout = layouts.find((l) => l.id === editing && !l.builtIn);

  const open = (l: PresentationLayout) => {
    setEditing(l.id);
    setMessage(null);
  };
  const remove = async (l: PresentationLayout) => {
    const use = usage.get(l.id);
    const where = use
      ? ` Es wird von ${[...use.groups.map((g) => `Gruppe „${g}“`), use.cards ? `${use.cards} Karte(n)` : ''].filter(Boolean).join(', ')} verwendet – dort gilt danach wieder das Standardlayout.`
      : '';
    if (!window.confirm(`Layout „${l.name}“ löschen?${where}`)) return;
    await deleteLayout(l.id);
    setMessage(`Layout „${l.name}“ gelöscht.`);
  };

  if (editLayout) {
    return (
      <SettingsShell title={editLayout.kind === 'idle' ? 'Ruhebildschirm gestalten' : 'Scan-Anzeige gestalten'} wide>
        <LayoutEditor key={editLayout.id} initial={editLayout} orgName={settings.orgName} onClose={() => setEditing(null)} />
      </SettingsShell>
    );
  }

  const section = (kind: ScreenKind) => {
    const list = layouts.filter((l) => l.kind === kind);
    const activeId = kind === 'idle' ? settings.idleLayoutId : settings.defaultLayoutId;
    const active = list.some((l) => l.id === activeId) ? activeId : list[0]?.id;
    return (
      <section className="layout-section" aria-label={kind === 'idle' ? 'Ruhebildschirm' : 'Anzeige beim Scannen'}>
        <div className="layout-section-head">
          <div>
            <h2>{kind === 'idle' ? 'Ruhebildschirm' : 'Anzeige beim Scannen'}</h2>
            <p className="muted small">
              {kind === 'idle'
                ? 'Erscheint, solange niemand scannt. Ein Design ist aktiv – z. B. eines für den Alltag und eines für Veranstaltungen.'
                : 'Erscheint beim Scannen. Zuweisbar an Gruppen (Gruppen verwalten) oder einzelne Karten (Kartenseite); es gilt Karte vor Gruppe vor Standard.'}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void createLayout(kind).then(open)}>
            {kind === 'idle' ? '+ Neuer Ruhebildschirm' : '+ Neue Scan-Anzeige'}
          </button>
        </div>
        <ul className="layout-list">
          {list.map((l) => {
            const use = usage.get(l.id);
            const isActive = l.id === active;
            return (
              <li key={l.id} className="card layout-row">
                <div className="layout-thumb">
                  <LayoutThumb layout={l} orgName={settings.orgName} />
                </div>
                <div className="layout-row-main">
                  <h3>
                    {l.name} {l.builtIn && <span className="badge">mitgeliefert</span>}{' '}
                    {isActive && <span className="badge badge-active">{kind === 'idle' ? 'aktiv' : 'Standard für alle ohne Zuweisung'}</span>}
                  </h3>
                  {kind === 'result' && (
                    <p className="muted small">
                      {use?.groups.length ? `Gruppen: ${use.groups.join(', ')}` : 'keiner Gruppe zugewiesen'}
                      {use?.cards ? ` · ${use.cards} Karte(n)` : ''}
                    </p>
                  )}
                  <div className="button-row">
                    {!l.builtIn && (
                      <button type="button" className="btn btn-primary" onClick={() => open(l)}>
                        Bearbeiten
                      </button>
                    )}
                    <button type="button" className="btn" onClick={() => void duplicateLayout(l.id).then(open)}>
                      Kopieren
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void saveSettings(kind === 'idle' ? { idleLayoutId: l.id } : { defaultLayoutId: l.id })}
                      >
                        {kind === 'idle' ? 'Aktivieren' : 'Als Standard verwenden'}
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
      </section>
    );
  };

  return (
    <SettingsShell title="Präsentation" wide>
      <p className="muted">
        Gestaltung des Gästebildschirms. Ruhebildschirm und Anzeige beim Scannen werden getrennt gestaltet. Textfelder, Foto,
        Uhr, Logo usw. lassen sich frei hinzufügen, verschieben und entfernen. Mitgelieferte Layouts bleiben unverändert und
        dienen als Vorlage. <Link to="/einstellungen/gruppen">Gruppen verwalten</Link>
      </p>
      {message && <p className="form-success">{message}</p>}
      {section('idle')}
      {section('result')}
    </SettingsShell>
  );
}

function LayoutThumb({ layout, orgName }: { layout: PresentationLayout; orgName: string }) {
  const group = useSampleGroup();
  const result = layout.kind === 'result' ? sampleResult(layout, 'in', group, orgName) : null;
  return <PresentationView layout={layout} result={result} orgName={orgName} now={new Date()} preview />;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface EditorProps {
  initial: PresentationLayout;
  orgName: string;
  onClose: () => void;
}

function LayoutEditor({ initial, orgName, onClose }: EditorProps) {
  const [layout, setLayout] = useState<PresentationLayout>(initial);
  const isIdle = layout.kind === 'idle';
  const [state, setState] = useState<ResultKind>('in');
  const [selectedId, setSelectedId] = useState<string | undefined>(initial.elements[0]?.id);
  const [error, setError] = useState<string | null>(null);
  /** Ungespeicherte Änderungen vorhanden. */
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const sampleGroup = useSampleGroup();
  const result = useMemo(() => (isIdle ? null : sampleResult(layout, state, sampleGroup, orgName)), [isIdle, layout, state, sampleGroup, orgName]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const changed = () => {
    setDirty(true);
    setJustSaved(false);
  };
  const set = (patch: Partial<PresentationLayout>) => {
    setLayout((l) => ({ ...l, ...patch }));
    changed();
  };
  const setBg = (patch: Partial<PresentationLayout['background']>) => set({ background: { ...layout.background, ...patch } });
  const setText = (key: keyof ResultTexts, value: string) => set({ texts: { ...layout.texts, [key]: value } });
  const updateElement = (element: LayoutElement) => {
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === element.id ? element : e)) }));
    changed();
  };
  const addElement = (type: ElementType) => {
    const element = newElement(type, newId());
    set({ elements: [...layout.elements, element] });
    setSelectedId(element.id);
  };
  const removeElement = (id: string) => {
    set({ elements: layout.elements.filter((e) => e.id !== id) });
    setSelectedId(undefined);
  };
  const applyTemplate = (id: string) => {
    const template = (isIdle ? IDLE_TEMPLATES : RESULT_TEMPLATES).find((t) => t.id === id);
    if (!template || !window.confirm(`Vorlage „${template.label}“ anwenden? Die bisherigen Elemente werden ersetzt.`)) return;
    const elements = template.elements();
    set({ elements });
    setSelectedId(elements[0]?.id);
  };

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
        if (!layout.elements.some((x) => x.type === 'logo')) addElement('logo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Bild konnte nicht übernommen werden.');
    }
  };

  const save = async () => {
    setError(null);
    try {
      await saveLayout(layout);
      setDirty(false);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const selected = layout.elements.find((e) => e.id === selectedId);
  const bg = layout.background;

  return (
    <div className="layout-editor">
      <div className="layout-preview">
        {!isIdle && (
          <div className="segmented segmented-light segmented-small layout-states" role="tablist" aria-label="Vorschau für">
            {RESULT_STATES.map((s) => (
              <button key={s.value} type="button" role="tab" aria-selected={state === s.value} className={state === s.value ? 'active' : ''} onClick={() => setState(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <PresentationView
          layout={layout}
          result={result}
          orgName={orgName}
          now={now}
          preview
          edit={{ selectedId, onSelect: setSelectedId, onChange: updateElement }}
        />
        <p className="muted small">
          Elemente anklicken und mit Maus oder Finger an die gewünschte Stelle ziehen. Feinschritte mit den Pfeiltasten (mit
          Umschalttaste größere Schritte). Vorschau mit fiktiven Beispieldaten.
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty}>
            Speichern
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => (!dirty || window.confirm('Änderungen verwerfen?') ? onClose() : undefined)}>
            {dirty ? 'Schließen ohne Speichern' : 'Fertig'}
          </button>
          {justSaved && <span className="form-success">Gespeichert.</span>}
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="layout-side">
        <div className="card element-panel">
          <h3>Elemente</h3>
          <ul className="element-list" aria-label="Elemente auf dem Bildschirm">
            {layout.elements.map((e) => (
              <li key={e.id}>
                <button type="button" className={e.id === selectedId ? 'chip active' : 'chip'} onClick={() => setSelectedId(e.id)}>
                  {elementLabel(e)}
                  {!isIdle && !isVisibleFor(e, state) && <span className="muted"> (hier ausgeblendet)</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="button-row add-elements" aria-label="Element hinzufügen">
            {ELEMENT_TYPES[layout.kind].map((t) => (
              <button key={t.type} type="button" className="btn btn-small" onClick={() => addElement(t.type)}>
                + {t.label}
              </button>
            ))}
          </div>
          {selected ? (
            <ElementEditor
              element={selected}
              kind={layout.kind}
              onChange={updateElement}
              onRemove={() => removeElement(selected.id)}
            />
          ) : (
            <p className="muted small">Ein Element in der Vorschau oder in der Liste anklicken, um es zu bearbeiten.</p>
          )}
        </div>
        <div className="card form layout-form">
          <label>
            Name
            <input value={layout.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            Vorlage anwenden (ersetzt die Elemente)
            <select value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">– Vorlage wählen –</option>
              {(isIdle ? IDLE_TEMPLATES : RESULT_TEMPLATES).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

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
            {!isIdle && (
              <>
                <label className="checkbox">
                  <input type="radio" name="result-bg" checked={layout.resultBackground === 'outcome'} onChange={() => set({ resultBackground: 'outcome' })} />
                  Ergebnisfarbe als Hintergrund (grün / blau / rot – am deutlichsten)
                </label>
                <label className="checkbox">
                  <input type="radio" name="result-bg" checked={layout.resultBackground === 'custom'} onChange={() => set({ resultBackground: 'custom' })} />
                  Eigener Hintergrund mit farbigem Streifen oben und unten
                </label>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>Logo</legend>
            <input type="file" accept="image/*" aria-label="Logo wählen" onChange={(e) => void onImage(e, 'logo')} />
            {layout.logo && (
              <div className="button-row">
                <img src={layout.logo} alt="Logo" className="layout-logo-preview" />
                <button type="button" className="btn btn-small" onClick={() => set({ logo: undefined })}>
                  Logo entfernen
                </button>
              </div>
            )}
            <p className="muted small">Platzieren mit dem Element „Logo“.</p>
          </fieldset>

          {!isIdle && (
            <>
              <fieldset>
                <legend>Datenschutz</legend>
                <label>
                  Name des Gastes ({'{name}'}, {'{vorname}'}, Foto-Initialen)
                  <select value={layout.nameFormat} onChange={(e) => set({ nameFormat: e.target.value as PresentationLayout['nameFormat'] })}>
                    <option value="full">Vor- und Nachname</option>
                    <option value="first">Nur Vorname</option>
                    <option value="none">Keinen Namen anzeigen</option>
                  </select>
                </label>
              </fieldset>
              <fieldset>
                <legend>Texte je Ergebnis – für {'{titel}'} und {'{meldung}'}</legend>
                <p className="muted small">
                  Platzhalter: {PLACEHOLDERS.result.filter((p) => p.key !== '{titel}' && p.key !== '{meldung}').map((p) => `${p.key} = ${p.label}`).join(' · ')}.
                </p>
                {TEXT_FIELDS.map((f) => (
                  <label key={f.key}>
                    {f.label}
                    <input
                      value={layout.texts[f.key]}
                      maxLength={160}
                      onChange={(e) => setText(f.key, e.target.value)}
                      onFocus={() => setState(f.key.replace(/(Title|Text)$/, '') as ResultKind)}
                    />
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ein Element bearbeiten
// ---------------------------------------------------------------------------

interface ElementEditorProps {
  element: LayoutElement;
  kind: ScreenKind;
  onChange: (e: LayoutElement) => void;
  onRemove: () => void;
}

function ElementEditor({ element, kind, onChange, onRemove }: ElementEditorProps) {
  const set = (patch: Partial<LayoutElement>) => onChange({ ...element, ...patch });
  const hasFont = element.type !== 'photo' && element.type !== 'logo';
  const number = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback);
  const toggleShow = (k: ResultKind, on: boolean) => {
    const current = RESULT_STATES.map((s) => s.value).filter((v) => isVisibleFor(element, v));
    const next = on ? [...current, k] : current.filter((v) => v !== k);
    if (next.length === 0) return; // mindestens ein Ergebnis
    set({ showOn: next.length === RESULT_STATES.length ? undefined : next });
  };

  return (
    <div className="element-editor" aria-label="Ausgewähltes Element">
      <h4>{TYPE_LABEL[element.type]}</h4>
      {element.type === 'text' && (
        <>
          <label htmlFor={`el-text-${element.id}`}>Text</label>
          <textarea
            id={`el-text-${element.id}`}
            rows={2}
            value={element.text ?? ''}
            maxLength={300}
            onChange={(e) => set({ text: e.target.value })}
          />
          <p className="muted small">Platzhalter: {PLACEHOLDERS[kind].map((p) => p.key).join(' ')}</p>
          {kind === 'result' && (
            <label className="checkbox-inline">
              <input type="checkbox" checked={Boolean(element.withIcon)} onChange={(e) => set({ withIcon: e.target.checked })} /> Ergebnissymbol (✓ / ✕) davor
            </label>
          )}
        </>
      )}
      <div className="element-grid">
        {hasFont && (
          <label>
            Schriftgröße: {element.size}
            <input type="range" min={1} max={40} step={0.5} value={element.size} onChange={(e) => set({ size: Number(e.target.value) })} />
          </label>
        )}
        <label>
          Breite: {element.w} %
          <input
            type="range"
            min={5}
            max={100}
            step={0.5}
            value={element.w}
            onChange={(e) => onChange(moveElement({ ...element, w: Number(e.target.value) }, element.x, element.y))}
          />
        </label>
        <label>
          Abstand links (%)
          <input type="number" min={0} max={100} step={0.5} value={element.x} onChange={(e) => onChange(moveElement(element, number(e.target.value, element.x), element.y))} />
        </label>
        <label>
          Abstand oben (%)
          <input type="number" min={0} max={100} step={0.5} value={element.y} onChange={(e) => onChange(moveElement(element, element.x, number(e.target.value, element.y)))} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-small" onClick={() => onChange(moveElement(element, (100 - element.w) / 2, element.y))}>
          Waagerecht zentrieren
        </button>
        {hasFont && (
          <div className="segmented segmented-light segmented-small" role="radiogroup" aria-label="Ausrichtung">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={element.align === a} className={element.align === a ? 'active' : ''} onClick={() => set({ align: a })}>
                {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
              </button>
            ))}
          </div>
        )}
      </div>
      {hasFont && (
        <div className="button-row">
          <label className="checkbox-inline">
            <input type="checkbox" checked={element.bold} onChange={(e) => set({ bold: e.target.checked })} /> fett
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={Boolean(element.color)} onChange={(e) => set({ color: e.target.checked ? '#facc15' : undefined })} /> eigene
            Farbe
          </label>
          {element.color && <input type="color" value={element.color} onChange={(e) => set({ color: e.target.value })} aria-label="Farbe des Elements" />}
        </div>
      )}
      {kind === 'result' && (
        <fieldset className="element-show">
          <legend>Anzeigen bei</legend>
          {RESULT_STATES.map((s) => (
            <label key={s.value} className="checkbox-inline">
              <input type="checkbox" checked={isVisibleFor(element, s.value)} onChange={(e) => toggleShow(s.value, e.target.checked)} /> {s.label}
            </label>
          ))}
        </fieldset>
      )}
      <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>
        Element entfernen
      </button>
    </div>
  );
}
