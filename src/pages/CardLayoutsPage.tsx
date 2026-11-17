import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router';
import { CardView } from '../components/CardView';
import { cardLayoutUsage, createCardLayout, deleteCardLayout, duplicateCardLayout, listCardLayouts } from '../db/cardLayouts';
import { listGroups } from '../db/groups';
import { saveSettings } from '../db/settings';
import { STANDARD_CARD_LAYOUT, formatLabel, type CardLayout } from '../domain/cardLayout';
import { useSettings } from '../hooks/useSettings';
import { CardLayoutEditor, SAMPLE_TOKEN, sampleData } from './CardLayoutEditor';
import { SettingsShell } from './settings/SettingsShell';

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
      <div className="page page-wide ce-page">
        <CardLayoutEditor
          key={editLayout.id}
          initial={editLayout}
          groups={groups}
          orgName={settings.orgName}
          defaultLayoutId={active}
          onClose={() => setEditing(null)}
        />
      </div>
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
        Aussehen der gedruckten Karten: Scheckkarte (85,6 × 54 mm), A7, A6 oder eigene Größe, hoch oder quer – auf Wunsch mit
        Rückseite. Bausteine wie Name, Dienstgrad, Einheit, QR-Code, Foto und Logo frei platzieren. Zuweisen je Gruppe im Editor unter
        „Allgemein“ oder unter <Link to="/einstellungen/gruppen">Gruppen verwalten</Link>; Gruppen ohne eigenes Layout nutzen
        das Standardlayout. Name und Foto erscheinen nur bei Gruppen mit „Name und Foto auf die Karte drucken“.
      </p>
      {message && <p className="form-success">{message}</p>}
      <ul className="layout-list">
        {layouts.map((l) => {
          const isActive = l.id === active;
          return (
            <li key={l.id} className="card layout-row">
              <div className="card-thumbs">
                <CardView layout={l} data={sampleData(sampleGroup, settings.orgName, true)} token={SAMPLE_TOKEN} large />
                {l.back && <CardView layout={l} face="back" data={sampleData(sampleGroup, settings.orgName, true)} token={SAMPLE_TOKEN} large />}
              </div>
              <div className="layout-row-main">
                <h3>
                  {l.name} {l.builtIn && <span className="badge">mitgeliefert</span>}{' '}
                  {isActive && <span className="badge badge-active">Standard für alle Gruppen ohne Zuweisung</span>}
                </h3>
                <p className="muted small">
                  {formatLabel(l)}
                  {l.back ? ' · mit Rückseite' : ''} ·{' '}
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
