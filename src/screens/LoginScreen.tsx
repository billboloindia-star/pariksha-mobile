import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Logo from "../components/Logo";
import { useSession } from "../session/SessionContext";
import { color, font, radius, space } from "../theme";

type Mode = "login" | "signup";

export default function LoginScreen() {
  const { login, signup } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={["#0a1b36", "#13308f", "#1d4ed8"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.wordmark}>
            <Logo size={40} />
            <Text style={styles.wordmarkText}>Pariksha</Text>
          </View>
          <Text style={styles.heroHeadline}>Your prep,{"\n"}wherever you log in.</Text>
          <Text style={styles.heroSub}>One account, any exam, every attempt.</Text>
        </LinearGradient>

        <View style={styles.form}>
          <View style={styles.tabs}>
            <Pressable style={[styles.tab, mode === "login" && styles.tabActive]} onPress={() => setMode("login")}>
              <Text style={[styles.tabText, mode === "login" && styles.tabTextActive]}>Log in</Text>
            </Pressable>
            <Pressable style={[styles.tab, mode === "signup" && styles.tabActive]} onPress={() => setMode("signup")}>
              <Text style={[styles.tabText, mode === "signup" && styles.tabTextActive]}>Sign up</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{mode === "login" ? "Welcome back" : "Create your account"}</Text>
          <Text style={styles.subtitle}>
            {mode === "login" ? "Log in to pick up right where you left off." : "Takes under a minute, and it's free."}
          </Text>

          <Text style={styles.fieldLabel}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={color.inkFaint}
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>PASSWORD</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === "login" ? "password" : "password-new"}
            placeholder={mode === "signup" ? "at least 8 characters" : ""}
            placeholderTextColor={color.inkFaint}
            style={styles.input}
            onSubmitEditing={submit}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.submitBtn, (busy || !email || !password) && { opacity: 0.5 }]}
            disabled={busy || !email || !password}
            onPress={submit}
          >
            <Text style={styles.submitBtnText}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</Text>
          </Pressable>

          <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")}>
            <Text style={styles.switchText}>
              {mode === "login" ? "New here? " : "Have an account? "}
              <Text style={styles.switchLink}>{mode === "login" ? "Create an account" : "Log in"}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 72, paddingBottom: 40, paddingHorizontal: space.xl },
  wordmark: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.xl },
  wordmarkText: { fontFamily: font.display, fontSize: 20, color: color.white },
  heroHeadline: { fontFamily: font.displayBlack, fontSize: 30, lineHeight: 36, color: color.white, marginBottom: space.sm },
  heroSub: { fontFamily: font.body, fontSize: 15, color: "rgba(255,255,255,0.75)" },
  form: { flex: 1, backgroundColor: color.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, marginTop: -radius.xl, padding: space.xl },
  tabs: { flexDirection: "row", backgroundColor: color.surfaceSunken, borderRadius: radius.pill, padding: 4, marginBottom: space.xl },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: color.royal },
  tabText: { fontFamily: font.bodySemibold, fontSize: 14, color: color.inkDim },
  tabTextActive: { color: color.white },
  title: { fontFamily: font.display, fontSize: 24, color: color.ink, marginBottom: 4 },
  subtitle: { fontFamily: font.body, fontSize: 14, color: color.inkDim, marginBottom: space.xl },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 11, letterSpacing: 0.6, color: color.inkFaint, marginBottom: 6 },
  input: {
    fontFamily: font.body, fontSize: 16, color: color.ink,
    borderWidth: 1, borderColor: color.surfaceSunken, backgroundColor: color.surfaceAlt,
    borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, marginBottom: space.lg,
  },
  error: { fontFamily: font.bodyMedium, fontSize: 13, color: color.red, marginBottom: space.md },
  submitBtn: { backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 15, alignItems: "center", marginTop: space.sm },
  submitBtnText: { fontFamily: font.bodySemibold, fontSize: 16, color: color.white },
  switchText: { fontFamily: font.body, fontSize: 13, color: color.inkDim, textAlign: "center", marginTop: space.lg },
  switchLink: { fontFamily: font.bodySemibold, color: color.royal },
});
