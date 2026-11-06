import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, ScrollView } from "react-native";
import * as api from "../../shared/api";
import { loadHistory } from "../../shared/history";
import type { AiReview as AiReviewData, AttemptRecord, PerformanceInput } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import HaloRing from "../components/HaloRing";

function fmtStamp(when: number): string {
  const d = new Date(when);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PastAttemptsScreen() {
  const [history, setHistory] = useState<AttemptRecord[] | null>(null);
  const [selected, setSelected] = useState<AttemptRecord | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [aiReview, setAiReview] = useState<AiReviewData | null>(null);

  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

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
        <Pressable onPress={() => setSelected(null)}><Text style={styles.back}>← All attempts</Text></Pressable>
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
                  <View style={[styles.topicBarFill, { width: `${t.acc}%`, backgroundColor: t.acc >= 70 ? color.green : t.acc >= 40 ? color.amber : color.red }]} />
                </View>
                <Text style={styles.topicPct}>{t.acc}%</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <FlatList
        data={history ?? []}
        keyExtractor={(h) => String(h.when)}
        contentContainerStyle={{ padding: space.xl, paddingTop: 64 }}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Past attempts</Text>
            <Text style={styles.sub}>Every mock test you've submitted, with its score and topic breakdown.</Text>
            {history === null && <ActivityIndicator color={color.royal} style={{ marginTop: space.xl }} />}
            {history !== null && history.length === 0 && (
              <Text style={styles.empty}>No attempts yet — write your first mock test to see it here.</Text>
            )}
          </>
        }
        renderItem={({ item: h }) => (
          <Pressable style={styles.card} onPress={() => selectAttempt(h)}>
            <Text style={styles.cardTitle} numberOfLines={1}>{h.title}</Text>
            <Text style={styles.cardMeta}>{fmtStamp(h.when)}</Text>
            <View style={styles.cardStatsRow}>
              <Text style={styles.cardNet}>net {h.net.toFixed(2)}/{h.total}</Text>
              {h.accuracy !== undefined && <Text style={styles.cardAcc}>{h.accuracy}% accuracy</Text>}
            </View>
          </Pressable>
        )}
      />
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
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal, marginBottom: space.lg },
  title: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, textAlign: "center", marginTop: space.xl },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.soft },
  cardTitle: { fontFamily: font.bodySemibold, fontSize: 15, color: color.ink },
  cardMeta: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginTop: 2, marginBottom: 8 },
  cardStatsRow: { flexDirection: "row", gap: space.md },
  cardNet: { fontFamily: font.monoSemibold, fontSize: 13, color: color.royal },
  cardAcc: { fontFamily: font.body, fontSize: 12, color: color.inkDim },

  scoreCard: { flexDirection: "row", alignItems: "center", backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, ...shadow.soft },
  netLabel: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  netValue: { fontFamily: font.monoBold, fontSize: 22, color: color.ink },

  chipRow: { flexDirection: "row", gap: space.sm, marginBottom: space.lg },
  statChip: { flex: 1, backgroundColor: color.surface, borderRadius: radius.md, padding: space.md, alignItems: "center", ...shadow.soft },
  statChipLabel: { fontFamily: font.bodySemibold, fontSize: 10, color: color.inkFaint, letterSpacing: 0.4 },
  statChipValue: { fontFamily: font.monoSemibold, fontSize: 16, color: color.ink, marginTop: 2 },

  aiCta: { backgroundColor: color.inkNavy900, borderRadius: radius.lg, padding: space.lg, alignItems: "center", marginBottom: space.lg },
  aiCtaText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },

  card2: {},
  sectionHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginTop: space.lg, marginBottom: space.sm },
  topicRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6 },
  topicName: { fontFamily: font.bodyMedium, fontSize: 12, color: color.ink, width: 100 },
  topicBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken },
  topicBarFill: { height: 6, borderRadius: 3 },
  topicPct: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim, width: 36, textAlign: "right" },

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
