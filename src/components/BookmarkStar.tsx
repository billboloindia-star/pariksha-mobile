import { useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import * as api from "../../shared/api";
import type { Question } from "../../shared/types";
import { color, font } from "../theme";

interface Props {
  q: Question;
  given?: number | null;
  wasCorrect?: boolean | null;
  sourceLabel: string;
  sourceWhen?: number;
}

/** A star that bookmarks the current question - reused identically on the
 * live exam screen (correctness unknown yet) and the post-exam Report
 * review (correctness known). Starts unfilled every render, no fetch to
 * check an existing bookmark, to stay cheap on a per-question screen. */
export default function BookmarkStar({ q, given, wasCorrect, sourceLabel, sourceWhen }: Props) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (!api.backendEnabled() || !api.getSession()) return null;

  async function mark() {
    if (state !== "idle") return;
    setState("saving");
    try {
      await api.addBookmark({
        section: q.section, topic: q.topic, type: q.type, text: q.text,
        table: q.table, image: q.image, solution: q.solution, options: q.options, ans: q.ans,
        given: given ?? null, wasCorrect: wasCorrect ?? null,
        sourceLabel, sourceWhen,
      });
      setState("saved");
    } catch {
      setState("idle");
    }
  }

  return (
    <Pressable style={[styles.btn, state === "saved" && styles.btnActive]} onPress={mark} disabled={state !== "idle"}>
      <Text style={[styles.star, state === "saved" && styles.starActive]}>{state === "saved" ? "★" : "☆"}</Text>
      {state === "saved" && <Text style={styles.lbl}>Bookmarked</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  btnActive: { backgroundColor: "#fdf1de", borderColor: "#e8962a" },
  star: { fontSize: 15, color: color.inkFaint },
  starActive: { color: "#d9740f" },
  lbl: { fontFamily: font.bodySemibold, fontSize: 11, color: "#d9740f" },
});
