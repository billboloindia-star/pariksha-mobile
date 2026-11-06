import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import { parsePaper } from "../../../shared/paper";
import { aiConversionPrompt, aiConversionPromptWithLinks } from "../../../shared/aiPrompt";
import type { LibraryFileLink, LibraryItem } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
import { ChevronRightIcon } from "../../components/icons";
import type { VaultStackParamList } from "../../navigation/VaultStack";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<VaultStackParamList, "VaultDetail">;
type RootNav = NativeStackNavigationProp<RootStackParamList>;
type DetailRoute = RouteProp<VaultStackParamList, "VaultDetail">;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VaultDetailScreen() {
  const navigation = useNavigation<Nav>();
  const rootNavigation = navigation.getParent<RootNav>() ?? (navigation as unknown as RootNav);
  const { item: initialItem } = useRoute<DetailRoute>().params;

  const [item, setItem] = useState<LibraryItem>(initialItem);
  const [fileLinks, setFileLinks] = useState<LibraryFileLink[] | null>(null);
  const [linksError, setLinksError] = useState("");
  const [pasted, setPasted] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getLibraryFileLinks(item.itemId).then(setFileLinks).catch((e) => setLinksError(e.message));
  }, [item.itemId]);

  async function copyPrompt() {
    const text = fileLinks ? aiConversionPromptWithLinks(fileLinks) : aiConversionPrompt;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveAsPaper() {
    const res = parsePaper(pasted);
    if (res.error || !res.paper) {
      setSaveError(res.error ?? "Could not read that paper.");
      return;
    }
    setSaveError("");
    setSaving(true);
    try {
      const updated = await api.saveLibraryPaper(item.itemId, res.paper);
      setItem(updated);
      setPasted("");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save that paper.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete from vault?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          await api.deleteLibraryItem(item.itemId);
          navigation.goBack();
        },
      },
    ]);
  }

  const ready = !!item.paper;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}>
      <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: space.lg }}>
        <Text style={styles.back}>← All papers</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
      <Text style={styles.sub}>
        {item.files.length} file{item.files.length === 1 ? "" : "s"} · {fmtSize(item.files.reduce((s, f) => s + f.fileSize, 0))}
      </Text>

      <View style={styles.card}>
        <Text style={styles.stepLabel}>1 · Your files</Text>
        {linksError ? <Text style={styles.errorText}>Could not load download links: {linksError}</Text> : null}
        {fileLinks === null && !linksError && <ActivityIndicator color={color.royal} style={{ marginVertical: space.md }} />}
        {fileLinks?.map((f) => (
          <View key={f.fileName} style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>{f.fileName}</Text>
          </View>
        ))}

        <View style={styles.btnRow}>
          <Pressable style={styles.primaryBtn} onPress={copyPrompt}>
            <Text style={styles.primaryBtnText}>{copied ? "Copied!" : "Copy prompt"}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {fileLinks
            ? "This includes a direct link to your file(s) — paste it into a web-enabled ChatGPT, Gemini, or Claude and it'll fetch the file itself."
            : "Paste the prompt into ChatGPT, Gemini, or Claude along with the file(s) above."}
        </Text>
      </View>

      <View style={styles.card}>
        {ready ? (
          <>
            <Text style={styles.stepLabel}>2 · Saved paper</Text>
            <View style={styles.readyBanner}>
              <Text style={styles.readyBannerText}>
                Converted and saved — {item.paper!.questions.length} questions · {item.paper!.sections.length} section{item.paper!.sections.length === 1 ? "" : "s"}
              </Text>
            </View>
            <Pressable style={styles.startBtn} onPress={() => rootNavigation.navigate("Review", { paper: item.paper! })}>
              <Text style={styles.startBtnText}>Start test</Text>
              <ChevronRightIcon color={color.white} />
            </Pressable>
            <Text style={[styles.hint, { marginTop: space.md }]}>Want to replace it? Paste new YAML below.</Text>
          </>
        ) : (
          <Text style={styles.stepLabel}>2 · Paste the converted YAML</Text>
        )}
        <TextInput
          value={pasted}
          onChangeText={setPasted}
          multiline
          placeholder="paste the YAML or JSON the AI handed back…"
          placeholderTextColor={color.inkFaint}
          style={styles.pasteBox}
        />
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        {pasted.trim() ? (
          <Pressable style={[styles.primaryBtn, { marginTop: space.md }]} onPress={saveAsPaper} disabled={saving}>
            <Text style={styles.primaryBtnText}>{saving ? "Saving…" : ready ? "Replace saved paper" : "Save as test paper"}</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={confirmDelete} style={{ alignSelf: "center", marginTop: space.lg, marginBottom: space.xxl }}>
        <Text style={styles.deleteText}>Delete from vault</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },
  title: { fontFamily: font.display, fontSize: 20, color: color.ink, marginBottom: 2 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.xl },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  stepLabel: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkDim, marginBottom: space.md, textTransform: "uppercase", letterSpacing: 0.4 },
  fileRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  fileName: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink },
  btnRow: { marginTop: space.md },
  primaryBtn: { backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  primaryBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: space.sm, lineHeight: 17 },
  readyBanner: { backgroundColor: color.greenBg, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  readyBannerText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.green },
  startBtn: { flexDirection: "row", gap: 4, backgroundColor: color.ink, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  startBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },
  pasteBox: {
    fontFamily: font.mono, fontSize: 12, color: color.ink, minHeight: 140, textAlignVertical: "top",
    backgroundColor: color.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken,
    padding: space.md, marginTop: space.sm,
  },
  errorText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.red, marginTop: space.sm },
  deleteText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.red },
});
