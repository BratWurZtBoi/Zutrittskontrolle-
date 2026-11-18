/** Zeilenumbruch für das Zeichnen von Text (Canvas) – reine Funktion. */

/** Zeilenumbruch wie „white-space: pre-line“ + „overflow-wrap: anywhere“. */
export function wrapLines(text: string, width: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.replace(/[ \t]+/g, ' ').trim().split(' ').filter(Boolean);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= width || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
      // überlanges Wort zeichenweise umbrechen
      while (measure(line) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

