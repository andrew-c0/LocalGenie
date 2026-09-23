import { createDarkTheme, type Theme } from "@fluentui/react-components";

const brandVariants = {
  10: "#1a1a3e",
  20: "#2d2b5e",
  30: "#3f3c7e",
  40: "#5150a0",
  50: "#5C58C0",
  60: "#6C63FF",
  70: "#7B73FF",
  80: "#8A85FF",
  90: "#9995FF",
  100: "#A8A4FF",
  110: "#B7B3FF",
  120: "#C6C2FF",
  130: "#D5D1FF",
  140: "#E4E0FF",
  150: "#F0EEFF",
  160: "#FFFFFF",
};

const baseTheme = createDarkTheme(brandVariants);

/**
 * Custom dark theme inspired by LM Studio's aesthetic.
 * Based on Fluent UI's webDarkTheme with adjusted tokens.
 */
export const localGenieTheme: Theme = {
  ...baseTheme,
  // Override specific theme tokens
  colorBrandBackground: "#6C63FF",
  colorBrandBackgroundHover: "#7B73FF",
  colorBrandBackgroundPressed: "#5A52E0",
  colorBrandForeground1: "#FFFFFF",
  colorBrandStroke1: "#6C63FF",

  // Neutral backgrounds — dark layered look
  colorNeutralBackground1: "#1A1A2E",
  colorNeutralBackground2: "#16213E",
  colorNeutralBackground3: "#0F3460",
  colorNeutralBackground4: "#1A1A2E",
  colorNeutralBackground5: "#242444",
  colorNeutralBackground6: "#2A2A4A",

  // Hover / pressed backgrounds
  colorNeutralBackground1Hover: "#252548",
  colorNeutralBackground2Hover: "#2A2A50",
  colorNeutralBackground3Hover: "#2F2F55",

  // Foreground (text) colors
  colorNeutralForeground1: "#E8E8F0",
  colorNeutralForeground2: "#B0B0C8",
  colorNeutralForeground3: "#8888A8",
  colorNeutralForeground4: "#6868A0",

  // Subtle colors
  colorNeutralBackgroundStatic: "#12122A",
  colorNeutralStroke1: "#3A3A5C",
  colorNeutralStroke2: "#2E2E50",

  // CompoundButton / Card backgrounds
  colorCompoundBrandBackground: "#6C63FF",
  colorCompoundBrandBackgroundHover: "#7B73FF",
  colorCompoundBrandBackgroundPressed: "#5A52E0",

  // Shadows for depth
  shadow4: "0 2px 4px rgba(0, 0, 0, 0.4)",
  shadow8: "0 4px 8px rgba(0, 0, 0, 0.5)",
  shadow16: "0 8px 16px rgba(0, 0, 0, 0.5)",
};
