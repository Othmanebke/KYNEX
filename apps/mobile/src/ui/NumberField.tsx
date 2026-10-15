import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Text } from "./Text";
import { colors, fonts, radius, space } from "./tokens";

/** Champ numérique : vide (« — ») = non saisi, jamais 0 par défaut. */
export function NumberField({ label, unit, value, onChange, decimal }: { label: string; unit: string; value?: number; onChange: (v: number | undefined) => void; decimal?: boolean }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <View style={styles.field}>
      <Text variant="label" color={colors.muted}>
        {label}
      </Text>
      <View style={styles.fieldBox}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            const clean = t.replace(",", ".").replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
            setText(clean);
            const n = Number(clean);
            onChange(clean === "" || !Number.isFinite(n) ? undefined : n);
          }}
          keyboardType={decimal ? "decimal-pad" : "number-pad"}
          inputMode={decimal ? "decimal" : "numeric"}
          placeholder="—"
          accessibilityHint="Laisse vide si tu ne veux pas le saisir : rien ne sera inventé"
          placeholderTextColor={colors.faint}
          accessibilityLabel={`${label} en ${unit}`}
          selectionColor={colors.accent}
          style={styles.fieldInput}
          maxLength={6}
        />
        <Text variant="mono" color={colors.muted}>
          {unit}
        </Text>
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 130, gap: space.xs },
  fieldBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: space.md, minHeight: 56 },
  fieldInput: { flex: 1, minWidth: 0, color: colors.fg, fontFamily: fonts.monoMedium, fontSize: 24, paddingVertical: space.sm },
});
