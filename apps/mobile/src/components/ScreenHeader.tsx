import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/Text.tsx';
import { colors } from '../ui/theme.ts';

/** Título grande de una pestaña (en lugar del encabezado nativo), con una línea de contexto debajo. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <Text font="display" style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  title: { fontSize: 32, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: colors.muted, fontSize: 14 },
});
