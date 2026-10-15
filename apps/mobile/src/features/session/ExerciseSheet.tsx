import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { findExercise, type Exercise } from "@kynex/core";
import { exerciseImages, MEDIA_LICENSE, MEDIA_SOURCE } from "@/data/exercise-media";
import { Icon } from "@/ui/Icon";
import { equipmentLabel, LEVEL_LABEL, MUSCLE_LABEL } from "@/ui/labels";
import { PressScale } from "@/ui/Pressable";
import { Sheet } from "@/ui/Sheet";
import { Text } from "@/ui/Text";
import { colors, radius, space } from "@/ui/tokens";

/** Statut éditorial dit tel quel : jamais « validé par un coach » si ce n'est pas le cas. */
export function reviewLabel(ex: Exercise): string {
  switch (ex.review.status) {
    case "draft":
      return "Fiche en brouillon : consignes rédigées par KYNEX, pas encore relues par un professionnel.";
    case "internal_review":
      return "Fiche en cours de relecture, pas encore validée par un professionnel.";
    case "expert_validated":
      return ex.review.reviewer ? `Fiche relue et validée par ${ex.review.reviewer}.` : "Fiche relue par un professionnel.";
  }
}

function Photo({ uri, label }: { uri: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.photo} accessible accessibilityRole="image" accessibilityLabel={label}>
      {failed ? (
        <View style={styles.photoFail}>
          <Icon name="image" size={20} color={colors.faint} />
          <Text variant="small" color={colors.muted} style={styles.center}>
            Photo indisponible hors connexion
          </Text>
        </View>
      ) : (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="disk" onError={() => setFailed(true)} />
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" color={colors.muted} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function ExerciseSheet({ exerciseId, onClose, onOpen }: { exerciseId: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const ex = exerciseId ? findExercise(exerciseId) : undefined;
  if (!ex) return <Sheet visible={false} onClose={onClose} title="" children={null} />;
  const imgs = exerciseImages(ex.id);
  const related = [
    { title: "Plus facile", ids: ex.easier },
    { title: "Plus difficile", ids: ex.harder },
    { title: "Alternatives", ids: ex.alternatives },
  ].filter((r) => r.ids.some((id) => findExercise(id)));

  return (
    <Sheet visible onClose={onClose} title={ex.name}>
      {imgs.length ? (
        <View style={styles.photos}>
          <View style={styles.photoRow}>
            {imgs.slice(0, 2).map((a, i) => (
              <Photo key={a.uri} uri={a.uri} label={`${ex.name}, position ${i + 1} sur ${Math.min(2, imgs.length)}`} />
            ))}
          </View>
          <Text variant="small" color={colors.muted}>
            Photos : {MEDIA_SOURCE}, {MEDIA_LICENSE}.
          </Text>
        </View>
      ) : null}

      <Text variant="mono" color={colors.muted}>
        {LEVEL_LABEL[ex.level]} · {ex.highImpact ? "fort impact" : "sans impact fort"}
      </Text>

      <Section title="Exécution">
        {ex.instructions.map((s, i) => (
          <View key={i} style={styles.step}>
            <Text variant="mono" color={colors.accent} style={styles.stepNum}>
              {i + 1}
            </Text>
            <Text variant="body" style={styles.flex}>
              {s}
            </Text>
          </View>
        ))}
      </Section>

      {ex.precautions.length ? (
        <View style={styles.caution}>
          <Icon name="alert-triangle" size={16} color={colors.warning} />
          <View style={styles.flex}>
            {ex.precautions.map((p, i) => (
              <Text key={i} variant="small">
                {p}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {ex.muscles.length ? (
        <Section title="Muscles">
          <Text variant="body">{ex.muscles.map((m) => MUSCLE_LABEL[m]).join(", ")}</Text>
        </Section>
      ) : null}

      <Section title="Matériel">
        <Text variant="body">
          {ex.equipmentOptions
            .map((set) => (set.length ? set.map(equipmentLabel).join(" + ") : "Aucun"))
            .join(" ou ")}
        </Text>
      </Section>

      {related.map((r) => (
        <Section key={r.title} title={r.title}>
          <View style={styles.links}>
            {r.ids
              .map((id) => findExercise(id))
              .filter((x): x is Exercise => !!x)
              .map((x) => (
                <PressScale key={x.id} accessibilityRole="button" accessibilityLabel={`Voir la fiche : ${x.name}`} onPress={() => onOpen(x.id)} style={styles.link}>
                  <Text variant="bodyStrong">{x.name}</Text>
                  <Icon name="chevron-right" size={18} color={colors.muted} />
                </PressScale>
              ))}
          </View>
        </Section>
      ))}

      <Text variant="small" color={colors.muted}>
        {reviewLabel(ex)}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  photos: { gap: space.xs },
  photoRow: { flexDirection: "row", gap: space.sm },
  photo: { flex: 1, aspectRatio: 1, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceHigh },
  photoFail: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.xs, padding: space.sm },
  section: { gap: space.xs },
  step: { flexDirection: "row", gap: space.md, alignItems: "baseline" },
  stepNum: { width: 16 },
  caution: { flexDirection: "row", gap: space.sm, backgroundColor: colors.warningBg, borderRadius: radius.md, padding: space.md, alignItems: "flex-start" },
  links: { gap: space.xs },
  link: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.line },
});
