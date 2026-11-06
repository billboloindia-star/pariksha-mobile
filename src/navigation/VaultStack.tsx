import { createNativeStackNavigator } from "@react-navigation/native-stack";
import VaultListScreen from "../screens/vault/VaultListScreen";
import VaultDetailScreen from "../screens/vault/VaultDetailScreen";
import type { LibraryItem } from "../../shared/types";

export type VaultStackParamList = {
  VaultList: undefined;
  VaultDetail: { item: LibraryItem };
};

const Stack = createNativeStackNavigator<VaultStackParamList>();

/** Nested inside the Vault tab so list -> detail pushes within the tab,
 * independent of the root stack's full-bleed exam flow (which VaultDetail's
 * "Start test" button escapes into via the root navigator). */
export default function VaultStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VaultList" component={VaultListScreen} />
      <Stack.Screen name="VaultDetail" component={VaultDetailScreen} />
    </Stack.Navigator>
  );
}
