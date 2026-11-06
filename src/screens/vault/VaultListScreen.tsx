import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert, RefreshControl } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import type { LibraryItem } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
import { UploadIcon, ChevronRightIcon } from "../../components/icons";
import type { VaultStackParamList } from "../../navigation/VaultStack";

type Nav = NativeStackNavigationProp<VaultStackParamList, "VaultList">;

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function VaultListScreen() {
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    return api.fetchLibrary().then(setItems).catch(() => setItems([]));
  }, []);

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

  const readyCount = (items ?? []).filter((it) => it.paper).length;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <FlatList
        data={items ?? []}
        keyExtractor={(it) => it.itemId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.royal} />}
        contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Paper Vault</Text>
            <Text style={styles.sub}>Upload a paper once, convert it with AI, come back to it anytime.</Text>

            {items !== null && items.length > 0 && (
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{items.length}</Text>
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
          </>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate("VaultDetail", { item })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {item.files.length} file{item.files.length === 1 ? "" : "s"} · {fmtSize(item.files.reduce((s, f) => s + f.fileSize, 0))}
              </Text>
              <View style={[styles.pill, item.paper ? styles.pillReady : styles.pillPending]}>
                <Text style={[styles.pillText, item.paper ? styles.pillTextReady : styles.pillTextPending]}>
                  {item.paper ? "Ready to test" : "Needs conversion"}
                </Text>
              </View>
            </View>
            <ChevronRightIcon color={color.inkFaint} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.displayBlack, fontSize: 26, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 14, color: color.inkDim, marginBottom: space.lg },
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
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, textAlign: "center", marginTop: space.xl },
  card: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.soft,
  },
  cardTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: color.ink, marginBottom: 4 },
  cardMeta: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: 8 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillReady: { backgroundColor: color.greenBg },
  pillPending: { backgroundColor: color.surfaceSunken },
  pillText: { fontFamily: font.bodyMedium, fontSize: 11 },
  pillTextReady: { color: color.green },
  pillTextPending: { color: color.inkDim },
});
