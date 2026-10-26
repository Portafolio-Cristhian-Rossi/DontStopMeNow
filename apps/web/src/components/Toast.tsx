import { useEffect, useState } from 'react';

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/** Muestra un aviso corto abajo a la derecha (por ejemplo, un error al guardar). */
export function notify(message: string): void {
  for (const listener of listeners) listener(message);
}

const VISIBLE_MS = 4000;

export function Toast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show: Listener = (text) => {
      clearTimeout(timer);
      setMessage(text);
      timer = setTimeout(() => setMessage(null), VISIBLE_MS);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast" role="alert" hidden={!message}>
      {message}
    </div>
  );
}
