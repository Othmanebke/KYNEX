import { forwardRef, useState } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, fonts, HIT, radius, space } from "./tokens";

export interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string;
  help?: string;
  /** Ajoute un bouton « Afficher / Masquer » (mot de passe). */
  secret?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, error, help, secret, ...input }, ref) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const border = error ? colors.danger : focused ? colors.accent : colors.line;
  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.muted} nativeID={`${label}-label`}>
        {label}
      </Text>
      <View style={[styles.box, { borderColor: border }]}>
        <TextInput
          ref={ref}
          {...input}
          accessibilityLabel={label}
          accessibilityLabelledBy={`${label}-label`}
          accessibilityHint={error ?? help}
          secureTextEntry={secret && !revealed}
          placeholderTextColor={colors.faint}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={styles.input}
        />
        {secret ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            onPress={() => setRevealed((r) => !r)}
            style={styles.reveal}
          >
            <Text variant="small" color={colors.muted}>
              {revealed ? "Masquer" : "Afficher"}
            </Text>
          </PressScale>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" color={colors.danger} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : help ? (
        <Text variant="small" color={colors.muted}>
          {help}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  box: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: radius.md, backgroundColor: colors.surface, minHeight: HIT + 4 },
  input: { flex: 1, minWidth: 0, color: colors.fg, fontFamily: fonts.body, fontSize: 17, paddingHorizontal: space.lg, paddingVertical: space.md },
  reveal: { paddingHorizontal: space.lg },
});
