import { coverColors, initials } from '@dsmn/shared';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { useApp } from '../state/AppContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors } from '../ui/theme.ts';

/** Quieto este tiempo y después dos vueltas; igual que en la web. */
const STILL_MS = 3000;
const SPIN_MS = 2000;

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * La portada recortada como disco. Sonando: quieto unos segundos, dos vueltas rápidas y repite; en pausa
 * se congela donde esté. Con "reducir movimiento" de Android queda quieto.
 */
export function Disc({
  coverId,
  title,
  playing,
  size,
}: {
  coverId: string | null;
  title: string;
  playing: boolean;
  size: number;
}) {
  const { coverUri } = useApp();
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : coverUri(coverId);
  const reduceMotion = useReduceMotion();
  const [turn] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!playing || reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(STILL_MS),
        Animated.timing(turn, {
          toValue: 1,
          duration: SPIN_MS,
          easing: Easing.bezier(0.45, 0, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(turn, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [playing, reduceMotion, turn]);

  const rotate = useMemo(
    () => turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] }),
    [turn],
  );
  const fallback = coverColors(title);
  // Surcos: anillos concéntricos cada ~4 dp, del borde hacia el centro.
  const grooves = Array.from({ length: Math.floor(size / 10) }, (_, i) => size - 8 - i * 8).filter(
    (d) => d > size * 0.32,
  );

  return (
    <Animated.View
      accessible={size >= 120}
      accessibilityRole="image"
      accessibilityLabel={`Portada de ${title} como disco, ${playing ? 'sonando' : 'en pausa'}`}
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: uri ? colors.surface3 : fallback.background,
          transform: [{ rotate }],
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} onError={() => setFailed(true)} />
      ) : (
        size >= 120 && (
          <Text
            font="display"
            style={[styles.initials, { color: fallback.color, fontSize: size * 0.18, top: size * 0.12 }]}
          >
            {initials(title)}
          </Text>
        )
      )}
      {grooves.map((d) => (
        <View
          key={d}
          pointerEvents="none"
          style={[styles.ring, { width: d, height: d, borderRadius: d / 2 }]}
        />
      ))}
      <View
        pointerEvents="none"
        style={[styles.label, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 }]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.hole,
          { width: Math.max(6, size * 0.06), height: Math.max(6, size * 0.06), borderRadius: size },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disc: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { position: 'absolute', fontWeight: '800', letterSpacing: -1 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(0,0,0,0.14)' },
  label: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  hole: { position: 'absolute', backgroundColor: colors.bg },
});
