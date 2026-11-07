import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space, shadow } from "../../theme";
import type { TargetExamState } from "../../../shared/types";

interface Props {
  state: TargetExamState;
  onStartTopic: (topic: string) => void;
  onRefresh: () => Promise<void> | void;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function readinessColor(status: TargetExamState["readinessStatus"]): string {
  return status === "ahead" ? color.statusGood : status === "behind" ? color.statusBad : color.statusWarn;
}

function calColor(level: string): string {
  if (level === "miss") return "rgba(255,122,122,0.22)";
  if (level === "1") return "rgba(79,209,139,0.25)";
  if (level === "2") return "rgba(79,209,139,0.5)";
  if (level === "3") return color.statusGood;
  return color.consolePanel3;
}

export default function TargetExamDashboard({ state, onStartTopic, onRefresh }: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [tasksDoneLocal, setTasksDoneLocal] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const ring = useMemo(() => {
    const r = 44;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(100, state.readiness));
    return { c, offset: c - (pct / 100) * c };
  }, [state.readiness]);

  const doneCount = state.todayTasks.filter((t) => t.done || tasksDoneLocal.has(t.topic)).length;
  const totalTasks = Math.max(1, state.todayTasks.length);
  const currentPhase = state.plan.phases[state.currentPhaseIndex];
  const gap = Math.round(state.targetCutoff - state.currentAvgAccuracy);
  const targetCutoffMarks = Math.round((state.targetCutoff / 100) * state.totalMarks);
  const showWarning = state.missedDaysThisWeek >= 2;

  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable style={[styles.exitRow, { marginTop: insets.top }]} onPress={() => navigation.goBack()} hitSlop={10}>
        <Text style={styles.exitRowText}>← Home</Text>
      </Pressable>

      {showWarning && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.warnTitle}>You've missed {state.missedDaysThisWeek} days this week</Text>
            <Text style={styles.warnSub}>{state.daysLeft} days left — a short gap now is recoverable, a longer one isn't.</Text>
          </View>
          <Pressable
            style={styles.warnBtn}
            onPress={() => currentPhase?.focusTopics[0] && onStartTopic(currentPhase.focusTopics[0])}
          >
            <Text style={styles.warnBtnText}>Catch up →</Text>
          </Pressable>
        </View>
      )}

      <LinearGradient colors={[color.inkNavy900, "#0d2a4a", color.inkNavy700]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroPill}>
          <View style={styles.liveDot} />
          <Text style={styles.heroPillText}>Target Exam — tracking since {new Date(state.acceptedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
        </View>

        <View style={styles.heroTitleRow}>
          <Text style={styles.heroExam}>{state.exam}</Text>
          <View style={styles.stageTag}><Text style={styles.stageTagText}>{state.stage}</Text></View>
        </View>
        <View style={styles.countdownRow}>
          <Text style={styles.countdownNum}>{state.daysLeft}</Text>
          <Text style={styles.countdownUnit}>days left</Text>
        </View>
        <Text style={styles.countdownSub}>Exam date: {fmtDate(state.examDate)}</Text>

        <View style={styles.readyRow}>
          <View style={{ width: 104, height: 104, alignItems: "center", justifyContent: "center" }}>
            <Svg width={104} height={104}>
              <Circle cx={52} cy={52} r={44} stroke="rgba(255,255,255,0.15)" strokeWidth={10} fill="none" />
              <Circle
                cx={52} cy={52} r={44} stroke={readinessColor(state.readinessStatus)} strokeWidth={10}
                strokeDasharray={`${ring.c},${ring.c}`} strokeDashoffset={ring.offset} strokeLinecap="round"
                fill="none" rotation={-90} origin="52,52"
              />
            </Svg>
            <View style={StyleSheet.absoluteFill}>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={styles.readyPct}>{state.readiness}%</Text>
                <Text style={styles.readyLbl}>Ready</Text>
              </View>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.readyStatus, { color: readinessColor(state.readinessStatus) }]}>
              {state.readinessStatus === "ahead" ? "✓ Ahead of pace" : state.readinessStatus === "behind" ? "⚠ Behind pace" : "On track"}
            </Text>
            <Text style={styles.readyDesc}>
              You're averaging {state.currentAvgAccuracy}% accuracy against a {state.targetCutoff}% target
              {state.totalMarks !== 100 ? ` (${targetCutoffMarks}/${state.totalMarks} marks)` : ""}.
            </Text>
          </View>
        </View>

        <View style={styles.gapRow}>
          <View style={styles.gapStat}><Text style={styles.gapStatVal}>{state.currentAvgAccuracy}%</Text><Text style={styles.gapStatLbl}>Current avg</Text></View>
          <View style={styles.gapStat}><Text style={styles.gapStatVal}>{targetCutoffMarks}/{state.totalMarks}</Text><Text style={styles.gapStatLbl}>Target cutoff</Text></View>
          <View style={styles.gapStat}><Text style={[styles.gapStatVal, { color: color.statusBad }]}>{gap > 0 ? `-${gap}` : `+${-gap}`}</Text><Text style={styles.gapStatLbl}>Gap to close</Text></View>
        </View>
      </LinearGradient>

      {/* Today's plan */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>📋 Today's plan</Text>
          <Text style={styles.cardSub}>{currentPhase?.label ?? "—"}</Text>
        </View>
        {state.todayTasks.length === 0 ? (
          <Text style={styles.mutedSmall}>Nothing scheduled today — this phase is light revision only.</Text>
        ) : (
          state.todayTasks.map((t) => {
            const done = t.done || tasksDoneLocal.has(t.topic);
            return (
              <View key={t.topic} style={[styles.taskRow, done && styles.taskRowDone]}>
                <Pressable
                  style={[styles.taskCheck, done && styles.taskCheckDone]}
                  onPress={() => setTasksDoneLocal((prev) => {
                    const n = new Set(prev);
                    if (n.has(t.topic)) n.delete(t.topic); else n.add(t.topic);
                    return n;
                  })}
                >
                  {done && <Text style={styles.taskCheckMark}>✓</Text>}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskName, done && styles.taskNameDone]}>{t.topic}</Text>
                  <Text style={styles.taskMeta}>{t.meta}</Text>
                </View>
                <Pressable style={styles.taskGo} onPress={() => onStartTopic(t.topic)}>
                  <Text style={styles.taskGoText}>{done ? "Practice again →" : "Start →"}</Text>
                </Pressable>
              </View>
            );
          })
        )}
        <View style={styles.taskProgressRow}>
          <View style={styles.taskProgressTrack}><View style={[styles.taskProgressFill, { width: `${(doneCount / totalTasks) * 100}%` }]} /></View>
          <Text style={styles.taskProgressLbl}>{doneCount} / {state.todayTasks.length} done</Text>
        </View>
      </View>

      {/* Consistency */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>📅 Consistency</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.legDot, { backgroundColor: "rgba(255,122,122,0.22)" }]} /><Text style={styles.legTxt}>missed</Text>
          <View style={[styles.legDot, { backgroundColor: color.consolePanel3 }]} /><Text style={styles.legTxt}>none</Text>
          <View style={[styles.legDot, { backgroundColor: "rgba(79,209,139,0.4)" }]} /><Text style={styles.legTxt}>partial</Text>
          <View style={[styles.legDot, { backgroundColor: color.statusGood }]} /><Text style={styles.legTxt}>full</Text>
        </View>
        <View style={styles.heatGrid}>
          {state.calendar.map((d) => (
            <View key={d.date} style={[styles.heatCell, { backgroundColor: calColor(d.level) }]} />
          ))}
        </View>
        <View style={styles.calStatsRow}>
          <View style={styles.calStat}><Text style={styles.calStatVal}>{state.streak}</Text><Text style={styles.calStatLbl}>Day streak</Text></View>
          <View style={styles.calStat}>
            <Text style={styles.calStatVal}>{state.calendar.filter((d) => d.level !== "0" && d.level !== "miss").length}/{state.calendar.length}</Text>
            <Text style={styles.calStatLbl}>Days on plan</Text>
          </View>
          <View style={styles.calStat}><Text style={[styles.calStatVal, { color: color.statusBad }]}>{state.missedDaysThisWeek}</Text><Text style={styles.calStatLbl}>Missed this week</Text></View>
        </View>
      </View>

      {/* Plan progress */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>📈 Plan progress</Text>
          <Text style={styles.cardSub}>Phase {state.currentPhaseIndex + 1} of {state.plan.phases.length}</Text>
        </View>
        <View style={styles.phaseStrip}>
          {state.plan.phases.map((p, i) => (
            <View
              key={i}
              style={[
                styles.phaseSeg,
                i < state.currentPhaseIndex && styles.phaseSegDone,
                i === state.currentPhaseIndex && styles.phaseSegCurrent,
              ]}
            >
              <Text style={styles.phaseSegText}>Wk {Math.round(p.startDay / 7) + 1}–{Math.round(p.endDay / 7)}</Text>
            </View>
          ))}
        </View>
        {currentPhase && (
          <Text style={styles.phaseNote}>
            Currently in <Text style={styles.phaseNoteBold}>{currentPhase.label}</Text>.{" "}
            {state.currentPhaseIndex < state.plan.phases.length - 1
              ? `Next phase in ${Math.max(0, currentPhase.endDay - Math.round((Date.now() - state.acceptedAt) / 86400000))} days.`
              : "This is your final phase before the exam."}
          </Text>
        )}
      </View>

      {/* Plan adjustments */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>🔄 Plan adjustments</Text>
          <Text style={styles.cardSub}>auto-tuned</Text>
        </View>
        {state.adaptiveLog.length === 0 ? (
          <Text style={styles.mutedSmall}>No adjustments yet — check back as you build up attempt history.</Text>
        ) : (
          [...state.adaptiveLog].reverse().map((e, i) => (
            <View key={i} style={styles.adaptItem}>
              <View style={[styles.adaptDot, { backgroundColor: e.kind === "warning" ? color.statusBad : e.kind === "good" ? color.statusGood : color.sky }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.adaptMsg}>{e.message}</Text>
                <Text style={styles.adaptDetail}>{e.detail.replace(/\s*\[[^\]]+\]\s*$/, "")}</Text>
                <Text style={styles.adaptDate}>{new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <Pressable style={styles.refreshBtn} onPress={refresh} disabled={refreshing}>
        <Text style={styles.refreshBtnText}>{refreshing ? "Refreshing…" : "↺ Refresh"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },

  exitRow: { alignSelf: "flex-start", marginBottom: space.md },
  exitRowText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },

  warnBanner: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: "#a62d27", borderRadius: radius.md, padding: space.md, marginBottom: space.lg },
  warnIcon: { fontSize: 20 },
  warnTitle: { color: color.white, fontFamily: font.bodySemibold, fontSize: 13 },
  warnSub: { color: "rgba(255,255,255,0.85)", fontFamily: font.body, fontSize: 11.5, marginTop: 2 },
  warnBtn: { backgroundColor: color.white, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  warnBtnText: { color: "#a62d27", fontFamily: font.bodyBold, fontSize: 12 },

  hero: { borderRadius: radius.lg, padding: space.xl, marginBottom: space.lg, ...shadow.card },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 7, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, marginBottom: space.lg },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.statusGood },
  heroPillText: { color: "rgba(255,255,255,0.85)", fontFamily: font.bodyMedium, fontSize: 11 },
  heroTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroExam: { color: color.white, fontFamily: font.displayBlack, fontSize: 22 },
  stageTag: { backgroundColor: "rgba(255,255,255,0.14)", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  stageTagText: { color: color.white, fontFamily: font.bodySemibold, fontSize: 10.5, textTransform: "capitalize" },
  countdownRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: space.sm },
  countdownNum: { color: color.white, fontFamily: font.monoBold, fontSize: 40, lineHeight: 42 },
  countdownUnit: { color: "rgba(255,255,255,0.7)", fontFamily: font.bodyMedium, fontSize: 13, marginBottom: 6 },
  countdownSub: { color: "rgba(255,255,255,0.6)", fontFamily: font.body, fontSize: 12, marginTop: 2 },
  readyRow: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.lg },
  readyPct: { color: color.white, fontFamily: font.monoBold, fontSize: 20 },
  readyLbl: { color: "rgba(255,255,255,0.7)", fontFamily: font.body, fontSize: 9, textTransform: "uppercase" },
  readyStatus: { fontFamily: font.bodyBold, fontSize: 14, marginBottom: 4 },
  readyDesc: { color: "rgba(255,255,255,0.75)", fontFamily: font.body, fontSize: 12, lineHeight: 17 },
  gapRow: { flexDirection: "row", justifyContent: "space-between", marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.15)" },
  gapStat: { alignItems: "flex-start" },
  gapStatVal: { color: color.white, fontFamily: font.monoBold, fontSize: 15 },
  gapStatLbl: { color: "rgba(255,255,255,0.6)", fontFamily: font.body, fontSize: 10.5, marginTop: 2 },

  card: { backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: color.consoleLine },
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: space.md, flexWrap: "wrap" },
  cardTitle: { color: color.white, fontFamily: font.bodyBold, fontSize: 14.5 },
  cardSub: { color: color.consoleText2, fontFamily: font.body, fontSize: 11.5 },
  mutedSmall: { color: color.consoleText, fontFamily: font.body, fontSize: 12.5 },

  taskRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  taskRowDone: { opacity: 0.7 },
  taskCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color.consoleLine2, alignItems: "center", justifyContent: "center" },
  taskCheckDone: { backgroundColor: color.statusGood, borderColor: color.statusGood },
  taskCheckMark: { color: "#06230f", fontSize: 12, fontFamily: font.bodyBold },
  taskName: { color: color.white, fontFamily: font.bodySemibold, fontSize: 13.5 },
  taskNameDone: { color: color.consoleText2, textDecorationLine: "line-through" },
  taskMeta: { color: color.consoleText2, fontFamily: font.body, fontSize: 11 },
  taskGo: { backgroundColor: color.royal, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  taskGoText: { color: color.white, fontFamily: font.bodyBold, fontSize: 11.5 },
  taskProgressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: space.md },
  taskProgressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: color.consoleLine2, overflow: "hidden" },
  taskProgressFill: { height: 5, borderRadius: 3, backgroundColor: color.statusGood },
  taskProgressLbl: { color: color.consoleText2, fontFamily: font.mono, fontSize: 10.5 },

  legendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: space.md, flexWrap: "wrap" },
  legDot: { width: 9, height: 9, borderRadius: 2, marginRight: 2 },
  legTxt: { color: color.consoleText2, fontFamily: font.body, fontSize: 10, marginRight: 8 },
  heatGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: space.lg },
  heatCell: { width: 18, height: 18, borderRadius: 3 },
  calStatsRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.consoleLine },
  calStat: { alignItems: "center", gap: 2 },
  calStatVal: { color: color.white, fontFamily: font.monoBold, fontSize: 16 },
  calStatLbl: { color: color.consoleText2, fontFamily: font.body, fontSize: 10.5 },

  phaseStrip: { flexDirection: "row", gap: 4, marginBottom: space.md, flexWrap: "wrap" },
  phaseSeg: { flexGrow: 1, minWidth: 60, paddingVertical: 9, paddingHorizontal: 4, borderRadius: radius.sm, backgroundColor: color.consolePanel2, alignItems: "center" },
  phaseSegDone: { backgroundColor: color.statusGood },
  phaseSegCurrent: { backgroundColor: color.royal },
  phaseSegText: { color: color.consoleText2, fontFamily: font.monoBold, fontSize: 10.5 },
  phaseNote: { color: color.consoleText, fontFamily: font.body, fontSize: 12.5, lineHeight: 18 },
  phaseNoteBold: { color: color.white, fontFamily: font.bodyBold },

  adaptItem: { flexDirection: "row", gap: 10, marginBottom: space.md },
  adaptDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  adaptMsg: { color: color.white, fontFamily: font.bodySemibold, fontSize: 13 },
  adaptDetail: { color: color.consoleText, fontFamily: font.body, fontSize: 12, marginTop: 3 },
  adaptDate: { color: color.consoleText2, fontFamily: font.body, fontSize: 10.5, marginTop: 3 },

  refreshBtn: { alignSelf: "flex-end", backgroundColor: color.consolePanel2, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 11, marginTop: space.sm },
  refreshBtnText: { color: color.white, fontFamily: font.bodyBold, fontSize: 13 },
});
