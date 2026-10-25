import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { AlbumPage } from './pages/AlbumPage.tsx';
import { AlbumsPage } from './pages/AlbumsPage.tsx';
import { ArtistsPage } from './pages/ArtistsPage.tsx';
import { DevicesPage } from './pages/DevicesPage.tsx';
import { DownloadPage } from './pages/DownloadPage.tsx';
import { NowPlayingPage } from './pages/NowPlayingPage.tsx';
import { PlaylistPage } from './pages/PlaylistPage.tsx';
import { PlaylistsPage } from './pages/PlaylistsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SongsPage } from './pages/SongsPage.tsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/biblioteca/albumes" replace />} />
        <Route path="biblioteca">
          <Route index element={<Navigate to="/biblioteca/albumes" replace />} />
          <Route path="albumes" element={<AlbumsPage />} />
          <Route path="albumes/:id" element={<AlbumPage />} />
          <Route path="artistas" element={<ArtistsPage />} />
          <Route path="canciones" element={<SongsPage />} />
        </Route>
        <Route path="listas" element={<PlaylistsPage />} />
        <Route path="listas/:id" element={<PlaylistPage />} />
        <Route path="descargar" element={<DownloadPage />} />
        <Route path="ajustes" element={<SettingsPage />} />
        <Route path="dispositivos" element={<DevicesPage />} />
        <Route path="reproduciendo" element={<NowPlayingPage />} />
      </Route>
    </Routes>
  );
}
