import Svg, { Polyline } from "react-native-svg";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Compact trend line for a telemetry card - same idea as the web control
 * panel's Sparkline, just native SVG instead of inline <svg>. */
export default function Sparkline({ values, width = 140, height = 24, color = "#fff" }: Props) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`)
    .join(" ");
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
    </Svg>
  );
}
