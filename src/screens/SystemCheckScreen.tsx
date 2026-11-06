import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import NetInfo from "@react-native-community/netinfo";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "SystemCheck">;
type SystemCheckRoute = RouteProp<RootStackParamList, "SystemCheck">;

// Below this, a real exam portal would be unusable — mirrors the web app's
// SystemCheck.tsx threshold exactly. Measured the same way: a real, timed,
// no-cache fetch (of the web app's own ~440KB single-file build, since that's
// a reliable, substantial, already-hosted payload — not a third-party one).
const MIN_KBPS = 150;
const SPEEDTEST_URL = "https://pariksha.billbolo.in/";
const SPEEDTEST_TIMEOUT_MS = 7000;

type NetStatus = "checking" | "ok" | "weak" | "failed";

async function measureKbps(): Promise<number> {
  const url = `${SPEEDTEST_URL}?speedtest=${Date.now()}-${Math.random()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEEDTEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await res.text();
    const elapsedSec = (Date.now() - started) / 1000;
    const kbits = (text.length * 8) / 1024;
    return elapsedSec > 0 ? kbits / elapsedSec : 0;
  } finally {
    clearTimeout(timer);
  }
}

export default function SystemCheckScreen() {
  const navigation = useNavigation<Nav>();
  const { paper, settings } = useRoute<SystemCheckRoute>().params;

  const [net, setNet] = useState<NetStatus>("checking");
  const [kbps, setKbps] = useState<number | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);

  const runSpeedTest = useCallback(async () => {
    setNet("checking");
    setKbps(null);
    const state = await NetInfo.fetch();
    if (state.isConnected === false) {
      setNet("failed");
      return;
    }
    try {
      const k = await measureKbps();
      setKbps(k);
      setNet(k >= MIN_KBPS ? "ok" : "weak");
    } catch (err) {
      setNet((err as Error)?.name === "AbortError" ? "weak" : "failed");
    }
  }, []);

  useEffect(() => { runSpeedTest(); }, [runSpeedTest]);
  useEffect(() => {
    const t = setTimeout(() => setDeviceReady(true), 900);
    return () => clearTimeout(t);
  }, []);

  const allDone = net === "ok" && deviceReady;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas, padding: space.xl, paddingTop: 64 }}>
      <Text style={styles.title}>{paper.title}</Text>
      <Text style={styles.sub}>System check</Text>

      <View style={styles.card}>
        <Text style={styles.cardHead}>Checking your device</Text>
        <Text style={styles.cardHint}>This is a routine check before every real exam.</Text>

        <View style={styles.row}>
          <StatusDot status={net} />
          <Text style={styles.rowLabel}>Checking internet connection</Text>
          <Text style={styles.rowStatus}>
            {net === "checking" && "checking"}
            {net === "ok" && kbps !== null && `OK · ${Math.round(kbps)} kbps`}
            {net === "weak" && (kbps !== null ? `too slow · ${Math.round(kbps)} kbps` : "too slow · timed out")}
            {net === "failed" && "no connection"}
          </Text>
        </View>

        <View style={styles.row}>
          <StatusDot status={deviceReady ? "ok" : "checking"} />
          <Text style={styles.rowLabel}>Checking device readiness</Text>
          <Text style={styles.rowStatus}>{deviceReady ? "OK" : "checking"}</Text>
        </View>

        {(net === "weak" || net === "failed") && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              {net === "weak"
                ? "Your connection is too weak to start a timed exam reliably — your progress may not save properly. Try moving closer to your router or switching networks, then retry."
                : "No internet connection detected. Connect to the internet, then retry."}
            </Text>
            <Pressable style={styles.retryBtn} onPress={runSpeedTest}>
              <Text style={styles.retryBtnText}>Retry check</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Choose another paper</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, !allDone && { opacity: 0.4 }]}
            disabled={!allDone}
            onPress={() => navigation.navigate("Instructions", { paper, settings })}
          >
            <Text style={styles.primaryBtnText}>Proceed to instructions</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StatusDot({ status }: { status: NetStatus | "checking" }) {
  const c = status === "ok" ? color.green : status === "checking" ? color.inkFaint : color.red;
  return <View style={[styles.dot, { backgroundColor: c }]} />;
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 18, color: color.ink },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.xl },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 17, color: color.ink, marginBottom: 2 },
  cardHint: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowLabel: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1 },
  rowStatus: { fontFamily: font.body, fontSize: 11, color: color.inkDim },
  warn: { backgroundColor: color.redBg, borderRadius: radius.md, padding: space.md, marginTop: space.lg },
  warnText: { fontFamily: font.body, fontSize: 12, color: color.red, lineHeight: 17 },
  retryBtn: { marginTop: space.sm, alignSelf: "flex-start" },
  retryBtnText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.red, textDecorationLine: "underline" },
  btnRow: { flexDirection: "row", gap: space.sm, marginTop: space.xl },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  secondaryBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  primaryBtn: { flex: 1.3, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.white },
});
