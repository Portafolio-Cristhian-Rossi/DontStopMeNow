import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.ts';
import { queryKeys, useDevices } from '../api/queries.ts';
import { Icon } from '../components/Icon.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { QrPayloadSchema } from '@dsmn/shared';

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
    // Margen de 4 módulos (el que pide el estándar): sin él, a la cámara le cuesta encontrar el código.
    void QRCode.toString(data.qrPayload, { type: 'svg', margin: 4 }).then((svg) => {
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

  const addresses = lanAddresses(data.qrPayload);

  return (
    <section className="card pairing" aria-labelledby="vincular">
      <div className="pairing-qr">
        <div className="qr">{qr && <img src={qr} alt="Código QR de vinculación" />}</div>
      </div>
      <div className="pairing-info">
        <h2 id="vincular">Vincular un celular</h2>
        <ol className="steps">
          <li>
            <span>Conectá el celular al mismo WiFi que esta compu.</span>
          </li>
          <li>
            <span>
              Abrí DontStopMeNow en el celular y tocá <strong>Vincular</strong>.
            </span>
          </li>
          <li>
            <span>Escaneá el código, o escribí la dirección y el código a mano.</span>
          </li>
        </ol>
        <div className="pairing-facts">
          <div className="fact">
            <span className="fact-label">Código</span>
            <span className="code">{data.code}</span>
            <span className="muted">
              Vence en {countdown(data.expiresAt - Math.max(now, pairing.dataUpdatedAt))}
            </span>
          </div>
          {addresses.length > 0 && (
            <div className="fact">
              <span className="fact-label">Dirección</span>
              <span className="address">{addresses[0]}</span>
              {addresses.length > 1 && (
                <span className="muted">También: {addresses.slice(1).join(', ')}</span>
              )}
            </div>
          )}
        </div>
        <div>
          <button type="button" onClick={() => void refetch()}>
            <Icon name="refrescar" size={18} />
            Generar otro código
          </button>
        </div>
      </div>
    </section>
  );
}

/** Las direcciones que lleva el QR, sin "http://", para escribirlas a mano en el celular. */
function lanAddresses(qrPayload: string): string[] {
  try {
    const parsed = QrPayloadSchema.safeParse(JSON.parse(qrPayload));
    return parsed.success ? parsed.data.urls.map((u) => u.replace(/^https?:\/\//, '')) : [];
  } catch {
    return [];
  }
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
      <PageHeader
        title="Dispositivos"
        subtitle="Vinculá tu celular para bajar música y escucharla sin conexión."
      />
      <PairingCard deviceCount={devices.data?.length} />

      <h2>Celulares vinculados</h2>
      {error && <p className="error">{error}</p>}
      {devices.data?.length ? (
        <ul className="list-plain">
          {devices.data.map((d) => (
            <li key={d.id} className="device-row">
              <Icon name="dispositivos" size={22} />
              <span>
                <strong>{d.name}</strong>
                <span className="muted">
                  Vinculado el {formatDate(d.createdAt)} · Visto por última vez:{' '}
                  {d.lastSeenAt ? formatDate(d.lastSeenAt) : 'Nunca'}
                </span>
              </span>
              <button type="button" className="small danger" onClick={() => void revoke(d.id, d.name)}>
                Revocar
              </button>
            </li>
          ))}
        </ul>
      ) : devices.isPending ? (
        <p className="muted">Cargando…</p>
      ) : (
        <p className="muted">Todavía no hay celulares vinculados.</p>
      )}
    </>
  );
}
