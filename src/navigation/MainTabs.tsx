import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { color, font } from "../theme";
import HomeScreen from "../screens/HomeScreen";
import ProfileScreen from "../screens/ProfileScreen";
import PastAttemptsScreen from "../screens/PastAttemptsScreen";
import InsightsScreen from "../screens/InsightsScreen";
import VaultStack from "./VaultStack";
import { HomeIcon, PastIcon, VaultIcon, InsightsIcon, ProfileIcon } from "../components/icons";

export type MainTabParamList = {
  Home: undefined;
  Past: undefined;
  Vault: undefined;
  Insights: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.royal,
        tabBarInactiveTintColor: color.inkFaint,
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 11 },
        tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.surfaceSunken },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color: c }) => <HomeIcon color={c} /> }} />
      <Tab.Screen name="Past" component={PastAttemptsScreen} options={{ tabBarIcon: ({ color: c }) => <PastIcon color={c} /> }} />
      <Tab.Screen name="Vault" component={VaultStack} options={{ tabBarIcon: ({ color: c }) => <VaultIcon color={c} /> }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ tabBarIcon: ({ color: c }) => <InsightsIcon color={c} /> }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: ({ color: c }) => <ProfileIcon color={c} /> }} />
    </Tab.Navigator>
  );
}
