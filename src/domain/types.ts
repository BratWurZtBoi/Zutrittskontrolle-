/** Gemeinsame Datentypen der Anwendung. */

export type Direction = 'in' | 'out';

/** Betriebsart des Scanners: automatisch wechseln oder fest Eingang/Ausgang. */
export type ScanMode = 'auto' | 'in' | 'out';

/** Kartengruppe, z. B. „Bestandspersonal“ oder „Besucher“. */
export interface Group {
  id: string;
  name: string;
  /** Farbe als Hex-Wert (#rrggbb) – erscheint auf Karte, Liste und Scanner. */
  color: string;
  /** Kürzel für die Kartennummer, z. B. „B“ → B-001. */
  prefix: string;
  /** Zutritt für die ganze Gruppe erlaubt (z. B. alle Besucherkarten auf einmal sperren). */
  accessGranted: boolean;
  /** Karte ohne zugewiesene Person erhält trotzdem Zutritt. */
  allowUnassigned: boolean;
  /** Name und Foto der Person werden auf die Karte gedruckt. */
  printHolder: boolean;
  /** Eintritt muss am Dashboard vom Admin/Bediener bestätigt werden (sonst automatisch). */
  requireConfirmation?: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type GroupInput = Pick<
  Group,
  'name' | 'color' | 'prefix' | 'accessGranted' | 'allowUnassigned' | 'printHolder' | 'requireConfirmation'
>;

/** Personendaten hinter einer Karte – jederzeit änderbar oder entfernbar. */
export interface CardHolder {
  firstName: string;
  lastName: string;
  /** Firma, Abteilung oder Funktion. */
  company?: string;
  /** Foto als Data-URL (JPEG, verkleinert). */
  photo?: string;
  note?: string;
}

/** Verschlüsselte Daten (AES-256-GCM): Initialisierungsvektor + Geheimtext. */
export interface EncryptedData {
  iv: Uint8Array;
  data: Uint8Array;
}

/** Karte, wie sie in der Datenbank liegt (Personendaten verschlüsselt). */
export interface CardRecord {
  /** Interne, unveränderliche ID (UUID). */
  id: string;
  /** Sichtbare Kartennummer, z. B. „B-001“. Eindeutig. */
  number: string;
  groupId: string;
  /** Zufälliges Token im QR-Code. Neuer QR-Code = neues Token, alter wird ungültig. */
  token: string;
  tokenIssuedAt: number;
  blocked: boolean;
  /** Zutritt für diese Karte erlaubt. */
  accessGranted: boolean;
  /** Gültig ab/bis (inklusive), Format YYYY-MM-DD, lokales Datum. */
  validFrom?: string;
  validUntil?: string;
  /** Verschlüsselte Personendaten (CardHolder als JSON). */
  holderEnc?: EncryptedData;
  /** Verschlüsselter Name – wird unverändert ins Protokoll kopiert (auch im gesperrten Zustand). */
  nameEnc?: EncryptedData;
  /** Altbestand vor der Verschlüsselung (Klartext) – wird bei der Einrichtung umgewandelt. */
  holder?: CardHolder;
  /** Seit wann die aktuelle Person der Karte zugeordnet ist. */
  holderSince?: number;
  /** Als verloren gemeldet (Zeitpunkt) – die Karte ist dann auch gesperrt. */
  lostAt?: number;
  /** Diese (verlorene) Karte wurde durch eine Ersatzkarte ersetzt. */
  replacedBy?: string;
  /** Diese Karte ist Ersatz für eine verlorene Karte. */
  replaces?: string;
  /** Markiert fiktive Testdaten, damit sie gezielt gelöscht werden können. */
  testData?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Karte für die Oberfläche (Personendaten entschlüsselt, sofern entsperrt). */
export interface Card extends Omit<CardRecord, 'holderEnc' | 'nameEnc' | 'holder'> {
  /** Eine Person ist zugeordnet (auch im gesperrten Zustand bekannt). */
  hasHolder: boolean;
  /** Entschlüsselte Personendaten – fehlen, wenn niemand zugeordnet oder die Daten gesperrt sind. */
  holder?: CardHolder;
}

/** Änderbare Angaben einer Karte (Berechtigung + Personendaten). */
export interface CardUpdate {
  accessGranted: boolean;
  validFrom?: string;
  validUntil?: string;
  holder?: CardHolder;
}

export type ReasonCode =
  | 'OK'
  | 'INVALID_CODE'
  | 'UNKNOWN_CARD'
  | 'CARD_BLOCKED'
  /** Karte als verloren gemeldet. */
  | 'CARD_LOST'
  | 'GROUP_DISABLED'
  | 'NO_PERMISSION'
  | 'UNASSIGNED'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'DUPLICATE'
  /** Eintritt muss bestätigt werden, aber hier ist niemand zum Bestätigen (Kiosk-Scanner). */
  | 'CONFIRMATION_REQUIRED'
  /** Vom Admin/Bediener abgewiesen. */
  | 'REJECTED'
  /** Nicht rechtzeitig bestätigt. */
  | 'CONFIRMATION_TIMEOUT';

/** 'pending' = wartet auf Bestätigung durch den Bediener (noch nicht gebucht). */
export type Outcome = 'granted' | 'denied' | 'duplicate' | 'pending';

/** Wer eine Bestätigung erteilt bzw. abgelehnt hat. */
export type StaffRole = 'admin' | 'operator';

/** Protokolleintrag, wie er in der Datenbank liegt. */
export interface AccessEventRecord {
  /** Fortlaufende Nummer (automatisch vergeben). */
  seq?: number;
  timestamp: number;
  outcome: 'granted' | 'denied';
  direction?: Direction;
  reason: ReasonCode;
  cardId?: string;
  /** Momentaufnahmen, damit die Historie nach Änderungen/Löschen lesbar bleibt. */
  cardNumber?: string;
  groupId?: string;
  groupName?: string;
  /** Verschlüsselter Name der Person zum Zeitpunkt der Buchung. */
  holderNameEnc?: EncryptedData;
  /** Altbestand vor der Verschlüsselung (Klartext). */
  holderName?: string;
  /** 'system' = automatische Buchung, z. B. beim Zurückgeben einer Karte. */
  source: 'camera' | 'test' | 'system';
  /** Eintritt wurde vom Admin/Bediener bestätigt bzw. abgewiesen. */
  confirmedBy?: StaffRole;
}

/** Protokolleintrag für die Oberfläche. */
export interface AccessEvent extends Omit<AccessEventRecord, 'holderNameEnc'> {
  /** Name gesperrt (Daten nicht entsperrt). */
  holderLocked?: boolean;
}

export interface PresenceRecord {
  cardId: string;
  status: Direction;
  /** Zeitpunkt der letzten erfolgreichen Buchung. */
  lastBookingAt: number;
  /** Letzte Buchung war automatisch (z. B. „Alle ausbuchen“) – zählt nicht für den Doppelscan-Schutz. */
  bySystem?: boolean;
}
