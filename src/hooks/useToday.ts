import { useEffect, useState } from 'react';
import { toLocalDateString } from '../domain/dates';

/** Aktuelles Datum (YYYY-MM-DD) – wechselt um Mitternacht, damit „heute“ neu berechnet wird. */
export function useToday(): string {
  const [day, setDay] = useState(() => toLocalDateString(new Date()));
  useEffect(() => {
    const t = window.setInterval(() => setDay(toLocalDateString(new Date())), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return day;
}
