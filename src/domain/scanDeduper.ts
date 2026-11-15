/**
 * Unterdrückt wiederholte Erkennungen desselben QR-Codes, solange er im Bild
 * bleibt. Erst wenn der Code mindestens `holdMs` lang nicht mehr erkannt wurde,
 * gilt er wieder als neuer Scan. (Der fachliche Doppelscan-Schutz mit
 * Mindestabstand zwischen Buchungen liegt in decideAccess.)
 */
export class ScanDeduper {
  private lastText: string | null = null;
  private lastSeenAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly holdMs: number) {}

  accept(text: string, now: number): boolean {
    const repeated = text === this.lastText && now - this.lastSeenAt < this.holdMs;
    this.lastText = text;
    this.lastSeenAt = now;
    return !repeated;
  }

  reset(): void {
    this.lastText = null;
    this.lastSeenAt = Number.NEGATIVE_INFINITY;
  }
}
