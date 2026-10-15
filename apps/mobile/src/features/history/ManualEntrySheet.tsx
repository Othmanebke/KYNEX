import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { getDiscipline, type SessionResultInput } from "@kynex/core";
import { isoDate } from "@/features/week/week";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { COVERAGE } from "@/ui/coverage";
import { NumberField } from "@/ui/NumberField";
import { RpePicker } from "@/ui/RpePicker";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { colors, space } from "@/ui/tokens";
import { dayLabel } from "./history";

/**
 * Noter une séance faite sans l'app (ou d'une discipline en suivi seul).
 * Seul ce que l'utilisateur saisit est enregistré : aucun champ n'est pré-rempli.
 */
export function ManualEntrySheet({
  visible,
  onClose,
  disciplineIds,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  disciplineIds: string[];
  onSave: (input: Omit<SessionResultInput, "id" | "userId">) => void;
}) {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  const [date, setDate] = useState(days[0]!);
  const [minutes, setMinutes] = useState<number | undefined>();
  const [km, setKm] = useState<number | undefined>();
  const [effort, setEffort] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const model = disciplineId ? getDiscipline(disciplineId).metricModel : null;

  const reset = () => {
    setDisciplineId(null);
    setMinutes(undefined);
    setKm(undefined);
    setEffort(undefined);
    setError(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Noter une séance"
    >
      <View style={styles.section}>
        <Text variant="label" color={colors.muted}>
          Discipline
        </Text>
        {disciplineIds.map((id) => {
          const d = getDiscipline(id);
          return (
            <Chip
              key={id}
              role="radio"
              label={d.name}
              selected={disciplineId === id}
              onToggle={() => setDisciplineId(id)}
              detail={
                <Text variant="small" color={COVERAGE[d.coverage].color}>
                  {COVERAGE[d.coverage].label}
                </Text>
              }
            />
          );
        })}
      </View>

      <View style={styles.section}>
        <Text variant="label" color={colors.muted}>
          Jour
        </Text>
        <View style={styles.wrap}>
          {days.map((d) => (
            <View key={d} style={styles.day}>
              <Chip role="radio" label={dayLabel(d, now).split(" ").slice(0, 2).join(" ")} a11yLabel={dayLabel(d, now)} selected={date === d} onToggle={() => setDate(d)} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.row}>
        <NumberField label="Durée (facultatif)" unit="min" value={minutes} onChange={setMinutes} />
        {model === "endurance" ? <NumberField label="Distance (facultatif)" unit="km" decimal value={km} onChange={setKm} /> : null}
      </View>

      <Text variant="label" color={colors.muted}>
        Effort ressenti (facultatif)
      </Text>
      <RpePicker value={effort} onChange={setEffort} />

      {error ? (
        <Text variant="small" color={colors.danger} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Button
        label="Enregistrer"
        onPress={() => {
          if (!disciplineId) return setError("Choisis la discipline de cette séance.");
          if (km !== undefined && minutes === undefined) return setError("Pour enregistrer une distance, indique aussi la durée.");
          const durationSec = minutes ? Math.round(minutes * 60) : undefined;
          onSave({
            disciplineId,
            date,
            status: "completed",
            ...(durationSec ? { durationSec } : {}),
            ...(effort ? { perceivedEffort: effort } : {}),
            ...(model === "endurance" && durationSec ? { metrics: { model: "endurance", durationSec, ...(km ? { distanceM: Math.round(km * 1000) } : {}), source: "manual" } } : {}),
          });
          reset();
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  day: { flexBasis: 130, flexGrow: 1 },
  row: { flexDirection: "row", gap: space.md, flexWrap: "wrap" },
});
