import { Redirect, Tabs } from 'expo-router';
import { useApp } from '../../src/state/AppContext.tsx';

export default function TabsLayout() {
  const { server } = useApp();
  if (!server) return <Redirect href="/vincular" />;
  return <Tabs />;
}
