/** v3-signature design tokens, transcribed from
 * `~/Downloads/Pariksha App Design/v3-signature/README.md` (the approved
 * design language). Keep this file in sync by hand if that design is revised. */

export const color = {
  canvas: "#eef3fb",
  canvasAlt: "#e2ebfa",
  surface: "#ffffff",
  surfaceAlt: "#f7faff",
  surfaceSunken: "#eef3fc",

  ink: "#0b1830",
  inkDim: "#51607a",
  inkFaint: "#93a0b8",

  inkNavy900: "#0a1b36",
  inkNavy700: "#132a52",
  inkNavy500: "#1b3a6b",

  royal: "#1d4ed8",
  blue: "#2563eb",
  sky: "#38bdf8",
  cyan: "#22d3ee",
  indigo: "#4338ca",

  amber: "#e8962a",
  amberDeep: "#b4740e",
  amberBg: "#fdf1de",

  green: "#15983d",
  greenBg: "#e6f7ec",
  red: "#d6273c",
  redBg: "#fdecee",

  white: "#ffffff",
} as const;

/** react-native-linear-gradient-style stop arrays — use with expo-linear-gradient. */
export const gradient = {
  hero: {
    colors: [color.inkNavy900, "#13308f", color.royal, color.sky] as const,
    locations: [0, 0.46, 0.78, 1] as const,
    // 150deg in CSS ≈ start top-left-ish, end bottom-right-ish.
    start: { x: 0.1, y: 0 },
    end: { x: 0.9, y: 1 },
  },
  ring: {
    // Conic gradient has no direct RN equivalent; approximate with an SVG
    // sweep gradient in the Halo component using these same stops.
    colors: [color.royal, color.sky, color.amber, color.royal] as const,
  },
} as const;

export const font = {
  display: "PlusJakartaSans_700Bold",
  displayBlack: "PlusJakartaSans_800ExtraBold",
  displaySemibold: "PlusJakartaSans_600SemiBold",
  displayMedium: "PlusJakartaSans_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  bodyBold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoSemibold: "JetBrainsMono_600SemiBold",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  card: {
    shadowColor: color.royal,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  soft: {
    shadowColor: color.inkNavy900,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
