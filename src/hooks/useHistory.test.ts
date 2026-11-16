import { describe, expect, it } from 'vitest';
import { pushHistory, redoHistory, undoHistory, type HistoryState } from './useHistory';

describe('Rückgängig/Wiederholen', () => {
  it('fasst zusammen, macht rückgängig und wiederholt', () => {
    let s: HistoryState<number> = { past: [], present: 0, future: [] };
    s = pushHistory(s, 1, false);
    s = pushHistory(s, 2, true); // zusammengefasst mit 1
    s = pushHistory(s, 3, false);
    expect(s.past).toEqual([0, 2]);
    s = undoHistory(s);
    expect(s.present).toBe(2);
    s = undoHistory(s);
    expect(s.present).toBe(0);
    expect(undoHistory(s)).toBe(s); // nichts mehr rückgängig zu machen
    s = redoHistory(s);
    expect(s.present).toBe(2);
    s = pushHistory(s, 7, false); // neue Änderung verwirft „Wiederholen“
    expect(s.future).toEqual([]);
    expect(pushHistory(s, 7, false)).toBe(s); // unverändert
  });
});
