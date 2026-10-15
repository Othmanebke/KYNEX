import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Text } from "./Text";
import { colors, space } from "./tokens";

/**
 * Bandeau défilant de la maquette. Mouvement constant → courbe linéaire,
 * sur le thread UI. Réduction des animations : bandeau immobile.
 * Décoratif : masqué aux lecteurs d'écran (le contenu est dit ailleurs).
 * La piste est en position absolue : sa largeur n'élargit jamais l'écran.
 */
export function Marquee({ items, speed = 40 }: { items: string[]; speed?: number }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduced || w === 0) return;
    x.set(0);
    x.set(withRepeat(withTiming(-w, { duration: (w / speed) * 1000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(x);
  }, [reduced, w, speed, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  const copy = (measure: boolean) => (
    <View style={styles.copy} onLayout={measure ? (e) => setW(e.nativeEvent.layout.width) : undefined}>
      {items.map((it) => (
        <View key={it} style={styles.item}>
          <Text variant="label" color={colors.muted} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.text}>
            {it}
          </Text>
          <View style={styles.sep} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.band} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.track, style]}>
        {copy(true)}
        {copy(false)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: 44, overflow: "hidden", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  track: { position: "absolute", left: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "center" },
  copy: { flexDirection: "row", alignItems: "center" },
  item: { flexDirection: "row", alignItems: "center" },
  text: { fontSize: 13, letterSpacing: 2 },
  sep: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.faint, marginHorizontal: space.lg },
});
