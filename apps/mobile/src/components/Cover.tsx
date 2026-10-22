import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../state/AppContext.tsx';

/** Portada guardada en el celular; si no está (o no carga), la inicial del título. */
export function Cover({
  coverId,
  title,
  size = 56,
}: {
  coverId: string | null;
  title: string;
  size?: number;
}) {
  const { coverUri } = useApp();
  const [failed, setFailed] = useState(false);
  const uri = coverUri(coverId);
  const box = { width: size, height: size, borderRadius: size / 8 };
  if (uri && !failed) {
    return <Image style={[styles.base, box]} source={{ uri }} onError={() => setFailed(true)} />;
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
