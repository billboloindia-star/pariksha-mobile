import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import * as api from "../../shared/api";
import type { AttemptRecord } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";

function secs(ms: number) {
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

export default function InsightsScreen() {
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.fetchAttempts().then(setAttempts).catch(() => setError("Couldn't load your attempt history."));
  }, []);

  const weakTopics = useMemo(() => {
    if (!attempts) return [];
    const byTopic: Record<string, { ok: number; att: number }> = {};
    for (const a of attempts) {
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
  }, [attempts]);

  const mistakes = useMemo(() => {
    if (!attempts) return [];
    const out: { when: number; title: string; topic: string; text: string; yourAnswer: string; correct: string; timeMs: number }[] = [];
    for (const a of attempts) {
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
  }, [attempts]);

  if (!attempts && !error) {
    return <ActivityIndicator color={color.royal} style={{ flex: 1, backgroundColor: color.canvas }} />;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64, paddingBottom: space.xxl }}>
      <Text style={styles.title}>Weak areas & mistakes</Text>
      <Text style={styles.sub}>Pulled from every past attempt — the topics costing you the most marks, and every wrong answer in one place.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {attempts && attempts.length === 0 && (
        <Text style={styles.empty}>Write a mock test to start seeing your weak areas here.</Text>
      )}

      {attempts && attempts.length > 0 && (
        <>
          <Text style={styles.sectionHead}>Weakest topics</Text>
          <View style={styles.card}>
            {weakTopics.length === 0 ? (
              <Text style={styles.mutedSmall}>No attempted questions yet.</Text>
            ) : (
              weakTopics.slice(0, 10).map((t) => (
                <View key={t.topic} style={styles.topicRow}>
                  <Text style={styles.topicName} numberOfLines={1}>{t.topic}</Text>
                  <Text style={[styles.topicStat, { color: t.acc < 50 ? color.red : t.acc < 75 ? color.inkDim : color.green }]}>
                    {t.acc}% · {t.att} attempt{t.att === 1 ? "" : "s"}
                  </Text>
                </View>
              ))
            )}
          </View>

          <Text style={styles.sectionHead}>Mistake journal</Text>
          {mistakes.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.mutedSmall}>No wrong answers recorded yet — or your recent attempts haven't generated the detail this needs.</Text>
            </View>
          ) : (
            mistakes.slice(0, 40).map((m, i) => {
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
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg, lineHeight: 18 },
  error: { fontFamily: font.bodyMedium, fontSize: 13, color: color.red, marginBottom: space.md },
  empty: { fontFamily: font.body, fontSize: 14, color: color.inkDim, marginTop: space.xl, textAlign: "center" },
  sectionHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginBottom: space.sm, marginTop: space.md },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  mutedSmall: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  topicRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  topicName: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1, marginRight: space.sm },
  topicStat: { fontFamily: font.bodySemibold, fontSize: 12 },
  mistakeCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm, ...shadow.soft },
  mistakeMetaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm, flexWrap: "wrap" },
  chip: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  mistakeText: { fontFamily: font.body, fontSize: 14, color: color.ink, marginBottom: space.sm, lineHeight: 19 },
  mistakeValsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  badText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.red },
  goodText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.green },
  arrow: { fontFamily: font.body, fontSize: 12, color: color.inkFaint },
});
