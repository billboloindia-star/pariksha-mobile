import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as api from "../../shared/api";
import { loadHistory, computeStreak } from "../../shared/history";
import type { AiReview as AiReviewData, AttemptRecord, BankSectionSummary, PerformanceInput } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import HaloRing from "../components/HaloRing";
import Sparkline from "../components/Sparkline";
import type { MainTabParamList } from "../navigation/MainTabs";
import type { VaultStackParamList } from "../navigation/VaultStack";

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Progress">,
  NativeStackNavigationProp<VaultStackParamList>
>;

const LOG_PAGE_SIZE = 6;

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
  if (a.accuracy !== undefined) return a.accuracy;
  const attempted = a.total - a.skipped;
  return attempted ? Math.round((a.correct / attempted) * 100) : 0;
}

function tierColor(acc: number) {
  return acc < 50 ? color.statusBad : acc < 75 ? color.statusWarn : color.statusGood;
}

function logTierColors(acc: number): { fg: string; bg: string } {
  if (acc < 50) return { fg: color.red, bg: color.redBg };
  if (acc < 75) return { fg: color.amberDeep, bg: color.amberBg };
  return { fg: color.green, bg: color.greenBg };
}

/** Start-of-local-day timestamp, `offset` days before today (0 = today). */
function dayStart(offset: number): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

function relDateLabel(when: number): string {
  const itemDay = new Date(when).setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayStart(0) - itemDay) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "Earlier this week";
  return "Earlier";
}

function avgSpeedSec(attempts: AttemptRecord[]): number | null {
  const times = attempts.flatMap((a) => (a.questions ?? []).map((q) => q.timeMs));
  if (times.length) return Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000);
  const withAvg = attempts.filter((a) => a.avgSec !== undefined);
  if (withAvg.length) return Math.round(withAvg.reduce((n, a) => n + (a.avgSec ?? 0), 0) / withAvg.length);
  return null;
}

export default function ProgressScreen() {
  const navigation = useNavigation<Nav>();
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);

  const [topicSearch, setTopicSearch] = useState("");
  const [topicSort, setTopicSort] = useState<"worst" | "best" | "attempts">("worst");
  const [logFilter, setLogFilter] = useState("all");
  const [logPage, setLogPage] = useState(1);
  const [resolvingTopic, setResolvingTopic] = useState<string | null>(null);
  const [resolveModal, setResolveModal] = useState<{ topic: string; candidates: { section: string; chapter: string }[] } | null>(null);
  const [infoTip, setInfoTip] = useState<string | null>(null);

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

  function practiceNow(section: string, chapter: string) {
    navigation.navigate("Vault", { screen: "MasterVault", params: { seedSection: section, seedChapters: [chapter] } } as never);
  }

  function browseBank() {
    navigation.navigate("Vault", { screen: "MasterVault", params: undefined } as never);
  }

  async function resolveAndPractice(topic: string) {
    if (resolvingTopic) return;
    setResolvingTopic(topic);
    try {
      const res = await api.resolveTopicChapter(topic);
      if (res.section && res.chapter) {
        practiceNow(res.section, res.chapter);
      } else if (res.candidates.length > 0) {
        setResolveModal({ topic, candidates: res.candidates });
      } else {
        browseBank();
      }
    } catch {
      browseBank();
    } finally {
      setResolvingTopic(null);
    }
  }

  async function confirmCandidate(section: string, chapter: string) {
    const topic = resolveModal?.topic;
    setResolveModal(null);
    if (!topic) return;
    try {
      await api.confirmTopicChapter(topic, section, chapter);
    } catch {
      // the practice session still works even if caching the pick failed
    }
    practiceNow(section, chapter);
  }

  function onTopicRowClick(t: { topic: string; match: { section: string; chapter: string } | null }) {
    if (!canPractice) return;
    if (t.match) practiceNow(t.match.section, t.match.chapter);
    else resolveAndPractice(t.topic);
  }

  const chronological = useMemo(() => [...(history ?? [])].sort((a, b) => a.when - b.when), [history]);
  const recentFirst = useMemo(() => [...(history ?? [])].sort((a, b) => b.when - a.when), [history]);
  const streak = useMemo(() => computeStreak((history ?? []).map((h) => h.when)), [history]);

  const recentWindow = useMemo(() => chronological.slice(-5), [chronological]);
  const priorWindow = useMemo(() => chronological.slice(-10, -5), [chronological]);
  const avgRecent = recentWindow.length ? Math.round(recentWindow.reduce((n, a) => n + accOf(a), 0) / recentWindow.length) : 0;
  const avgPrior = priorWindow.length ? Math.round(priorWindow.reduce((n, a) => n + accOf(a), 0) / priorWindow.length) : null;
  const trendDelta = avgPrior !== null ? avgRecent - avgPrior : null;
  const bestAcc = chronological.length ? Math.max(...chronological.map(accOf)) : 0;

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

  const focusTopics = useMemo(() => weakTopics.slice(0, 3), [weakTopics]);

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

  const attemptsWithDetail = useMemo(() => (history ?? []).filter((a) => a.questions && a.questions.length > 0).length, [history]);

  // ---- control-panel telemetry: 7-day windows + daily sparkline series ----
  const last7Start = dayStart(6);
  const prior7Start = dayStart(13);

  const attempts7 = useMemo(() => (history ?? []).filter((h) => h.when >= last7Start), [history, last7Start]);
  const attemptsPrior7 = useMemo(
    () => (history ?? []).filter((h) => h.when >= prior7Start && h.when < last7Start),
    [history, prior7Start, last7Start]
  );

  const accuracy7d = attempts7.length ? Math.round(attempts7.reduce((n, a) => n + accOf(a), 0) / attempts7.length) : null;
  const accuracyPrior7 = attemptsPrior7.length
    ? Math.round(attemptsPrior7.reduce((n, a) => n + accOf(a), 0) / attemptsPrior7.length)
    : null;
  const accDelta = accuracy7d !== null && accuracyPrior7 !== null ? accuracy7d - accuracyPrior7 : null;

  const mistakes7d = useMemo(() => mistakes.filter((m) => m.when >= last7Start).length, [mistakes, last7Start]);
  const mistakesPrior7 = useMemo(
    () => mistakes.filter((m) => m.when >= prior7Start && m.when < last7Start).length,
    [mistakes, prior7Start, last7Start]
  );
  const mistakesDelta = mistakes7d - mistakesPrior7;

  const speed7d = avgSpeedSec(attempts7);
  const speedPrior7 = avgSpeedSec(attemptsPrior7);
  const speedDelta = speed7d !== null && speedPrior7 !== null ? speed7d - speedPrior7 : null;

  function activeDaysInRange(start: number, end: number): number {
    const days = new Set<string>();
    for (const a of history ?? []) if (a.when >= start && a.when < end) days.add(new Date(a.when).toDateString());
    return days.size;
  }
  const activeDays7 = activeDaysInRange(last7Start, Date.now() + 1);
  const activeDaysPrior7 = activeDaysInRange(prior7Start, last7Start);
  const streakDelta = activeDays7 - activeDaysPrior7;

  const dailySeries = useMemo(() => {
    const acc: number[] = [], mistakesSeries: number[] = [], speed: number[] = [], active: number[] = [];
    let lastAcc = 0, lastSpeed = 0;
    for (let i = 6; i >= 0; i--) {
      const s = dayStart(i), e = s + 86400000;
      const dayAttempts = (history ?? []).filter((h) => h.when >= s && h.when < e);
      const dayMistakes = mistakes.filter((m) => m.when >= s && m.when < e);
      if (dayAttempts.length) {
        lastAcc = Math.round(dayAttempts.reduce((n, a) => n + accOf(a), 0) / dayAttempts.length);
        const spd = avgSpeedSec(dayAttempts);
        if (spd !== null) lastSpeed = spd;
      }
      acc.push(lastAcc);
      mistakesSeries.push(dayMistakes.length);
      speed.push(lastSpeed);
      active.push(dayAttempts.length ? 1 : 0);
    }
    return { acc, mistakes: mistakesSeries, speed, active };
  }, [history, mistakes]);

  // ---- topic ranking: weakTopics + resolved bank section, searchable/sortable ----
  const rankedTopics = useMemo(
    () => weakTopics.map((t) => ({ ...t, match: findMatch(t.topic) })),
    [weakTopics, chapterToSection, normalizedChapters] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const filteredTopics = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    let items = rankedTopics.filter((t) => t.topic.toLowerCase().includes(q));
    if (topicSort === "worst") items = [...items].sort((a, b) => a.acc - b.acc);
    else if (topicSort === "best") items = [...items].sort((a, b) => b.acc - a.acc);
    else items = [...items].sort((a, b) => b.att - a.att);
    return items;
  }, [rankedTopics, topicSearch, topicSort]);

  const topicGroups = useMemo(() => {
    const groups: Record<string, typeof filteredTopics> = {};
    for (const t of filteredTopics) (groups[t.match?.section ?? "Other"] ||= []).push(t);
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTopics]);

  // ---- live feed: mistakes + session completions, merged and sorted ----
  interface FeedEvent {
    when: number;
    kind: "mistake" | "session";
    head: string;
    detail: string;
    attempt?: AttemptRecord;
  }
  const feedEvents = useMemo<FeedEvent[]>(() => {
    const events: FeedEvent[] = [];
    for (const m of mistakes) {
      events.push({
        when: m.when,
        kind: "mistake",
        head: `Missed ${m.topic}`,
        detail: `Answered "${m.yourAnswer}" — correct was "${m.correct}" · ${m.title} · ${secs(m.timeMs)}`,
      });
    }
    for (const h of history ?? []) {
      events.push({
        when: h.when,
        kind: "session",
        head: `Finished ${h.title}`,
        detail: `${accOf(h)}% accuracy · net ${h.net.toFixed(2)} / ${h.total}`,
        attempt: h,
      });
    }
    return events.sort((a, b) => b.when - a.when).slice(0, 30);
  }, [mistakes, history]);

  // ---- session log: filterable (by exam) + paginated ----
  const examKinds = useMemo(() => {
    const set = new Set<string>();
    for (const h of history ?? []) if (h.exam && h.exam !== "General") set.add(h.exam);
    return Array.from(set).sort();
  }, [history]);

  const logItems = useMemo(
    () => (logFilter === "all" ? recentFirst : recentFirst.filter((h) => h.exam === logFilter)),
    [recentFirst, logFilter]
  );
  const logPageCount = Math.max(1, Math.ceil(logItems.length / LOG_PAGE_SIZE));
  const clampedLogPage = Math.min(logPage, logPageCount);
  const logPageItems = logItems.slice((clampedLogPage - 1) * LOG_PAGE_SIZE, clampedLogPage * LOG_PAGE_SIZE);

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

  // ---- detail / AI review views (unchanged from before) ----

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
          <Pressable style={styles.aiCta} onPress={() => requestAiReview(selected)} disabled={aiState === "loading"}>
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

  const trend = trendDelta;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <LinearGradient colors={["#06241c", "#0d4a36", "#15983d", "#4ade80"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
        <View style={styles.liveEyebrow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveEyebrowText}>Live — updates after every attempt</Text>
        </View>
        <Text style={styles.heroValue}>{avgRecent}<Text style={styles.heroValueSmall}>%</Text></Text>
        <Text style={styles.heroSub}>
          {trend === null ? "average accuracy, last 5 attempts" : trend === 0 ? "steady vs your prior 5 attempts" : `${trend > 0 ? "↑ up" : "↓ down"} ${Math.abs(trend)} pts vs your prior 5 attempts`}
        </Text>
        <View style={styles.heroStatsRow}>
          <HeroStat label="ATTEMPTS" value={String(history.length)} />
          <HeroStat label="STREAK" value={`${streak}d`} />
          <HeroStat label="BEST" value={`${bestAcc}%`} />
        </View>
        {chronological.length >= 2 && (
          <View style={{ marginTop: space.lg }}>
            <Text style={styles.heroChartLbl}>Accuracy trend, last {Math.min(chronological.length, 20)} attempts</Text>
            <TrendChart data={chronological.slice(-20)} />
          </View>
        )}
      </LinearGradient>

      <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
        {focusTopics.length > 0 && (
          <>
            <Text style={styles.sectionHead}>Focus next</Text>
            <Text style={styles.sectionSub}>Your weakest topics, ready to drop straight into a practice session</Text>
            {focusTopics.map((t, i) => {
              const match = findMatch(t.topic);
              return (
                <View key={t.topic} style={styles.focusCard}>
                  <View style={styles.focusRank}><Text style={styles.focusRankText}>{i === 0 ? "Weakest" : i === 1 ? "Weak" : "Needs work"}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.focusTopic} numberOfLines={1}>{t.topic}</Text>
                    <Text style={styles.focusMeta}>{t.acc}% accuracy · {t.att} attempt{t.att === 1 ? "" : "s"}</Text>
                  </View>
                  {canPractice && match ? (
                    <Pressable style={styles.focusBtn} onPress={() => practiceNow(match.section, match.chapter)}>
                      <Text style={styles.focusBtnText}>Practice now →</Text>
                    </Pressable>
                  ) : canPractice && bankSections && bankSections.length > 0 ? (
                    <Pressable style={styles.focusBtnGhost} onPress={() => resolveAndPractice(t.topic)} disabled={resolvingTopic === t.topic}>
                      {resolvingTopic === t.topic
                        ? <ActivityIndicator size="small" color={color.inkDim} />
                        : <Text style={styles.focusBtnGhostText}>Find chapter →</Text>}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </>
        )}

        <Text style={styles.panelSectionLabel}>CONTROL PANEL — MISTAKES & ACTIVITY</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.lg }} contentContainerStyle={{ gap: space.sm, paddingRight: space.xl }}>
          <TelemetryCard
            label="Accuracy · 7d" value={accuracy7d !== null ? `${accuracy7d}%` : "—"} delta={accDelta}
            deltaUnit="%" series={dailySeries.acc} onInfo={() => setInfoTip("Accuracy, last 7 days: average accuracy across every attempt in the past 7 days (a wider window than the 5-attempt trend above).")}
          />
          <TelemetryCard
            label="Active streak" value={`${streak}d`} delta={streakDelta} deltaUnit="d" series={dailySeries.active}
            onInfo={() => setInfoTip("Active streak: consecutive days with at least one attempt. The badge compares active days this week vs the week before.")}
          />
          <TelemetryCard
            label="Mistakes tracked" value={String(mistakes7d)} delta={mistakesDelta} deltaUnit="" series={dailySeries.mistakes} invertDelta
            onInfo={() => setInfoTip(`Mistakes tracked: wrong answers logged in the past 7 days.${attemptsWithDetail < history.length ? " Only attempts since question-level tracking shipped have this detail." : ""}`)}
          />
          <TelemetryCard
            label="Avg speed / q" value={speed7d !== null ? `${speed7d}s` : "—"} delta={speedDelta} deltaUnit="s" series={dailySeries.speed} invertDelta
            onInfo={() => setInfoTip("Avg speed per question: average time per question across your last 7 days - watch accuracy alongside this, not instead of it.")}
          />
        </ScrollView>

        <View style={styles.panelCard}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>☰ TOPIC RANKING</Text>
            <Text style={styles.panelSub}>{topicSort === "worst" ? "worst first" : topicSort === "best" ? "best first" : "most attempted"}</Text>
          </View>
          <TextInput style={styles.heatSearch} placeholder="Search topics…" placeholderTextColor={color.consoleText2} value={topicSearch} onChangeText={setTopicSearch} />
          <View style={styles.sortRow}>
            {(["worst", "best", "attempts"] as const).map((s) => (
              <Pressable key={s} style={[styles.sortBtn, topicSort === s && styles.sortBtnActive]} onPress={() => setTopicSort(s)}>
                <Text style={[styles.sortBtnText, topicSort === s && styles.sortBtnTextActive]}>
                  {s === "worst" ? "Worst first" : s === "best" ? "Best first" : "Most attempted"}
                </Text>
              </Pressable>
            ))}
          </View>
          {filteredTopics.length === 0 ? (
            <Text style={styles.heatEmpty}>{weakTopics.length === 0 ? "No attempted questions yet." : `No topics match "${topicSearch}".`}</Text>
          ) : (
            topicGroups.map(([section, items]) => (
              <View key={section}>
                <Text style={styles.heatGroupLabel}>{section} · {items.length}</Text>
                {items.map((t, i) => {
                  const tc = tierColor(t.acc);
                  return (
                    <Pressable key={t.topic} style={styles.heatRow} onPress={() => onTopicRowClick(t)} disabled={!canPractice || resolvingTopic === t.topic}>
                      <Text style={styles.heatRank}>{i + 1}</Text>
                      <View style={[styles.heatDot, { backgroundColor: tc }]} />
                      <Text style={styles.heatName} numberOfLines={1}>{t.topic}</Text>
                      <Text style={[styles.heatPct, { color: tc }]}>{t.acc}%</Text>
                      {canPractice && (
                        <Text style={styles.heatGo}>
                          {resolvingTopic === t.topic ? "…" : t.match ? "Practice →" : "Find →"}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
          <View style={styles.heatLegend}>
            <LegendItem dot={color.statusBad} label="Critical <50%" />
            <LegendItem dot={color.statusWarn} label="Warning 50–75%" />
            <LegendItem dot={color.statusGood} label="Good 75%+" />
          </View>
        </View>

        <View style={styles.panelCard}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>⚡ LIVE FEED</Text>
            <Text style={styles.panelSub}>mistakes + sessions{attemptsWithDetail < history.length ? ` · ${attemptsWithDetail}/${history.length} w/ detail` : ""}</Text>
          </View>
          {feedEvents.length === 0 ? (
            <Text style={styles.heatEmpty}>Nothing yet — write a test to start seeing activity here.</Text>
          ) : (
            feedEvents.slice(0, 12).map((f, i) => {
              const glyph = f.kind === "mistake" ? { cls: "bad" as const, g: "✕" } : (() => {
                const acc = f.attempt ? accOf(f.attempt) : 0;
                return acc >= 75 ? { cls: "good" as const, g: "✓" } : acc >= 50 ? { cls: "info" as const, g: "●" } : { cls: "bad" as const, g: "✕" };
              })();
              const clickable = f.kind === "session" && !!f.attempt;
              const d = new Date(f.when);
              const stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              const glyphColor = glyph.cls === "bad" ? color.statusBad : glyph.cls === "good" ? color.statusGood : color.sky;
              return (
                <Pressable key={i} style={styles.feedRow} onPress={clickable ? () => selectAttempt(f.attempt!) : undefined} disabled={!clickable}>
                  <View style={[styles.feedGlyph, { borderColor: glyphColor }]}><Text style={[styles.feedGlyphText, { color: glyphColor }]}>{glyph.g}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.feedTopLine}>
                      <Text style={styles.feedHead} numberOfLines={1}>{f.head}</Text>
                      <Text style={styles.feedTime}>{stamp}</Text>
                    </View>
                    <Text style={styles.feedDetail} numberOfLines={2}>{f.detail}</Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={styles.logCard}>
          <View style={styles.panelHeadLight}>
            <Text style={styles.logTitle}>📋 Session log</Text>
          </View>
          {examKinds.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable style={[styles.logFilterBtn, logFilter === "all" && styles.logFilterBtnActive]} onPress={() => { setLogFilter("all"); setLogPage(1); }}>
                  <Text style={[styles.logFilterText, logFilter === "all" && styles.logFilterTextActive]}>All</Text>
                </Pressable>
                {examKinds.map((k) => (
                  <Pressable key={k} style={[styles.logFilterBtn, logFilter === k && styles.logFilterBtnActive]} onPress={() => { setLogFilter(k); setLogPage(1); }}>
                    <Text style={[styles.logFilterText, logFilter === k && styles.logFilterTextActive]}>{k}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}
          {logPageItems.length === 0 ? (
            <Text style={styles.mutedSmall}>No sessions match this filter.</Text>
          ) : (
            (() => {
              let lastGroup = "";
              return logPageItems.map((h, i) => {
                const group = relDateLabel(h.when);
                const showGroup = group !== lastGroup;
                lastGroup = group;
                const acc = accOf(h);
                const col = logTierColors(acc);
                return (
                  <View key={i}>
                    {showGroup && <Text style={styles.logGroupLabel}>{group}</Text>}
                    <Pressable style={styles.logRow} onPress={() => selectAttempt(h)}>
                      <View style={[styles.logAccent, { backgroundColor: col.fg }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.logTopLine}>
                          <Text style={styles.logName} numberOfLines={1}>{h.title}</Text>
                          {h.exam && h.exam !== "General" && <View style={styles.examBadge}><Text style={styles.examBadgeText}>{h.exam}</Text></View>}
                        </View>
                        <Text style={styles.logMetaLine}>{fmtStamp(h.when)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <View style={[styles.accPill, { backgroundColor: col.bg }]}><Text style={[styles.accPillText, { color: col.fg }]}>{acc}%</Text></View>
                        <Text style={styles.logNetVal}>{h.net.toFixed(2)}/{h.total}</Text>
                      </View>
                    </Pressable>
                  </View>
                );
              });
            })()
          )}
          {logItems.length > LOG_PAGE_SIZE && (
            <View style={styles.pagerRow}>
              <Pressable style={styles.pagerBtn} disabled={clampedLogPage === 1} onPress={() => setLogPage(clampedLogPage - 1)}>
                <Text style={[styles.pagerBtnText, clampedLogPage === 1 && styles.pagerBtnTextDisabled]}>← Prev</Text>
              </Pressable>
              <Text style={styles.pagerLabel}>{clampedLogPage} / {logPageCount}</Text>
              <Pressable style={styles.pagerBtn} disabled={clampedLogPage === logPageCount} onPress={() => setLogPage(clampedLogPage + 1)}>
                <Text style={[styles.pagerBtnText, clampedLogPage === logPageCount && styles.pagerBtnTextDisabled]}>Next →</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Modal visible={!!infoTip} transparent animationType="fade" onRequestClose={() => setInfoTip(null)}>
        <Pressable style={styles.tipOverlay} onPress={() => setInfoTip(null)}>
          <View style={styles.tipBox}><Text style={styles.tipText}>{infoTip}</Text></View>
        </Pressable>
      </Modal>

      <Modal visible={!!resolveModal} transparent animationType="slide" onRequestClose={() => setResolveModal(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setResolveModal(null)}>
          <Pressable style={styles.resolveModal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.resolveBadge}><View style={styles.liveDot} /><Text style={styles.resolveBadgeText}>AI couldn't find an exact match</Text></View>
            <Text style={styles.resolveTitle}>Which chapter matches "{resolveModal?.topic}"?</Text>
            <Text style={styles.mutedSmall}>Pick one, and we'll remember it next time — no AI call needed.</Text>
            <ScrollView style={{ maxHeight: 300, marginTop: space.md }}>
              {resolveModal?.candidates.map((c) => (
                <Pressable key={`${c.section}-${c.chapter}`} style={styles.candidateBtn} onPress={() => confirmCandidate(c.section, c.chapter)}>
                  <Text style={styles.candidateText}>{c.chapter}<Text style={styles.candidateSection}> · {c.section}</Text></Text>
                  <Text style={styles.candidateArrow}>→</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.resolveManualBtn} onPress={() => { const topic = resolveModal?.topic; setResolveModal(null); if (topic) browseBank(); }}>
              <Text style={styles.resolveManualText}>None of these — let me browse the bank myself</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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

function LegendItem({ dot, label }: { dot: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: dot }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function TelemetryCard({
  label, value, delta, deltaUnit, series, invertDelta, onInfo,
}: {
  label: string; value: string; delta: number | null; deltaUnit: string; series: number[]; invertDelta?: boolean; onInfo: () => void;
}) {
  const up = delta !== null && delta > 0;
  const good = delta === null ? true : invertDelta ? !up : up;
  return (
    <View style={styles.telCard}>
      <View style={styles.telLabelRow}>
        <Text style={styles.telLabel}>{label}</Text>
        <Pressable onPress={onInfo} hitSlop={8}><Text style={styles.telInfo}>ⓘ</Text></Pressable>
      </View>
      <View style={styles.telValRow}>
        <Text style={styles.telVal}>{value}</Text>
        {delta !== null && delta !== 0 && (
          <Text style={[styles.telDelta, { color: good ? "#9ef5c5" : "#ffb0b0" }]}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}{deltaUnit}</Text>
        )}
      </View>
      <Sparkline values={series} />
    </View>
  );
}

function TrendChart({ data }: { data: AttemptRecord[] }) {
  const W = 320, H = 70, padL = 4, padR = 4, top = 4, bottom = 66;
  const n = data.length;
  if (n < 2) return null;
  const accs = data.map(accOf);
  const x = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v: number) => bottom - (v / 100) * (bottom - top);
  const points = accs.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Polyline points={points} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      {accs.map((v, i) => (
        <Circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#fff" stroke="#15983d" strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal, marginBottom: space.lg },
  title: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, textAlign: "center", marginTop: space.xl },
  mutedSmall: { fontFamily: font.body, fontSize: 12, color: color.inkDim },

  hero: { paddingHorizontal: space.xl, paddingTop: 64, paddingBottom: space.xl },
  liveEyebrow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4ade80" },
  liveEyebrowText: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: "#9ef5c5" },
  heroValue: { fontFamily: font.displayBlack, fontSize: 48, color: color.white },
  heroValueSmall: { fontSize: 24 },
  heroSub: { fontFamily: font.body, fontSize: 13, color: "#d4f5e4", marginTop: 2 },
  heroStatsRow: { flexDirection: "row", gap: space.md, marginTop: space.lg },
  heroStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: space.sm, alignItems: "center" },
  heroStatValue: { fontFamily: font.monoBold, fontSize: 16, color: color.white },
  heroStatLabel: { fontFamily: font.bodySemibold, fontSize: 9, letterSpacing: 0.4, color: "#bdeccf", marginTop: 2 },
  heroChartLbl: { fontFamily: font.bodySemibold, fontSize: 10, color: "#bdeccf", letterSpacing: 0.3, marginBottom: 4 },

  sectionHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginTop: space.lg, marginBottom: 2 },
  sectionSub: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },

  focusCard: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.surface, borderRadius: radius.lg, padding: space.md, marginBottom: space.sm, ...shadow.soft },
  focusRank: { backgroundColor: color.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  focusRankText: { fontFamily: font.bodySemibold, fontSize: 10, color: color.inkDim },
  focusTopic: { fontFamily: font.bodySemibold, fontSize: 14, color: color.ink },
  focusMeta: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2 },
  focusBtn: { backgroundColor: color.greenBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  focusBtnText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.green },
  focusBtnGhost: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  focusBtnGhostText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.inkDim },

  panelSectionLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.6, color: color.inkFaint, marginTop: space.xl, marginBottom: space.md },

  telCard: { width: 150, backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.md },
  telLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  telLabel: { fontFamily: font.bodySemibold, fontSize: 10.5, color: color.consoleText },
  telInfo: { fontSize: 11, color: color.consoleText2 },
  telValRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 8 },
  telVal: { fontFamily: font.monoBold, fontSize: 20, color: "#fff" },
  telDelta: { fontFamily: font.monoSemibold, fontSize: 10.5 },

  panelCard: { backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.md },
  panelHeadLight: { marginBottom: space.sm },
  panelTitle: { fontFamily: font.bodySemibold, fontSize: 12, letterSpacing: 0.4, color: "#fff" },
  panelSub: { fontFamily: font.body, fontSize: 11, color: color.consoleText2 },
  logTitle: { fontFamily: font.displaySemibold, fontSize: 15, color: color.ink },

  heatSearch: { backgroundColor: color.consolePanel2, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, fontFamily: font.body, fontSize: 13, color: "#fff", marginBottom: space.sm },
  sortRow: { flexDirection: "row", gap: 6, marginBottom: space.md },
  sortBtn: { flex: 1, backgroundColor: color.consolePanel2, borderRadius: radius.sm, paddingVertical: 7, alignItems: "center" },
  sortBtnActive: { backgroundColor: color.royal },
  sortBtnText: { fontFamily: font.bodyMedium, fontSize: 10.5, color: color.consoleText },
  sortBtnTextActive: { color: "#fff" },
  heatEmpty: { fontFamily: font.body, fontSize: 12, color: color.consoleText2, paddingVertical: space.md },
  heatGroupLabel: { fontFamily: font.bodySemibold, fontSize: 10.5, color: color.consoleText2, letterSpacing: 0.3, marginTop: space.sm, marginBottom: 4 },
  heatRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  heatRank: { fontFamily: font.mono, fontSize: 10, color: color.consoleText2, width: 14 },
  heatDot: { width: 7, height: 7, borderRadius: 3.5 },
  heatName: { fontFamily: font.bodyMedium, fontSize: 12.5, color: "#fff", flex: 1 },
  heatPct: { fontFamily: font.monoSemibold, fontSize: 11.5 },
  heatGo: { fontFamily: font.bodySemibold, fontSize: 10.5, color: color.sky, marginLeft: 6 },
  heatLegend: { flexDirection: "row", gap: space.md, marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.consoleLine, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontFamily: font.body, fontSize: 10, color: color.consoleText2 },

  feedRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  feedGlyph: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  feedGlyphText: { fontSize: 11, fontFamily: font.bodySemibold },
  feedTopLine: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  feedHead: { fontFamily: font.bodySemibold, fontSize: 12.5, color: "#fff", flex: 1 },
  feedTime: { fontFamily: font.mono, fontSize: 10, color: color.consoleText2 },
  feedDetail: { fontFamily: font.body, fontSize: 11, color: color.consoleText, marginTop: 2, lineHeight: 15 },

  logCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  logFilterBtn: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  logFilterBtnActive: { backgroundColor: color.royal },
  logFilterText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  logFilterTextActive: { color: "#fff" },
  logGroupLabel: { fontFamily: font.bodySemibold, fontSize: 10.5, color: color.inkFaint, letterSpacing: 0.3, marginTop: space.sm, marginBottom: 4 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  logAccent: { width: 3, height: 32, borderRadius: 2 },
  logTopLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  logName: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.ink, flexShrink: 1 },
  examBadge: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  examBadgeText: { fontFamily: font.bodyMedium, fontSize: 9.5, color: color.inkDim },
  logMetaLine: { fontFamily: font.body, fontSize: 11, color: color.inkDim, marginTop: 2 },
  accPill: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  accPillText: { fontFamily: font.bodySemibold, fontSize: 11 },
  logNetVal: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim, marginTop: 3 },
  pagerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  pagerBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  pagerBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.royal },
  pagerBtnTextDisabled: { color: color.inkFaint },
  pagerLabel: { fontFamily: font.mono, fontSize: 12, color: color.inkDim },

  sdot: { width: 7, height: 7, borderRadius: 3.5 },
  topicRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  topicName: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1 },
  topicBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken, minWidth: 50 },
  topicBarFill: { height: 6, borderRadius: 3 },
  topicPct: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim, width: 36, textAlign: "right" },

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

  tipOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: space.xl },
  tipBox: { backgroundColor: color.inkNavy900, borderRadius: radius.lg, padding: space.lg },
  tipText: { fontFamily: font.body, fontSize: 13, color: "#fff", lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  resolveModal: { backgroundColor: color.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, maxHeight: "80%" },
  resolveBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: color.greenBg, alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginBottom: space.sm },
  resolveBadgeText: { fontFamily: font.bodySemibold, fontSize: 11, color: color.green },
  resolveTitle: { fontFamily: font.displaySemibold, fontSize: 17, color: color.ink, marginBottom: 6 },
  candidateBtn: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: color.surfaceSunken, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  candidateText: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.ink, flex: 1 },
  candidateSection: { fontFamily: font.body, fontWeight: "400", color: color.inkDim },
  candidateArrow: { fontFamily: font.bodySemibold, fontSize: 14, color: color.inkFaint },
  resolveManualBtn: { alignItems: "center", paddingVertical: space.md, marginTop: space.sm },
  resolveManualText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
});
