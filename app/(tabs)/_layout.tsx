import { Tabs } from 'expo-router'
import TabBar from '../../components/ui/TabBar'
import { ds } from '../../lib/theme'

// Navigation à 3 entrées (maquette) : Mon eau, Commandes, Support.
// Réglages et notifications s'ouvrent depuis l'en-tête de chaque onglet.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: ds.surface } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="support" />
    </Tabs>
  )
}
