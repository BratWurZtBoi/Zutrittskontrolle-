import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { PresentationView } from '../components/PresentationView';
import { Segmented } from '../components/Segmented';
import { newId } from '../db/db';
import { saveLayout, setLayoutGroups } from '../db/layouts';
import { placeholderAvatar } from '../db/seed';
import { saveSettings } from '../db/settings';
import {
  IDLE_TEMPLATES,
  PLACEHOLDERS,
  RESULT_TEMPLATES,
  SCREEN_PRESETS,
  STANDARD_IDLE_ID,
  STANDARD_LAYOUT_ID,
  buildLayoutResult,
  friendlyScreenText,
  idleText,
  isVisibleFor,
  moveElement,
  type ElementType,
  type LayoutElement,
  type PresentationLayout,
  type ResultKind,
  type ResultTexts,
} from '../domain/presentationLayout';
import type { Group } from '../domain/types';
import { useEditorShortcuts, useUnsavedGuard } from '../hooks/useEditorShortcuts';
import { useHistory } from '../hooks/useHistory';
import { fileToScaledDataUrl } from '../lib/image';
import { confirmLeave, setUnsavedChanges } from '../lib/unsavedChanges';

export const RESULT_STATES: { value: ResultKind; label: string }[] = [
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
const TYPE_LABEL: Record<ElementType, string> = { text: 'Textfeld', photo: 'Foto', group: 'Gruppe', clock: 'Uhrzeit', date: 'Datum', logo: 'Logo' };

type Tab = 'add' | 'edit' | 'design' | 'texts' | 'general';

export function screenElementLabel(e: LayoutElement): string {
  if (e.type !== 'text') return TYPE_LABEL[e.type];
  const t = friendlyScreenText(e.text ?? '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 28 ? `${t.slice(0, 27)}…` : t) : 'Textfeld (leer)';
}

/** Beispielergebnis für Vorschauen – nur fiktive Daten. */
export function sampleResult(layout: PresentationLayout, state: ResultKind, group: { name: string; color: string }, orgName: string) {
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

const pctText = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

interface Props {
  initial: PresentationLayout;
  orgName: string;
  groups: Group[];
  /** Aktiver Ruhebildschirm bzw. Standard-Scan-Anzeige. */
  activeId: string;
  onClose: () => void;
}

/** Gästebildschirm gestalten – gleicher Aufbau wie der Karteneditor. */
export function PresentationLayoutEditor({ initial, orgName, groups, activeId, onClose }: Props) {
  const history = useHistory<PresentationLayout>(initial);
  const layout = history.value;
  const isIdle = layout.kind === 'idle';
  const [saved, setSaved] = useState(initial);
  const initialGroups = useMemo(() => new Set(groups.filter((g) => g.presentationLayoutId === initial.id).map((g) => g.id)), [groups, initial.id]);
  const [savedGroups, setSavedGroups] = useState(initialGroups);
  const [assigned, setAssigned] = useState(initialGroups);
  const [savedActive, setSavedActive] = useState(activeId === initial.id);
  const [isActive, setIsActive] = useState(savedActive);
  const [tab, setTab] = useState<Tab>('add');
  const [state, setState] = useState<ResultKind>('in');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const added = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const sampleGroup = groups[1] ?? groups[0] ?? { name: 'Besucher', color: '#ea580c' };
  const result = useMemo(() => (isIdle ? null : sampleResult(layout, state, sampleGroup, orgName)), [isIdle, layout, state, sampleGroup, orgName]);
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const dirty = layout !== saved || !sameSet(assigned, savedGroups) || isActive !== savedActive;
  const selected = layout.elements.find((e) => e.id === selectedId);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  useUnsavedGuard(dirty, rootRef, 'Das Layout hat ungespeicherte Änderungen. Trotzdem verlassen?');

  const setLayout = (patch: Partial<PresentationLayout>, key?: string) => history.set((l) => ({ ...l, ...patch }), key);
  const setBg = (patch: Partial<PresentationLayout['background']>, key?: string) => history.set((l) => ({ ...l, background: { ...l.background, ...patch } }), key);
  const updateElement = (element: LayoutElement, key = `el:${element.id}`) =>
    history.set((l) => ({ ...l, elements: l.elements.map((e) => (e.id === element.id ? element : e)) }), key);
  const select = (id: string | undefined) => {
    setSelectedId(id);
    if (id) setTab('edit');
  };
  const addElement = (make: (id: string) => LayoutElement) => {
    const base = make(newId());
    const element = moveElement(base, base.x, base.y + (added.current++ % 4) * 3);
    history.set((l) => ({ ...l, elements: [...l.elements, element] }));
    select(element.id);
  };
  const removeElement = (id: string) => {
    history.set((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) }));
    setSelectedId(undefined);
  };
  const duplicateElement = (e: LayoutElement) => {
    const copy = moveElement({ ...e, id: newId() }, e.x + 2, e.y + 3);
    history.set((l) => ({ ...l, elements: [...l.elements, copy] }));
    select(copy.id);
  };
  const reorder = (e: LayoutElement, toFront: boolean) =>
    history.set((l) => {
      const rest = l.elements.filter((x) => x.id !== e.id);
      return { ...l, elements: toFront ? [...rest, e] : [e, ...rest] };
    });

  useEditorShortcuts({
    undo: history.undo,
    redo: history.redo,
    remove: selectedId ? () => removeElement(selectedId) : undefined,
    deselect: () => setSelectedId(undefined),
  });

  const save = async () => {
    setMessage(null);
    try {
      await saveLayout(layout);
      if (!isIdle && !sameSet(assigned, savedGroups)) await setLayoutGroups(layout.id, assigned);
      if (isActive !== savedActive) {
        await saveSettings(
          isIdle ? { idleLayoutId: isActive ? layout.id : STANDARD_IDLE_ID } : { defaultLayoutId: isActive ? layout.id : STANDARD_LAYOUT_ID },
        );
      }
      setSaved(layout);
      setSavedGroups(new Set(assigned));
      setSavedActive(isActive);
      setMessage({ ok: true, text: 'Gespeichert.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Speichern fehlgeschlagen.' });
    }
  };
  const close = () => {
    if (!dirty || confirmLeave()) {
      setUnsavedChanges(null);
      onClose();
    }
  };

  const onImage = async (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      if (target === 'background') {
        setBg({ kind: 'image', image: await fileToScaledDataUrl(file, { maxWidth: 1920, maxHeight: 1080, type: 'image/jpeg', quality: 0.8 }) });
      } else {
        setLayout({ logo: await fileToScaledDataUrl(file, { maxWidth: 800, maxHeight: 400, type: 'image/png' }) });
        if (!layout.elements.some((x) => x.type === 'logo')) addElement(SCREEN_PRESETS[layout.kind].find((p) => p.id === 'logo')!.make);
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Das Bild konnte nicht übernommen werden.' });
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'add', label: 'Hinzufügen' },
    { id: 'edit', label: 'Bearbeiten' },
    { id: 'design', label: 'Design' },
    ...(isIdle ? [] : [{ id: 'texts' as const, label: 'Texte' }]),
    { id: 'general', label: 'Allgemein' },
  ];

  return (
    <div className="ce pe" ref={rootRef}>
      <div className="ce-topbar">
        <button type="button" className="btn btn-ghost" onClick={close}>
          ← Gästebildschirm
        </button>
        <input className="ce-name" value={layout.name} maxLength={40} aria-label="Name des Layouts" onChange={(e) => setLayout({ name: e.target.value }, 'name')} />
        <span className="ce-format-pill ce-pill-static">{isIdle ? 'Ruhebildschirm' : 'Anzeige beim Scannen'}</span>
        <span className="ce-spacer" />
        <button type="button" className="btn" onClick={history.undo} disabled={!history.canUndo} title="Rückgängig (Strg+Z)">
          ↶ Rückgängig
        </button>
        <button type="button" className="btn" onClick={history.redo} disabled={!history.canRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
          ↷
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!dirty}>
          Speichern
        </button>
        <button type="button" className="btn" onClick={close}>
          {dirty ? 'Schließen' : 'Fertig'}
        </button>
        {message && (
          <span className={message.ok ? 'form-success ce-message' : 'form-error ce-message'} role={message.ok ? 'status' : 'alert'}>
            {message.text}
          </span>
        )}
      </div>

      <div className="ce-main pe-main">
        <section className="ce-stage" aria-label="Vorschau">
          {!isIdle && (
            <div className="ce-stage-tools">
              <Segmented label="Vorschau für" value={state} options={RESULT_STATES} onChange={setState} small />
            </div>
          )}
          <div className="ce-canvas pe-canvas">
            <PresentationView
              layout={layout}
              result={result}
              orgName={orgName}
              now={now}
              preview
              edit={{ selectedId, onSelect: select, onChange: (e) => updateElement(e, `move:${e.id}`), onGestureStart: history.checkpoint }}
            />
          </div>
          <p className="ce-hint">
            Ziehen = verschieben (rastet an Hilfslinien ein, Umschalt = frei) · Ecke ziehen = Größe · Pfeiltasten = Feinschritt · Entf =
            löschen · Strg+Z = rückgängig. Vorschau mit fiktiven Beispieldaten.
          </p>
        </section>

        <aside className="ce-panel" aria-label="Werkzeuge">
          <div className="tabs ce-tabs" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ce-panel-body" role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
            {tab === 'add' && (
              <>
                <h3 className="ce-title">Element hinzufügen</h3>
                <div className="ce-tiles">
                  {SCREEN_PRESETS[layout.kind].map((p) => (
                    <button key={p.id} type="button" className="ce-tile" onClick={() => addElement(p.make)}>
                      <strong>{p.label}</strong>
                      <small>{p.hint}</small>
                    </button>
                  ))}
                </div>
                <div className="ce-section">
                  <h4>Auf dem Bildschirm (antippen zum Bearbeiten)</h4>
                  <Chips elements={layout.elements} selectedId={selectedId} onSelect={select} hiddenFor={isIdle ? undefined : state} />
                </div>
              </>
            )}
            {tab === 'edit' &&
              (selected ? (
                <ScreenElementEditor
                  element={selected}
                  layout={layout}
                  result={result}
                  orgName={orgName}
                  now={now}
                  onChange={updateElement}
                  onRemove={() => removeElement(selected.id)}
                  onDuplicate={() => duplicateElement(selected)}
                  onReorder={(toFront) => reorder(selected, toFront)}
                />
              ) : (
                <div className="ce-empty">
                  <p>Kein Element ausgewählt.</p>
                  <p className="muted small">Ein Element in der Vorschau anklicken – oder unter „Hinzufügen“ ein neues einfügen.</p>
                  <Chips elements={layout.elements} selectedId={selectedId} onSelect={select} hiddenFor={isIdle ? undefined : state} />
                </div>
              ))}
            {tab === 'design' && <DesignTab layout={layout} setLayout={setLayout} setBg={setBg} onImage={onImage} />}
            {tab === 'texts' && !isIdle && (
              <div className="form ce-texts">
                <div className="ce-section">
                  <h4>Datenschutz</h4>
                  <label>
                    Name des Gastes ({'{name}'}, {'{vorname}'}, Foto-Initialen)
                    <select value={layout.nameFormat} onChange={(e) => setLayout({ nameFormat: e.target.value as PresentationLayout['nameFormat'] })}>
                      <option value="full">Vor- und Nachname</option>
                      <option value="rank-last">Dienstgrad und Nachname (ohne Dienstgrad: Vor- und Nachname)</option>
                      <option value="first">Nur Vorname</option>
                      <option value="none">Keinen Namen anzeigen</option>
                    </select>
                  </label>
                </div>
                <div className="ce-section">
                  <h4>Texte je Ergebnis – für die Bausteine „Titel“ und „Meldung“</h4>
                  <p className="muted small">
                    Platzhalter: {PLACEHOLDERS.result.filter((p) => p.key !== '{titel}' && p.key !== '{meldung}').map((p) => `${p.key} = ${p.label}`).join(' · ')}.
                  </p>
                  {TEXT_FIELDS.map((f) => (
                    <label key={f.key}>
                      {f.label}
                      <input
                        value={layout.texts[f.key]}
                        maxLength={160}
                        onChange={(e) => history.set((l) => ({ ...l, texts: { ...l.texts, [f.key]: e.target.value } }), `text:${f.key}`)}
                        onFocus={() => setState(f.key.replace(/(Title|Text)$/, '') as ResultKind)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {tab === 'general' && (
              <div className="form ce-general">
                <div className="ce-section">
                  <h4>Verwendung</h4>
                  {isIdle ? (
                    <label className="checkbox-inline">
                      <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                      Als Ruhebildschirm aktivieren
                    </label>
                  ) : (
                    <>
                      <fieldset className="ce-groups">
                        <legend>Für diese Gruppen verwenden</legend>
                        {groups.map((g) => (
                          <label key={g.id} className="checkbox-inline">
                            <input
                              type="checkbox"
                              checked={assigned.has(g.id)}
                              onChange={(e) => {
                                const next = new Set(assigned);
                                if (e.target.checked) next.add(g.id);
                                else next.delete(g.id);
                                setAssigned(next);
                              }}
                            />
                            <span className="color-dot" style={{ background: g.color }} />
                            {g.name}
                          </label>
                        ))}
                      </fieldset>
                      <label className="checkbox-inline">
                        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                        Standard für alle Gruppen ohne eigene Scan-Anzeige
                      </label>
                      <p className="muted small">Einzelne Karten: auf der Kartenseite. Es gilt Karte vor Gruppe vor Standard.</p>
                    </>
                  )}
                  <p className="muted small">Wird beim Speichern übernommen.</p>
                </div>
                <div className="ce-section">
                  <h4>Vorlagen</h4>
                  <label>
                    Vorlage anwenden (ersetzt die Elemente)
                    <select
                      value=""
                      onChange={(e) => {
                        const t = (isIdle ? IDLE_TEMPLATES : RESULT_TEMPLATES).find((x) => x.id === e.target.value);
                        if (!t || !window.confirm(`Vorlage „${t.label}“ anwenden? Die bisherigen Elemente werden ersetzt.`)) return;
                        setLayout({ elements: t.elements() });
                        setSelectedId(undefined);
                      }}
                    >
                      <option value="">– Vorlage wählen –</option>
                      {(isIdle ? IDLE_TEMPLATES : RESULT_TEMPLATES).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Chips({ elements, selectedId, onSelect, hiddenFor }: { elements: LayoutElement[]; selectedId?: string; onSelect: (id: string) => void; hiddenFor?: ResultKind }) {
  if (elements.length === 0) return <p className="muted small">Noch keine Elemente.</p>;
  return (
    <ul className="element-list" aria-label="Elemente auf dem Bildschirm">
      {[...elements].reverse().map((e) => (
        <li key={e.id}>
          <button type="button" className={e.id === selectedId ? 'chip active' : 'chip'} onClick={() => onSelect(e.id)}>
            {screenElementLabel(e)}
            {hiddenFor && !isVisibleFor(e, hiddenFor) && <span className="muted"> (hier ausgeblendet)</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Prozentfeld – übernimmt den Wert beim Verlassen bzw. Enter. */
function PctField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(pctText(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(pctText(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = Number(text.replace(',', '.'));
    if (text.trim() !== '' && Number.isFinite(n)) onChange(n);
    else setText(pctText(value));
  };
  return (
    <label>
      <span>{label}</span>
      <input inputMode="decimal" value={text} onFocus={() => setEditing(true)} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  );
}

function ScreenElementEditor({
  element,
  layout,
  result,
  orgName,
  now,
  onChange,
  onRemove,
  onDuplicate,
  onReorder,
}: {
  element: LayoutElement;
  layout: PresentationLayout;
  result: ReturnType<typeof sampleResult> | null;
  orgName: string;
  now: Date;
  onChange: (e: LayoutElement, key?: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onReorder: (toFront: boolean) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const kind = layout.kind;
  const set = (patch: Partial<LayoutElement>, key?: string) => onChange({ ...element, ...patch }, key);
  const hasFont = element.type !== 'photo' && element.type !== 'logo';
  const preview = element.type === 'text' ? (kind === 'idle' ? idleText(element.text ?? '', orgName, now) : (result?.texts[element.id] ?? '')) : null;
  const toggleShow = (k: ResultKind, on: boolean) => {
    const current = RESULT_STATES.map((s) => s.value).filter((v) => isVisibleFor(element, v));
    const next = on ? [...current, k] : current.filter((v) => v !== k);
    if (next.length === 0) return; // mindestens ein Ergebnis
    set({ showOn: next.length === RESULT_STATES.length ? undefined : next });
  };
  const insert = (key: string) => {
    const ta = textRef.current;
    const text = element.text ?? '';
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const needsSpace = start > 0 && !/\s$/.test(text.slice(0, start));
    set({ text: `${text.slice(0, start)}${needsSpace ? ' ' : ''}${key}${text.slice(end)}` });
    requestAnimationFrame(() => ta?.focus());
  };

  return (
    <div className="element-editor ce-edit" aria-label="Ausgewähltes Element">
      <div className="ce-edit-head">
        <h3 className="ce-title">
          {TYPE_LABEL[element.type]}
          {element.type === 'text' && ` „${screenElementLabel(element)}“`}
        </h3>
        <div className="button-row">
          <button type="button" className="btn btn-small" onClick={onDuplicate}>
            Duplizieren
          </button>
          <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>
            Löschen
          </button>
        </div>
      </div>

      {element.type === 'text' && (
        <div className="ce-section">
          <label htmlFor={`el-text-${element.id}`}>Inhalt</label>
          <textarea id={`el-text-${element.id}`} ref={textRef} rows={2} maxLength={300} value={element.text ?? ''} onChange={(e) => set({ text: e.target.value }, `text:${element.id}`)} />
          <div className="ce-insert" aria-label="Einfügen">
            <span className="muted small">Einfügen:</span>
            {PLACEHOLDERS[kind].map((p) => (
              <button key={p.key} type="button" className="chip chip-small" onClick={() => insert(p.key)} title={p.key}>
                + {p.key === '{titel}' ? 'Titel' : p.key === '{meldung}' ? 'Meldung' : p.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            Ergebnis im Beispiel: <strong>{preview || '(leer)'}</strong>
          </p>
          {kind === 'result' && (
            <label className="checkbox-inline">
              <input type="checkbox" checked={Boolean(element.withIcon)} onChange={(e) => set({ withIcon: e.target.checked })} />
              Ergebnissymbol (✓ / ✕) davor
            </label>
          )}
        </div>
      )}

      {hasFont && (
        <div className="ce-section">
          <h4>Schrift</h4>
          <label className="ce-range">
            <span>Größe</span>
            <input type="range" min={1} max={40} step={0.5} value={element.size} onChange={(e) => set({ size: Number(e.target.value) }, `size:${element.id}`)} aria-label="Schriftgröße" />
            <strong>{pctText(element.size)} %</strong>
          </label>
          <div className="button-row">
            <Segmented
              label="Ausrichtung"
              small
              value={element.align}
              options={[
                { value: 'left', label: 'Links' },
                { value: 'center', label: 'Mitte' },
                { value: 'right', label: 'Rechts' },
              ]}
              onChange={(align) => set({ align })}
            />
            <button type="button" className={element.bold ? 'btn btn-small active' : 'btn btn-small'} aria-pressed={element.bold} onClick={() => set({ bold: !element.bold })}>
              <strong>F</strong> fett
            </button>
          </div>
          <div className="ce-colors">
            <Segmented
              label="Farbe"
              small
              value={element.color ? 'custom' : 'default'}
              options={[
                { value: 'default', label: 'Schriftfarbe des Layouts' },
                { value: 'custom', label: 'Eigene' },
              ]}
              onChange={(v) => set({ color: v === 'custom' ? (element.color ?? '#facc15') : undefined })}
            />
            {element.color && <input type="color" value={element.color} onChange={(e) => set({ color: e.target.value }, `color:${element.id}`)} aria-label="Farbe des Elements" />}
          </div>
        </div>
      )}

      <div className="ce-section">
        <h4>Position und Größe (% des Bildschirms)</h4>
        <div className="ce-grid">
          <PctField label="links" value={element.x} onChange={(v) => onChange(moveElement(element, v, element.y))} />
          <PctField label="oben" value={element.y} onChange={(v) => onChange(moveElement(element, element.x, v))} />
          <PctField label="Breite" value={element.w} onChange={(v) => onChange(moveElement({ ...element, w: Math.min(100, Math.max(5, v)) }, element.x, element.y))} />
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-small" onClick={() => onChange(moveElement(element, (100 - element.w) / 2, element.y))}>
            ⇔ mittig
          </button>
          <button type="button" className="btn btn-small" onClick={() => onReorder(true)}>
            nach vorne
          </button>
          <button type="button" className="btn btn-small" onClick={() => onReorder(false)}>
            nach hinten
          </button>
        </div>
      </div>

      {kind === 'result' && (
        <fieldset className="ce-section element-show">
          <legend>Anzeigen bei</legend>
          {RESULT_STATES.map((s) => (
            <label key={s.value} className="checkbox-inline">
              <input type="checkbox" checked={isVisibleFor(element, s.value)} onChange={(e) => toggleShow(s.value, e.target.checked)} /> {s.label}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

function DesignTab({
  layout,
  setLayout,
  setBg,
  onImage,
}: {
  layout: PresentationLayout;
  setLayout: (patch: Partial<PresentationLayout>, key?: string) => void;
  setBg: (patch: Partial<PresentationLayout['background']>, key?: string) => void;
  onImage: (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => void;
}) {
  const bg = layout.background;
  const isIdle = layout.kind === 'idle';
  return (
    <div className="form ce-design">
      <div className="ce-section">
        <h4>Hintergrund</h4>
        <Segmented
          label="Hintergrundart"
          small
          value={bg.kind}
          options={[
            { value: 'color', label: 'Einfarbig' },
            { value: 'gradient', label: 'Farbverlauf' },
            { value: 'image', label: 'Bild' },
          ]}
          onChange={(kind) => setBg({ kind })}
        />
        <div className="ce-colors">
          <label className="inline-select">
            {bg.kind === 'gradient' ? 'Farbe außen' : 'Farbe'}
            <input type="color" value={bg.color} onChange={(e) => setBg({ color: e.target.value }, 'bg-color')} />
          </label>
          {bg.kind === 'gradient' && (
            <label className="inline-select">
              Farbe innen
              <input type="color" value={bg.color2} onChange={(e) => setBg({ color2: e.target.value }, 'bg-color2')} />
            </label>
          )}
        </div>
        {bg.kind === 'image' && (
          <div className="subform">
            <label htmlFor="layout-bg">Hintergrundbild (wird verkleinert und nur auf diesem Gerät gespeichert)</label>
            <input id="layout-bg" type="file" accept="image/*" onChange={(e) => onImage(e, 'background')} />
            {bg.image ? (
              <>
                <label className="ce-range">
                  <span>Abdunkeln</span>
                  <input type="range" min={0} max={70} step={5} value={Math.round(bg.dim * 100)} onChange={(e) => setBg({ dim: Number(e.target.value) / 100 }, 'bg-dim')} aria-label="Abdunkeln" />
                  <strong>{Math.round(bg.dim * 100)} %</strong>
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
            <label className="checkbox-inline">
              <input type="radio" name="result-bg" checked={layout.resultBackground === 'outcome'} onChange={() => setLayout({ resultBackground: 'outcome' })} />
              Ergebnisfarbe als Hintergrund (grün / blau / rot – am deutlichsten)
            </label>
            <label className="checkbox-inline">
              <input type="radio" name="result-bg" checked={layout.resultBackground === 'custom'} onChange={() => setLayout({ resultBackground: 'custom' })} />
              Eigener Hintergrund mit farbigem Streifen oben und unten
            </label>
          </>
        )}
      </div>
      <div className="ce-section">
        <h4>Schriftfarbe</h4>
        <Segmented
          label="Schriftfarbe"
          small
          value={layout.textColor}
          options={[
            { value: 'light', label: 'Hell (dunkler Hintergrund)' },
            { value: 'dark', label: 'Dunkel (heller Hintergrund)' },
          ]}
          onChange={(textColor) => setLayout({ textColor })}
        />
      </div>
      <div className="ce-section">
        <h4>Logo</h4>
        <input type="file" accept="image/*" aria-label="Logo wählen" onChange={(e) => onImage(e, 'logo')} />
        {layout.logo && (
          <div className="button-row">
            <img src={layout.logo} alt="Logo" className="layout-logo-preview" />
            <button type="button" className="btn btn-small" onClick={() => setLayout({ logo: undefined })}>
              Logo entfernen
            </button>
          </div>
        )}
        <p className="muted small">Platzieren mit dem Baustein „Logo“.</p>
      </div>
    </div>
  );
}
