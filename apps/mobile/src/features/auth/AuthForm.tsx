import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { EMAIL_MAX, fieldErrors, PASSWORD_MIN, SignInSchema, SignUpSchema, type FieldErrors } from "@/data/auth-rules";
import { useAuth } from "@/data/auth";
import { AUTH_FIXTURES, readMode } from "@/dev/fixtures";
import { DataToggle } from "@/dev/DataToggle";
import { Button } from "@/ui/Button";
import { PressScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { TextField } from "@/ui/TextField";
import { colors, radius, space } from "@/ui/tokens";
import { Icon } from "@/ui/Icon";

type Mode = "signIn" | "signUp";

const COPY: Record<Mode, { title: string; submit: string; switchLabel: string; switchTo: "/inscription" | "/connexion" }> = {
  signIn: { title: "Connexion", submit: "Se connecter", switchLabel: "Pas encore de compte ? Créer un compte", switchTo: "/inscription" },
  signUp: { title: "Créer un compte", submit: "Créer mon compte", switchLabel: "Déjà un compte ? Se connecter", switchTo: "/connexion" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const { signIn, signUp, cloudAvailable } = useAuth();
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  // Développement : jeu de données imposé par ?data=demo|pire|vide (&etat=confirmation).
  const params = useLocalSearchParams<{ data?: string; etat?: string }>();
  const devMode = readMode(params.data);
  useEffect(() => {
    if (!devMode) return;
    const f = AUTH_FIXTURES[devMode];
    setEmail(f.email);
    setPassword(f.password);
    setFormError(f.formError);
    setSentTo(params.etat === "confirmation" ? f.email || "toi@exemple.fr" : null);
    const parsed = (mode === "signIn" ? SignInSchema : SignUpSchema).safeParse({ email: f.email, password: f.password });
    setErrors(f.submitOnMount && !parsed.success ? fieldErrors(parsed.error) : {});
  }, [devMode, params.etat, mode]);

  async function submit() {
    setFormError(null);
    const parsed = (mode === "signIn" ? SignInSchema : SignUpSchema).safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setErrors({});
    setBusy(true);
    const res = mode === "signIn" ? await signIn(parsed.data.email, parsed.data.password) : await signUp(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (!res.ok) {
      setFormError(res.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (res.needsConfirmation) setSentTo(parsed.data.email);
    // Sinon la session s'ouvre : la garde de navigation bascule seule vers l'app.
  }

  if (sentTo) {
    return (
    <>
      <Screen>
        <BackLink />
        <View style={styles.head}>
          <Text variant="display" accessibilityRole="header">
            Vérifie ta boîte mail
          </Text>
          <Text variant="body" color={colors.muted}>
            Un lien de confirmation a été envoyé à <Text variant="bodyStrong">{sentTo}</Text>. Ouvre-le sur ce téléphone, puis connecte-toi.
          </Text>
        </View>
        <Button label="Aller à la connexion" onPress={() => router.replace("/connexion")} />
      </Screen>
      <DataToggle />
    </>
    );
  }

  return (
    <>
    <Screen>
      <BackLink />
      <View style={styles.head}>
        <Text variant="display" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="body" color={colors.muted}>
          {cloudAvailable
            ? mode === "signUp"
              ? "Ton compte sauvegarde ton profil et tes séances en ligne, pour les retrouver sur un autre appareil."
              : "Retrouve ton profil et tes séances."
            : "Compte enregistré dans ce navigateur, sur cet appareil uniquement. La synchronisation en ligne viendra plus tard."}
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="E-mail"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
          }}
          error={errors.email}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType={mode === "signUp" ? "username" : "emailAddress"}
          inputMode="email"
          maxLength={EMAIL_MAX}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
          editable={!busy}
          placeholder="toi@exemple.fr"
        />
        <TextField
          ref={passwordRef}
          label="Mot de passe"
          secret
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          error={errors.password}
          help={mode === "signUp" ? `Au moins ${PASSWORD_MIN} caractères.` : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          textContentType={mode === "signUp" ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={submit}
          editable={!busy}
        />
        {formError ? (
          <View style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Text variant="small" color={colors.danger}>
              {formError}
            </Text>
          </View>
        ) : null}
        <Button label={copy.submit} onPress={submit} loading={busy} />
      </View>

      <Button kind="link" arrow label={copy.switchLabel} onPress={() => router.replace(copy.switchTo)} />
    </Screen>
    <DataToggle />
    </>
  );
}

function BackLink() {
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel="Retour"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/bienvenue"))}
      style={styles.back}
    >
      <View style={styles.backRow}>
        <Icon name="arrow-left" size={18} color={colors.muted} />
        <Text variant="bodyStrong" color={colors.muted}>
          Retour
        </Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.md },
  form: { gap: space.lg },
  formError: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: space.md },
  back: { alignSelf: "flex-start", minWidth: 48 },
  backRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
});
