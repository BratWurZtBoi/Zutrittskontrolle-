import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { CardView } from '../components/CardView';
import { cardLayoutUsage, createCardLayout, deleteCardLayout, duplicateCardLayout, listCardLayouts, saveCardLayout } from '../db/cardLayouts';
import { newId } from '../db/db';
import { listGroups } from '../db/groups';
import { placeholderAvatar } from '../db/seed';
import { saveSettings } from '../db/settings';
import {
  CARD_ELEMENT_TYPES,
  CARD_MM,
  CARD_PLACEHOLDERS,
  CARD_TEMPLATES,
  STANDARD_CARD_LAYOUT,
  fitElement,
  minWidth,
  moveCardElement,
  newCardElement,
  type CardColor,
  type CardData,
  type CardElement,
  type CardElementType,
  type CardLayout,
  type CardShowWhen,
} from '../domain/cardLayout';
import type { Group } from '../domain/types';
import { useSettings } from '../hooks/useSettings';
import { fileToScaledDataUrl } from '../lib/image';
import { SettingsShell } from './settings/SettingsShell';

/** Fester Beispiel-Code für die Vorschau (kein echter Ausweis). */
const SAMPLE_TOKEN = 'BEISPIELKARTEVORSCHAU23456';

const TYPE_LABEL: Record<CardElementType, string> = { text: 'Textfeld', qr: 'QR-Code', photo: 'Foto', logo: 'Logo', band: 'Farbfläche' };
const SHOW_LABEL: Record<CardShowWhen, string> = {
  always: 'immer',
  holder: 'nur mit Person (Name/Foto)',
  anonymous: 'nur ohne Person (anonyme Karte)',
};

function elementLabel(e: CardElement): string {
  if (e.type !== 'text') return TYPE_LABEL[e.type];
  const t = (e.text ?? '').replace(/\s+/g, ' ').trim();
  return t ? (t.length > 24 ? `${t.slice(0, 23)}…` : t) : 'Textfeld (leer)';
}

/** Fiktive Beispieldaten für die Vorschau. */
function sampleData(group: Pick<Group, 'name' | 'color'>, orgName: string, withHolder: boolean): CardData {
  return {
    number: 'M-007',
    groupName: group.name,
    groupColor: group.color,
    orgName,
    validUntil: '2030-12-31',
    holder: withHolder ? { firstName: 'Erika', lastName: 'Musterfrau', company: 'Vertrieb', photo: placeholderAvatar('Erika', 'Musterfrau', 2) } : undefined,
  };
}

const FALLBACK_GROUP = { id: '', name: 'Bestandspersonal', color: '#2563eb' };

export function CardLayoutsPage() {
  const settings = useSettings();
  const layouts = useLiveQuery(listCardLayouts, [], [STANDARD_CARD_LAYOUT]);
  const usage = useLiveQuery(cardLayoutUsage, [], new Map<string, string[]>());
  const groups = useLiveQuery(listGroups, [], []);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editLayout = layouts.find((l) => l.id === editing && !l.builtIn);
  const sampleGroup = groups[0] ?? FALLBACK_GROUP;
  const active = layouts.some((l) => l.id === settings.defaultCardLayoutId) ? settings.defaultCardLayoutId : STANDARD_CARD_LAYOUT.id;

  if (editLayout) {
    return (
      <SettingsShell title="Kartenlayout gestalten" wide>
        <CardLayoutEditor key={editLayout.id} initial={editLayout} groups={groups} orgName={settings.orgName} onClose={() => setEditing(null)} />
      </SettingsShell>
    );
  }

  const remove = async (l: CardLayout) => {
    const use = usage.get(l.id);
    const where = use?.length ? ` Es wird von ${use.map((g) => `„${g}“`).join(', ')} verwendet – dort gilt danach wieder das Standardlayout.` : '';
    if (!window.confirm(`Kartenlayout „${l.name}“ löschen?${where}`)) return;
    await deleteCardLayout(l.id);
    setMessage(`Kartenlayout „${l.name}“ gelöscht.`);
  };

  return (
    <SettingsShell
      title="Kartenlayout"
      wide
      actions={
        <button type="button" className="btn btn-primary" onClick={() => void createCardLayout().then((l) => setEditing(l.id))}>
          + Neues Kartenlayout
        </button>
      }
    >
      <p className="muted">
        Aussehen der gedruckten Karten (85,6 × 54 mm, quer oder hoch). Textfelder, QR-Code, Foto, Logo und Farbflächen lassen
        sich frei platzieren. Zuweisen je Gruppe unter <Link to="/einstellungen/gruppen">Gruppen verwalten</Link>; Gruppen ohne
        eigenes Layout nutzen das Standardlayout. Name und Foto erscheinen nur bei Gruppen mit „Name und Foto auf die Karte
        drucken“.
      </p>
      {message && <p className="form-success">{message}</p>}
      <ul className="layout-list">
        {layouts.map((l) => {
          const isActive = l.id === active;
          return (
            <li key={l.id} className="card layout-row">
              <div className="card-thumbs">
                <CardView layout={l} data={sampleData(sampleGroup, settings.orgName, true)} token={SAMPLE_TOKEN} large />
              </div>
              <div className="layout-row-main">
                <h3>
                  {l.name} {l.builtIn && <span className="badge">mitgeliefert</span>}{' '}
                  {isActive && <span className="badge badge-active">Standard für alle Gruppen ohne Zuweisung</span>}
                </h3>
                <p className="muted small">
                  {l.orientation === 'portrait' ? 'Hochformat' : 'Querformat'} ·{' '}
                  {usage.get(l.id)?.length ? `Gruppen: ${usage.get(l.id)!.join(', ')}` : 'keiner Gruppe zugewiesen'}
                </p>
                <div className="button-row">
                  {!l.builtIn && (
                    <button type="button" className="btn btn-primary" onClick={() => setEditing(l.id)}>
                      Bearbeiten
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => void duplicateCardLayout(l.id).then((c) => setEditing(c.id))}>
                    Kopieren
                  </button>
                  {!isActive && (
                    <button type="button" className="btn" onClick={() => void saveSettings({ defaultCardLayoutId: l.id })}>
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
    </SettingsShell>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

interface EditorProps {
  initial: CardLayout;
  groups: Group[];
  orgName: string;
  onClose: () => void;
}

function CardLayoutEditor({ initial, groups, orgName, onClose }: EditorProps) {
  const [layout, setLayout] = useState<CardLayout>(initial);
  const [selectedId, setSelectedId] = useState<string | undefined>(initial.elements.find((e) => e.type !== 'band')?.id);
  const [withHolder, setWithHolder] = useState(true);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const group = groups.find((g) => g.id === groupId) ?? groups[0] ?? FALLBACK_GROUP;

  const changed = () => {
    setDirty(true);
    setJustSaved(false);
  };
  const set = (patch: Partial<CardLayout>) => {
    setLayout((l) => ({ ...l, ...patch }));
    changed();
  };
  const updateElement = (element: CardElement) => {
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === element.id ? element : e)) }));
    changed();
  };
  const addElement = (type: CardElementType) => {
    const element = newCardElement(type, newId(), layout.orientation);
    set({ elements: [...layout.elements, element] });
    setSelectedId(element.id);
  };
  const removeElement = (id: string) => {
    set({ elements: layout.elements.filter((e) => e.id !== id) });
    setSelectedId(undefined);
  };
  const applyTemplate = (id: string) => {
    const t = CARD_TEMPLATES.find((x) => x.id === id);
    if (!t || !window.confirm(`Vorlage „${t.label}“ anwenden? Die bisherigen Elemente werden ersetzt.`)) return;
    const elements = t.elements();
    set({ orientation: t.orientation, elements });
    setSelectedId(elements.find((e) => e.type !== 'band')?.id);
  };
  const setOrientation = (orientation: CardLayout['orientation']) =>
    set({ orientation, elements: layout.elements.map((e) => fitElement(e, orientation)) });

  const onImage = async (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      if (target === 'background') {
        set({ background: { ...layout.background, image: await fileToScaledDataUrl(file, { maxWidth: 1200, maxHeight: 1200, type: 'image/jpeg', quality: 0.85 }) } });
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
      await saveCardLayout(layout);
      setDirty(false);
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const selected = layout.elements.find((e) => e.id === selectedId);
  const bgMode = layout.background.color === 'group' ? 'group' : layout.background.color.toLowerCase() === '#ffffff' ? 'white' : 'custom';

  return (
    <div className="layout-editor card-editor">
      <div className="layout-preview">
        <div className="button-row">
          <div className="segmented segmented-light segmented-small" role="tablist" aria-label="Vorschau">
            <button type="button" role="tab" aria-selected={withHolder} className={withHolder ? 'active' : ''} onClick={() => setWithHolder(true)}>
              Mit Person
            </button>
            <button type="button" role="tab" aria-selected={!withHolder} className={withHolder ? '' : 'active'} onClick={() => setWithHolder(false)}>
              Ohne Person (anonym)
            </button>
          </div>
          {groups.length > 1 && (
            <label className="inline-select">
              Gruppe
              <select value={group.id} onChange={(e) => setGroupId(e.target.value)} aria-label="Gruppe für die Vorschau">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <CardView
          layout={layout}
          data={sampleData(group, orgName, withHolder)}
          token={SAMPLE_TOKEN}
          large
          edit={{ selectedId, onSelect: setSelectedId, onChange: updateElement }}
        />
        <p className="muted small">
          Elemente anklicken und ziehen, Feinschritte mit den Pfeiltasten. Vorschau mit fiktiven Beispieldaten – gedruckt wird in
          Originalgröße {layout.orientation === 'portrait' ? '54 × 85,6' : '85,6 × 54'} mm.
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
          <ul className="element-list" aria-label="Elemente auf der Karte">
            {layout.elements.map((e) => (
              <li key={e.id}>
                <button type="button" className={e.id === selectedId ? 'chip active' : 'chip'} onClick={() => setSelectedId(e.id)}>
                  {elementLabel(e)}
                </button>
              </li>
            ))}
          </ul>
          <div className="button-row add-elements" aria-label="Element hinzufügen">
            {CARD_ELEMENT_TYPES.map((t) => (
              <button key={t.type} type="button" className="btn btn-small" onClick={() => addElement(t.type)}>
                + {t.label}
              </button>
            ))}
          </div>
          {selected ? (
            <CardElementEditor
              element={selected}
              orientation={layout.orientation}
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
              {CARD_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select value={layout.orientation} onChange={(e) => setOrientation(e.target.value as CardLayout['orientation'])}>
              <option value="landscape">Querformat (85,6 × 54 mm)</option>
              <option value="portrait">Hochformat (54 × 85,6 mm)</option>
            </select>
          </label>
          <fieldset>
            <legend>Hintergrund und Schrift</legend>
            <div className="form-grid">
              <label>
                Hintergrund
                <select
                  value={bgMode}
                  onChange={(e) =>
                    set({ background: { ...layout.background, color: e.target.value === 'group' ? 'group' : e.target.value === 'white' ? '#ffffff' : '#f1f5f9' } })
                  }
                >
                  <option value="white">Weiß</option>
                  <option value="group">Gruppenfarbe</option>
                  <option value="custom">Eigene Farbe</option>
                </select>
              </label>
              {bgMode === 'custom' && (
                <label>
                  Hintergrundfarbe
                  <input type="color" value={layout.background.color} onChange={(e) => set({ background: { ...layout.background, color: e.target.value } })} />
                </label>
              )}
              <label>
                Schriftfarbe
                <input type="color" value={layout.textColor} onChange={(e) => set({ textColor: e.target.value })} />
              </label>
            </div>
            <label htmlFor="card-bg-image">Hintergrundbild (optional)</label>
            <input id="card-bg-image" type="file" accept="image/*" onChange={(e) => void onImage(e, 'background')} />
            {layout.background.image && (
              <button type="button" className="btn btn-small" onClick={() => set({ background: { ...layout.background, image: undefined } })}>
                Hintergrundbild entfernen
              </button>
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
          <p className="muted small">
            Platzhalter für Textfelder: {CARD_PLACEHOLDERS.map((p) => `${p.key} = ${p.label}`).join(' · ')}. Texte werden
            unverschlüsselt gespeichert – Namen daher nur über Platzhalter.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ein Element bearbeiten
// ---------------------------------------------------------------------------

interface ElementEditorProps {
  element: CardElement;
  orientation: CardLayout['orientation'];
  onChange: (e: CardElement) => void;
  onRemove: () => void;
}

function colorMode(c: CardColor | undefined): 'default' | 'group' | 'on-group' | 'custom' {
  if (!c) return 'default';
  if (c === 'group' || c === 'on-group') return c;
  return 'custom';
}

function CardElementEditor({ element, orientation, onChange, onRemove }: ElementEditorProps) {
  const mm = CARD_MM[orientation];
  const set = (patch: Partial<CardElement>) => onChange(fitElement({ ...element, ...patch }, orientation));
  const isText = element.type === 'text';
  const isBand = element.type === 'band';
  const mode = colorMode(element.color ?? (isBand ? 'group' : undefined));
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  const number = (v: string, fallback: number) => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

  return (
    <div className="element-editor" aria-label="Ausgewähltes Element">
      <h4>{TYPE_LABEL[element.type]}</h4>
      {isText && (
        <>
          <label htmlFor={`card-text-${element.id}`}>Text</label>
          <textarea id={`card-text-${element.id}`} rows={2} maxLength={200} value={element.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          <p className="muted small">Platzhalter: {CARD_PLACEHOLDERS.map((p) => p.key).join(' ')}</p>
          <label className="checkbox-inline">
            <input type="checkbox" checked={Boolean(element.hideIfEmpty)} onChange={(e) => set({ hideIfEmpty: e.target.checked })} /> ausblenden, wenn ein
            Platzhalter leer ist (z. B. „gültig bis …“ ohne Datum)
          </label>
        </>
      )}
      {element.type === 'qr' && <p className="hint">Mindestens {fmt((minWidth('qr', orientation) / 100) * mm.w)} mm, damit Webcam und Handy ihn sicher lesen.</p>}
      <div className="element-grid">
        {isText && (
          <label>
            Schriftgröße: {fmt((element.size / 100) * mm.h)} mm
            <input type="range" min={2} max={25} step={0.1} value={element.size} onChange={(e) => set({ size: Number(e.target.value) })} />
          </label>
        )}
        <label>
          Breite: {fmt((element.w / 100) * mm.w)} mm
          <input type="range" min={minWidth(element.type, orientation)} max={100} step={0.5} value={element.w} onChange={(e) => set({ w: Number(e.target.value) })} />
        </label>
        {isBand && (
          <label>
            Höhe: {fmt(((element.h ?? 6) / 100) * mm.h)} mm
            <input type="range" min={1} max={100} step={0.5} value={element.h ?? 6} onChange={(e) => set({ h: Number(e.target.value) })} />
          </label>
        )}
        <label>
          Abstand links (%)
          <input type="number" min={0} max={100} step={0.5} value={element.x} onChange={(e) => onChange(moveCardElement(element, number(e.target.value, element.x), element.y, orientation))} />
        </label>
        <label>
          Abstand oben (%)
          <input type="number" min={0} max={100} step={0.5} value={element.y} onChange={(e) => onChange(moveCardElement(element, element.x, number(e.target.value, element.y), orientation))} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="btn btn-small" onClick={() => onChange(moveCardElement(element, (100 - element.w) / 2, element.y, orientation))}>
          Waagerecht zentrieren
        </button>
        {isText && (
          <div className="segmented segmented-light segmented-small" role="radiogroup" aria-label="Ausrichtung">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={element.align === a} className={element.align === a ? 'active' : ''} onClick={() => set({ align: a })}>
                {a === 'left' ? 'Links' : a === 'center' ? 'Mitte' : 'Rechts'}
              </button>
            ))}
          </div>
        )}
        {isText && (
          <label className="checkbox-inline">
            <input type="checkbox" checked={element.bold} onChange={(e) => set({ bold: e.target.checked })} /> fett
          </label>
        )}
      </div>
      {(isText || isBand) && (
        <div className="button-row">
          <label className="inline-select">
            {isBand ? 'Füllung' : 'Farbe'}
            <select
              value={mode}
              onChange={(e) => {
                const v = e.target.value;
                set({ color: v === 'default' ? undefined : v === 'custom' ? '#0f172a' : (v as CardColor) });
              }}
            >
              {!isBand && <option value="default">Schriftfarbe des Layouts</option>}
              <option value="group">Gruppenfarbe</option>
              <option value="on-group">Schwarz/Weiß passend zur Gruppenfarbe</option>
              <option value="custom">Eigene Farbe</option>
            </select>
          </label>
          {mode === 'custom' && element.color && (
            <input type="color" value={element.color} onChange={(e) => set({ color: e.target.value })} aria-label="Eigene Farbe des Elements" />
          )}
        </div>
      )}
      <label className="inline-select">
        Anzeigen
        <select value={element.showWhen ?? 'always'} onChange={(e) => set({ showWhen: e.target.value as CardShowWhen })}>
          {(Object.keys(SHOW_LABEL) as CardShowWhen[]).map((k) => (
            <option key={k} value={k}>
              {SHOW_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>
        Element entfernen
      </button>
    </div>
  );
}
