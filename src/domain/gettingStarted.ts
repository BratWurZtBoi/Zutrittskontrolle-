/**
 * „Erste Schritte“: Checkliste für die Einrichtung (nur Admin). Was sich aus den Daten erkennen lässt, wird
 * automatisch abgehakt; der Rest (und optionale Schritte) lässt sich von Hand abhaken. Reine Funktionen.
 */

/** Aus der Datenbank ermittelt (ohne Entschlüsseln). */
export interface SetupFacts {
  /** Name der Organisation geändert (nicht mehr der Platzhalter). */
  orgNameSet: boolean;
  /** Karten ohne Testkarten. */
  realCards: number;
  /** davon als gedruckt markiert. */
  printedRealCards: number;
  /** Testkarten vorhanden. */
  testCards: number;
  /** Mindestens ein echter Scan (Kamera oder USB-Scanner, nicht Testmodus). */
  scanned: boolean;
  operatorPin: boolean;
  /** Backup erstellt oder automatische Sicherung eingerichtet. */
  backup: boolean;
}

export type SetupStepId = 'org' | 'groups' | 'cards' | 'print' | 'scan' | 'screen' | 'operator' | 'backup' | 'cleanup';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  description: string;
  /** Seite, auf der man den Schritt erledigt. */
  to: string;
  linkLabel: string;
  /** Hilfethema mit der Anleitung. */
  helpTopic: string;
  optional?: boolean;
  /** Automatisch erkannt? undefined = nur von Hand abhakbar. */
  detect?: (f: SetupFacts) => boolean;
  /** Hinweis, wie der Schritt erkannt wird. */
  detectHint?: string;
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'org',
    title: 'Namen der Organisation eintragen',
    description: 'Erscheint auf den Karten, der Notfallliste und dem Gästebildschirm.',
    to: '/einstellungen/allgemein',
    linkLabel: 'Allgemein & Gerät',
    helpTopic: 'einrichten',
    detect: (f) => f.orgNameSet,
    detectHint: 'erledigt, sobald der Name geändert ist',
  },
  {
    id: 'groups',
    title: 'Gruppen prüfen',
    description: 'Farbe, Kürzel und Regeln – z. B. ob der Eintritt von Besuchern bestätigt werden muss.',
    to: '/einstellungen/gruppen',
    linkLabel: 'Gruppen',
    helpTopic: 'gruppen',
  },
  {
    id: 'cards',
    title: 'Karten anlegen und Personen zuweisen',
    description: 'Einzeln, in Serie oder per CSV-Import. Testkarten zählen nicht.',
    to: '/karten/neu',
    linkLabel: 'Karten erstellen',
    helpTopic: 'karten-erstellen',
    detect: (f) => f.realCards > 0,
    detectHint: 'erledigt, sobald es eine echte Karte gibt',
  },
  {
    id: 'print',
    title: 'Karten drucken',
    description: 'Auf A4-Bögen oder mit dem Kartendrucker – danach „als gedruckt markieren“.',
    to: '/druck',
    linkLabel: 'Drucken',
    helpTopic: 'karten-drucken',
    detect: (f) => f.printedRealCards > 0,
    detectHint: 'erledigt, sobald eine Karte als gedruckt markiert ist',
  },
  {
    id: 'scan',
    title: 'Scannen ausprobieren',
    description: 'Eine gedruckte Karte vor die Kamera oder den USB-Scanner halten.',
    to: '/dashboard',
    linkLabel: 'Dashboard',
    helpTopic: 'scannen',
    detect: (f) => f.scanned,
    detectHint: 'erledigt nach dem ersten Scan mit Kamera oder Scanner',
  },
  {
    id: 'screen',
    title: 'Gästebildschirm einrichten',
    description: 'Zweiten Bildschirm anschließen, „Präsentation öffnen“, Begrüßung gestalten.',
    to: '/einstellungen/praesentation',
    linkLabel: 'Präsentation',
    helpTopic: 'praesentation',
    optional: true,
  },
  {
    id: 'operator',
    title: 'Bediener-PIN festlegen',
    description: 'Damit am Empfang ohne Admin-Passwort gearbeitet werden kann.',
    to: '/einstellungen/bediener',
    linkLabel: 'Bediener & Bestätigung',
    helpTopic: 'anmelden',
    optional: true,
    detect: (f) => f.operatorPin,
    detectHint: 'erledigt, sobald eine PIN festgelegt ist',
  },
  {
    id: 'backup',
    title: 'Backup erstellen',
    description: 'Am besten automatisch in einen Ordner (z. B. USB-Stick oder Netzlaufwerk).',
    to: '/einstellungen/datensicherung',
    linkLabel: 'Datensicherung',
    helpTopic: 'backup',
    detect: (f) => f.backup,
    detectHint: 'erledigt nach dem ersten Backup oder mit automatischer Sicherung',
  },
  {
    id: 'cleanup',
    title: 'Testkarten entfernen',
    description: 'Vor dem echten Betrieb die fiktiven Testkarten löschen.',
    to: '/einstellungen/daten',
    linkLabel: 'Daten',
    helpTopic: 'daten',
    detect: (f) => f.testCards === 0,
    detectHint: 'erledigt, sobald keine Testkarten mehr da sind',
  },
];

export interface SetupStepState {
  step: SetupStep;
  done: boolean;
  /** Automatisch erkannt (dann nicht von Hand abwählbar). */
  detected: boolean;
}

export function setupStates(facts: SetupFacts, manualDone: readonly string[], steps: SetupStep[] = SETUP_STEPS): SetupStepState[] {
  return steps.map((step) => {
    const detected = step.detect ? step.detect(facts) : false;
    return { step, detected, done: detected || manualDone.includes(step.id) };
  });
}

export interface SetupProgress {
  /** Erledigte Pflichtschritte. */
  done: number;
  /** Anzahl Pflichtschritte (ohne optionale). */
  total: number;
  /** Alle Pflichtschritte erledigt. */
  complete: boolean;
  /** Nächster offener Schritt (Pflicht vor optional). */
  next?: SetupStep;
}

export function setupProgress(states: SetupStepState[]): SetupProgress {
  const required = states.filter((s) => !s.step.optional);
  const done = required.filter((s) => s.done).length;
  const next = (required.find((s) => !s.done) ?? states.find((s) => !s.done))?.step;
  return { done, total: required.length, complete: done === required.length, next };
}

/** Von Hand abhaken bzw. wieder öffnen; unbekannte IDs werden entfernt. */
export function toggleManualStep(manualDone: readonly string[], id: SetupStepId, done: boolean, steps: SetupStep[] = SETUP_STEPS): string[] {
  const known = new Set(steps.map((s) => s.id as string));
  const rest = manualDone.filter((x) => x !== id && known.has(x));
  return done ? [...rest, id] : rest;
}
