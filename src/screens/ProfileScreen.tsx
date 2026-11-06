import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSession } from "../session/SessionContext";
import { color, font, radius, space, shadow } from "../theme";
import HaloRing from "../components/HaloRing";
import { LogoutIcon } from "../components/icons";

export default function ProfileScreen() {
  const { session, logout } = useSession();
  const email = session?.email ?? "";
  const initial = email.charAt(0).toUpperCase() || "?";

  function confirmLogout() {
    Alert.alert("Log out", "You'll need to log back in to see your attempts and vault.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <LinearGradient colors={["#0a1b36", "#1d4ed8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <HaloRing percent={100} size={88} strokeWidth={5} label={initial} labelColor={color.white} />
        <Text style={styles.email}>{email}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Pressable style={styles.row} onPress={confirmLogout}>
          <LogoutIcon color={color.red} />
          <Text style={styles.rowTextDanger}>Log out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", paddingTop: 72, paddingBottom: 40, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  email: { fontFamily: font.bodyMedium, fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: space.md },
  body: { padding: space.xl },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.md,
    backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...shadow.soft,
  },
  rowTextDanger: { fontFamily: font.bodySemibold, fontSize: 15, color: color.red },
});
