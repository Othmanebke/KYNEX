import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useAuth } from "@/data/auth";
import { ProfileProvider, useProfile } from "@/data/profile";
import { colors } from "@/ui/tokens";

function AppStack() {
  const { ready, profile } = useProfile();
  const reduced = useReducedMotion();
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduced ? "fade" : "default" }}>
      {/* Sans profil, seule la création est accessible : l'app y redirige automatiquement. */}
      <Stack.Protected guard={profile !== null}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Screen name="creation-profil" />
    </Stack>
  );
}

export default function AppLayout() {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  // `key` : changer d'utilisateur recharge entièrement son profil.
  return (
    <ProfileProvider key={state.user.id} userId={state.user.id}>
      <AppStack />
    </ProfileProvider>
  );
}
