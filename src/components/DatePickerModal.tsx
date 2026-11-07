import { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { color, font, radius, space } from "../theme";

interface Props {
  visible: boolean;
  /** ISO date "2026-12-19", or "" for no selection. */
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Self-contained calendar modal - no native date-picker dependency, ported
 * from the web app's DatePicker.tsx pure date math (adding a native module
 * mid-feature risks a broken dev build, as happened once already this
 * session with expo-image-picker). */
export default function DatePickerModal({ visible, value, onChange, onClose }: Props) {
  const selected = parseIso(value);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  const today = new Date(new Date().setHours(0, 0, 0, 0));

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const firstOfMonth = new Date(y, m, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const daysInPrevMonth = new Date(y, m, 0).getDate();

  const cells: { day: number; monthDelta: -1 | 0 | 1; date: Date }[] = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, monthDelta: -1, date: new Date(y, m - 1, daysInPrevMonth - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, monthDelta: 0, date: new Date(y, m, d) });
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    cells.push({ day: next.getDate(), monthDelta: 1, date: next });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Pressable style={styles.navBtn} onPress={() => setViewMonth(new Date(y, m - 1, 1))}>
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.headLabel}>{viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
            <Pressable style={styles.navBtn} onPress={() => setViewMonth(new Date(y, m + 1, 1))}>
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
          </View>

          <View style={styles.grid}>
            {cells.map((c, i) => {
              const disabled = c.date < today;
              const isSelected = selected ? isSameDay(c.date, selected) : false;
              const isToday = isSameDay(c.date, today);
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  style={[
                    styles.cell,
                    isSelected && styles.cellSelected,
                    isToday && !isSelected && styles.cellToday,
                  ]}
                  onPress={() => { onChange(toIso(c.date)); onClose(); }}
                >
                  <Text style={[
                    styles.cellText,
                    c.monthDelta !== 0 && styles.cellTextOutside,
                    disabled && styles.cellTextDisabled,
                    isSelected && styles.cellTextSelected,
                  ]}>
                    {c.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.foot}>
            <Pressable onPress={() => { onChange(""); onClose(); }}>
              <Text style={styles.footBtn}>Clear</Text>
            </Pressable>
            <Pressable onPress={() => { const t = new Date(); setViewMonth(t); onChange(toIso(t)); onClose(); }}>
              <Text style={[styles.footBtn, styles.footBtnPrimary]}>Today</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(4,10,20,0.6)", alignItems: "center", justifyContent: "center", padding: space.lg },
  sheet: { width: "100%", maxWidth: 360, backgroundColor: color.consolePanel, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: color.consoleLine },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  navBtn: { width: 30, height: 30, borderRadius: radius.sm, backgroundColor: color.consolePanel2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.consoleLine2 },
  navArrow: { color: color.white, fontSize: 18, fontFamily: font.bodyBold },
  headLabel: { color: color.white, fontFamily: font.bodySemibold, fontSize: 14 },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { width: CELL, textAlign: "center", color: color.consoleText2, fontFamily: font.bodySemibold, fontSize: 11 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: CELL, height: CELL, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  cellSelected: { backgroundColor: color.royal },
  cellToday: { borderWidth: 1.5, borderColor: color.sky },
  cellText: { color: color.white, fontFamily: font.bodyMedium, fontSize: 13 },
  cellTextOutside: { color: color.consoleText2, opacity: 0.5 },
  cellTextDisabled: { color: color.consoleLine2 },
  cellTextSelected: { color: color.white, fontFamily: font.bodyBold },
  foot: { flexDirection: "row", justifyContent: "space-between", marginTop: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: color.consoleLine },
  footBtn: { color: color.consoleText, fontFamily: font.bodySemibold, fontSize: 13, padding: 6 },
  footBtnPrimary: { color: color.sky },
});
