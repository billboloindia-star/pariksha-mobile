import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import type { BankSectionSummary, Difficulty } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
import type { VaultStackParamList } from "../../navigation/VaultStack";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<VaultStackParamList, "MasterVault">;
type RootNav = NativeStackNavigationProp<RootStackParamList>;

const DIFFICULTIES: { value: Difficulty | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export default function MasterVaultScreen() {
  const navigation = useNavigation<Nav>();
  const rootNavigation = navigation.getParent<RootNav>() ?? (navigation as unknown as RootNav);

  const [sections, setSections] = useState<BankSectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [count, setCount] = useState("20");
  const [duration, setDuration] = useState("20");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.fetchBankSections().then(setSections).catch((e) => setLoadError(e.message));
  }, []);

  const sectionNames = useMemo(() => Array.from(new Set((sections ?? []).map((s) => s.section))), [sections]);

  useEffect(() => {
    if (!activeSection && sectionNames.length) setActiveSection(sectionNames[0]);
  }, [sectionNames, activeSection]);

  const chaptersForSection = useMemo(
    () => (sections ?? []).filter((s) => s.section === activeSection),
    [sections, activeSection]
  );

  const availableCount = useMemo(() => {
    const rows = chaptersForSection.filter((c) => selectedChapters.includes(c.chapter));
    if (!difficulty) return rows.reduce((n, c) => n + c.count, 0);
    return rows.reduce((n, c) => n + (c.byDifficulty[difficulty] ?? 0), 0);
  }, [chaptersForSection, selectedChapters, difficulty]);

  function changeSection(name: string) {
    setActiveSection(name);
    setSelectedChapters([]);
  }

  function toggleChapter(chapter: string) {
    setSelectedChapters((prev) => (prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]));
  }

  async function generate() {
    if (!activeSection || selectedChapters.length === 0) {
      Alert.alert("Pick a chapter", "Select at least one chapter to build a practice session.");
      return;
    }
    setGenerating(true);
    try {
      const paper = await api.generatePracticePaper({
        section: activeSection,
        chapters: selectedChapters,
        difficulty: difficulty || undefined,
        count: Math.max(1, Number(count) || 20),
        durationMinutes: Math.max(1, Number(duration) || 20),
        negativeMarking: 0.25,
      });
      rootNavigation.navigate("Review", { paper });
    } catch (err) {
      Alert.alert("Couldn't build that session", err instanceof Error ? err.message : "Try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64, paddingBottom: space.xxl }}>
      <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: space.lg }}>
        <Text style={styles.back}>← Paper Vault</Text>
      </Pressable>
      <Text style={styles.title}>Master Vault</Text>
      <Text style={styles.sub}>Your personal, tagged question bank — build a custom practice session.</Text>

      {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

      {sections === null && !loadError && <ActivityIndicator color={color.royal} style={{ marginTop: space.xl }} />}

      {sections !== null && sections.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            Nothing in your Master Vault yet — this fills up as study material gets ingested chapter by chapter.
          </Text>
        </View>
      )}

      {sections !== null && sections.length > 0 && (
        <>
          <View style={styles.card}>
            <Text style={styles.cardHead}>Browse your bank</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.md }}>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {sectionNames.map((name) => (
                  <Pressable
                    key={name}
                    style={[styles.sectionTab, activeSection === name && styles.sectionTabActive]}
                    onPress={() => changeSection(name)}
                  >
                    <Text style={[styles.sectionTabText, activeSection === name && styles.sectionTabTextActive]}>{name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <View style={styles.chapterGrid}>
              {chaptersForSection.map((c) => {
                const selected = selectedChapters.includes(c.chapter);
                return (
                  <Pressable
                    key={c.chapter}
                    style={[styles.chapterChip, selected && styles.chapterChipSelected]}
                    onPress={() => toggleChapter(c.chapter)}
                  >
                    <Text style={[styles.chapterChipText, selected && styles.chapterChipTextSelected]}>{c.chapter}</Text>
                    <View style={[styles.chapterCountBadge, selected && styles.chapterCountBadgeSelected]}>
                      <Text style={[styles.chapterCountText, selected && styles.chapterCountTextSelected]}>{c.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHead}>Build a practice session</Text>
            <Text style={styles.hint}>
              {selectedChapters.length === 0
                ? "Select one or more chapters above to start."
                : `${availableCount} question${availableCount === 1 ? "" : "s"} available.`}
            </Text>

            <Text style={styles.fieldLabel}>DIFFICULTY</Text>
            <View style={styles.diffRow}>
              {DIFFICULTIES.map((d) => (
                <Pressable
                  key={d.value}
                  style={[styles.diffBtn, difficulty === d.value && styles.diffBtnActive]}
                  onPress={() => setDifficulty(d.value)}
                >
                  <Text style={[styles.diffBtnText, difficulty === d.value && styles.diffBtnTextActive]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>NUMBER OF QUESTIONS</Text>
            <TextInput value={count} onChangeText={setCount} keyboardType="number-pad" style={styles.input} />

            <Text style={styles.fieldLabel}>DURATION (MINUTES)</Text>
            <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} />

            <Pressable
              style={[styles.startBtn, (generating || selectedChapters.length === 0) && { opacity: 0.5 }]}
              disabled={generating || selectedChapters.length === 0}
              onPress={generate}
            >
              <Text style={styles.startBtnText}>{generating ? "Building…" : "Start practice session"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },
  title: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.xl, lineHeight: 18 },
  errorText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.red },
  emptyText: { fontFamily: font.body, fontSize: 14, color: color.inkDim, lineHeight: 20 },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginBottom: space.md },
  sectionTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: color.surfaceSunken },
  sectionTabActive: { backgroundColor: color.royal, borderColor: color.royal },
  sectionTabText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  sectionTabTextActive: { color: color.white },
  chapterGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chapterChip: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: color.surfaceSunken,
  },
  chapterChipSelected: { borderColor: color.royal, backgroundColor: "#eaf1fd" },
  chapterChipText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink },
  chapterChipTextSelected: { color: color.royal },
  chapterCountBadge: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  chapterCountBadgeSelected: { backgroundColor: color.royal },
  chapterCountText: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim },
  chapterCountTextSelected: { color: color.white },
  hint: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.md },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: color.inkFaint, marginBottom: 6, marginTop: space.sm },
  diffRow: { flexDirection: "row", gap: space.sm },
  diffBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken, alignItems: "center" },
  diffBtnActive: { backgroundColor: color.royal, borderColor: color.royal },
  diffBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  diffBtnTextActive: { color: color.white },
  input: {
    fontFamily: font.body, fontSize: 15, color: color.ink, borderWidth: 1, borderColor: color.surfaceSunken,
    backgroundColor: color.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10,
  },
  startBtn: { backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: space.lg },
  startBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },
});
