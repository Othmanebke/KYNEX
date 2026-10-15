import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { readMode, type DataMode } from "./fixtures";

const MODES: { id: DataMode; label: string }[] = [
  { id: "demo", label: "Démo" },
  { id: "pire", label: "Pire cas" },
  { id: "vide", label: "Vide" },
];

/** Sélecteur de jeu de données, en bas au centre. Développement uniquement. */
export function DataToggle() {
  const params = useLocalSearchParams<{ data?: string }>();
  const insets = useSafeAreaInsets();
  if (!__DEV__) return null;
  const current = readMode(params.data) ?? "demo";
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 8 }]}>
      <View style={styles.track}>
        {MODES.map((m) => (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityState={{ selected: current === m.id }}
            onPress={() => router.setParams({ data: m.id })}
            style={[styles.seg, current === m.id && styles.on]}
          >
            <Text style={[styles.txt, current === m.id && styles.txtOn]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  track: { flexDirection: "row", backgroundColor: "#d0d0d0", borderRadius: 10, padding: 3 },
  seg: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  on: { backgroundColor: "#ffffff" },
  txt: { fontSize: 12, color: "#333" },
  txtOn: { fontWeight: "600", color: "#000" },
});
