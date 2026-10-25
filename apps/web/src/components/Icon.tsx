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
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
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
