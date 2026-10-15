import { Stack } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";
import { colors } from "@/ui/tokens";

export default function AppLayout() {
  const reduced = useReducedMotion();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: reduced ? "fade" : "default" }} />;
}
