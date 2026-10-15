import { z } from "zod";

/** Règles pures (sans React) : testables et partagées par les deux formulaires. */
export const PASSWORD_MIN = 8;

/** 254 caractères : longueur maximale d'une adresse e-mail (RFC 5321). */
export const EMAIL_MAX = 254;

export const EmailSchema = z
  .string()
  .trim()
  .min(1, "Saisis ton e-mail.")
  .max(EMAIL_MAX, `${EMAIL_MAX} caractères au maximum.`)
  .pipe(z.email("Cet e-mail n'a pas un format valide."));

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, "Saisis ton mot de passe."),
});

export const SignUpSchema = z.object({
  email: EmailSchema,
  password: z.string().min(PASSWORD_MIN, `Au moins ${PASSWORD_MIN} caractères.`).max(72, "72 caractères au maximum."),
});

export type FieldErrors = Partial<Record<"email" | "password", string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const k = issue.path[0];
    if ((k === "email" || k === "password") && !out[k]) out[k] = issue.message;
  }
  return out;
}

/** Traduit une erreur Supabase Auth en phrase française qui dit quoi faire. */
export function authErrorMessage(err: { message?: string; code?: string; status?: number } | null | undefined): string {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "E-mail ou mot de passe incorrect.";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return "Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "Confirme d'abord ton e-mail avec le lien reçu, puis reconnecte-toi.";
  if (code === "weak_password" || msg.includes("password should")) return "Mot de passe trop faible : allonge-le ou mélange lettres et chiffres.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || err?.status === 429) return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (msg.includes("network") || msg.includes("fetch")) return "Pas de connexion au serveur. Vérifie ton réseau et réessaie.";
  return "La connexion a échoué. Réessaie dans un instant.";
}
