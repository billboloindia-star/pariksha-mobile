import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { StorageAdapter } from "../../shared/storage";
import { SESSION_KEY } from "../../shared/api";

/** AsyncStorage-backed StorageAdapter for the native app, with the bearer
 * token routed to SecureStore instead (keychain/keystore-backed, not plain
 * AsyncStorage, since it's a credential).
 *
 * shared/storage.ts requires synchronous reads, but AsyncStorage/SecureStore
 * are promise-based — so everything relevant is pre-loaded into an in-memory
 * cache by hydrateStorage() once at app boot (before configureStorage() is
 * called), and writes persist to the native store in the background. */
const ASYNC_KEYS = [
  "exam_app_inprogress_paper",
  "exam_app_inprogress_progress",
  "exam_app_history",
];

const cache = new Map<string, string | null>();

export async function hydrateStorage(): Promise<void> {
  const entries = await AsyncStorage.multiGet(ASYNC_KEYS);
  for (const [key, value] of entries) cache.set(key, value);
  cache.set(SESSION_KEY, await SecureStore.getItemAsync(SESSION_KEY));
}

export const rnStorage: StorageAdapter = {
  getItem(key) {
    return cache.has(key) ? (cache.get(key) ?? null) : null;
  },
  setItem(key, value) {
    cache.set(key, value);
    if (key === SESSION_KEY) {
      SecureStore.setItemAsync(key, value).catch(() => {});
    } else {
      AsyncStorage.setItem(key, value).catch(() => {});
    }
  },
  removeItem(key) {
    cache.delete(key);
    if (key === SESSION_KEY) {
      SecureStore.deleteItemAsync(key).catch(() => {});
    } else {
      AsyncStorage.removeItem(key).catch(() => {});
    }
  },
};
