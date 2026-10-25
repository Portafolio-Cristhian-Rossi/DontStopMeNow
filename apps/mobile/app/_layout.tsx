import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppProvider } from '../src/state/AppContext.tsx';
import { PlayerProvider } from '../src/state/PlayerContext.tsx';
import { fontFamilyFor } from '../src/ui/fontFamily.ts';
import { FONT_FILES } from '../src/ui/fonts.ts';
import { FontsLoadedContext } from '../src/ui/Text.tsx';
import { colors } from '../src/ui/theme.ts';

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.surfaceSide,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_FILES);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg);
  }, []);

  // Se espera a las tipografías para no mostrar un instante la del sistema; si fallan, se sigue sin ellas.
  if (!loaded && !error) return null;

  return (
    <FontsLoadedContext.Provider value={loaded}>
      <ThemeProvider value={theme}>
        <AppProvider>
          <PlayerProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: colors.bg },
                headerTintColor: colors.text,
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: loaded ? fontFamilyFor('display', '700') : undefined },
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="vincular"
                options={{ title: 'Vincular con la compu', headerShown: false }}
              />
              <Stack.Screen name="album/[id]" options={{ title: 'Álbum' }} />
              <Stack.Screen name="lista/[id]" options={{ title: 'Lista' }} />
              <Stack.Screen name="reproductor" options={{ title: 'Reproduciendo', presentation: 'modal' }} />
            </Stack>
          </PlayerProvider>
        </AppProvider>
      </ThemeProvider>
    </FontsLoadedContext.Provider>
  );
}
