import { Tabs } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { Icon, type IconName } from "@/ui/Icon";
import { colors, fonts } from "@/ui/tokens";

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Semaine", icon: "calendar" },
  { name: "historique", title: "Historique", icon: "bar-chart-2" },
  { name: "profil", title: "Profil", icon: "user" },
];

/**
 * Onglets : en bas sur téléphone, colonne à gauche sur PC / tablette large.
 * Pas d'animation entre onglets : ce sont des pairs, pas une hiérarchie.
 */
export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const side = width >= 900;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        tabBarPosition: side ? "left" : "bottom",
        tabBarVariant: side ? "material" : "uikit",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          borderRightColor: colors.line,
          ...(side ? { width: 200, paddingTop: 72, borderRightWidth: 1 } : {}),
        },
        tabBarLabelPosition: side ? "beside-icon" : "below-icon",
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color, size }) => (
              <View>
                <Icon name={t.icon} size={Math.min(size, 22)} color={String(color)} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
