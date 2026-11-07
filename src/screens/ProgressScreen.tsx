import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as api from "../../shared/api";
import { loadHistory, computeStreak } from "../../shared/history";
import type { AiReview as AiReviewData, AttemptRecord, BankSectionSummary, PerformanceInput } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import HaloRing from "../components/HaloRing";
import type { MainTabParamList } from "../navigation/MainTabs";
import type { VaultStackParamList } from "../navigation/VaultStack";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Progress">,
  NativeStackNavigationProp<VaultStackParamList>
>;

function fmtStamp(when: number): string {
  const d = new Date(when);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function secs(ms: number) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function normalizeTopic(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/s\b/g, "");
}

function accOf(a: AttemptRecord): number {
  const attempted = a.total - a.skipped;
  return a.accuracy ?? (attempted ? Math.round((a.correct / attempted) * 100) : 0);
}

function tierColor(acc: number) {
  return acc < 50 ? color.red : acc < 75 ? color.amber : color.green;
}

export default function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);
  const [mistakesExpanded, setMistakesExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const canPractice = api.backendEnabled() && api.canUseBankFeature(api.getSession());

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  useEffect(() => {
    if (!canPractice) return;
    api.fetchBankSections().then(setBankSections).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chapterToSection = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of bankSections ?? []) m[s.chapter] = s.section;
    return m;
  }, [bankSections]);

  // Attempt topics rarely spell a chapter exactly how the bank does (an
  // AI-converted Paper Vault paper names its own topics freely) - so beyond
  // the exact lookup above, try a normalized/substring match before giving
  // up on finding a matching chapter entirely.
  const normalizedChapters = useMemo(
    () => (bankSections ?? []).map((s) => ({ section: s.section, chapter: s.chapter, norm: normalizeTopic(s.chapter) })),
    [bankSections]
  );

  function findMatch(topic: string): { section: string; chapter: string } | null {
    const exactSection = chapterToSection[topic];
    if (exactSection) return { section: exactSection, chapter: topic };
    const norm = normalizeTopic(topic);
    if (!norm) return null;
    const exact = normalizedChapters.find((c) => c.norm === norm);
    if (exact) return { section: exact.section, chapter: exact.chapter };
    const partial = normalizedChapters.find((c) => c.norm.includes(norm) || norm.includes(c.norm));
    if (partial) return { section: partial.section, chapter: partial.chapter };
    return null;
  }

  const chronological = useMemo(() => (history ?? []).slice().sort((a, b) => a.when - b.when), [history]);
  const recentFirst = useMemo(() => (history ?? []).slice().sort((a, b) => b.when - a.when), [history]);
  const streak = useMemo(() => computeStreak((history ?? []).map((h) => h.when)), [history]);

  const avgRecent = useMemo(() => {
    const last5 = chronological.slice(-5);
    if (!last5.length) return null;
    return Math.round(last5.reduce((s, a) => s + accOf(a), 0) / last5.length);
  }, [chronological]);

  const avgPrior = useMemo(() => {
    const prior5 = chronological.slice(-10, -5);
    if (!prior5.length) return null;
    return Math.round(prior5.reduce((s, a) => s + accOf(a), 0) / prior5.length);
  }, [chronological]);

  const bestAcc = useMemo(() => (history && history.length ? Math.max(...history.map(accOf)) : null), [history]);

  const weakTopics = useMemo(() => {
    if (!history) return [];
    const byTopic: Record<string, { ok: number; att: number }> = {};
    for (const a of history) {
      for (const [topic, t] of Object.entries(a.byTopic ?? {})) {
        const cur = (byTopic[topic] ||= { ok: 0, att: 0 });
        cur.ok += t.ok;
        cur.att += t.att;
      }
    }
    return Object.entries(byTopic)
      .filter(([, t]) => t.att > 0)
      .map(([topic, t]) => ({ topic, acc: Math.round((t.ok / t.att) * 100), att: t.att }))
      .sort((a, b) => a.acc - b.acc);
  }, [history]);

  const focusTopics = weakTopics.slice(0, 3);

  const mistakes = useMemo(() => {
    if (!history) return [];
    const out: { when: number; title: string; topic: string; text: string; yourAnswer: string; correct: string; timeMs: number }[] = [];
    for (const a of history) {
      for (const q of a.questions ?? []) {
        if (q.given === null || q.given === q.ans) continue;
        out.push({
          when: a.when,
          title: a.title,
          topic: q.topic,
          text: q.text,
          yourAnswer: q.type === "mc" ? (q.options?.[q.given] ?? String(q.given)) : String(q.given),
          correct: q.type === "mc" ? (q.options?.[q.ans] ?? String(q.ans)) : String(q.ans),
          timeMs: q.timeMs,
        });
      }
    }
    return out.sort((a, b) => b.when - a.when);
  }, [history]);

  function practiceNow(topic: string) {
    const match = findMatch(topic);
    if (!match) return;
    navigation.navigate("Vault", { screen: "MasterVault", params: { seedSection: match.section, seedChapters: [match.chapter] } } as never);
  }

  function browseBank() {
    navigation.navigate("Vault", { screen: "MasterVault", params: undefined } as never);
  }

  async function requestAiReview(record: AttemptRecord) {
    setAiState("loading");
    const attempted = record.total - record.skipped;
    const input: PerformanceInput = {
      examTitle: record.title,
      examCategory: record.exam ?? "General",
      net: record.net, total: record.total, correct: record.correct, wrong: record.wrong,
      skipped: record.skipped, attempted,
      accuracy: record.accuracy ?? (attempted ? Math.round((record.correct / attempted) * 100) : 0),
      avgSec: record.avgSec ?? 0,
      tabSwitches: record.tabSwitches ?? 0,
      topics: Object.entries(record.byTopic ?? {}).map(([topic, t]) => ({ topic, attempted: t.att, total: t.att, correct: t.ok })),
      slowest: [],
    };
    try {
      setAiReview(await api.analyzePerformance(input));
      setAiState("done");
    } catch {
      setAiState("error");
    }
  }

  function selectAttempt(h: AttemptRecord) {
    setSelected(h);
    setAiState("idle");
    setAiReview(null);
  }

  // ---- detail / AI review views (ported from the old PastAttemptsScreen) ----

  if (aiState === "done" && aiReview && selected) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}>
        <Pressable onPress={() => setAiState("idle")}><Text style={styles.back}>← Back to attempt</Text></Pressable>
        <Text style={styles.title}>Your AI study plan</Text>
        <Text style={styles.sub}>generated from your {selected.title} attempt</Text>

        <View style={styles.aiHero}>
          <Text style={styles.aiHeroLabel}>GEMINI · BASED ON THIS ATTEMPT</Text>
          <Text style={styles.aiHeroText}>{aiReview.summary}</Text>
        </View>

        <Text style={styles.sectionHead}>Where you're strong</Text>
        {aiReview.strengths.map((s, i) => (
          <View key={i} style={styles.aiPoint}>
            <View style={[styles.aiDot, { backgroundColor: color.green }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aiPointTitle}>{s.title}</Text>
              <Text style={styles.aiPointBody}>{s.detail}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionHead}>Where you need work</Text>
        {aiReview.weaknesses.map((w, i) => (
          <View key={i} style={styles.aiPoint}>
            <View style={[styles.aiDot, { backgroundColor: color.red }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.aiPointTitle}>{w.title}</Text>
              <Text style={styles.aiPointBody}>{w.detail}</Text>
            </View>
          </View>
        ))}

        <Text style={styles.sectionHead}>Your study plan before the next attempt</Text>
        {aiReview.plan.map((d, i) => (
          <View key={i} style={styles.planRow}>
            <Text style={styles.planDay}>{d.day}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiPointTitle}>{d.title}</Text>
              <Text style={styles.aiPointBody}>{d.detail}</Text>
              <Text style={styles.planMinutes}>≈ {d.minutes} min</Text>
            </View>
          </View>
        ))}
        <Text style={styles.disclaimer}>AI-generated from this attempt's data — a study aid, not official exam guidance.</Text>
      </ScrollView>
    );
  }

  if (selected) {
    const attempted = selected.total - selected.skipped;
    const topicRows = Object.entries(selected.byTopic ?? {}).map(([topic, t]) => ({
      topic, att: t.att, ok: t.ok, acc: t.att ? Math.round((t.ok / t.att) * 100) : 0,
    }));
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}>
        <Pressable onPress={() => setSelected(null)}><Text style={styles.back}>← Progress</Text></Pressable>
        <Text style={styles.title} numberOfLines={2}>{selected.title}</Text>
        <Text style={styles.sub}>
          {selected.exam && selected.exam !== "General" ? `${selected.exam} · ` : ""}{fmtStamp(selected.when)}
        </Text>

        <View style={styles.scoreCard}>
          <HaloRing percent={selected.total ? (selected.net / selected.total) * 100 : 0} size={88} label={selected.net.toFixed(2)} />
          <View style={{ marginLeft: space.lg, flex: 1 }}>
            <Text style={styles.netLabel}>Net score</Text>
            <Text style={styles.netValue}>{selected.net.toFixed(2)} / {selected.total}</Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <StatChip label="ACCURACY" value={selected.accuracy !== undefined ? `${selected.accuracy}%` : "—"} />
          <StatChip label="AVG/Q" value={selected.avgSec !== undefined ? `${selected.avgSec.toFixed(1)}s` : "—"} />
          <StatChip label="ATTEMPTED" value={`${attempted}/${selected.total}`} />
        </View>

        {api.backendEnabled() && api.getSession() && (
          <Pressable
            style={styles.aiCta}
            onPress={() => requestAiReview(selected)}
            disabled={aiState === "loading"}
          >
            <Text style={styles.aiCtaText}>
              {aiState === "loading" ? "Reviewing…" : aiState === "error" ? "Couldn't generate a review — retry" : "✨ Review my performance with AI"}
            </Text>
          </Pressable>
        )}

        {topicRows.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionHead}>By topic</Text>
            {topicRows.map((t) => (
              <View key={t.topic} style={styles.topicRow}>
                <Text style={styles.topicName} numberOfLines={1}>{t.topic}</Text>
                <View style={styles.topicBarTrack}>
                  <View style={[styles.topicBarFill, { width: `${t.acc}%`, backgroundColor: tierColor(t.acc) }]} />
                </View>
                <Text style={styles.topicPct}>{t.acc}%</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ---- main dashboard ----

  if (history === null) {
    return <ActivityIndicator color={color.royal} style={{ flex: 1, backgroundColor: color.canvas }} />;
  }

  if (history.length === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}>
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.empty}>Write your first mock test to start seeing your trend, weak topics, and mistakes here.</Text>
      </ScrollView>
    );
  }

  const trend = avgRecent !== null && avgPrior !== null ? avgRecent - avgPrior : null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <LinearGradient
        colors={["#06241c", "#0d4a36", "#15983d", "#4ade80"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroEyebrow}>YOUR PROGRESS</Text>
        <Text style={styles.heroValue}>{avgRecent ?? "—"}%</Text>
        <Text style={styles.heroSub}>
          {trend === null ? "average accuracy, last 5 attempts" : trend === 0 ? "steady vs your prior 5 attempts" : `${trend > 0 ? "up" : "down"} ${Math.abs(trend)} pts vs your prior 5 attempts`}
        </Text>
        <View style={styles.heroStatsRow}>
          <HeroStat label="STREAK" value={`${streak}d`} />
          <HeroStat label="BEST" value={bestAcc !== null ? `${bestAcc}%` : "—"} />
          <HeroStat label="ATTEMPTS" value={String(history.length)} />
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        {focusTopics.length > 0 && (
          <>
            <Text style={styles.sectionHead}>Focus next</Text>
            {focusTopics.map((t, i) => {
              const match = findMatch(t.topic);
              return (
                <View key={t.topic} style={styles.focusCard}>
                  <View style={styles.focusRank}><Text style={styles.focusRankText}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.focusTopic} numberOfLines={1}>{t.topic}</Text>
                    <Text style={styles.focusMeta}>{t.acc}% accuracy · {t.att} attempt{t.att === 1 ? "" : "s"}</Text>
                  </View>
                  {match ? (
                    <Pressable style={styles.focusBtn} onPress={() => practiceNow(t.topic)}>
                      <Text style={styles.focusBtnText}>Practice now →</Text>
                    </Pressable>
                  ) : canPractice && bankSections && bankSections.length > 0 ? (
                    <Pressable style={styles.focusBtnGhost} onPress={browseBank}>
                      <Text style={styles.focusBtnGhostText}>Browse bank →</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.sectionHead}>All topics</Text>
        <View style={styles.card}>
          {weakTopics.length === 0 ? (
            <Text style={styles.mutedSmall}>No attempted questions yet.</Text>
          ) : (
            weakTopics.map((t) => (
              <View key={t.topic} style={styles.topicRow}>
                <View style={[styles.sdot, { backgroundColor: tierColor(t.acc) }]} />
                <Text style={styles.topicName} numberOfLines={1}>{t.topic}</Text>
                <View style={styles.topicBarTrack}>
                  <View style={[styles.topicBarFill, { width: `${t.acc}%`, backgroundColor: tierColor(t.acc) }]} />
                </View>
                <Text style={styles.topicPct}>{t.acc}%</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.sectionHead}>Recent mistakes</Text>
          {mistakes.length > 5 && (
            <Pressable onPress={() => setMistakesExpanded((v) => !v)}>
              <Text style={styles.viewAll}>{mistakesExpanded ? "Show less" : "View all"}</Text>
            </Pressable>
          )}
        </View>
        {mistakes.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.mutedSmall}>No wrong answers recorded yet.</Text>
          </View>
        ) : (
          (mistakesExpanded ? mistakes.slice(0, 40) : mistakes.slice(0, 5)).map((m, i) => {
            const d = new Date(m.when);
            const stamp = `${d.getDate()}/${d.getMonth() + 1}`;
            return (
              <View key={i} style={styles.mistakeCard}>
                <View style={styles.mistakeMetaRow}>
                  <View style={styles.chip}><Text style={styles.chipText}>{m.topic}</Text></View>
                  <Text style={styles.mutedSmall}>{m.title} · {stamp} · {secs(m.timeMs)}</Text>
                </View>
                <Text style={styles.mistakeText}>{m.text}</Text>
                <View style={styles.mistakeValsRow}>
                  <Text style={styles.mutedSmall}>your answer </Text>
                  <Text style={styles.badText}>{m.yourAnswer}</Text>
                  <Text style={styles.arrow}>  →  </Text>
                  <Text style={styles.mutedSmall}>correct </Text>
                  <Text style={styles.goodText}>{m.correct}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={styles.rowBetween}>
          <Text style={styles.sectionHead}>Activity log</Text>
          {recentFirst.length > 6 && (
            <Pressable onPress={() => setLogExpanded((v) => !v)}>
              <Text style={styles.viewAll}>{logExpanded ? "Show less" : "View all"}</Text>
            </Pressable>
          )}
        </View>
        {(logExpanded ? recentFirst : recentFirst.slice(0, 6)).map((h) => (
          <Pressable key={h.when} style={styles.logCard} onPress={() => selectAttempt(h)}>
            <Text style={styles.logTitle} numberOfLines={1}>{h.title}</Text>
            <Text style={styles.logMeta}>{fmtStamp(h.when)}</Text>
            <View style={styles.logStatsRow}>
              <Text style={styles.logNet}>net {h.net.toFixed(2)}/{h.total}</Text>
              <Text style={styles.logAcc}>{accOf(h)}% accuracy</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal, marginBottom: space.lg },
  title: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, textAlign: "center", marginTop: space.xl },
  mutedSmall: { fontFamily: font.body, fontSize: 12, color: color.inkDim },

  hero: { paddingHorizontal: space.xl, paddingTop: 64, paddingBottom: space.xl },
  heroEyebrow: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 1, color: "#9ef5c5" },
  heroValue: { fontFamily: font.displayBlack, fontSize: 48, color: color.white, marginTop: 6 },
  heroSub: { fontFamily: font.body, fontSize: 13, color: "#d4f5e4", marginTop: 2 },
  heroStatsRow: { flexDirection: "row", gap: space.md, marginTop: space.lg },
  heroStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: space.sm, alignItems: "center" },
  heroStatValue: { fontFamily: font.monoBold, fontSize: 16, color: color.white },
  heroStatLabel: { fontFamily: font.bodySemibold, fontSize: 9, letterSpacing: 0.4, color: "#bdeccf", marginTop: 2 },

  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  viewAll: { fontFamily: font.bodySemibold, fontSize: 12, color: color.royal, marginTop: space.md },
  sectionHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginTop: space.lg, marginBottom: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },

  focusCard: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, ...shadow.soft },
  focusRank: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" },
  focusRankText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.inkDim },
  focusTopic: { fontFamily: font.bodySemibold, fontSize: 14, color: color.ink },
  focusMeta: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2 },
  focusBtn: { backgroundColor: color.greenBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  focusBtnText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.green },
  focusBtnGhost: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  focusBtnGhostText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.inkDim },

  sdot: { width: 7, height: 7, borderRadius: 3.5 },
  topicRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  topicName: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1 },
  topicBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken, minWidth: 50 },
  topicBarFill: { height: 6, borderRadius: 3 },
  topicPct: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim, width: 36, textAlign: "right" },

  mistakeCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.soft },
  mistakeMetaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm, flexWrap: "wrap" },
  chip: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  mistakeText: { fontFamily: font.body, fontSize: 14, color: color.ink, marginBottom: space.sm, lineHeight: 19 },
  mistakeValsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  badText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.red },
  goodText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.green },
  arrow: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },

  logCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.soft },
  logTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: color.ink },
  logMeta: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2, marginBottom: 8 },
  logStatsRow: { flexDirection: "row", gap: space.md },
  logNet: { fontFamily: font.monoSemibold, fontSize: 13, color: color.royal },
  logAcc: { fontFamily: font.body, fontSize: 12, color: color.inkDim },

  scoreCard: { flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, ...shadow.soft },
  netLabel: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  netValue: { fontFamily: font.monoBold, fontSize: 22, color: color.ink },

  chipRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  statChip: { flex: 1, backgroundColor: color.surface, borderRadius: radius.md, padding: space.md, alignItems: "center", ...shadow.soft },
  statChipLabel: { fontFamily: font.bodySemibold, fontSize: 10, color: color.inkFaint, letterSpacing: 0.4 },
  statChipValue: { fontFamily: font.monoSemibold, fontSize: 16, color: color.ink, marginTop: 2 },

  aiCta: { backgroundColor: color.inkNavy900, borderRadius: radius.lg, padding: space.lg, alignItems: "center", marginBottom: space.lg },
  aiCtaText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },

  aiHero: { backgroundColor: color.inkNavy900, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  aiHeroLabel: { fontFamily: font.bodySemibold, fontSize: 10, color: color.amber, letterSpacing: 0.6, marginBottom: 6 },
  aiHeroText: { fontFamily: font.body, fontSize: 14, color: color.white, lineHeight: 20 },
  aiPoint: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  aiDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  aiPointTitle: { fontFamily: font.bodySemibold, fontSize: 14, color: color.ink },
  aiPointBody: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginTop: 2, lineHeight: 18 },
  planRow: { flexDirection: "row", gap: space.md, marginBottom: space.md },
  planDay: { fontFamily: font.monoSemibold, fontSize: 12, color: color.royal, width: 50 },
  planMinutes: { fontFamily: font.body, fontSize: 11, color: color.inkFaint, marginTop: 2 },
  disclaimer: { fontFamily: font.body, fontSize: 11, color: color.inkFaint, marginTop: space.lg, marginBottom: space.xxl },
});
