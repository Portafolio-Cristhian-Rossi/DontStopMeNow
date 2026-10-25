import { createContext, useContext } from 'react';
import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { fontFamilyFor, type FontKind } from './fontFamily.ts';
import { colors } from './theme.ts';

/** Si las tipografías no cargaron, se usa la del sistema (con su `fontWeight`). */
export const FontsLoadedContext = createContext(false);

interface Props extends TextProps {
  /** Texto normal, títulos (Bricolage) o números y códigos (JetBrains Mono). */
  font?: FontKind;
}

/** El `Text` de la app: color claro y la tipografía del diseño con el peso que pida el estilo. */
export function Text({ font = 'body', style, ...rest }: Props) {
  const loaded = useContext(FontsLoadedContext);
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontStyle: TextStyle = loaded
    ? { fontFamily: flat.fontFamily ?? fontFamilyFor(font, flat.fontWeight), fontWeight: undefined }
    : {};
  return <RNText {...rest} style={[styles.base, flat, fontStyle]} />;
}

const styles = StyleSheet.create({
  base: { color: colors.text, fontSize: 15 },
});
