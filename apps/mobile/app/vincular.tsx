import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanFrame } from '../src/components/ScanFrame.tsx';
import {
  FOREIGN_QR,
  describePairingError,
  normalizeAddress,
  pairManually,
  pairWithQr,
  parseQr,
} from '../src/core/pairing.ts';
import type { FetchLike, PairedServer } from '../src/core/types.ts';
import { useApp } from '../src/state/AppContext.tsx';
import { Button } from '../src/ui/Button.tsx';
import { Text } from '../src/ui/Text.tsx';
import { TextInput } from '../src/ui/TextInput.tsx';
import { colors, radius, TOUCH } from '../src/ui/theme.ts';

const appFetch = fetch as unknown as FetchLike;
const deviceName = Device.modelName ?? 'Android';

type Kind = 'scan' | 'warn' | 'ok';
interface Status {
  kind: Kind;
  title: string;
  body: string;
  action?: { label: string; run(): void };
}

const SCANNING: Status = {
  kind: 'scan',
  title: 'Buscando el código',
  body: 'Apuntá a la pantalla de la compu. Se lee solo, no hace falta tocar nada.',
};

const LOOK: Record<Kind, { bg: string; border: string; iconBg: string; iconFg: string; frame: string }> = {
  scan: {
    bg: colors.surface,
    border: colors.border,
    iconBg: colors.surface3,
    iconFg: colors.text,
    frame: colors.text,
  },
  warn: {
    bg: colors.warnSoft,
    border: '#4A3A17',
    iconBg: colors.warn,
    iconFg: '#1F1606',
    frame: colors.warn,
  },
  ok: { bg: '#10241A', border: '#1E4A33', iconBg: colors.ok, iconFg: '#0B2416', frame: colors.ok },
};
const ICON: Record<Kind, ComponentProps<typeof Ionicons>['name']> = {
  scan: 'scan',
  warn: 'warning',
  ok: 'checkmark',
};

const hostOf = (url: string) => url.replace(/^https?:\/\//, '');

export default function Vincular() {
  const { pair, discovery } = useApp();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [status, setStatus] = useState<Status>(SCANNING);
  const [found, setFound] = useState<{ serverId: string; name: string; url: string }[]>([]);
  const [searching, setSearching] = useState(true);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // La cámara entrega el mismo QR muchas veces por segundo: el ref corta los repetidos antes del re-render,
  // y un QR que ya falló no se reintenta hasta tocar "Reintentar" o escanear otro distinto.
  const inFlight = useRef(false);
  const failedQr = useRef<string | null>(null);

  const listServers = useCallback(
    () =>
      discovery.list(4000).then((servers) => {
        setFound(servers);
        setSearching(false);
      }),
    [discovery],
  );

  // Al entrar ya se busca (`searching` arranca en true); "Buscar de nuevo" vuelve a hacerlo.
  useEffect(() => {
    void listServers();
  }, [listServers]);

  function search() {
    setSearching(true);
    void listServers();
  }

  async function attempt(action: () => Promise<PairedServer>, urls: string[], qr?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setStatus({ kind: 'ok', title: 'Código leído', body: `Vinculando con ${urls.map(hostOf).join(' o ')}…` });
    try {
      await pair(await action());
      router.replace('/');
    } catch (err) {
      if (qr) failedQr.current = qr;
      const problem = describePairingError(err, urls);
      setStatus({
        kind: 'warn',
        title: problem.title,
        body: problem.body,
        action: problem.retry
          ? { label: 'Reintentar', run: () => void attempt(action, urls, qr) }
          : undefined,
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onScanned({ data }: { data: string }) {
    if (inFlight.current || data === failedQr.current) return;
    const payload = parseQr(data);
    if (!payload) {
      failedQr.current = data;
      setStatus({ kind: 'warn', ...FOREIGN_QR });
      return;
    }
    void attempt(() => pairWithQr(payload, deviceName, appFetch), payload.urls, data);
  }

  const addressMissing = address.trim() === '';
  const codeShort = code.length < 6;

  function submit() {
    setTried(true);
    if (addressMissing || codeShort) return;
    let url: string;
    try {
      url = normalizeAddress(address);
    } catch {
      setStatus({
        kind: 'warn',
        title: 'Esa dirección no parece válida',
        body: 'Probá con algo como 192.168.1.8:4747.',
      });
      return;
    }
    void attempt(() => pairManually(address, code, deviceName, appFetch), [url]);
  }

  const look = LOOK[status.kind];
  const blocked = permission && !permission.granted && !permission.canAskAgain;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="musical-notes" size={18} color={colors.accentText} />
          </View>
          <Text font="display" style={styles.brandText}>
            DontStopMeNow
          </Text>
        </View>
        <Text font="display" style={styles.h1} accessibilityRole="header">
          Vinculá tu celular
        </Text>
        <Text style={styles.muted}>
          En la compu, abrí la web de DontStopMeNow, entrá a <Text style={styles.strong}>Dispositivos</Text> y
          apuntá la cámara al código.
        </Text>
      </View>

      <View style={styles.camera} accessibilityLabel="Escanear el código QR">
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={busy ? undefined : onScanned}
              enableTorch={torch}
            />
            <ScanFrame color={look.frame} scanning={status.kind === 'scan'} />
            <Pressable
              style={styles.torch}
              onPress={() => setTorch((on) => !on)}
              accessibilityRole="button"
              accessibilityState={{ selected: torch }}
              accessibilityLabel={torch ? 'Apagar la linterna' : 'Prender la linterna'}
            >
              <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={20} color={colors.text} />
            </Pressable>
          </>
        ) : permission ? (
          <View style={styles.noCamera}>
            <View style={styles.noCameraIcon}>
              <Ionicons name="videocam-off-outline" size={28} color={colors.textSoft} />
            </View>
            <Text style={styles.strong}>Sin cámara no podemos leer el código</Text>
            {blocked ? (
              <Button title="Abrir ajustes de Android" onPress={() => void Linking.openSettings()} />
            ) : (
              <Button title="Dar permiso" variant="primary" onPress={() => void requestPermission()} />
            )}
            <Text style={[styles.muted, styles.center]}>O vinculá a mano, más abajo.</Text>
          </View>
        ) : null}
      </View>

      <View
        style={[styles.status, { backgroundColor: look.bg, borderColor: look.border }]}
        accessibilityLiveRegion="polite"
      >
        <View style={[styles.statusIcon, { backgroundColor: look.iconBg }]}>
          <Ionicons name={ICON[status.kind]} size={18} color={look.iconFg} />
        </View>
        <View style={styles.statusText}>
          <Text style={styles.strong}>{status.title}</Text>
          <Text style={styles.soft}>{status.body}</Text>
          {status.action && (
            <Button
              title={status.action.label}
              onPress={() => {
                failedQr.current = null;
                status.action!.run();
              }}
              style={styles.statusAction}
              disabled={busy}
            />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text font="display" style={styles.h2} accessibilityRole="header">
            En tu WiFi
          </Text>
          {searching ? (
            <Text style={styles.small}>Buscando…</Text>
          ) : (
            <Pressable onPress={search} accessibilityRole="button" style={styles.link}>
              <Text style={styles.small}>Buscar de nuevo</Text>
            </Pressable>
          )}
        </View>
        {found.map((s) => {
          const host = hostOf(s.url);
          const picked = address.trim() === host;
          return (
            <View key={s.serverId} style={[styles.server, picked && styles.serverPicked]}>
              <View style={styles.serverIcon}>
                <Ionicons name="desktop-outline" size={22} color={colors.textSoft} />
              </View>
              <View style={styles.statusText}>
                <Text style={styles.strong} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text font="mono" style={styles.small}>
                  {host}
                </Text>
              </View>
              <Button
                title={picked ? 'Elegida' : 'Usar'}
                variant={picked ? 'primary' : 'secondary'}
                onPress={() => setAddress(host)}
                accessibilityLabel={`Usar ${s.name}`}
              />
            </View>
          );
        })}
        {!searching && found.length === 0 && (
          <Text style={styles.small}>
            No aparece ninguna. Fijate que el celular esté en el mismo WiFi que la compu.
          </Text>
        )}
      </View>

      <View style={styles.section}>
        <Text font="display" style={styles.h2} accessibilityRole="header">
          Vincular a mano
        </Text>
        <Text style={styles.small}>La dirección y el código están en la web, en Dispositivos.</Text>
        <Text style={styles.label}>Dirección de la compu</Text>
        <TextInput
          font="mono"
          value={address}
          onChangeText={setAddress}
          placeholder="192.168.1.8:4747"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="Dirección de la compu"
          style={tried && addressMissing ? styles.inputError : undefined}
        />
        {tried && addressMissing && (
          <Text style={styles.errorText}>Escribí la dirección o tocá «Usar» en una compu de arriba.</Text>
        )}
        <Text style={styles.label}>Código</Text>
        <TextInput
          font="mono"
          value={code}
          onChangeText={(text) =>
            setCode(
              text
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 6),
            )
          }
          placeholder="6 letras o números"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          accessibilityLabel="Código"
          style={[styles.code, tried && codeShort ? styles.inputError : undefined]}
        />
        <Text style={tried && codeShort ? styles.errorText : styles.small}>
          {tried && codeShort
            ? 'Al código le faltan caracteres: son 6, por ejemplo H9NDE8.'
            : 'Vence a los pocos minutos. Si venció, generá otro en la web.'}
        </Text>
        <Button
          title={busy ? 'Vinculando…' : 'Vincular'}
          variant="primary"
          onPress={submit}
          disabled={busy}
          style={styles.submit}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, gap: 22 },
  header: { gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { fontSize: 17, fontWeight: '700' },
  h1: { fontSize: 30, fontWeight: '800', lineHeight: 34 },
  h2: { fontSize: 19, fontWeight: '700' },
  muted: { color: colors.muted },
  soft: { color: colors.textSoft, fontSize: 14 },
  small: { color: colors.muted, fontSize: 13 },
  strong: { fontWeight: '600' },
  center: { textAlign: 'center' },
  camera: {
    height: 312,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#1B1C20',
    borderWidth: 1,
    borderColor: colors.border,
  },
  torch: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    backgroundColor: 'rgba(14,15,17,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCamera: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  noCameraIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
  statusIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statusText: { flex: 1, minWidth: 0, gap: 2 },
  statusAction: { alignSelf: 'flex-start', marginTop: 8 },
  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { minHeight: TOUCH, justifyContent: 'center' },
  server: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serverPicked: { borderColor: colors.text },
  serverIcon: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  code: { fontSize: 20, fontWeight: '700', letterSpacing: 3.5 },
  inputError: { borderColor: '#FF8A73' },
  errorText: { color: '#FFB4A3', fontSize: 13 },
  submit: { marginTop: 6 },
});
