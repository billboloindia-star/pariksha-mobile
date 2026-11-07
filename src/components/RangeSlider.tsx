import { useRef, useState } from "react";
import { View, Text, StyleSheet, PanResponder, type LayoutChangeEvent } from "react-native";
import { color, font, radius } from "../theme";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  accent?: string;
  onChange: (v: number) => void;
}

/** A real drag-to-set slider built on core RN's PanResponder (no slider
 * library dependency) - the mobile counterpart to the web app's "killer
 * card" styled range input (`.mvSliderField`), which became the reference
 * pattern for fixing basic-looking native inputs across the app. */
export default function RangeSlider({ label, value, min, max, step = 1, suffix = "", accent = color.amber, onChange }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const widthRef = useRef(0);

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setTrackWidth(w);
  }

  function valueFromX(x: number) {
    const w = widthRef.current;
    if (w <= 0) return value;
    const ratio = Math.max(0, Math.min(1, x / w));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, stepped));
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(valueFromX(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(valueFromX(e.nativeEvent.locationX)),
    })
  ).current;

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: accent }]}>{value}{suffix}</Text>
      </View>
      <View style={styles.track} onLayout={onLayout} {...pan.panHandlers}>
        <View style={styles.trackBg} />
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: accent }]} />
        <View style={[styles.thumb, { left: `${pct}%`, borderColor: accent }]} />
      </View>
      <View style={styles.minMaxRow}>
        <Text style={styles.minMax}>{min}{suffix}</Text>
        <Text style={styles.minMax}>{max}{suffix}</Text>
      </View>
    </View>
  );
}

const THUMB = 22;

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  label: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.4, color: color.inkFaint, textTransform: "uppercase" },
  value: { fontFamily: font.monoBold, fontSize: 18 },
  track: { height: THUMB, justifyContent: "center" },
  trackBg: { position: "absolute", left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: color.surfaceSunken },
  fill: { position: "absolute", left: 0, height: 6, borderRadius: 3 },
  minMaxRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  minMax: { fontFamily: font.mono, fontSize: 10.5, color: color.inkFaint },
  thumb: {
    position: "absolute", width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: color.white,
    borderWidth: 3, marginLeft: -THUMB / 2, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
});
