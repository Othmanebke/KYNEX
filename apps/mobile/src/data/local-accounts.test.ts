import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLocalAccount, readAccounts, verifyLocalAccount, type KeyValue, type LocalAccountDeps } from "./local-accounts";

function deps(): LocalAccountDeps & { storage: KeyValue & { data: Map<string, string> } } {
  const data = new Map<string, string>();
  return {
    storage: { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) },
    sha256: async (s) => createHash("sha256").update(s).digest("hex"),
    randomId: () => randomUUID(),
  };
}

describe("comptes locaux", () => {
  it("crée un compte puis s'y connecte, e-mail insensible à la casse et aux espaces", async () => {
    const d = deps();
    const created = await createLocalAccount(d, "Lea.Martin@Gmail.com ", "motdepasse1");
    expect(created.ok).toBe(true);
    const ok = await verifyLocalAccount(d, " lea.martin@gmail.com", "motdepasse1");
    expect(ok.ok && created.ok && ok.account.id === created.account.id).toBe(true);
  });

  it("ne stocke jamais le mot de passe en clair", async () => {
    const d = deps();
    await createLocalAccount(d, "a@ex.fr", "secret-tres-long");
    expect([...d.storage.data.values()].join("")).not.toContain("secret-tres-long");
  });

  it("refuse un mauvais mot de passe et un compte inconnu avec le même message", async () => {
    const d = deps();
    await createLocalAccount(d, "a@ex.fr", "motdepasse1");
    const wrong = await verifyLocalAccount(d, "a@ex.fr", "motdepasse2");
    const unknown = await verifyLocalAccount(d, "b@ex.fr", "motdepasse1");
    expect(wrong).toEqual({ ok: false, message: "E-mail ou mot de passe incorrect." });
    expect(unknown).toEqual(wrong);
  });

  it("refuse un second compte avec le même e-mail", async () => {
    const d = deps();
    await createLocalAccount(d, "a@ex.fr", "motdepasse1");
    const again = await createLocalAccount(d, "A@EX.FR", "autre-mdp-1");
    expect(again.ok).toBe(false);
    expect(readAccounts(d.storage)).toHaveLength(1);
  });

  it("ignore un stockage corrompu au lieu de planter", () => {
    const d = deps();
    d.storage.setItem("kynex.localAccounts", "{pas du json");
    expect(readAccounts(d.storage)).toEqual([]);
  });
});
