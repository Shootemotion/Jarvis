'use client';

import { FormEvent, useState } from 'react';
import styles from './Jarvis.module.css';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * The bottom command bar. Presentational + a controlled input; the actual
 * send logic (POST /api/chat, state transitions) lives in the parent.
 */
export function JarvisCommandPanel({
  onSend,
  disabled = false,
  placeholder = 'Escribí un mensaje para JARVIS…',
}: Props) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  return (
    <form className={styles.panel} onSubmit={submit}>
      <input
        className={styles.input}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Mensaje para JARVIS"
      />
      <button
        className={styles.sendBtn}
        type="submit"
        disabled={disabled || !value.trim()}
      >
        Enviar
      </button>
    </form>
  );
}
