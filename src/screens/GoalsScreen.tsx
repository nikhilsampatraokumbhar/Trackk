import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Modal,
} from 'react-native';
import { useGoals } from '../store/GoalsContext';
import { formatCurrency, COLORS } from '../utils/helpers';

// ── helpers ──────────────────────────────────────────────────────────────────

function daysInCurrentMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function monthsUntil(deadlineMonth: number): number {
  return Math.max(1, Math.round((deadlineMonth - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
}

// ── sub-components ────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;

  let grade = 'C';
  let color = COLORS.warning;
  if (streak >= 30) { grade = 'S'; color = '#FFD700'; }
  else if (streak >= 14) { grade = 'A'; color = COLORS.success; }
  else if (streak >= 7) { grade = 'B'; color = COLORS.primary; }

  return (
    <View style={[styles.streakBadge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.streakGrade, { color }]}>{grade}</Text>
      <Text style={[styles.streakNumber, { color }]}>{streak}</Text>
      <Text style={[styles.streakLabel, { color }]}>day streak</Text>
    </View>
  );
}

function BudgetBar({
  spent,
  budget,
  label,
}: {
  spent: number;
  budget: number;
  label: string;
}) {
  const pct = budget > 0 ? Math.min(1, spent / budget) : 0;
  const over = spent > budget;
  const barColor = over ? COLORS.danger : pct > 0.8 ? COLORS.warning : COLORS.success;

  return (
    <View style={styles.barContainer}>
      <View style={styles.barLabels}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={[styles.barValue, { color: over ? COLORS.danger : COLORS.text }]}>
          {formatCurrency(spent)} / {formatCurrency(budget)}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, pct * 100)}%`, backgroundColor: barColor }]} />
      </View>
      {over && (
        <Text style={styles.overBudgetText}>
          {formatCurrency(spent - budget)} over budget today
        </Text>
      )}
    </View>
  );
}

// ── Profile setup modal ───────────────────────────────────────────────────────

function ProfileModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { profile, saveProfile } = useGoals();
  const [salary, setSalary] = useState(String(profile?.salary || ''));
  const [emi, setEmi] = useState(String(profile?.emiTotal || ''));
  const [fixed, setFixed] = useState(String(profile?.fixedExpenses || ''));
  const [maintenance, setMaintenance] = useState(String(profile?.maintenanceAvg || ''));
  const [misc, setMisc] = useState(String(profile?.miscAvg || ''));

  const handleSave = async () => {
    const s = parseFloat(salary);
    const e = parseFloat(emi) || 0;
    const f = parseFloat(fixed) || 0;
    const m = parseFloat(maintenance) || 0;
    const mi = parseFloat(misc) || 0;

    if (!s || s <= 0) {
      Alert.alert('Error', 'Please enter your monthly salary');
      return;
    }
    await saveProfile({ salary: s, emiTotal: e, fixedExpenses: f, maintenanceAvg: m, miscAvg: mi });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
        <Text style={styles.modalTitle}>Your Monthly Finances</Text>
        <Text style={styles.modalSubtitle}>
          This helps us calculate how much you can spend daily to hit your savings goal.
        </Text>

        {[
          { label: 'Monthly Take-Home Salary (₹)', value: salary, setter: setSalary },
          { label: 'Total EMIs per Month (₹)', value: emi, setter: setEmi },
          { label: 'Fixed Expenses — Rent, Groceries (₹)', value: fixed, setter: setFixed },
          { label: 'Maintenance — Bike/Car avg (₹)', value: maintenance, setter: setMaintenance },
          { label: 'Miscellaneous Average (₹)', value: misc, setter: setMisc },
        ].map(({ label, value, setter }) => (
          <View key={label} style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setter}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.textLight}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Save Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ── Goal setup modal ──────────────────────────────────────────────────────────

function GoalModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { createGoal, profile } = useGoals();
  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [deadlineMonthOffset, setDeadlineMonthOffset] = useState(''); // months from now

  const handleCreate = async () => {
    if (!profile) {
      Alert.alert('Set up profile first', 'Please fill in your monthly finances before creating a goal.');
      return;
    }
    if (!goalName.trim() || !targetAmount || !deadlineMonthOffset) {
      Alert.alert('Missing info', 'Please fill in all fields');
      return;
    }
    const months = parseInt(deadlineMonthOffset, 10);
    if (isNaN(months) || months < 1) {
      Alert.alert('Invalid', 'Enter months as a whole number (e.g. 10)');
      return;
    }
    const deadline = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    const goal = await createGoal(goalName.trim(), parseFloat(targetAmount), deadline);
    if (goal) {
      setGoalName('');
      setTargetAmount('');
      setDeadlineMonthOffset('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={styles.modalContainer} contentContainerStyle={styles.modalContent}>
        <Text style={styles.modalTitle}>Set a Savings Goal</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Goal Name</Text>
          <TextInput
            style={styles.input}
            value={goalName}
            onChangeText={setGoalName}
            placeholder="e.g. Spain Trip"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Target Amount (₹)</Text>
          <TextInput
            style={styles.input}
            value={targetAmount}
            onChangeText={setTargetAmount}
            keyboardType="numeric"
            placeholder="e.g. 400000"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Months to Save (from today)</Text>
          <TextInput
            style={styles.input}
            value={deadlineMonthOffset}
            onChangeText={setDeadlineMonthOffset}
            keyboardType="numeric"
            placeholder="e.g. 10"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleCreate}>
          <Text style={styles.primaryButtonText}>Create Goal</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export function GoalsScreen() {
  const {
    profile,
    activeGoal,
    dailyBudget,
    todayRemainingBudget,
    monthRemainingBudget,
    monthlySavings,
    resetGoal,
  } = useGoals();

  const [showProfile, setShowProfile] = useState(false);
  const [showGoal, setShowGoal] = useState(false);

  const handleReset = () => {
    if (!activeGoal) return;
    Alert.alert(
      'Reset Goal',
      'This will reset your streak and monthly budget tracking to zero. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetGoal(activeGoal.id),
        },
      ],
    );
  };

  const dayBudget = dailyBudget;
  const daysLeft = daysInCurrentMonth() - new Date().getDate();

  return (
    <ScrollView style={styles.container}>
      {/* Profile section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Financial Profile</Text>
          <TouchableOpacity onPress={() => setShowProfile(true)}>
            <Text style={styles.editLink}>{profile ? 'Edit' : 'Set up'}</Text>
          </TouchableOpacity>
        </View>

        {profile ? (
          <View style={styles.profileCard}>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Monthly Salary</Text>
              <Text style={styles.profileValue}>{formatCurrency(profile.salary)}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>EMIs</Text>
              <Text style={[styles.profileValue, { color: COLORS.danger }]}>
                - {formatCurrency(profile.emiTotal)}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Fixed Expenses</Text>
              <Text style={[styles.profileValue, { color: COLORS.danger }]}>
                - {formatCurrency(profile.fixedExpenses)}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Maintenance</Text>
              <Text style={[styles.profileValue, { color: COLORS.danger }]}>
                - {formatCurrency(profile.maintenanceAvg)}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Miscellaneous</Text>
              <Text style={[styles.profileValue, { color: COLORS.danger }]}>
                - {formatCurrency(profile.miscAvg)}
              </Text>
            </View>
            <View style={[styles.profileRow, styles.profileTotal]}>
              <Text style={styles.profileTotalLabel}>Monthly Savings Potential</Text>
              <Text style={[styles.profileValue, { color: monthlySavings > 0 ? COLORS.success : COLORS.danger, fontWeight: '800' }]}>
                {formatCurrency(monthlySavings)}
              </Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.emptyCard} onPress={() => setShowProfile(true)}>
            <Text style={styles.emptyTitle}>Set up your financial profile</Text>
            <Text style={styles.emptySubtitle}>Enter your salary and expenses to get personalised savings goals</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Active goal */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Goal</Text>
          <TouchableOpacity onPress={() => setShowGoal(true)}>
            <Text style={styles.editLink}>{activeGoal ? 'New Goal' : 'Create'}</Text>
          </TouchableOpacity>
        </View>

        {activeGoal ? (
          <View style={styles.goalCard}>
            {/* Goal header */}
            <View style={styles.goalHeader}>
              <View>
                <Text style={styles.goalName}>{activeGoal.name}</Text>
                <Text style={styles.goalMeta}>
                  Target: {formatCurrency(activeGoal.targetAmount)} ·{' '}
                  {monthsUntil(activeGoal.deadlineMonth)} months left
                </Text>
              </View>
              <StreakBadge streak={activeGoal.streak} />
            </View>

            {/* Monthly saving requirement */}
            <View style={styles.savingRow}>
              <View style={styles.savingItem}>
                <Text style={styles.savingAmount}>
                  {formatCurrency(Math.ceil(activeGoal.targetAmount / monthsUntil(activeGoal.deadlineMonth)))}
                </Text>
                <Text style={styles.savingLabel}>save/month</Text>
              </View>
              <View style={styles.savingDivider} />
              <View style={styles.savingItem}>
                <Text style={styles.savingAmount}>{formatCurrency(activeGoal.monthlyBudget)}</Text>
                <Text style={styles.savingLabel}>monthly budget</Text>
              </View>
              <View style={styles.savingDivider} />
              <View style={styles.savingItem}>
                <Text style={[styles.savingAmount, { color: dayBudget < 1000 ? COLORS.success : COLORS.primary }]}>
                  {formatCurrency(dayBudget)}
                </Text>
                <Text style={styles.savingLabel}>daily limit</Text>
              </View>
            </View>

            {/* Budget bars */}
            <BudgetBar
              spent={activeGoal.todaySpent}
              budget={dayBudget}
              label="Today's Spending"
            />
            <BudgetBar
              spent={activeGoal.monthBudgetUsed}
              budget={activeGoal.monthlyBudget}
              label="This Month"
            />

            {/* Rolling carry-over info */}
            <View style={styles.rolloverRow}>
              <Text style={styles.rolloverText}>
                {todayRemainingBudget >= 0
                  ? `You're ${formatCurrency(todayRemainingBudget)} under budget — carry forward to tomorrow!`
                  : `You're ${formatCurrency(Math.abs(todayRemainingBudget))} over — spend less tomorrow to catch up.`}
              </Text>
            </View>

            {/* Streak info */}
            {activeGoal.streak > 0 && (
              <View style={styles.kudosRow}>
                <Text style={styles.kudosText}>
                  {activeGoal.streak >= 30
                    ? `Legendary! ${activeGoal.streak} day streak — you're unstoppable!`
                    : activeGoal.streak >= 14
                    ? `Amazing! ${activeGoal.streak} days on track — keep going!`
                    : activeGoal.streak >= 7
                    ? `Great job! ${activeGoal.streak} day streak — you're building a habit!`
                    : `${activeGoal.streak} day streak — keep it up!`}
                </Text>
              </View>
            )}

            {/* Reset button */}
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <Text style={styles.resetButtonText}>Reset Goal & Streak</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.emptyCard, !profile && styles.emptyCardDisabled]}
            onPress={() => profile && setShowGoal(true)}>
            <Text style={styles.emptyTitle}>No active goal</Text>
            <Text style={styles.emptySubtitle}>
              {profile
                ? 'Create a goal to get your personalised daily spending limit'
                : 'Set up your financial profile first'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* How streaks work */}
      <View style={[styles.section, { marginBottom: 40 }]}>
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.howItWorksCard}>
          {[
            { grade: 'C', color: COLORS.warning, label: '1–6 days', desc: 'You\'re getting started!' },
            { grade: 'B', color: COLORS.primary, label: '7–13 days', desc: 'Building a solid habit' },
            { grade: 'A', color: COLORS.success, label: '14–29 days', desc: 'Consistently crushing it!' },
            { grade: 'S', color: '#FFD700', label: '30+ days', desc: 'Legendary saver status' },
          ].map(({ grade, color, label, desc }) => (
            <View key={grade} style={styles.gradeRow}>
              <View style={[styles.gradeBubble, { backgroundColor: color + '20', borderColor: color }]}>
                <Text style={[styles.gradeText, { color }]}>{grade}</Text>
              </View>
              <View>
                <Text style={styles.gradeLabel}>{label}</Text>
                <Text style={styles.gradeDesc}>{desc}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.howItWorksNote}>
            Streak resets to 0 if you cross your daily budget, or if you manually reset your goal.
            Unspent budget from previous days carries forward — spend less today and you get more room tomorrow.
          </Text>
        </View>
      </View>

      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
      <GoalModal visible={showGoal} onClose={() => setShowGoal(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  editLink: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  profileLabel: { fontSize: 14, color: COLORS.textSecondary },
  profileValue: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  profileTotal: { borderBottomWidth: 0, marginTop: 4 },
  profileTotalLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },

  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
  },
  emptyCardDisabled: { opacity: 0.5 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  emptySubtitle: { fontSize: 13, color: COLORS.textLight, marginTop: 6, textAlign: 'center' },

  goalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  goalName: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  goalMeta: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  streakBadge: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  streakGrade: { fontSize: 18, fontWeight: '900' },
  streakNumber: { fontSize: 20, fontWeight: '900' },
  streakLabel: { fontSize: 10, fontWeight: '600' },

  savingRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  savingItem: { alignItems: 'center' },
  savingAmount: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  savingLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  savingDivider: { width: 1, backgroundColor: COLORS.border },

  barContainer: { marginBottom: 12 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 12, color: COLORS.textSecondary },
  barValue: { fontSize: 12, fontWeight: '600' },
  barTrack: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  overBudgetText: { fontSize: 11, color: COLORS.danger, marginTop: 2 },

  rolloverRow: {
    backgroundColor: COLORS.primary + '0D',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  rolloverText: { fontSize: 13, color: COLORS.primary, fontWeight: '500' },

  kudosRow: {
    backgroundColor: COLORS.success + '15',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  kudosText: { fontSize: 13, color: COLORS.success, fontWeight: '600' },

  resetButton: {
    borderWidth: 1,
    borderColor: COLORS.danger + '60',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resetButtonText: { fontSize: 13, color: COLORS.danger, fontWeight: '600' },

  howItWorksCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    elevation: 1,
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  gradeBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gradeText: { fontSize: 16, fontWeight: '900' },
  gradeLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  gradeDesc: { fontSize: 12, color: COLORS.textSecondary },
  howItWorksNote: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
  },

  // Modals
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalContent: { padding: 20 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginBottom: 20, lineHeight: 20 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '600' },
});
