import { describe, expect, it } from 'vitest';
import { cardSize, cardText } from './cardLayout';
import { defaultInvitation, entryText, invitationFilename, invitationValues, letterSalutation, longDate, mailingListCsv, selectInvitationGuests } from './invitation';
import { jpegPagePdf } from './pdf';
import { crc32, createZip } from './zip';

const occasion = { name: 'Sommerfest', date: '2026-12-12', location: 'Halle 1', entryFrom: '17:30', entryUntil: '19:00' };
const guest = { number: 7, category: 'VIP', person: { salutation: 'Herr', rank: 'Oberst', firstName: 'Max', lastName: 'Mustermann', company: 'Stab', email: 'max@example.com' } };

describe('Einladungen', () => {
  it('Briefanrede je nach Anrede', () => {
    expect(letterSalutation(guest.person)).toBe('Sehr geehrter Herr Oberst Mustermann');
    expect(letterSalutation({ salutation: 'Frau', firstName: 'Erika', lastName: 'Musterfrau' })).toBe('Sehr geehrte Frau Musterfrau');
    expect(letterSalutation({ firstName: 'Felix', lastName: 'Gast' })).toBe('Guten Tag Felix Gast');
    expect(letterSalutation(undefined)).toBe('Sehr geehrte Damen und Herren');
  });

  it('Datum ausgeschrieben, Einlass, Platzhalter', () => {
    expect(longDate('2026-12-12')).toBe('Samstag, 12. Dezember 2026');
    expect(entryText({ entryFrom: '17:30' })).toBe('ab 17:30 Uhr');
    const v = invitationValues(occasion, guest, 'Musterkommando');
    expect(v).toMatchObject({ name: 'Oberst Max Mustermann', nr: '7', einlass: '17:30 bis 19:00 Uhr', ort: 'Halle 1', einheit: 'Stab' });
    const text = { id: 't', type: 'text' as const, x: 0, y: 0, w: 50, size: 3, align: 'left' as const, bold: false, text: '{briefanrede},\nEinlass: {einlass}' };
    expect(cardText(text, v)).toBe('Sehr geehrter Herr Oberst Mustermann,\nEinlass: 17:30 bis 19:00 Uhr');
    // {begleitung}: „und eine Begleitperson“ bzw. leer – ohne doppelte Leerzeichen, Element bleibt sichtbar
    const body = { ...text, text: 'wir laden Sie {begleitung} herzlich ein.', hideIfEmpty: true };
    expect(cardText(body, v)).toBe('wir laden Sie herzlich ein.');
    expect(cardText(body, invitationValues(occasion, { ...guest, companions: 1 }, ''))).toBe('wir laden Sie und eine Begleitperson herzlich ein.');
    expect(cardText(body, invitationValues(occasion, { ...guest, companions: 3 }, ''))).toBe('wir laden Sie und 3 Begleitpersonen herzlich ein.');
  });

  it('Standard-Einladung A5 hoch, Formate A4/DIN lang', () => {
    const inv = defaultInvitation('o1');
    expect(cardSize(inv)).toEqual({ w: 148, h: 210 });
    expect(inv.elements.some((e) => e.type === 'qr')).toBe(true);
    expect(cardSize({ ...inv, format: 'a4' })).toEqual({ w: 210, h: 297 });
    expect(cardSize({ ...inv, format: 'dl', orientation: 'landscape' })).toEqual({ w: 210, h: 99 });
  });

  it('Dateiname nur ASCII, Versandliste mit Briefanrede und Datei', () => {
    expect(invitationFilename({ number: 3, person: { firstName: 'Jürgen', lastName: 'Größe-Weiß' } })).toBe('Einladung_003_Groesse-Weiss_Juergen.pdf');
    expect(invitationFilename({ number: 4 })).toBe('Einladung_004.pdf');
    const csv = mailingListCsv([{ ...guest, id: 'g', occasionId: 'o', token: 't', hasPerson: true, createdAt: 0, updatedAt: 0 }]);
    expect(csv.slice(1).split('\r\n')[1]).toBe('7;Herr;Oberst;Max;Mustermann;max@example.com;Sehr geehrter Herr Oberst Mustermann;Stab;VIP;Einladung_007_Mustermann_Max.pdf;');
    const withCompanion = mailingListCsv([{ ...guest, companions: 2, id: 'g', occasionId: 'o', token: 't', hasPerson: true, createdAt: 0, updatedAt: 0 }]);
    expect(withCompanion.slice(1).split('\r\n')[1]?.endsWith(';2 Begleitpersonen')).toBe(true);
  });
});

describe('Auswahl für den Serienbrief', () => {
  const list = [
    { number: 3, category: 'VIP', person: { firstName: 'A', lastName: 'A', email: 'a@example.com' } },
    { number: 1, category: 'Gast', person: { firstName: 'B', lastName: 'B' } },
    { number: 2, cancelled: true, person: { firstName: 'C', lastName: 'C' } },
    { number: 4, category: 'Gast', admittedAt: 1, person: { firstName: 'D', lastName: 'D', email: 'd@example.com' } },
  ];
  it('ohne stornierte, sortiert nach Nummer; Post/E-Mail/offen/Kategorie', () => {
    expect(selectInvitationGuests(list, 'all').map((g) => g.number)).toEqual([1, 3, 4]);
    expect(selectInvitationGuests(list, 'post').map((g) => g.number)).toEqual([1]);
    expect(selectInvitationGuests(list, 'mail').map((g) => g.number)).toEqual([3, 4]);
    expect(selectInvitationGuests(list, 'open').map((g) => g.number)).toEqual([1, 3]);
    expect(selectInvitationGuests(list, 'all', 'Gast').map((g) => g.number)).toEqual([1, 4]);
  });
});

describe('PDF und ZIP (ohne Bibliotheken)', () => {
  it('PDF: Kopf, Seitengröße in Punkt, Querverweise stimmen', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = jpegPagePdf(jpeg, { w: 10, h: 20 }, { w: 148, h: 210 });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox [0 0 419.53 595.28]');
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const firstObj = Number(/0000000000 65535 f \n(\d{10})/.exec(text)![1]);
    expect(text.slice(firstObj, firstObj + 7)).toBe('1 0 obj');
  });

  it('CRC-32 und ZIP-Aufbau', () => {
    expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');
    const zip = createZip([
      { name: 'a.txt', data: new TextEncoder().encode('Hallo') },
      { name: 'ü.pdf', data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const cdOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
  });
});
