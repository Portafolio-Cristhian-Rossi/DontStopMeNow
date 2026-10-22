import { coverUrl } from '../api/client.ts';

export function Cover({ coverId, title }: { coverId: string | null; title: string }) {
  if (coverId) return <img className="cover" src={coverUrl(coverId)} alt="" loading="lazy" />;
  return (
    <div className="cover" aria-hidden="true">
      {title.trim().charAt(0).toUpperCase()}
    </div>
  );
}
