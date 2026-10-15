import { describe, expect, it } from "vitest";
import { authErrorMessage, EMAIL_MAX, fieldErrors, SignInSchema, SignUpSchema } from "./auth-rules";

describe("formulaires d'authentification", () => {
  it("refuse un e-mail vide ou mal formé, avec un message par champ", () => {
    const r = SignUpSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ email: "Saisis ton e-mail.", password: "Au moins 8 caractères." });
    const bad = SignInSchema.safeParse({ email: "lea@", password: "x" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error).email).toBe("Cet e-mail n'a pas un format valide.");
  });

  it("accepte un e-mail long réaliste et retire les espaces autour", () => {
    const r = SignInSchema.safeParse({ email: "  aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com ", password: "x" });
    expect(r.success && r.data.email).toBe("aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com");
  });

  it("borne l'e-mail à 254 caractères et le mot de passe entre 8 et 72", () => {
    const longEmail = `${"a".repeat(EMAIL_MAX - "@ex.fr".length + 1)}@ex.fr`;
    expect(SignInSchema.safeParse({ email: longEmail, password: "x" }).success).toBe(false);
    expect(SignUpSchema.safeParse({ email: "a@ex.fr", password: "1234567" }).success).toBe(false);
    expect(SignUpSchema.safeParse({ email: "a@ex.fr", password: "12345678" }).success).toBe(true);
    expect(SignUpSchema.safeParse({ email: "a@ex.fr", password: "x".repeat(73) }).success).toBe(false);
  });

  it("traduit les erreurs Supabase en français, avec un repli générique", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("E-mail ou mot de passe incorrect.");
    expect(authErrorMessage({ message: "User already registered" })).toMatch(/existe déjà/);
    expect(authErrorMessage({ status: 429 })).toMatch(/Trop de tentatives/);
    expect(authErrorMessage({ message: "TypeError: Network request failed" })).toMatch(/Pas de connexion/);
    expect(authErrorMessage(null)).toBe("La connexion a échoué. Réessaie dans un instant.");
  });
});
