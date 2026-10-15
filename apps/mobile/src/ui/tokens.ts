/**
 * Jetons de design KYNEX — direction « Club » (maquette) × « Instrument ».
 * Le vert-jaune est réservé à l'action principale et à l'état actif ;
 * le texte reste clair ou gris. Contrastes sur `bg` vérifiés AA
 * (fg 17:1, muted 6,2:1, accent 16:1).
 */
export const colors = {
  bg: "#0b0f12",
  surface: "#141a1e",
  surfaceHigh: "#1b2227",
  line: "#242c32",
  fg: "#f2f4ef",
  muted: "#97a09a",
  faint: "#5d6762",
  accent: "#d4ff3a",
  onAccent: "#0b0f12",
  warning: "#ffb547",
  warningBg: "#2a2214",
  danger: "#ff7a68",
  dangerBg: "#2c1614",
} as const;

/** Une couleur par famille de discipline (direction Instrument). */
export const disciplineColors: Record<string, string> = {
  strength: "#d4ff3a",
  bodyweight: "#7ee0b5",
  endurance: "#5ac8fa",
  conditioning: "#ff7a59",
  mind_body: "#b39dff",
  combat: "#ff9fb3",
  team: "#ffd166",
  other: "#97a09a",
};

export const fonts = {
  display: "BarlowCondensed_800ExtraBold",
  displayBold: "BarlowCondensed_700Bold",
  body: "Archivo_400Regular",
  bodyMedium: "Archivo_500Medium",
  bodySemi: "Archivo_600SemiBold",
  bodyBold: "Archivo_700Bold",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

/** Zone tactile minimale (Apple 44 pt, Android 48 dp → on prend 48). */
export const HIT = 48;
