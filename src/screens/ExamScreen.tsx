import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, BackHandler } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useExam } from "../../shared/useExam";
import * as api from "../../shared/api";
import type { Status } from "../../shared/types";
import { buildResult } from "../../shared/scoring";
import { rnExamPlatform } from "../platform/examPlatform";
import BookmarkStar from "../components/BookmarkStar";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Exam">;
type ExamRoute = RouteProp<RootStackParamList, "Exam">;

const STATUS_LABEL: Record<Status, string> = {
  notVisited: "Not Visited",
  notAnswered: "Not Answered",
  answered: "Answered",
  marked: "Marked for Review",
  answeredMarked: "Answered & Marked",
};
const STATUS_COLOR: Record<Status, string> = {
  notVisited: color.inkFaint,
  notAnswered: color.red,
  answered: color.green,
  marked: color.indigo,
  answeredMarked: color.amber,
};

function clock(s: number) {
  const t = Math.max(0, Math.ceil(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function candidateDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.replace(/[._-]+/g, " ").split(" ").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export default function ExamScreen() {
  const navigation = useNavigation<Nav>();
  const { paper, settings, initialProgress } = useRoute<ExamRoute>().params;
  const noop = useRef(() => {});
  const exam = useExam(paper, noop.current, settings, rnExamPlatform, initialProgress);
  const doneRef = useRef(false);

  const session = api.getSession();
  const candidateName = session ? candidateDisplayName(session.email) : "Guest candidate";
  const candidateInitials = (session ? candidateName : "G").slice(0, 2).toUpperCase();
  const q = paper.questions[exam.idx];
  const st = exam.states[exam.idx];
  const [draft, setDraft] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dismissedSwitches, setDismissedSwitches] = useState(0);

  useEffect(() => {
    setDraft(st.given === null ? "" : String(st.given));
  }, [exam.idx, st.given]);

  // Back button during an active exam pauses instead of leaving — mirrors the
  // web app having no real way to navigate away mid-exam without pausing.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!exam.finished && !exam.paused) {
        exam.pause();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [exam]);

  useEffect(() => {
    if (!exam.finished || doneRef.current) return;
    doneRef.current = true;
    const result = buildResult(paper, exam.states, exam.elapsedSec, exam.tabSwitches);
    navigation.replace("Report", { result });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.finished]);

  const activeSection = useMemo(
    () => paper.sections.find((s) => exam.idx >= s.from && exam.idx <= s.to),
    [paper.sections, exam.idx]
  );

  const paletteIndices = useMemo(() => {
    if (exam.sectionTimed && activeSection) {
      return Array.from({ length: activeSection.to - activeSection.from + 1 }, (_, k) => activeSection.from + k);
    }
    return paper.questions.map((_, i) => i);
  }, [exam.sectionTimed, activeSection, paper.questions]);

  function commitDraft() {
    if (q.type === "mc") return;
    const clean = draft.replace(/[^0-9.-]/g, "");
    if (clean === "" || clean === "." || clean === "-") {
      exam.setGiven(exam.idx, null);
      return;
    }
    exam.setGiven(exam.idx, Number(clean));
  }

  function onSaveNext() {
    commitDraft();
    exam.saveAndNext();
  }

  function onMarkNext() {
    commitDraft();
    exam.markAndNext();
  }

  function onClear() {
    exam.clear(exam.idx);
    setDraft("");
  }

  const showPaused = exam.paused;
  const urgent = exam.remaining < 120;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.examTitle} numberOfLines={1}>{paper.title}</Text>
          <View style={styles.candRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{candidateInitials}</Text></View>
            <Text style={styles.candName} numberOfLines={1}>{candidateName}</Text>
          </View>
        </View>
        <Pressable style={styles.pauseBtn} onPress={exam.pause} disabled={exam.paused}>
          <Text style={styles.pauseBtnText}>Pause</Text>
        </Pressable>
        <View style={[styles.clockPill, urgent && styles.clockPillUrgent]}>
          <Text style={[styles.clockText, urgent && styles.clockTextUrgent]}>{clock(exam.remaining)}</Text>
        </View>
      </View>

      {paper.sections.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionBar} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          {paper.sections.map((s, si) => {
            const timedOut = exam.lockedSections.indexOf(si) >= 0;
            const notYourTurn = exam.sectionTimed && si !== exam.sectionIdx;
            const locked = timedOut || notYourTurn;
            const active = activeSection?.name === s.name;
            return (
              <Pressable
                key={s.name}
                style={[styles.sectionTab, active && styles.sectionTabActive, locked && styles.sectionTabLocked]}
                onPress={() => exam.setIdx(s.from)}
                disabled={locked}
              >
                <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{s.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {exam.tabSwitches > dismissedSwitches && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnBannerText}>
            You left the app {exam.tabSwitches} time{exam.tabSwitches === 1 ? "" : "s"}. This would count against you in the real exam.
          </Text>
          <Pressable onPress={() => setDismissedSwitches(exam.tabSwitches)}>
            <Text style={styles.warnDismiss}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, paddingBottom: 140 }}>
        <View style={styles.qTopRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={styles.qNo}>Question {exam.idx + 1} of {paper.questions.length}</Text>
            <Text style={styles.marks}>+1.0 / -{paper.negativeMarking}</Text>
          </View>
          <BookmarkStar q={q} given={st.given} sourceLabel={paper.title} key={q.id} />
        </View>
        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>{q.topic}</Text></View>
          {st.marked && <View style={[styles.chip, styles.chipPurple]}><Text style={[styles.chipText, { color: color.indigo }]}>marked</Text></View>}
        </View>

        <Text style={styles.qText}>{q.text}</Text>

        {q.table && (
          <View style={styles.table}>
            <View style={styles.tableHeadRow}>
              {q.table.head.map((h, i) => <Text key={i} style={styles.tableHeadCell}>{h}</Text>)}
            </View>
            {q.table.rows.map((r, i) => (
              <View key={i} style={styles.tableRow}>
                {r.map((c, j) => <Text key={j} style={styles.tableCell}>{c}</Text>)}
              </View>
            ))}
          </View>
        )}

        {q.type === "mc" ? (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {q.options?.map((o, i) => {
              const sel = st.given === i;
              return (
                <Pressable key={i} style={[styles.option, sel && styles.optionSel]} onPress={() => exam.setGiven(exam.idx, i)}>
                  <View style={[styles.optKey, sel && styles.optKeySel]}>
                    <Text style={[styles.optKeyText, sel && styles.optKeyTextSel]}>{String.fromCharCode(65 + i)}</Text>
                  </View>
                  <Text style={styles.optionText}>{o}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.numBox}>
            <Text style={styles.fieldLabel}>YOUR ANSWER</Text>
            <TextInput
              value={draft}
              onChangeText={(v) => setDraft(v.replace(/[^0-9.-]/g, ""))}
              onBlur={commitDraft}
              keyboardType="numbers-and-punctuation"
              placeholder="type a number"
              placeholderTextColor={color.inkFaint}
              style={styles.numInput}
            />
          </View>
        )}

        <View style={styles.paletteCard}>
          <Text style={styles.paletteHead}>
            Question palette{exam.sectionTimed && activeSection ? ` · ${activeSection.name}` : ""}
          </Text>
          <View style={styles.legendRow}>
            {(Object.keys(STATUS_LABEL) as Status[]).map((k) => (
              <View key={k} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_COLOR[k] }]} />
                <Text style={styles.legendText}>{exam.counts[k]}</Text>
              </View>
            ))}
          </View>
          <View style={styles.paletteGrid}>
            {paletteIndices.map((i) => {
              const secOf = paper.sections.findIndex((sec) => i >= sec.from && i <= sec.to);
              const locked = exam.lockedSections.indexOf(secOf) >= 0 || (exam.sectionTimed && secOf !== exam.sectionIdx);
              const s = exam.status(i);
              const current = i === exam.idx;
              return (
                <Pressable
                  key={i}
                  disabled={locked}
                  onPress={() => exam.setIdx(i)}
                  style={[
                    styles.pCell,
                    { backgroundColor: locked ? color.surfaceSunken : STATUS_COLOR[s] + "22" },
                    current && styles.pCellCurrent,
                  ]}
                >
                  <Text style={[styles.pCellText, { color: locked ? color.inkFaint : STATUS_COLOR[s] }]}>{i + 1}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.submitBtn} onPress={() => setConfirmOpen(true)}>
            <Text style={styles.submitBtnText}>Submit Paper</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomBtnGhost} onPress={onClear}>
          <Text style={styles.bottomBtnGhostText}>Clear</Text>
        </Pressable>
        <Pressable style={styles.bottomBtnGhost} onPress={() => exam.previous()} disabled={exam.idx === 0}>
          <Text style={[styles.bottomBtnGhostText, exam.idx === 0 && { opacity: 0.4 }]}>Previous</Text>
        </Pressable>
        <Pressable style={styles.bottomBtnMark} onPress={onMarkNext}>
          <Text style={styles.bottomBtnMarkText}>Mark & Next</Text>
        </Pressable>
        <Pressable style={styles.bottomBtnPrimary} onPress={onSaveNext}>
          <Text style={styles.bottomBtnPrimaryText}>Save & Next</Text>
        </Pressable>
      </View>

      <Modal visible={confirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Submit the paper?</Text>
            <View style={styles.modalGrid}>
              <ModalStat label="Answered" value={exam.counts.answered + exam.counts.answeredMarked} />
              <ModalStat label="Not answered" value={exam.counts.notAnswered + exam.counts.marked} />
              <ModalStat label="Not visited" value={exam.counts.notVisited} />
              <ModalStat label="Marked" value={exam.counts.marked + exam.counts.answeredMarked} />
            </View>
            <Text style={styles.modalHint}>Once submitted you cannot change your answers.</Text>
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalSecondaryBtn} onPress={() => setConfirmOpen(false)}>
                <Text style={styles.modalSecondaryBtnText}>Keep writing</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={() => { setConfirmOpen(false); exam.submit(); }}>
                <Text style={styles.modalPrimaryBtnText}>Submit now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPaused} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {exam.offline ? (
              <>
                <Text style={styles.modalTitle}>You're offline</Text>
                <Text style={styles.modalHint}>
                  The exam paused itself automatically — {clock(exam.remaining)} left
                  {exam.sectionTimed && paper.sections[exam.sectionIdx] ? ` in ${paper.sections[exam.sectionIdx].name}` : ""}.
                  Your answers are saved on this device. It will resume on its own the moment your connection is back.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>{initialProgress ? "You left off here" : "Paused"}</Text>
                <Text style={styles.modalHint}>
                  {clock(exam.remaining)} left{exam.sectionTimed && paper.sections[exam.sectionIdx] ? ` in ${paper.sections[exam.sectionIdx].name}` : ""} · your answers are saved.
                </Text>
                <Pressable style={[styles.modalPrimaryBtn, { marginTop: space.lg }]} onPress={exam.resume}>
                  <Text style={styles.modalPrimaryBtnText}>Resume</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ModalStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.modalStat}>
      <Text style={styles.modalStatLabel}>{label}</Text>
      <Text style={styles.modalStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingTop: 52, paddingBottom: space.sm, backgroundColor: color.surface, ...shadow.soft },
  examTitle: { fontFamily: font.bodySemibold, fontSize: 14, color: color.ink },
  candRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: color.royal, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.bodySemibold, fontSize: 9, color: color.white },
  candName: { fontFamily: font.body, fontSize: 11, color: color.inkDim },
  pauseBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: color.surfaceSunken },
  pauseBtnText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  clockPill: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  clockPillUrgent: { backgroundColor: color.redBg },
  clockText: { fontFamily: font.monoSemibold, fontSize: 13, color: color.ink },
  clockTextUrgent: { color: color.red },

  sectionBar: { backgroundColor: color.surface, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.surfaceSunken },
  sectionTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: color.surfaceSunken },
  sectionTabActive: { backgroundColor: color.royal },
  sectionTabLocked: { opacity: 0.4 },
  sectionTabText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.inkDim },
  sectionTabTextActive: { color: color.white },

  warnBanner: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.redBg, padding: space.sm, paddingHorizontal: space.lg },
  warnBannerText: { flex: 1, fontFamily: font.body, fontSize: 11, color: color.red },
  warnDismiss: { fontFamily: font.bodySemibold, fontSize: 11, color: color.red },

  qTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: space.sm },
  qNo: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkDim },
  marks: { fontFamily: font.mono, fontSize: 11, color: color.inkFaint },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: space.md },
  chip: { backgroundColor: color.surfaceSunken, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipPurple: { backgroundColor: "#ece9fb" },
  chipText: { fontFamily: font.bodyMedium, fontSize: 11, color: color.inkDim },
  qText: { fontFamily: font.body, fontSize: 16, color: color.ink, lineHeight: 23, marginBottom: space.md },

  table: { borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.sm, marginBottom: space.md, overflow: "hidden" },
  tableHeadRow: { flexDirection: "row", backgroundColor: color.surfaceSunken },
  tableHeadCell: { flex: 1, fontFamily: font.bodySemibold, fontSize: 11, color: color.inkDim, padding: 8 },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  tableCell: { flex: 1, fontFamily: font.mono, fontSize: 12, color: color.ink, padding: 8 },

  option: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1.5, borderColor: color.surfaceSunken, borderRadius: radius.md, padding: space.md, backgroundColor: color.surface },
  optionSel: { borderColor: color.royal, backgroundColor: "#eaf1fd" },
  optKey: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" },
  optKeySel: { backgroundColor: color.royal, borderColor: color.royal },
  optKeyText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.inkDim },
  optKeyTextSel: { color: color.white },
  optionText: { fontFamily: font.body, fontSize: 14, color: color.ink, flex: 1 },

  numBox: { marginTop: space.md },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 11, color: color.inkFaint, letterSpacing: 0.4, marginBottom: 6 },
  numInput: {
    fontFamily: font.monoSemibold, fontSize: 20, color: color.ink, borderWidth: 1.5, borderColor: color.surfaceSunken,
    borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, backgroundColor: color.surface,
  },

  paletteCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginTop: space.xl, ...shadow.soft },
  paletteHead: { fontFamily: font.bodySemibold, fontSize: 13, color: color.ink, marginBottom: space.sm },
  legendRow: { flexDirection: "row", gap: space.md, marginBottom: space.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: font.monoSemibold, fontSize: 11, color: color.inkDim },
  paletteGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: space.md },
  pCell: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  pCellCurrent: { borderWidth: 2, borderColor: color.royal },
  pCellText: { fontFamily: font.monoSemibold, fontSize: 12 },
  submitBtn: { backgroundColor: color.ink, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  submitBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.white },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 8,
    padding: space.md, paddingBottom: space.xl, backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.surfaceSunken,
  },
  bottomBtnGhost: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: color.surfaceSunken },
  bottomBtnGhostText: { fontFamily: font.bodyMedium, fontSize: 12, color: color.inkDim },
  bottomBtnMark: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: "#ece9fb" },
  bottomBtnMarkText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.indigo },
  bottomBtnPrimary: { flex: 1, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  bottomBtnPrimaryText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.white },

  modalOverlay: { flex: 1, backgroundColor: "rgba(10,27,54,0.6)", alignItems: "center", justifyContent: "center", padding: space.xl },
  modalCard: { width: "100%", backgroundColor: color.surface, borderRadius: radius.lg, padding: space.xl },
  modalTitle: { fontFamily: font.display, fontSize: 18, color: color.ink, marginBottom: space.md },
  modalGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  modalStat: { width: "47%", backgroundColor: color.surfaceSunken, borderRadius: radius.sm, padding: space.sm },
  modalStatLabel: { fontFamily: font.body, fontSize: 11, color: color.inkDim },
  modalStatValue: { fontFamily: font.monoBold, fontSize: 18, color: color.ink },
  modalHint: { fontFamily: font.body, fontSize: 13, color: color.inkDim, lineHeight: 19 },
  modalBtnRow: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  modalSecondaryBtn: { flex: 1, borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  modalSecondaryBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  modalPrimaryBtn: { flex: 1, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  modalPrimaryBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.white },
});
