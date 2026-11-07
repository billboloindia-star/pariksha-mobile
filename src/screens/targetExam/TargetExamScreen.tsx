import { useCallback, useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as api from "../../../shared/api";
import type { BankSectionSummary, TargetExamState } from "../../../shared/types";
import { color } from "../../theme";
import TargetExamWizard from "./TargetExamWizard";
import TargetExamDashboard from "./TargetExamDashboard";
import type { RootStackParamList } from "../../navigation/types";

type RootNav = NativeStackNavigationProp<RootStackParamList>;

/** Mirrors the web app's TargetExam component: fetch any existing plan on
 * mount, show the ongoing dashboard if one exists, otherwise the setup
 * wizard. */
export default function TargetExamScreen() {
  const navigation = useNavigation<RootNav>();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<TargetExamState | null>(null);
  const [bankSections, setBankSections] = useState<BankSectionSummary[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.fetchTargetExam();
      setState(s);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    api.fetchBankSections().then(setBankSections).catch(() => {});
  }, [refresh]);

  function onStartTopic(chapter: string) {
    const section = bankSections?.find((s) => s.chapter === chapter)?.section ?? "";
    // Nested navigate into the Vault tab's own stack, seeding the practice
    // builder - mirrors web's onPracticeTopic. "Tabs"/"Vault" aren't typed
    // for nested params in RootStackParamList, so this needs a loose cast;
    // worth tightening if TargetExam gains more cross-tab navigation.
    (navigation as any).navigate("Tabs", { screen: "Vault", params: { screen: "MasterVault", params: { seedSection: section, seedChapters: [chapter] } } });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.royal} />
      </View>
    );
  }

  if (state) {
    return <TargetExamDashboard state={state} onStartTopic={onStartTopic} onRefresh={refresh} />;
  }

  return <TargetExamWizard onAccepted={(s) => setState(s)} />;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: color.canvas, alignItems: "center", justifyContent: "center" },
});
