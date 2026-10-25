import type { ReactNode } from 'react';

/** Trazos de 24×24 de cada ícono; se dibujan con el color del texto. */
const PATHS = {
  logo: (
    <>
      <path d="M5 15v-4" />
      <path d="M9.5 18V6" />
      <path d="M14 15V9" />
      <path d="M18.5 13v-2" />
    </>
  ),
  biblioteca: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  listas: (
    <>
      <path d="M4 6h12M4 11h12M4 16h7" />
      <circle cx="17.5" cy="17" r="2.5" />
      <path d="M20 17V8" />
    </>
  ),
  descargar: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  dispositivos: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17h2" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
  mas: <path d="M12 5v14M5 12h14" />,
  volver: <path d="M15 6l-6 6 6 6" />,
  carpeta: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  alerta: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  refrescar: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 5v6h-6" />
    </>
  ),
  play: <path d="M8 5l11 7-11 7z" fill="currentColor" />,
  pausa: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  anterior: (
    <>
      <path d="M18 6L9 12l9 6z" fill="currentColor" />
      <path d="M6 6v12" />
    </>
  ),
  siguiente: (
    <>
      <path d="M6 6l9 6-9 6z" fill="currentColor" />
      <path d="M18 6v12" />
    </>
  ),
  aleatorio: (
    <>
      <path d="M16 4h4v4" />
      <path d="M4 20L20 4" />
      <path d="M20 16v4h-4" />
      <path d="M15 15l5 5" />
      <path d="M4 4l5 5" />
    </>
  ),
  repetir: (
    <>
      <path d="M17 2l3 3-3 3" />
      <path d="M4 11V9a4 4 0 0 1 4-4h12" />
      <path d="M7 22l-3-3 3-3" />
      <path d="M20 13v2a4 4 0 0 1-4 4H4" />
    </>
  ),
  cola: (
    <>
      <path d="M4 6h16M4 12h10M4 18h10" />
      <path d="M17 14l4 3-4 3z" fill="currentColor" />
    </>
  ),
  volumen: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </>
  ),
  silencio: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9z" />
      <path d="M17 9l4 6M21 9l-4 6" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  corazon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  arrastrar: (
    <>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/** `filled` rellena el trazo (por ejemplo, el corazón de una favorita). */
export function Icon({
  name,
  size = 20,
  filled = false,
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
