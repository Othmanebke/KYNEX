import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/data/auth";
import { Icon } from "./Icon";
import { PressScale } from "./Pressable";
import { Text } from "./Text";
import { colors, radius, space } from "./tokens";

/**
 * Pastille fixe en mode démo : les données affichées sont fictives, à tout moment.
 * Un appui quitte la démo (ses données sont effacées).
 */
export function DemoBadge() {
  const { state, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  if (state.status !== "signedIn" || state.user.mode !== "demo") return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm, right: insets.right + space.md }]}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="Mode démo, données fictives. Quitter la démo"
        onPress={() => void signOut()}
        style={styles.pill}
      >
        <Text variant="label" color={colors.onAccent}>
          Démo · données fictives
        </Text>
        <Icon name="x" size={14} color={colors.onAccent} />
      </PressScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", zIndex: 10 },
  pill: { flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: space.md, minHeight: 32 },
});
