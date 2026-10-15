import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, HIT, radius } from "./tokens";

export interface StepperProps {
  /** Nom pour les lecteurs d'écran (ex. « Durée le lundi »). */
  label: string;
  value: number | undefined;
  /** Texte affiché pour la valeur (ex. « 1 h 15 », « Auto »). */
  display: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

/** − valeur + ; boutons de 48 pt, valeur en chiffres tabulaires. Ajustable au lecteur d'écran. */
export function Stepper({ label, display, onDecrement, onIncrement }: StepperProps) {
  const tap = (fn?: () => void) => () => {
    if (!fn) return;
    void Haptics.selectionAsync();
    fn();
  };
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: display }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === "increment" ? tap(onIncrement)() : tap(onDecrement)())}
    >
      <PressScale accessibilityElementsHidden importantForAccessibility="no" disabled={!onDecrement} onPress={tap(onDecrement)} style={styles.btn}>
        <Text variant="headline">−</Text>
      </PressScale>
      <Text variant="mono" style={styles.value} numberOfLines={1}>
        {display}
      </Text>
      <PressScale accessibilityElementsHidden importantForAccessibility="no" disabled={!onIncrement} onPress={tap(onIncrement)} style={styles.btn}>
        <Text variant="headline">+</Text>
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  btn: { width: HIT, height: HIT, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  value: { minWidth: 64, textAlign: "center" },
});
