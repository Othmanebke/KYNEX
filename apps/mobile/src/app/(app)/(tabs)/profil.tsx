import { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import Animated, { cubicBezier } from "react-native-reanimated";
import { allAchievements, getDiscipline, levelFromXp, totalXp, weeklyStreak, xpByDiscipline, type Achievement } from "@kynex/core";
import { useAuth } from "@/data/auth";
import { useJournal } from "@/data/journal";
import { useProfile } from "@/data/profile";
import { useWeek } from "@/data/week";
import { allQuests, questRewards, type QuestProgress } from "@/features/profile/quests";
import { familyColor, Tag } from "@/features/week/components";
import { isoDate, todayWeekday } from "@/features/week/week";
import { Button } from "@/ui/Button";
import { COVERAGE } from "@/ui/coverage";
import { Icon, type IconName } from "@/ui/Icon";
import { DAY_LABEL, formatMinutes, LEVEL_LABEL } from "@/ui/labels";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
const BADGE_ICON: Record<string, IconName> = { spark: "zap", flame: "trending-up", calendar: "calendar", compass: "compass", arrow_up: "arrow-up", star: "star", moon: "moon", flag: "flag" };
const TIER: Record<Achievement["badge"]["tier"], { label: string; color: string }> = {
  bronze: { label: "Bronze", color: "#d69a5c" },
  silver: { label: "Argent", color: "#c9d1d3" },
  gold: { label: "Or", color: "#f2c94c" },
};

function XpBar({ progress, label }: { progress: number; label: string }) {
  return (
    <View style={styles.xpTrack} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      <Animated.View style={[styles.xpFill, { width: `${Math.max(2, progress * 100)}%`, transitionProperty: "width", transitionDuration: 400, transitionTimingFunction: EASE_OUT }]} />
    </View>
  );
}

function QuestRow({ p }: { p: QuestProgress }) {
  return (
    <View style={styles.quest} accessible accessibilityLabel={`${p.quest.title}. ${p.done ? "Terminée" : `${p.current} sur ${p.target}`}. ${p.quest.xp} XP`}>
      <Icon name={p.done ? "check-circle" : "circle"} size={20} color={p.done ? colors.accent : colors.faint} />
      <View style={styles.flex}>
        <Text variant="body" color={p.done ? colors.muted : colors.fg}>
          {p.quest.title}
        </Text>
        {p.target > 1 ? (
          <Text variant="monoSmall" color={colors.muted}>
            {p.current} / {p.target}
          </Text>
        ) : null}
      </View>
      <Text variant="mono" color={p.done ? colors.accent : colors.muted}>
        +{p.quest.xp}
      </Text>
    </View>
  );
}

export default function Profil() {
  const { state, signOut } = useAuth();
  const { profile } = useProfile();
  const week = useWeek();
  const j = useJournal();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const game = j.journal.game;
  const now = new Date();
  const today = isoDate(now);
  const weekStart = isoDate(week.monday);

  const xp = totalXp(game);
  const lvl = levelFromXp(xp);
  const streak = weeklyStreak(game.weeks);
  const perDiscipline = xpByDiscipline(game);
  const earned = new Set(game.achievements);
  const achievements = allAchievements().filter((a) => !a.disciplineId || earned.has(a.id) || profile?.disciplines.some((d) => d.disciplineId === a.disciplineId));

  const quests = useMemo(() => {
    if (!profile) return { daily: [], weekly: [] };
    const weekResults = j.journal.results.filter((r) => r.date >= weekStart);
    return allQuests({ schedule: week.schedule, weekResults, game, today, todayWeekday: todayWeekday(now) }, profile.wellness);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, j.journal, week.schedule, weekStart, today]);

  // Quêtes terminées : XP attribuée une seule fois (idempotent).
  useEffect(() => {
    const rewards = questRewards([...quests.daily, ...quests.weekly], game, weekStart, today);
    if (rewards.length) j.awardXp(rewards);
  }, [quests, game, weekStart, today, j]);

  const todayPlan = week.schedule.days.find((d) => d.day === todayWeekday(now));
  const restToday = todayPlan && todayPlan.sessions.length === 0;
  const checkedIn = game.events.some((e) => e.reason === "rest_day_check_in" && e.date === today);
  if (!profile) return null;

  const left = (
    <View style={styles.col}>
      <View style={styles.levelCard}>
        <View style={styles.levelHead}>
          <Text variant="hero" style={styles.level} accessibilityRole="header">
            Niveau {lvl.level}
          </Text>
          <Text variant="mono" color={colors.muted}>
            {xp.toLocaleString("fr-FR")} XP
          </Text>
        </View>
        <XpBar progress={lvl.progress} label={`Progression vers le niveau ${lvl.level + 1}`} />
        <Text variant="small" color={colors.muted}>
          {(lvl.next - xp).toLocaleString("fr-FR")} XP avant le niveau {lvl.level + 1}. L'XP récompense les séances faites et le respect du plan, jamais le dépassement.
        </Text>
      </View>

      <View style={styles.streak}>
        <Icon name="calendar" size={22} color={streak ? colors.accent : colors.faint} />
        <View style={styles.flex}>
          <Text variant="title">
            {streak} semaine{streak > 1 ? "s" : ""} régulière{streak > 1 ? "s" : ""}
          </Text>
          <Text variant="small" color={colors.muted}>
            Une semaine compte si tu réalises au moins 70 % de ton plan. Repos et semaines allégées pour raison de santé ne cassent pas la série.
          </Text>
        </View>
      </View>

      {restToday && !checkedIn ? (
        <View style={styles.card}>
          <Text variant="headline">Jour de repos</Text>
          <Text variant="small" color={colors.muted}>
            Note comment tu récupères : c'est récompensé, jamais exigé.
          </Text>
          <Button kind="secondary" label="Noter ma récupération (+10 XP)" onPress={() => j.restCheckIn(today)} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          Quêtes du jour
        </Text>
        {quests.daily.length ? quests.daily.map((p) => <QuestRow key={p.quest.id} p={p} />) : <Text variant="small" color={colors.muted}>Rien de prévu aujourd'hui.</Text>}
        <Text variant="label" color={colors.muted} accessibilityRole="header" style={styles.mt}>
          Quêtes de la semaine
        </Text>
        {quests.weekly.length ? quests.weekly.map((p) => <QuestRow key={p.quest.id} p={p} />) : <Text variant="small" color={colors.muted}>Pas de quête cette semaine.</Text>}
      </View>
    </View>
  );

  const right = (
    <View style={styles.col}>
      <View style={styles.card}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          Niveaux par discipline
        </Text>
        {profile.disciplines.map((d) => {
          const def = getDiscipline(d.disciplineId);
          const dx = perDiscipline[d.disciplineId] ?? 0;
          const dl = levelFromXp(dx);
          return (
            <View key={d.disciplineId} style={styles.disc}>
              <View style={styles.discHead}>
                <View style={[styles.dot, { backgroundColor: familyColor(def.id) }]} />
                <Text variant="bodyStrong" style={styles.flex}>
                  {def.name}
                </Text>
                <Tag label={COVERAGE[def.coverage].label} color={COVERAGE[def.coverage].color} />
              </View>
              <View style={styles.discRow}>
                <Text variant="monoSmall" color={colors.muted}>
                  NIV. {dl.level} · {dx} XP · déclaré {LEVEL_LABEL[d.level].toLowerCase()}
                </Text>
              </View>
              <XpBar progress={dl.progress} label={`${def.name} : niveau ${dl.level}`} />
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          Succès · {earned.size} / {achievements.length}
        </Text>
        <View style={styles.badges}>
          {achievements.map((a) => {
            const on = earned.has(a.id);
            const tier = TIER[a.badge.tier];
            return (
              <View key={a.id} style={[styles.badge, !on && styles.badgeOff]} accessible accessibilityLabel={`${a.title}, ${on ? "obtenu" : "à obtenir"}. ${a.description}`}>
                <View style={[styles.badgeIcon, { borderColor: on ? tier.color : colors.line }]}>
                  <Icon name={on ? (BADGE_ICON[a.badge.icon] ?? "award") : "lock"} size={18} color={on ? tier.color : colors.faint} />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" color={on ? colors.fg : colors.muted}>
                    {a.title}
                  </Text>
                  <Text variant="small" color={colors.muted}>
                    {a.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          Mon entraînement
        </Text>
        <Text variant="small" color={colors.muted}>
          {profile.availability.map((a) => `${DAY_LABEL[a.day].short} ${formatMinutes(a.maxMinutes)}`).join(" · ")}
        </Text>
        <Button kind="secondary" label="Modifier mon profil" onPress={() => router.push("/creation-profil")} />
        <Button kind="secondary" label="Recalculer ma semaine" hint="Annule tes déplacements et suppressions de cette semaine" onPress={week.reset} />
      </View>

      <View style={styles.card}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          Compte
        </Text>
        <Text variant="body" style={styles.breakAll}>
          {state.status === "signedIn" ? (state.user.email ?? "Sans compte") : ""}
        </Text>
        <Text variant="small" color={colors.muted}>
          {j.pendingSync
            ? `${j.pendingSync} enregistrement${j.pendingSync > 1 ? "s" : ""} gardé${j.pendingSync > 1 ? "s" : ""} sur cet appareil, en attente de synchronisation en ligne.`
            : "Tout est enregistré sur cet appareil."}
        </Text>
        <Button kind="link" label="Se déconnecter" onPress={() => void signOut()} />
      </View>
    </View>
  );

  return (
    <Screen maxWidth={wide ? 1200 : 640}>
      <Text variant="display" accessibilityRole="header">
        Profil
      </Text>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        {left}
        {right}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mt: { marginTop: space.md },
  breakAll: { flexShrink: 1 },
  layout: { gap: space.lg },
  layoutWide: { flexDirection: "row", alignItems: "flex-start", gap: space.xl },
  col: { flex: 1, minWidth: 0, gap: space.lg },
  levelCard: { gap: space.md, padding: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  levelHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, flexWrap: "wrap" },
  level: { fontSize: 56, lineHeight: 52 },
  xpTrack: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
  xpFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.accent },
  streak: { flexDirection: "row", gap: space.md, alignItems: "flex-start", padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  quest: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 44 },
  disc: { gap: space.xs, paddingVertical: space.xs },
  discHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  discRow: { flexDirection: "row" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badges: { gap: space.sm },
  badge: { flexDirection: "row", gap: space.md, alignItems: "center" },
  badgeOff: { opacity: 0.75 },
  badgeIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
