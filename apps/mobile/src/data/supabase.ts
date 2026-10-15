import "./local-storage";
import { AppState, Platform } from "react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Faux si `.env` est vide : l'app fonctionne alors en mode local. */
export const isSupabaseConfigured = url.length > 0 && key.length > 0;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === "web",
      },
    })
  : null;

// Le rafraîchissement du jeton ne tourne que lorsque l'app est au premier plan.
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
