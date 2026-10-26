import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../ui/Button.tsx';
import { Text } from '../ui/Text.tsx';
import { TextInput } from '../ui/TextInput.tsx';
import { colors, radius } from '../ui/theme.ts';

/** Largo máximo que acepta el servidor para el nombre de una lista. */
const MAX_NAME = 100;

/**
 * Pide un nombre (lista nueva o renombrar). Se monta solo mientras está abierto, así cada vez arranca con el
 * nombre inicial.
 */
export function NameDialog({
  title,
  initial = '',
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  initial?: string;
  confirmLabel: string;
  onSubmit(name: string): void;
  onClose(): void;
}) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0;
  const submit = () => {
    if (!valid) return;
    onClose();
    onSubmit(name.trim());
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar" />
      <KeyboardAvoidingView behavior="padding" style={styles.center} pointerEvents="box-none">
        <View style={styles.card} accessibilityViewIsModal>
          <Text font="display" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Nombre de la lista"
            accessibilityLabel="Nombre de la lista"
            autoFocus
            maxLength={MAX_NAME}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={styles.buttons}>
            <Button title="Cancelar" onPress={onClose} style={styles.flex} />
            <Button
              title={confirmLabel}
              variant="primary"
              disabled={!valid}
              onPress={submit}
              style={styles.flex}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  card: {
    gap: 16,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#2A2B30',
  },
  title: { fontSize: 20, fontWeight: '800' },
  buttons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
