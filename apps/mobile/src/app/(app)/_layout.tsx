import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { useAuth } from "@/data/auth";
import { ProfileProvider, useProfile } from "@/data/profile";
import { JournalProvider } from "@/data/journal";
import { WeekProvider } from "@/data/week";
import { colors } from "@/ui/tokens";

function AppStack({ userId }: { userId: string }) {
  const { ready, profile } = useProfile();
  const reduced = useReducedMotion();
  if (!ready) return null;
  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduced ? "fade" : "default" }}>
      {/* Sans profil, seule la création est accessible : l'app y redirige automatiquement. */}
      <Stack.Protected guard={profile !== null}>
        <Stack.Screen name="index" />
        <Stack.Screen name="seance/[id]" />
        <Stack.Screen name="live/[id]" options={{ presentation: "fullScreenModal", gestureEnabled: false, animation: reduced ? "fade" : "slide_from_bottom" }} />
      </Stack.Protected>
      <Stack.Screen name="creation-profil" />
    </Stack>
  );
  // La semaine n'existe qu'une fois le profil créé.
  return profile ? (
    <WeekProvider userId={userId} profile={profile}>
      <JournalProvider userId={userId}>{stack}</JournalProvider>
    </WeekProvider>
  ) : (
    stack
  );
}

export default function AppLayout() {
  const { state } = useAuth();
  if (state.status !== "signedIn") return null;
  // `key` : changer d'utilisateur recharge entièrement son profil.
  return (
    <ProfileProvider key={state.user.id} userId={state.user.id}>
      <AppStack userId={state.user.id} />
    </ProfileProvider>
  );
}
