import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { PresentationView } from '../components/PresentationView';
import { listGroups } from '../db/groups';
import { createLayout, deleteLayout, duplicateLayout, layoutUsage, listLayouts } from '../db/layouts';
import { saveSettings } from '../db/settings';
import { BUILT_IN_LAYOUTS, type PresentationLayout, type ScreenKind } from '../domain/presentationLayout';
import { useSettings } from '../hooks/useSettings';
import { PresentationLayoutEditor, sampleResult } from './PresentationLayoutEditor';
import { SettingsShell } from './settings/SettingsShell';

function useSampleGroup() {
  const groups = useLiveQuery(listGroups, [], []);
  return groups[1] ?? groups[0] ?? { name: 'Besucher', color: '#ea580c' };
}

export function LayoutsPage() {
  const settings = useSettings();
  const layouts = useLiveQuery(listLayouts, [], BUILT_IN_LAYOUTS);
  const usage = useLiveQuery(layoutUsage, [], new Map<string, { groups: string[]; cards: number }>());
  const groups = useLiveQuery(listGroups, [], []);
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
    const kindList = layouts.filter((l) => l.kind === editLayout.kind);
    const wanted = editLayout.kind === 'idle' ? settings.idleLayoutId : settings.defaultLayoutId;
    return (
      <div className="page page-wide ce-page">
        <PresentationLayoutEditor
          key={editLayout.id}
          initial={editLayout}
          orgName={settings.orgName}
          groups={groups}
          activeId={kindList.some((l) => l.id === wanted) ? wanted : (kindList[0]?.id ?? '')}
          onClose={() => setEditing(null)}
        />
      </div>
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
