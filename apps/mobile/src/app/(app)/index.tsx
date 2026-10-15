import { Platform, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { getDiscipline } from "@kynex/core";
import { useAuth } from "@/data/auth";
import { useProfile } from "@/data/profile";
import { Button } from "@/ui/Button";
import { COVERAGE } from "@/ui/coverage";
import { DAY_LABEL, formatMinutes, LEVEL_LABEL } from "@/ui/labels";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, disciplineColors, radius, space } from "@/ui/tokens";

/** Écran provisoire : le calendrier de la semaine (écran 3) le remplacera. */
export default function Home() {
  const { state, signOut } = useAuth();
  const { profile } = useProfile();
  const user = state.status === "signedIn" ? state.user : null;
  if (!profile) return null;
  return (
    <Screen maxWidth={640}>
      <View style={styles.top}>
        <Text variant="title">KYNEX</Text>
        <Text variant="monoSmall" color={colors.muted} numberOfLines={1} style={[styles.who, styles.breakAnywhere]}>
          {user?.email ?? "SANS COMPTE"}
        </Text>
      </View>

      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          Profil prêt
        </Text>
        <Text variant="body" color={colors.muted}>
          Prochaine étape : le calendrier de ta semaine, généré à partir de ce profil.
        </Text>
      </View>

      <View style={styles.card}>
        <Text variant="label" color={colors.muted}>
          Disciplines
        </Text>
        {profile.disciplines.map((d) => {
          const def = getDiscipline(d.disciplineId);
          return (
            <View key={d.disciplineId} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: disciplineColors[def.family] }]} />
              <Text variant="bodyStrong" style={styles.flex}>
                {def.name}
              </Text>
              <Text variant="small" color={colors.muted}>
                {LEVEL_LABEL[d.level]}
              </Text>
              <Text variant="label" color={COVERAGE[def.coverage].color}>
                {COVERAGE[def.coverage].label}
              </Text>
            </View>
          );
        })}
        <Text variant="label" color={colors.muted} style={styles.mt}>
          Disponibilités
        </Text>
        <Text variant="mono">{profile.availability.map((a) => `${DAY_LABEL[a.day].short} ${formatMinutes(a.maxMinutes)}`).join(" · ")}</Text>
      </View>

      <View style={styles.actions}>
        <Button kind="secondary" label="Modifier mon profil" onPress={() => router.push("/creation-profil")} />
        <Button kind="link" label="Se déconnecter" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md },
  who: { flexShrink: 1, textAlign: "right" },
  breakAnywhere: Platform.select({ web: { wordBreak: "break-all" } as object, default: {} }),
  head: { gap: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap", minHeight: 32 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1, minWidth: 140 },
  mt: { marginTop: space.md },
  actions: { gap: space.sm },
});
