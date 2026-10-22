import { NavLink } from 'react-router';

export function LibraryTabs() {
  return (
    <nav className="tabs" aria-label="Biblioteca">
      <NavLink to="/biblioteca/albumes" end>
        Álbumes
      </NavLink>
      <NavLink to="/biblioteca/artistas">Artistas</NavLink>
      <NavLink to="/biblioteca/canciones">Canciones</NavLink>
    </nav>
  );
}
