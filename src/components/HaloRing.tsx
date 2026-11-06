import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { color, font } from "../theme";

interface Props {
  /** 0-100 */
  percent: number;
  size?: number;
  strokeWidth?: number;
  /** Centered label, e.g. "78%" — omit to render a bare ring. */
  label?: string;
  labelColor?: string;
}

const STOPS = [color.royal, color.sky, color.amber, color.royal];

/** The app's recurring "this number matters" motif — a ring built from
 * blended segments standing in for a true conic gradient (SVG has no conic
 * gradient primitive), reused for every percentage/avatar moment per the
 * v3-signature design system. */
export default function HaloRing({ percent, size = 96, strokeWidth = 8, label, labelColor = color.ink }: Props) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, percent));
  const SEGMENTS = 48;
  const segments = Array.from({ length: SEGMENTS }, (_, i) => {
    const t = i / SEGMENTS;
    const frac = t * (STOPS.length - 1);
    const idx = Math.min(STOPS.length - 2, Math.floor(frac));
    const localT = frac - idx;
    const color1 = STOPS[idx];
    const color2 = STOPS[idx + 1];
    return mixHex(color1, color2, localT);
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={radius} stroke={color.surfaceSunken} strokeWidth={strokeWidth} fill="none" />
        {segments.map((c, i) => {
          const segFrac = 1 / SEGMENTS;
          const startFrac = i * segFrac;
          if (startFrac * 100 > pct) return null;
          const dash = circumference * segFrac * 1.15;
          const offset = -circumference * startFrac;
          return (
            <Circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              stroke={c}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash},${circumference}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              fill="none"
              rotation={-90}
              origin={`${center}, ${center}`}
            />
          );
        })}
      </Svg>
      {label ? (
        <Text style={{ fontFamily: font.monoBold, fontSize: size * 0.22, color: labelColor }}>{label}</Text>
      ) : null}
    </View>
  );
}

function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bch = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bch})`;
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
