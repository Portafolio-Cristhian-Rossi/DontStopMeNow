import { NavLink, Outlet, useLocation } from 'react-router';
import { DownloadProgressContext, ScanStatusContext, useServerEvents } from '../api/events.ts';

const SECTIONS = [
  { to: '/biblioteca/albumes', label: 'Biblioteca', prefix: '/biblioteca' },
  { to: '/listas', label: 'Listas', prefix: '/listas' },
  { to: '/descargar', label: 'Descargar', prefix: '/descargar' },
  { to: '/ajustes', label: 'Ajustes', prefix: '/ajustes' },
  { to: '/dispositivos', label: 'Dispositivos', prefix: '/dispositivos' },
];

export function Layout() {
  const { scan: status, downloads } = useServerEvents();
  const { pathname } = useLocation();

  return (
    <ScanStatusContext.Provider value={status}>
      <DownloadProgressContext.Provider value={downloads}>
        <div className="app">
          <header className="topbar">
            <span className="brand">DontStopMeNow</span>
            <nav className="nav">
              {SECTIONS.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={pathname.startsWith(s.prefix) ? 'active' : undefined}
                >
                  {s.label}
                </NavLink>
              ))}
            </nav>
            {status.running && (
              <span className="scan-pill" role="status">
                Escaneando… {status.processed}/{status.total}
              </span>
            )}
          </header>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </DownloadProgressContext.Provider>
    </ScanStatusContext.Provider>
  );
}
