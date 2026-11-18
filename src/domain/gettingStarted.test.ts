import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HINTS } from '../help/hints';
import { HELP_TOPICS } from '../help/topics';
import { SETUP_STEPS, setupProgress, setupStates, toggleManualStep, type SetupFacts } from './gettingStarted';

const fresh: SetupFacts = { orgNameSet: false, realCards: 0, printedRealCards: 0, testCards: 14, scanned: false, operatorPin: false, backup: false };

describe('Erste Schritte', () => {
  it('neue Installation: nichts erledigt, als Nächstes der Organisationsname', () => {
    const p = setupProgress(setupStates(fresh, []));
    expect(p.done).toBe(0);
    expect(p.total).toBe(SETUP_STEPS.filter((s) => !s.optional).length);
    expect(p.complete).toBe(false);
    expect(p.next?.id).toBe('org');
  });

  it('erkennt Erledigtes aus den Daten, Testkarten zählen nicht', () => {
    const states = setupStates({ ...fresh, orgNameSet: true, realCards: 3, printedRealCards: 0, scanned: true }, []);
    const done = states.filter((s) => s.done).map((s) => s.step.id);
    expect(done).toEqual(['org', 'cards', 'scan']);
    expect(states.find((s) => s.step.id === 'cards')?.detected).toBe(true);
    expect(setupProgress(states).next?.id).toBe('groups');
  });

  it('von Hand abhaken – nur für Schritte, die nicht erkannt wurden; optionale zählen nicht', () => {
    const all: SetupFacts = { orgNameSet: true, realCards: 5, printedRealCards: 5, testCards: 0, scanned: true, operatorPin: false, backup: true };
    let manual = toggleManualStep([], 'groups', true);
    const p = setupProgress(setupStates(all, manual));
    expect(p.complete).toBe(true);
    expect(p.next?.id).toBe('screen'); // optionale bleiben als Vorschlag
    manual = toggleManualStep(manual, 'groups', false);
    expect(manual).toEqual([]);
    expect(setupProgress(setupStates(all, manual)).complete).toBe(false);
  });

  it('unbekannte IDs (z. B. aus einem alten Backup) werden beim Ändern entfernt', () => {
    expect(toggleManualStep(['alt', 'groups'], 'screen', true)).toEqual(['groups', 'screen']);
  });

  it('jeder Schritt verweist auf ein vorhandenes Hilfethema', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    for (const s of SETUP_STEPS) expect(ids.has(s.helpTopic), s.id).toBe(true);
    expect(new Set(SETUP_STEPS.map((s) => s.id)).size).toBe(SETUP_STEPS.length);
  });
});

describe('ⓘ-Hinweise', () => {
  it('Texte vorhanden, Hilfethemen existieren', () => {
    const ids = new Set(HELP_TOPICS.map((t) => t.id));
    for (const [key, hint] of Object.entries(HINTS) as [string, { text: string; topic?: string }][]) {
      expect(hint.text.length, key).toBeGreaterThan(40);
      if (hint.topic) expect(ids.has(hint.topic), `${key} → ${hint.topic}`).toBe(true);
    }
  });

  it('jeder Hinweis wird an einem Feld verwendet', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.tsx')) files.push(p);
      }
    };
    walk('src');
    const code = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const key of Object.keys(HINTS)) expect(code.includes(`hint="${key}"`), key).toBe(true);
  });
});
