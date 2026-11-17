/** Notfallliste öffnen und sofort drucken (roter Knopf in Statusleiste und Navigation). */
export const EMERGENCY_PRINT_PATH = '/notfallliste?drucken=1';

/** Woher man kam – nach dem Drucken geht es dorthin zurück. */
export interface EmergencyNavState {
  from?: string;
}
