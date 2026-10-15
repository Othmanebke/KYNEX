import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { BODY_REGIONS, ENVIRONMENTS, GOALS, getDiscipline, listDisciplines, WEEKDAYS, type Level } from "@kynex/core";
import { Chip } from "@/ui/Chip";
import { COVERAGE, COVERAGE_ORDER } from "@/ui/coverage";
import { DAY_LABEL, ENVIRONMENT_LABEL, EQUIPMENT_LABEL, formatMinutes, GOAL_LABEL, LEVEL_LABEL, PRIORITY_LABEL, REGION_LABEL } from "@/ui/labels";
import { Segmented } from "@/ui/Segmented";
import { Stepper } from "@/ui/Stepper";
import { Text } from "@/ui/Text";
import { colors, disciplineColors, radius, space } from "@/ui/tokens";
import {
  availableDays,
  clampMinutes,
  DEFAULT_MINUTES,
  DURATION_MAX,
  DURATION_MIN,
  DURATION_STEP,
  notCoached,
  SESSIONS_MAX,
  toggleDiscipline,
  toggleIn,
  type DraftDiscipline,
  type ProfileDraft,
} from "./draft";

export interface StepProps {
  draft: ProfileDraft;
  set: (d: ProfileDraft) => void;
}

/** Grille de puces : 1 colonne sur téléphone, 2 au-delà de 600 px. */
function Grid({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const two = width >= 600;
  return (
    <View style={styles.grid}>
      {(Array.isArray(children) ? children : [children]).map((c, i) => (
        <View key={i} style={two ? styles.half : styles.full}>
          {c}
        </View>
      ))}
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="label" color={colors.muted} accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="small" color={colors.muted}>
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const coveredLabel = (id: string) => {
  const c = getDiscipline(id).coverage;
  return (
    <Text variant="label" color={COVERAGE[c].color}>
      {COVERAGE[c].label}
    </Text>
  );
};

/* ───────── 1. Disciplines ───────── */
export function DisciplinesStep({ draft, set }: StepProps) {
  const all = listDisciplines();
  const selected = new Set(draft.disciplines.map((d) => d.disciplineId));
  return (
    <View style={styles.stack}>
      {COVERAGE_ORDER.map((c) => {
        const items = all.filter((d) => d.coverage === c);
        if (!items.length) return null;
        return (
          <Section key={c} title={COVERAGE[c].label} hint={COVERAGE[c].explain}>
            <Grid>
              {items.map((d) => (
                <Chip
                  key={d.id}
                  label={d.name}
                  dot={disciplineColors[d.family]}
                  selected={selected.has(d.id)}
                  accessibilityHint={COVERAGE[c].explain}
                  onToggle={() => set(toggleDiscipline(draft, d.id))}
                />
              ))}
            </Grid>
          </Section>
        );
      })}
    </View>
  );
}

/* ───────── 2. Niveau, priorité, fréquence ───────── */
export function LevelsStep({ draft, set }: StepProps) {
  const update = (id: string, patch: Partial<DraftDiscipline>) =>
    set({ ...draft, disciplines: draft.disciplines.map((x) => (x.disciplineId === id ? { ...x, ...patch } : x)) });
  const off = new Set(notCoached(draft));
  return (
    <View style={styles.stack}>
      {draft.disciplines.map((x) => {
        const d = getDiscipline(x.disciplineId);
        const coached = !off.has(x.disciplineId);
        return (
          <View key={x.disciplineId} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.dot, { backgroundColor: disciplineColors[d.family] }]} />
              <Text variant="headline" style={styles.flex} accessibilityRole="header">
                {d.name}
              </Text>
              {coveredLabel(d.id)}
            </View>
            <Segmented<Level>
              label={`Niveau en ${d.name}`}
              value={x.level}
              onChange={(level) => update(x.disciplineId, { level })}
              options={(["beginner", "intermediate", "advanced"] as const).map((v) => ({ value: v, label: LEVEL_LABEL[v] }))}
            />
            {coached ? (
              <>
                <Segmented<1 | 2 | 3>
                  label={`Priorité de ${d.name}`}
                  value={x.priority}
                  onChange={(priority) => update(x.disciplineId, { priority })}
                  options={([1, 2, 3] as const).map((v) => ({ value: v, label: PRIORITY_LABEL[v].label }))}
                />
                <View style={styles.inline}>
                  <Text variant="small" style={styles.flex}>
                    Séances par semaine
                  </Text>
                  <Stepper
                    label={`Séances par semaine en ${d.name}`}
                    value={x.sessionsPerWeek}
                    display={x.sessionsPerWeek === undefined ? "Auto" : `${x.sessionsPerWeek} / sem.`}
                    onDecrement={x.sessionsPerWeek === undefined ? undefined : () => update(x.disciplineId, { sessionsPerWeek: x.sessionsPerWeek === 1 ? undefined : (x.sessionsPerWeek ?? 1) - 1 })}
                    onIncrement={x.sessionsPerWeek === SESSIONS_MAX ? undefined : () => update(x.disciplineId, { sessionsPerWeek: (x.sessionsPerWeek ?? 0) + 1 })}
                  />
                </View>
                {x.sessionsPerWeek === undefined ? (
                  <Text variant="small" color={colors.muted}>
                    « Auto » : nombre déduit de la priorité, ajusté à tes jours libres.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text variant="small" color={colors.muted}>
                {COVERAGE[d.coverage].explain} Ton niveau sert seulement à ton suivi.
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ───────── 3. Objectifs ───────── */
export function GoalsStep({ draft, set }: StepProps) {
  return (
    <Grid>
      {GOALS.map((g) => (
        <Chip key={g} label={GOAL_LABEL[g]} selected={draft.goals.includes(g)} onToggle={() => set({ ...draft, goals: toggleIn(draft.goals, g) })} />
      ))}
    </Grid>
  );
}

/* ───────── 4. Lieux ───────── */
export function PlacesStep({ draft, set }: StepProps) {
  return (
    <Grid>
      {ENVIRONMENTS.map((e) => (
        <Chip key={e} label={ENVIRONMENT_LABEL[e]} selected={draft.environments.includes(e)} onToggle={() => set({ ...draft, environments: toggleIn(draft.environments, e) })} />
      ))}
    </Grid>
  );
}

/* ───────── 5. Matériel ───────── */
export function EquipmentStep({ draft, set }: StepProps) {
  const keys = Object.keys(EQUIPMENT_LABEL) as (keyof typeof EQUIPMENT_LABEL)[];
  const gym = draft.environments.includes("gym");
  return (
    <View style={styles.stack}>
      <Text variant="small" color={colors.muted}>
        Le poids du corps est toujours compté. Coche le matériel auquel tu as accès{gym ? ", salle comprise" : ""} : les exercices impossibles sans lui seront remplacés.
      </Text>
      <Grid>
        {keys.map((k) => (
          <Chip key={k} label={EQUIPMENT_LABEL[k]} selected={draft.equipment.includes(k)} onToggle={() => set({ ...draft, equipment: toggleIn(draft.equipment, k) })} />
        ))}
      </Grid>
    </View>
  );
}

/* ───────── 6. Semaine : disponibilités + repos ───────── */
export function WeekStep({ draft, set }: StepProps) {
  const { width } = useWindowDimensions();
  const narrow = width < 400; // jours abrégés pour laisser la place au réglage de durée
  const setDay = (day: (typeof WEEKDAYS)[number], minutes: number | undefined) => {
    const availability = { ...draft.availability };
    if (minutes === undefined) delete availability[day];
    else availability[day] = clampMinutes(minutes);
    set({ ...draft, availability });
  };
  const total = availableDays(draft).reduce((s, d) => s + (draft.availability[d] ?? 0), 0);
  return (
    <View style={styles.stack}>
      <Section title="Jours disponibles" hint="Coche un jour, puis règle le temps que tu peux y consacrer.">
        <View style={styles.list}>
          {WEEKDAYS.map((day) => {
            const min = draft.availability[day];
            const on = min !== undefined;
            return (
              <View key={day} style={styles.dayRow}>
                <View style={styles.flex}>
                  <Chip
                    label={narrow ? DAY_LABEL[day].short : DAY_LABEL[day].long}
                    a11yLabel={DAY_LABEL[day].long}
                    selected={on}
                    onToggle={() => setDay(day, on ? undefined : DEFAULT_MINUTES)}
                  />
                </View>
                {on ? (
                  <Stepper
                    label={`Durée le ${DAY_LABEL[day].long.toLowerCase()}`}
                    value={min}
                    display={formatMinutes(min)}
                    onDecrement={min <= DURATION_MIN ? undefined : () => setDay(day, min - (min > 60 ? 15 : DURATION_STEP))}
                    onIncrement={min >= DURATION_MAX ? undefined : () => setDay(day, min + (min >= 60 ? 15 : DURATION_STEP))}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <Text variant="monoSmall" color={colors.muted}>
          {availableDays(draft).length} JOUR{availableDays(draft).length > 1 ? "S" : ""} · {formatMinutes(total).toUpperCase()} AU TOTAL
        </Text>
      </Section>

      <Section title="Jours de repos préférés" hint="Facultatif. Le plan évitera ces jours si possible.">
        <View style={styles.wrap}>
          {WEEKDAYS.map((day) => (
            <View key={day} style={styles.dayChip}>
              <Chip
                label={DAY_LABEL[day].short}
                a11yLabel={`Repos le ${DAY_LABEL[day].long.toLowerCase()}`}
                selected={draft.preferredRestDays.includes(day)}
                onToggle={() => set({ ...draft, preferredRestDays: toggleIn(draft.preferredRestDays, day) })}
              />
            </View>
          ))}
        </View>
      </Section>
    </View>
  );
}

/* ───────── 7. Contraintes ───────── */
export function ConstraintsStep({ draft, set }: StepProps) {
  return (
    <View style={styles.stack}>
      <Chip
        label="Faible impact"
        selected={draft.lowImpact}
        onToggle={() => set({ ...draft, lowImpact: !draft.lowImpact })}
        detail={
          <Text variant="small" color={colors.muted}>
            Retire les exercices à fort impact (sauts, réceptions). Le HIIT passe en version sans sauts.
          </Text>
        }
      />
      <Section title="Zones douloureuses" hint="Les exercices qui sollicitent ces zones sont retirés de tes séances.">
        <Grid>
          {BODY_REGIONS.map((r) => (
            <Chip key={r} label={REGION_LABEL[r]} selected={draft.painRegions.includes(r)} onToggle={() => set({ ...draft, painRegions: toggleIn(draft.painRegions, r) })} />
          ))}
        </Grid>
      </Section>
      <View style={styles.note}>
        <Text variant="small" color={colors.fg}>
          KYNEX ne remplace pas un avis médical. En cas de douleur vive, persistante ou après une blessure, consulte un professionnel de santé avant de reprendre.
        </Text>
      </View>
    </View>
  );
}

/* ───────── 8. Récapitulatif ───────── */
export function RecapStep({ draft, onEdit }: StepProps & { onEdit: (step: number) => void }) {
  const off = notCoached(draft);
  const days = availableDays(draft);
  const rows: { title: string; value: string; step: number }[] = [
    {
      title: "Disciplines",
      value: draft.disciplines.map((x) => `${getDiscipline(x.disciplineId).name} · ${LEVEL_LABEL[x.level].toLowerCase()}${off.includes(x.disciplineId) ? "" : ` · ${PRIORITY_LABEL[x.priority].label.toLowerCase()}`}`).join("\n"),
      step: 1,
    },
    { title: "Objectifs", value: draft.goals.map((g) => GOAL_LABEL[g]).join(", "), step: 2 },
    { title: "Lieux", value: draft.environments.map((e) => ENVIRONMENT_LABEL[e]).join(", "), step: 3 },
    { title: "Matériel", value: draft.equipment.length ? draft.equipment.map((e) => EQUIPMENT_LABEL[e]).join(", ") : "Poids du corps uniquement", step: 4 },
    { title: "Disponibilités", value: days.map((d) => `${DAY_LABEL[d].short} ${formatMinutes(draft.availability[d] ?? 0)}`).join(" · "), step: 5 },
    { title: "Repos préférés", value: draft.preferredRestDays.length ? draft.preferredRestDays.map((d) => DAY_LABEL[d].long).join(", ") : "Aucun", step: 5 },
    {
      title: "Contraintes",
      value: [draft.lowImpact ? "Faible impact" : null, ...draft.painRegions.map((r) => `Douleur : ${REGION_LABEL[r].toLowerCase()}`)].filter(Boolean).join(", ") || "Aucune",
      step: 6,
    },
  ];
  return (
    <View style={styles.stack}>
      {off.length ? (
        <View style={styles.note}>
          <Text variant="small" color={colors.fg}>
            Ne seront pas programmées : {off.map((id) => getDiscipline(id).name).join(", ")}. Tu pourras y noter tes séances, sans plan généré.
          </Text>
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.title} style={styles.recapRow}>
          <View style={styles.flex}>
            <Text variant="label" color={colors.muted}>
              {r.title}
            </Text>
            <Text variant="body">{r.value}</Text>
          </View>
          <Text
            variant="small"
            color={colors.accent}
            accessibilityRole="button"
            accessibilityLabel={`Modifier : ${r.title}`}
            onPress={() => onEdit(r.step)}
            style={styles.edit}
          >
            Modifier
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xl },
  section: { gap: space.md },
  sectionHead: { gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  full: { width: "100%" },
  // Demi-colonne fixe : une dernière puce seule ne s'étire pas sur toute la largeur.
  half: { flexBasis: "48.5%", flexGrow: 0, minWidth: 0 },
  list: { gap: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  dayChip: { minWidth: 84, flexGrow: 1, flexBasis: 84 },
  dayRow: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: space.lg, gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  inline: { flexDirection: "row", alignItems: "center", gap: space.md, flexWrap: "wrap" },
  flex: { flex: 1, minWidth: 0 },
  note: { backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.lg },
  recapRow: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  edit: { paddingVertical: space.md, paddingHorizontal: space.sm, minHeight: 44 },
});
