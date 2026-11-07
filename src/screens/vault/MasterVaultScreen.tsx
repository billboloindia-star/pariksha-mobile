import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import * as api from "../../../shared/api";
import type { BankSectionSummary, Difficulty } from "../../../shared/types";
import { color, font, radius, space, shadow } from "../../theme";
import RangeSlider from "../../components/RangeSlider";
import type { VaultStackParamList } from "../../navigation/VaultStack";
import type { RootStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<VaultStackParamList, "MasterVault">;
type RootNav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<VaultStackParamList, "MasterVault">;

const DIFFICULTIES: { value: Difficulty | ""; label: string }[] = [
  { value: "", label: "Any" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export default function MasterVaultScreen() {
  const navigation = useNavigation<Nav>();
  const rootNavigation = navigation.getParent<RootNav>() ?? (navigation as unknown as RootNav);
  const route = useRoute<Route>();
  const seedApplied = useRef(false);

  const [sections, setSections] = useState<BankSectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [count, setCount] = useState(20);
  const [duration, setDuration] = useState(20);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.fetchBankSections().then(setSections).catch((e) => setLoadError(e.message));
  }, []);

  const sectionNames = useMemo(() => Array.from(new Set((sections ?? []).map((s) => s.section))), [sections]);

  useEffect(() => {
    if (!sectionNames.length) return;
    if (!seedApplied.current && route.params?.seedSection && sectionNames.includes(route.params.seedSection)) {
      seedApplied.current = true;
      setActiveSection(route.params.seedSection);
      setSelectedChapters(route.params.seedChapters ?? []);
      return;
    }
    if (!activeSection) setActiveSection(sectionNames[0]);
  }, [sectionNames, activeSection, route.params]);

  const chaptersForSection = useMemo(
    () => (sections ?? []).filter((s) => s.section === activeSection),
    [sections, activeSection]
  );

  const totalBankCount = useMemo(() => (sections ?? []).reduce((n, s) => n + s.count, 0), [sections]);

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
        count: Math.max(1, count),
        durationMinutes: Math.max(1, duration),
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
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <LinearGradient
        colors={[color.amberDeep, "#8a5b12"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Pressable onPress={() => navigation.goBack()} style={{ marginBottom: space.md }}>
          <Text style={styles.back}>← Paper Vault</Text>
        </Pressable>
        <View style={styles.heroIconWrap}>
          <Text style={styles.heroIcon}>🗂️</Text>
        </View>
        <Text style={styles.heroTitle}>Master Vault</Text>
        <Text style={styles.heroSub}>Your personal, tagged question bank — build a custom practice session.</Text>
        {sections !== null && sections.length > 0 && (
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>{totalBankCount}</Text><Text style={styles.heroStatLbl}>Questions</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>{sectionNames.length}</Text><Text style={styles.heroStatLbl}>Sections</Text></View>
            <View style={styles.heroStat}><Text style={styles.heroStatVal}>{chaptersForSection.length}</Text><Text style={styles.heroStatLbl}>Chapters here</Text></View>
          </View>
        )}
      </LinearGradient>

      <View style={{ padding: space.xl, paddingTop: space.lg }}>
        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {sections === null && !loadError && <ActivityIndicator color={color.amberDeep} style={{ marginTop: space.xl }} />}

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

              <View style={styles.sliderCard}>
                <RangeSlider label="Number of questions" value={count} min={5} max={100} step={5} onChange={setCount} />
              </View>
              <View style={styles.sliderCard}>
                <RangeSlider label="Duration" value={duration} min={5} max={120} step={5} suffix="m" onChange={setDuration} />
              </View>

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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.xl, paddingTop: 56, paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  heroIconWrap: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center", justifyContent: "center", marginBottom: space.md,
  },
  heroIcon: { fontSize: 20 },
  heroTitle: { fontFamily: font.displayBlack, fontSize: 26, color: color.white, marginBottom: 6 },
  heroSub: { fontFamily: font.body, fontSize: 13.5, color: "rgba(255,255,255,0.82)", lineHeight: 19, marginBottom: space.lg, maxWidth: 320 },
  heroStatsRow: { flexDirection: "row", gap: space.xl },
  heroStat: {},
  heroStatVal: { fontFamily: font.monoBold, fontSize: 20, color: color.white },
  heroStatLbl: { fontFamily: font.body, fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  errorText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.red },
  emptyText: { fontFamily: font.body, fontSize: 14, color: color.inkDim, lineHeight: 20 },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginBottom: space.md },
  sectionTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: color.surfaceSunken },
  sectionTabActive: { backgroundColor: color.amberDeep, borderColor: color.amberDeep },
  sectionTabText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  sectionTabTextActive: { color: color.white },
  chapterGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chapterChip: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: color.surfaceSunken,
  },
  chapterChipSelected: { borderColor: color.amberDeep, backgroundColor: color.amberBg },
  chapterChipText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink },
  chapterChipTextSelected: { color: color.amberDeep },
  chapterCountBadge: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  chapterCountBadgeSelected: { backgroundColor: color.amberDeep },
  chapterCountText: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim },
  chapterCountTextSelected: { color: color.white },
  hint: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.md },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: color.inkFaint, marginBottom: 6, marginTop: space.sm },
  diffRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  diffBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken, alignItems: "center" },
  diffBtnActive: { backgroundColor: color.amberDeep, borderColor: color.amberDeep },
  diffBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  diffBtnTextActive: { color: color.white },
  sliderCard: { backgroundColor: color.surfaceAlt, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  startBtn: { backgroundColor: color.amberDeep, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: space.sm },
  startBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },
});
