import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cubicBezier } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, radius, space } from "./tokens";
import { Icon } from "./Icon";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

export interface ChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  /** Détail sous le libellé (ex. couverture). */
  detail?: ReactNode;
  /** Pastille de couleur (famille de discipline). */
  dot?: string;
  /** Rôle : case à cocher (multi) ou bouton radio (choix unique). */
  role?: "checkbox" | "radio";
  disabled?: boolean;
  accessibilityHint?: string;
  /** Libellé lu par le lecteur d'écran si le libellé affiché est abrégé. */
  a11yLabel?: string;
}

/**
 * Puce sélectionnable. L'état est porté par la forme (coche + contour), pas
 * seulement par la couleur. Changement de couleur en 150 ms ; haptique de sélection.
 */
export function Chip({ label, selected, onToggle, detail, dot, role = "checkbox", disabled, accessibilityHint, a11yLabel }: ChipProps) {
  return (
    <PressScale
      accessibilityRole={role}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            borderColor: selected ? colors.accent : colors.line,
            backgroundColor: selected ? "rgba(212,255,58,0.10)" : colors.surface,
            transitionProperty: ["borderColor", "backgroundColor"],
            transitionDuration: 150,
            transitionTimingFunction: EASE_OUT,
          },
        ]}
      >
        <View style={[styles.box, selected && styles.boxOn, role === "radio" && styles.radio]}>
          {selected ? (
            <Icon name="check" size={15} color={colors.onAccent} />
          ) : null}
        </View>
        <View style={styles.text}>
          <View style={styles.titleRow}>
            {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
            <Text variant="bodyStrong" style={styles.flex}>
              {label}
            </Text>
          </View>
          {detail ? <View>{detail}</View> : null}
        </View>
      </Animated.View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "flex-start", gap: space.md, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 52 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.faint, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  radio: { borderRadius: 11 },
  tick: { fontSize: 13, lineHeight: 16, letterSpacing: 0 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  flex: { flexShrink: 1 },
});
