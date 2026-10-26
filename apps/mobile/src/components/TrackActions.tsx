import { Ionicons } from '@expo/vector-icons';
import type { Track } from '@dsmn/shared';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext.tsx';
import { usePlayer } from '../state/PlayerContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors, radius } from '../ui/theme.ts';
import { AddToList } from './AddToList.tsx';
import { Cover } from './Cover.tsx';

function Action({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.textSoft} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Menú de una canción (botón "⋯" o mantener apretada la fila): favorita, encolar, agregar a una lista, ir a su
 * álbum y, dentro de una lista propia (`playlistId`), quitarla de esa lista.
 */
export function TrackActions({
  track,
  showAlbum = true,
  playlistId,
  onClose,
}: {
  track: Track | null;
  showAlbum?: boolean;
  playlistId?: string;
  onClose(): void;
}) {
  const player = usePlayer();
  const app = useApp();
  const [adding, setAdding] = useState<string[] | null>(null);
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const favorite = Boolean(track?.favoritedAt);

  return (
    <>
      <Modal
        visible={track !== null}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar el menú" />
        {track && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityRole="menu">
            <View style={styles.grabber} />
            <View style={styles.head}>
              <Cover coverId={track.coverId} title={track.title} size={48} />
              <View style={styles.headText}>
                <Text style={styles.title} numberOfLines={2}>
                  {track.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
            </View>
            <Action
              icon={favorite ? 'heart-dislike-outline' : 'heart-outline'}
              label={favorite ? 'Quitar de Favoritas' : 'Agregar a Favoritas'}
              onPress={run(() => app.setFavorite(track.id, !favorite))}
            />
            <Action
              icon="return-down-forward"
              label="Reproducir a continuación"
              onPress={run(() => player.playNext(track.id))}
            />
            <Action icon="list" label="Agregar a la cola" onPress={run(() => player.addToQueue(track.id))} />
            <Action
              icon="add-circle-outline"
              label="Agregar a lista…"
              onPress={run(() => setAdding([track.id]))}
            />
            {playlistId && (
              <Action
                icon="remove-circle-outline"
                label="Quitar de esta lista"
                onPress={run(() => app.removeFromPlaylist(playlistId, track.id))}
              />
            )}
            {showAlbum && (
              <Action
                icon="disc-outline"
                label="Ir al álbum"
                onPress={run(() => router.push({ pathname: '/album/[id]', params: { id: track.albumId } }))}
              />
            )}
            <Action icon="close" label="Cancelar" onPress={onClose} />
          </View>
        )}
      </Modal>
      <AddToList trackIds={adding} onClose={() => setAdding(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(6,6,8,0.66)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: '#2A2B30',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#3A3B42',
    marginVertical: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingBottom: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 13 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  actionText: { fontSize: 16, fontWeight: '500' },
  pressed: { backgroundColor: colors.surface3 },
});
