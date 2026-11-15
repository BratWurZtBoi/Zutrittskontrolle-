import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  id?: string;
}

/** Passwortfeld mit „Anzeigen“-Schalter (hilfreich auf dem Handy). */
export function PasswordInput({ value, onChange, autoComplete, autoFocus, id }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-input">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button type="button" className="btn btn-ghost btn-small" onClick={() => setVisible((v) => !v)}>
        {visible ? 'Verbergen' : 'Anzeigen'}
      </button>
    </div>
  );
}
