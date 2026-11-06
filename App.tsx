import { useEffect, useState, useCallback } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold } from "@expo-google-fonts/plus-jakarta-sans";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";

import { configureStorage } from "./shared/storage";
import { configureApi } from "./shared/api";
import { rnStorage, hydrateStorage } from "./src/storage/rnStorage";
import { API_URL } from "./src/config";
import { SessionProvider } from "./src/session/SessionContext";
import RootNavigator from "./src/navigation/RootNavigator";
import { color } from "./src/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [storageReady, setStorageReady] = useState(false);
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold,
  });

  useEffect(() => {
    (async () => {
      await hydrateStorage();
      configureStorage(rnStorage);
      configureApi(API_URL);
      setStorageReady(true);
    })();
  }, []);

  const ready = storageReady && fontsLoaded;

  const onLayout = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: color.canvas }} onLayout={onLayout}>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}
