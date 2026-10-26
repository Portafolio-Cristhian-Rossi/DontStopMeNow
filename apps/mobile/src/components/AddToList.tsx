import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { AccessibilityInfo, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../state/AppContext.tsx';
import { Text } from '../ui/Text.tsx';
import { colors, radius } from '../ui/theme.ts';
import { NameDialog } from './NameDialog.tsx';

/** Hoja "Agregar a lista": las listas propias (no las de carpeta) y crear una nueva con estas canciones. */
export function AddToList({ trackIds, onClose }: { trackIds: string[] | null; onClose(): void }) {
  const { catalog, addToPlaylist, createPlaylist } = useApp();
  const insets = useSafeAreaInsets();
  const [naming, setNaming] = useState<string[] | null>(null);
  const lists = useMemo(
    () =>
      (catalog?.playlists ?? [])
        .filter((p) => p.type === 'manual')
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [catalog],
  );

  const done = (message: string) => AccessibilityInfo.announceForAccessibility(message);

  return (
    <>
      <Modal
        visible={trackIds !== null}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
        {trackIds && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.grabber} />
            <Text font="display" style={styles.title} accessibilityRole="header">
              Agregar a lista
            </Text>
            <FlatList
              data={lists}
              keyExtractor={(p) => p.id}
              style={styles.list}
              ListHeaderComponent={
                <Pressable
                  onPress={() => {
                    onClose();
                    setNaming(trackIds);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.art, styles.artNew]}>
                    <Ionicons name="add" size={24} color={colors.accentText} />
                  </View>
                  <Text style={styles.name}>Nueva lista</Text>
                </Pressable>
              }
              renderItem={({ item }) => {
                const present = new Set(item.trackIds);
                const all = trackIds.every((id) => present.has(id));
                return (
                  <Pressable
                    disabled={all}
                    onPress={() => {
                      onClose();
                      addToPlaylist(item.id, trackIds);
                      done(`Agregada a ${item.name}`);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: all }}
                    accessibilityLabel={all ? `${item.name}, ya está` : item.name}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <View style={styles.art}>
                      <Ionicons name="list" size={22} color={colors.textSoft} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={[styles.name, all && styles.dim]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.muted}>
                        {item.trackIds.length === 1 ? '1 canción' : `${item.trackIds.length} canciones`}
                      </Text>
                    </View>
                    {all && <Text style={styles.muted}>Ya está</Text>}
                  </Pressable>
                );
              }}
            />
          </View>
        )}
      </Modal>
      {naming && (
        <NameDialog
          title="Nueva lista"
          confirmLabel="Crear"
          onClose={() => setNaming(null)}
          onSubmit={(name) => {
            createPlaylist(name, naming);
            done(`Lista ${name} creada`);
          }}
        />
      )}
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
    maxHeight: '75%',
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
  title: { fontSize: 20, fontWeight: '800', paddingHorizontal: 8, paddingBottom: 8 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: colors.surface3 },
  art: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artNew: { backgroundColor: colors.accent },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  dim: { color: colors.muted },
  muted: { color: colors.muted, fontSize: 13 },
});
