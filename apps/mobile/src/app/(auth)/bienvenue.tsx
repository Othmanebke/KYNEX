import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";
import { listDisciplines } from "@kynex/core";
import { useAuth } from "@/data/auth";
import { Button } from "@/ui/Button";
import { COVERAGE, COVERAGE_ORDER, coverageCount } from "@/ui/coverage";
import { Marquee } from "@/ui/Marquee";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const WORDS = [
  { w: "Mouvement.", accent: false },
  { w: "Discipline.", accent: true },
  { w: "Résultat.", accent: false },
];

export default function Welcome() {
  const { cloudAvailable, startLocal } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  // « MOUVEMENT. » (le mot le plus long) mesure ~4,7 fois la taille de police en Barlow Condensed :
  // on dimensionne pour qu'il tienne sur une ligne, de 320 px jusqu'au PC, sans troncature.
  const column = Math.min(width, 520) - 40;
  const heroSize = wide ? 104 : Math.min(72, Math.floor(column / 4.9));

  const all = listDisciplines();
  const counts = COVERAGE_ORDER.map((c) => ({ c, n: all.filter((d) => d.coverage === c).length })).filter((x) => x.n > 0);
  const coached = all.filter((d) => d.coverage === "full").map((d) => d.name.toUpperCase());

  return (
    <Screen maxWidth={wide ? 1120 : 520}>
      <View style={styles.top}>
        <Text variant="title" accessibilityRole="header">
          KYNEX
        </Text>
        <Text variant="monoSmall" color={colors.muted}>
          ENTRAÎNEMENT MULTISPORTS
        </Text>
      </View>

      <View style={[styles.body, wide && styles.bodyWide]}>
        <View style={[styles.heroCol, wide && { flex: 1.3 }]}>
          <View accessible accessibilityRole="header" accessibilityLabel="Mouvement. Discipline. Résultat.">
            {WORDS.map(({ w, accent }, i) => (
              <Animated.View key={w} entering={FadeInDown.duration(520).delay(80 + i * 90).easing(EASE_OUT)}>
                {/* Titre de marque déjà dimensionné à l'écran : il ne grossit pas avec le réglage
                    de taille du texte (le sens est porté par accessibilityLabel au-dessus). */}
                <Text variant="hero" color={accent ? colors.accent : colors.fg} maxFontSizeMultiplier={1} style={{ fontSize: heroSize, lineHeight: Math.round(heroSize * 0.92) }}>
                  {w}
                </Text>
              </Animated.View>
            ))}
          </View>
          <Text variant="body" color={colors.muted} style={styles.lede}>
            Une semaine d'entraînement qui combine tes sports sans qu'ils se gênent : charge répartie, jours de repos respectés, conflits signalés avec une solution.
          </Text>
        </View>

        <View style={[styles.panelCol, wide && { flex: 1 }]}>
          <View style={styles.panel} accessibilityLabel="Couverture du catalogue">
            <Text variant="monoSmall" color={colors.muted}>
              CATALOGUE · {all.length} DISCIPLINES
            </Text>
            <View style={styles.grid}>
              {counts.map(({ c, n }) => (
                <View key={c} style={styles.cell} accessible accessibilityLabel={`${n} ${coverageCount(c, n)}. ${COVERAGE[c].explain}`}>
                  <Text variant="display" color={c === "full" ? colors.accent : colors.fg}>
                    {n}
                  </Text>
                  <Text variant="label" color={COVERAGE[c].color}>
                    {coverageCount(c, n)}
                  </Text>
                  <Text variant="small" color={colors.muted}>
                    {COVERAGE[c].explain}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            <Button label="Créer un compte" onPress={() => router.push("/inscription")} />
            <Button kind="link" arrow label="J'ai déjà un compte" onPress={() => router.push("/connexion")} />
            <Button kind="secondary" label="Continuer sans compte" hint="Tes données restent sur cet appareil" onPress={startLocal} />
            {cloudAvailable ? null : (
              <Text variant="small" color={colors.muted}>
                Pour l'instant, ton compte et tes données sont enregistrés dans ce navigateur, sur cet appareil.
              </Text>
            )}
          </View>
        </View>
      </View>

      <Marquee items={coached} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  body: { gap: space.xxl, flexGrow: 1 },
  bodyWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xxxl, paddingTop: space.xxl },
  heroCol: { gap: space.lg, minWidth: 0 },
  lede: { maxWidth: 460 },
  panelCol: { gap: space.xl, minWidth: 0 },
  panel: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: colors.line },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  cell: { flexBasis: "45%", flexGrow: 1, gap: 2, minWidth: 130 },
  actions: { gap: space.md },
});
