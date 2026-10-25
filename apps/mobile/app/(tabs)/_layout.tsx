import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { BottomTabBar, Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { useApp } from '../../src/state/AppContext.tsx';
import { fontFamilyFor } from '../../src/ui/fontFamily.ts';
import { colors } from '../../src/ui/theme.ts';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );

export default function TabsLayout() {
  const { server } = useApp();
  if (!server) return <Redirect href="/vincular" />;
  return (
    <Tabs
      tabBar={(props) => (
        <>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: fontFamilyFor('display', '800'), fontSize: 24 },
        sceneStyle: { backgroundColor: colors.bg },
        // Sin alto fijo: la barra suma sola el espacio de la barra de navegación de Android.
        tabBarStyle: { backgroundColor: colors.surfaceSide, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fontFamilyFor('body', '600'), fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Biblioteca', tabBarIcon: icon('disc-outline') }} />
      <Tabs.Screen name="listas" options={{ title: 'Listas', tabBarIcon: icon('list') }} />
      <Tabs.Screen
        name="descargas"
        options={{ title: 'Descargas', tabBarIcon: icon('cloud-download-outline') }}
      />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icon('options-outline') }} />
    </Tabs>
  );
}
