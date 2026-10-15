import { StyleSheet, View } from "react-native";
import Animated, { cubicBezier, Easing, FadeInDown } from "react-native-reanimated";
import { getDiscipline, type Conflict, type DayPlan, type ScheduledSession, type Weekday, type WeeklySchedule } from "@kynex/core";
import { Button } from "@/ui/Button";
import { COVERAGE } from "@/ui/coverage";
import { DAY_LABEL, formatMinutes } from "@/ui/labels";
import { PressScale } from "@/ui/Pressable";
import { Text } from "@/ui/Text";
import { colors, disciplineColors, radius, space } from "@/ui/tokens";
import { conflictsOf, frenchDays, INTENSITY_LABEL, suggestionLabel, type WeekGauges } from "./week";
import { Icon } from "@/ui/Icon";

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
export const familyColor = (disciplineId: string): string => disciplineColors[getDiscipline(disciplineId).family] ?? colors.muted;

/* ───────── Jauges (direction Instrument) ───────── */
function Gauge({ label, value, max, display, unit }: { label: string; value: number; max: number; display: string; unit?: string }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const over = value > max;
  return (
    <View style={styles.gauge} accessible accessibilityLabel={`${label} : ${display}${unit ? ` ${unit}` : ""}${over ? ", au-dessus du conseillé" : ""}`}>
      <Text variant="monoSmall" color={colors.muted}>
        {label.toUpperCase()}
      </Text>
      <Text variant="mono" color={over ? colors.warning : colors.fg}>
        {display}
      </Text>
      <View style={styles.bar}>
        <Animated.View
          style={[
            styles.barFill,
            { width: `${ratio * 100}%`, backgroundColor: over ? colors.warning : colors.accent, transitionProperty: "width", transitionDuration: 250, transitionTimingFunction: EASE_OUT },
          ]}
        />
      </View>
    </View>
  );
}

export function Gauges({ g }: { g: WeekGauges }) {
  return (
    <View style={styles.gauges}>
      <Gauge label="Intenses" value={g.intense} max={g.intenseMax} display={`${g.intense} / ${g.intenseMax}`} unit="séances, maximum conseillé" />
      <Gauge label="Stress nerveux" value={g.cns} max={g.cnsBudget} display={`${g.cns} / ${g.cnsBudget}`} unit="points, budget de la semaine" />
      <Gauge label="Volume" value={g.plannedMinutes} max={g.availableMinutes} display={formatMinutes(g.plannedMinutes)} unit={`prévues sur ${formatMinutes(g.availableMinutes)} disponibles`} />
    </View>
  );
}

/* ───────── Bandeau 7 jours ───────── */
export function DayStrip({ days, today, dates, onPick, restDays }: { days: DayPlan[]; today: Weekday | null; dates: Record<Weekday, Date>; onPick: (d: Weekday) => void; restDays: Weekday[] }) {
  return (
    <View style={styles.strip}>
      {days.map((d) => {
        const isToday = d.day === today;
        return (
          <PressScale
            key={d.day}
            accessibilityRole="button"
            accessibilityLabel={`${DAY_LABEL[d.day].long} ${dates[d.day].getDate()} : ${d.sessions.length ? `${d.sessions.length} séance${d.sessions.length > 1 ? "s" : ""}` : d.available || restDays.includes(d.day) ? "repos" : "indisponible"}`}
            onPress={() => onPick(d.day)}
            containerStyle={styles.stripSlot}
            style={[styles.stripCell, isToday && styles.stripToday]}
          >
            <Text variant="monoSmall" color={isToday ? colors.accent : colors.muted}>
              {DAY_LABEL[d.day].short.charAt(0)}
            </Text>
            <Text variant="bodyStrong" color={isToday ? colors.fg : colors.muted}>
              {dates[d.day].getDate()}
            </Text>
            <View style={styles.dots}>
              {d.sessions.length ? (
                d.sessions.map((s) => <View key={s.id} style={[styles.dot, { backgroundColor: familyColor(s.disciplineId) }]} />)
              ) : (
                <View style={[styles.dot, styles.dotEmpty]} />
              )}
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

/* ───────── Carte de séance ───────── */
export function SessionCard({ s, conflicts, onPress, onOptions }: { s: ScheduledSession; conflicts: Conflict[]; onPress: () => void; onOptions: () => void }) {
  const d = getDiscipline(s.disciplineId);
  const mine = conflictsOf(conflicts, s.id);
  const worst = mine.some((c) => c.severity === "error") ? "error" : mine.length ? "warning" : null;
  const color = familyColor(s.disciplineId);
  // Deux zones sœurs (jamais un bouton dans un bouton) : le corps ouvre le détail, « ⋯ » ouvre les actions.
  return (
    <View style={[styles.card, worst === "error" && styles.cardError, worst === "warning" && styles.cardWarn]}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${s.plan.title}, ${d.name}, ${formatMinutes(s.plan.estimatedMinutes)}, intensité ${INTENSITY_LABEL[s.plan.intensity].toLowerCase()}${worst ? `, ${mine.length} conflit${mine.length > 1 ? "s" : ""}` : ""}`}
        accessibilityHint="Ouvre le détail de la séance"
        onPress={onPress}
        onLongPress={onOptions}
        containerStyle={styles.flex}
        style={styles.cardBody}
      >
        <View style={styles.titleRow}>
          <View style={[styles.cardDot, { backgroundColor: color }]} />
          <Text variant="bodyStrong" style={styles.flex}>
            {s.plan.title}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text variant="monoSmall" color={colors.muted}>
            {formatMinutes(s.plan.estimatedMinutes).toUpperCase()} · {INTENSITY_LABEL[s.plan.intensity].toUpperCase()}
          </Text>
          {s.addOn ? <Tag label="Complément" color={colors.muted} /> : null}
          {d.coverage === "beta" ? <Tag label={COVERAGE.beta.label} color={COVERAGE.beta.color} /> : null}
          {s.substitution ? <Tag label="Remplacée" color={colors.warning} /> : null}
        </View>
        {worst ? (
          <View style={styles.inlineIcon}>
            <Icon name={worst === "error" ? "alert-triangle" : "alert-circle"} size={14} color={worst === "error" ? colors.danger : colors.warning} />
            <Text variant="small" color={worst === "error" ? colors.danger : colors.warning}>
              {worst === "error" ? "À corriger" : "À surveiller"} · {mine.length} conflit{mine.length > 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </PressScale>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`Options : ${s.plan.title}`}
        accessibilityHint="Déplacer, alléger ou supprimer"
        onPress={onOptions}
        style={styles.opt}
      >
        <Icon name="more-horizontal" size={18} color={colors.muted} />
      </PressScale>
    </View>
  );
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Text variant="label" color={color} style={styles.tagText}>
        {label}
      </Text>
    </View>
  );
}

/* ───────── Jour ───────── */
export function DayBlock({
  d,
  date,
  isToday,
  conflicts,
  onSession,
  onOptions,
  compact,
  restPreferred,
}: {
  onOptions: (s: ScheduledSession) => void;
  restPreferred: boolean;
  d: DayPlan;
  date: Date;
  isToday: boolean;
  conflicts: Conflict[];
  onSession: (s: ScheduledSession) => void;
  compact?: boolean;
}) {
  const status =
    d.sessions.length === 0 ? (d.available ? "Repos" : restPreferred ? "Repos préféré" : "Indisponible") : d.status === "active_recovery" ? "Récupération active" : `${formatMinutes(d.sessions.reduce((n, s) => n + s.plan.estimatedMinutes, 0))} prévues`;
  return (
    <View style={[styles.day, compact && styles.dayCompact]}>
      <View style={[styles.dayHead, compact && styles.dayHeadCompact]}>
        <Text variant="title" color={isToday ? colors.accent : colors.fg} accessibilityRole="header">
          {compact ? DAY_LABEL[d.day].short : DAY_LABEL[d.day].long} {date.getDate()}
        </Text>
        {isToday ? <Tag label="Aujourd'hui" color={colors.accent} /> : null}
        <Text variant="small" color={colors.muted} style={compact ? styles.dayStatusCompact : styles.dayStatus} numberOfLines={compact ? 1 : undefined}>
          {status}
          {d.available && !compact ? ` · ${formatMinutes(d.maxMinutes)} dispo.` : ""}
        </Text>
      </View>
      {d.sessions.length ? (
        <View style={styles.sessions}>
          {d.sessions.map((s) => (
            <SessionCard key={s.id} s={s} conflicts={conflicts} onPress={() => onSession(s)} onOptions={() => onOptions(s)} />
          ))}
        </View>
      ) : (
        <View style={styles.rest}>
          <Text variant="small" color={colors.faint}>
            {d.available ? "Pas de séance : récupération." : restPreferred ? "Jour de repos que tu as choisi." : "Tu n'as pas déclaré ce jour disponible."}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ───────── Conflit ───────── */
export function ConflictCard({ c, schedule, onApply, index }: { c: Conflict; schedule: WeeklySchedule; onApply: (i: number) => void; index: number }) {
  const error = c.severity === "error";
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(index * 40).easing(Easing.bezier(0.23, 1, 0.32, 1))} style={[styles.conflict, error ? styles.conflictError : styles.conflictWarn]}>
      <View style={styles.inlineIcon}>
        <Icon name={error ? "alert-triangle" : "alert-circle"} size={16} color={error ? colors.danger : colors.warning} />
        <Text variant="label" color={error ? colors.danger : colors.warning}>
          {error ? "À corriger" : "À surveiller"}
        </Text>
      </View>
      <Text variant="body">{frenchDays(c.message)}</Text>
      {c.suggestions.length ? (
        <View style={styles.sugs}>
          <Text variant="small" color={colors.muted}>
            Solutions vérifiées :
          </Text>
          {c.suggestions.slice(0, 3).map((sug, i) => (
            <Button key={i} kind="secondary" label={suggestionLabel(schedule, sug)} onPress={() => onApply(i)} />
          ))}
        </View>
      ) : (
        <Text variant="small" color={colors.muted}>
          Pas de correction automatique : ajuste ta semaine ou ton profil.
        </Text>
      )}
    </Animated.View>
  );
}

/* ───────── Barre « Annuler » ───────── */
export function UndoBar({ label, canUndo, onUndo, onDismiss }: { label: string; canUndo: boolean; onUndo: () => void; onDismiss: () => void }) {
  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.undo} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text variant="small" style={styles.flex} numberOfLines={2}>
        {label}
      </Text>
      {canUndo ? <Button kind="link" label="Annuler" onPress={onUndo} /> : null}
      <PressScale accessibilityRole="button" accessibilityLabel="Masquer" onPress={onDismiss} style={styles.undoClose}>
        <Icon name="x" size={18} color={colors.muted} />
      </PressScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inlineIcon: { flexDirection: "row", alignItems: "center", gap: space.xs },
  gauges: { flexDirection: "row", borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: "hidden" },
  gauge: { flex: 1, minWidth: 0, padding: space.md, gap: 4, borderRightWidth: 1, borderRightColor: colors.line },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.line, overflow: "hidden", marginTop: 2 },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2 },
  strip: { flexDirection: "row", gap: 4 },
  stripSlot: { flex: 1, minWidth: 0 },
  stripCell: { alignItems: "center", gap: 4, paddingVertical: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  stripToday: { borderColor: colors.accent },
  dots: { flexDirection: "row", gap: 3, minHeight: 8, flexWrap: "wrap", justifyContent: "center" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotEmpty: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.faint },
  card: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: "hidden", minHeight: 56 },
  cardError: { borderColor: colors.danger },
  cardWarn: { borderColor: colors.warning },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  opt: { width: 44, minHeight: 48, alignItems: "center", justifyContent: "flex-start", paddingTop: space.md },
  cardDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0, transform: [{ translateY: -1 }] },
  cardBody: { flex: 1, minWidth: 0, padding: space.md, gap: 4 },
  meta: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontSize: 10, lineHeight: 14 },
  day: { gap: space.sm },
  dayCompact: { flex: 1, minWidth: 0 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  dayStatus: { marginLeft: "auto" },
  // Colonnes (PC) : statut toujours sur sa propre ligne, en-têtes de même hauteur.
  dayHeadCompact: { minHeight: 64, alignContent: "flex-start" },
  dayStatusCompact: { width: "100%" },
  sessions: { gap: space.sm },
  rest: { borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, borderRadius: radius.md, padding: space.md },
  conflict: { borderRadius: radius.md, padding: space.lg, gap: space.sm, borderWidth: 1 },
  conflictError: { backgroundColor: colors.dangerBg, borderColor: colors.danger },
  conflictWarn: { backgroundColor: colors.warningBg, borderColor: colors.warning },
  sugs: { gap: space.sm, marginTop: space.xs },
  undo: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surfaceHigh, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingLeft: space.lg, paddingRight: space.xs },
  undoClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
