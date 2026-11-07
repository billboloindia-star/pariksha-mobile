import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { color, font } from "../theme";

export interface DonutSegment {
  weight: number;
  color: string;
}

interface Props {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerValue?: string;
  centerLabel?: string;
}

/** A true multi-color segmented ring (distinct per-segment colors, not a
 * blended gradient like HaloRing) - used for the topic-contract composition
 * charts, where each segment is a real, separately-colored topic bucket.
 * SVG has no conic-gradient primitive, so this accumulates strokeDasharray/
 * strokeDashoffset per segment, same underlying technique as HaloRing. */
export default function SegmentDonut({ segments, size = 132, strokeWidth = 14, centerValue, centerLabel }: Props) {
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, x) => s + x.weight, 0) || 1;

  let cumFrac = 0;
  const arcs = segments.map((seg, i) => {
    const frac = seg.weight / total;
    const gapFrac = segments.length > 1 ? 0.012 : 0;
    const dash = circumference * Math.max(0, frac - gapFrac);
    const offset = -circumference * cumFrac;
    cumFrac += frac;
    return { key: i, color: seg.color, dash, offset };
  });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={color.consoleLine} strokeWidth={strokeWidth} fill="none" />
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={center}
            cy={center}
            r={radius}
            stroke={a.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${a.dash},${circumference}`}
            strokeDashoffset={a.offset}
            strokeLinecap="butt"
            fill="none"
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        ))}
      </Svg>
      {(centerValue || centerLabel) && (
        <View
          style={{
            position: "absolute", width: size - strokeWidth * 2, height: size - strokeWidth * 2,
            borderRadius: (size - strokeWidth * 2) / 2, backgroundColor: color.consolePanel,
            alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.consoleLine,
          }}
        >
          {centerValue ? <Text style={{ fontFamily: font.monoBold, fontSize: size * 0.17, color: color.white }}>{centerValue}</Text> : null}
          {centerLabel ? <Text style={{ fontFamily: font.body, fontSize: size * 0.07, color: color.consoleText, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{centerLabel}</Text> : null}
        </View>
      )}
    </View>
  );
}

/** Mixes a hex color toward the dark console panel base at t=0, full
 * brightness at t=1 - a section's dominant topic should visually glow
 * brightest, same intent as the web's shadeHex(). */
export function shadeForConsole(hex: string, t: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const base = [14, 24, 40];
  const mix = [r, g, b].map((c, i) => Math.round(base[i] + (c - base[i]) * t));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}
