import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Switch } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Paper, Question, SectionInfo } from "../../shared/types";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Review">;
type ReviewRoute = RouteProp<RootStackParamList, "Review">;

/** Mobile port of web Review.tsx. The web version also supports drag-to-reorder
 * sections via pointer events — skipped here in favor of simple up/down
 * buttons (which the web version offers too), since a native drag gesture
 * needs react-native-gesture-handler/reanimated wiring that isn't worth it
 * for a first pass. The "exam-center realism" toggles (zoom/laggy-cursor
 * simulation, IBPS skin) are desktop-only concepts and intentionally not
 * ported, per the mobile build plan. */
export default function ReviewScreen() {
  const navigation = useNavigation<Nav>();
  const { paper } = useRoute<ReviewRoute>().params;

  const [duration, setDuration] = useState(paper.durationMinutes > 0 ? String(paper.durationMinutes) : "");
  const [negativeMarking, setNegativeMarking] = useState(String(paper.negativeMarking));
  const [sectionTimers, setSectionTimers] = useState(
    paper.sections.map((s) => ({ enabled: typeof s.minutes === "number", minutes: s.minutes ? String(s.minutes) : "" }))
  );
  const [sectionNames, setSectionNames] = useState(paper.sections.map((s) => s.name));
  const [order, setOrder] = useState(paper.sections.map((_, i) => i));
  const [monitorTabSwitches, setMonitorTabSwitches] = useState(true);
  const [error, setError] = useState("");

  function moveUp(visualIdx: number) {
    if (visualIdx === 0) return;
    setOrder((prev) => {
      const next = prev.slice();
      [next[visualIdx - 1], next[visualIdx]] = [next[visualIdx], next[visualIdx - 1]];
      return next;
    });
  }

  function moveDown(visualIdx: number) {
    setOrder((prev) => {
      if (visualIdx >= prev.length - 1) return prev;
      const next = prev.slice();
      [next[visualIdx], next[visualIdx + 1]] = [next[visualIdx + 1], next[visualIdx]];
      return next;
    });
  }

  function updateSection(origIdx: number, patch: Partial<{ enabled: boolean; minutes: string }>) {
    setSectionTimers((prev) => prev.map((s, j) => (j === origIdx ? { ...s, ...patch } : s)));
  }

  function renameSection(origIdx: number, name: string) {
    setSectionNames((prev) => prev.map((s, j) => (j === origIdx ? name : s)));
  }

  function confirm() {
    const d = Number(duration);
    if (!duration.trim() || !isFinite(d) || d <= 0) {
      setError("Enter a duration in minutes — this paper didn't come with one.");
      return;
    }
    for (const origIdx of order) {
      const t = sectionTimers[origIdx];
      if (t.enabled && (!t.minutes.trim() || !isFinite(Number(t.minutes)) || Number(t.minutes) <= 0)) {
        setError(`Enter a timer length (minutes) for "${sectionNames[origIdx] || paper.sections[origIdx].name}", or turn its timer off.`);
        return;
      }
    }
    setError("");

    const neg = Number(negativeMarking);
    let offset = 0;
    const newQuestions: Question[] = [];
    const newSections: SectionInfo[] = [];
    for (const origIdx of order) {
      const s = paper.sections[origIdx];
      const name = sectionNames[origIdx].trim() || s.name;
      const slice = paper.questions.slice(s.from, s.to + 1).map((q) => ({ ...q, section: name }));
      newQuestions.push(...slice);
      const count = slice.length;
      newSections.push({
        name, from: offset, to: offset + count - 1,
        minutes: sectionTimers[origIdx].enabled ? Number(sectionTimers[origIdx].minutes) : undefined,
      });
      offset += count;
    }

    const updated: Paper = {
      ...paper,
      durationMinutes: d,
      negativeMarking: isFinite(neg) && neg >= 0 ? neg : paper.negativeMarking,
      questions: newQuestions,
      sections: newSections,
    };
    navigation.navigate("SystemCheck", {
      paper: updated,
      settings: { monitorTabSwitches, simulateZoom: false, simulateLaggyCursor: false, examCenterSkin: false },
    });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64, paddingBottom: space.xxl }}>
      <Text style={styles.title}>Review & configure</Text>
      <Text style={styles.sub}>
        {paper.title} · {paper.questions.length} questions · {paper.sections.length} section{paper.sections.length === 1 ? "" : "s"}
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardHead}>Timing & marking</Text>
        <Text style={styles.fieldLabel}>DURATION (MINUTES)</Text>
        <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="e.g. 60" placeholderTextColor={color.inkFaint} style={styles.input} />
        <Text style={styles.fieldLabel}>NEGATIVE MARKING (PER WRONG ANSWER)</Text>
        <TextInput value={negativeMarking} onChangeText={setNegativeMarking} keyboardType="decimal-pad" style={styles.input} />
        <View style={styles.switchRow}>
          <Switch value={monitorTabSwitches} onValueChange={setMonitorTabSwitches} trackColor={{ true: color.royal }} />
          <Text style={styles.switchLabel}>Monitor app switches during the exam</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHead}>Sectional timers & order</Text>
        <Text style={styles.cardHint}>
          Rename a section if it got parsed wrong, reorder which one you sit first, and turn on a timer to lock it when it runs out.
        </Text>
        {order.map((origIdx, visualIdx) => {
          const s = paper.sections[origIdx];
          const count = s.to - s.from + 1;
          const t = sectionTimers[origIdx];
          return (
            <View key={origIdx} style={styles.sectionRow}>
              <View style={{ flex: 1 }}>
                <View style={styles.sectionNameRow}>
                  <Switch value={t.enabled} onValueChange={(v) => updateSection(origIdx, { enabled: v })} trackColor={{ true: color.royal }} />
                  <TextInput
                    value={sectionNames[origIdx]}
                    onChangeText={(v) => renameSection(origIdx, v)}
                    style={styles.sectionNameInput}
                  />
                </View>
                <View style={styles.sectionMetaRow}>
                  <Text style={styles.mutedSmall}>{count} question{count === 1 ? "" : "s"}</Text>
                  {t.enabled && (
                    <TextInput
                      value={t.minutes}
                      onChangeText={(v) => updateSection(origIdx, { minutes: v })}
                      keyboardType="number-pad"
                      placeholder="minutes"
                      placeholderTextColor={color.inkFaint}
                      style={styles.minutesInput}
                    />
                  )}
                </View>
              </View>
              {paper.sections.length > 1 && (
                <View style={styles.orderBtns}>
                  <Pressable disabled={visualIdx === 0} onPress={() => moveUp(visualIdx)} style={styles.orderBtn}>
                    <Text style={[styles.orderBtnText, visualIdx === 0 && { opacity: 0.3 }]}>↑</Text>
                  </Pressable>
                  <Pressable disabled={visualIdx === order.length - 1} onPress={() => moveDown(visualIdx)} style={styles.orderBtn}>
                    <Text style={[styles.orderBtnText, visualIdx === order.length - 1 && { opacity: 0.3 }]}>↓</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.btnRow}>
        <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Choose another paper</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={confirm}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.displayBlack, fontSize: 22, color: color.ink, marginBottom: 4 },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.lg },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 16, color: color.ink, marginBottom: space.md },
  cardHint: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: space.md, lineHeight: 17 },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: color.inkFaint, marginBottom: 6, marginTop: space.sm },
  input: {
    fontFamily: font.body, fontSize: 15, color: color.ink, borderWidth: 1, borderColor: color.surfaceSunken,
    backgroundColor: color.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md },
  switchLabel: { fontFamily: font.body, fontSize: 13, color: color.ink, flex: 1 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.surfaceSunken },
  sectionNameRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionNameInput: { flex: 1, fontFamily: font.bodySemibold, fontSize: 14, color: color.ink, paddingVertical: 4 },
  sectionMetaRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 4 },
  mutedSmall: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  minutesInput: {
    fontFamily: font.body, fontSize: 12, color: color.ink, borderWidth: 1, borderColor: color.surfaceSunken,
    borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4, width: 80,
  },
  orderBtns: { gap: 4 },
  orderBtn: { width: 28, height: 28, borderRadius: radius.sm, backgroundColor: color.surfaceSunken, alignItems: "center", justifyContent: "center" },
  orderBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.inkDim },
  errorText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.red, marginBottom: space.md },
  btnRow: { flexDirection: "row", gap: space.sm },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  secondaryBtnText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.inkDim },
  primaryBtn: { flex: 1, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.white },
});
