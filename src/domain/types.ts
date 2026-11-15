/** Gemeinsame Datentypen der Anwendung. */

export type Direction = 'in' | 'out';

/** Betriebsart des Scanners: automatisch wechseln oder fest Eingang/Ausgang. */
export type ScanMode = 'auto' | 'in' | 'out';

export interface Person {
  /** Interne, unveränderliche ID (UUID). */
  id: string;
  /** Sichtbare Personen-ID / Personalnummer, z. B. "T-001". Eindeutig. */
  personnelNo: string;
  firstName: string;
  lastName: string;
  /** Foto als Data-URL (JPEG, verkleinert). */
  photo?: string;
  /** Grundsätzliche Zutrittsberechtigung. */
  accessGranted: boolean;
  /** Gültig ab (inklusive), Format YYYY-MM-DD, lokales Datum. */
  validFrom?: string;
  /** Gültig bis (inklusive), Format YYYY-MM-DD, lokales Datum. */
  validUntil?: string;
  /** Zufälliges Token des aktuell gültigen Ausweises (steht im QR-Code). */
  cardToken: string;
  cardIssuedAt: number;
  cardBlocked: boolean;
  note?: string;
  /** Markiert fiktive Testdaten, damit sie gezielt gelöscht werden können. */
  testData?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Eingabedaten beim Anlegen/Bearbeiten einer Person. */
export interface PersonInput {
  personnelNo: string;
  firstName: string;
  lastName: string;
  photo?: string;
  accessGranted: boolean;
  validFrom?: string;
  validUntil?: string;
  note?: string;
  testData?: boolean;
}

export type ReasonCode =
  | 'OK'
  | 'INVALID_CODE'
  | 'UNKNOWN_CARD'
  | 'CARD_BLOCKED'
  | 'NO_PERMISSION'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'DUPLICATE';

export type Outcome = 'granted' | 'denied' | 'duplicate';

export interface AccessEvent {
  /** Fortlaufende Nummer (automatisch vergeben). */
  seq?: number;
  timestamp: number;
  outcome: 'granted' | 'denied';
  direction?: Direction;
  reason: ReasonCode;
  personId?: string;
  /** Momentaufnahme, damit die Historie auch nach dem Löschen lesbar bleibt. */
  personName?: string;
  personnelNo?: string;
  source: 'camera' | 'test';
}

export interface PresenceRecord {
  personId: string;
  status: Direction;
  /** Zeitpunkt der letzten erfolgreichen Buchung. */
  lastBookingAt: number;
}
