import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, radius } from "./tokens";

/** Échelle RPE 1–10 en pastilles (cibles de 44 pt). */
export function RpePicker({ value, onChange, target }: { value?: number; onChange: (v: number | undefined) => void; target?: number }) {
  return (
    <View style={styles.rpe} accessibilityRole="radiogroup" accessibilityLabel="Effort perçu (RPE)">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const on = value === n;
        return (
          <PressScale
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`RPE ${n}${n === target ? ", cible" : ""}`}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(on ? undefined : n);
            }}
            containerStyle={styles.rpeSlot}
            style={[styles.rpeCell, n === target && styles.rpeTarget, on && styles.rpeOn]}
          >
            <Text variant="mono" color={on ? colors.onAccent : colors.fg}>
              {n}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}


const styles = StyleSheet.create({
  rpe: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  rpeSlot: { flexBasis: "18%", flexGrow: 1 },
  rpeCell: { minHeight: 48, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  rpeTarget: { borderColor: colors.accent },
  rpeOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
