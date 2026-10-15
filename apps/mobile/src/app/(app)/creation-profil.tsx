import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { cubicBezier, Easing, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/data/auth";
import { useProfile } from "@/data/profile";
import { DataToggle } from "@/dev/DataToggle";
import { PROFILE_FIXTURES, readMode } from "@/dev/fixtures";
import { buildProfile, STEPS, stepBlocker, type ProfileDraft } from "@/features/onboarding/draft";
import {
  ConstraintsStep,
  DisciplinesStep,
  EquipmentStep,
  GoalsStep,
  LevelsStep,
  PlacesStep,
  RecapStep,
  WeekStep,
} from "@/features/onboarding/Steps";
import { Button } from "@/ui/Button";
import { PressScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

const LEDE: Record<(typeof STEPS)[number]["id"], string> = {
  disciplines: "Choisis tout ce que tu pratiques. Chaque discipline indique honnêtement ce que l'app sait faire pour elle.",
  niveaux: "Ton niveau règle la difficulté ; la priorité décide quelles disciplines passent en premier quand la semaine est chargée.",
  objectifs: "Plusieurs choix possibles.",
  lieux: "Les séances ne proposeront que des exercices faisables là où tu vas.",
  materiel: "Facultatif.",
  semaine: "Le plan ne place jamais une séance plus longue que le temps disponible ce jour-là.",
  contraintes: "Facultatif. Tu pourras aussi signaler une fatigue ou une douleur au jour le jour.",
  recap: "Vérifie avant de générer ta première semaine.",
};

export default function CreationProfil() {
  const { state, signOut } = useAuth();
  const { draft: saved, saveDraft, saveProfile, profile } = useProfile();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const params = useLocalSearchParams<{ data?: string; etape?: string }>();
  const devMode = readMode(params.data);

  const [draft, setDraftState] = useState<ProfileDraft>(saved);
  const [step, setStep] = useState(() => {
    const n = Number(params.etape);
    return __DEV__ && n >= 1 && n <= STEPS.length ? n - 1 : 0;
  });
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Développement : jeu de données imposé par ?data=demo|pire|vide (&etape=N).
  useEffect(() => {
    if (devMode) setDraftState(PROFILE_FIXTURES[devMode]);
  }, [devMode]);
  useEffect(() => {
    const n = Number(params.etape);
    if (__DEV__ && n >= 1 && n <= STEPS.length) setStep(n - 1);
  }, [params.etape]);

  const set = (d: ProfileDraft) => {
    setDraftState(d);
    setError(null);
    if (!devMode) saveDraft(d); // brouillon conservé : on peut quitter et reprendre
  };

  const current = STEPS[step]!;
  const blocker = stepBlocker(current.id, draft);
  const last = step === STEPS.length - 1;

  const goTo = (i: number) => {
    setError(null);
    setStep(i);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const next = () => {
    if (blocker) {
      setError(blocker);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (!last) return goTo(step + 1);
    if (state.status !== "signedIn") return;
    const r = buildProfile(state.user.id, draft);
    if (!r.ok) {
      goTo(STEPS.findIndex((s) => s.id === r.step));
      setError(r.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveProfile(r.profile, draft);
    router.replace("/");
  };

  const props = { draft, set };
  const body = (() => {
    switch (current.id) {
      case "disciplines":
        return <DisciplinesStep {...props} />;
      case "niveaux":
        return <LevelsStep {...props} />;
      case "objectifs":
        return <GoalsStep {...props} />;
      case "lieux":
        return <PlacesStep {...props} />;
      case "materiel":
        return <EquipmentStep {...props} />;
      case "semaine":
        return <WeekStep {...props} />;
      case "contraintes":
        return <ConstraintsStep {...props} />;
      case "recap":
        return <RecapStep {...props} onEdit={goTo} />;
    }
  })();

  const footer = (
    <>
      {error ? (
        <Text variant="small" color={colors.danger} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {step > 0 ? (
          <View style={styles.back}>
            <Button kind="secondary" label="Retour" onPress={() => goTo(step - 1)} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <Button
            label={last ? (profile ? "Enregistrer mon profil" : "Créer mon profil") : "Continuer"}
            hint={blocker ?? undefined}
            onPress={next}
          />
        </View>
      </View>
    </>
  );

  return (
    <>
      <Screen maxWidth={wide ? 1080 : 620} footer={footer} scrollRef={scrollRef}>
        <View style={styles.top}>
          <Text variant="monoSmall" color={colors.muted}>
            ÉTAPE {step + 1} / {STEPS.length}
          </Text>
          {profile ? (
            <Button kind="link" label="Annuler" hint="Garde ton profil actuel" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
          ) : (
            // Avant le premier profil, l'onglet Profil n'existe pas encore : on peut quand même sortir.
            <Button kind="link" label={state.status === "signedIn" && state.user.mode === "demo" ? "Quitter la démo" : "Se déconnecter"} hint="Ton brouillon est conservé" onPress={() => void signOut()} />
          )}
        </View>
        <Progress value={(step + 1) / STEPS.length} />

        <View style={[styles.layout, wide && styles.layoutWide]}>
          {wide ? <StepList current={step} draft={draft} onPick={goTo} /> : null}
          <Animated.View key={current.id} entering={FadeIn.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1))} style={[styles.content, wide && styles.contentWide]}>
            <View style={styles.head}>
              <Text variant="display" accessibilityRole="header">
                {current.title}
              </Text>
              <Text variant="body" color={colors.muted}>
                {LEDE[current.id]}
              </Text>
            </View>
            {body}
          </Animated.View>
        </View>
      </Screen>
      <DataToggle />
    </>
  );
}

/** Barre de progression : remplissage absolu sans enfant → largeur animable sans relayout. */
function Progress({ value }: { value: number }) {
  return (
    <View
      style={styles.progress}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
    >
      <Animated.View
        style={[
          styles.progressFill,
          { width: `${value * 100}%`, transitionProperty: "width", transitionDuration: 250, transitionTimingFunction: EASE_OUT },
        ]}
      />
    </View>
  );
}

/** Sommaire latéral (PC / tablette) : on peut revenir à une étape déjà franchie. */
function StepList({ current, draft, onPick }: { current: number; draft: ProfileDraft; onPick: (i: number) => void }) {
  // Une étape est atteignable si toutes les précédentes sont valides.
  const firstBlocked = STEPS.findIndex((s) => stepBlocker(s.id, draft) !== null);
  const reachable = (i: number) => firstBlocked === -1 || i <= firstBlocked;
  return (
    <View style={styles.side} accessibilityRole="list">
      {STEPS.map((s, i) => {
        const on = i === current;
        const ok = reachable(i);
        return (
          <PressScale
            key={s.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: !ok }}
            accessibilityLabel={`Étape ${i + 1} : ${s.title}`}
            disabled={!ok}
            onPress={() => onPick(i)}
            style={[styles.sideItem, on && styles.sideItemOn]}
          >
            <Text variant="monoSmall" color={on ? colors.accent : colors.faint}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text variant="bodyStrong" color={on ? colors.fg : ok ? colors.muted : colors.faint}>
              {s.short}
            </Text>
          </PressScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 48 },
  progress: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden", marginTop: -space.md },
  progressFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.accent, borderRadius: 2 },
  layout: { gap: space.xl },
  layoutWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xxxl },
  side: { width: 200, gap: 2, paddingTop: space.sm },
  sideItem: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, borderRadius: radius.sm, minHeight: 44 },
  sideItemOn: { backgroundColor: colors.surface },
  content: { gap: space.xl, minWidth: 0 },
  contentWide: { flex: 1 },
  head: { gap: space.sm },
  actions: { flexDirection: "row", gap: space.sm },
  back: { flexBasis: 120 },
  flex: { flex: 1 },
});
