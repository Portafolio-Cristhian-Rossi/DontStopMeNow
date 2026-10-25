import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../src/ui/Text.tsx';
import { TextInput } from '../src/ui/TextInput.tsx';
import { Button } from '../src/ui/Button.tsx';
import { colors } from '../src/ui/theme.ts';
import { pairManually, pairWithQr, parseQr } from '../src/core/pairing.ts';
import type { FetchLike, PairedServer } from '../src/core/types.ts';
import { useApp } from '../src/state/AppContext.tsx';

const appFetch = fetch as unknown as FetchLike;

export default function Vincular() {
  const { pair, discovery } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [deviceName, setDeviceName] = useState(Device.modelName ?? 'Android');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<{ serverId: string; name: string; url: string }[]>([]);
  // La cámara entrega el mismo QR muchas veces por segundo: el ref corta los repetidos antes del re-render,
  // y un QR que ya falló no se reintenta hasta escanear otro distinto.
  const inFlight = useRef(false);
  const failedQr = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void discovery.list(4000).then((servers) => {
      if (!cancelled) setFound(servers);
    });
    return () => {
      cancelled = true;
    };
  }, [discovery]);

  async function attempt(action: () => Promise<PairedServer>, qr?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await pair(await action());
      router.replace('/');
    } catch (err) {
      console.log('[vincular] falló', err);
      if (qr) failedQr.current = qr;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onScanned({ data }: { data: string }) {
    console.log('[vincular] QR leído', {
      data,
      inFlight: inFlight.current,
      repetido: data === failedQr.current,
    });
    if (inFlight.current || data === failedQr.current) return;
    const payload = parseQr(data);
    if (!payload) {
      failedQr.current = data;
      setError('Ese código QR no es de DontStopMeNow.');
      return;
    }
    void attempt(() => pairWithQr(payload, deviceName.trim() || 'Android', appFetch), data);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.help}>
        En la compu, abrí http://localhost:4747/dispositivos y escaneá el código QR. El celular tiene que
        estar en el mismo WiFi.
      </Text>

      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
      ) : (
        <Button title="Usar la cámara para escanear" onPress={() => void requestPermission()} />
      )}

      <Text style={styles.label}>Nombre de este celular</Text>
      <TextInput style={styles.input} value={deviceName} onChangeText={setDeviceName} />

      {found.length > 0 && (
        <>
          <Text style={styles.section}>Servidores encontrados en esta red</Text>
          {found.map((f) => (
            <Pressable key={f.serverId} style={styles.server} onPress={() => setAddress(f.url)}>
              <Text>{f.name}</Text>
              <Text style={styles.label}>{f.url} · tocá para usarlo y escribí el código</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.section}>Ingresar a mano</Text>
      <Text style={styles.label}>Dirección de la compu</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="192.168.1.10"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Text style={styles.label}>Código</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="ABC234"
        autoCapitalize="characters"
        maxLength={6}
      />
      <Button
        title={busy ? 'Vinculando…' : 'Vincular'}
        disabled={busy || !address.trim() || code.trim().length < 6}
        onPress={() =>
          void attempt(() => pairManually(address, code, deviceName.trim() || 'Android', appFetch))
        }
      />

      {error && <Text style={styles.error}>{error}</Text>}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  help: { fontSize: 15, marginBottom: 8 },
  camera: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  label: { fontSize: 13, color: colors.textSoft, marginTop: 8 },
  section: { fontSize: 17, fontWeight: '600', marginTop: 24 },
  input: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 8, padding: 10, fontSize: 16 },
  error: { color: colors.danger, marginTop: 12, fontSize: 15 },
  server: { paddingVertical: 8 },
});
