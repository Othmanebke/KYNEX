import { Platform, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/data/auth";
import { DataToggle } from "@/dev/DataToggle";
import { readMode, USER_FIXTURES } from "@/dev/fixtures";
import { Button } from "@/ui/Button";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { colors, space } from "@/ui/tokens";

/** Écran provisoire : sera remplacé par la création du profil (étape 2). */
export default function Home() {
  const { state, signOut } = useAuth();
  const devMode = readMode(useLocalSearchParams<{ data?: string }>().data);
  const real = state.status === "signedIn" ? state.user : null;
  const user = devMode ? { ...USER_FIXTURES[devMode], mode: "cloud" as const } : real;
  return (
    <>
      <Screen>
        <View style={styles.body}>
          <Text variant="display" accessibilityRole="header">
            Tu es connecté
          </Text>
          {user?.mode === "cloud" ? (
            <View style={styles.block}>
              <Text variant="label" color={colors.muted}>
                Compte en ligne
              </Text>
              <Text variant="bodyStrong" style={styles.breakAnywhere}>
                {user.email ?? "E-mail non renseigné"}
              </Text>
            </View>
          ) : (
            <Text variant="body" color={colors.muted}>
              Mode local : tes données restent sur cet appareil.
            </Text>
          )}
          <Text variant="monoSmall" color={colors.faint} selectable style={styles.breakAnywhere}>
            ID {user?.id}
          </Text>
          <Text variant="small" color={colors.muted}>
            Prochaine étape : création de ton profil d'entraînement.
          </Text>
        </View>
        <Button kind="secondary" label="Se déconnecter" onPress={() => void signOut()} />
      </Screen>
      <DataToggle />
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, flexGrow: 1 },
  block: { gap: space.xs },
  // Web : coupe un e-mail sans espace au lieu de déborder. Natif : RN coupe déjà les mots trop longs.
  breakAnywhere: Platform.select({ web: { wordBreak: "break-word" } as object, default: {} }),
});
