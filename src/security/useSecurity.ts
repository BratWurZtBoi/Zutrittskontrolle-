import { useSyncExternalStore } from 'react';
import { getSecurityState, subscribeSecurity, type SecurityState } from './session';

/** Aktueller Sicherheitszustand (entsperrt/gesperrt, Admin angemeldet). */
export function useSecurity(): SecurityState {
  return useSyncExternalStore(subscribeSecurity, getSecurityState);
}
