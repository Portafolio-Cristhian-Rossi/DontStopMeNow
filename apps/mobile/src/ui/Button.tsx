import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text.tsx';
import { colors, radius, TOUCH } from './theme.ts';

type Variant = 'primary' | 'secondary' | 'danger';

interface Props {
  title: string;
  onPress(): void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const COLORS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, fg: colors.accentText, border: colors.accent },
  secondary: { bg: 'transparent', fg: colors.text, border: '#3A3B42' },
  danger: { bg: 'transparent', fg: colors.danger, border: '#3A3B42' },
};

/** Botón en forma de píldora. Reemplaza al `Button` nativo, que en Android no se puede estilizar. */
export function Button({
  title,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const c = COLORS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: c.bg, borderColor: c.border },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {icon && <Ionicons name={icon} size={18} color={c.fg} />}
        <Text style={[styles.label, { color: c.fg }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH + 4,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
