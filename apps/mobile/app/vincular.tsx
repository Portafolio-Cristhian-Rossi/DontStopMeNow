import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { pairManually, pairWithQr, parseQr } from '../src/core/pairing.ts';
import type { FetchLike, PairedServer } from '../src/core/types.ts';
import { useApp } from '../src/state/AppContext.tsx';

const appFetch = fetch as unknown as FetchLike;

export default function Vincular() {
  const { pair } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [deviceName, setDeviceName] = useState(Device.modelName ?? 'Android');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attempt(action: () => Promise<PairedServer>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      pair(await action());
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onScanned({ data }: { data: string }) {
    if (busy) return;
    const payload = parseQr(data);
    if (!payload) {
      setError('Ese código QR no es de DontStopMeNow.');
      return;
    }
    void attempt(() => pairWithQr(payload, deviceName.trim() || 'Android', appFetch));
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
          onBarcodeScanned={busy ? undefined : onScanned}
        />
      ) : (
        <Button title="Usar la cámara para escanear" onPress={() => void requestPermission()} />
      )}

      <Text style={styles.label}>Nombre de este celular</Text>
      <TextInput style={styles.input} value={deviceName} onChangeText={setDeviceName} />

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
  label: { fontSize: 13, opacity: 0.7, marginTop: 8 },
  section: { fontSize: 17, fontWeight: '600', marginTop: 24 },
  input: { borderWidth: 1, borderColor: '#8884', borderRadius: 8, padding: 10, fontSize: 16 },
  error: { color: '#d33', marginTop: 12, fontSize: 15 },
});
