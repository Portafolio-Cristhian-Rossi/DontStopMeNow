import { Image, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppContext.tsx';

/** Portada desde el servidor si hay conexión; si no, la inicial del título. */
export function Cover({
  coverId,
  title,
  size = 56,
}: {
  coverId: string | null;
  title: string;
  size?: number;
}) {
  const { server, online } = useApp();
  const box = { width: size, height: size, borderRadius: size / 8 };
  if (coverId && server && online) {
    return (
      <Image
        style={[styles.base, box]}
        source={{
          uri: `${server.url}/api/covers/${encodeURIComponent(coverId)}`,
          headers: { Authorization: `Bearer ${server.token}` },
        }}
      />
    );
  }
  return (
    <View style={[styles.base, box]}>
      <Text style={{ fontSize: size / 2.5, fontWeight: '700', opacity: 0.5 }}>
        {title.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#8883', alignItems: 'center', justifyContent: 'center' },
});
