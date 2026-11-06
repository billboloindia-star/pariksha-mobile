import type { ExamResult, ExamSettings, Paper } from "../../shared/types";
import type { ExamProgress } from "../../shared/examPersist";

/** Root stack: the tab bar lives inside "Tabs"; everything else (vault detail,
 * and the whole exam-taking flow) is pushed full-bleed on top of it, with the
 * tab bar hidden — mirrors the web app's App.tsx phase model, where Review/
 * SystemCheck/Instructions/Exam/Report render outside <HubLayout>. */
export type RootStackParamList = {
  Tabs: undefined;
  Review: { paper: Paper };
  SystemCheck: { paper: Paper; settings: ExamSettings };
  Instructions: { paper: Paper; settings: ExamSettings };
  Exam: { paper: Paper; settings: ExamSettings; initialProgress?: ExamProgress };
  Report: { result: ExamResult };
};
