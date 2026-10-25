import { useContext } from 'react';
import { TextInput as RNTextInput, StyleSheet, type TextInputProps, type TextStyle } from 'react-native';
import { fontFamilyFor, type FontKind } from './fontFamily.ts';
import { FontsLoadedContext } from './Text.tsx';
import { colors, radius } from './theme.ts';

interface Props extends TextInputProps {
  font?: FontKind;
}

/** Campo de texto con el estilo del diseño: fondo oscuro, borde suave y texto claro. */
export function TextInput({ font = 'body', style, ...rest }: Props) {
  const loaded = useContext(FontsLoadedContext);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontStyle: TextStyle = loaded
    ? { fontFamily: fontFamilyFor(font, flat.fontWeight), fontWeight: undefined }
    : {};
  return (
    <RNTextInput
      placeholderTextColor={colors.faint}
      selectionColor={colors.accent}
      {...rest}
      style={[styles.base, flat, fontStyle]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#2A2B30',
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
  },
});
