import { StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, HIT, radius, space } from "./tokens";

export interface SegmentedProps<T extends string | number> {
  /** Nom du groupe pour les lecteurs d'écran (ex. « Niveau en Course à pied »). */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

/**
 * Choix unique en segments. Pas d'animation de glissement : c'est une commande
 * utilisée souvent, le changement doit être instantané (fond qui change d'un coup).
 * Les segments passent à la ligne si le texte agrandi ne tient plus.
 */
export function Segmented<T extends string | number>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <View key={String(o.value)} style={styles.cell}>
            <PressScale
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={o.label}
              onPress={() => {
                if (on) return;
                void Haptics.selectionAsync();
                onChange(o.value);
              }}
              style={[styles.seg, on && styles.segOn]}
            >
              <Text variant="small" color={on ? colors.onAccent : colors.fg} style={[styles.txt, on && styles.txtOn]}>
                {o.label}
              </Text>
            </PressScale>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", flexWrap: "wrap", gap: 4, backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.line },
  cell: { flexGrow: 1, flexBasis: 0, minWidth: 92 },
  seg: { minHeight: HIT - 4, borderRadius: radius.sm + 2, alignItems: "center", justifyContent: "center", paddingHorizontal: space.sm },
  segOn: { backgroundColor: colors.accent },
  txt: { textAlign: "center" },
  txtOn: { fontFamily: "Archivo_600SemiBold" },
});
