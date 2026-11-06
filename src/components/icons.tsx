import Svg, { Path, Circle, Rect } from "react-native-svg";

interface IconProps {
  size?: number;
  color?: string;
}

/** Ported 1:1 from the web app's src/components/Sidebar.tsx icon set (same
 * stroke paths), plus a Profile icon the mobile tab bar needs that the web
 * sidebar didn't (it used a plain logout button instead of a profile tab). */

export function HomeIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 11.5L12 4l8 7.5" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PastIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={8} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M12 9v4l3 2" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function VaultIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={2} width={16} height={20} rx={2} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M8 8h8M8 12h8M8 16h5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function InsightsIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 19V10M10 19V5M16 19v-7M4 19h16" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ProfileIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} fill="none" stroke={color} strokeWidth={1.8} />
      <Path d="M4 20c0-4 3.5-7 8-7s8 3 8 7" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function LogoutIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 17l5-5-5-5M20 12H9M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UploadIcon({ size = 22, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 15V4M12 4l-4 4M12 4l4 4" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function BellIcon({ size = 20, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 5 2 6H4c1-1 2-2.8 2-6z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M9.5 19a2.5 2.5 0 0 0 5 0" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, color = "currentColor" }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
