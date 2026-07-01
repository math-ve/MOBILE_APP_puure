import { Tabs } from 'expo-router'
import TabBar from '../../components/ui/TabBar'
import theme from '../../lib/theme'

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="subscription" />
      <Tabs.Screen name="filters" />
      <Tabs.Screen name="support" />
    </Tabs>
  )
}
