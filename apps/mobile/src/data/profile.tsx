import "./local-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TrainingProfileSchema, type TrainingProfile } from "@kynex/core";
import { EMPTY_DRAFT, profileToDraft, reviveDraft, type ProfileDraft } from "@/features/onboarding/draft";

/**
 * Profil d'entraînement de l'utilisateur connecté, stocké sur l'appareil.
 * Le profil relu est revalidé par le schéma du socle : un profil corrompu
 * ou devenu invalide est ignoré (l'utilisateur repasse par la création).
 */
interface ProfileApi {
  ready: boolean;
  profile: TrainingProfile | null;
  draft: ProfileDraft;
  saveDraft(d: ProfileDraft): void;
  saveProfile(p: TrainingProfile, fromDraft: ProfileDraft): void;
}

const Ctx = createContext<ProfileApi | null>(null);
const profileKey = (uid: string) => `kynex.profile.${uid}`;
const draftKey = (uid: string) => `kynex.profileDraft.${uid}`;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage bloqué : l'état reste en mémoire pour cette session.
  }
}

export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<TrainingProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);

  useEffect(() => {
    const parsed = TrainingProfileSchema.safeParse(read(profileKey(userId)));
    const p = parsed.success && parsed.data.userId === userId ? parsed.data : null;
    setProfile(p);
    const storedDraft = read(draftKey(userId));
    // Sans brouillon (ex. compte démo), on repart du profil enregistré pour pouvoir le modifier.
    setDraft(storedDraft ? reviveDraft(storedDraft) : p ? profileToDraft(p) : EMPTY_DRAFT);
    setReady(true);
  }, [userId]);

  const saveDraft = useCallback(
    (d: ProfileDraft) => {
      setDraft(d);
      write(draftKey(userId), d);
    },
    [userId],
  );

  const saveProfile = useCallback(
    (p: TrainingProfile, fromDraft: ProfileDraft) => {
      setProfile(p);
      write(profileKey(userId), p);
      // Le brouillon est gardé : il sert à pré-remplir une future modification.
      setDraft(fromDraft);
      write(draftKey(userId), fromDraft);
    },
    [userId],
  );

  const api = useMemo(() => ({ ready, profile, draft, saveDraft, saveProfile }), [ready, profile, draft, saveDraft, saveProfile]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfile doit être utilisé dans <ProfileProvider>");
  return ctx;
}
