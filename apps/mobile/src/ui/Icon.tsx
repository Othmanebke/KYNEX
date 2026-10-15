import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { colors } from "./tokens";

export type IconName = ComponentProps<typeof Feather>["name"];

/**
 * Icônes Feather : un seul trait, une seule famille dans toute l'app.
 * Décoratives par défaut (masquées aux lecteurs d'écran) : le libellé du contrôle porte le sens.
 */
export function Icon({ name, size = 20, color = colors.fg }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} accessible={false} importantForAccessibility="no" aria-hidden />;
}
