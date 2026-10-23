import { Button, StyleSheet, View } from 'react-native';
import { usePlayer } from '../state/PlayerContext.tsx';

/** "Reproducir" y "Aleatorio" para un álbum o una lista. */
export function PlayButtons({ trackIds }: { trackIds: string[] }) {
  const player = usePlayer();
  return (
    <View style={styles.row}>
      <Button title="Reproducir" onPress={() => player.playList(trackIds, 0, { shuffle: false })} />
      <Button
        title="Aleatorio"
        onPress={() =>
          player.playList(trackIds, Math.floor(Math.random() * trackIds.length), { shuffle: true })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
