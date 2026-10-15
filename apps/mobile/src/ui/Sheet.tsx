import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { colors, radius, space } from "./tokens";

const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Panneau d'actions. Téléphone : feuille qui monte du bas (courbe iOS, 280 ms).
 * Tablette / PC : boîte centrée qui apparaît en fondu. Fermeture : fond, Échap, retour Android.
 * Réduction des animations : Reanimated remplace les entrées par leur état final.
 */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 700;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, wide && styles.rootWide]}>
        <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} style={styles.backdrop} />
        </Animated.View>
        <Animated.View
          entering={wide ? FadeIn.duration(180).easing(EASE_OUT) : SlideInDown.duration(280).easing(EASE_SHEET)}
          accessibilityViewIsModal
          style={[styles.panel, wide ? styles.panelWide : [styles.panelPhone, { paddingBottom: insets.bottom + space.lg }]]}
        >
          {wide ? null : <View style={styles.grabber} />}
          <View style={styles.head}>
            <Text variant="title" accessibilityRole="header" style={styles.flex}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={8} style={styles.close}>
              <Text variant="headline" color={colors.muted}>
                ✕
              </Text>
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  rootWide: { justifyContent: "center", alignItems: "center", padding: space.xl },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  panel: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, maxHeight: "88%" },
  panelPhone: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: space.xl - 4, paddingTop: space.sm },
  panelWide: { width: "100%", maxWidth: 520, borderRadius: radius.lg, padding: space.xl },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.faint, marginBottom: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.md },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  // Marge droite : la barre de défilement (web) ne rogne pas les étiquettes alignées à droite.
  body: { gap: space.md, paddingBottom: space.sm, paddingRight: space.sm },
});
