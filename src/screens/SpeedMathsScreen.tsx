import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ALL_SPEED_MATH_TYPES,
  SPEED_MATH_LABELS,
  generateSpeedMathQuestion,
  checkSpeedMathAnswer,
  summarizeSpeedMathSession,
  getTableRow,
  FRACTION_TABLE,
  type SpeedMathType,
  type SpeedMathQuestion,
  type SpeedMathRecord,
  type SpeedMathPaceMode,
  type SpeedMathSummary,
} from "../../shared/speedMaths";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "SpeedMaths">;
type Phase = "setup" | "drill" | "results";
type SetupMode = "drill" | "reference";

const COUNT_OPTIONS = [10, 20, 30, 50];
const DURATION_OPTIONS = [2, 5, 10];

type RefMode = "tables" | "squares" | "cubes" | "sqrt" | "cbrt" | "fractions";
const REF_TAB_ORDER: RefMode[] = ["tables", "squares", "cubes", "sqrt", "cbrt", "fractions"];
const REF_TAB_LABELS: Record<RefMode, string> = {
  tables: "Tables", squares: "Squares", cubes: "Cubes", sqrt: "Square Root", cbrt: "Cube Root", fractions: "Fractions",
};
const REF_START: Record<RefMode, number> = { tables: 7, squares: 12, cubes: 7, sqrt: 12, cbrt: 7, fractions: 2 };
const REF_MAX: Record<RefMode, number> = { tables: 25, squares: 50, cubes: 30, sqrt: 50, cbrt: 30, fractions: 20 };
const REF_MIN: Record<RefMode, number> = { tables: 1, squares: 1, cubes: 1, sqrt: 1, cbrt: 1, fractions: 2 };
const REF_CHIP_W = 40; // chip width + gap, used to scroll the active one into view

interface RefRow { l: string; r: string | number; hi?: boolean }

function refRows(mode: RefMode, n: number): RefRow[] {
  if (mode === "tables") return getTableRow(n).map((r) => ({ l: `${n} × ${r.multiple}`, r: r.product }));
  if (mode === "fractions") {
    return FRACTION_TABLE.filter((f) => f.den === n).map((f) => ({ l: `${f.num}/${f.den}`, r: `${f.truncPct.toFixed(2)}%` }));
  }
  const max = mode === "cubes" || mode === "cbrt" ? 30 : 50;
  const out: RefRow[] = [];
  for (let k = Math.max(1, n - 3); k <= Math.min(max, n + 3); k++) {
    if (mode === "squares") out.push({ l: `${k}²`, r: k * k, hi: k === n });
    else if (mode === "cubes") out.push({ l: `${k}³`, r: k * k * k, hi: k === n });
    else if (mode === "sqrt") out.push({ l: `√${k * k}`, r: k, hi: k === n });
    else if (mode === "cbrt") out.push({ l: `∛${k * k * k}`, r: k, hi: k === n });
  }
  return out;
}

function refLabel(mode: RefMode, n: number): string {
  if (mode === "tables") return `Table of ${n}`;
  if (mode === "fractions") return `Denominator ${n}`;
  if (mode === "squares") return `${n}²`;
  if (mode === "cubes") return `${n}³`;
  if (mode === "sqrt") return `√${n * n} = ?`;
  return `∛${n * n * n} = ?`;
}

function refBig(mode: RefMode, n: number): string {
  if (mode === "tables" || mode === "fractions") return "";
  if (mode === "squares") return `${n * n}`;
  if (mode === "cubes") return `${n * n * n}`;
  return `${n}`;
}

function ReferenceStage() {
  const [mode, setMode] = useState<RefMode>("tables");
  const [current, setCurrent] = useState(7);
  // RN 0.88/React 19's new host-component ref types don't expose scrollTo here.
  const stripRef = useRef<any>(null);

  useEffect(() => {
    const idx = (mode === "fractions" ? current - REF_MIN.fractions : current - 1);
    const x = Math.max(0, idx * REF_CHIP_W - 150);
    stripRef.current?.scrollTo({ x, animated: true });
  }, [mode, current]);

  const rows = refRows(mode, current);
  const big = refBig(mode, current);
  const values = mode === "fractions"
    ? Array.from({ length: REF_MAX.fractions - REF_MIN.fractions + 1 }, (_, i) => i + REF_MIN.fractions)
    : Array.from({ length: REF_MAX[mode] }, (_, i) => i + 1);

  return (
    <View>
      <View style={styles.refTabRow}>
        {REF_TAB_ORDER.map((m) => (
          <Pressable key={m} style={[styles.refTabBtn, mode === m && styles.refTabBtnActive]} onPress={() => { setMode(m); setCurrent(REF_START[m]); }}>
            <Text style={[styles.refTabBtnText, mode === m && styles.refTabBtnTextActive]}>{REF_TAB_LABELS[m]}</Text>
          </Pressable>
        ))}
      </View>

      <LinearGradient colors={["#0b1626", "#081222"]} style={styles.refStage}>
        <View style={styles.refPickRow}>
          <Pressable style={styles.refPickArrow} onPress={() => setCurrent((c) => Math.max(REF_MIN[mode], c - 1))}>
            <Text style={styles.refPickArrowText}>‹</Text>
          </Pressable>
          <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} style={styles.refPickStrip} contentContainerStyle={{ paddingHorizontal: 8 }}>
            {values.map((v) => (
              <Pressable key={v} style={[styles.refPickChip, current === v && styles.refPickChipActive]} onPress={() => setCurrent(v)}>
                <Text style={[styles.refPickChipText, current === v && styles.refPickChipTextActive]}>{mode === "fractions" ? `/${v}` : v}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.refPickArrow} onPress={() => setCurrent((c) => Math.min(REF_MAX[mode], c + 1))}>
            <Text style={styles.refPickArrowText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.refBigAnswer}>
          <Text style={[styles.refEq, !big && styles.refEqNoVal]}>{refLabel(mode, current)}</Text>
          {!!big && <Text style={styles.refVal}>{big}</Text>}
        </View>

        <View style={styles.refMiniList}>
          {rows.map((r) => (
            <View style={[styles.refMiniRow, r.hi && styles.refMiniRowCurrent]} key={r.l}>
              <Text style={[styles.refMiniRowL, r.hi && styles.refMiniRowTextCurrent]}>{r.l}</Text>
              <Text style={[styles.refMiniRowR, r.hi && styles.refMiniRowTextCurrent]}>{r.r}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

export default function SpeedMathsScreen() {
  const navigation = useNavigation<Nav>();
  const [phase, setPhase] = useState<Phase>("setup");
  const [setupMode, setSetupMode] = useState<SetupMode>("drill");
  const [types, setTypes] = useState<Set<SpeedMathType>>(new Set(ALL_SPEED_MATH_TYPES));
  const [paceMode, setPaceMode] = useState<SpeedMathPaceMode>("count");
  const [count, setCount] = useState(20);
  const [durationSec, setDurationSec] = useState(300);

  const [question, setQuestion] = useState<SpeedMathQuestion | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [records, setRecords] = useState<SpeedMathRecord[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [summary, setSummary] = useState<SpeedMathSummary | null>(null);

  const qStartRef = useRef(0);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const activeTypesRef = useRef<SpeedMathType[]>([]);
  const recordsRef = useRef<SpeedMathRecord[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function toggleType(t: SpeedMathType) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const endSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSummary(summarizeSpeedMathSession(recordsRef.current));
    setPhase("results");
  }, []);

  const nextQuestion = useCallback(() => {
    setQuestion(generateSpeedMathQuestion(activeTypesRef.current));
    setInput("");
    setFeedback(null);
    qStartRef.current = Date.now();
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  function startSession() {
    const active = types.size ? Array.from(types) : ALL_SPEED_MATH_TYPES;
    activeTypesRef.current = active;
    recordsRef.current = [];
    setRecords([]);
    setSummary(null);
    if (paceMode === "timed") {
      setTimeLeft(durationSec);
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            endSession();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    setPhase("drill");
    nextQuestion();
  }

  function submit() {
    if (!question || feedback || !input.trim()) return;
    const correct = checkSpeedMathAnswer(question, input);
    const rec: SpeedMathRecord = { type: question.type, correct, timeMs: Date.now() - qStartRef.current };
    recordsRef.current = [...recordsRef.current, rec];
    setRecords(recordsRef.current);
    setFeedback(correct ? "correct" : "incorrect");

    setTimeout(() => {
      if (paceMode === "count" && recordsRef.current.length >= count) {
        endSession();
        return;
      }
      if (paceMode === "timed" && timeLeft <= 1) {
        endSession();
        return;
      }
      nextQuestion();
    }, 450);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function practiceAgain() {
    setPhase("setup");
    setQuestion(null);
    setSummary(null);
  }

  const streak = (() => {
    let s = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (!records[i].correct) break;
      s++;
    }
    return s;
  })();

  // ---------------------------------------------------------------- setup

  if (phase === "setup") {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <LinearGradient colors={["#1a0a12", "#7a1538", "#e8305a"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></Pressable>
          <Text style={styles.eyebrow}>SPEED MATHS</Text>
          <Text style={styles.heroTitle}>Sharpen your mental math</Text>
          <Text style={styles.heroSub}>Pick your drill types and pace — no options, just type the answer.</Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.setupModeRow}>
            <Pressable style={[styles.setupModeBtn, setupMode === "drill" && styles.setupModeBtnActive]} onPress={() => setSetupMode("drill")}>
              <Text style={[styles.setupModeBtnText, setupMode === "drill" && styles.setupModeBtnTextActive]}>Drill</Text>
            </Pressable>
            <Pressable style={[styles.setupModeBtn, setupMode === "reference" && styles.setupModeBtnActive]} onPress={() => setSetupMode("reference")}>
              <Text style={[styles.setupModeBtnText, setupMode === "reference" && styles.setupModeBtnTextActive]}>Study material</Text>
            </Pressable>
          </View>

          {setupMode === "reference" ? (
            <ReferenceStage />
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.cardHead}>What to practice</Text>
                <View style={styles.chipGrid}>
                  {ALL_SPEED_MATH_TYPES.map((t) => (
                    <Pressable key={t} style={[styles.typeChip, types.has(t) && styles.typeChipActive]} onPress={() => toggleType(t)}>
                      <Text style={[styles.typeChipText, types.has(t) && styles.typeChipTextActive]}>{SPEED_MATH_LABELS[t]}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>Select one or more. Leave several selected for a mixed drill.</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardHead}>Pace</Text>
                <View style={styles.paceRow}>
                  <Pressable style={[styles.paceBtn, paceMode === "count" && styles.paceBtnActive]} onPress={() => setPaceMode("count")}>
                    <Text style={[styles.paceBtnText, paceMode === "count" && styles.paceBtnTextActive]}>No timer</Text>
                  </Pressable>
                  <Pressable style={[styles.paceBtn, paceMode === "timed" && styles.paceBtnActive]} onPress={() => setPaceMode("timed")}>
                    <Text style={[styles.paceBtnText, paceMode === "timed" && styles.paceBtnTextActive]}>Timed</Text>
                  </Pressable>
                </View>
                <View style={styles.optRow}>
                  {(paceMode === "count" ? COUNT_OPTIONS : DURATION_OPTIONS).map((v) => {
                    const active = paceMode === "count" ? count === v : durationSec === v * 60;
                    return (
                      <Pressable
                        key={v}
                        style={[styles.optChip, active && styles.optChipActive]}
                        onPress={() => (paceMode === "count" ? setCount(v) : setDurationSec(v * 60))}
                      >
                        <Text style={[styles.optChipText, active && styles.optChipTextActive]}>
                          {paceMode === "count" ? `${v} questions` : `${v} min`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable style={[styles.startBtn, types.size === 0 && { opacity: 0.5 }]} disabled={types.size === 0} onPress={startSession}>
                <Text style={styles.startBtnText}>Start drill</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // ---------------------------------------------------------------- drill

  if (phase === "drill" && question) {
    const progress = paceMode === "count" ? `${records.length + 1} / ${count}` : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.canvas }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ padding: space.xl, paddingTop: 64, flex: 1 }}>
          <View style={styles.drillTop}>
            <Text style={styles.drillProgress}>{progress}</Text>
            <View style={styles.drillTypePill}><Text style={styles.drillTypeText}>{SPEED_MATH_LABELS[question.type]}</Text></View>
            <Text style={styles.drillStreak}>🔥 {streak}</Text>
          </View>

          <View style={[styles.questionCard, feedback === "correct" && styles.questionCardCorrect, feedback === "incorrect" && styles.questionCardIncorrect]}>
            <Text style={styles.prompt}>{question.prompt}</Text>
            <TextInput
              ref={inputRef}
              style={styles.answerInput}
              keyboardType="numbers-and-punctuation"
              placeholder="your answer"
              placeholderTextColor={color.inkFaint}
              value={input}
              editable={!feedback}
              onChangeText={setInput}
              onSubmitEditing={submit}
              autoFocus
            />
            {feedback && (
              <Text style={[styles.feedbackText, feedback === "correct" ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
                {feedback === "correct" ? "Correct!" : `Correct answer: ${question.display}`}
              </Text>
            )}
            <Pressable style={[styles.submitBtn, (!input.trim() || !!feedback) && { opacity: 0.4 }]} disabled={!input.trim() || !!feedback} onPress={submit}>
              <Text style={styles.submitBtnText}>Submit</Text>
            </Pressable>
          </View>

          <View style={styles.scoreRow}>
            <Text style={styles.scoreText}>{records.filter((r) => r.correct).length} correct</Text>
            <Text style={styles.scoreText}>{records.length} answered</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ---------------------------------------------------------------- results

  if (phase === "results" && summary) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <LinearGradient colors={["#1a0a12", "#7a1538", "#e8305a"]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
          <Text style={styles.eyebrow}>SESSION COMPLETE</Text>
          <Text style={styles.heroTitle}>{summary.accuracy}% accuracy</Text>
          <Text style={styles.heroSub}>
            {summary.correct} / {summary.total} correct · avg {(summary.avgTimeMs / 1000).toFixed(1)}s per question
          </Text>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.cardHead}>By type</Text>
            {summary.byType.map((b) => (
              <View style={styles.breakdownRow} key={b.type}>
                <Text style={styles.breakdownLabel} numberOfLines={1}>{SPEED_MATH_LABELS[b.type]}</Text>
                <View style={styles.breakdownTrack}>
                  <View style={[styles.breakdownFill, { width: `${b.total ? (b.correct / b.total) * 100 : 0}%` }]} />
                </View>
                <Text style={styles.breakdownStat}>{b.correct}/{b.total}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.startBtn} onPress={practiceAgain}>
            <Text style={styles.startBtnText}>Practice again</Text>
          </Pressable>
          <Pressable style={{ marginTop: space.md, alignItems: "center" }} onPress={() => navigation.goBack()}>
            <Text style={styles.exitLink}>Back to Home</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  hero: { paddingTop: 60, paddingBottom: 28, paddingHorizontal: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  back: { fontFamily: font.bodySemibold, fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: space.lg },
  eyebrow: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 1, color: "#ffd0db", marginBottom: 6 },
  heroTitle: { fontFamily: font.displayBlack, fontSize: 24, color: color.white, marginBottom: 6 },
  heroSub: { fontFamily: font.body, fontSize: 13, color: "rgba(255,255,255,0.82)", lineHeight: 18 },

  body: { padding: space.xl },

  setupModeRow: { flexDirection: "row", gap: 8, marginBottom: space.lg },
  setupModeBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt, alignItems: "center" },
  setupModeBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  setupModeBtnText: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.inkDim },
  setupModeBtnTextActive: { color: color.white },

  refTabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: space.lg },
  refTabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt },
  refTabBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  refTabBtnText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.inkDim },
  refTabBtnTextActive: { color: color.white },

  refStage: { borderRadius: radius.xl, padding: 24, alignItems: "center" },
  refPickRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 22, width: "100%" },
  refPickArrow: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: color.consoleLine2, backgroundColor: color.consolePanel2, alignItems: "center", justifyContent: "center" },
  refPickArrowText: { color: color.white, fontSize: 15, fontFamily: font.bodySemibold },
  refPickStrip: { flex: 1, maxWidth: 220 },
  refPickChip: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 6 },
  refPickChipActive: { backgroundColor: "#e8305a" },
  refPickChipText: { fontFamily: font.mono, fontSize: 11, color: color.consoleText },
  refPickChipTextActive: { color: color.white, fontFamily: font.monoBold },

  refBigAnswer: { alignItems: "center", marginBottom: 4 },
  refEq: { fontFamily: font.mono, fontSize: 16, color: color.consoleText, marginBottom: 4 },
  refEqNoVal: { fontSize: 19, color: color.white, marginBottom: 0 },
  refVal: { fontFamily: font.monoBold, fontSize: 46, color: color.white },

  refMiniList: { width: "100%", marginTop: 22 },
  refMiniRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  refMiniRowCurrent: { backgroundColor: "rgba(232,48,90,0.14)", borderRadius: 8, borderBottomWidth: 0, marginVertical: 1 },
  refMiniRowL: { fontFamily: font.mono, fontSize: 12.5, color: color.white },
  refMiniRowR: { fontFamily: font.mono, fontSize: 12.5, color: color.consoleText },
  refMiniRowTextCurrent: { fontFamily: font.monoBold, color: color.white },

  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 15, color: color.ink, marginBottom: space.md },
  hint: { fontFamily: font.body, fontSize: 11.5, color: color.inkFaint, marginTop: space.sm },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  typeChip: { borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  typeChipActive: { backgroundColor: "#e8305a", borderColor: "#e8305a" },
  typeChipText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkDim },
  typeChipTextActive: { color: color.white },

  paceRow: { flexDirection: "row", gap: 10, marginBottom: space.md },
  paceBtn: { flex: 1, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt, borderRadius: radius.md, paddingVertical: 12, alignItems: "center" },
  paceBtnActive: { backgroundColor: color.ink, borderColor: color.ink },
  paceBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkDim },
  paceBtnTextActive: { color: color.white },
  optRow: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  optChip: { borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surface, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  optChipActive: { backgroundColor: "#e8305a", borderColor: "#e8305a" },
  optChipText: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.inkDim },
  optChipTextActive: { color: color.white },

  startBtn: { backgroundColor: "#c91c46", borderRadius: radius.lg, paddingVertical: 16, alignItems: "center" },
  startBtnText: { fontFamily: font.bodySemibold, fontSize: 15, color: color.white },

  drillTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg },
  drillProgress: { fontFamily: font.monoSemibold, fontSize: 13, color: color.inkDim },
  drillTypePill: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  drillTypeText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: color.inkDim },
  drillStreak: { fontFamily: font.monoSemibold, fontSize: 13, color: color.inkDim },

  questionCard: { backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.surfaceSunken, borderRadius: radius.lg, padding: space.xl, alignItems: "center" },
  questionCardCorrect: { borderColor: color.green, backgroundColor: "#f1faf4" },
  questionCardIncorrect: { borderColor: color.red, backgroundColor: "#fdf3f2" },
  prompt: { fontFamily: font.displayBlack, fontSize: 24, color: color.ink, marginBottom: space.lg, textAlign: "center" },
  answerInput: {
    width: "100%", textAlign: "center", fontSize: 20, fontFamily: font.monoBold, color: color.ink,
    borderWidth: 2, borderColor: color.surfaceSunken, borderRadius: radius.md, paddingVertical: 12,
  },
  feedbackText: { marginTop: space.md, fontFamily: font.bodySemibold, fontSize: 14 },
  feedbackCorrect: { color: color.green },
  feedbackIncorrect: { color: color.red },
  submitBtn: { marginTop: space.lg, width: "100%", backgroundColor: color.ink, borderRadius: radius.md, paddingVertical: 13, alignItems: "center" },
  submitBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },

  scoreRow: { flexDirection: "row", justifyContent: "center", gap: space.lg, marginTop: space.lg },
  scoreText: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.inkDim },

  breakdownRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  breakdownLabel: { fontFamily: font.bodyMedium, fontSize: 12.5, color: color.ink, width: 110 },
  breakdownTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: color.surfaceSunken },
  breakdownFill: { height: 7, borderRadius: 4, backgroundColor: "#e8305a" },
  breakdownStat: { fontFamily: font.monoSemibold, fontSize: 11.5, color: color.inkDim, width: 40, textAlign: "right" },

  exitLink: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkDim },
});
