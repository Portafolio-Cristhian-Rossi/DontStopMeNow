import { StyleSheet, View } from 'react-native';
import { usePlayer } from '../state/PlayerContext.tsx';
import { Button } from '../ui/Button.tsx';

/** "Reproducir" y "Aleatorio" para un álbum o una lista. */
export function PlayButtons({ trackIds }: { trackIds: string[] }) {
  const player = usePlayer();
  return (
    <View style={styles.row}>
      <Button
        title="Reproducir"
        icon="play"
        variant="primary"
        onPress={() => player.playList(trackIds, 0, { shuffle: false })}
      />
      <Button
        title="Aleatorio"
        icon="shuffle"
        onPress={() =>
          player.playList(trackIds, Math.floor(Math.random() * trackIds.length), { shuffle: true })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
});
