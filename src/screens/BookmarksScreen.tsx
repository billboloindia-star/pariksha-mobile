import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../shared/api";
import type { Bookmark } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Bookmarks">;

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

export default function BookmarksScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [practicing, setPracticing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.fetchBookmarks().then(setBookmarks).catch(() => setBookmarks([]));
  }, []);

  const sections = useMemo(() => {
    const set = new Set<string>();
    (bookmarks ?? []).forEach((b) => set.add(b.section));
    return Array.from(set).sort();
  }, [bookmarks]);

  const filtered = useMemo(() => {
    if (!bookmarks) return [];
    if (filter === "all") return bookmarks;
    if (filter === "notes") return bookmarks.filter((b) => b.note && b.note.trim());
    return bookmarks.filter((b) => b.section === filter);
  }, [bookmarks, filter]);

  const chapters = useMemo(() => {
    const map = new Map<string, { section: string; topic: string; items: Bookmark[] }>();
    for (const b of filtered) {
      const key = `${b.section}::${b.topic}`;
      if (!map.has(key)) map.set(key, { section: b.section, topic: b.topic, items: [] });
      map.get(key)!.items.push(b);
    }
    return Array.from(map.values()).sort((a, b) => a.section.localeCompare(b.section) || a.topic.localeCompare(b.topic));
  }, [filtered]);

  async function saveNote(b: Bookmark) {
    try {
      const updated = await api.updateBookmarkNote(b.bookmarkId, noteDraft);
      setBookmarks((prev) => prev?.map((x) => (x.bookmarkId === b.bookmarkId ? updated : x)) ?? null);
    } catch {
      setError("Couldn't save that note — try again.");
    }
    setEditingNote(null);
  }

  async function remove(b: Bookmark) {
    setBookmarks((prev) => prev?.filter((x) => x.bookmarkId !== b.bookmarkId) ?? null);
    try {
      await api.removeBookmark(b.bookmarkId);
    } catch {
      setError("Couldn't remove that bookmark — refresh and try again.");
    }
  }

  async function practiceChapter(items: Bookmark[]) {
    const key = items.map((i) => i.bookmarkId).join(",");
    setPracticing(key);
    try {
      const paper = await api.practiceBookmarks(items.map((i) => i.bookmarkId));
      navigation.navigate("Review", { paper });
    } catch {
      setError("Couldn't start that practice session — try again.");
      setPracticing(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.exitRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.exitRowText}>← Home</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxl }}>
        <Text style={styles.pageTitle}>Bookmarks</Text>
        <Text style={styles.pageSub}>Every question you've starred, from any mock or practice session — organized by chapter.</Text>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {bookmarks === null ? (
          <ActivityIndicator style={{ marginTop: space.xl }} />
        ) : bookmarks.length === 0 ? (
          <Text style={styles.muted}>No bookmarks yet — tap the star on any question while taking a mock, or in its review, to save it here.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              <Pressable style={[styles.filterChip, filter === "all" && styles.filterChipActive]} onPress={() => setFilter("all")}>
                <Text style={[styles.filterChipText, filter === "all" && styles.filterChipTextActive]}>All ({bookmarks.length})</Text>
              </Pressable>
              {sections.map((s) => (
                <Pressable key={s} style={[styles.filterChip, filter === s && styles.filterChipActive]} onPress={() => setFilter(s)}>
                  <Text style={[styles.filterChipText, filter === s && styles.filterChipTextActive]}>{s} ({bookmarks.filter((b) => b.section === s).length})</Text>
                </Pressable>
              ))}
              <Pressable style={[styles.filterChip, filter === "notes" && styles.filterChipActive]} onPress={() => setFilter("notes")}>
                <Text style={[styles.filterChipText, filter === "notes" && styles.filterChipTextActive]}>Has notes ({bookmarks.filter((b) => b.note?.trim()).length})</Text>
              </Pressable>
            </ScrollView>

            {chapters.map((ch) => {
              const key = ch.items.map((i) => i.bookmarkId).join(",");
              return (
                <View style={styles.chapterCard} key={`${ch.section}::${ch.topic}`}>
                  <View style={styles.chapterHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chapterSection}>{ch.section.toUpperCase()}</Text>
                      <Text style={styles.chapterName}>{ch.topic}</Text>
                      <Text style={styles.chapterMeta}>{ch.items.length} bookmarked · {ch.items.filter((i) => i.note?.trim()).length} with notes</Text>
                    </View>
                    <Pressable style={styles.practiceAllBtn} disabled={practicing === key} onPress={() => practiceChapter(ch.items)}>
                      <Text style={styles.practiceAllBtnText}>{practicing === key ? "Starting…" : "Practice these →"}</Text>
                    </Pressable>
                  </View>

                  {ch.items.map((b) => (
                    <View style={styles.row} key={b.bookmarkId}>
                      <Text style={styles.rowStar}>★</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowText}>{b.text}</Text>
                        <View style={styles.rowMetaRow}>
                          {b.wasCorrect === true && <View style={[styles.tag, styles.tagRight]}><Text style={[styles.tagText, { color: color.green }]}>Got it right</Text></View>}
                          {b.wasCorrect === false && <View style={[styles.tag, styles.tagWrong]}><Text style={[styles.tagText, { color: color.red }]}>Got it wrong</Text></View>}
                          <Text style={styles.rowDate}>From {b.sourceLabel} · {timeAgo(b.createdAt)}</Text>
                        </View>

                        {editingNote === b.bookmarkId ? (
                          <View>
                            <TextInput
                              style={styles.noteInput}
                              value={noteDraft}
                              onChangeText={setNoteDraft}
                              placeholder="e.g. remember this formula, or silly mistake with signs…"
                              placeholderTextColor={color.inkFaint}
                              multiline
                            />
                            <View style={styles.rowActions}>
                              <Pressable onPress={() => saveNote(b)}><Text style={styles.rowAction}>Save</Text></Pressable>
                              <Pressable onPress={() => setEditingNote(null)}><Text style={[styles.rowAction, styles.rowActionDanger]}>Cancel</Text></Pressable>
                            </View>
                          </View>
                        ) : (
                          <>
                            {b.note?.trim() ? <View style={styles.noteBox}><Text style={styles.noteText}><Text style={{ fontFamily: font.bodySemibold }}>Note: </Text>{b.note}</Text></View> : null}
                            <View style={styles.rowActions}>
                              <Pressable onPress={() => { setEditingNote(b.bookmarkId); setNoteDraft(b.note ?? ""); }}>
                                <Text style={styles.rowAction}>{b.note?.trim() ? "Edit note" : "Add note"}</Text>
                              </Pressable>
                              <Pressable onPress={() => remove(b)}><Text style={[styles.rowAction, styles.rowActionDanger]}>Remove</Text></Pressable>
                            </View>
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

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

  chapterCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  chapterHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.sm, marginBottom: space.md },
  chapterSection: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 0.4, color: color.inkFaint },
  chapterName: { fontFamily: font.displaySemibold, fontSize: 15, color: color.ink, marginTop: 2 },
  chapterMeta: { fontFamily: font.body, fontSize: 11.5, color: color.inkFaint, marginTop: 2 },
  practiceAllBtn: { backgroundColor: color.ink, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 },
  practiceAllBtnText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: color.white },

  row: { flexDirection: "row", gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  rowStar: { fontSize: 15, color: "#d9740f", marginTop: 1 },
  rowText: { fontFamily: font.body, fontSize: 13, color: color.ink, lineHeight: 18, marginBottom: 6 },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagRight: { backgroundColor: "#e3f2e8" },
  tagWrong: { backgroundColor: "#fbe6e4" },
  tagText: { fontFamily: font.bodySemibold, fontSize: 10 },
  rowDate: { fontFamily: font.body, fontSize: 10.5, color: color.inkFaint },

  noteBox: { backgroundColor: color.surfaceAlt, borderLeftWidth: 3, borderLeftColor: "#e8962a", borderRadius: 8, padding: 10, marginBottom: 8 },
  noteText: { fontFamily: font.body, fontSize: 12, color: color.inkDim, lineHeight: 17 },
  noteInput: { borderWidth: 1.5, borderColor: color.surfaceSunken, borderRadius: 8, padding: 8, fontSize: 12.5, fontFamily: font.body, color: color.ink, minHeight: 50, marginBottom: 6, textAlignVertical: "top" },

  rowActions: { flexDirection: "row", gap: 16 },
  rowAction: { fontFamily: font.bodySemibold, fontSize: 12, color: color.royal },
  rowActionDanger: { color: color.inkFaint },
});
