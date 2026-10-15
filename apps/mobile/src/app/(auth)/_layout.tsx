import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { colors } from "@/ui/tokens";

export const unstable_settings = { initialRouteName: "bienvenue" };

export default function AuthLayout() {
  const reduced = useReducedMotion();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduced ? "fade" : "default" }}>
      <Stack.Screen name="bienvenue" />
      <Stack.Screen name="connexion" />
      <Stack.Screen name="inscription" />
    </Stack>
  );
}
