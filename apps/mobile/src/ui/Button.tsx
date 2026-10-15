import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, HIT, radius, space } from "./tokens";

type Kind = "primary" | "secondary" | "link";

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: Kind;
  loading?: boolean;
  disabled?: boolean;
  /** Indication pour lecteur d'écran, si le libellé ne suffit pas. */
  hint?: string;
  /** Flèche ↗ à droite (CTA de la maquette). */
  arrow?: boolean;
}

/**
 * primary   : fond vert-jaune, une seule par écran.
 * secondary : contour, actions alternatives.
 * link      : texte souligné vert-jaune + flèche — le CTA de la maquette.
 */
export function Button({ label, onPress, kind = "primary", loading, disabled, hint, arrow }: ButtonProps) {
  const inactive = disabled || loading;
  const fg = kind === "primary" ? colors.onAccent : kind === "link" ? colors.accent : colors.fg;
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (kind === "primary") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.base, kind === "primary" && styles.primary, kind === "secondary" && styles.secondary, kind === "link" && styles.link]}
    >
      {loading ? (
        <ActivityIndicator color={fg} accessibilityLabel="Chargement" />
      ) : (
        kind === "link" ? (
          // Soulignement porté par le texte : s'il passe sur deux lignes, chaque ligne est soulignée
          // et la flèche reste collée au dernier mot.
          <Text variant="label" color={fg} style={styles.linkText}>
            {label}
            {arrow ? "  ↗" : ""}
          </Text>
        ) : (
          <View style={styles.row}>
            <Text variant="bodyStrong" color={fg} style={styles.center}>
              {label}
              {arrow ? "  ↗" : ""}
            </Text>
          </View>
        )
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: HIT + 4, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  primary: { backgroundColor: colors.accent },
  secondary: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  link: { minHeight: HIT, paddingHorizontal: 0, alignItems: "flex-start", borderRadius: 0 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  linkText: { fontSize: 14, lineHeight: 22, letterSpacing: 1, textDecorationLine: "underline", textDecorationColor: colors.accent },
});
