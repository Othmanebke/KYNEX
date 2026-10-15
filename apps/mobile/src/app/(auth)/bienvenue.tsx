import { useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import Animated, { Easing, FadeInDown } from "react-native-reanimated";
import { listDisciplines, moveSession, planWeek, type Suggestion, type WeeklySchedule } from "@kynex/core";
import { useAuth } from "@/data/auth";
import { demoProfile } from "@/data/demo";
import { PlannerDemo } from "@/features/landing/PlannerDemo";
import { ConflictCard, familyColor, Gauges } from "@/features/week/components";
import { sortConflicts, weekGauges } from "@/features/week/week";
import { Button } from "@/ui/Button";
import { COVERAGE, COVERAGE_ORDER, coverageCount } from "@/ui/coverage";
import { Icon, type IconName } from "@/ui/Icon";
import { Marquee } from "@/ui/Marquee";
import { PressScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const WORDS = [
  { w: "Mouvement.", accent: false },
  { w: "Discipline.", accent: true },
  { w: "Résultat.", accent: false },
];
type Anchor = "fonctionnement" | "fonctionnalites" | "demo" | "app";

/** Bouton de magasin d'applications : l'app n'est pas encore publiée, le bouton le dit. */
function StoreButton({ store }: { store: "App Store" | "Google Play" }) {
  return (
    <View style={styles.store} accessible accessibilityLabel={`${store} : bientôt disponible`} accessibilityState={{ disabled: true }}>
      <Icon name="smartphone" size={20} color={colors.muted} />
      <View>
        <Text variant="small" color={colors.muted}>
          Bientôt sur
        </Text>
        <Text variant="bodyStrong">{store}</Text>
      </View>
    </View>
  );
}

/** Aperçu produit : une vraie semaine calculée par le planificateur, avec un conflit réel à résoudre. */
function ProductPanel() {
  const profile = useMemo(demoProfile, []);
  const base = useMemo(() => planWeek(profile), [profile]);
  // Un déplacement réel qui provoque un conflit : on le montre, avec sa solution vérifiée.
  const conflicted = useMemo<WeeklySchedule>(() => {
    const target = base.days.flatMap((d) => d.sessions).find((s) => s.disciplineId === "strength_training" && s.day !== "fri");
    try {
      return target ? moveSession(base, target.id, "fri", profile) : base;
    } catch {
      return base;
    }
  }, [base, profile]);
  const [week, setWeek] = useState<WeeklySchedule>(conflicted);
  const conflict = sortConflicts(week.conflicts).find((c) => c.suggestions.some((s) => s.type === "move"));
  const apply = (s: Suggestion) =>
    setWeek((w) => {
      try {
        return s.type === "move" ? moveSession(w, s.sessionId, s.toDay, profile) : w;
      } catch {
        return w;
      }
    });

  return (
    <View style={styles.panel}>
      <Gauges g={weekGauges(week, profile)} />
      <View style={styles.panelList}>
        {week.days
          .filter((d) => d.sessions.length)
          .slice(0, 4)
          .map((d) => (
            <View key={d.day} style={styles.panelRow}>
              <View style={[styles.dot, { backgroundColor: familyColor(d.sessions[0]!.disciplineId) }]} />
              <Text variant="small" style={styles.flex} numberOfLines={1}>
                {d.sessions[0]!.plan.title}
              </Text>
              <Text variant="monoSmall" color={colors.muted}>
                {d.sessions[0]!.plan.estimatedMinutes} MIN
              </Text>
            </View>
          ))}
      </View>
      {conflict ? (
        <ConflictCard
          c={{ ...conflict, suggestions: conflict.suggestions.filter((s) => s.type === "move").slice(0, 1) }}
          schedule={week}
          index={0}
          onApply={() => {
            const s = conflict.suggestions.find((x) => x.type === "move");
            if (s) apply(s);
          }}
        />
      ) : (
        <View style={styles.resolved}>
          <Icon name="check-circle" size={18} color={colors.accent} />
          <Text variant="small">Semaine équilibrée : aucun conflit.</Text>
        </View>
      )}
    </View>
  );
}

function Feature({ icon, title, text, children, flip, wide }: { icon: IconName; title: string; text: string; children?: React.ReactNode; flip?: boolean; wide: boolean }) {
  return (
    <View style={[styles.feature, wide && styles.featureWide, wide && flip && styles.featureFlip]}>
      <View style={[styles.featureText, wide && styles.flex]}>
        <Icon name={icon} size={26} color={colors.accent} />
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="body" color={colors.muted} style={styles.measure}>
          {text}
        </Text>
      </View>
      {children ? <View style={[styles.featureArt, wide && styles.flex]}>{children}</View> : null}
    </View>
  );
}

export default function Landing() {
  const { startLocal, startDemo, cloudAvailable } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const scrollRef = useRef<ScrollView | null>(null);
  const anchors = useRef<Partial<Record<Anchor, number>>>({});
  const all = listDisciplines();
  const coached = all.filter((d) => d.coverage === "full").map((d) => d.name.toUpperCase());
  // « MOUVEMENT. » mesure ~4,7 fois la taille de police : il tient sur une ligne de 320 px au PC.
  const heroSize = wide ? 112 : Math.min(76, Math.floor((Math.min(width, 640) - 40) / 4.9));
  const go = (a: Anchor) => scrollRef.current?.scrollTo({ y: (anchors.current[a] ?? 0) - 16, animated: true });
  const mark = (a: Anchor) => (e: { nativeEvent: { layout: { y: number } } }) => {
    anchors.current[a] = e.nativeEvent.layout.y;
  };

  return (
    <Screen maxWidth={1200} scrollRef={scrollRef}>
      <View style={styles.nav}>
        <Text variant="title" accessibilityRole="header">
          KYNEX
        </Text>
        {wide ? (
          <View style={styles.navLinks}>
            {(
              [
                ["fonctionnement", "Fonctionnement"],
                ["fonctionnalites", "Fonctionnalités"],
                ["demo", "Démo"],
                ["app", "Application"],
              ] as const
            ).map(([a, label]) => (
              <PressScale key={a} accessibilityRole="link" accessibilityLabel={label} onPress={() => go(a)} style={styles.navLink}>
                <Text variant="small" color={colors.muted}>
                  {label}
                </Text>
              </PressScale>
            ))}
          </View>
        ) : null}
        <PressScale accessibilityRole="button" accessibilityLabel="Se connecter" onPress={() => router.push("/connexion")} style={styles.navLink}>
          <Text variant="bodyStrong">Se connecter</Text>
        </PressScale>
      </View>

      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={[styles.heroText, wide && { flex: 1.15 }]}>
          <View accessible accessibilityRole="header" accessibilityLabel="Mouvement. Discipline. Résultat.">
            {WORDS.map(({ w, accent }, i) => (
              <Animated.View key={w} entering={FadeInDown.duration(520).delay(80 + i * 90).easing(EASE_OUT)}>
                <Text variant="hero" color={accent ? colors.accent : colors.fg} maxFontSizeMultiplier={1} style={{ fontSize: heroSize, lineHeight: Math.round(heroSize * 0.92) }}>
                  {w}
                </Text>
              </Animated.View>
            ))}
          </View>
          <Text variant="body" color={colors.muted} style={[styles.lede, styles.measure]}>
            KYNEX construit ta semaine d'entraînement quand tu pratiques plusieurs sports : musculation, course, HIIT, street workout, mobilité. Charge répartie, repos respectés, conflits expliqués avec une solution.
          </Text>
          <View style={styles.ctaRow}>
            <View style={styles.cta}>
              <Button label="Créer mon compte" onPress={() => router.push("/inscription")} />
            </View>
            <View style={styles.cta}>
              <Button kind="secondary" label="Essayer la démo" hint="Compte fictif déjà rempli, effacé à la sortie" onPress={startDemo} />
            </View>
          </View>
          <Button kind="link" arrow label="Continuer sans compte" onPress={startLocal} />
          {cloudAvailable ? null : (
            <Text variant="small" color={colors.muted}>
              Pour l'instant, ton compte et tes données sont enregistrés dans ce navigateur, sur cet appareil.
            </Text>
          )}
        </View>
        <View style={[styles.heroArt, wide && { flex: 1 }]}>
          <ProductPanel />
          <Text variant="small" color={colors.faint}>
            Aperçu calculé en direct par le planificateur de KYNEX : applique la solution proposée.
          </Text>
        </View>
      </View>

      <Marquee items={coached} />

      <View onLayout={mark("fonctionnement")} style={styles.section}>
        <Text variant="display" accessibilityRole="header">
          Comment ça marche
        </Text>
        <View style={[styles.steps, wide && styles.stepsWide]}>
          {[
            ["Ton profil", "Tes sports, ton niveau, tes jours disponibles, ton matériel, tes contraintes. Deux minutes, une seule fois."],
            ["Ta semaine orchestrée", "Chaque sport garde ses propres règles ; KYNEX arbitre la semaine pour qu'ils ne se gênent pas."],
            ["La séance, en direct", "Étapes, minuteurs, saisie des séries. Ça marche hors connexion, et ça reprend où tu t'es arrêté."],
          ].map(([t, d], i) => (
            <View key={t} style={[styles.step, wide && styles.flex]}>
              <Text variant="display" color={colors.accent}>
                {i + 1}
              </Text>
              <Text variant="headline">{t}</Text>
              <Text variant="body" color={colors.muted}>
                {d}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View onLayout={mark("fonctionnalites")} style={styles.section}>
        <Text variant="display" accessibilityRole="header">
          Pensé pour plusieurs sports à la fois
        </Text>
        <Feature
          wide={wide}
          icon="git-merge"
          title="Des sports qui ne se gênent pas"
          text="Pas de fractionné le lendemain d'une séance lourde de jambes, un plafond de séances intenses, un budget de stress nerveux pour la semaine. Quand un conflit apparaît, KYNEX l'explique et propose des solutions déjà vérifiées."
        />
        <Feature
          wide={wide}
          icon="clock"
          title="Fait pour la salle"
          flip
          text="Grands chiffres lisibles à distance, minuteur de repos, saisie des répétitions, de la charge et de l'effort perçu. L'écran reste allumé ; rien ne se perd si tu fermes l'app."
        >
          <View style={styles.mock} accessible accessibilityLabel="Exemple d'écran de séance : repos, 1 minute 24 restante">
            <Text variant="label" color={colors.muted}>
              Repos
            </Text>
            <Text variant="hero" color={colors.accent} style={styles.mockTimer} maxFontSizeMultiplier={1}>
              1:24
            </Text>
            <Text variant="mono" color={colors.muted}>
              Ensuite · Développé couché barre · 6–10 reps · RPE 8
            </Text>
          </View>
        </Feature>
        <Feature
          wide={wide}
          icon="heart"
          title="La fatigue n'est pas un échec"
          text="Un bouton « fatigue ou douleur » remplace la séance du jour par de la mobilité douce ou du repos. Ta série de régularité est conservée : t'écouter n'est jamais pénalisé."
        />
        <Feature
          wide={wide}
          icon="wifi-off"
          title="Sans réseau, sans compromis"
          flip
          text="Au sous-sol de la salle ou au milieu d'un parc : tout est enregistré sur l'appareil, puis synchronisé quand la connexion revient."
        />
        <Feature
          wide={wide}
          icon="bar-chart-2"
          title="Des chiffres honnêtes"
          text="Une mesure absente reste absente, jamais un zéro inventé. Les charges sont prescrites en effort perçu tant que tu n'as pas d'historique. L'XP récompense la régularité et le respect du plan, pas le dépassement."
        />
      </View>

      <View style={styles.section}>
        <Text variant="display" accessibilityRole="header">
          Ce que KYNEX sait faire, sport par sport
        </Text>
        <Text variant="body" color={colors.muted} style={styles.measure}>
          {all.length} disciplines au catalogue. Seules celles marquées « Coachée » ont des séances générées par nos règles ; les autres sont présentées telles qu'elles sont.
        </Text>
        <View style={[styles.coverage, wide && styles.coverageWide]}>
          {COVERAGE_ORDER.map((c) => {
            const items = all.filter((d) => d.coverage === c);
            if (!items.length) return null;
            return (
              <View key={c} style={[styles.coverCol, wide && styles.flex]}>
                <Text variant="title" color={COVERAGE[c].color}>
                  {items.length} {coverageCount(c, items.length).toLowerCase()}
                </Text>
                <Text variant="small" color={colors.muted}>
                  {COVERAGE[c].explain}
                </Text>
                <Text variant="small">{items.map((d) => d.name).join(" · ")}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View onLayout={mark("demo")} style={styles.section}>
        <Text variant="display" accessibilityRole="header">
          Essaie le planificateur
        </Text>
        <Text variant="body" color={colors.muted} style={styles.measure}>
          Choisis tes sports et tes jours : la semaine se recalcule à chaque clic, avec le même moteur que dans l'app.
        </Text>
        <PlannerDemo compact={!wide} />
      </View>

      <View onLayout={mark("app")} style={[styles.appBand, wide && styles.appBandWide]}>
        <View style={[styles.flex, styles.appText]}>
          <Text variant="display" accessibilityRole="header">
            Dans ta poche, bientôt
          </Text>
          <Text variant="body" color={colors.muted} style={styles.measure}>
            KYNEX est d'abord une application mobile : c'est en séance qu'elle sert le plus. Les versions iPhone et Android sont en préparation, à partir du même code que la version web que tu peux utiliser aujourd'hui.
          </Text>
          <View style={styles.storeRow}>
            <StoreButton store="App Store" />
            <StoreButton store="Google Play" />
          </View>
        </View>
        <View style={[styles.appCta, wide && styles.flex]}>
          <Button label="Commencer dans le navigateur" arrow onPress={() => router.push("/inscription")} />
          <Button kind="secondary" label="Essayer la démo" onPress={startDemo} />
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.footerRow, wide && styles.footerRowWide]}>
          <Text variant="title">KYNEX</Text>
          <View style={styles.footerLinks}>
            <Button kind="link" label="Se connecter" onPress={() => router.push("/connexion")} />
            <Button kind="link" label="Créer un compte" onPress={() => router.push("/inscription")} />
            <Button kind="link" label="Démo" onPress={startDemo} />
          </View>
        </View>
        <Text variant="small" color={colors.faint} style={styles.measure}>
          Photos d'exercices : free-exercise-db, domaine public. Les fiches d'exercices sont en cours de relecture et ne remplacent pas l'avis d'un professionnel de santé ou d'un coach diplômé.
        </Text>
        <Text variant="small" color={colors.faint}>
          © {new Date().getFullYear()} KYNEX
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  measure: { maxWidth: 640 },
  nav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md },
  navLinks: { flexDirection: "row", gap: space.lg },
  navLink: { paddingHorizontal: space.sm },
  hero: { gap: space.xxl },
  heroWide: { flexDirection: "row", alignItems: "center", gap: space.xxxl, paddingVertical: space.xxl },
  heroText: { gap: space.lg, minWidth: 0 },
  heroArt: { gap: space.sm, minWidth: 0 },
  lede: { fontSize: 18, lineHeight: 27 },
  ctaRow: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  cta: { flexGrow: 1, minWidth: 200 },
  storeRow: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
  store: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, minHeight: 52, flexGrow: 1, minWidth: 160 },
  panel: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  panelList: { gap: space.xs },
  panelRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  resolved: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent },
  section: { gap: space.xl, paddingTop: space.xxxl },
  steps: { gap: space.xl },
  stepsWide: { flexDirection: "row", gap: space.xxl },
  step: { gap: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.line },
  feature: { gap: space.lg, paddingVertical: space.xl, borderTopWidth: 1, borderTopColor: colors.line },
  featureWide: { flexDirection: "row", alignItems: "center", gap: space.xxxl },
  featureFlip: { flexDirection: "row-reverse" },
  featureText: { gap: space.sm },
  featureArt: { minWidth: 0 },
  mock: { gap: space.xs, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  mockTimer: { fontSize: 96, lineHeight: 92 },
  coverage: { gap: space.xl },
  coverageWide: { flexDirection: "row", gap: space.xl },
  coverCol: { gap: space.sm, paddingTop: space.lg, borderTopWidth: 1, borderTopColor: colors.line },
  appBand: { gap: space.xl, marginTop: space.xxxl, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  appBandWide: { flexDirection: "row", alignItems: "center", padding: space.xxxl },
  appText: { gap: space.lg },
  appCta: { gap: space.md },
  footer: { gap: space.md, paddingTop: space.xxxl, paddingBottom: space.xl, borderTopWidth: 1, borderTopColor: colors.line, marginTop: space.xxxl },
  footerRow: { gap: space.md },
  footerRowWide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footerLinks: { flexDirection: "row", gap: space.lg, flexWrap: "wrap" },
});
