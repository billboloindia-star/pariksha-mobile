import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, font, radius, space, shadow } from "../../theme";
import SegmentDonut, { shadeForConsole } from "../../components/SegmentDonut";
import DatePickerModal from "../../components/DatePickerModal";
import * as api from "../../../shared/api";
import type {
  BankSectionSummary, ConfidenceLevel, Paper, SectionConfidence,
  TargetExamName, TargetExamPlan, TargetExamStage, TargetExamState,
} from "../../../shared/types";

interface Props {
  onAccepted: (state: TargetExamState) => void;
}

const EXAMS: {
  name: TargetExamName; label: string; desc: string; gradient: [string, string]; ring: string;
  prelimsQ: number; prelimsMin: number; pyqVerified: boolean;
}[] = [
  { name: "IBPS PO", label: "IBPS PO", desc: "Probationary Officer · Public Sector Banks", gradient: ["#1a73c7", "#0c2c4a"], ring: "#1a73c7", prelimsQ: 100, prelimsMin: 60, pyqVerified: false },
  { name: "SBI PO", label: "SBI PO", desc: "Probationary Officer · State Bank of India", gradient: ["#6f42c1", "#3a1f6e"], ring: "#6f42c1", prelimsQ: 100, prelimsMin: 60, pyqVerified: false },
  { name: "IBPS Clerk", label: "IBPS Clerk", desc: "Clerk · Public Sector Banks", gradient: ["#2f8f4e", "#154a28"], ring: "#2f8f4e", prelimsQ: 100, prelimsMin: 60, pyqVerified: false },
  { name: "SBI Clerk", label: "SBI Clerk", desc: "Junior Associate · State Bank of India", gradient: ["#b4740e", "#6b4409"], ring: "#b4740e", prelimsQ: 100, prelimsMin: 60, pyqVerified: false },
  { name: "RRB PO", label: "RRB PO", desc: "Officer Scale I · Regional Rural Banks", gradient: ["#1a9b8f", "#0a4d46"], ring: "#1a9b8f", prelimsQ: 80, prelimsMin: 45, pyqVerified: true },
  { name: "RRB Clerk", label: "RRB Clerk", desc: "Office Assistant · Regional Rural Banks", gradient: ["#c0392b", "#6e1f16"], ring: "#c0392b", prelimsQ: 80, prelimsMin: 45, pyqVerified: true },
];

const GEN_STEPS = [
  "Reading your recent attempts",
  "Mapping weak topics against your question bank",
  "Calculating days-to-exam vs target cutoff gap",
  "Drafting phased study plan",
];

const FOCUS_COLORS: Record<string, string> = { Reasoning: "#6f42c1", Quant: "#1a73c7", "Mock tests": "#2f8f4e", English: "#b4740e" };
const FOCUS_FALLBACK = ["#1a73c7", "#6f42c1", "#2f8f4e", "#b4740e", "#c0392b"];

const DEFAULT_TOTAL_MARKS: Record<TargetExamName, { prelims: number; mains: number }> = {
  "IBPS PO": { prelims: 100, mains: 200 },
  "SBI PO": { prelims: 100, mains: 250 },
  "IBPS Clerk": { prelims: 100, mains: 200 },
  "SBI Clerk": { prelims: 100, mains: 200 },
  "RRB PO": { prelims: 80, mains: 200 },
  "RRB Clerk": { prelims: 80, mains: 200 },
};
function defaultTotalMarks(exam: TargetExamName | null, stage: TargetExamStage): number {
  if (!exam) return 100;
  const t = DEFAULT_TOTAL_MARKS[exam];
  return stage === "prelims" ? t.prelims : t.mains;
}

const LEVEL_META: Record<ConfidenceLevel, { label: string; color: string }> = {
  very_low: { label: "Very low", color: color.statusLow },
  average: { label: "Average", color: color.statusAvg },
  excellent: { label: "Excellent", color: color.statusHigh },
};
function levelFromAccuracy(accuracy: number): ConfidenceLevel {
  if (accuracy < 40) return "very_low";
  if (accuracy < 70) return "average";
  return "excellent";
}
function bucketLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}
function isFlaggedNote(note: string): boolean {
  return /absent|rare|when present|not guaranteed/i.test(note);
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const STEP_LABELS = ["Exam", "Target", "Starting point", "Your plan"];

export default function TargetExamWizard({ onAccepted }: Props) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);

  const [step, setStep] = useState(1);
  const [selectedExam, setSelectedExam] = useState<TargetExamName | null>(null);
  const [stage, setStage] = useState<TargetExamStage>("prelims");
  const [examDate, setExamDate] = useState("");
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [totalMarks, setTotalMarks] = useState(100);
  const [cutoffMarks, setCutoffMarks] = useState(75);
  const [genStepIndex, setGenStepIndex] = useState(-1);
  const [generatedPlan, setGeneratedPlan] = useState<TargetExamPlan | null>(null);
  const [genError, setGenError] = useState("");
  const [accepting, setAccepting] = useState(false);

  const [sectionLevels, setSectionLevels] = useState<Record<string, ConfidenceLevel>>({});
  const [diagnosticAccuracy, setDiagnosticAccuracy] = useState<Record<string, number>>({});
  const [diagnosticChapterAccuracy, setDiagnosticChapterAccuracy] = useState<Record<string, Record<string, number>>>({});
  const [diagnosticSection, setDiagnosticSection] = useState<string | null>(null);
  const [diagnosticPaper, setDiagnosticPaper] = useState<Paper | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<Record<string, number>>({});
  const [diagnosticScore, setDiagnosticScore] = useState<{ correct: number; total: number } | null>(null);
  const [chapterLevels, setChapterLevels] = useState<Record<string, Record<string, ConfidenceLevel>>>({});
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    const def = defaultTotalMarks(selectedExam, stage);
    setTotalMarks(def);
    setCutoffMarks(Math.round(def * 0.75));
  }, [selectedExam, stage]);

  useEffect(() => { api.fetchBankSections().then(setBankSections).catch(() => {}); }, []);

  const sectionNames = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const s of bankSections ?? []) if (!seen.has(s.section)) { seen.add(s.section); order.push(s.section); }
    return order;
  }, [bankSections]);

  const chaptersBySection = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of bankSections ?? []) (m[s.section] ??= []).push(s.chapter);
    return m;
  }, [bankSections]);

  useEffect(() => {
    setSectionLevels((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of sectionNames) if (!(s in next)) { next[s] = "average"; changed = true; }
      return changed ? next : prev;
    });
  }, [sectionNames]);

  function quickDate(weeks: number) {
    const d = new Date();
    d.setDate(d.getDate() + weeks * 7);
    setExamDate(d.toISOString().split("T")[0]);
  }

  async function startDiagnostic(section: string) {
    setDiagnosticError("");
    setDiagnosticScore(null);
    setDiagnosticAnswers({});
    setDiagnosticLoading(true);
    setDiagnosticSection(section);
    try {
      const chapters = chaptersBySection[section] ?? [];
      const count = Math.max(10, Math.min(20, chapters.length * 2));
      const paper = await api.generatePracticePaper({ section, chapters, count, durationMinutes: 10 });
      setDiagnosticPaper(paper);
    } catch (err) {
      setDiagnosticError(err instanceof Error ? err.message : "Couldn't load the quiz — try again.");
    } finally {
      setDiagnosticLoading(false);
    }
  }
  function closeDiagnostic() {
    setDiagnosticSection(null);
    setDiagnosticPaper(null);
    setDiagnosticAnswers({});
    setDiagnosticScore(null);
  }
  function submitDiagnostic() {
    if (!diagnosticPaper || !diagnosticSection) return;
    let correct = 0;
    const byChapter: Record<string, { ok: number; att: number }> = {};
    for (const q of diagnosticPaper.questions) {
      const ok = diagnosticAnswers[q.id] === q.ans;
      if (ok) correct++;
      const bucket = (byChapter[q.topic] ??= { ok: 0, att: 0 });
      bucket.att++;
      if (ok) bucket.ok++;
    }
    const total = diagnosticPaper.questions.length;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const chapterAccuracy: Record<string, number> = {};
    for (const [chapter, { ok, att }] of Object.entries(byChapter)) chapterAccuracy[chapter] = Math.round((ok / att) * 100);
    setSectionLevels((prev) => ({ ...prev, [diagnosticSection]: levelFromAccuracy(accuracy) }));
    setDiagnosticAccuracy((prev) => ({ ...prev, [diagnosticSection]: accuracy }));
    setDiagnosticChapterAccuracy((prev) => ({ ...prev, [diagnosticSection]: chapterAccuracy }));
    setDiagnosticScore({ correct, total });
  }

  function buildSectionConfidence(): SectionConfidence[] {
    return sectionNames.map((s) => ({
      section: s,
      level: sectionLevels[s] ?? "average",
      diagnosticAccuracy: diagnosticAccuracy[s],
      chapterAccuracy: diagnosticChapterAccuracy[s],
      chapterLevels: diagnosticChapterAccuracy[s] ? undefined : chapterLevels[s],
    }));
  }

  async function generate() {
    if (!selectedExam || !examDate) return;
    setStep(4);
    setGenError("");
    setGenStepIndex(0);
    const timer = setInterval(() => setGenStepIndex((i) => Math.min(GEN_STEPS.length - 1, i + 1)), 650);
    const targetCutoffPercent = Math.round((cutoffMarks / totalMarks) * 100);
    try {
      const plan = await api.generateTargetExamPlan({
        exam: selectedExam, stage, examDate, targetCutoff: targetCutoffPercent, totalMarks,
        sectionConfidence: buildSectionConfidence(),
      });
      clearInterval(timer);
      setGeneratedPlan(plan);
      setGenStepIndex(GEN_STEPS.length);
      setTimeout(() => setStep(5), 400);
    } catch (err) {
      clearInterval(timer);
      setGenError(err instanceof Error ? err.message : "Couldn't generate a plan — try again.");
    }
  }

  async function accept() {
    if (!selectedExam || !examDate || !generatedPlan) return;
    setAccepting(true);
    const targetCutoffPercent = Math.round((cutoffMarks / totalMarks) * 100);
    try {
      const s = await api.acceptTargetExamPlan({
        exam: selectedExam, stage, examDate, targetCutoff: targetCutoffPercent, totalMarks,
        sectionConfidence: buildSectionConfidence(), plan: generatedPlan,
      });
      onAccepted(s);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Couldn't save your plan — try again.");
    } finally {
      setAccepting(false);
    }
  }

  const daysAway = examDate ? Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable style={[styles.exitRow, { marginTop: insets.top }]} onPress={() => navigation.goBack()} hitSlop={10}>
        <Text style={styles.exitRowText}>← Home</Text>
      </Pressable>

      <View style={styles.stepRow}>
        {[1, 2, 3, 4].map((n) => {
          const displayStep = step >= 4 ? 4 : step;
          return (
            <View key={n} style={styles.stepItem}>
              <View style={[styles.stepDot, displayStep === n && styles.stepDotActive, displayStep > n && styles.stepDotDone]}>
                <Text style={styles.stepDotText}>{displayStep > n ? "✓" : n}</Text>
              </View>
              {n < 4 && <View style={[styles.stepLine, displayStep > n && styles.stepLineDone]} />}
            </View>
          );
        })}
      </View>

      {step === 1 && (
        <View>
          <Text style={styles.h1}>Which exam are you targeting?</Text>
          <Text style={styles.subtext}>We'll tailor your plan, countdown, and readiness score around this exam.</Text>
          <View style={styles.examGrid}>
            {EXAMS.map((e) => {
              const selected = selectedExam === e.name;
              return (
                <Pressable key={e.name} onPress={() => setSelectedExam(e.name)} style={{ width: "48%" }}>
                  <LinearGradient
                    colors={e.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={[styles.examCard, selected && { borderWidth: 2, borderColor: color.white }]}
                  >
                    {e.pyqVerified && (
                      <View style={styles.pyqBadge}>
                        <Text style={styles.pyqBadgeText}>★ PYQ-verified</Text>
                      </View>
                    )}
                    <View style={styles.examChip} />
                    <View>
                      <Text style={styles.examName}>{e.label}</Text>
                      <Text style={styles.examDesc}>{e.desc}</Text>
                    </View>
                    <View style={styles.examStatsRow}>
                      <View><Text style={styles.examStatVal}>{e.prelimsQ}</Text><Text style={styles.examStatLbl}>Questions</Text></View>
                      <View><Text style={styles.examStatVal}>{e.prelimsMin}m</Text><Text style={styles.examStatLbl}>Duration</Text></View>
                    </View>
                  </LinearGradient>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.footRow}>
            <View />
            <Pressable style={[styles.btnPrimary, !selectedExam && styles.btnDisabled]} disabled={!selectedExam} onPress={() => setStep(2)}>
              <Text style={styles.btnPrimaryText}>Continue →</Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.h1}>Set your target</Text>
          <Text style={styles.subtext}>Your exam date and target score shape how aggressive the plan needs to be.</Text>

          <View style={styles.shell}>
            <View style={styles.module}>
              <Text style={styles.moduleLabel}>Exam stage</Text>
              <Text style={styles.moduleHint}>Prelims is objective-only and comes first; Mains adds further rounds.</Text>
              <View style={styles.segRow}>
                {(["prelims", "mains", "both"] as TargetExamStage[]).map((s) => (
                  <Pressable key={s} style={[styles.segBtn, stage === s && styles.segBtnActive]} onPress={() => setStage(s)}>
                    <Text style={[styles.segBtnText, stage === s && styles.segBtnTextActive]}>{s[0].toUpperCase() + s.slice(1)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.module}>
              <Text style={styles.moduleLabel}>When is your exam?</Text>
              <Text style={styles.moduleHint}>Don't know the exact date yet? Pick a typical window — we'll adjust once it's announced.</Text>
              <View style={styles.dateRow}>
                <View style={styles.tminus}>
                  <Text style={styles.tminusVal}>{daysAway ?? "—"}</Text>
                  <Text style={styles.tminusLbl}>Days away</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Pressable style={styles.dateField} onPress={() => setDateModalOpen(true)}>
                    <Text style={styles.dateFieldText}>{examDate ? fmtDate(examDate) : "Pick your exam date"}</Text>
                  </Pressable>
                  <View style={styles.quickRow}>
                    {[6, 10, 16].map((w) => (
                      <Pressable key={w} style={styles.quickPill} onPress={() => quickDate(w)}>
                        <Text style={styles.quickPillText}>{w} weeks away</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.module}>
              <Text style={styles.moduleLabel}>Target cutoff</Text>
              <Text style={styles.moduleHint}>Total marks for your exam, and your best estimate of what you'll need to clear it.</Text>
              <View style={styles.marksBox}>
                <Text style={styles.marksLabel}>Total marks</Text>
                <View style={styles.stepperRow}>
                  <Pressable style={styles.stepperBtn} onPress={() => { const n = Math.max(1, totalMarks - 5); setTotalMarks(n); setCutoffMarks((c) => Math.min(c, n)); }}>
                    <Text style={styles.stepperBtnText}>−</Text>
                  </Pressable>
                  <TextInput
                    style={styles.stepperInput}
                    keyboardType="numeric"
                    value={String(totalMarks)}
                    onChangeText={(v) => {
                      const n = Math.max(1, Number(v) || 1);
                      setTotalMarks(n);
                      setCutoffMarks((c) => Math.min(c, n));
                    }}
                  />
                  <Pressable style={styles.stepperBtn} onPress={() => setTotalMarks((t) => t + 5)}>
                    <Text style={styles.stepperBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.gaugeWrap}>
                <SegmentDonut
                  size={120} strokeWidth={12}
                  segments={[
                    { weight: cutoffMarks, color: color.sky },
                    { weight: Math.max(0, totalMarks - cutoffMarks), color: color.consoleLine },
                  ]}
                  centerValue={String(cutoffMarks)}
                  centerLabel={`of ${totalMarks} · ${Math.round((cutoffMarks / totalMarks) * 100)}%`}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.moduleHint}>Nudge your cutoff estimate up or down:</Text>
                  <View style={styles.stepperRow}>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => setCutoffMarks((c) => Math.max(Math.round(totalMarks * 0.3), c - 1))}
                    >
                      <Text style={styles.stepperBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.cutoffBig}>{cutoffMarks}</Text>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => setCutoffMarks((c) => Math.min(Math.round(totalMarks * 0.95), c + 1))}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={styles.sliderMinMax}>
                    <Text style={styles.sliderMinMaxText}>min {Math.round(totalMarks * 0.3)}</Text>
                    <Text style={styles.sliderMinMaxText}>max {Math.round(totalMarks * 0.95)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.footRow}>
            <Pressable style={styles.btnGhost} onPress={() => setStep(1)}><Text style={styles.btnGhostText}>← Back</Text></Pressable>
            <Pressable style={[styles.btnPrimary, !examDate && styles.btnDisabled]} disabled={!examDate} onPress={() => setStep(3)}>
              <Text style={styles.btnPrimaryText}>Continue →</Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.h1}>How much do you already know?</Text>
          <Text style={styles.subtext}>Rate each section, or take a quick diagnostic and let your answers decide — your plan weighs this heavily when you have little or no practice history yet.</Text>

          <View style={styles.shell}>
            {sectionNames.length === 0 ? (
              <Text style={styles.moduleHint}>No bank sections found yet — the plan will lean on attempt history alone.</Text>
            ) : (
              sectionNames.map((s, i) => {
                const level = sectionLevels[s] ?? "average";
                const accuracy = diagnosticAccuracy[s];
                const hasDiagnostic = accuracy !== undefined;
                const chapters = chaptersBySection[s] ?? [];
                const sectionChapterLevels = chapterLevels[s] ?? {};
                const ratedChapterCount = Object.keys(sectionChapterLevels).length;
                const expanded = expandedSection === s;
                return (
                  <View key={s} style={styles.confSection}>
                    <View style={styles.confHead}>
                      <View style={[styles.dot, { backgroundColor: FOCUS_COLORS[s] ?? FOCUS_FALLBACK[i % FOCUS_FALLBACK.length] }]} />
                      <Text style={styles.confSectionName}>{s}</Text>
                      {hasDiagnostic && (
                        <View style={styles.diagBadge}><Text style={styles.diagBadgeText}>★ Diagnostic-calibrated · {accuracy}%</Text></View>
                      )}
                    </View>

                    <View style={styles.meterRow}>
                      {(["very_low", "average", "excellent"] as ConfidenceLevel[]).map((lv) => (
                        <Pressable
                          key={lv}
                          style={[styles.meterBtn, level === lv && { backgroundColor: LEVEL_META[lv].color, borderColor: LEVEL_META[lv].color }]}
                          onPress={() => setSectionLevels((prev) => ({ ...prev, [s]: lv }))}
                        >
                          <Text style={[styles.meterBtnText, level === lv && styles.meterBtnTextActive]}>{LEVEL_META[lv].label}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable style={styles.diagBtn} onPress={() => startDiagnostic(s)}>
                      <Text style={styles.diagBtnText}>⚡ {hasDiagnostic ? "Retake diagnostic" : "Quick diagnostic"}</Text>
                    </Pressable>

                    {chapters.length > 0 && !hasDiagnostic && (
                      <Pressable style={styles.chapterToggle} onPress={() => setExpandedSection(expanded ? null : s)}>
                        <Text style={styles.chapterToggleText}>
                          {expanded ? "▴" : "▾"} {ratedChapterCount > 0 ? `${ratedChapterCount} of ${chapters.length} chapters rated individually` : "Rate individual chapters instead"}
                        </Text>
                      </Pressable>
                    )}

                    {expanded && chapters.length > 0 && (
                      <View style={styles.chapterList}>
                        {chapters.map((c) => {
                          const cLevel = sectionChapterLevels[c];
                          return (
                            <View key={c} style={styles.chapterRow}>
                              <Text style={styles.chapterName}>{c}</Text>
                              <View style={styles.chapterMeter}>
                                {(["very_low", "average", "excellent"] as ConfidenceLevel[]).map((lv) => (
                                  <Pressable
                                    key={lv}
                                    style={[styles.chapterMeterBtn, cLevel === lv && { backgroundColor: LEVEL_META[lv].color, borderColor: LEVEL_META[lv].color }]}
                                    onPress={() => setChapterLevels((prev) => ({ ...prev, [s]: { ...prev[s], [c]: lv } }))}
                                  >
                                    <Text style={styles.chapterMeterBtnText}>{{ very_low: "Low", average: "Avg", excellent: "High" }[lv]}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.footRow}>
            <Pressable style={styles.btnGhost} onPress={() => setStep(2)}><Text style={styles.btnGhostText}>← Back</Text></Pressable>
            <Pressable style={styles.btnPrimary} onPress={generate}><Text style={styles.btnPrimaryText}>Generate my plan →</Text></Pressable>
          </View>
        </View>
      )}

      {step === 4 && (
        <View style={styles.genWrap}>
          <ActivityIndicator size="large" color={color.royal} />
          <Text style={styles.genTitle}>Building your {selectedExam} plan…</Text>
          <Text style={styles.genSub}>Cross-referencing your topic accuracy and question bank coverage to build a plan that targets your actual weak spots.</Text>
          {genError ? (
            <>
              <Text style={styles.errorText}>{genError}</Text>
              <Pressable style={styles.btnPrimary} onPress={generate}><Text style={styles.btnPrimaryText}>Try again</Text></Pressable>
            </>
          ) : (
            <View style={{ alignSelf: "stretch", marginTop: space.xl }}>
              {GEN_STEPS.map((label, i) => (
                <View key={label} style={styles.genStepRow}>
                  <Text style={[styles.genStepDot, i <= genStepIndex && { color: color.royal }]}>{i < genStepIndex ? "●" : i === genStepIndex ? "◉" : "○"}</Text>
                  <Text style={[styles.genStepText, i <= genStepIndex && styles.genStepTextActive]}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {step === 5 && generatedPlan && selectedExam && (
        <View>
          <LinearGradient colors={[color.inkNavy900, "#0d2a4a", color.inkNavy700]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planHero}>
            <Text style={styles.planEyebrow}>Your personalized plan</Text>
            <Text style={styles.planTitle}>{selectedExam} — {stage[0].toUpperCase() + stage.slice(1)}</Text>
            <View style={styles.planStatsRow}>
              <View><Text style={styles.planStatVal}>{Math.max(0, Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000))}</Text><Text style={styles.planStatLbl}>Days left</Text></View>
              <View><Text style={styles.planStatVal}>~{generatedPlan.dailyHoursEstimate}h</Text><Text style={styles.planStatLbl}>Daily target</Text></View>
              <View><Text style={styles.planStatVal}>{cutoffMarks}/{totalMarks}</Text><Text style={styles.planStatLbl}>Target cutoff</Text></View>
            </View>
          </LinearGradient>

          {generatedPlan.topicContract?.length ? (
            <View style={styles.shell}>
              <Text style={styles.contractH2}>Your topic contract</Text>
              <Text style={styles.contractSub}>
                Built from {selectedExam}'s real exam pattern and your own weak-topic / confidence state — this is exactly what the plan below is based on.
              </Text>
              {generatedPlan.topicContract.map((sec, i) => {
                const accentHex = FOCUS_COLORS[sec.section] ?? FOCUS_FALLBACK[i % FOCUS_FALLBACK.length];
                const maxWeight = Math.max(1, ...sec.buckets.map((b) => b.weightCount));
                return (
                  <View key={sec.section} style={styles.contractRow}>
                    <View style={styles.donutWrap}>
                      <SegmentDonut
                        size={120} strokeWidth={13}
                        segments={sec.buckets.map((b) => ({ weight: b.weightCount, color: shadeForConsole(accentHex, 0.4 + 0.6 * (b.weightCount / maxWeight)) }))}
                        centerValue={String(sec.buckets[0]?.sectionTotal ?? 40)}
                        centerLabel="real Qs/paper"
                      />
                      <View style={styles.secTitleRow}>
                        <View style={[styles.dot, { backgroundColor: accentHex }]} />
                        <Text style={styles.secTitleText}>{sec.section}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      {sec.buckets.map((b) => {
                        const barColor = shadeForConsole(accentHex, 0.4 + 0.6 * (b.weightCount / maxWeight));
                        return (
                          <View key={b.label} style={styles.readout}>
                            <View style={[styles.readoutBar, { backgroundColor: barColor }]} />
                            <View style={{ flex: 1 }}>
                              <View style={styles.readoutTopRow}>
                                <Text style={styles.readoutLabel}>{bucketLabel(b.label)}</Text>
                                <Text style={styles.readoutCount}>~{Math.round(b.weightCount)} of {b.sectionTotal} Qs</Text>
                              </View>
                              <Text style={styles.readoutMeta}>{isFlaggedNote(b.weightNote) ? "⚠ " : ""}{b.weightNote}</Text>
                              <View style={styles.chipRow}>
                                {b.chapters.map((c) => <View key={c.chapter} style={styles.chip}><Text style={styles.chipText}>{c.chapter}</Text></View>)}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.shell}>
            <Text style={styles.contractH2}>Your {Math.round(generatedPlan.phases.reduce((s, p) => s + p.weeks, 0))}-week path</Text>
            {generatedPlan.phases.map((p, i) => (
              <View key={i} style={styles.phaseStage}>
                <View style={[styles.phaseNum, i === 0 && styles.phaseNumNow]}><Text style={styles.phaseNumText}>{String(i + 1).padStart(2, "0")}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.phaseTopRow}>
                    <Text style={styles.phaseWhen}>Week {Math.round(p.startDay / 7) + 1}–{Math.round(p.endDay / 7)}{i === 0 ? " · now" : ""}</Text>
                    {i === 0 && <View style={styles.nowTag}><Text style={styles.nowTagText}>You are here</Text></View>}
                  </View>
                  <Text style={styles.phaseName}>{p.label}</Text>
                  <Text style={styles.phaseDesc}>{p.description}</Text>
                  {p.focusTopics.length > 0 && (
                    <View style={styles.chipRow}>
                      {p.focusTopics.map((t) => <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>)}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>

          {genError ? <Text style={styles.errorText}>{genError}</Text> : null}
          <View style={styles.footRow}>
            <Pressable style={styles.btnGhost} onPress={generate}><Text style={styles.btnGhostText}>↺ Regenerate</Text></Pressable>
            <Pressable style={[styles.btnPrimary, accepting && styles.btnDisabled]} disabled={accepting} onPress={accept}>
              <Text style={styles.btnPrimaryText}>{accepting ? "Saving…" : "Accept & start tracking →"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <DatePickerModal visible={dateModalOpen} value={examDate} onChange={setExamDate} onClose={() => setDateModalOpen(false)} />

      <Modal visible={!!diagnosticSection} transparent animationType="slide" onRequestClose={closeDiagnostic}>
        <View style={styles.diagBackdrop}>
          <View style={styles.diagSheet}>
            <Text style={styles.diagTitle}>Quick diagnostic — {diagnosticSection}</Text>
            {diagnosticLoading ? (
              <ActivityIndicator size="large" color={color.royal} style={{ marginVertical: space.xl }} />
            ) : diagnosticError ? (
              <>
                <Text style={styles.errorText}>{diagnosticError}</Text>
                <View style={styles.footRow}>
                  <Pressable style={styles.btnGhost} onPress={closeDiagnostic}><Text style={styles.btnGhostText}>Close</Text></Pressable>
                  <Pressable style={styles.btnPrimary} onPress={() => diagnosticSection && startDiagnostic(diagnosticSection)}><Text style={styles.btnPrimaryText}>Try again</Text></Pressable>
                </View>
              </>
            ) : diagnosticScore ? (
              <ScrollView>
                <View style={{ alignItems: "center", paddingVertical: space.lg }}>
                  <Text style={styles.diagScore}>{diagnosticScore.correct}/{diagnosticScore.total}</Text>
                  <Text style={styles.diagScorePct}>{Math.round((diagnosticScore.correct / Math.max(1, diagnosticScore.total)) * 100)}% accuracy</Text>
                  <Text style={styles.diagResultText}>
                    We've set <Text style={{ fontFamily: font.bodyBold, color: color.white }}>{diagnosticSection}</Text> to "{LEVEL_META[levelFromAccuracy(Math.round((diagnosticScore.correct / Math.max(1, diagnosticScore.total)) * 100))].label}" based on this — you can still override it manually.
                  </Text>
                </View>
                {diagnosticSection && diagnosticChapterAccuracy[diagnosticSection] && (
                  <View style={{ marginTop: space.md }}>
                    <Text style={styles.moduleLabel}>Chapter-by-chapter, from this quiz</Text>
                    {Object.entries(diagnosticChapterAccuracy[diagnosticSection]).sort((a, b) => a[1] - b[1]).map(([chapter, acc]) => (
                      <View key={chapter} style={styles.diagChapterRow}>
                        <Text style={styles.diagChapterName} numberOfLines={1}>{chapter}</Text>
                        <View style={styles.diagChapterTrack}><View style={[styles.diagChapterFill, { width: `${acc}%`, backgroundColor: LEVEL_META[levelFromAccuracy(acc)].color }]} /></View>
                        <Text style={[styles.diagChapterPct, { color: LEVEL_META[levelFromAccuracy(acc)].color }]}>{acc}%</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.footRow}>
                  <View />
                  <Pressable style={styles.btnPrimary} onPress={closeDiagnostic}><Text style={styles.btnPrimaryText}>Done</Text></Pressable>
                </View>
              </ScrollView>
            ) : diagnosticPaper ? (
              <>
                <Text style={styles.moduleHint}>{diagnosticPaper.questions.length} questions, no timer — answer as best you can.</Text>
                <ScrollView style={{ maxHeight: 420 }}>
                  {diagnosticPaper.questions.map((q, qi) => (
                    <View key={q.id} style={styles.diagQ}>
                      <Text style={styles.diagQText}><Text style={{ fontFamily: font.bodyBold }}>{qi + 1}. </Text>{q.text}</Text>
                      {(q.options ?? []).map((opt, oi) => (
                        <Pressable
                          key={oi}
                          style={[styles.diagOpt, diagnosticAnswers[q.id] === oi && styles.diagOptActive]}
                          onPress={() => setDiagnosticAnswers((prev) => ({ ...prev, [q.id]: oi }))}
                        >
                          <Text style={styles.diagOptText}>{opt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.footRow}>
                  <Pressable style={styles.btnGhost} onPress={closeDiagnostic}><Text style={styles.btnGhostText}>Cancel</Text></Pressable>
                  <Pressable
                    style={[styles.btnPrimary, Object.keys(diagnosticAnswers).length < diagnosticPaper.questions.length && styles.btnDisabled]}
                    disabled={Object.keys(diagnosticAnswers).length < diagnosticPaper.questions.length}
                    onPress={submitDiagnostic}
                  >
                    <Text style={styles.btnPrimaryText}>Submit diagnostic</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, paddingBottom: space.xxl * 2 },

  exitRow: { alignSelf: "flex-start", marginBottom: space.md },
  exitRowText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.royal },

  stepRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: space.xl, flexWrap: "wrap" },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: color.royal, borderColor: color.royal },
  stepDotDone: { backgroundColor: color.green, borderColor: color.green },
  stepDotText: { color: color.inkFaint, fontFamily: font.bodyBold, fontSize: 11 },
  stepLine: { width: 24, height: 2, backgroundColor: color.surfaceSunken, marginHorizontal: 4 },
  stepLineDone: { backgroundColor: color.green },

  h1: { fontFamily: font.displayBlack, fontSize: 22, color: color.ink, marginBottom: 6 },
  subtext: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg, lineHeight: 19 },

  examGrid: { flexDirection: "row", flexWrap: "wrap", gap: "4%", rowGap: space.md },
  examCard: { borderRadius: radius.lg, padding: space.md, aspectRatio: 1.35, justifyContent: "space-between", ...shadow.card },
  pyqBadge: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.22)", borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  pyqBadgeText: { color: color.white, fontFamily: font.bodyBold, fontSize: 8 },
  examChip: { width: 26, height: 20, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.4)" },
  examName: { color: color.white, fontFamily: font.displayBlack, fontSize: 15, marginBottom: 2 },
  examDesc: { color: "rgba(255,255,255,0.82)", fontFamily: font.body, fontSize: 9.5, lineHeight: 13 },
  examStatsRow: { flexDirection: "row", gap: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)", paddingTop: 8, marginTop: 8 },
  examStatVal: { color: color.white, fontFamily: font.monoBold, fontSize: 12 },
  examStatLbl: { color: "rgba(255,255,255,0.75)", fontFamily: font.body, fontSize: 7.5, textTransform: "uppercase" },

  shell: { backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, borderWidth: 1, borderColor: color.consoleLine },
  module: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  moduleLabel: { color: color.white, fontFamily: font.bodyBold, fontSize: 14, marginBottom: 4 },
  moduleHint: { color: color.consoleText, fontFamily: font.body, fontSize: 11.5, marginBottom: space.md, lineHeight: 16 },

  segRow: { flexDirection: "row", gap: 8 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.consoleLine2, backgroundColor: color.consolePanel2, alignItems: "center" },
  segBtnActive: { backgroundColor: color.royal, borderColor: color.royal },
  segBtnText: { color: color.consoleText, fontFamily: font.bodyBold, fontSize: 12.5 },
  segBtnTextActive: { color: color.white },

  dateRow: { flexDirection: "row", gap: space.md, alignItems: "center" },
  tminus: { backgroundColor: color.consolePanel2, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center", minWidth: 88 },
  tminusVal: { color: color.sky, fontFamily: font.monoBold, fontSize: 22 },
  tminusLbl: { color: color.consoleText, fontFamily: font.body, fontSize: 8.5, textTransform: "uppercase" },
  dateField: { backgroundColor: color.consolePanel2, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.sm, padding: 13 },
  dateFieldText: { color: color.consoleText, fontFamily: font.bodySemibold, fontSize: 13 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  quickPill: { backgroundColor: color.consolePanel2, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  quickPillText: { color: color.consoleText, fontFamily: font.bodyBold, fontSize: 10.5 },

  marksBox: { backgroundColor: color.consolePanel2, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  marksLabel: { color: color.consoleText, fontFamily: font.bodyBold, fontSize: 10, textTransform: "uppercase" },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  stepperBtn: { width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: color.consoleLine2, backgroundColor: color.consolePanel3, alignItems: "center", justifyContent: "center" },
  stepperBtnText: { color: color.white, fontFamily: font.bodyBold, fontSize: 16 },
  stepperInput: { flex: 1, textAlign: "center", color: color.white, fontFamily: font.monoBold, fontSize: 20 },
  gaugeWrap: { flexDirection: "row", alignItems: "center", gap: space.lg },
  sliderMinMax: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  cutoffBig: { color: color.white, fontFamily: font.monoBold, fontSize: 20, minWidth: 40, textAlign: "center" },
  sliderMinMaxText: { color: color.consoleText2, fontFamily: font.mono, fontSize: 10 },

  confSection: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  confHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: space.md, flexWrap: "wrap" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  confSectionName: { color: color.white, fontFamily: font.bodyBold, fontSize: 15 },
  diagBadge: { marginLeft: "auto", backgroundColor: "rgba(79,209,139,0.14)", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  diagBadgeText: { color: color.statusGood, fontFamily: font.bodyBold, fontSize: 9.5 },
  meterRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  meterBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1.5, borderColor: color.consoleLine2, backgroundColor: color.consolePanel2, alignItems: "center" },
  meterBtnText: { color: color.consoleText2, fontFamily: font.bodyBold, fontSize: 10.5 },
  meterBtnTextActive: { color: color.white },
  diagBtn: { alignSelf: "flex-start", backgroundColor: color.indigo, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  diagBtnText: { color: color.white, fontFamily: font.bodyBold, fontSize: 11.5 },
  chapterToggle: { marginTop: space.md },
  chapterToggleText: { color: color.sky, fontFamily: font.bodyBold, fontSize: 11.5 },
  chapterList: { marginTop: space.sm, backgroundColor: color.consolePanel2, borderRadius: radius.md, padding: space.md, gap: space.md },
  chapterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  chapterName: { flex: 1, color: color.white, fontFamily: font.bodySemibold, fontSize: 12 },
  chapterMeter: { flexDirection: "row", gap: 4 },
  chapterMeterBtn: { width: 48, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: color.consoleLine2, backgroundColor: color.consolePanel3, alignItems: "center", justifyContent: "center" },
  chapterMeterBtnText: { color: color.consoleText2, fontFamily: font.bodyBold, fontSize: 9.5 },

  genWrap: { alignItems: "center", paddingVertical: space.xxl, paddingHorizontal: space.lg },
  genTitle: { fontFamily: font.displayBlack, fontSize: 18, color: color.ink, marginTop: space.lg, textAlign: "center" },
  genSub: { fontFamily: font.body, fontSize: 12.5, color: color.inkDim, textAlign: "center", marginTop: 8, lineHeight: 18 },
  genStepRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  genStepDot: { color: color.inkFaint, fontSize: 14 },
  genStepText: { color: color.inkFaint, fontFamily: font.body, fontSize: 12.5 },
  genStepTextActive: { color: color.ink, fontFamily: font.bodySemibold },

  planHero: { borderRadius: radius.lg, padding: space.xl, marginBottom: space.lg, ...shadow.card },
  planEyebrow: { color: "rgba(255,255,255,0.65)", fontFamily: font.bodyMedium, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.6 },
  planTitle: { color: color.white, fontFamily: font.displayBlack, fontSize: 20, marginTop: 4, marginBottom: space.lg },
  planStatsRow: { flexDirection: "row", gap: space.xl },
  planStatVal: { color: color.white, fontFamily: font.monoBold, fontSize: 18 },
  planStatLbl: { color: "rgba(255,255,255,0.65)", fontFamily: font.body, fontSize: 10.5, marginTop: 2 },

  contractH2: { color: color.white, fontFamily: font.bodyBold, fontSize: 17, marginBottom: 4 },
  contractSub: { color: color.consoleText, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginBottom: space.lg },
  contractRow: { marginBottom: space.lg, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: color.consoleLine },
  donutWrap: { alignItems: "center", marginBottom: space.md },
  secTitleRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  secTitleText: { color: color.white, fontFamily: font.bodyBold, fontSize: 13 },
  readout: { flexDirection: "row", gap: 10, paddingVertical: 9 },
  readoutBar: { width: 4, borderRadius: 2 },
  readoutTopRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 2 },
  readoutLabel: { color: color.white, fontFamily: font.bodyBold, fontSize: 12.5 },
  readoutCount: { color: color.consoleText2, fontFamily: font.mono, fontSize: 10.5 },
  readoutMeta: { color: color.consoleText2, fontFamily: font.body, fontSize: 10.5, lineHeight: 15, marginBottom: 7 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { backgroundColor: color.consolePanel3, borderWidth: 1, borderColor: color.consoleLine2, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { color: "#cdd9ec", fontFamily: font.bodySemibold, fontSize: 10.5 },

  phaseStage: { flexDirection: "row", gap: space.md, paddingVertical: space.md },
  phaseNum: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: color.consolePanel2, alignItems: "center", justifyContent: "center" },
  phaseNumNow: { backgroundColor: color.royal },
  phaseNumText: { color: color.consoleText2, fontFamily: font.monoBold, fontSize: 13 },
  phaseTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  phaseWhen: { color: color.consoleText2, fontFamily: font.mono, fontSize: 10.5, textTransform: "uppercase" },
  nowTag: { backgroundColor: color.royal, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  nowTagText: { color: color.white, fontFamily: font.bodyBold, fontSize: 9.5 },
  phaseName: { color: color.white, fontFamily: font.bodyBold, fontSize: 14, marginBottom: 4 },
  phaseDesc: { color: color.consoleText, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginBottom: 8 },

  footRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.md },
  btnPrimary: { backgroundColor: color.royal, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 13 },
  btnPrimaryText: { color: color.white, fontFamily: font.bodyBold, fontSize: 14 },
  btnGhost: { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.surfaceSunken, paddingHorizontal: 18, paddingVertical: 13 },
  btnGhostText: { color: color.ink, fontFamily: font.bodyBold, fontSize: 14 },
  btnDisabled: { opacity: 0.45 },
  errorText: { color: color.red, fontFamily: font.bodyMedium, fontSize: 12.5, marginVertical: space.sm, textAlign: "center" },

  diagBackdrop: { flex: 1, backgroundColor: "rgba(4,10,20,0.6)", justifyContent: "flex-end" },
  diagSheet: { backgroundColor: color.consolePanel, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, maxHeight: "86%" },
  diagTitle: { color: color.white, fontFamily: font.bodyBold, fontSize: 16, marginBottom: space.md },
  diagScore: { color: color.sky, fontFamily: font.monoBold, fontSize: 38 },
  diagScorePct: { color: color.consoleText, fontFamily: font.bodyBold, fontSize: 12, marginBottom: 10 },
  diagResultText: { color: color.consoleText, fontFamily: font.body, fontSize: 12.5, textAlign: "center", lineHeight: 18, maxWidth: 320 },
  diagChapterRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  diagChapterName: { flex: 1, color: color.consoleText, fontFamily: font.bodyMedium, fontSize: 11.5 },
  diagChapterTrack: { width: 70, height: 5, borderRadius: 3, backgroundColor: color.consoleLine2, overflow: "hidden" },
  diagChapterFill: { height: 5, borderRadius: 3 },
  diagChapterPct: { width: 36, textAlign: "right", fontFamily: font.monoBold, fontSize: 11 },
  diagQ: { marginBottom: space.lg },
  diagQText: { color: color.white, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  diagOpt: { borderWidth: 1.5, borderColor: color.consoleLine2, backgroundColor: color.consolePanel2, borderRadius: radius.sm, padding: 11, marginBottom: 6 },
  diagOptActive: { borderColor: color.sky, backgroundColor: "rgba(56,189,248,0.12)" },
  diagOptText: { color: color.white, fontFamily: font.bodyMedium, fontSize: 12.5 },
});
