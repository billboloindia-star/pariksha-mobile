import { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image, Modal, PanResponder, TextInput, Animated, Easing } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  CHAPTERS, CHAPTER_ORDER, CHAPTER_GROUPS, CHAPTER_GROUP_LABELS, parseInlineMarkup,
  SQRT_LAST_DIGIT_MAP, IMPOSSIBLE_SQUARE_ENDINGS, CBRT_LAST_DIGIT_MAP,
  findSquareExample, findCubeExample, squareRootSteps, cubeRootSteps, landmarkNums,
  type ChapterKey, type SubConceptNote,
} from "../../shared/studyVault";
import * as api from "../../shared/api";
import type { CropBox } from "../../shared/types";
import { color, font, radius, space } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "StudyVault">;

/** Same letterboxing math as web's containRect - the rendered Image box is
 * often larger than the actual pixels it draws (object-fit:contain), so a
 * touch's position within the box isn't the same as its position on the
 * real image content. */
function containRect(boxW: number, boxH: number, natW: number, natH: number) {
  const boxRatio = boxW / boxH;
  const natRatio = natW / natH;
  let w: number, h: number;
  if (natRatio > boxRatio) { w = boxW; h = boxW / natRatio; } else { h = boxH; w = boxH * natRatio; }
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

type NoteClipMeta = { section: string; chapter: string; subConcept?: string };

function Inline({ text, style, accentStyle, boldStyle }: { text: string; style: any; accentStyle: any; boldStyle: any }) {
  return (
    <Text style={style}>
      {parseInlineMarkup(text).map((seg, i) => (
        <Text key={i} style={seg.kind === "step" ? accentStyle : seg.kind === "b" ? boldStyle : undefined}>{seg.text}</Text>
      ))}
    </Text>
  );
}

function FormulaLines({ eq }: { eq: string }) {
  return (
    <>
      {eq.split("<br>").map((line, i) => (
        <Text key={i} style={styles.feq}>{line}</Text>
      ))}
    </>
  );
}

function DigitRow({ active, impossible, onPick }: { active: number; impossible?: number[]; onPick: (d: number) => void }) {
  return (
    <View style={styles.digitRow}>
      {Array.from({ length: 10 }, (_, d) => (
        <Pressable
          key={d}
          style={[styles.digitChip, d === active && styles.digitChipActive, impossible?.includes(d) && styles.digitChipImpossible]}
          onPress={() => onPick(d)}
        >
          <Text style={[styles.digitChipText, d === active && styles.digitChipTextActive]}>{d}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function LandmarkBlock({ kind }: { kind: "sqrt" | "cbrt" }) {
  const nums = landmarkNums(kind);
  const label = kind === "sqrt"
    ? "Quick range check for big numbers: see which two landmarks your number sits between, then apply the method above on that narrower range."
    : "Quick range check for big numbers: cubes grow fast, so these tens-based landmarks narrow things down immediately.";
  return (
    <View style={styles.landmarkBlock}>
      <Text style={styles.landmarkLbl}>{label}</Text>
      <View style={styles.landmarkRow}>
        {nums.map((n) => {
          const v = kind === "sqrt" ? n * n : n * n * n;
          return (
            <View style={styles.landmarkChip} key={n}>
              <Text style={styles.landmarkChipText}>{kind === "sqrt" ? `${n}²` : `${n}³`} = <Text style={styles.landmarkChipBold}>{v.toLocaleString()}</Text></Text>
            </View>
          );
        })}
      </View>
      {kind === "sqrt" ? (
        <View style={styles.workEx}>
          <Text style={styles.workExText}>
            <Text style={styles.b}>How to use it</Text> — finding √27,889:{"\n"}
            <Text style={styles.step}>22,500 (150²) {"<"} 27,889 {"<"} 40,000 (200²)</Text> → root is between 150 and 200{"\n"}
            Now apply the digit method just within that band → <Text style={styles.b}>√27,889 = 167</Text>
          </Text>
        </View>
      ) : (
        <View style={styles.workEx}>
          <Text style={styles.workExText}>
            <Text style={styles.b}>How to use it</Text> — finding ∛103,823:{"\n"}
            <Text style={styles.step}>64,000 (40³) {"<"} 103,823 {"<"} 125,000 (50³)</Text> → root is between 40 and 50{"\n"}
            Last digit 3 → root ends in 7 → <Text style={styles.b}>∛103,823 = 47</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

type ShortcutMode = "squares" | "sqrt" | "cubes" | "cbrt";
const SHORTCUT_KEYS: ShortcutMode[] = ["squares", "sqrt", "cubes", "cbrt"];
const SHORTCUT_LABELS: Record<ShortcutMode, string> = { squares: "Find squares", sqrt: "Find square roots", cubes: "Find cubes", cbrt: "Find cube roots" };

function SpeedMathsShortcuts() {
  const [mode, setMode] = useState<ShortcutMode>("squares");
  const [digit, setDigit] = useState(1);

  return (
    <View>
      <View style={styles.subTabRow}>
        {SHORTCUT_KEYS.map((k) => (
          <Pressable key={k} style={[styles.subTabBtn, mode === k && styles.subTabBtnActive]} onPress={() => { setMode(k); setDigit(1); }}>
            <Text style={[styles.subTabBtnText, mode === k && styles.subTabBtnTextActive]}>{SHORTCUT_LABELS[k]}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "squares" && (
        <View>
          <Text style={styles.shortcutH3}>Finding a square fast</Text>
          <Text style={styles.shortcutP}>Realistically, in 45-60 seconds per question, recall beats derivation — these only pay off because they're near-zero mental math. Use whichever base (50 or 100) is actually closer to your number.</Text>
          <Text style={styles.trickNote}><Text style={styles.b}>Ends in 5</Text> (genuinely instant): (a5)² = a × (a+1), then append 25.</Text>
          <View style={styles.workEx}><Text style={styles.workExText}>85² → <Text style={styles.step}>8 × 9 = 72</Text> → append 25 → <Text style={styles.b}>7225</Text></Text></View>
          <Text style={[styles.trickNote, { marginTop: 18 }]}><Text style={styles.b}>Near 50</Text> — write two blocks and join them: (50±a)² = <Text style={styles.b}>(25±a)</Text> followed by <Text style={styles.b}>a²</Text> (2 digits, carry overflow into the front block).</Text>
          <View style={styles.workEx}>
            <Text style={styles.workExText}>
              47² → a=3 → front <Text style={styles.step}>25−3=22</Text>, back <Text style={styles.step}>3²=09</Text> → <Text style={styles.b}>2209</Text>{"\n"}
              63² → a=13 → front <Text style={styles.step}>25+13=38</Text>, back <Text style={styles.step}>13²=169</Text> → carry 1 → 38+1=39, back 69 → <Text style={styles.b}>3969</Text>
            </Text>
          </View>
          <Text style={[styles.trickNote, { marginTop: 18 }]}><Text style={styles.b}>Near 100</Text> — same idea: (100±a)² = <Text style={styles.b}>(100±2a)</Text> followed by <Text style={styles.b}>a²</Text>. Most useful for 3-digit numbers like 97 or 108.</Text>
          <View style={styles.workEx}>
            <Text style={styles.workExText}>
              103² → a=3 → front <Text style={styles.step}>100+6=106</Text>, back <Text style={styles.step}>3²=09</Text> → <Text style={styles.b}>10609</Text>{"\n"}
              108² → a=8 → front <Text style={styles.step}>100+16=116</Text>, back <Text style={styles.step}>8²=64</Text> → <Text style={styles.b}>11664</Text>
            </Text>
          </View>
          <Text style={[styles.trickNote, { marginTop: 18 }]}>For anything that doesn't fit one of these patterns — <Text style={styles.b}>just memorize squares 1-30</Text>. Deriving an arbitrary square mid-exam is slower than recall.</Text>
        </View>
      )}

      {mode === "cubes" && (
        <View>
          <Text style={styles.shortcutH3}>Finding a cube fast</Text>
          <Text style={styles.shortcutP}>Honestly: there's no general algebraic shortcut fast enough for exam conditions. Here's what's actually worth it.</Text>
          <Text style={styles.trickNote}><Text style={styles.b}>One more than a multiple of 10</Text> (the only cubing pattern simple enough to use live): (10a+1)³ = 1000a³ + 300a² + 30a + 1.</Text>
          <View style={styles.workEx}><Text style={styles.workExText}>21³ → a=2 → <Text style={styles.step}>8000 + 1200 + 60 + 1</Text> → <Text style={styles.b}>9261</Text></Text></View>
          <Text style={[styles.trickNote, { marginTop: 18 }]}>For everything else — <Text style={styles.b}>memorize cubes 1-20</Text> and stop there. Bank exams almost never ask you to compute a cube from scratch; they ask for the <Text style={styles.b}>cube root</Text> of one.</Text>
        </View>
      )}

      {mode === "sqrt" && (() => {
        const impossible = IMPOSSIBLE_SQUARE_ENDINGS.includes(digit);
        const candidates = impossible ? [] : SQRT_LAST_DIGIT_MAP[digit];
        const s = impossible ? null : squareRootSteps(findSquareExample(digit));
        return (
          <View>
            <Text style={styles.shortcutH3}>Finding a square root fast</Text>
            <Text style={styles.shortcutP}>The last digit of a perfect square narrows its root to 1 or 2 candidates — tap any digit below, including the impossible ones.</Text>
            <DigitRow active={digit} impossible={IMPOSSIBLE_SQUARE_ENDINGS} onPick={setDigit} />
            {impossible ? (
              <View style={styles.ruleOut}>
                <Text style={styles.headline}>Ends in {digit} <Text style={styles.arrow}>→</Text> impossible</Text>
                <Text style={styles.steps}>No perfect square ever ends in 2, 3, 7 or 8.{"\n"}If a number ends in <Text style={styles.hl}>{digit}</Text>, it is <Text style={styles.win}>definitely not</Text> a perfect square.</Text>
              </View>
            ) : (
              <View style={styles.ruleOut}>
                <Text style={styles.headline}>
                  Ends in {digit} <Text style={styles.arrow}>→</Text> root {candidates.length === 1 ? <>must end in <Text style={styles.win}>{candidates[0]}</Text></> : <>ends in <Text style={styles.hl}>{candidates[0]}</Text> or <Text style={styles.hl}>{candidates[1]}</Text></>}
                </Text>
                {candidates.length > 1 && s ? (
                  <Text style={styles.steps}>
                    Strip last 2 digits of <Text style={styles.b2}>{s.sq}</Text> → <Text style={styles.hl}>{s.remaining}</Text>{"\n"}
                    {s.k}² ≤ {s.remaining} {"<"} {s.k + 1}² → tens digit is <Text style={styles.win}>{s.k}</Text>{"\n"}
                    Compare {s.remaining} to {s.k}×{s.k + 1}={s.k * (s.k + 1)}: {s.remaining > s.k * (s.k + 1) ? "bigger" : "smaller"} → pick the {s.remaining > s.k * (s.k + 1) ? "larger" : "smaller"} candidate (<Text style={styles.win}>{s.chosen}</Text>){"\n"}
                    → <Text style={styles.b2}>√{s.sq} = {s.ans}</Text> ✓
                  </Text>
                ) : s ? (
                  <Text style={styles.steps}>Example: √{s.sq} = <Text style={styles.b2}>{s.ans}</Text> — no disambiguation needed, this ending is unique.</Text>
                ) : null}
              </View>
            )}
            <LandmarkBlock kind="sqrt" />
          </View>
        );
      })()}

      {mode === "cbrt" && (() => {
        const n = findCubeExample(digit);
        const s = cubeRootSteps(n);
        return (
          <View>
            <Text style={styles.shortcutH3}>Finding a cube root fast</Text>
            <Text style={styles.shortcutP}>Unlike squares, every last digit maps back to exactly one root digit.</Text>
            <DigitRow active={digit} onPick={setDigit} />
            <View style={styles.ruleOut}>
              <Text style={styles.headline}>Ends in {digit} <Text style={styles.arrow}>→</Text> root ends in <Text style={styles.win}>{CBRT_LAST_DIGIT_MAP[digit]}</Text></Text>
              <Text style={styles.steps}>
                Every digit maps to exactly one cube-root digit — no ambiguity, unlike squares.{"\n\n"}
                <Text style={styles.b2}>∛{s.cu}</Text> (the standard 3-step method):{"\n"}
                1. Split last 3 digits: <Text style={styles.hl}>{s.rest}</Text> | <Text style={styles.hl}>{s.last3}</Text>{"\n"}
                2. Ends in {digit} → root ends in <Text style={styles.win}>{s.unitDigit}</Text>{"\n"}
                3. {s.k}³ ≤ {s.rest} {"<"} {s.k + 1}³ → tens digit is <Text style={styles.win}>{s.k}</Text>{"\n"}
                → <Text style={styles.b2}>{s.ans}³ = {s.cu}</Text> ✓
              </Text>
            </View>
            <LandmarkBlock kind="cbrt" />
          </View>
        );
      })()}
    </View>
  );
}

function NotesGallery({ title, pages, meta }: { title: string; pages: string[]; meta: NoteClipMeta }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<CropBox | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const insets = useSafeAreaInsets();
  const pageTurnAnim = useRef(new Animated.Value(0)).current;
  const turnRotate = pageTurnAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: ["-75deg", "0deg", "75deg"] });
  const turnScaleX = pageTurnAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.92, 1, 0.92] });
  const turnOpacity = pageTurnAnim.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.4, 1, 0.4] });
  const canClip = api.backendEnabled() && !!api.getSession();

  // Refs keep the single PanResponder (created once) reading live state
  // instead of a stale closure, and carry layout info from onLayout/onLoad.
  const lightboxRef = useRef(lightbox);
  lightboxRef.current = lightbox;
  const pagesLenRef = useRef(pages.length);
  pagesLenRef.current = pages.length;
  const selectingRef = useRef(selecting);
  selectingRef.current = selecting;
  const imgBoxRef = useRef({ width: 0, height: 0 });
  const naturalRef = useRef({ width: 1, height: 1 });
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Pinch-zoom + pan (native-driven, so dragging stays smooth) - only
  // active while not crop-selecting, reset whenever selecting/page/close.
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const resetZoom = () => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    pinchStartDistRef.current = null;
    panStartRef.current = null;
    scaleAnim.setValue(1);
    translateAnim.setValue({ x: 0, y: 0 });
  };

  // locationX/Y are relative to the view that actually caught the touch,
  // which stops being the responder's own wrapper once a child view sits
  // in between - the Animated.View below has pointerEvents="none" so it
  // can never "steal" that target identity, keeping these reliably
  // relative to this wrapper itself.
  const fractionAt = (locationX: number, locationY: number) => {
    const box = imgBoxRef.current;
    const nat = naturalRef.current;
    if (!box.width || !box.height) return null;
    const rect = containRect(box.width, box.height, nat.width, nat.height);
    const x = Math.max(0, Math.min(1, (locationX - rect.x) / rect.w));
    const y = Math.max(0, Math.min(1, (locationY - rect.y) / rect.h));
    return { x, y };
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => selectingRef.current || e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e, g) =>
        selectingRef.current ||
        e.nativeEvent.touches.length === 2 ||
        (scaleRef.current > 1.02 && e.nativeEvent.touches.length === 1) ||
        (Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5),
      onPanResponderGrant: (e) => {
        if (selectingRef.current) {
          const f = fractionAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (f) { dragStartRef.current = f; setSelection(null); }
          return;
        }
        const touches = e.nativeEvent.touches;
        if (touches.length === 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          pinchStartDistRef.current = dist;
          pinchStartScaleRef.current = scaleRef.current;
        } else if (touches.length === 1 && scaleRef.current > 1.02) {
          panStartRef.current = { x: touches[0].pageX, y: touches[0].pageY, tx: translateRef.current.x, ty: translateRef.current.y };
        }
      },
      onPanResponderMove: (e) => {
        if (selectingRef.current) {
          if (!dragStartRef.current) return;
          const f = fractionAt(e.nativeEvent.locationX, e.nativeEvent.locationY);
          if (!f) return;
          const s = dragStartRef.current;
          setSelection({ x: Math.min(s.x, f.x), y: Math.min(s.y, f.y), width: Math.abs(f.x - s.x), height: Math.abs(f.y - s.y) });
          return;
        }
        const touches = e.nativeEvent.touches;
        if (touches.length === 2) {
          const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
          if (pinchStartDistRef.current == null) { pinchStartDistRef.current = dist; pinchStartScaleRef.current = scaleRef.current; return; }
          const next = Math.max(1, Math.min(4, pinchStartScaleRef.current * (dist / pinchStartDistRef.current)));
          scaleRef.current = next;
          scaleAnim.setValue(next);
        } else if (touches.length === 1 && panStartRef.current) {
          const p = panStartRef.current;
          const tx = p.tx + (touches[0].pageX - p.x);
          const ty = p.ty + (touches[0].pageY - p.y);
          translateRef.current = { x: tx, y: ty };
          translateAnim.setValue({ x: tx, y: ty });
        }
      },
      onPanResponderRelease: (_e, g) => {
        if (selectingRef.current) { dragStartRef.current = null; return; }
        pinchStartDistRef.current = null;
        panStartRef.current = null;
        if (scaleRef.current > 1.02) return; // was pinching/panning - don't also treat as a swipe
        const cur = lightboxRef.current;
        if (cur === null) return;
        if (g.dx <= -50 && cur < pagesLenRef.current - 1) changePage(cur + 1);
        else if (g.dx >= 50 && cur > 0) changePage(cur - 1);
      },
    })
  ).current;

  if (pages.length === 0) return null;

  const closeLightbox = () => { setLightbox(null); setFullscreen(false); setSelecting(false); setSelection(null); resetZoom(); };
  const changePage = (next: number) => {
    const dir = next > (lightbox ?? 0) ? "next" : "prev";
    setLightbox(next); setSelecting(false); setSelection(null); setNoteText(""); setSaveState("idle"); resetZoom();
    pageTurnAnim.setValue(dir === "next" ? -1 : 1);
    Animated.timing(pageTurnAnim, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const toggleSelecting = () => { setSelecting((s) => !s); setSelection(null); resetZoom(); };

  const saveClip = async () => {
    if (!selection || lightbox === null || selection.width < 0.02 || selection.height < 0.02) return;
    setSaveState("saving");
    try {
      await api.addNoteClip({
        section: meta.section, chapter: meta.chapter, subConcept: meta.subConcept,
        sourceImageUrl: pages[lightbox], cropBox: selection, note: noteText.trim() || undefined,
      });
      setSaveState("saved");
      setTimeout(() => { setSelecting(false); setSelection(null); setNoteText(""); setSaveState("idle"); }, 1200);
    } catch {
      setSaveState("error");
    }
  };

  const showSavePanel = selecting && selection && selection.width > 0.02 && selection.height > 0.02;

  return (
    <View style={styles.notesGallery}>
      <Text style={styles.notesGalleryLbl}>TEACHER'S HANDWRITTEN NOTES ({pages.length} PAGE{pages.length > 1 ? "S" : ""})</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.notesThumbRow}>
          {pages.map((url, i) => (
            <Pressable key={url} style={styles.notesThumb} onPress={() => setLightbox(i)}>
              <Image source={{ uri: url }} style={styles.notesThumbImg} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Modal visible={lightbox !== null} transparent={!fullscreen} animationType="fade" onRequestClose={fullscreen ? () => setFullscreen(false) : closeLightbox}>
        <Pressable
          style={fullscreen ? styles.lightboxBackdropFull : styles.lightboxBackdrop}
          onPress={fullscreen || selecting ? undefined : closeLightbox}
        >
          <Pressable style={fullscreen ? styles.lightboxInnerFull : styles.lightboxInner} onPress={(e) => e.stopPropagation()}>
            {!fullscreen && (
              <View style={styles.lightboxHead}>
                <Text style={styles.lightboxHeadText} numberOfLines={1}>{title} — page {(lightbox ?? 0) + 1} of {pages.length}</Text>
                <View style={styles.lightboxHeadBtns}>
                  {canClip && (
                    <Pressable onPress={toggleSelecting}>
                      <Text style={[styles.lightboxExpand, selecting && styles.lightboxExpandActive]}>✂️</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setFullscreen(true)}><Text style={styles.lightboxExpand}>⛶</Text></Pressable>
                  <Pressable onPress={closeLightbox}><Text style={styles.lightboxClose}>✕</Text></Pressable>
                </View>
              </View>
            )}
            {lightbox !== null && (
              <View
                style={fullscreen ? styles.lightboxImgWrapFull : styles.lightboxImgWrap}
                onLayout={(e) => {
                  imgBoxRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
                }}
                {...responder.panHandlers}
              >
                <Animated.View
                  pointerEvents="none"
                  style={{ flex: 1, transform: [{ perspective: 900 }, { rotateY: turnRotate }, { scaleX: turnScaleX }], opacity: turnOpacity }}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={{ flex: 1, transform: [{ translateX: translateAnim.x }, { translateY: translateAnim.y }, { scale: scaleAnim }] }}
                  >
                    <Image
                      key={lightbox}
                      source={{ uri: pages[lightbox] }}
                      style={fullscreen ? styles.lightboxImgFull : styles.lightboxImg}
                      resizeMode="contain"
                      onLoad={(e) => {
                        const src = e.nativeEvent.source;
                        if (src?.width && src?.height) naturalRef.current = { width: src.width, height: src.height };
                      }}
                    />
                  </Animated.View>
                </Animated.View>
                {selection && (
                  <View
                    pointerEvents="none"
                    style={[styles.cropBox, { left: `${selection.x * 100}%`, top: `${selection.y * 100}%`, width: `${selection.width * 100}%`, height: `${selection.height * 100}%` }]}
                  />
                )}
              </View>
            )}
            {fullscreen && (
              <View style={[styles.lightboxTopBtns, { top: insets.top + 12 }]}>
                {canClip && (
                  <Pressable style={[styles.lightboxShrinkBtn, selecting && styles.lightboxExpandActiveBg]} onPress={toggleSelecting}>
                    <Text style={styles.lightboxExpand}>✂️</Text>
                  </Pressable>
                )}
                <Pressable style={styles.lightboxShrinkBtn} onPress={() => setFullscreen(false)}>
                  <Text style={styles.lightboxExpand}>⤢</Text>
                </Pressable>
              </View>
            )}
            {showSavePanel && (
              <View style={fullscreen ? [styles.clipSavePanel, styles.clipSavePanelFull, { bottom: insets.bottom + 20 }] : styles.clipSavePanel}>
                <TextInput
                  style={styles.clipNoteInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Add a note (optional)…"
                  placeholderTextColor={color.inkFaint}
                  multiline
                />
                <View style={styles.clipSaveRow}>
                  <Pressable style={styles.clipCancelBtn} onPress={() => { setSelection(null); setNoteText(""); setSaveState("idle"); }}>
                    <Text style={styles.clipCancelBtnText}>Discard</Text>
                  </Pressable>
                  <Pressable style={styles.clipSaveBtn} disabled={saveState === "saving"} onPress={saveClip}>
                    <Text style={styles.clipSaveBtnText}>
                      {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Try again" : "Save as clip"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {!showSavePanel && (
              <View style={fullscreen ? [styles.lightboxNavFull, { bottom: insets.bottom + 20 }] : styles.lightboxNav}>
                <Pressable
                  disabled={lightbox === 0}
                  style={[fullscreen ? styles.lightboxNavBtnFull : styles.lightboxNavBtn, lightbox === 0 && styles.lightboxNavBtnDisabled]}
                  onPress={() => changePage((lightbox ?? 0) - 1)}
                >
                  <Text style={styles.lightboxNavBtnText}>← Prev</Text>
                </Pressable>
                {fullscreen && <Text style={styles.lightboxNavFullCount}>{(lightbox ?? 0) + 1} / {pages.length}</Text>}
                <Pressable
                  disabled={lightbox === pages.length - 1}
                  style={[fullscreen ? styles.lightboxNavBtnFull : styles.lightboxNavBtn, lightbox === pages.length - 1 && styles.lightboxNavBtnDisabled]}
                  onPress={() => changePage((lightbox ?? 0) + 1)}
                >
                  <Text style={styles.lightboxNavBtnText}>Next →</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SubConceptPanel({ notes, chapterLabel }: { notes: SubConceptNote[]; chapterLabel: string }) {
  const [idx, setIdx] = useState(0);
  const note = notes[idx];
  return (
    <View style={styles.subConcepts}>
      <Text style={styles.subConceptLbl}>SUB-CONCEPTS IN THIS CHAPTER</Text>
      <View style={styles.subConceptChips}>
        {notes.map((n, i) => (
          <Pressable
            key={n.name}
            style={[styles.subConceptChip, i === idx && styles.subConceptChipActive]}
            onPress={() => setIdx(i)}
          >
            <Text style={[styles.subConceptChipText, i === idx && styles.subConceptChipTextActive]}>{n.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.subConceptBody}>
        <Text style={styles.conceptTitle}>{note.name}</Text>
        <Text style={styles.conceptBody}>{note.body}</Text>
        {note.formula && <FormulaLines eq={note.formula} />}
        <NotesGallery key={note.name} title={note.name} pages={note.notesPages ?? []} meta={{ section: "Quant", chapter: chapterLabel, subConcept: note.name }} />
      </View>
    </View>
  );
}

export default function StudyVaultScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<ChapterKey>(CHAPTER_ORDER[0]);
  const ch = CHAPTERS[active];

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.exitRow, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.exitRowText}>← Home</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxl }}>
        <Text style={styles.eyebrow}>STUDY VAULT</Text>
        <Text style={styles.pageTitle}>Formulas, concepts & approach</Text>
        <Text style={styles.pageSub}>Pulled from real RRB PO paper analysis — these are the chapters that actually show up.</Text>

        {CHAPTER_GROUPS.map((g) => (
          <View key={g}>
            <Text style={styles.groupLabel}>{CHAPTER_GROUP_LABELS[g]}</Text>
            <View style={styles.chapterRow}>
              {CHAPTER_ORDER.filter((k) => CHAPTERS[k].group === g).map((k) => (
                <Pressable
                  key={k}
                  style={[styles.chapterBtn, k === "speedmaths" && active === k && styles.chapterBtnSpeedActive, active === k && k !== "speedmaths" && styles.chapterBtnActive]}
                  onPress={() => setActive(k)}
                >
                  <Text style={[styles.chapterBtnText, active === k && styles.chapterBtnTextActive]}>{CHAPTERS[k].label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.stage} key={active}>
          {ch.isSpeedMaths ? (
            <SpeedMathsShortcuts />
          ) : (
            <>
              <Text style={styles.chH2}>{ch.label}</Text>
              <Text style={styles.chP}>{ch.intro}</Text>

              {ch.concept && (
                <View style={styles.conceptBox}>
                  <Text style={styles.conceptLbl}>KEY CONCEPT</Text>
                  <Text style={styles.conceptTitle}>{ch.concept.title}</Text>
                  <Text style={styles.conceptBody}>{ch.concept.body}</Text>
                </View>
              )}

              <View style={styles.formulaList}>
                {ch.formulas?.map((f) => (
                  <View style={styles.formulaCard} key={f.n}>
                    <Text style={styles.fname}>{f.n.toUpperCase()}</Text>
                    <FormulaLines eq={f.eq} />
                    {f.note && <Text style={styles.fnote}>{f.note}</Text>}
                  </View>
                ))}
              </View>

              {ch.subConcepts && <SubConceptPanel notes={ch.subConcepts} chapterLabel={ch.label} />}
              {!ch.subConcepts && ch.notesPages && <NotesGallery title={ch.label} pages={ch.notesPages} meta={{ section: "Quant", chapter: ch.label }} />}

              {ch.example && (
                <View style={styles.exampleBox}>
                  <Text style={styles.elbl}>{ch.example.label.toUpperCase()}</Text>
                  {ch.example.lines.map((l, i) => (
                    <Inline key={i} text={l} style={styles.eworkLine} accentStyle={styles.step} boldStyle={styles.b} />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const DARK = {
  panel: "#0b1626", panel2: "#0e1c30", line: "#1c2d45", line2: "#263a55", text: "#8296b3", text2: "#5c7191",
};

const styles = StyleSheet.create({
  exitRow: { paddingHorizontal: space.xl, paddingBottom: 8, backgroundColor: color.canvas },
  exitRowText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.inkDim },

  eyebrow: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 1, color: color.inkFaint, textAlign: "center", marginBottom: 6 },
  pageTitle: { fontFamily: font.displayBlack, fontSize: 22, color: color.ink, textAlign: "center", marginBottom: 6 },
  pageSub: { fontFamily: font.body, fontSize: 12.5, color: color.inkDim, textAlign: "center", marginBottom: 20, lineHeight: 18 },

  groupLabel: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.6, color: DARK.text2, textAlign: "center", marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  chapterRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center", marginBottom: 4 },
  chapterBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: color.surfaceSunken, backgroundColor: color.surface },
  chapterBtnActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chapterBtnSpeedActive: { backgroundColor: "#e8305a", borderColor: "#e8305a" },
  chapterBtnText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: color.inkDim },
  chapterBtnTextActive: { color: color.white },

  stage: { backgroundColor: DARK.panel, borderRadius: radius.xl, padding: 22, marginTop: 18 },
  chH2: { fontFamily: font.displayBlack, fontSize: 18, color: color.white, marginBottom: 6 },
  chP: { fontFamily: font.body, fontSize: 12.5, color: DARK.text, lineHeight: 18, marginBottom: 16 },

  conceptBox: { backgroundColor: "rgba(63,165,255,0.12)", borderWidth: 1, borderColor: "rgba(63,165,255,0.3)", borderRadius: radius.md, padding: 16, marginBottom: 16 },
  conceptLbl: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.5, color: "#3fa5ff", marginBottom: 6 },
  conceptTitle: { fontFamily: font.displaySemibold, fontSize: 14, color: color.white, marginBottom: 6 },
  conceptBody: { fontFamily: font.body, fontSize: 12, color: DARK.text, lineHeight: 18 },

  formulaList: { gap: 10 },
  formulaCard: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 15 },
  fname: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.4, color: DARK.text, marginBottom: 6 },
  feq: { fontFamily: font.mono, fontSize: 14, fontWeight: "700", color: color.white, lineHeight: 20 },
  fnote: { fontFamily: font.body, fontSize: 11.5, color: DARK.text, lineHeight: 16, marginTop: 6 },

  subConcepts: { marginTop: 18 },
  subConceptLbl: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.5, color: DARK.text, marginBottom: 10 },
  subConceptChips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  subConceptChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: DARK.line2, backgroundColor: DARK.panel2 },
  subConceptChipActive: { backgroundColor: "#2176d1", borderColor: "transparent" },
  subConceptChipText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: DARK.text },
  subConceptChipTextActive: { color: color.white },
  subConceptBody: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 15 },

  notesGallery: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: DARK.line2 },
  notesGalleryLbl: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 0.5, color: DARK.text, marginBottom: 10 },
  notesThumbRow: { flexDirection: "row", gap: 10 },
  notesThumb: { width: 84, height: 112, borderRadius: 8, borderWidth: 1.5, borderColor: DARK.line2, backgroundColor: color.white, overflow: "hidden" },
  notesThumbImg: { width: "100%", height: "100%" },
  lightboxBackdrop: { flex: 1, backgroundColor: "rgba(5,10,20,0.9)", alignItems: "center", justifyContent: "center", padding: 20 },
  lightboxInner: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 14, width: "100%", maxHeight: "90%" },
  lightboxHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  lightboxHeadText: { fontFamily: font.bodySemibold, fontSize: 12, color: DARK.text, flexShrink: 1, paddingRight: 10 },
  lightboxHeadBtns: { flexDirection: "row", alignItems: "center", gap: 14 },
  lightboxExpand: { fontSize: 18, color: DARK.text, padding: 4 },
  lightboxExpandActive: { color: "#3fa5ff" },
  lightboxClose: { fontSize: 18, color: DARK.text, padding: 4 },
  lightboxImgWrap: { position: "relative", width: "100%", height: 420 },
  lightboxImg: { width: "100%", height: "100%", borderRadius: 8, backgroundColor: color.white },
  lightboxNav: { flexDirection: "row", gap: 10, marginTop: 12 },

  cropBox: { position: "absolute", borderWidth: 2, borderColor: "#3fa5ff", borderStyle: "dashed", backgroundColor: "rgba(63,165,255,0.18)" },
  clipSavePanel: { backgroundColor: DARK.panel, borderWidth: 1, borderColor: DARK.line2, borderRadius: 10, padding: 10, marginTop: 12, gap: 8 },
  clipSavePanelFull: { position: "absolute", left: 16, right: 16, marginTop: 0, zIndex: 3, backgroundColor: "#0b1626", borderWidth: 1, borderColor: DARK.line2 },
  clipNoteInput: { width: "100%", minHeight: 44, backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: 8, color: color.white, fontSize: 12.5, padding: 8, fontFamily: font.body, textAlignVertical: "top" },
  clipSaveRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  clipCancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: DARK.line2 },
  clipCancelBtnText: { fontFamily: font.bodySemibold, fontSize: 12, color: DARK.text },
  clipSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: "#2176d1" },
  clipSaveBtnText: { fontFamily: font.bodySemibold, fontSize: 12, color: color.white },

  lightboxBackdropFull: { flex: 1, backgroundColor: "#000" },
  lightboxInnerFull: { flex: 1, width: "100%" },
  lightboxImgWrapFull: { flex: 1, width: "100%", position: "relative", overflow: "hidden" },
  lightboxImgFull: { flex: 1, width: "100%", backgroundColor: "#000" },
  lightboxTopBtns: { position: "absolute", right: 16, flexDirection: "row", gap: 10, zIndex: 2 },
  lightboxShrinkBtn: { backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 20, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  lightboxExpandActiveBg: { backgroundColor: "rgba(63,165,255,0.5)" },
  lightboxNavFull: { position: "absolute", bottom: 28, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 2 },
  lightboxNavBtnFull: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center" },
  lightboxNavFullCount: { fontFamily: font.bodySemibold, fontSize: 12, color: color.white, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 10, overflow: "hidden" },
  lightboxNavBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: DARK.line2, backgroundColor: DARK.panel, alignItems: "center" },
  lightboxNavBtnDisabled: { opacity: 0.35 },
  lightboxNavBtnText: { fontFamily: font.bodySemibold, fontSize: 12.5, color: color.white },

  exampleBox: { marginTop: 18, backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 16 },
  elbl: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.4, color: "#e8305a", marginBottom: 8 },
  eworkLine: { fontFamily: font.mono, fontSize: 12.5, color: DARK.text, lineHeight: 20 },

  subTabRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 },
  subTabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: DARK.panel2, borderWidth: 1.5, borderColor: DARK.line2 },
  subTabBtnActive: { backgroundColor: "#e8305a", borderColor: "#e8305a" },
  subTabBtnText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: DARK.text },
  subTabBtnTextActive: { color: color.white },

  shortcutH3: { fontFamily: font.displaySemibold, fontSize: 15, color: color.white, marginBottom: 4 },
  shortcutP: { fontFamily: font.body, fontSize: 11.5, color: DARK.text, lineHeight: 17, marginBottom: 14 },
  trickNote: { fontFamily: font.body, fontSize: 11.5, color: DARK.text, lineHeight: 17, marginBottom: 12 },

  workEx: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 14, marginBottom: 4 },
  workExText: { fontFamily: font.mono, fontSize: 12, color: DARK.text, lineHeight: 20 },

  digitRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 18 },
  digitChip: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2 },
  digitChipActive: { backgroundColor: "#e8305a", borderColor: "#e8305a" },
  digitChipImpossible: { opacity: 0.4 },
  digitChipText: { fontFamily: font.mono, fontSize: 12, color: DARK.text },
  digitChipTextActive: { color: color.white, fontFamily: font.monoBold },

  ruleOut: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: radius.md, padding: 16 },
  headline: { fontFamily: font.monoBold, fontSize: 14, color: color.white, marginBottom: 8 },
  arrow: { color: DARK.text, fontFamily: font.mono },
  steps: { fontFamily: font.mono, fontSize: 11.5, color: DARK.text, lineHeight: 19 },
  hl: { color: "#e8305a", fontFamily: font.monoBold },
  win: { color: color.white, fontFamily: font.monoBold },
  b2: { color: color.white, fontFamily: font.monoBold },
  b: { color: color.white, fontFamily: font.bodySemibold },
  step: { color: "#e8305a", fontFamily: font.bodySemibold },

  landmarkBlock: { marginTop: 16 },
  landmarkLbl: { fontFamily: font.body, fontSize: 10.5, color: DARK.text2, marginBottom: 8, lineHeight: 15 },
  landmarkRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  landmarkChip: { backgroundColor: DARK.panel2, borderWidth: 1, borderColor: DARK.line2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  landmarkChipText: { fontFamily: font.mono, fontSize: 10.5, color: DARK.text },
  landmarkChipBold: { color: color.white, fontFamily: font.monoBold },
});
