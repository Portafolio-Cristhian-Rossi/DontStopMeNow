import { useEffect, useState } from 'react';
import { AddToPlaylistDialog } from './AddToPlaylistDialog.tsx';
import { onAddToPlaylistRequest } from './addToPlaylist.ts';
import { notify } from './Toast.tsx';

/** Atiende los pedidos de `requestAddToPlaylist`; el resultado se avisa con el Toast. */
export function AddToPlaylistHost() {
  const [trackIds, setTrackIds] = useState<string[] | null>(null);

  useEffect(() => onAddToPlaylistRequest(setTrackIds), []);

  if (!trackIds) return null;
  return (
    <AddToPlaylistDialog
      trackIds={trackIds}
      onClose={(message) => {
        setTrackIds(null);
        if (message) notify(message);
      }}
    />
  );
}
