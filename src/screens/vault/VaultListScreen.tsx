import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, RefreshControl, TextInput, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import type { LibraryItem } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
import { UploadIcon, ChevronRightIcon, SearchIcon } from "../../components/icons";
import type { VaultStackParamList } from "../../navigation/VaultStack";
import { useSession } from "../../session/SessionContext";

type Nav = NativeStackNavigationProp<VaultStackParamList, "VaultList">;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(fileType: string): boolean {
  return fileType.startsWith("image/");
}

export default function VaultListScreen() {
  const navigation = useNavigation<Nav>();
  const { session } = useSession();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    setLoadError("");
    return api.fetchLibrary()
      .then((r) => { setItems(r.items); setNextCursor(r.nextCursor ?? null); })
      .catch((err) => {
        // Previously swallowed silently here, so a failed fetch (auth,
        // network, anything) looked identical to "you have no papers" -
        // surface it instead so it's actually diagnosable.
        setItems([]);
        setLoadError(err instanceof Error ? err.message : "Couldn't load your papers.");
      });
  }, []);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.fetchLibrary(nextCursor);
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setNextCursor(r.nextCursor ?? null);
    } catch {
      // leave nextCursor as-is - the user can retry by scrolling again
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    load();
    return unsub;
  }, [navigation, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onUpload() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
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
      const item = await api.uploadLibraryFiles(encoded);
      setItems((prev) => [item, ...(prev ?? [])]);
    } catch (err) {
      Alert.alert("Upload failed", err instanceof Error ? err.message : "Could not upload those files.");
    } finally {
      setUploading(false);
    }
  }

  const readyCount = (items ?? []).filter((it) => it.hasPaper).length;
  const shown = useMemo(
    () => (items ?? []).filter((it) => it.title.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query]
  );

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <FlatList
        data={shown}
        keyExtractor={(it) => it.itemId}
        numColumns={2}
        columnWrapperStyle={{ gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.royal} />}
        contentContainerStyle={{ padding: space.xl, paddingTop: 0 }}
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={[color.inkNavy900, color.royal]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroIconWrap}>
                <Text style={styles.heroIcon}>📄</Text>
              </View>
              <Text style={styles.heroTitle}>Keep every paper you convert</Text>
              <Text style={styles.heroSub}>
                Upload the files once, run them through the AI-conversion prompt, paste back the result — it's
                saved here for good.
              </Text>
            </LinearGradient>

            {loadError !== "" && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>Couldn't load your papers — {loadError}</Text>
                <Pressable onPress={load}><Text style={styles.errorBannerRetry}>Retry</Text></Pressable>
              </View>
            )}

            {api.canUseBankFeature(session) && (
              <Pressable style={styles.bankBtn} onPress={() => navigation.navigate("MasterVault")}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bankBtnTitle}>Master Vault</Text>
                  <Text style={styles.bankBtnSub}>Your tagged question bank — build a custom practice session</Text>
                </View>
                <ChevronRightIcon color={color.white} />
              </Pressable>
            )}

            {items !== null && items.length > 0 && (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{items.length}{nextCursor ? "+" : ""}</Text>
                  <Text style={styles.statLabel}>Papers</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{readyCount}</Text>
                  <Text style={styles.statLabel}>Ready</Text>
                </View>
              </View>
            )}

            <Pressable style={styles.uploadBtn} onPress={onUpload} disabled={uploading}>
              {uploading ? <ActivityIndicator color={color.royal} /> : <UploadIcon color={color.royal} />}
              <Text style={styles.uploadBtnText}>{uploading ? "Uploading…" : "Upload a PDF or image"}</Text>
            </Pressable>

            {items === null && <ActivityIndicator style={{ marginTop: space.xl }} color={color.royal} />}
            {items !== null && items.length === 0 && (
              <Text style={styles.empty}>Nothing in your vault yet — upload a paper above.</Text>
            )}

            {items !== null && items.length > 0 && (
              <View style={styles.searchRow}>
                <SearchIcon color={color.inkFaint} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search your papers…"
                  placeholderTextColor={color.inkFaint}
                  value={query}
                  onChangeText={setQuery}
                />
              </View>
            )}
            {items !== null && items.length > 0 && shown.length === 0 && (
              <Text style={styles.empty}>No papers match "{query}".</Text>
            )}
          </>
        }
        renderItem={({ item }) => {
          const fileCount = item.files.length;
          const isImage = isImageType(item.files[0]?.fileType ?? "");
          return (
            <Pressable style={styles.card} onPress={() => navigation.navigate("VaultDetail", { item })}>
              <View style={styles.thumb}>
                {item.thumbnailUrl ? (
                  <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbImg} resizeMode="cover" />
                ) : (
                  <View style={styles.thumbMock}>
                    <View style={[styles.mockBar, { width: "70%", height: 8 }]} />
                    <View style={[styles.mockBar, { width: "100%" }]} />
                    <View style={[styles.mockBar, { width: "90%" }]} />
                    <View style={[styles.mockBar, { width: "60%" }]} />
                  </View>
                )}
                <View style={[styles.statusPill, item.hasPaper ? styles.pillReady : styles.pillPending]}>
                  <Text style={[styles.statusPillText, item.hasPaper ? styles.pillTextReady : styles.pillTextPending]}>
                    {item.hasPaper ? "✓ Ready" : "⏳ Converting"}
                  </Text>
                </View>
                <View style={styles.fileBadge}>
                  <Text style={styles.fileBadgeText}>{isImage ? "IMG" : "PDF"}{fileCount > 1 ? ` +${fileCount - 1}` : ""}</Text>
                </View>
              </View>
              <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {fmtSize(item.files.reduce((s, f) => s + f.fileSize, 0))} · {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </Pressable>
          );
        }}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={color.royal} style={{ marginTop: space.md }} /> : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 56, marginBottom: space.lg, borderRadius: radius.xl, padding: space.xl,
  },
  heroIconWrap: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center", marginBottom: space.md,
  },
  heroIcon: { fontSize: 20 },
  heroTitle: { fontFamily: font.displayBlack, fontSize: 21, color: color.white, marginBottom: 6, lineHeight: 26 },
  heroSub: { fontFamily: font.body, fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 18 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm,
    backgroundColor: color.redBg, borderRadius: radius.lg, padding: space.md, marginBottom: space.lg,
  },
  errorBannerText: { flex: 1, fontFamily: font.body, fontSize: 12.5, color: color.red },
  errorBannerRetry: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.red, textDecorationLine: "underline" },
  bankBtn: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    backgroundColor: color.royal, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg,
  },
  bankBtnTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },
  bankBtnSub: { fontFamily: font.body, fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  statsRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  statCard: { flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, alignItems: "center", ...shadow.soft },
  statValue: { fontFamily: font.monoBold, fontSize: 22, color: color.ink },
  statLabel: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2 },
  uploadBtn: {
    flexDirection: "row", gap: space.sm, alignItems: "center", justifyContent: "center",
    backgroundColor: color.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: color.royal,
    borderStyle: "dashed", paddingVertical: space.lg, marginBottom: space.lg,
  },
  uploadBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.royal },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.surface,
    borderRadius: radius.lg, paddingHorizontal: space.md, marginBottom: space.md, ...shadow.soft,
  },
  searchInput: { flex: 1, fontFamily: font.body, fontSize: 14, color: color.ink, paddingVertical: 12 },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, textAlign: "center", marginTop: space.xl },
  card: {
    flex: 1, backgroundColor: color.surface, borderRadius: radius.lg, padding: space.sm, marginBottom: space.md, ...shadow.soft,
  },
  thumb: { aspectRatio: 0.78, borderRadius: radius.md, overflow: "hidden", backgroundColor: color.surfaceSunken, marginBottom: space.sm },
  thumbImg: { width: "100%", height: "100%" },
  thumbMock: { flex: 1, padding: space.md, gap: 8, justifyContent: "center" },
  mockBar: { height: 5, borderRadius: 3, backgroundColor: color.surfaceAlt },
  statusPill: { position: "absolute", top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  pillReady: { backgroundColor: "rgba(21,152,61,0.92)" },
  pillPending: { backgroundColor: "rgba(11,24,48,0.72)" },
  statusPillText: { fontFamily: font.bodySemibold, fontSize: 9.5 },
  pillTextReady: { color: color.white },
  pillTextPending: { color: color.white },
  fileBadge: { position: "absolute", bottom: 8, right: 8, backgroundColor: "rgba(11,24,48,0.72)", paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.sm },
  fileBadgeText: { fontFamily: font.monoSemibold, fontSize: 9.5, color: color.white },
  cardTitle: { fontFamily: font.bodySemibold, fontSize: 13, color: color.ink, marginBottom: 3, lineHeight: 17 },
  cardMeta: { fontFamily: font.body, fontSize: 10.5, color: color.inkDim },
});
