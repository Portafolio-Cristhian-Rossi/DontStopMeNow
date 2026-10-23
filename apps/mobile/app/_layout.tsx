import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../src/state/AppContext.tsx';
import { PlayerProvider } from '../src/state/PlayerContext.tsx';

export default function RootLayout() {
  return (
    <AppProvider>
      <PlayerProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="vincular" options={{ title: 'Vincular con la compu' }} />
          <Stack.Screen name="album/[id]" options={{ title: 'Álbum' }} />
          <Stack.Screen name="lista/[id]" options={{ title: 'Lista' }} />
          <Stack.Screen name="reproductor" options={{ title: 'Reproduciendo', presentation: 'modal' }} />
        </Stack>
      </PlayerProvider>
    </AppProvider>
  );
}
