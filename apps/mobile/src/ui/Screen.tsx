import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space } from "./tokens";

/**
 * Conteneur d'écran : zones sûres, clavier, défilement.
 * Sur tablette / PC, la colonne de contenu est bornée (`maxWidth`) et centrée.
 */
export function Screen({ children, maxWidth = 520, scroll = true }: { children: ReactNode; maxWidth?: number; scroll?: boolean }) {
  const inner = <View style={[styles.column, { maxWidth }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            {inner}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{inner}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // En développement, place pour le sélecteur de données (src/dev/DataToggle) sous le contenu.
  scroll: { flexGrow: 1, paddingHorizontal: space.xl - 4, paddingTop: space.lg, paddingBottom: __DEV__ ? 64 : space.lg, alignItems: "center" },
  column: { width: "100%", flexGrow: 1, gap: space.xl },
});
