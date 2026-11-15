import { describe, expect, it } from 'vitest';
import { decideAccess, personStatus, type AccessInput } from './access';

const now = new Date(2026, 5, 15, 9, 0, 0); // 15.06.2026 09:00 lokal
const okPerson = { accessGranted: true, cardBlocked: false };

function input(over: Partial<AccessInput> = {}): AccessInput {
  return { person: okPerson, presence: undefined, mode: 'auto', now, cooldownMs: 30_000, ...over };
}

describe('decideAccess', () => {
  it('lehnt unbekannte Ausweise ab', () => {
    expect(decideAccess(input({ person: undefined }))).toEqual({ outcome: 'denied', reason: 'UNKNOWN_CARD' });
  });

  it('lehnt gesperrte Ausweise in beide Richtungen ab', () => {
    const blocked = { ...okPerson, cardBlocked: true };
    expect(decideAccess(input({ person: blocked })).reason).toBe('CARD_BLOCKED');
    expect(
      decideAccess(input({ person: blocked, presence: { status: 'in', lastBookingAt: 0 } })).reason,
    ).toBe('CARD_BLOCKED');
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

  it('prüft Berechtigung und Gültigkeit nur beim Eintritt', () => {
    const noPerm = { ...okPerson, accessGranted: false };
    expect(decideAccess(input({ person: noPerm })).reason).toBe('NO_PERMISSION');
    // Ausbuchen bleibt möglich
    expect(
      decideAccess(input({ person: noPerm, presence: { status: 'in', lastBookingAt: 0 } })),
    ).toEqual({ outcome: 'granted', reason: 'OK', direction: 'out' });
  });

  it('prüft Gültigkeitszeitraum inklusive Rändern', () => {
    const p = (validFrom?: string, validUntil?: string) => ({ ...okPerson, validFrom, validUntil });
    expect(decideAccess(input({ person: p('2026-06-16') })).reason).toBe('NOT_YET_VALID');
    expect(decideAccess(input({ person: p('2026-06-15') })).outcome).toBe('granted');
    expect(decideAccess(input({ person: p(undefined, '2026-06-15') })).outcome).toBe('granted');
    expect(decideAccess(input({ person: p(undefined, '2026-06-14') })).reason).toBe('EXPIRED');
  });
});

describe('personStatus', () => {
  it('liefert den passenden Status', () => {
    expect(personStatus(okPerson, now)).toBe('active');
    expect(personStatus({ ...okPerson, cardBlocked: true, accessGranted: false }, now)).toBe('blocked');
    expect(personStatus({ ...okPerson, accessGranted: false }, now)).toBe('no-permission');
    expect(personStatus({ ...okPerson, validFrom: '2027-01-01' }, now)).toBe('not-yet-valid');
    expect(personStatus({ ...okPerson, validUntil: '2026-01-01' }, now)).toBe('expired');
  });
});
