import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { color, font, radius, space, shadow } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "Instructions">;
type InstructionsRoute = RouteProp<RootStackParamList, "Instructions">;

const STATUS_LEGEND: { label: string; color: string }[] = [
  { label: "Not visited", color: color.inkFaint },
  { label: "Visited, no answer", color: color.red },
  { label: "Answered", color: color.green },
  { label: "Marked for review", color: color.indigo },
  { label: "Answered & marked", color: color.amber },
];

/** Mobile port of web Instructions.tsx's standard (non-IBPS-skin) path — the
 * IBPS/TCS iON realism skin is a desktop exam-center simulation and isn't
 * part of this build's mobile scope. */
export default function InstructionsScreen() {
  const navigation = useNavigation<Nav>();
  const { paper, settings } = useRoute<InstructionsRoute>().params;
  const [agreed, setAgreed] = useState(false);
  const mc = paper.questions.filter((q) => q.type === "mc").length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.xl, paddingTop: 64, paddingBottom: space.xxl }}>
      <Text style={styles.title} numberOfLines={2}>{paper.title}</Text>
      <Text style={styles.sub}>General instructions</Text>

      <View style={styles.card}>
        <Text style={styles.cardHead}>Read before you begin</Text>

        <InstrLine n={1}>
          This paper has <B>{paper.questions.length} questions</B> carrying <B>{paper.questions.length} marks</B> in total
          {paper.sections.length > 1 ? <> across <B>{paper.sections.length} sections</B></> : null}.
        </InstrLine>
        <InstrLine n={2}>
          You have <B>{paper.durationMinutes} minutes</B>. The clock runs continuously and the paper submits itself at zero.
        </InstrLine>
        <InstrLine n={3}>
          Every wrong answer costs <B>{paper.negativeMarking} marks</B>. Unattempted questions cost nothing.
        </InstrLine>
        <InstrLine n={4}>
          {paper.questions.length - mc} questions need a typed number; {mc} are multiple choice.
        </InstrLine>
        <InstrLine n={5}>
          Use <B>Save &amp; Next</B> to record an answer, <B>Mark for Review</B> to flag one, and the palette to jump anywhere.
        </InstrLine>

        <View style={styles.legend}>
          {STATUS_LEGEND.map((l) => (
            <View key={l.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: l.color }]} />
              <Text style={styles.legendLabel}>{l.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Switch value={agreed} onValueChange={setAgreed} trackColor={{ true: color.royal }} />
          <Text style={styles.switchLabel}>I have read the instructions and I am ready to begin.</Text>
        </View>

        <View style={styles.btnRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Choose another paper</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryBtn, !agreed && { opacity: 0.4 }]}
            disabled={!agreed}
            onPress={() => navigation.navigate("Exam", { paper, settings })}
          >
            <Text style={styles.primaryBtnText}>Start the exam</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontFamily: font.bodySemibold, color: color.ink }}>{children}</Text>;
}

function InstrLine({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={styles.instrLine}>
      <Text style={styles.instrNum}>{n}.</Text>
      <Text style={styles.instrText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 18, color: color.ink },
  sub: { fontFamily: font.body, fontSize: 13, color: color.inkDim, marginBottom: space.xl },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 17, color: color.ink, marginBottom: space.md },
  instrLine: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  instrNum: { fontFamily: font.bodySemibold, fontSize: 13, color: color.inkFaint, width: 16 },
  instrText: { fontFamily: font.body, fontSize: 13, color: color.inkDim, flex: 1, lineHeight: 19 },
  legend: { marginTop: space.md, marginBottom: space.md, gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontFamily: font.body, fontSize: 12, color: color.inkDim },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm, marginBottom: space.lg },
  switchLabel: { fontFamily: font.bodyMedium, fontSize: 13, color: color.ink, flex: 1 },
  btnRow: { flexDirection: "row", gap: space.sm },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: color.surfaceSunken, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  secondaryBtnText: { fontFamily: font.bodyMedium, fontSize: 13, color: color.inkDim },
  primaryBtn: { flex: 1, backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  primaryBtnText: { fontFamily: font.bodySemibold, fontSize: 13, color: color.white },
});
