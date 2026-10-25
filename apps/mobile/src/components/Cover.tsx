import { coverColors, initials } from '@dsmn/shared';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppContext.tsx';
import { Text } from '../ui/Text.tsx';

/**
 * Portada guardada en el celular; si no está (o no carga), las iniciales sobre un color que sale del
 * título (el mismo que muestra la web).
 */
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
  const box = { width: size, height: size, borderRadius: Math.max(6, size / 7) };
  if (uri && !failed) {
    return <Image style={[styles.base, box]} source={{ uri }} onError={() => setFailed(true)} />;
  }
  const { background, color } = coverColors(title);
  return (
    <View style={[styles.base, box, { backgroundColor: background }]}>
      <Text font="display" style={{ color, fontSize: size / 2.8, fontWeight: '800' }}>
        {initials(title)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
