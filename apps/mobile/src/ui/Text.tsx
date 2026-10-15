import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { colors, fonts } from "./tokens";

type Variant = "hero" | "display" | "title" | "headline" | "body" | "bodyStrong" | "small" | "label" | "mono" | "monoSmall";

/**
 * Les grands titres plafonnent l'agrandissement (Dynamic Type) pour ne pas
 * déborder ; le texte courant suit librement le réglage du téléphone.
 */
const variants: Record<Variant, TextStyle & { max?: number }> = {
  hero: { fontFamily: fonts.display, fontSize: 64, lineHeight: 58, letterSpacing: -1, textTransform: "uppercase", max: 1.3 },
  display: { fontFamily: fonts.display, fontSize: 44, lineHeight: 42, letterSpacing: -0.5, textTransform: "uppercase", max: 1.4 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, textTransform: "uppercase", max: 1.6 },
  headline: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: "uppercase" },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  monoSmall: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontVariant: ["tabular-nums"] },
};

export interface KTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function Text({ variant = "body", color = colors.fg, style, maxFontSizeMultiplier, ...rest }: KTextProps) {
  const { max, ...v } = variants[variant];
  return <RNText {...rest} maxFontSizeMultiplier={maxFontSizeMultiplier ?? max} style={[v, { color }, style]} />;
}
