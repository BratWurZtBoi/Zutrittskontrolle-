import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CardView } from '../components/CardView';
import { Segmented } from '../components/Segmented';
import { saveCardLayout, setCardLayoutGroups } from '../db/cardLayouts';
import { newId } from '../db/db';
import { placeholderAvatar } from '../db/seed';
import { saveSettings } from '../db/settings';
import {
  CARD_FORMATS,
  CARD_PLACEHOLDERS,
  CARD_PRESETS,
  CARD_TEMPLATES,
  CUSTOM_SIZE_LIMITS,
  STANDARD_CARD_LAYOUT_ID,
  cardSize,
  cardText,
  cardValues,
  defaultBackSide,
  fitElement,
  fitSide,
  formatLabel,
  friendlyText,
  minWidth,
  moveCardElement,
  sideOf,
  withSide,
  type CardColor,
  type CardData,
  type CardElement,
  type CardElementType,
  type CardFace,
  type CardFormat,
  type CardLayout,
  type CardShowWhen,
  type CardSide,
  type CardSize,
} from '../domain/cardLayout';
import type { Group } from '../domain/types';
import { useEditorShortcuts, useUnsavedGuard } from '../hooks/useEditorShortcuts';
import { useHistory } from '../hooks/useHistory';
import { fileToScaledDataUrl } from '../lib/image';
import { confirmLeave, setUnsavedChanges } from '../lib/unsavedChanges';

/** Fester Beispiel-Code für die Vorschau (kein echter Ausweis). */
export const SAMPLE_TOKEN = 'BEISPIELKARTEVORSCHAU23456';

const TYPE_LABEL: Record<CardElementType, string> = { text: 'Textfeld', qr: 'QR-Code', photo: 'Foto', logo: 'Logo', band: 'Farbfläche' };
const SHOW_OPTIONS: { value: CardShowWhen; label: string }[] = [
  { value: 'always', label: 'immer' },
  { value: 'holder', label: 'nur mit Person' },
  { value: 'anonymous', label: 'nur ohne Person' },
];
const FACE_LABEL: Record<CardFace, string> = { front: 'Vorderseite', back: 'Rückseite' };

type Tab = 'add' | 'edit' | 'design' | 'general';
const TABS: { id: Tab; label: string }[] = [
  { id: 'add', label: 'Hinzufügen' },
  { id: 'edit', label: 'Bearbeiten' },
  { id: 'design', label: 'Design' },
  { id: 'general', label: 'Allgemein' },
];

/** Kurzbezeichnung eines Elements; Platzhalter werden mit ihrer Bezeichnung gezeigt. */
export function elementLabel(e: CardElement, placeholders?: { key: string; label: string }[]): string {
  if (e.type !== 'text') return TYPE_LABEL[e.type];
  const raw = e.text ?? '';
  const friendly = placeholders && placeholders !== CARD_PLACEHOLDERS
    ? raw.replace(/\{(\w+)\}/g, (m, key: string) => placeholders.find((p) => p.key === `{${key.toLowerCase()}}`)?.label ?? m)
    : friendlyText(raw);
  const t = friendly.replace(/\s+/g, ' ').trim();
  return t ? (t.length > 26 ? `${t.slice(0, 25)}…` : t) : 'Textfeld (leer)';
}

/** Fiktive Beispieldaten für die Vorschau. */
export function sampleData(group: Pick<Group, 'name' | 'color'>, orgName: string, withHolder: boolean): CardData {
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
const mmText = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');
const parseNum = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
};

type FormatDef = { id: Exclude<CardFormat, 'custom'>; label: string; short: number; long: number };

/**
 * Was der Editor gestaltet: Kartenlayouts (Standard) oder Einladungen (Veranstaltungen).
 * Gleiche Bedienung, aber eigene Formate, Bausteine, Platzhalter und Vorschau.
 */
export interface LayoutEditorConfig {
  kind: 'card' | 'invitation';
  closeLabel: string;
  nameLabel: string;
  unsavedText: string;
  formats: FormatDef[];
  allowCustomSize: boolean;
  allowBack: boolean;
  /** Vorschau mit/ohne Person, Vorschau-Gruppe, „Anzeigen“ je Element, Gruppenzuordnung. */
  cardFeatures: boolean;
  presets: typeof CARD_PRESETS;
  placeholders: { key: string; label: string }[];
  templates: typeof CARD_TEMPLATES;
  /** Bezeichnung für die Farbe „group“ */
  colorLabel: string;
  formatHint: (format: CardFormat) => string;
  /** Feste Vorschau (Einladungen): Farben, Platzhalter-Werte, QR-Art. */
  preview?: { data: CardData; values: Record<string, string>; qrKind: 'card' | 'guest' };
  /** Eigenes Speichern (Einladungen); sonst Kartenlayout + Gruppen. */
  onSave?: (layout: CardLayout) => Promise<void>;
}

export const CARD_EDITOR: LayoutEditorConfig = {
  kind: 'card',
  closeLabel: '← Kartenlayouts',
  nameLabel: 'Name des Kartenlayouts',
  unsavedText: 'Das Kartenlayout hat ungespeicherte Änderungen. Trotzdem verlassen?',
  formats: CARD_FORMATS,
  allowCustomSize: true,
  allowBack: true,
  cardFeatures: true,
  presets: CARD_PRESETS,
  placeholders: CARD_PLACEHOLDERS,
  templates: CARD_TEMPLATES,
  colorLabel: 'Gruppenfarbe',
  formatHint: (format) =>
    format === 'id1'
      ? 'Scheckkarte: passt in Kartendrucker und Kartenhalter.'
      : 'Größere Formate werden auf A4-Bögen gedruckt und ausgeschnitten (z. B. für Ausweishüllen).',
};

interface Props {
  initial: CardLayout;
  groups: Group[];
  orgName: string;
  defaultLayoutId: string;
  onClose: () => void;
  config?: LayoutEditorConfig;
}

/**
 * Kartenlayout gestalten: oben Name, Format, Rückgängig und Speichern; links die Karte
 * (Vorder-/Rückseite) zum Anklicken, Ziehen und Größe ändern; rechts Reiter.
 */
export function CardLayoutEditor({ initial, groups, orgName, defaultLayoutId, onClose, config = CARD_EDITOR }: Props) {
  const history = useHistory<CardLayout>(initial);
  const layout = history.value;
  const [saved, setSaved] = useState(initial);
  const initialGroups = useMemo(() => new Set(groups.filter((g) => g.cardLayoutId === initial.id).map((g) => g.id)), [groups, initial.id]);
  const [savedGroups, setSavedGroups] = useState(initialGroups);
  const [assigned, setAssigned] = useState(initialGroups);
  const [savedDefault, setSavedDefault] = useState(defaultLayoutId === initial.id);
  const [isDefault, setIsDefault] = useState(savedDefault);
  const [face, setFace] = useState<CardFace>('front');
  const [tab, setTab] = useState<Tab>('add');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [withHolder, setWithHolder] = useState(true);
  const [previewGroupId, setPreviewGroupId] = useState(groups[0]?.id ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const added = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const size = cardSize(layout);
  const side = sideOf(layout, face);
  const selected = side.elements.find((e) => e.id === selectedId);
  const group = groups.find((g) => g.id === previewGroupId) ?? groups[0] ?? FALLBACK_GROUP;
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const dirty = layout !== saved || (config.cardFeatures && (!sameSet(assigned, savedGroups) || isDefault !== savedDefault));
  const previewData = config.preview?.data ?? sampleData(group, orgName, withHolder);
  const previewValues = config.preview?.values;

  useUnsavedGuard(dirty, rootRef, config.unsavedText);

  const updateSide = (fn: (s: CardSide) => CardSide, key?: string) => history.set((l) => withSide(l, face, fn(sideOf(l, face))), key);
  const updateElement = (element: CardElement, key = `el:${element.id}`) =>
    updateSide((s) => ({ ...s, elements: s.elements.map((e) => (e.id === element.id ? element : e)) }), key);
  const setLayout = (patch: Partial<CardLayout>, key?: string) => history.set((l) => ({ ...l, ...patch }), key);

  const select = (id: string | undefined) => {
    setSelectedId(id);
    if (id) setTab('edit');
  };
  const addElement = (make: (id: string, size: CardSize) => CardElement) => {
    const base = make(newId(), size);
    const offset = (added.current++ % 5) * 4;
    const element = fitElement({ ...base, y: base.y + (base.type === 'band' ? 0 : offset) }, size);
    updateSide((s) => ({ ...s, elements: [...s.elements, element] }));
    select(element.id);
  };
  const removeElement = (id: string) => {
    updateSide((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));
    setSelectedId(undefined);
  };
  const duplicateElement = (e: CardElement) => {
    const copy = fitElement({ ...e, id: newId(), x: e.x + 3, y: e.y + 3 }, size);
    updateSide((s) => ({ ...s, elements: [...s.elements, copy] }));
    select(copy.id);
  };
  const reorder = (e: CardElement, toFront: boolean) =>
    updateSide((s) => {
      const rest = s.elements.filter((x) => x.id !== e.id);
      return { ...s, elements: toFront ? [...rest, e] : [e, ...rest] };
    });

  const changeFormat = (next: Pick<CardLayout, 'format' | 'orientation' | 'customSize'>) => {
    // Wechsel Hoch ↔ Quer: Positionen in % passen dann meist nicht mehr – passende Vorlage anbieten
    const flipped = next.orientation !== layout.orientation;
    const template = flipped ? config.templates.find((t) => t.orientation === next.orientation) : undefined;
    const useTemplate =
      template !== undefined &&
      window.confirm(
        `Auf ${next.orientation === 'portrait' ? 'Hochformat' : 'Querformat'} umgestellt. Die Vorderseite mit der Vorlage „${template.label}“ neu aufbauen?\n\nOK = Vorlage übernehmen (bisherige Elemente der Vorderseite werden ersetzt)\nAbbrechen = Elemente behalten und selbst anordnen`,
      );
    history.set((l) => {
      const merged = { ...l, ...next };
      const nextSize = cardSize(merged);
      const front = useTemplate ? { background: l.background, elements: template!.elements() } : sideOf(l, 'front');
      return { ...merged, elements: fitSide(front, nextSize).elements, back: l.back ? fitSide(l.back, nextSize) : undefined };
    });
    if (useTemplate) setSelectedId(undefined);
  };

  const enableBack = (on: boolean) => {
    if (on) {
      history.set((l) => ({ ...l, back: l.back ?? fitSide(defaultBackSide(), cardSize(l)) }));
      setFace('back');
      setSelectedId(undefined);
    } else if (window.confirm('Rückseite entfernen? Ihre Elemente werden gelöscht.')) {
      history.set((l) => ({ ...l, back: undefined }));
      setFace('front');
      setSelectedId(undefined);
    }
  };

  const save = async () => {
    setMessage(null);
    try {
      if (config.onSave) {
        await config.onSave(layout);
      } else {
        await saveCardLayout(layout);
        if (!sameSet(assigned, savedGroups)) await setCardLayoutGroups(layout.id, assigned);
        if (isDefault !== savedDefault) await saveSettings({ defaultCardLayoutId: isDefault ? layout.id : STANDARD_CARD_LAYOUT_ID });
      }
      setSaved(layout);
      setSavedGroups(new Set(assigned));
      setSavedDefault(isDefault);
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

  useEditorShortcuts({
    undo: history.undo,
    redo: history.redo,
    remove: selectedId ? () => removeElement(selectedId) : undefined,
    deselect: () => setSelectedId(undefined),
  });

  const onImage = async (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      if (target === 'background') {
        const image = await fileToScaledDataUrl(file, { maxWidth: 1600, maxHeight: 1600, type: 'image/jpeg', quality: 0.85 });
        updateSide((s) => ({ ...s, background: { ...s.background, image } }));
      } else {
        const logo = await fileToScaledDataUrl(file, { maxWidth: 800, maxHeight: 400, type: 'image/png' });
        setLayout({ logo });
        const logoPreset = config.presets.find((p) => p.id === 'logo');
        if (logoPreset && !side.elements.some((x) => x.type === 'logo')) addElement(logoPreset.make);
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Das Bild konnte nicht übernommen werden.' });
    }
  };

  return (
    <div className="ce" ref={rootRef}>
      <div className="ce-topbar">
        <button type="button" className="btn btn-ghost" onClick={close}>
          {config.closeLabel}
        </button>
        <input
          className="ce-name"
          value={layout.name}
          maxLength={40}
          aria-label={config.nameLabel}
          onChange={(e) => setLayout({ name: e.target.value }, 'name')}
        />
        <button type="button" className="ce-format-pill" onClick={() => setTab('design')} title="Format ändern (Reiter „Design“)">
          {formatLabel(layout)} ▾
        </button>
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

      <div className="ce-main">
        <section className="ce-stage" aria-label="Vorschau">
          <div className="ce-stage-tools">
            {config.allowBack && (
            <Segmented
              label="Seite"
              value={face}
              options={[
                { value: 'front', label: 'Vorderseite' },
                { value: 'back', label: layout.back ? 'Rückseite' : 'Rückseite +' },
              ]}
              onChange={(f) => {
                setFace(f);
                setSelectedId(undefined);
              }}
            />
            )}
            {config.cardFeatures && (
            <Segmented
              label="Vorschau"
              value={withHolder ? 'holder' : 'anonymous'}
              options={[
                { value: 'holder', label: 'Mit Person' },
                { value: 'anonymous', label: 'Ohne Person' },
              ]}
              onChange={(v) => setWithHolder(v === 'holder')}
            />
            )}
            {config.cardFeatures && groups.length > 1 && (
              <label className="inline-select">
                Vorschau-Gruppe
                <select value={group.id} onChange={(e) => setPreviewGroupId(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className={`ce-canvas ce-canvas-${layout.orientation}`}>
            {face === 'back' && !layout.back ? (
              <div className="ce-no-back">
                <p>Diese Karte hat noch keine Rückseite.</p>
                <p className="muted small">Zum Beispiel für einen Hinweis bei Fund, die Hausordnung oder eine Notfallnummer.</p>
                <button type="button" className="btn btn-primary" onClick={() => enableBack(true)}>
                  Rückseite gestalten
                </button>
              </div>
            ) : (
              <CardView
                layout={layout}
                face={face}
                data={previewData}
                values={previewValues}
                qrKind={config.preview?.qrKind}
                token={SAMPLE_TOKEN}
                large
                edit={{ selectedId, onSelect: select, onChange: (e) => updateElement(e, `move:${e.id}`), onGestureStart: history.checkpoint }}
              />
            )}
          </div>
          <p className="ce-hint">
            Ziehen = verschieben (rastet an Hilfslinien ein, Umschalt = frei) · Ecke ziehen = Größe · Pfeiltasten = Feinschritt · Entf =
            löschen · Strg+Z = rückgängig. Gedruckt wird in {mmText(size.w)} × {mmText(size.h)} mm.
          </p>
        </section>

        <aside className="ce-panel" aria-label="Werkzeuge">
          <div className="tabs ce-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ce-panel-body" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
            {tab === 'add' && (
              <AddTab
                presets={config.presets}
                placeholders={config.placeholders}
                face={face}
                side={side}
                selectedId={selectedId}
                hasBack={Boolean(layout.back)}
                onAdd={addElement}
                onSelect={select}
                onEnableBack={() => enableBack(true)}
              />
            )}
            {tab === 'edit' &&
              (selected ? (
                <EditTab
                  config={config}
                  element={selected}
                  size={size}
                  data={previewData}
                  values={previewValues}
                  onChange={updateElement}
                  onRemove={() => removeElement(selected.id)}
                  onDuplicate={() => duplicateElement(selected)}
                  onReorder={(toFront) => reorder(selected, toFront)}
                />
              ) : (
                <div className="ce-empty">
                  <p>Kein Element ausgewählt.</p>
                  <p className="muted small">Ein Element auf der Karte anklicken – oder unter „+ Hinzufügen“ ein neues einfügen.</p>
                  <ElementChips elements={side.elements} selectedId={selectedId} onSelect={select} placeholders={config.placeholders} />
                </div>
              ))}
            {tab === 'design' && (
              <DesignTab
                config={config}
                layout={layout}
                face={face}
                side={side}
                onFormat={changeFormat}
                onBack={enableBack}
                onBackground={(background) => updateSide((s) => ({ ...s, background }), 'background')}
                onTextColor={(textColor) => setLayout({ textColor }, 'textColor')}
                onImage={onImage}
                onRemoveImage={() => updateSide((s) => ({ ...s, background: { ...s.background, image: undefined } }))}
                onRemoveLogo={() => setLayout({ logo: undefined })}
              />
            )}
            {tab === 'general' && (
              <GeneralTab
                config={config}
                layout={layout}
                groups={groups}
                assigned={assigned}
                isDefault={isDefault}
                onAssigned={setAssigned}
                onDefault={setIsDefault}
                onTemplate={(id) => {
                  const t = config.templates.find((x) => x.id === id);
                  if (!t || !window.confirm(`Vorlage „${t.label}“ auf die Vorderseite anwenden? Die bisherigen Elemente werden ersetzt.`)) return;
                  history.set((l) => {
                    const merged = { ...l, orientation: l.format === 'custom' ? l.orientation : t.orientation };
                    return { ...merged, elements: fitSide({ background: l.background, elements: t.elements() }, cardSize(merged)).elements };
                  });
                  setFace('front');
                  setSelectedId(undefined);
                }}
                onBackTemplate={() => {
                  if (!window.confirm('Vorschlag für die Rückseite übernehmen? Die bisherigen Elemente der Rückseite werden ersetzt.')) return;
                  history.set((l) => ({ ...l, back: fitSide(defaultBackSide(), cardSize(l)) }));
                  setFace('back');
                  setSelectedId(undefined);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function ElementChips({
  elements,
  selectedId,
  onSelect,
  placeholders,
}: {
  elements: CardElement[];
  selectedId?: string;
  onSelect: (id: string) => void;
  placeholders?: { key: string; label: string }[];
}) {
  if (elements.length === 0) return <p className="muted small">Auf dieser Seite ist noch nichts.</p>;
  return (
    <ul className="element-list" aria-label="Elemente auf der Karte">
      {[...elements].reverse().map((e) => (
        <li key={e.id}>
          <button type="button" className={e.id === selectedId ? 'chip active' : 'chip'} onClick={() => onSelect(e.id)}>
            {elementLabel(e, placeholders)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddTab(props: {
  presets: typeof CARD_PRESETS;
  placeholders: { key: string; label: string }[];
  face: CardFace;
  side: CardSide;
  selectedId?: string;
  hasBack: boolean;
  onAdd: (make: (id: string, size: CardSize) => CardElement) => void;
  onSelect: (id: string) => void;
  onEnableBack: () => void;
}) {
  if (props.face === 'back' && !props.hasBack) {
    return (
      <div className="ce-empty">
        <p>Noch keine Rückseite.</p>
        <button type="button" className="btn btn-primary" onClick={props.onEnableBack}>
          Rückseite gestalten
        </button>
      </div>
    );
  }
  return (
    <>
      <h3 className="ce-title">Element hinzufügen ({FACE_LABEL[props.face]})</h3>
      <div className="ce-tiles">
        {props.presets.map((p) => (
          <button key={p.id} type="button" className="ce-tile" onClick={() => props.onAdd(p.make)}>
            <strong>{p.label}</strong>
            <small>{p.hint}</small>
          </button>
        ))}
      </div>
      <div className="ce-section">
        <h4>Vorhanden (antippen zum Bearbeiten)</h4>
        <ElementChips elements={props.side.elements} selectedId={props.selectedId} onSelect={props.onSelect} placeholders={props.placeholders} />
      </div>
    </>
  );
}

function colorMode(c: CardColor | undefined): 'default' | 'group' | 'on-group' | 'custom' {
  if (!c) return 'default';
  if (c === 'group' || c === 'on-group') return c;
  return 'custom';
}

function EditTab({
  config,
  element,
  size,
  data,
  values,
  onChange,
  onRemove,
  onDuplicate,
  onReorder,
}: {
  config: LayoutEditorConfig;
  element: CardElement;
  size: CardSize;
  data: CardData;
  values?: Record<string, string>;
  onChange: (e: CardElement, key?: string) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onReorder: (toFront: boolean) => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<CardElement>, key?: string) => onChange(fitElement({ ...element, ...patch }, size), key);
  const isText = element.type === 'text';
  const isBand = element.type === 'band';
  const mode = colorMode(element.color ?? (isBand ? 'group' : undefined));
  const toMm = (pct: number, axis: 'w' | 'h') => (pct / 100) * size[axis];
  const toPct = (mm: number, axis: 'w' | 'h') => (mm / size[axis]) * 100;
  const fontMm = (element.size / 100) * size.h;
  const preview = isText ? cardText(element, values ?? cardValues(data)) : null;

  const insert = (key: string) => {
    const ta = textRef.current;
    const text = element.text ?? '';
    const start = ta?.selectionStart ?? text.length;
    const end = ta?.selectionEnd ?? text.length;
    const needsSpace = start > 0 && !/\s$/.test(text.slice(0, start));
    const next = `${text.slice(0, start)}${needsSpace ? ' ' : ''}${key}${text.slice(end)}`;
    set({ text: next });
    requestAnimationFrame(() => {
      ta?.focus();
      const pos = start + key.length + (needsSpace ? 1 : 0);
      ta?.setSelectionRange(pos, pos);
    });
  };

  const colorOptions: { value: ReturnType<typeof colorMode>; label: string }[] = isBand
    ? [
        { value: 'group', label: config.colorLabel },
        { value: 'on-group', label: 'Schwarz/Weiß passend' },
        { value: 'custom', label: 'Eigene' },
      ]
    : [
        { value: 'default', label: 'Standard' },
        { value: 'group', label: config.colorLabel },
        { value: 'on-group', label: 'Schwarz/Weiß passend' },
        { value: 'custom', label: 'Eigene' },
      ];

  return (
    <div className="element-editor ce-edit" aria-label="Ausgewähltes Element">
      <div className="ce-edit-head">
        <h3 className="ce-title">
          {TYPE_LABEL[element.type]}
          {isText && ` „${elementLabel(element, config.placeholders)}“`}
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

      {isText && (
        <div className="ce-section">
          <label htmlFor={`card-text-${element.id}`}>Inhalt</label>
          <textarea id={`card-text-${element.id}`} ref={textRef} rows={2} value={element.text ?? ''} onChange={(e) => set({ text: e.target.value }, `text:${element.id}`)} />
          <div className="ce-insert" aria-label="Einfügen">
            <span className="muted small">Einfügen:</span>
            {config.placeholders.map((p) => (
              <button key={p.key} type="button" className="chip chip-small" onClick={() => insert(p.key)} title={p.key}>
                + {p.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            Ergebnis im Beispiel: <strong>{preview ?? '(ausgeblendet)'}</strong>
          </p>
          <label className="checkbox-inline">
            <input type="checkbox" checked={Boolean(element.hideIfEmpty)} onChange={(e) => set({ hideIfEmpty: e.target.checked })} />
            ausblenden, wenn ein Platzhalter leer ist (z. B. „gültig bis …“ ohne Datum)
          </label>
        </div>
      )}

      {isText && (
        <div className="ce-section">
          <h4>Schrift</h4>
          <label className="ce-range">
            <span>Größe</span>
            <input
              type="range"
              min={1}
              max={Math.max(10, Math.round(size.h * 0.3))}
              step={0.1}
              value={fontMm}
              onChange={(e) => set({ size: (Number(e.target.value) / size.h) * 100 }, `size:${element.id}`)}
              aria-label="Schriftgröße"
            />
            <strong>{mmText(fontMm)} mm</strong>
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
        </div>
      )}

      {element.type !== 'qr' && element.type !== 'photo' && element.type !== 'logo' && (
        <div className="ce-section">
          <h4>Farbe</h4>
          <div className="ce-colors">
            <Segmented
              label="Farbe"
              small
              value={mode}
              options={colorOptions}
              onChange={(v) => set({ color: v === 'default' ? undefined : v === 'custom' ? (element.color?.startsWith('#') ? element.color : '#0f172a') : v })}
            />
            {mode === 'custom' && (
              <input type="color" aria-label="Eigene Farbe" value={element.color?.startsWith('#') ? element.color : '#0f172a'} onChange={(e) => set({ color: e.target.value }, `color:${element.id}`)} />
            )}
          </div>
        </div>
      )}

      <div className="ce-section">
        <h4>Position und Größe (mm)</h4>
        {element.type === 'qr' && <p className="hint">Mindestens {mmText((minWidth('qr', size) / 100) * size.w)} mm, damit Webcam und Handy ihn sicher lesen.</p>}
        <div className="ce-grid">
          <MmField label="links" value={toMm(element.x, 'w')} onChange={(v) => onChange(moveCardElement(element, toPct(v, 'w'), element.y, size))} />
          <MmField label="oben" value={toMm(element.y, 'h')} onChange={(v) => onChange(moveCardElement(element, element.x, toPct(v, 'h'), size))} />
          <MmField label="Breite" value={toMm(element.w, 'w')} onChange={(v) => set({ w: toPct(v, 'w') })} />
          {isBand && <MmField label="Höhe" value={toMm(element.h ?? 6, 'h')} onChange={(v) => set({ h: toPct(v, 'h') })} />}
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-small" onClick={() => onChange(moveCardElement(element, (100 - element.w) / 2, element.y, size))}>
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

      {config.cardFeatures && (
        <div className="ce-section">
          <h4>Anzeigen</h4>
          <Segmented label="Anzeigen" small value={element.showWhen ?? 'always'} options={SHOW_OPTIONS} onChange={(showWhen) => set({ showWhen: showWhen === 'always' ? undefined : showWhen })} />
          <p className="muted small">„Mit Person“ gilt nur bei Gruppen, die Name und Foto drucken dürfen.</p>
        </div>
      )}
    </div>
  );
}

/** Zahlenfeld in mm – übernimmt den Wert beim Verlassen bzw. Enter, damit man frei tippen kann. */
function MmField({ label, value, onChange }: { label: string; value: number; onChange: (mm: number) => void }) {
  const [text, setText] = useState(mmText(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(mmText(value));
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const n = parseNum(text);
    if (n !== null) onChange(n);
    else setText(mmText(value));
  };
  return (
    <label>
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </label>
  );
}

function DesignTab(props: {
  config: LayoutEditorConfig;
  layout: CardLayout;
  face: CardFace;
  side: CardSide;
  onFormat: (f: Pick<CardLayout, 'format' | 'orientation' | 'customSize'>) => void;
  onBack: (on: boolean) => void;
  onBackground: (b: CardSide['background']) => void;
  onTextColor: (c: string) => void;
  onImage: (e: ChangeEvent<HTMLInputElement>, target: 'background' | 'logo') => void;
  onRemoveImage: () => void;
  onRemoveLogo: () => void;
}) {
  const { layout, side } = props;
  const { config } = props;
  const format: CardFormat = layout.format ?? config.formats[0]!.id;
  const size = cardSize(layout);
  const bgMode = side.background.color === 'group' ? 'group' : side.background.color.toLowerCase() === '#ffffff' ? 'white' : 'custom';
  const { min, maxW, maxH } = CUSTOM_SIZE_LIMITS;
  return (
    <div className="form ce-design">
      <div className="ce-section">
        <h4>Format</h4>
        <label>
          {config.kind === 'invitation' ? 'Format' : 'Kartengröße'}
          <select
            value={format}
            onChange={(e) => {
              const f = e.target.value as CardFormat;
              props.onFormat(f === 'custom' ? { format: f, orientation: layout.orientation, customSize: { w: size.w, h: size.h } } : { format: f, orientation: layout.orientation, customSize: undefined });
            }}
          >
            {config.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} ({mmText(f.short)} × {mmText(f.long)} mm)
              </option>
            ))}
            {config.allowCustomSize && <option value="custom">Eigene Größe …</option>}
          </select>
        </label>
        {format === 'custom' ? (
          <div className="ce-grid">
            <MmField label="Breite (mm)" value={size.w} onChange={(w) => props.onFormat({ format, customSize: { w, h: size.h }, orientation: size.h >= w ? 'portrait' : 'landscape' })} />
            <MmField label="Höhe (mm)" value={size.h} onChange={(h) => props.onFormat({ format, customSize: { w: size.w, h }, orientation: h >= size.w ? 'portrait' : 'landscape' })} />
            <p className="muted small ce-wide">
              {min}–{maxW} mm breit, {min}–{maxH} mm hoch (passt auf einen A4-Bogen).
            </p>
          </div>
        ) : (
          <Segmented
            label="Ausrichtung"
            value={layout.orientation}
            options={[
              { value: 'portrait', label: 'Hochformat' },
              { value: 'landscape', label: 'Querformat' },
            ]}
            onChange={(orientation) => props.onFormat({ format, orientation, customSize: undefined })}
          />
        )}
        <p className="muted small">{config.formatHint(format)}</p>
      </div>

      {config.allowBack && (
        <div className="ce-section">
          <h4>Rückseite</h4>
          <label className="checkbox-inline">
            <input type="checkbox" checked={Boolean(layout.back)} onChange={(e) => props.onBack(e.target.checked)} />
            Rückseite gestalten
          </label>
        </div>
      )}

      {(props.face === 'front' || layout.back) && (
        <div className="ce-section">
          <h4>Hintergrund ({FACE_LABEL[props.face]})</h4>
          <div className="ce-colors">
            <Segmented
              label="Hintergrund"
              small
              value={bgMode}
              options={[
                { value: 'white', label: 'Weiß' },
                { value: 'group', label: config.colorLabel },
                { value: 'custom', label: 'Eigene' },
              ]}
              onChange={(v) => props.onBackground({ ...side.background, color: v === 'group' ? 'group' : v === 'white' ? '#ffffff' : '#f1f5f9' })}
            />
            {bgMode === 'custom' && (
              <input type="color" aria-label="Hintergrundfarbe" value={side.background.color} onChange={(e) => props.onBackground({ ...side.background, color: e.target.value })} />
            )}
          </div>
          <label htmlFor="card-bg-image">Hintergrundbild (optional)</label>
          <input id="card-bg-image" type="file" accept="image/*" onChange={(e) => props.onImage(e, 'background')} />
          {side.background.image && (
            <button type="button" className="btn btn-small" onClick={props.onRemoveImage}>
              Hintergrundbild entfernen
            </button>
          )}
        </div>
      )}

      <div className="ce-section">
        <h4>Schrift und Logo (beide Seiten)</h4>
        <label className="inline-select">
          Schriftfarbe
          <input type="color" value={layout.textColor} onChange={(e) => props.onTextColor(e.target.value)} />
        </label>
        <label htmlFor="card-logo">Logo</label>
        <input id="card-logo" type="file" accept="image/*" onChange={(e) => props.onImage(e, 'logo')} />
        {layout.logo && (
          <div className="button-row">
            <img src={layout.logo} alt="Logo" className="layout-logo-preview" />
            <button type="button" className="btn btn-small" onClick={props.onRemoveLogo}>
              Logo entfernen
            </button>
          </div>
        )}
        <p className="muted small">Platzieren mit dem Baustein „Logo“.</p>
      </div>
    </div>
  );
}

function GeneralTab(props: {
  config: LayoutEditorConfig;
  layout: CardLayout;
  groups: Group[];
  assigned: Set<string>;
  isDefault: boolean;
  onAssigned: (s: Set<string>) => void;
  onDefault: (v: boolean) => void;
  onTemplate: (id: string) => void;
  onBackTemplate: () => void;
}) {
  const toggle = (id: string, on: boolean) => {
    const next = new Set(props.assigned);
    if (on) next.add(id);
    else next.delete(id);
    props.onAssigned(next);
  };
  return (
    <div className="form ce-general">
      {props.config.cardFeatures && (
      <div className="ce-section">
        <h4>Verwendung</h4>
        <fieldset className="ce-groups">
          <legend>Für diese Gruppen verwenden</legend>
          {props.groups.map((g) => (
            <label key={g.id} className="checkbox-inline">
              <input type="checkbox" checked={props.assigned.has(g.id)} onChange={(e) => toggle(g.id, e.target.checked)} />
              <span className="color-dot" style={{ background: g.color }} />
              {g.name}
            </label>
          ))}
        </fieldset>
        <label className="checkbox-inline">
          <input type="checkbox" checked={props.isDefault} onChange={(e) => props.onDefault(e.target.checked)} />
          Standard für alle Gruppen ohne eigenes Kartenlayout
        </label>
        <p className="muted small">Wird beim Speichern übernommen.</p>
      </div>
      )}
      <div className="ce-section">
        <h4>Vorlagen</h4>
        <label>
          Vorlage auf die Vorderseite anwenden
          <select value="" onChange={(e) => props.onTemplate(e.target.value)}>
            <option value="">– Vorlage wählen –</option>
            {props.config.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {props.layout.back && (
          <button type="button" className="btn btn-small" onClick={props.onBackTemplate}>
            Vorschlag für die Rückseite übernehmen
          </button>
        )}
      </div>
      <div className="ce-section">
        <h4>Hinweis</h4>
        <p className="muted small">
          Texte im Layout werden unverschlüsselt gespeichert – Namen daher nur über die Bausteine bzw. Platzhalter (
          {props.config.placeholders.map((p) => p.label).join(', ')}), die beim Druck mit den Daten
          {props.config.kind === 'invitation' ? ' des Gastes' : ' der Karte'} gefüllt werden.
        </p>
      </div>
    </div>
  );
}
