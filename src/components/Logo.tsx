import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
}

/** 1:1 port of the web app's src/components/Logo.tsx brand mark — same
 * shapes/gradient/amber accent, just on react-native-svg instead of DOM SVG.
 * Keep these two files in sync by hand if the mark ever changes. */
export default function Logo({ size = 52 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 360 360">
      <Defs>
        <LinearGradient id="pariksha-tile-grad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1b3a6b" />
          <Stop offset="1" stopColor="#0a1b36" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="360" height="360" rx="80" fill="url(#pariksha-tile-grad)" />
      <Circle cx="180" cy="180" r="100" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity={0.18} />
      <Rect x="142" y="110" width="26" height="150" rx="6" fill="#ffffff" />
      <Path d="M168,110 h26 a36,36 0 0 1 0,72 h-26" fill="none" stroke="#ffffff" strokeWidth="26" strokeLinecap="round" />
      <Circle cx="178" cy="146" r="9" fill="#e8962a" />
      <Rect x="142" y="272" width="80" height="6" rx="3" fill="#e8962a" />
    </Svg>
  );
}
