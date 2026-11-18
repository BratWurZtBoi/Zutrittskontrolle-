import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { saveInvitation } from '../db/occasions';
import {
  INVITATION_FORMATS,
  INVITATION_PLACEHOLDERS,
  INVITATION_PRESETS,
  INVITATION_TEMPLATES,
  SAMPLE_GUEST,
  defaultInvitation,
  invitationCardData,
  invitationValues,
} from '../domain/invitation';
import type { Occasion } from '../domain/occasion';
import { useOccasion } from '../hooks/useOccasion';
import { useSettings } from '../hooks/useSettings';
import { CardLayoutEditor, type LayoutEditorConfig } from './CardLayoutEditor';

/** Editor-Einstellungen für Einladungen: Formate A4/A5/A6/DIN lang, eigene Bausteine und Platzhalter. */
export function invitationEditorConfig(occasion: Occasion, orgName: string): LayoutEditorConfig {
  return {
    kind: 'invitation',
    closeLabel: '← Veranstaltung',
    nameLabel: 'Name der Einladung',
    unsavedText: 'Die Einladung hat ungespeicherte Änderungen. Trotzdem verlassen?',
    formats: INVITATION_FORMATS,
    allowCustomSize: false,
    allowBack: false,
    cardFeatures: false,
    presets: INVITATION_PRESETS,
    placeholders: INVITATION_PLACEHOLDERS,
    templates: INVITATION_TEMPLATES,
    colorLabel: 'Farbe der Veranstaltung',
    formatHint: (format) =>
      format === 'a4'
        ? 'A4: eine Einladung je Blatt – auf jedem Drucker.'
        : format === 'dl'
          ? 'DIN lang passt in Briefumschläge DIN lang – gedruckt wird je Einladung eine Seite in diesem Format.'
          : format === 'a6'
            ? 'A6/Postkarte: einzeln oder zwei je A4-Blatt zum Ausschneiden.'
            : 'A5: je Einladung eine Seite (A5-Papier oder im Druckdialog anpassen).',
    preview: {
      data: invitationCardData(occasion, SAMPLE_GUEST, orgName),
      values: invitationValues(occasion, SAMPLE_GUEST, orgName),
      qrKind: 'guest',
    },
    onSave: (layout) => saveInvitation(occasion.id, layout),
  };
}

/** Einladung einer Veranstaltung gestalten (Serienbrief). */
export function InvitationEditorPage() {
  const { id = '' } = useParams();
  const occasion = useOccasion(id);
  const settings = useSettings();
  const navigate = useNavigate();
  // Ausgangsstand nur einmal festlegen – spätere Änderungen an der Veranstaltung nicht in den Editor übernehmen
  const initial = useMemo(() => (occasion ? (occasion.invitation ?? defaultInvitation(occasion.id)) : undefined), [occasion?.id]);
  if (occasion === undefined) return null;
  if (occasion === null || !initial) {
    return (
      <div className="page">
        <p>Diese Veranstaltung gibt es nicht (mehr).</p>
        <Link to="/veranstaltungen">Zu den Veranstaltungen</Link>
      </div>
    );
  }
  return (
    <div className="page page-wide ce-page">
      <CardLayoutEditor
        key={occasion.id}
        initial={initial}
        groups={[]}
        orgName={settings.orgName}
        defaultLayoutId=""
        config={invitationEditorConfig(occasion, settings.orgName)}
        onClose={() => navigate(`/veranstaltungen/${occasion.id}?ansicht=einladungen`)}
      />
    </div>
  );
}
