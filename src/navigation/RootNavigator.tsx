import { useState } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useSession } from "../session/SessionContext";
import LoginScreen from "../screens/LoginScreen";
import MainTabs from "./MainTabs";
import ReviewScreen from "../screens/ReviewScreen";
import SystemCheckScreen from "../screens/SystemCheckScreen";
import InstructionsScreen from "../screens/InstructionsScreen";
import ExamScreen from "../screens/ExamScreen";
import ReportScreen from "../screens/ReportScreen";
import SpeedMathsScreen from "../screens/SpeedMathsScreen";
import TargetExamScreen from "../screens/targetExam/TargetExamScreen";
import StudyVaultScreen from "../screens/StudyVaultScreen";
import BookmarksScreen from "../screens/BookmarksScreen";
import { color } from "../theme";
import type { RootStackParamList } from "./types";
import { loadInProgress } from "../../shared/examPersist";

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: color.canvas, primary: color.royal },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Auth gate (no session -> Login) plus, once logged in, a root stack: the
 * tab bar lives at "Tabs"; the whole exam-taking flow (Review -> SystemCheck
 * -> Instructions -> Exam -> Report) pushes full-bleed on top of it with no
 * header, mirroring the web app's App.tsx phase model where those screens
 * render outside <HubLayout>. If a resumable in-progress exam exists at
 * launch (same resume-after-reload behavior the web app has), it opens
 * straight into Exam instead of Home. */
export default function RootNavigator() {
  const { session } = useSession();
  const [resumed] = useState(() => loadInProgress());

  if (!session) return (
    <NavigationContainer theme={navTheme}>
      <LoginScreen />
    </NavigationContainer>
  );

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={resumed ? "Exam" : "Tabs"}
      >
        <Stack.Screen name="Tabs" component={MainTabs} />
        <Stack.Screen name="Review" component={ReviewScreen} />
        <Stack.Screen name="SystemCheck" component={SystemCheckScreen} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} />
        <Stack.Screen
          name="Exam"
          component={ExamScreen}
          initialParams={resumed ? { paper: resumed.paper, settings: resumed.settings, initialProgress: resumed.progress } : undefined}
        />
        <Stack.Screen name="Report" component={ReportScreen} />
        <Stack.Screen name="SpeedMaths" component={SpeedMathsScreen} />
        <Stack.Screen name="TargetExam" component={TargetExamScreen} />
        <Stack.Screen name="StudyVault" component={StudyVaultScreen} />
        <Stack.Screen name="Bookmarks" component={BookmarksScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
