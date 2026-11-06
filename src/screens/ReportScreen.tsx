import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute, type RouteProp, CommonActions } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../shared/api";
import { loadLocalHistory, saveLocalHistory } from "../../shared/history";
import type { AttemptQuestionRecord, AttemptRecord } from "../../shared/types";
import { color, font, radius, space } from "../theme";
import HaloRing from "../components/HaloRing";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Report">;
type ReportRoute = RouteProp<RootStackParamList, "Report">;

function fmt(s: number) {
  const t = Math.max(0, Math.round(s));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Mobile port of web Report.tsx's save-on-mount logic plus an "overview"
 * equivalent of its tabbed layout (score, section/topic breakdown, mistake
 * list). The web version's pacing/fatigue-curve/progress-trend charts and
 * per-question notes editor are a lot of extra surface for a first mobile
 * pass — not ported here; the AI-review flow already exists on the Past
 * Attempts detail screen, which covers that need for a saved attempt. */
export default function ReportScreen() {
  const navigation = useNavigation<Nav>();
  const { result } = useRoute<ReportRoute>().params;
  const { paper, states, correct, wrong, skipped, attempted, net, accuracy, avgSec, byTopic, elapsedSec, tabSwitches } = result;
  const total = paper.questions.length;

  useEffect(() => {
    const when = Date.now();
    const questionRecords: AttemptQuestionRecord[] = paper.questions.map((q, i) => ({
      id: q.id, topic: q.topic, type: q.type,
      text: q.text.length > 400 ? q.text.slice(0, 399) + "…" : q.text,
      options: q.options,
      ans: q.ans, given: states[i].given, timeMs: states[i].timeMs,
    }));
    const rec: AttemptRecord = {
      when, title: paper.title, net: Number(net.toFixed(2)), total,
      correct, wrong, skipped, secs: Math.round(elapsedSec),
      accuracy: Number(accuracy.toFixed(1)),
      avgSec: Number(avgSec.toFixed(1)),
      byTopic: Object.fromEntries(Object.entries(byTopic).map(([k, t]) => [k, { ok: t.ok, att: t.att }])),
      tabSwitches,
      exam: paper.exam,
      questions: questionRecords,
    };

    try {
      const local = [rec, ...loadLocalHistory()].slice(0, 10);
      saveLocalHistory(local);
    } catch { /* storage may be blocked */ }

    const session = api.getSession();
    if (api.backendEnabled() && session) {
      api.saveAttempt(rec).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sectionRows = useMemo(() => {
    if (paper.sections.length <= 1) return [];
    return paper.sections.map((s) => {
      let ok = 0, att = 0;
      for (let i = s.from; i <= s.to; i++) {
        if (states[i].given === null) continue;
        att += 1;
        if (states[i].given === paper.questions[i].ans) ok += 1;
      }
      return { name: s.name, ok, total: s.to - s.from + 1, acc: att ? Math.round((ok / att) * 100) : 0 };
    });
  }, [paper, states]);

  const mistakes = useMemo(
    () => paper.questions
      .map((q, i) => ({ q, i, s: states[i] }))
      .filter((o) => o.s.given !== null && o.s.given !== o.q.ans),
    [paper.questions, states]
  );

  function goHome() {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs" }] }));
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }}>
      <LinearGradient colors={["#0a1b36", "#1d4ed8", "#38bdf8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroLabel}>YOUR SCORE</Text>
        <Text style={styles.heroScore}>{net.toFixed(2)}<Text style={styles.heroScoreTotal}> / {total}</Text></Text>
        <Text style={styles.heroSub} numberOfLines={1}>{paper.title} · submitted in {fmt(elapsedSec)}</Text>

        <View style={styles.miniStatsRow}>
          <MiniStat label="Correct" value={correct} color={color.green} />
          <MiniStat label="Wrong" value={wrong} color={color.red} />
          <MiniStat label="Skipped" value={skipped} color={color.white} />
        </View>
      </LinearGradient>

      <View style={{ padding: space.xl }}>
        <View style={styles.chipRow}>
          <StatChip label="ACCURACY" value={`${accuracy}%`} />
          <StatChip label="AVG/Q" value={`${avgSec.toFixed(1)}s`} />
          <StatChip label="ATTEMPTED" value={`${attempted}/${total}`} />
        </View>

        {sectionRows.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardHead}>Section-wise</Text>
            {sectionRows.map((s) => (
              <View key={s.name} style={{ marginBottom: space.md }}>
                <View style={styles.sectionRowHead}>
                  <Text style={styles.sectionName} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.sectionScore}>{s.ok} / {s.total}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${s.acc}%` }]} />
                </View>
              </View>
            ))}
          </View>
        )}

        {mistakes.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardHead}>Review your mistakes ({mistakes.length})</Text>
            {mistakes.slice(0, 15).map(({ q, i, s }) => (
              <View key={i} style={styles.mistakeRow}>
                <Text style={styles.mistakeQ} numberOfLines={2}>{i + 1}. {q.text}</Text>
                <Text style={styles.mistakeAns}>
                  Your answer: <Text style={styles.badText}>{q.type === "mc" ? (q.options?.[s.given!] ?? s.given) : s.given}</Text>
                  {"  ·  "}Correct: <Text style={styles.goodText}>{q.type === "mc" ? (q.options?.[q.ans] ?? q.ans) : q.ans}</Text>
                </Text>
              </View>
            ))}
            {mistakes.length > 15 && (
              <Text style={styles.moreHint}>+{mistakes.length - 15} more — full question review is on the way</Text>
            )}
          </View>
        )}

        <Pressable style={styles.doneBtn} onPress={goHome}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function MiniStat({ label, value, color: c }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color: c }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
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

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: space.xl, paddingHorizontal: space.xl, alignItems: "center", borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  heroLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.7)", marginBottom: space.sm },
  heroScore: { fontFamily: font.monoBold, fontSize: 52, color: color.white },
  heroScoreTotal: { fontFamily: font.mono, fontSize: 22, color: "rgba(255,255,255,0.6)" },
  heroSub: { fontFamily: font.body, fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: space.sm },
  miniStatsRow: { flexDirection: "row", gap: space.xl, marginTop: space.xl },
  miniStat: { alignItems: "center" },
  miniStatValue: { fontFamily: font.monoBold, fontSize: 20 },
  miniStatLabel: { fontFamily: font.body, fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },

  chipRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg, marginTop: -space.xxl },
  statChip: { flex: 1, backgroundColor: color.surface, borderRadius: radius.md, padding: space.md, alignItems: "center" },
  statChipLabel: { fontFamily: font.bodySemibold, fontSize: 10, color: color.inkFaint },
  statChipValue: { fontFamily: font.monoSemibold, fontSize: 16, color: color.ink, marginTop: 2 },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginBottom: space.md },
  sectionRowHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  sectionName: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1, marginRight: space.sm },
  sectionScore: { fontFamily: font.monoSemibold, fontSize: 12, color: color.inkDim },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken },
  barFill: { height: 6, borderRadius: 3, backgroundColor: color.royal },

  mistakeRow: { paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  mistakeQ: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, marginBottom: 4 },
  mistakeAns: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  badText: { fontFamily: font.bodySemibold, color: color.red },
  goodText: { fontFamily: font.bodySemibold, color: color.green },
  moreHint: { fontFamily: font.body, fontSize: 12, color: color.inkFaint, marginTop: space.sm },

  doneBtn: { backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", marginTop: space.md, marginBottom: space.xxl },
  doneBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },
});
