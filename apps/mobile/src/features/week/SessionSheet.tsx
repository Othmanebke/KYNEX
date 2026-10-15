import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { getDiscipline, type ScheduledSession, type TrainingProfile, type Weekday, type WeeklySchedule } from "@kynex/core";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { COVERAGE } from "@/ui/coverage";
import { DAY_LABEL, formatMinutes } from "@/ui/labels";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";
import { familyColor } from "./components";
import { conflictsOf, frenchDays, INTENSITY_LABEL } from "./week";

export function SessionSheet({
  session,
  schedule,
  profile,
  onClose,
  onMove,
  onDowngrade,
  onRemove,
}: {
  session: ScheduledSession | null;
  schedule: WeeklySchedule;
  profile: TrainingProfile;
  onClose: () => void;
  onMove: (id: string, day: Weekday) => void;
  onDowngrade: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const close = () => {
    setPicking(false);
    onClose();
  };
  if (!session) return <Sheet visible={false} onClose={close} title="" children={null} />;

  const d = getDiscipline(session.disciplineId);
  const mine = conflictsOf(schedule.conflicts, session.id);
  const canLighten = session.plan.intensity !== "recovery";

  return (
    <Sheet visible onClose={close} title={session.plan.title}>
      <View style={styles.info}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: familyColor(d.id) }]} />
          <Text variant="bodyStrong" style={styles.flex}>
            {d.name}
          </Text>
          <Text variant="label" color={COVERAGE[d.coverage].color}>
            {COVERAGE[d.coverage].label}
          </Text>
        </View>
        <Text variant="mono" color={colors.muted}>
          {DAY_LABEL[session.day].long} · {formatMinutes(session.plan.estimatedMinutes)} · {INTENSITY_LABEL[session.plan.intensity]}
        </Text>
        {d.coverage === "beta" ? (
          <Text variant="small" color={colors.warning}>
            {COVERAGE.beta.explain}
          </Text>
        ) : null}
      </View>

      {session.substitution ? (
        <View style={styles.note}>
          <Text variant="small">
            Remplace « {session.substitution.replacedTitle} » : {session.substitution.reason}
          </Text>
        </View>
      ) : null}

      {mine.map((c, i) => (
        <View key={i} style={[styles.note, c.severity === "error" ? styles.noteError : null]}>
          <Text variant="small" color={c.severity === "error" ? colors.danger : colors.warning}>
            {frenchDays(c.message)}
          </Text>
        </View>
      ))}

      {session.plan.notes.map((n, i) => (
        <Text key={i} variant="small" color={colors.muted}>
          · {n}
        </Text>
      ))}

      {picking ? (
        <View style={styles.pick}>
          <Text variant="label" color={colors.muted}>
            Déplacer vers
          </Text>
          {schedule.days.map((day) => {
            const others = day.sessions.filter((s) => s.id !== session.id && !s.addOn);
            // « Repos préféré » seulement pour un jour déclaré disponible ; sinon « indisponible » prime.
            const rest = profile.preferredRestDays.includes(day.day) && profile.availability.some((a) => a.day === day.day);
            const detail = !day.available && !rest
              ? "Indisponible dans ton profil"
              : !day.available && rest && !others.length
                ? "Repos préféré"
                : others.length
                ? `Déjà : ${others.map((s) => s.plan.title).join(", ")}`
                : rest
                  ? `Repos préféré · ${formatMinutes(day.maxMinutes)} dispo.`
                  : `Libre · ${formatMinutes(day.maxMinutes)} dispo.`;
            const current = day.day === session.day;
            return (
              <Chip
                key={day.day}
                role="radio"
                label={current ? `${DAY_LABEL[day.day].long} (actuel)` : DAY_LABEL[day.day].long}
                selected={current}
                disabled={current}
                detail={
                  <Text variant="small" color={(!day.available && !rest) || others.length ? colors.warning : colors.muted}>
                    {detail}
                  </Text>
                }
                onToggle={() => {
                  setPicking(false);
                  onMove(session.id, day.day);
                  onClose();
                }}
              />
            );
          })}
          <Text variant="small" color={colors.muted}>
            Le déplacement est toujours permis : la séance est adaptée au temps du nouveau jour, et les conflits éventuels s'affichent avec leurs solutions.
          </Text>
          <Button kind="secondary" label="Retour" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button kind="secondary" label="Déplacer…" onPress={() => setPicking(true)} />
          {canLighten ? (
            <Button
              kind="secondary"
              label="Alléger"
              hint="Version moins intense et plus courte, choisie par les règles de la discipline"
              onPress={() => {
                onDowngrade(session.id);
                onClose();
              }}
            />
          ) : null}
          <Button
            kind="danger"
            label="Supprimer de la semaine"
            hint="Tu pourras annuler juste après"
            onPress={() => {
              onRemove(session.id);
              onClose();
            }}
          />
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  info: { gap: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  flex: { flex: 1, minWidth: 0 },
  note: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.md },
  noteError: { backgroundColor: colors.dangerBg },
  actions: { gap: space.sm, marginTop: space.sm },
  pick: { gap: space.sm },
});
