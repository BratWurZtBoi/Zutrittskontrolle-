import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { GroupBadge } from '../components/GroupBadge';
import { SettingsShell } from './settings/SettingsShell';
import { ValidationError, db } from '../db/db';
import { createGroup, deleteGroup, listGroups, updateGroup } from '../db/groups';
import { listLayouts } from '../db/layouts';
import { listCardLayouts } from '../db/cardLayouts';
import { STANDARD_CARD_LAYOUT } from '../domain/cardLayout';
import { BUILT_IN_LAYOUTS } from '../domain/presentationLayout';
import { GROUP_COLOR_PRESETS } from '../domain/color';
import type { Group, GroupInput } from '../domain/types';

const NEW_GROUP: GroupInput = {
  name: '',
  color: '#16a34a',
  prefix: '',
  accessGranted: true,
  allowUnassigned: false,
  printHolder: true,
  requireConfirmation: false,
};

export function GroupsPage() {
  const groups = useLiveQuery(listGroups, []);
  const counts = useLiveQuery(async () => {
    const map = new Map<string, number>();
    await db.cards.each((c) => map.set(c.groupId, (map.get(c.groupId) ?? 0) + 1));
    return map;
  }, []);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const allLayouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const layoutName = (id?: string) => allLayouts.find((l) => l.id === id)?.name;

  if (!groups) return null;

  return (
    <SettingsShell
      title="Gruppen"
      actions={
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={editing === 'new'}>
          + Neue Gruppe
        </button>
      }
    >
      <p className="muted">
        Gruppen legen Farbe und Kürzel der Karten fest (z. B. Besucher → orange, B-001). Die Farbe erscheint auf der
        gedruckten Karte, in den Listen und im Scanner.
      </p>

      {editing === 'new' && <GroupForm initial={NEW_GROUP} onDone={() => setEditing(null)} />}

      <ul className="group-list">
        {groups.map((g) => (
          <li key={g.id} className="card">
            {editing === g.id ? (
              <GroupForm group={g} initial={g} cardCount={counts?.get(g.id) ?? 0} onDone={() => setEditing(null)} />
            ) : (
              <div className="group-row">
                <span className="color-dot" style={{ background: g.color }} />
                <div className="group-row-main">
                  <GroupBadge group={g} /> <span className="muted">Kürzel {g.prefix}</span>
                  <div className="muted small">
                    {counts?.get(g.id) ?? 0} Karte(n) · {g.accessGranted ? 'Zutritt erlaubt' : 'Zutritt gesperrt'} ·{' '}
                    {g.printHolder ? 'mit Name/Foto auf der Karte' : 'ohne Name/Foto auf der Karte'}
                    {g.allowUnassigned && ' · Zutritt auch ohne Person'}
                    {g.requireConfirmation ? ' · Eintritt wird bestätigt' : ' · Eintritt automatisch'}
                    {layoutName(g.presentationLayoutId) && ` · Layout „${layoutName(g.presentationLayoutId)}“`}
                  </div>
                </div>
                <button type="button" className="btn" onClick={() => setEditing(g.id)}>
                  Bearbeiten
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </SettingsShell>
  );
}

interface FormProps {
  group?: Group;
  initial: GroupInput;
  cardCount?: number;
  onDone: () => void;
}

function GroupForm({ group, initial, cardCount = 0, onDone }: FormProps) {
  const [form, setForm] = useState<GroupInput>({ ...initial });
  const layouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const cardLayouts = useLiveQuery(listCardLayouts, [], [STANDARD_CARD_LAYOUT]);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<GroupInput>) => setForm({ ...form, ...patch });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (group) await updateGroup(group.id, form);
      else await createGroup(form);
      onDone();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const onDelete = async () => {
    if (!group || !window.confirm(`Gruppe „${group.name}“ löschen?`)) return;
    try {
      await deleteGroup(group.id);
      onDone();
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <form className="form group-form" onSubmit={(e) => void onSubmit(e)}>
      <h2>{group ? `Gruppe „${group.name}“ bearbeiten` : 'Neue Gruppe'}</h2>
      <div className="form-grid">
        <label>
          Name
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={40} required />
        </label>
        <label>
          Kürzel für Kartennummern {group && <span className="muted">(fest)</span>}
          <input
            value={form.prefix}
            onChange={(e) => set({ prefix: e.target.value.toUpperCase() })}
            maxLength={4}
            disabled={Boolean(group)}
            placeholder="z. B. D"
            required
          />
        </label>
      </div>
      <fieldset className="color-field">
        <legend>Farbe</legend>
        <div className="color-presets">
          {GROUP_COLOR_PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              className={form.color === c ? 'color-swatch selected' : 'color-swatch'}
              style={{ background: c }}
              onClick={() => set({ color: c })}
              aria-label={`Farbe ${c}`}
            />
          ))}
          <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} aria-label="Eigene Farbe" />
        </div>
        <p>
          Vorschau: <GroupBadge group={{ ...(group ?? ({} as Group)), ...form, name: form.name || 'Gruppe' }} />
        </p>
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" checked={form.accessGranted} onChange={(e) => set({ accessGranted: e.target.checked })} />
        Zutritt für diese Gruppe erlaubt
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.printHolder} onChange={(e) => set({ printHolder: e.target.checked })} />
        Name und Foto auf die Karte drucken
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.allowUnassigned} onChange={(e) => set({ allowUnassigned: e.target.checked })} />
        Zutritt auch für Karten ohne zugeordnete Person
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(form.requireConfirmation)}
          onChange={(e) => set({ requireConfirmation: e.target.checked })}
        />
        Eintritt muss bestätigt werden (Admin/Bediener im Dashboard)
      </label>
      <p className="muted small checkbox-hint">
        Ohne Häkchen wird automatisch eingelassen. Mit Häkchen erscheint beim Scan im Dashboard eine Anfrage mit Foto
        – „Einlassen“ (Enter) oder „Abweisen“ (Esc). Am Kiosk-Scanner ohne Bediener wird abgewiesen („Bitte am Empfang
        melden“). Das Ausbuchen bleibt immer automatisch.
      </p>
      <label>
        Scan-Anzeige (Gästebildschirm)
        <select value={form.presentationLayoutId ?? ''} onChange={(e) => set({ presentationLayoutId: e.target.value || undefined })}>
          <option value="">Standardlayout</option>
          {layouts
            .filter((l) => !l.builtIn && l.kind === 'result')
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Kartenlayout (gedruckte Karte)
        <select value={form.cardLayoutId ?? ''} onChange={(e) => set({ cardLayoutId: e.target.value || undefined })}>
          <option value="">Standardlayout</option>
          {cardLayouts
            .filter((l) => !l.builtIn)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="button-row">
        <button type="submit" className="btn btn-primary">
          {group ? 'Speichern' : 'Gruppe anlegen'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Abbrechen
        </button>
        {group && (
          <button type="button" className="btn btn-danger" onClick={() => void onDelete()} disabled={cardCount > 0} title={cardCount > 0 ? 'Gruppe enthält noch Karten' : undefined}>
            Löschen
          </button>
        )}
      </div>
    </form>
  );
}
