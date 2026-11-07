import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, TextInput, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import * as api from "../../shared/api";
import { useSession } from "../session/SessionContext";
import { color, font, radius, space, shadow } from "../theme";
import { LogoutIcon } from "../components/icons";

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12 || /[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || (/[A-Z]/.test(pw) && /[a-z]/.test(pw))) score++;
  const labels = ["Too short", "Weak", "Good — add a symbol to make it strong", "Strong"];
  const s = Math.min(3, score) as 0 | 1 | 2 | 3;
  return { score: s, label: labels[s] };
}

const STRENGTH_COLOR = [color.red, color.red, color.amber, color.green];

export default function ProfileScreen() {
  const { session, logout, updateSession } = useSession();
  const email = session?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  const [name, setName] = useState(session?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const strength = passwordStrength(newPassword);
  const displayName = session?.name || email.split("@")[0];

  function confirmLogout() {
    Alert.alert("Log out", "You'll need to log back in to see your attempts and vault.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  }

  async function saveName() {
    const trimmed = name.trim();
    setSavingName(true);
    try {
      const updated = await api.updateProfile(trimmed);
      updateSession({ name: updated.name ?? null });
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : "Try again.");
    } finally {
      setSavingName(false);
    }
  }

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? "image/jpeg";
    setAvatarUploading(true);
    try {
      const updated = await api.uploadAvatar(asset.base64!, mimeType);
      updateSession({ avatarUrl: updated.avatarUrl ?? null });
    } catch (err) {
      Alert.alert("Couldn't upload", err instanceof Error ? err.message : "Try again.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      Alert.alert("Too short", "New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Doesn't match", "New password and confirmation don't match.");
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Done", "Your password has been updated.");
    } catch (err) {
      Alert.alert("Couldn't update password", err instanceof Error ? err.message : "Try again.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <LinearGradient colors={["#0a1b36", "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.avatarWrap}>
            {session?.avatarUrl ? (
              <Image source={{ uri: session.avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
            )}
            <Pressable style={styles.camBtn} onPress={pickAvatar} disabled={avatarUploading}>
              {avatarUploading ? <ActivityIndicator size="small" color={color.royal} /> : <Text style={{ fontSize: 12 }}>📷</Text>}
            </Pressable>
          </View>
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.email}>{email}</Text>
          {session?.plan === "premium" && (
            <View style={styles.planChip}><Text style={styles.planChipText}>⭐ Premium plan</Text></View>
          )}
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.card}>
            <Text style={styles.cardHead}>Profile details</Text>
            <Text style={styles.hint}>This name shows across the app — on your attempts and AI reviews.</Text>
            <Text style={styles.fieldLabel}>DISPLAY NAME</Text>
            <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Add your name" />
            <Pressable
              style={[styles.saveBtn, (savingName || name.trim() === (session?.name ?? "")) && { opacity: 0.5 }]}
              disabled={savingName || name.trim() === (session?.name ?? "")}
              onPress={saveName}
            >
              <Text style={styles.saveBtnText}>{savingName ? "Saving…" : "Save changes"}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardHead}>Change password</Text>
            <Text style={styles.hint}>Choose a strong password you don't use anywhere else.</Text>

            <Text style={styles.fieldLabel}>CURRENT PASSWORD</Text>
            <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry style={styles.input} placeholder="••••••••" />

            <Text style={styles.fieldLabel}>NEW PASSWORD</Text>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} placeholder="At least 8 characters" />
            {newPassword && (
              <>
                <View style={styles.strengthRow}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={[styles.strengthSeg, i < strength.score && { backgroundColor: STRENGTH_COLOR[strength.score] }]} />
                  ))}
                </View>
                <Text style={styles.strengthLabel}>{strength.label}</Text>
              </>
            )}

            <Text style={styles.fieldLabel}>CONFIRM NEW PASSWORD</Text>
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry style={styles.input} placeholder="Repeat password" />

            <Pressable
              style={[styles.saveBtn, (pwSaving || !currentPassword || !newPassword || !confirmPassword) && { opacity: 0.5 }]}
              disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
              onPress={savePassword}
            >
              <Text style={styles.saveBtnText}>{pwSaving ? "Updating…" : "Update password"}</Text>
            </Pressable>
          </View>

          <Pressable style={styles.row} onPress={confirmLogout}>
            <LogoutIcon color={color.red} />
            <Text style={styles.rowTextDanger}>Log out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 72, paddingBottom: 28, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  avatarWrap: { position: "relative" },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 2, borderColor: "rgba(255,255,255,0.4)", alignItems: "center", justifyContent: "center" },
  avatarImg: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: "rgba(255,255,255,0.4)" },
  avatarText: { fontFamily: font.displayBlack, fontSize: 28, color: color.white },
  camBtn: { position: "absolute", bottom: -2, right: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: color.white, alignItems: "center", justifyContent: "center", ...shadow.soft },
  heroName: { fontFamily: font.displayBlack, fontSize: 18, color: color.white, marginTop: space.md },
  email: { fontFamily: font.bodyMedium, fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  planChip: { backgroundColor: "rgba(255,214,120,0.22)", borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5, marginTop: 10 },
  planChipText: { fontFamily: font.bodySemibold, fontSize: 11.5, color: "#ffe9b8" },

  body: { padding: space.xl },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg, ...shadow.soft },
  cardHead: { fontFamily: font.displaySemibold, fontSize: 15, color: color.ink, marginBottom: 3 },
  hint: { fontFamily: font.body, fontSize: 12, color: color.inkDim, marginBottom: space.md, lineHeight: 17 },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 10.5, letterSpacing: 0.4, color: color.inkFaint, marginBottom: 6, marginTop: space.sm, textTransform: "uppercase" },
  input: {
    fontFamily: font.body, fontSize: 14, color: color.ink, borderWidth: 1.5, borderColor: color.surfaceSunken,
    backgroundColor: color.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10,
  },
  strengthRow: { flexDirection: "row", gap: 4, marginTop: 8 },
  strengthSeg: { height: 4, flex: 1, borderRadius: 2, backgroundColor: color.surfaceSunken },
  strengthLabel: { fontFamily: font.body, fontSize: 10.5, color: color.inkFaint, marginTop: 5 },
  saveBtn: { backgroundColor: color.royal, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center", marginTop: space.lg },
  saveBtnText: { fontFamily: font.bodySemibold, fontSize: 13.5, color: color.white },

  row: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...shadow.soft,
  },
  rowTextDanger: { fontFamily: font.bodySemibold, fontSize: 15, color: color.red },
});
