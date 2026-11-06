import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import type { ExamPlatform } from "../../shared/examPlatform";

/** React Native implementation of the exam engine's environment hooks.
 * "Away" (tab-switch equivalent) = the app leaving the foreground, which is
 * also RN's closest analog to "about to exit" for the save-flush hook — there
 * is no separate fullscreen/visibility concept on a phone, unlike the web. */
export const rnExamPlatform: ExamPlatform = {
  onAway(cb) {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") cb();
    });
    return () => sub.remove();
  },

  onConnectivity(cb) {
    const unsubscribe = NetInfo.addEventListener((state) => {
      cb(state.isConnected === true && state.isInternetReachable !== false);
    });
    NetInfo.fetch().then((state) => {
      cb(state.isConnected === true && state.isInternetReachable !== false);
    });
    return unsubscribe;
  },

  onWillExit(cb) {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") cb();
    });
    return () => sub.remove();
  },

  cleanupOnFinish() {
    // No RN equivalent of exiting fullscreen — nothing to do.
  },
};
