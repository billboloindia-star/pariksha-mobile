import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert, Image, Linking, Modal, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import { parsePaper } from "../../../shared/paper";
import { aiConversionPrompt, aiConversionPromptWithLinks } from "../../../shared/aiPrompt";
import type { LibraryFileLink, LibraryItem } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
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

function estMinutes(questionCount: number): number {
  return Math.max(1, Math.round((questionCount * 50) / 60));
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export default function VaultDetailScreen() {
  const navigation = useNavigation<Nav>();
  const rootNavigation = navigation.getParent<RootNav>() ?? (navigation as unknown as RootNav);
  const { item: initialItem } = useRoute<DetailRoute>().params;

  const [item, setItem] = useState<LibraryItem>(initialItem);
  const [fileLinks, setFileLinks] = useState<LibraryFileLink[] | null>(null);
  const [linksError, setLinksError] = useState("");
  const [previewing, setPreviewing] = useState<LibraryFileLink | null>(null);
  const [pdfViewer, setPdfViewer] = useState<LibraryFileLink | null>(null);
  const [pasted, setPasted] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(!initialItem.paper);

  useEffect(() => {
    api.getLibraryFileLinks(item.itemId).then((links) => {
      setFileLinks(links);
      const firstPdf = links.find((l) => /\.(jpe?g|png|gif|webp)$/i.test(l.fileName));
      if (firstPdf) setPreviewing(firstPdf);
    }).catch((e) => setLinksError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.itemId]);

  // The list screen hands over an item without its (potentially large) paper
  // field - fetch the full item once so "Ready"/"Start test" reflect reality.
  useEffect(() => {
    if (initialItem.paper) return;
    api.fetchLibraryItem(initialItem.itemId).then(setItem).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyPrompt() {
    const text = fileLinks ? aiConversionPromptWithLinks(fileLinks) : aiConversionPrompt;
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function loadYamlFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["text/yaml", "application/json", "text/plain", "*/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets.length) return;
    try {
      const text = await FileSystem.readAsStringAsync(res.assets[0].uri);
      setPasted(text);
      setSaveError("");
    } catch {
      setSaveError("Could not read that file.");
    }
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
      setConsoleOpen(false);
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
          setDeleting(true);
          try {
            await api.deleteLibraryItem(item.itemId);
            navigation.goBack();
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  const ready = !!item.paper;
  const totalSize = item.files.reduce((s, f) => s + f.fileSize, 0);
  const questionCount = item.paper?.questions.length ?? 0;
  const sectionCount = item.paper?.sections.length ?? 0;
  const activePreview = previewing ?? fileLinks?.[0] ?? null;
  const activeMeta = activePreview ? item.files.find((f) => f.fileName === activePreview.fileName) : undefined;
  const activeIsImage = activeMeta ? isImageType(activeMeta.fileType) : false;

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 56, paddingBottom: space.xxl }}>
      <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: space.lg }}>
        <Text style={styles.back}>← All papers</Text>
      </Pressable>

      {/* ---- boarding-pass ticket ---- */}
      <View style={styles.ticketWrap}>
        <LinearGradient
          colors={ready ? [color.inkNavy900, color.inkNavy700] : [color.inkNavy700, "#2a3f66"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ticketMain}
        >
          <View style={styles.ticketEyebrowRow}>
            <View style={[styles.liveDot, { backgroundColor: ready ? color.statusGood : color.statusWarn }]} />
            <Text style={styles.ticketEyebrow}>{ready ? "CONVERTED & SAVED" : "AWAITING CONVERSION"}</Text>
          </View>
          <Text style={styles.ticketTitle} numberOfLines={2}>{item.title}</Text>

          {ready ? (
            <View style={styles.routeRow}>
              <View style={styles.routeVal}><Text style={styles.routeValB}>{questionCount}</Text><Text style={styles.routeValLbl}>Questions</Text></View>
              <Text style={styles.routeArrow}>→</Text>
              <View style={styles.routeVal}><Text style={styles.routeValB}>{sectionCount}</Text><Text style={styles.routeValLbl}>Section{sectionCount === 1 ? "" : "s"}</Text></View>
              <Text style={styles.routeArrow}>→</Text>
              <View style={styles.routeVal}><Text style={styles.routeValB}>~{estMinutes(questionCount)}m</Text><Text style={styles.routeValLbl}>Est. time</Text></View>
            </View>
          ) : (
            <View style={styles.routeRow}>
              <View style={styles.routeVal}><Text style={styles.routeValB}>{item.files.length}</Text><Text style={styles.routeValLbl}>File{item.files.length === 1 ? "" : "s"}</Text></View>
              <Text style={styles.routeArrow}>→</Text>
              <View style={styles.routeVal}><Text style={styles.routeValB}>{fmtSize(totalSize)}</Text><Text style={styles.routeValLbl}>Size</Text></View>
            </View>
          )}

          <View style={styles.barcode}>
            {Array.from({ length: 24 }, (_, i) => (
              <View key={i} style={[styles.barcodeBar, { width: 1 + (i % 3), height: 18 + ((i * 13) % 20) }]} />
            ))}
          </View>
        </LinearGradient>

        <View style={styles.ticketNotchTop} />
        <View style={styles.ticketNotchBottom} />
        <View style={styles.ticketSeam} />

        <View style={[styles.ticketStub, ready ? styles.ticketStubReady : styles.ticketStubPending]}>
          <Text style={styles.stubStatusIcon}>{ready ? "✓" : "⏳"}</Text>
          <Text style={styles.stubLabel}>{ready ? "Ready" : "Pending"}</Text>
          {ready ? (
            <Pressable style={styles.stubBtn} onPress={() => rootNavigation.navigate("Review", { paper: item.paper! })}>
              <Text style={styles.stubBtnText}>Start test</Text>
              <Text style={styles.stubBtnSub}>tap to begin</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.stubBtn, styles.stubBtnPending]} onPress={() => setConsoleOpen(true)}>
              <Text style={styles.stubBtnText}>Convert now</Text>
              <Text style={styles.stubBtnSub}>copy the prompt</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ---- timeline ---- */}
      <View style={styles.timeline}>
        <View style={styles.tStep}>
          <View style={[styles.tDot, styles.tDotDone]}><Text style={styles.tDotText}>✓</Text></View>
          <Text style={styles.tLabel}>Uploaded</Text>
          <Text style={styles.tSub}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={[styles.tLine, ready && styles.tLineDone]} />
        <View style={styles.tStep}>
          <View style={[styles.tDot, ready && styles.tDotDone]}><Text style={styles.tDotText}>{ready ? "✓" : "2"}</Text></View>
          <Text style={styles.tLabel}>Converted</Text>
          <Text style={styles.tSub}>{ready ? `${questionCount} Qs` : "not yet"}</Text>
        </View>
        <View style={[styles.tLine, ready && styles.tLineDone]} />
        <View style={styles.tStep}>
          <View style={[styles.tDot, ready && styles.tDotDone]}><Text style={styles.tDotText}>{ready ? "✓" : "3"}</Text></View>
          <Text style={styles.tLabel}>Ready</Text>
          <Text style={styles.tSub}>{ready ? "anytime" : "—"}</Text>
        </View>
      </View>

      {/* ---- preview (images only - PDFs open externally, no webview dependency) ---- */}
      {activePreview && (
        <View style={styles.previewCard}>
          <View style={styles.previewHead}>
            <Text style={styles.previewFname} numberOfLines={1}>{activePreview.fileName}</Text>
            {fileLinks && fileLinks.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {fileLinks.map((f) => (
                    <Pressable key={f.fileName} style={[styles.fileTab, activePreview.fileName === f.fileName && styles.fileTabActive]} onPress={() => setPreviewing(f)}>
                      <Text style={[styles.fileTabText, activePreview.fileName === f.fileName && styles.fileTabTextActive]} numberOfLines={1}>{f.fileName}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
          {activeIsImage ? (
            <Image source={{ uri: activePreview.url }} style={styles.previewImg} resizeMode="contain" />
          ) : (
            <Pressable style={styles.previewOpenBtn} onPress={() => setPdfViewer(activePreview)}>
              <Text style={styles.previewOpenBtnText}>Open {activePreview.fileName} →</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ---- re-convert console ---- */}
      <Pressable style={styles.toggleRow} onPress={() => setConsoleOpen((v) => !v)}>
        <Text style={styles.toggleText}>View source files &amp; re-convert</Text>
        <Text style={[styles.toggleChev, consoleOpen && styles.toggleChevOpen]}>⌄</Text>
      </Pressable>

      {consoleOpen && (
        <View style={styles.console}>
          <View style={styles.consoleHead}>
            <View style={{ flexDirection: "row", gap: 5 }}>
              <View style={[styles.consoleDot, { backgroundColor: "#ff5f57" }]} />
              <View style={[styles.consoleDot, { backgroundColor: "#febc2e" }]} />
              <View style={[styles.consoleDot, { backgroundColor: "#28c840" }]} />
            </View>
            <Text style={styles.consoleHeadText}>re-convert — manual AI hand-off</Text>
          </View>

          <Text style={styles.stepNum}>1 · COPY THE PROMPT</Text>
          {linksError ? <Text style={styles.errorText}>Could not load download links: {linksError}</Text> : null}
          {fileLinks === null && !linksError && <ActivityIndicator color={color.sky} style={{ marginVertical: space.sm }} />}
          {fileLinks?.map((f) => (
            <View key={f.fileName} style={styles.fileRow}>
              <Text style={styles.fileRowName} numberOfLines={1}>{f.fileName}</Text>
              <Pressable onPress={() => Linking.openURL(f.url)}><Text style={styles.fileRowOpen}>Open</Text></Pressable>
            </View>
          ))}
          <View style={styles.btnRow}>
            <Pressable style={styles.consoleBtnPrimary} onPress={copyPrompt}>
              <Text style={styles.consoleBtnPrimaryText}>{copied ? "Copied!" : "Copy prompt"}</Text>
            </Pressable>
          </View>
          <Text style={styles.consoleHint}>
            {fileLinks
              ? "Paste into a web-enabled ChatGPT, Gemini, or Claude — it carries a direct link to this file."
              : "Paste the prompt into ChatGPT, Gemini, or Claude along with the file(s) above."}
          </Text>

          <View style={styles.consoleDivider} />

          <View style={styles.stepNumRow}>
            <Text style={styles.stepNum}>2 · PASTE OR UPLOAD</Text>
            <Pressable style={styles.uploadChip} onPress={loadYamlFile}>
              <Text style={styles.uploadChipText}>Upload .yml / .json</Text>
            </Pressable>
          </View>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            placeholder="paste the YAML or JSON the AI handed back…"
            placeholderTextColor={color.consoleText2}
            style={styles.pasteBox}
          />
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          {pasted.trim() ? (
            <Pressable style={[styles.consoleBtnPrimary, { marginTop: space.md }]} onPress={saveAsPaper} disabled={saving}>
              <Text style={styles.consoleBtnPrimaryText}>{saving ? "Saving…" : ready ? "Replace saved paper" : "Save as test paper"}</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {/* ---- delete zone ---- */}
      <View style={styles.deleteZone}>
        <View style={{ flex: 1 }}>
          <Text style={styles.deleteZoneTitle}>Remove this paper</Text>
          <Text style={styles.deleteZoneSub}>Deletes the file(s), the converted questions, and this entry — can't be undone.</Text>
        </View>
        <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={deleting}>
          {deleting ? <ActivityIndicator color={color.red} size="small" /> : <Text style={styles.deleteBtnText}>Delete</Text>}
        </Pressable>
      </View>
    </ScrollView>

    <Modal visible={pdfViewer !== null} animationType="slide" onRequestClose={() => setPdfViewer(null)}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={styles.pdfViewerBar}>
          <Text style={styles.pdfViewerTitle} numberOfLines={1}>{pdfViewer?.fileName}</Text>
          <Pressable onPress={() => setPdfViewer(null)} hitSlop={10}>
            <Text style={styles.pdfViewerClose}>Close</Text>
          </Pressable>
        </View>
        {pdfViewer && (
          <WebView
            source={{
              uri: Platform.OS === "android"
                ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(pdfViewer.url)}`
                : pdfViewer.url,
            }}
            style={{ flex: 1 }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.pdfViewerLoading}><ActivityIndicator color={color.sky} size="large" /></View>
            )}
          />
        )}
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },

  pdfViewerBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md,
    paddingTop: 56, paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: "#111",
  },
  pdfViewerTitle: { flex: 1, fontFamily: font.bodySemibold, fontSize: 14, color: "#fff" },
  pdfViewerClose: { fontFamily: font.bodySemibold, fontSize: 14, color: color.sky },
  pdfViewerLoading: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },

  ticketWrap: { marginBottom: space.lg },
  ticketMain: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.xl, paddingBottom: space.lg },
  ticketEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: space.sm },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  ticketEyebrow: { fontFamily: font.monoSemibold, fontSize: 10.5, color: "rgba(255,255,255,0.75)", letterSpacing: 0.6 },
  ticketTitle: { fontFamily: font.displayBlack, fontSize: 20, color: color.white, marginBottom: space.lg, lineHeight: 26 },
  routeRow: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.lg },
  routeVal: {},
  routeValB: { fontFamily: font.monoBold, fontSize: 18, color: color.white },
  routeValLbl: { fontFamily: font.body, fontSize: 10, color: "rgba(255,255,255,0.65)", marginTop: 1 },
  routeArrow: { color: "rgba(255,255,255,0.35)", fontSize: 14 },
  barcode: { flexDirection: "row", gap: 2, alignItems: "flex-end", height: 38 },
  barcodeBar: { backgroundColor: "rgba(255,255,255,0.4)" },

  ticketNotchTop: { position: "absolute", top: 0, left: "50%", marginLeft: -10, width: 20, height: 10, backgroundColor: color.canvas, borderRadius: 10, zIndex: 2 },
  ticketNotchBottom: { display: "none" },
  ticketSeam: { height: 0, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.25)", marginHorizontal: space.xl },

  ticketStub: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, padding: space.lg, flexDirection: "row", alignItems: "center", gap: space.md },
  ticketStubReady: { backgroundColor: color.inkNavy500 },
  ticketStubPending: { backgroundColor: "#3a4d70" },
  stubStatusIcon: { fontSize: 18, color: color.white },
  stubLabel: { fontFamily: font.bodySemibold, fontSize: 13, color: "rgba(255,255,255,0.85)", flex: 1 },
  stubBtn: { backgroundColor: color.sky, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, alignItems: "center" },
  stubBtnPending: { backgroundColor: color.amber },
  stubBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkNavy900 },
  stubBtnSub: { fontFamily: font.body, fontSize: 9, color: color.inkNavy900, opacity: 0.7 },

  timeline: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.lg, paddingHorizontal: space.xs },
  tStep: { alignItems: "center", width: 70 },
  tDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.surfaceSunken, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tDotDone: { backgroundColor: color.statusHigh },
  tDotText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.white },
  tLabel: { fontFamily: font.bodySemibold, fontSize: 11, color: color.ink },
  tSub: { fontFamily: font.body, fontSize: 9.5, color: color.inkDim },
  tLine: { flex: 1, height: 2, backgroundColor: color.surfaceSunken, marginTop: 13 },
  tLineDone: { backgroundColor: color.statusHigh },

  previewCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.lg, ...shadow.soft },
  previewHead: { marginBottom: space.sm, gap: 6 },
  previewFname: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.ink },
  fileTab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: color.surfaceSunken, maxWidth: 140 },
  fileTabActive: { backgroundColor: color.royal },
  fileTabText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  fileTabTextActive: { color: color.white },
  previewImg: { width: "100%", height: 220, borderRadius: radius.md, backgroundColor: color.surfaceSunken },
  previewOpenBtn: { backgroundColor: color.surfaceAlt, borderRadius: radius.md, padding: space.lg, alignItems: "center" },
  previewOpenBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.royal },

  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space.md, marginBottom: space.sm },
  toggleText: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.ink },
  toggleChev: { fontSize: 18, color: color.inkDim },
  toggleChevOpen: { transform: [{ rotate: "180deg" }] },

  console: { backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  consoleHead: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.lg },
  consoleDot: { width: 8, height: 8, borderRadius: 4 },
  consoleHeadText: { fontFamily: font.mono, fontSize: 11, color: color.consoleText },
  stepNum: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: color.sky, marginBottom: space.sm },
  stepNumRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm },
  fileRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  fileRowName: { flex: 1, fontFamily: font.mono, fontSize: 11.5, color: "#fff" },
  fileRowOpen: { fontFamily: font.bodySemibold, fontSize: 11.5, color: color.sky },
  btnRow: { marginTop: space.md },
  consoleBtnPrimary: { backgroundColor: color.sky, borderRadius: radius.pill, paddingVertical: 11, alignItems: "center" },
  consoleBtnPrimaryText: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.inkNavy900 },
  consoleHint: { fontFamily: font.body, fontSize: 11, color: color.consoleText, marginTop: space.sm, lineHeight: 16 },
  consoleDivider: { height: 1, backgroundColor: color.consoleLine, marginVertical: space.lg },
  uploadChip: { backgroundColor: color.consolePanel2, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: color.consoleLine2 },
  uploadChipText: { fontFamily: font.bodyMedium, fontSize: 10.5, color: color.consoleText },
  pasteBox: {
    fontFamily: font.mono, fontSize: 11.5, color: "#fff", minHeight: 140, textAlignVertical: "top",
    backgroundColor: color.consolePanel3, borderRadius: radius.md, borderWidth: 1, borderColor: color.consoleLine,
    padding: space.md,
  },
  errorText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.statusBad, marginTop: space.sm },

  deleteZone: {
    flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: color.redBg,
    borderRadius: radius.lg, padding: space.lg, marginTop: space.sm,
  },
  deleteZoneTitle: { fontFamily: font.bodySemibold, fontSize: 13, color: color.red, marginBottom: 2 },
  deleteZoneSub: { fontFamily: font.body, fontSize: 11, color: color.red, opacity: 0.8, lineHeight: 15 },
  deleteBtn: { backgroundColor: color.white, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 9, borderWidth: 1, borderColor: color.red },
  deleteBtnText: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.red },
});
