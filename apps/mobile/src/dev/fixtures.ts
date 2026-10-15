/**
 * Jeux de données de développement (break-ui). Jamais utilisés hors __DEV__.
 * Le « pire cas » est réaliste : un vrai format d'e-mail long, un mot de passe
 * juste sous la limite, le message d'erreur le plus long de auth-rules.ts.
 */
export type DataMode = "demo" | "pire" | "vide";

export const AUTH_FIXTURES: Record<DataMode, { email: string; password: string; formError: string | null; submitOnMount: boolean }> = {
  demo: { email: "lea.martin@gmail.com", password: "", formError: null, submitOnMount: false },
  pire: {
    email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com",
    password: "Jo2024!",
    formError: "Confirme d'abord ton e-mail avec le lien reçu, puis reconnecte-toi.",
    submitOnMount: true,
  },
  vide: { email: "", password: "", formError: null, submitOnMount: true },
};

export const USER_FIXTURES: Record<DataMode, { email?: string; id: string }> = {
  demo: { email: "lea.martin@gmail.com", id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
  pire: { email: "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com", id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
  vide: { email: undefined, id: "3f2a9c1e-7b4d-4e8a-9c2f-1a6b5d8e0f47" },
};

export function readMode(v: string | string[] | undefined): DataMode | null {
  if (!__DEV__) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s === "demo" || s === "pire" || s === "vide" ? s : null;
}
