import { describe, expect, it } from 'vitest';
import { cardStatus, decideAccess, type AccessInput, type CardRules, type GroupRules } from './access';

const now = new Date(2026, 5, 15, 9, 0, 0); // 15.06.2026 09:00 lokal
const okCard: CardRules = { accessGranted: true, blocked: false, hasHolder: true };
const okGroup: GroupRules = { accessGranted: true, allowUnassigned: false };

function input(over: Partial<AccessInput> = {}): AccessInput {
  return { card: okCard, group: okGroup, presence: undefined, mode: 'auto', now, cooldownMs: 30_000, ...over };
}

describe('decideAccess', () => {
  it('lehnt unbekannte Karten ab', () => {
    expect(decideAccess(input({ card: undefined }))).toEqual({ outcome: 'denied', reason: 'UNKNOWN_CARD' });
  });

  it('lehnt gesperrte Karten in beide Richtungen ab', () => {
    const blocked = { ...okCard, blocked: true };
    expect(decideAccess(input({ card: blocked })).reason).toBe('CARD_BLOCKED');
    expect(decideAccess(input({ card: blocked, presence: { status: 'in', lastBookingAt: 0 } })).reason).toBe(
      'CARD_BLOCKED',
    );
  });

  it('bucht im Auto-Modus abwechselnd ein und aus', () => {
    expect(decideAccess(input())).toEqual({ outcome: 'granted', reason: 'OK', direction: 'in' });
    expect(decideAccess(input({ presence: { status: 'in', lastBookingAt: 0 } })).direction).toBe('out');
    expect(decideAccess(input({ presence: { status: 'out', lastBookingAt: 0 } })).direction).toBe('in');
  });

  it('respektiert feste Richtung (nur Eingang / nur Ausgang)', () => {
    const present = { status: 'in' as const, lastBookingAt: 0 };
    expect(decideAccess(input({ mode: 'in', presence: present })).direction).toBe('in');
    expect(decideAccess(input({ mode: 'out' })).direction).toBe('out');
  });

  it('erkennt Doppelscans innerhalb der Sperrzeit', () => {
    const presence = { status: 'in' as const, lastBookingAt: now.getTime() - 12_500 };
    expect(decideAccess(input({ presence }))).toEqual({
      outcome: 'duplicate',
      reason: 'DUPLICATE',
      direction: 'in',
      secondsSinceLast: 12,
    });
    const later = { status: 'in' as const, lastBookingAt: now.getTime() - 30_000 };
    expect(decideAccess(input({ presence: later })).outcome).toBe('granted');
  });

  it('automatische Buchungen (z. B. „Alle ausbuchen“) lösen keinen Doppelscan aus', () => {
    const presence = { status: 'out' as const, lastBookingAt: now.getTime() - 2000, bySystem: true };
    expect(decideAccess(input({ presence }))).toEqual({ outcome: 'granted', reason: 'OK', direction: 'in' });
  });

  it('prüft Gruppe, Karte und Zuordnung nur beim Eintritt', () => {
    const present = { status: 'in' as const, lastBookingAt: 0 };
    expect(decideAccess(input({ group: { ...okGroup, accessGranted: false } })).reason).toBe('GROUP_DISABLED');
    expect(decideAccess(input({ card: { ...okCard, accessGranted: false } })).reason).toBe('NO_PERMISSION');
    expect(decideAccess(input({ card: { ...okCard, hasHolder: false } })).reason).toBe('UNASSIGNED');
    // Ausbuchen bleibt möglich
    expect(
      decideAccess(input({ card: { ...okCard, accessGranted: false }, presence: present })),
    ).toEqual({ outcome: 'granted', reason: 'OK', direction: 'out' });
  });

  it('erlaubt Karten ohne Person, wenn die Gruppe das zulässt', () => {
    const unassigned = { ...okCard, hasHolder: false };
    expect(decideAccess(input({ card: unassigned, group: { ...okGroup, allowUnassigned: true } })).outcome).toBe(
      'granted',
    );
  });

  it('prüft Gültigkeitszeitraum inklusive Rändern', () => {
    const c = (validFrom?: string, validUntil?: string) => ({ ...okCard, validFrom, validUntil });
    expect(decideAccess(input({ card: c('2026-06-16') })).reason).toBe('NOT_YET_VALID');
    expect(decideAccess(input({ card: c('2026-06-15') })).outcome).toBe('granted');
    expect(decideAccess(input({ card: c(undefined, '2026-06-15') })).outcome).toBe('granted');
    expect(decideAccess(input({ card: c(undefined, '2026-06-14') })).reason).toBe('EXPIRED');
  });
});

describe('cardStatus', () => {
  it('liefert den passenden Status', () => {
    expect(cardStatus(okCard, okGroup, now)).toBe('active');
    expect(cardStatus({ ...okCard, blocked: true, accessGranted: false }, okGroup, now)).toBe('blocked');
    expect(cardStatus(okCard, { ...okGroup, accessGranted: false }, now)).toBe('group-disabled');
    expect(cardStatus({ ...okCard, accessGranted: false }, okGroup, now)).toBe('no-permission');
    expect(cardStatus({ ...okCard, hasHolder: false }, okGroup, now)).toBe('unassigned');
    expect(cardStatus({ ...okCard, validFrom: '2027-01-01' }, okGroup, now)).toBe('not-yet-valid');
    expect(cardStatus({ ...okCard, validUntil: '2026-01-01' }, okGroup, now)).toBe('expired');
  });
});
