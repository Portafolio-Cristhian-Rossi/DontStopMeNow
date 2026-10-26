import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

/** Pestañas de la Biblioteca (sin `<nav>` propio: la única navegación es la barra lateral). */
export function LibraryTabs({ children }: { children?: ReactNode }) {
  return (
    <div className="tabs-bar">
      <div className="tabs" role="group" aria-label="Vistas de la biblioteca">
        <NavLink to="/biblioteca/albumes" end>
          Álbumes
        </NavLink>
        <NavLink to="/biblioteca/artistas">Artistas</NavLink>
        <NavLink to="/biblioteca/canciones">Canciones</NavLink>
      </div>
      {children}
    </div>
  );
}
