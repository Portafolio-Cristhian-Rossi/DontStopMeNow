import { coverColors, initials } from '@dsmn/shared';
import { coverUrl } from '../api/client.ts';

// Los demás componentes los importan desde acá.
export { coverColors, initials };

export function Cover({ coverId, title }: { coverId: string | null; title: string }) {
  if (coverId) return <img className="cover" src={coverUrl(coverId)} alt="" loading="lazy" />;
  return (
    <div className="cover" aria-hidden="true" style={coverColors(title)}>
      {initials(title)}
    </div>
  );
}
