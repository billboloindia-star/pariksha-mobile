import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Image, Modal } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../shared/api";
import type { NoteClip } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "NoteClips">;

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default function NoteClipsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [clips, setClips] = useState<NoteClip[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<NoteClip | null>(null);

  useEffect(() => {
    api.fetchNoteClips().then(setClips).catch(() => setClips([]));
  }, []);

  const chapters = useMemo(() => {
    const set = new Set<string>();
    (clips ?? []).forEach((c) => set.add(c.chapter));
    return Array.from(set).sort();
  }, [clips]);

  const filtered = useMemo(() => {
    if (!clips) return [];
    if (filter === "all") return clips;
    return clips.filter((c) => c.chapter === filter);
  }, [clips, filter]);

  async function saveNote(c: NoteClip) {
    try {
      const updated = await api.updateNoteClipNote(c.clipId, noteDraft);
      setClips((prev) => prev?.map((x) => (x.clipId === c.clipId ? updated : x)) ?? null);
    } catch {
      setError("Couldn't save that note — try again.");
    }
    setEditingNote(null);
  }

  async function remove(c: NoteClip) {
    setClips((prev) => prev?.filter((x) => x.clipId !== c.clipId) ?? null);
    try {
      await api.removeNoteClip(c.clipId);
    } catch {
      setError("Couldn't remove that clip — refresh and try again.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.exitRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.exitRowText}>← Home</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxl }}>
        <Text style={styles.pageTitle}>My Clips</Text>
        <Text style={styles.pageSub}>Regions you've cropped out of the teacher's handwritten notes while studying.</Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {clips === null ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : clips.length === 0 ? (
          <Text style={styles.muted}>No clips yet — open any handwritten-notes page in Study Vault, tap the scissors icon, and drag to select a part worth saving.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              <Pressable style={[styles.filterChip, filter === "all" && styles.filterChipActive]} onPress={() => setFilter("all")}>
                <Text style={[styles.filterChipText, filter === "all" && styles.filterChipTextActive]}>All ({clips.length})</Text>
              </Pressable>
              {chapters.map((c) => (
                <Pressable key={c} style={[styles.filterChip, filter === c && styles.filterChipActive]} onPress={() => setFilter(c)}>
                  <Text style={[styles.filterChipText, filter === c && styles.filterChipTextActive]}>{c} ({clips.filter((x) => x.chapter === c).length})</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.grid}>
              {filtered.map((c) => (
                <View style={styles.card} key={c.clipId}>
                  <Pressable onPress={() => setZoomed(c)}>
                    <Image source={{ uri: c.imageUrl }} style={styles.cardImg} resizeMode="cover" />
                  </Pressable>
                  <View style={styles.cardBody}>
                    <View style={styles.tagRow}>
                      <View style={[styles.tag, styles.tagSection]}><Text style={styles.tagSectionText}>{c.section}</Text></View>
                      <View style={styles.tag}><Text style={styles.tagText}>{c.chapter}</Text></View>
                      {c.subConcept && <View style={[styles.tag, styles.tagSub]}><Text style={styles.tagSubText}>{c.subConcept}</Text></View>}
                    </View>

                    {editingNote === c.clipId ? (
                      <View>
                        <TextInput
                          style={styles.noteInput}
                          value={noteDraft}
                          onChangeText={setNoteDraft}
                          placeholder="Add a note…"
                          placeholderTextColor={color.inkFaint}
                          multiline
                        />
                        <View style={styles.rowActions}>
                          <Pressable onPress={() => saveNote(c)}><Text style={styles.rowAction}>Save</Text></Pressable>
                          <Pressable onPress={() => setEditingNote(null)}><Text style={[styles.rowAction, styles.rowActionDanger]}>Cancel</Text></Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        {c.note?.trim() ? <View style={styles.noteBox}><Text style={styles.noteText}><Text style={{ fontFamily: font.bodySemibold }}>Note: </Text>{c.note}</Text></View> : null}
                        <View style={styles.cardFoot}>
                          <Text style={styles.rowDate}>{timeAgo(c.createdAt)}</Text>
                          <View style={styles.rowActions}>
                            <Pressable onPress={() => { setEditingNote(c.clipId); setNoteDraft(c.note ?? ""); }}>
                              <Text style={styles.rowAction}>{c.note?.trim() ? "Edit note" : "Add note"}</Text>
                            </Pressable>
                            <Pressable onPress={() => remove(c)}><Text style={[styles.rowAction, styles.rowActionDanger]}>Remove</Text></Pressable>
                          </View>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(null)}>
        <Pressable style={styles.zoomBackdrop} onPress={() => setZoomed(null)}>
          <Pressable style={styles.zoomInner} onPress={(e) => e.stopPropagation()}>
            <View style={styles.zoomHead}>
              <Text style={styles.zoomHeadText} numberOfLines={1}>{zoomed?.chapter}{zoomed?.subConcept ? ` — ${zoomed.subConcept}` : ""}</Text>
              <Pressable onPress={() => setZoomed(null)}><Text style={styles.zoomClose}>✕</Text></Pressable>
            </View>
            {zoomed && <Image source={{ uri: zoomed.imageUrl }} style={styles.zoomImg} resizeMode="contain" />}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const CARD_W = 170;

const styles = StyleSheet.create({
  exitRow: { paddingHorizontal: space.xl, paddingBottom: 8 },
  exitRowText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.inkDim },

  pageTitle: { fontFamily: font.displayBlack, fontSize: 22, color: color.ink, marginBottom: 4 },
  pageSub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, lineHeight: 18, marginBottom: 18 },
  muted: { fontFamily: font.body, fontSize: 13, color: color.inkDim },
  errorText: { fontFamily: font.body, fontSize: 12.5, color: color.red, backgroundColor: color.redBg, borderRadius: 10, padding: 10, marginBottom: 14 },

  filterRow: { marginBottom: 16 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surface, marginRight: 8 },
  filterChipActive: { backgroundColor: color.ink, borderColor: color.ink },
  filterChipText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.inkDim },
  filterChipTextActive: { color: color.white },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { width: CARD_W, backgroundColor: color.surface, borderRadius: radius.md, overflow: "hidden", ...shadow.soft },
  cardImg: { width: CARD_W, height: CARD_W * 0.75, backgroundColor: color.surfaceAlt },
  cardBody: { padding: 10, gap: 6 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: color.surfaceAlt },
  tagText: { fontFamily: font.bodySemibold, fontSize: 9, color: color.inkDim },
  tagSection: { backgroundColor: "#1b3a6b" },
  tagSectionText: { fontFamily: font.bodySemibold, fontSize: 9, color: color.white },
  tagSub: { backgroundColor: "#e8f1fd" },
  tagSubText: { fontFamily: font.bodySemibold, fontSize: 9, color: "#1668b5" },

  noteBox: { backgroundColor: color.surfaceAlt, borderLeftWidth: 3, borderLeftColor: "#e8962a", borderRadius: 8, padding: 8 },
  noteText: { fontFamily: font.body, fontSize: 11, color: color.inkDim, lineHeight: 15 },
  noteInput: { borderWidth: 1.5, borderColor: color.surfaceSunken, borderRadius: 8, padding: 7, fontSize: 11.5, fontFamily: font.body, color: color.ink, minHeight: 44, marginBottom: 6, textAlignVertical: "top" },

  cardFoot: { gap: 4 },
  rowActions: { flexDirection: "row", gap: 12 },
  rowAction: { fontFamily: font.bodySemibold, fontSize: 11, color: color.royal },
  rowActionDanger: { color: color.inkFaint },
  rowDate: { fontFamily: font.body, fontSize: 10, color: color.inkFaint },

  zoomBackdrop: { flex: 1, backgroundColor: "rgba(5,10,20,0.9)", alignItems: "center", justifyContent: "center", padding: 20 },
  zoomInner: { backgroundColor: color.surface, borderRadius: radius.md, padding: 14, width: "100%", maxHeight: "90%" },
  zoomHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  zoomHeadText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.inkDim, flexShrink: 1, paddingRight: 10 },
  zoomClose: { fontSize: 18, color: color.inkDim, padding: 4 },
  zoomImg: { width: "100%", height: 420, borderRadius: 8, backgroundColor: color.surfaceAlt },
});
