import { formatBytes } from '@dsmn/shared';
import { router } from 'expo-router';
import { Alert, Button, ScrollView, StyleSheet, Text } from 'react-native';
import { useApp } from '../../src/state/AppContext.tsx';

export default function Ajustes() {
  const { server, online, downloads, unpair, deleteAllDownloads } = useApp();
  const used = downloads.reduce((sum, d) => sum + d.size, 0);

  function confirmUnpair() {
    Alert.alert('Desvincular', 'Lo que ya bajaste queda en el celular.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: () => {
          unpair();
          router.replace('/vincular');
        },
      },
    ]);
  }

  function confirmDelete() {
    Alert.alert(
      'Borrar todo lo descargado',
      `Se liberan ${formatBytes(used)}. Podés volver a bajarlo después.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar', style: 'destructive', onPress: deleteAllDownloads },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.section}>Servidor</Text>
      <Text>{server?.name ?? 'Sin vincular'}</Text>
      <Text style={styles.muted}>{server?.url}</Text>
      <Text style={styles.muted}>
        {online === null ? 'Sin comprobar' : online ? 'Conectado' : 'No se encuentra en esta red'}
      </Text>
      <Button title="Desvincular" onPress={confirmUnpair} />

      <Text style={styles.section}>Almacenamiento</Text>
      <Text>
        {downloads.length} canciones · {formatBytes(used)}
      </Text>
      <Button
        title="Borrar todo lo descargado"
        color="#c33"
        disabled={downloads.length === 0}
        onPress={confirmDelete}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  section: { fontSize: 17, fontWeight: '600', marginTop: 16 },
  muted: { opacity: 0.6 },
});
