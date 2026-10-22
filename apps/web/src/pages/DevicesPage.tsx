import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useDevices } from '../api/queries.ts';

const pad = (n: number) => String(n).padStart(2, '0');

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

const formatDate = (ms: number) => new Date(ms).toLocaleString('es-AR');

/** Cada cuánto se revisa si se vinculó un celular mientras la página está abierta. */
const DEVICES_POLL_MS = 2500;

function PairingCard({ deviceCount }: { deviceCount: number | undefined }) {
  const pairing = useQuery({
    queryKey: ['pairing-code'],
    queryFn: api.pairingCode,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const data = pairing.data;
  const { refetch } = pairing;

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void QRCode.toString(data.qrPayload, { type: 'svg', margin: 0 }).then((svg) => {
      if (!cancelled) setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
    });
    // Al vencer, se pide un código nuevo.
    const timer = setTimeout(() => void refetch(), Math.max(0, data.expiresAt - Date.now()));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data, refetch]);

  // Un celular nuevo usó el código (es de un solo uso): se pide otro.
  const lastCount = useRef(deviceCount);
  useEffect(() => {
    if (deviceCount !== undefined && lastCount.current !== undefined && deviceCount > lastCount.current) {
      void refetch();
    }
    lastCount.current = deviceCount;
  }, [deviceCount, refetch]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  if (pairing.error) return <p className="error">{pairing.error.message}</p>;
  if (!data) return <p className="muted">Generando código…</p>;

  return (
    <div className="card toolbar" style={{ gap: '2rem', alignItems: 'flex-start' }}>
      <div className="qr">{qr && <img src={qr} alt="Código QR de vinculación" />}</div>
      <div>
        <p>Abrí la app en el celular y escaneá el código, o escribí:</p>
        <p className="code">{data.code}</p>
        <p className="muted">Vence en {countdown(data.expiresAt - Math.max(now, pairing.dataUpdatedAt))}</p>
      </div>
    </div>
  );
}

export function DevicesPage() {
  const devices = useDevices({ refetchInterval: DEVICES_POLL_MS });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string, name: string) {
    if (!window.confirm(`¿Revocar el acceso de ${name}? Tendrá que volver a vincularse.`)) return;
    setError(null);
    try {
      await api.revokeDevice(id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <h1>Dispositivos</h1>
      <h2>Vincular un celular</h2>
      <PairingCard deviceCount={devices.data?.length} />

      <h2>Celulares vinculados</h2>
      {error && <p className="error">{error}</p>}
      {devices.data?.length ? (
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Vinculado</th>
              <th>Visto por última vez</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {devices.data.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{formatDate(d.createdAt)}</td>
                <td>{d.lastSeenAt ? formatDate(d.lastSeenAt) : 'Nunca'}</td>
                <td>
                  <button type="button" className="small danger" onClick={() => void revoke(d.id, d.name)}>
                    Revocar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : devices.isPending ? (
        <p className="muted">Cargando…</p>
      ) : (
        <p className="muted">Todavía no hay celulares vinculados.</p>
      )}
    </>
  );
}
