import type { ReactNode, RefObject } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space } from "./tokens";

/**
 * Conteneur d'écran : zones sûres, clavier, défilement.
 * Sur tablette / PC, la colonne de contenu est bornée (`maxWidth`) et centrée.
 * `footer` : barre d'actions fixe sous le contenu défilant (toujours atteignable).
 */
export function Screen({
  children,
  maxWidth = 520,
  scroll = true,
  footer,
  scrollRef,
}: {
  children: ReactNode;
  maxWidth?: number;
  scroll?: boolean;
  footer?: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const inner = <View style={[styles.column, { maxWidth }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView ref={scrollRef} contentContainerStyle={[styles.scroll, footer ? styles.scrollWithFooter : null]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            {inner}
          </ScrollView>
        ) : (
          <View style={styles.scroll}>{inner}</View>
        )}
        {footer ? (
          <View style={styles.footerBar}>
            <View style={[styles.footer, { maxWidth }]}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  // En développement, place pour le sélecteur de données (src/dev/DataToggle) sous le contenu.
  scroll: { flexGrow: 1, paddingHorizontal: space.xl - 4, paddingTop: space.lg, paddingBottom: __DEV__ ? 64 : space.lg, alignItems: "center" },
  scrollWithFooter: { paddingBottom: space.xl },
  column: { width: "100%", flexGrow: 1, gap: space.xl },
  footerBar: { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg, paddingHorizontal: space.xl - 4, paddingTop: space.md, paddingBottom: __DEV__ ? 56 : space.md, alignItems: "center" },
  footer: { width: "100%", gap: space.sm },
});
