import { Redirect } from 'expo-router';
import { BottomTabBar, Tabs } from 'expo-router/tabs';
import { MiniPlayer } from '../../src/components/MiniPlayer.tsx';
import { useApp } from '../../src/state/AppContext.tsx';

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
    >
      <Tabs.Screen name="index" options={{ title: 'Biblioteca' }} />
      <Tabs.Screen name="descargas" options={{ title: 'Descargas' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
