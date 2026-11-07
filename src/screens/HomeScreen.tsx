import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, Modal, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as api from "../../shared/api";
import { loadHistory, computeStreak } from "../../shared/history";
import { parsePaper } from "../../shared/paper";
import { demoPaper } from "../../shared/aiPrompt";
import type { AttemptRecord, LibraryItem } from "../../shared/types";
import { useSession } from "../session/SessionContext";
import { color, font, radius, space, shadow } from "../theme";
import HaloRing from "../components/HaloRing";
import { BellIcon, UploadIcon } from "../components/icons";
import type { MainTabParamList } from "../navigation/MainTabs";
import type { RootStackParamList } from "../navigation/types";

type TabNav = BottomTabNavigationProp<MainTabParamList, "Home">;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const { session } = useSession();
  const navigation = useNavigation<TabNav>();
  const rootNavigation = navigation.getParent<RootNav>() ?? (navigation as unknown as RootNav);
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [h, l] = await Promise.all([
      loadHistory().catch(() => [] as AttemptRecord[]),
      api.backendEnabled()
        ? api.fetchLibrary().then((r) => r.items).catch(() => [] as LibraryItem[])
        : Promise.resolve([] as LibraryItem[]),
    ]);
    setHistory(h);
    setLibrary(l);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");

  const streak = computeStreak((history ?? []).map((h) => h.when));
  const first = (session?.email.split("@")[0] ?? "there").replace(/[._-].*$/, "");
  const greeting = first.charAt(0).toUpperCase() + first.slice(1);

  async function onUpload() {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"], multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets.length) return;
    setUploading(true);
    try {
      const encoded = await Promise.all(
        res.assets.map(async (f) => ({
          fileName: f.name,
          fileType: f.mimeType || "application/octet-stream",
          fileBase64: await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 }),
        }))
      );
      await api.uploadLibraryFiles(encoded);
      navigation.navigate("Vault");
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not upload those files.");
    } finally {
      setUploading(false);
    }
  }

  function readPasted() {
    const res = parsePaper(pasted);
    if (res.error || !res.paper) {
      setPasteError(res.error ?? "Could not read that paper.");
      return;
    }
    setPasteOpen(false);
    setPasted("");
    setPasteError("");
    rootNavigation.navigate("Review", { paper: res.paper });
  }

  function loadDemo() {
    const res = parsePaper(demoPaper);
    if (res.paper) rootNavigation.navigate("Review", { paper: res.paper });
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.royal} />}
    >
      <View style={styles.headRow}>
        <View>
          <Text style={styles.greetingSmall}>Good {timeOfDay()}</Text>
          <Text style={styles.greetingName}>{greeting} 👋</Text>
        </View>
        <Pressable style={styles.bell}>
          <BellIcon color={color.ink} />
        </Pressable>
      </View>

      {streak > 0 && (
        <View style={styles.streakPill}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakText}>{streak}-day streak</Text>
            <Text style={styles.streakSub}>Keep going today</Text>
          </View>
          <View style={styles.liveDot} />
        </View>
      )}

      {history && history.length > 0 ? (
        <LinearGradient
          colors={["#0a1b36", "#1d4ed8", "#38bdf8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.continueCard}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.continueLabel}>Pick up where you left off</Text>
            <Text style={styles.continueTitle} numberOfLines={2}>{history[0].title}</Text>
            <Text style={styles.continueSub}>
              {history[0].correct + history[0].wrong} / {history[0].total} answered
            </Text>
          </View>
          <HaloRing percent={Math.round((history[0].net / history[0].total) * 100)} size={64} strokeWidth={6} label={`${Math.max(0, Math.round((history[0].net / history[0].total) * 100))}%`} labelColor={color.white} />
        </LinearGradient>
      ) : null}

      <Text style={styles.sectionTitle}>Start a new mock</Text>
      <View style={styles.sourceRow}>
        <Pressable style={styles.sourceBtn} onPress={onUpload} disabled={uploading}>
          <UploadIcon size={18} color={color.royal} />
          <Text style={styles.sourceBtnText}>{uploading ? "Uploading…" : "Upload"}</Text>
        </Pressable>
        <Pressable style={styles.sourceBtnGhost} onPress={() => setPasteOpen(true)}>
          <Text style={styles.sourceBtnGhostText}>Paste</Text>
        </Pressable>
        <Pressable style={styles.sourceBtnGhost} onPress={loadDemo}>
          <Text style={styles.sourceBtnGhostText}>Demo</Text>
        </Pressable>
      </View>

      <Modal visible={pasteOpen} transparent animationType="slide" onRequestClose={() => setPasteOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Paste a paper</Text>
            <Text style={styles.modalHint}>Paste JSON or YAML directly — handy for AI-converted text.</Text>
            <TextInput
              value={pasted}
              onChangeText={setPasted}
              multiline
              placeholder="paste JSON or YAML here…"
              placeholderTextColor={color.inkFaint}
              style={styles.pasteInput}
            />
            {pasteError ? <Text style={styles.pasteError}>{pasteError}</Text> : null}
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalSecondaryBtn} onPress={() => { setPasteOpen(false); setPasted(""); setPasteError(""); }}>
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={readPasted} disabled={!pasted.trim()}>
                <Text style={styles.modalPrimaryBtnText}>Read pasted paper</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.statsRow}>
        <StatCard label="Attempts" value={String((history ?? []).length)} />
        <StatCard label="Recent papers" value={String((library ?? []).length)} />
      </View>

      <View style={{ height: space.xxl }} />
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: space.xl, paddingTop: 64, paddingBottom: space.lg },
  greetingSmall: { fontFamily: font.body, fontSize: 14, color: color.inkDim },
  greetingName: { fontFamily: font.displayBlack, fontSize: 26, color: color.ink },
  bell: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", ...shadow.soft },

  streakPill: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    marginHorizontal: space.xl, backgroundColor: color.amberBg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: "#f3dcae", padding: space.md, marginBottom: space.lg,
  },
  streakEmoji: { fontSize: 22 },
  streakText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.amberDeep },
  streakSub: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.amber },

  continueCard: {
    flexDirection: "row", alignItems: "center", gap: space.lg,
    marginHorizontal: space.xl, borderRadius: radius.xl, padding: space.xl, marginBottom: space.xl,
    ...shadow.card,
  },
  continueLabel: { fontFamily: font.body, fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 2 },
  continueTitle: { fontFamily: font.displaySemibold, fontSize: 17, color: color.white, marginBottom: 4 },
  continueSub: { fontFamily: font.body, fontSize: 12, color: "rgba(255,255,255,0.75)" },

  sectionTitle: { fontFamily: font.displaySemibold, fontSize: 18, color: color.ink, marginHorizontal: space.xl, marginBottom: space.md },
  sourceRow: { flexDirection: "row", gap: space.sm, marginHorizontal: space.xl, marginBottom: space.xl },
  sourceBtn: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: color.surface, borderRadius: radius.md, paddingVertical: 12, ...shadow.soft },
  sourceBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },
  sourceBtnGhost: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken, paddingVertical: 12 },
  sourceBtnGhostText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.inkDim },

  statsRow: { flexDirection: "row", gap: space.sm, marginHorizontal: space.xl },
  statCard: { flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, alignItems: "center", ...shadow.soft },
  statValue: { fontFamily: font.monoBold, fontSize: 24, color: color.ink },
  statLabel: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(10,27,54,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: color.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl },
  modalTitle: { fontFamily: font.display, fontSize: 18, color: color.ink, marginBottom: 4 },
  modalHint: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: space.md },
  pasteInput: {
    fontFamily: font.mono, fontSize: 12, color: color.ink, minHeight: 160, textAlignVertical: "top",
    backgroundColor: color.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken, padding: space.md,
  },
  pasteError: { fontFamily: font.bodyMedium, fontSize: 12, color: color.red, marginTop: space.sm },
  modalBtnRow: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  modalSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  modalSecondaryBtnText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.inkDim },
  modalPrimaryBtn: { flex: 1.4, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  modalPrimaryBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },
});
