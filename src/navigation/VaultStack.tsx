import { createNativeStackNavigator } from "@react-navigation/native-stack";
import VaultListScreen from "../screens/vault/VaultListScreen";
import VaultDetailScreen from "../screens/vault/VaultDetailScreen";
import MasterVaultScreen from "../screens/vault/MasterVaultScreen";
import type { LibraryItem } from "../../shared/types";

export type VaultStackParamList = {
  VaultList: undefined;
  VaultDetail: { item: LibraryItem };
  MasterVault: { seedSection?: string; seedChapters?: string[] } | undefined;
};

const Stack = createNativeStackNavigator<VaultStackParamList>();

/** Nested inside the Vault tab so list -> detail pushes within the tab,
 * independent of the root stack's full-bleed exam flow (which VaultDetail's
 * and MasterVault's "start"/"start test" actions escape into via the root
 * navigator). MasterVault lives here rather than as its own bottom tab —
 * keeps the tab bar from growing for what's currently a single-user,
 * premium-gated feature. */
export default function VaultStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="VaultList" component={VaultListScreen} />
      <Stack.Screen name="VaultDetail" component={VaultDetailScreen} />
      <Stack.Screen name="MasterVault" component={MasterVaultScreen} />
    </Stack.Navigator>
  );
}
