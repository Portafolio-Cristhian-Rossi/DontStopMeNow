import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../ui/theme.ts';

const SIZE = 216;
const CORNER = 40;
const STROKE = 4;
const SHADE = 'rgba(8,8,10,0.62)';

/**
 * Marco de escaneo sobre la cámara: oscurece alrededor, marca las esquinas y, mientras busca, hace pasar
 * una línea de arriba abajo (quieta si Android tiene "reducir movimiento").
 */
export function ScanFrame({ color, scanning }: { color: string; scanning: boolean }) {
  const [line] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!scanning || reduceMotion) return;
    const sweep = (to: number) =>
      Animated.timing(line, {
        toValue: to,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([sweep(1), sweep(0)]));
    loop.start();
    return () => loop.stop();
  }, [scanning, reduceMotion, line]);

  const translateY = line.interpolate({ inputRange: [0, 1], outputRange: [14, SIZE - 14] });
  const corner = { borderColor: color, width: CORNER, height: CORNER, position: 'absolute' as const };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.column}>
        <View style={styles.shade} />
        <View style={styles.middle}>
          <View style={styles.shade} />
          <View style={styles.frame}>
            <View style={[corner, styles.tl]} />
            <View style={[corner, styles.tr]} />
            <View style={[corner, styles.bl]} />
            <View style={[corner, styles.br]} />
            {scanning && !reduceMotion && (
              <Animated.View style={[styles.line, { transform: [{ translateY }] }]} />
            )}
          </View>
          <View style={styles.shade} />
        </View>
        <View style={[styles.shade, { flex: 1.15 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1 },
  middle: { flexDirection: 'row', height: SIZE },
  shade: { flex: 1, backgroundColor: SHADE },
  frame: { width: SIZE, height: SIZE },
  tl: { left: 0, top: 0, borderLeftWidth: STROKE, borderTopWidth: STROKE, borderTopLeftRadius: 18 },
  tr: { right: 0, top: 0, borderRightWidth: STROKE, borderTopWidth: STROKE, borderTopRightRadius: 18 },
  bl: { left: 0, bottom: 0, borderLeftWidth: STROKE, borderBottomWidth: STROKE, borderBottomLeftRadius: 18 },
  br: {
    right: 0,
    bottom: 0,
    borderRightWidth: STROKE,
    borderBottomWidth: STROKE,
    borderBottomRightRadius: 18,
  },
  line: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
