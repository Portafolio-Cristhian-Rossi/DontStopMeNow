import { Text, View } from 'react-native';
import { SERVER_PORT } from '../../src/version.ts';

export default function Biblioteca() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>DontStopMeNow · {SERVER_PORT}</Text>
    </View>
  );
}
