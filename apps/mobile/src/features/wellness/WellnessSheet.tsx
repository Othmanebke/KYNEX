import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { BODY_REGIONS, WEEKDAYS, type BodyRegion, type Weekday, type WellnessSignal } from "@kynex/core";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { DAY_LABEL, REGION_LABEL } from "@/ui/labels";
import { Segmented } from "@/ui/Segmented";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

/** Effet annoncé avant validation : l'utilisateur sait ce qui va changer. */
export function wellnessEffect(kind: WellnessSignal["kind"], severity: WellnessSignal["severity"], region?: BodyRegion): string {
  if (severity === "severe") return "Les séances du jour deviennent du repos, et les séances intenses du lendemain sont allégées.";
  if (kind === "pain")
    return region
      ? `Les séances du jour qui sollicitent : ${REGION_LABEL[region].toLowerCase()} sont remplacées par une mobilité douce qui épargne cette zone.`
      : "Les séances du jour qui sollicitent la zone douloureuse sont remplacées par une mobilité douce.";
  return "Les séances exigeantes du jour sont remplacées par une mobilité douce.";
}

export function WellnessSheet({
  visible,
  onClose,
  defaultDay,
  chooseDay = true,
  onApply,
  extra,
}: {
  visible: boolean;
  onClose: () => void;
  defaultDay: Weekday;
  chooseDay?: boolean;
  onApply: (signal: WellnessSignal) => void;
  extra?: React.ReactNode;
}) {
  const [day, setDay] = useState<Weekday>(defaultDay);
  const [kind, setKind] = useState<WellnessSignal["kind"]>("fatigue");
  const [severity, setSeverity] = useState<WellnessSignal["severity"]>("moderate");
  const [region, setRegion] = useState<BodyRegion | undefined>(undefined);

  return (
    <Sheet visible={visible} onClose={onClose} title="Fatigue ou douleur">
      <Text variant="body" color={colors.muted}>
        Signaler n'est jamais pénalisé : ta série de régularité est conservée et l'XP n'est pas retirée.
      </Text>

      {chooseDay ? (
        <View style={styles.section}>
          <Text variant="label" color={colors.muted}>
            Jour concerné
          </Text>
          <View style={styles.days}>
            {WEEKDAYS.map((d) => (
              <View key={d} style={styles.day}>
                <Chip role="radio" label={DAY_LABEL[d].short} a11yLabel={DAY_LABEL[d].long} selected={day === d} onToggle={() => setDay(d)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="label" color={colors.muted}>
          Ce que tu ressens
        </Text>
        <Segmented<WellnessSignal["kind"]>
          label="Type de signalement"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k === "fatigue") setRegion(undefined);
          }}
          options={[
            { value: "fatigue", label: "Fatigue" },
            { value: "pain", label: "Douleur" },
          ]}
        />
        <Segmented<WellnessSignal["severity"]>
          label="Intensité"
          value={severity}
          onChange={setSeverity}
          options={[
            { value: "moderate", label: "Modérée" },
            { value: "severe", label: "Importante" },
          ]}
        />
      </View>

      {kind === "pain" ? (
        <View style={styles.section}>
          <Text variant="label" color={colors.muted}>
            Zone (facultatif)
          </Text>
          <View style={styles.regions}>
            {BODY_REGIONS.map((r) => (
              <View key={r} style={styles.region}>
                <Chip role="radio" label={REGION_LABEL[r]} selected={region === r} onToggle={() => setRegion(region === r ? undefined : r)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.effect}>
        <Text variant="small">{wellnessEffect(kind, severity, region)}</Text>
      </View>

      {kind === "pain" && severity === "severe" ? (
        <Text variant="small" color={colors.warning}>
          Douleur vive, qui dure ou après une chute : demande l'avis d'un professionnel de santé avant de reprendre.
        </Text>
      ) : null}

      <Button
        label="Adapter ma semaine"
        onPress={() => {
          onApply({ day, kind, severity, ...(region ? { region } : {}) });
          onClose();
        }}
      />
      {extra}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  days: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  day: { flexBasis: 72, flexGrow: 1 },
  regions: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  region: { flexBasis: 140, flexGrow: 1 },
  effect: { backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: space.md },
});
