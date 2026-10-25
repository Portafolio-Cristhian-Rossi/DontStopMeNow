import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { DownloadProgressContext, ScanStatusContext, useServerEvents } from '../api/events.ts';
import { Icon, type IconName } from './Icon.tsx';

const SECTIONS: { to: string; label: string; prefix: string; icon: IconName }[] = [
  { to: '/biblioteca/albumes', label: 'Biblioteca', prefix: '/biblioteca', icon: 'biblioteca' },
  { to: '/listas', label: 'Listas', prefix: '/listas', icon: 'listas' },
  { to: '/descargar', label: 'Descargar', prefix: '/descargar', icon: 'descargar' },
  { to: '/ajustes', label: 'Ajustes', prefix: '/ajustes', icon: 'ajustes' },
  { to: '/dispositivos', label: 'Dispositivos', prefix: '/dispositivos', icon: 'dispositivos' },
];

export function Layout() {
  const { scan: status, downloads } = useServerEvents();
  const { pathname } = useLocation();

  return (
    <ScanStatusContext.Provider value={status}>
      <DownloadProgressContext.Provider value={downloads}>
        <div className="app">
          <aside className="sidebar">
            <Link to="/" className="brand">
              <span className="brand-mark">
                <Icon name="logo" />
              </span>
              DontStopMeNow
            </Link>
            <nav className="nav" aria-label="Secciones">
              {SECTIONS.map((s) => (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={pathname.startsWith(s.prefix) ? 'active' : undefined}
                >
                  <Icon name={s.icon} />
                  {s.label}
                </NavLink>
              ))}
            </nav>
            <div className="server-status" role="status">
              <strong>
                <span className="dot" />
                Servidor activo
              </strong>
              <span className="muted">
                {status.running ? `Escaneando… ${status.processed}/${status.total}` : 'Biblioteca al día'}
              </span>
            </div>
          </aside>
          <main className="content">
            <Outlet />
          </main>
        </div>
      </DownloadProgressContext.Provider>
    </ScanStatusContext.Provider>
  );
}
