import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, useMemo, ReactNode,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { TrackerState, ParsedTransaction, ActiveTracker, Group, TrackerType } from '../models/types';
import { Platform } from 'react-native';
import {
  requestSmsPermission, startSmsListener, stopSmsListener,
} from '../services/SmsService';
import { setupFcmHandlers } from '../services/FcmService';
import {
  setupNotificationChannel, requestNotificationPermission,
  showTransactionNotification, showAutoSavedNotification,
  registerNotificationCallbacks, handleNotificationEvent,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction, getGroup, getGoals, getOrCreateTodaySpend, getOrCreateUser } from '../services/StorageService';
import { addGroupTransactionCloud, getGroupCloud } from '../services/SyncService';
import { initDeepLinkListener } from '../services/DeepLinkService';
import {
  ingestTransaction,
  addToPendingReview,
  TransactionSource,
} from '../services/TransactionSignalEngine';
import { processTransactionForTracking, checkEMICompletions } from '../services/AutoDetectionService';
import { useGroups } from './GroupContext';
import { usePremium } from './PremiumContext';

const TRACKER_STATE_KEY = '@et_tracker_state';

const DEFAULT_STATE: TrackerState = {
  personal: false,
  reimbursement: false,
  activeGroupIds: [],
  groupAffectsGoal: true,
};

interface TrackerContextType {
  trackerState: TrackerState;
  isListening: boolean;
  togglePersonal: () => Promise<void>;
  toggleReimbursement: () => Promise<void>;
  toggleGroup: (groupId: string) => Promise<void>;
  getActiveTrackers: (groups: Group[]) => ActiveTracker[];
  pendingTransaction: ParsedTransaction | null;
  pendingGroupTracker: ActiveTracker | null; // auto-routed group tracker for SplitEditor
  clearPendingTransaction: () => void;
  addTransactionToTracker: (parsed: ParsedTransaction, trackerType: TrackerType, trackerId: string) => Promise<void>;
  transactionVersion: number; // increments on every new transaction, screens can react to this
  toggleGroupAffectsGoal: () => void;
}

const TrackerContext = createContext<TrackerContextType>({} as TrackerContextType);

/**
 * Smart routing logic for multiple active trackers:
 * - Group + any other → route to group automatically (no "Choose Tracker")
 * - Reimbursement + Personal → auto-save to both
 * - Otherwise → normal flow
 */
function resolveTrackerRouting(
  activeTrackers: ActiveTracker[],
): { action: 'auto_group'; tracker: ActiveTracker } |
   { action: 'auto_reimbursement_personal'; trackers: ActiveTracker[] } |
   { action: 'normal'; trackers: ActiveTracker[] } {
  const groupTrackers = activeTrackers.filter(t => t.type === 'group');
  const hasPersonal = activeTrackers.some(t => t.type === 'personal');
  const hasReimbursement = activeTrackers.some(t => t.type === 'reimbursement');

  // If any group tracker is active → route to group (first one if multiple)
  if (groupTrackers.length > 0) {
    return { action: 'auto_group', tracker: groupTrackers[0] };
  }

  // If both reimbursement and personal → auto-save to both
  if (hasReimbursement && hasPersonal) {
    return { action: 'auto_reimbursement_personal', trackers: activeTrackers };
  }

  // Single tracker or other combinations → normal flow
  return { action: 'normal', trackers: activeTrackers };
}

interface Props {
  children: ReactNode;
  groups: Group[];
  userId: string;
}

export function TrackerProvider({ children, groups, userId }: Props) {
  const [trackerState, setTrackerState] = useState<TrackerState>(DEFAULT_STATE);
  const [isListening, setIsListening] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<Array<{ transaction: ParsedTransaction; groupTracker?: ActiveTracker }>>([]);

  // Derived: current pending transaction is the first item in the queue
  const pendingTransaction = pendingQueue.length > 0 ? pendingQueue[0].transaction : null;
  const pendingGroupTracker = pendingQueue.length > 0 ? (pendingQueue[0].groupTracker || null) : null;
  const [transactionVersion, setTransactionVersion] = useState(0);

  const { loadGroupTransactions, activeGroupId } = useGroups();
  const { isPremium } = usePremium();

  const groupsRef = useRef(groups);
  const userIdRef = useRef(userId);
  const trackerStateRef = useRef(trackerState);
  const isListeningRef = useRef(false);
  const loadGroupTransactionsRef = useRef(loadGroupTransactions);
  const activeGroupIdRef = useRef(activeGroupId);

  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { trackerStateRef.current = trackerState; }, [trackerState]);
  useEffect(() => { loadGroupTransactionsRef.current = loadGroupTransactions; }, [loadGroupTransactions]);
  useEffect(() => { activeGroupIdRef.current = activeGroupId; }, [activeGroupId]);

  // Load state on mount; also recover pending transaction if app was cold-launched
  // from a "Choose Tracker" notification action
  // Also auto-enable personal tracking if a goal exists
  useEffect(() => {
    (async () => {
      await setupNotificationChannel();
      const raw = await AsyncStorage.getItem(TRACKER_STATE_KEY);
      if (raw) {
        const state: TrackerState = JSON.parse(raw);
        // Auto-enable personal tracking if goals exist and personal is off
        if (!state.personal) {
          const goals = await getGoals();
          if (goals.length > 0) {
            state.personal = true;
            await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
          }
        }
        setTrackerState(state);
      } else {
        // First launch — check for goals
        const goals = await getGoals();
        if (goals.length > 0) {
          const state = { ...DEFAULT_STATE, personal: true };
          await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
          setTrackerState(state);
        }
      }

      // Check for completed EMIs on startup
      try { await checkEMICompletions(); } catch {}

      const initial = await notifee.getInitialNotification();
      if (initial?.pressAction?.id && initial?.notification?.data) {
        const actionId = initial.pressAction.id;
        const d = initial.notification.data as Record<string, string>;
        const parsed: ParsedTransaction = {
          amount: Number(d.amount),
          type: 'debit',
          merchant: d.merchant || undefined,
          bank: d.bank || undefined,
          rawMessage: d.rawMessage,
          timestamp: Number(d.timestamp),
        };

        if (actionId === 'add_to_tracker' && d.trackerType === 'group') {
          // Cold-start from group notification → open SplitEditor
          setPendingQueue(prev => [...prev, {
            transaction: parsed,
            groupTracker: {
              type: 'group',
              id: d.trackerId,
              label: d.trackerLabel || 'Group',
            },
          }]);
        } else if (actionId === 'choose_tracker') {
          setPendingQueue(prev => [...prev, { transaction: parsed }]);
        } else if (actionId === 'add_to_tracker') {
          // Non-group single tracker → auto-save
          const trackerType = d.trackerType as TrackerType;
          const user = await getOrCreateUser();
          await saveTransaction(parsed, trackerType, user.id);
        }
      }
    })();
  }, []);

  // Register notification callbacks
  useEffect(() => {
    registerNotificationCallbacks(
      async (parsed, tracker) => {
        if (tracker.type === 'group') {
          // Group tracker → enqueue pending transaction with group tracker so HomeScreen
          // can open SplitEditor automatically
          setPendingQueue(prev => [...prev, { transaction: parsed, groupTracker: tracker }]);
        } else {
          await addTransactionToTracker(parsed, tracker.type, tracker.id);
        }
      },
      (parsed) => {
        setPendingQueue(prev => [...prev, { transaction: parsed }]);
      },
    );
  }, []);

  // Foreground notification event listener
  useEffect(() => {
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      const activeTrackers = getActiveTrackersFromState(
        trackerStateRef.current,
        groupsRef.current,
      );
      handleNotificationEvent({ type, detail }, activeTrackers);
    });
    return () => unsubscribe();
  }, []);

  // Set up FCM handlers for email-detected transactions (both platforms)
  useEffect(() => {
    const unsubscribe = setupFcmHandlers(async (data) => {
      // FCM push from Cloud Functions for email-detected transactions
      const parsed: ParsedTransaction = {
        amount: Number(data.amount) || 0,
        type: (data.type as 'debit' | 'credit') || 'debit',
        merchant: data.merchant || undefined,
        bank: data.bank || undefined,
        rawMessage: data.description || `Email transaction: ${data.amount}`,
        timestamp: Number(data.timestamp) || Date.now(),
      };

      if (parsed.amount <= 0) return;

      const signal = ingestTransaction(parsed, 'email');
      if (!signal) return; // duplicate

      // Auto-detect subscriptions/EMIs/investments from email content
      try {
        await processTransactionForTracking(parsed);
      } catch {}

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);

      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      } else {
        await addToPendingReview(parsed, 'email');
      }
    });

    return unsubscribe;
  }, []);

  // Initialize deep link listener for iOS (and as fallback on Android)
  useEffect(() => {
    const cleanup = initDeepLinkListener(async (parsed) => {
      const signal = ingestTransaction(parsed, 'deep_link');
      if (!signal) return; // duplicate
      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      } else {
        await addToPendingReview(parsed, 'deep_link');
      }
    });
    return cleanup;
  }, []);

  /**
   * Handle an incoming transaction with smart routing:
   * - Group active → open SplitEditor (set pending + group tracker)
   * - Reimbursement + Personal → auto-save to both
   * - Otherwise → show notification as normal
   */
  const handleIncomingTransaction = useCallback(async (
    parsed: ParsedTransaction,
    activeTrackers: ActiveTracker[],
  ) => {
    if (activeTrackers.length === 0) return;

    const routing = resolveTrackerRouting(activeTrackers);

    if (routing.action === 'auto_group') {
      // Group tracker is active → show notification with single "Add to <Group>" button
      await showTransactionNotification(parsed, [routing.tracker]);
    } else if (routing.action === 'auto_reimbursement_personal') {
      // Reimbursement + Personal → auto-save to both, show confirmation notification
      const uid = userIdRef.current;
      await saveTransaction(parsed, 'reimbursement', uid);
      await saveTransaction(parsed, 'personal', uid);
      await syncGoalDailyBudget();
      setTransactionVersion(v => v + 1);
      // Show a confirmation notification (no action buttons needed)
      await showAutoSavedNotification(parsed);
    } else {
      // Normal flow → show notification with appropriate action(s)
      await showTransactionNotification(parsed, routing.trackers);
    }
  }, []);

  // Start/stop SMS listener based on tracker state (Android only)
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const hasActiveTracker =
      trackerState.personal ||
      trackerState.reimbursement ||
      trackerState.activeGroupIds.length > 0;

    if (hasActiveTracker && !isListeningRef.current) {
      isListeningRef.current = true;
      startListening();
    } else if (!hasActiveTracker && isListeningRef.current) {
      isListeningRef.current = false;
      stopSmsListener();
      setIsListening(false);
    }
  }, [trackerState]);

  const startListening = async () => {
    const granted = await requestSmsPermission();
    if (!granted) {
      isListeningRef.current = false;
      return;
    }
    await requestNotificationPermission();

    startSmsListener(async (parsed) => {
      const signal = ingestTransaction(parsed, 'sms');
      if (!signal) return; // duplicate — already handled from another source

      // Auto-detect subscriptions/EMIs/investments from SMS content
      try {
        await processTransactionForTracking(parsed);
      } catch {
        // Silent fail — auto-detection is best-effort
      }

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      } else {
        await addToPendingReview(parsed, 'sms');
      }
    });

    setIsListening(true);
  };

  const persistState = async (state: TrackerState) => {
    await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
  };

  /** Count how many trackers are currently active */
  const countActiveTrackers = (state: TrackerState): number => {
    let count = 0;
    if (state.personal) count++;
    if (state.reimbursement) count++;
    count += state.activeGroupIds.length;
    return count;
  };

  const togglePersonal = useCallback(async () => {
    setTrackerState(prev => {
      const turningOn = !prev.personal;
      if (turningOn && !isPremium && countActiveTrackers(prev) >= 1) {
        Alert.alert(
          'Upgrade to Premium',
          'Free plan supports one active tracker. Upgrade to Premium for simultaneous tracking across Personal, Group, and Reimbursement!',
          [{ text: 'OK' }],
        );
        return prev;
      }
      const next = { ...prev, personal: !prev.personal };
      persistState(next);
      return next;
    });
  }, [isPremium]);

  const toggleReimbursement = useCallback(async () => {
    setTrackerState(prev => {
      const turningOn = !prev.reimbursement;
      // Block if trying to turn ON while group trackers are active
      if (turningOn && prev.activeGroupIds.length > 0) {
        Alert.alert(
          'Tracker Conflict',
          'Reimbursement and Group tracking cannot be active at the same time.\n\nDisable your group tracker first.',
          [{ text: 'OK' }],
        );
        return prev;
      }
      // Free users: only 1 active tracker
      if (turningOn && !isPremium && countActiveTrackers(prev) >= 1) {
        Alert.alert(
          'Upgrade to Premium',
          'Free plan supports one active tracker. Upgrade to Premium for simultaneous tracking across Personal, Group, and Reimbursement!',
          [{ text: 'OK' }],
        );
        return prev;
      }
      const next = { ...prev, reimbursement: !prev.reimbursement };
      persistState(next);
      return next;
    });
  }, [isPremium]);

  const toggleGroup = useCallback(async (groupId: string) => {
    setTrackerState(prev => {
      const isCurrentlyActive = prev.activeGroupIds.includes(groupId);
      // Block if trying to turn ON while reimbursement is active
      if (!isCurrentlyActive && prev.reimbursement) {
        Alert.alert(
          'Tracker Conflict',
          'Group and Reimbursement tracking cannot be active at the same time.\n\nDisable the Reimbursement tracker first.',
          [{ text: 'OK' }],
        );
        return prev;
      }
      // Only 1 group tracker at a time for all users
      if (!isCurrentlyActive && prev.activeGroupIds.length >= 1) {
        Alert.alert(
          'One Group at a Time',
          'You can only track one group at a time. Disable your current group tracker first.',
          [{ text: 'OK' }],
        );
        return prev;
      }
      // Free users: only 1 active tracker
      if (!isCurrentlyActive && !isPremium && countActiveTrackers(prev) >= 1) {
        Alert.alert(
          'Upgrade to Premium',
          'Free plan supports one active tracker. Upgrade to Premium for simultaneous tracking across Personal, Group, and Reimbursement!',
          [{ text: 'OK' }],
        );
        return prev;
      }
      const next = {
        ...prev,
        activeGroupIds: isCurrentlyActive
          ? prev.activeGroupIds.filter(id => id !== groupId)
          : [...prev.activeGroupIds, groupId],
      };
      persistState(next);
      return next;
    });
  }, [isPremium]);

  const toggleGroupAffectsGoal = useCallback(() => {
    setTrackerState(prev => {
      const next = { ...prev, groupAffectsGoal: !prev.groupAffectsGoal };
      persistState(next);
      return next;
    });
  }, []);

  function getActiveTrackersFromState(state: TrackerState, gs: Group[]): ActiveTracker[] {
    const trackers: ActiveTracker[] = [];
    if (state.personal) {
      trackers.push({ type: 'personal', id: 'personal', label: 'Personal' });
    }
    if (state.reimbursement) {
      trackers.push({ type: 'reimbursement', id: 'reimbursement', label: 'Reimbursement' });
    }
    for (const gid of state.activeGroupIds) {
      const group = gs.find(g => g.id === gid);
      if (group) {
        trackers.push({ type: 'group', id: gid, label: group.name });
      }
    }
    return trackers;
  }

  const getActiveTrackers = useCallback((gs: Group[]) => {
    return getActiveTrackersFromState(trackerState, gs);
  }, [trackerState]);

  /** After any personal/group expense, sync with active goal's daily budget */
  const syncGoalDailyBudget = useCallback(async () => {
    try {
      const goals = await getGoals();
      if (goals.length === 0) return;
      // Use the first active goal for daily budget tracking
      const goal = goals[0];
      if (goal.dailyBudget > 0) {
        const excludeGroup = !trackerStateRef.current.groupAffectsGoal;
        await getOrCreateTodaySpend(goal.dailyBudget, excludeGroup);
      }
    } catch {
      // Silent fail — goal sync is best-effort
    }
  }, []);

  const addTransactionToTracker = useCallback(async (
    parsed: ParsedTransaction,
    trackerType: TrackerType,
    trackerId: string,
  ) => {
    const uid = userIdRef.current;
    if (trackerType === 'group') {
      // Try cloud first, fallback to local
      try {
        let group = groupsRef.current.find(g => g.id === trackerId);
        // If group not in local cache (e.g. app was cold-started from notification),
        // fetch it from Firestore directly
        if (!group) {
          const cloudGroup = await getGroupCloud(trackerId);
          if (cloudGroup) group = cloudGroup;
        }
        if (group) {
          await addGroupTransactionCloud(parsed, trackerId, uid, group.members);
        } else {
          await addGroupTransaction(parsed, trackerId, uid);
        }
      } catch {
        await addGroupTransaction(parsed, trackerId, uid);
      }

      // Refresh the active group transactions so the UI updates immediately
      // without requiring a manual pull-to-refresh
      if (activeGroupIdRef.current === trackerId) {
        loadGroupTransactionsRef.current(trackerId);
      }

      // Group split saved to personal → sync goal budget
      await syncGoalDailyBudget();
    } else if (trackerType === 'reimbursement') {
      await saveTransaction(parsed, trackerType, uid);
      // Reimbursements do NOT affect goal budget
    } else {
      await saveTransaction(parsed, trackerType, uid);
      // Personal expense → sync goal budget
      await syncGoalDailyBudget();
    }

    // Bump version so screens listening to transactionVersion will re-render/reload
    setTransactionVersion(v => v + 1);
  }, []);

  const clearPendingTransaction = useCallback(() => {
    // Remove the first item from the queue; next item (if any) becomes active
    setPendingQueue(prev => prev.slice(1));
  }, []);

  const value = useMemo(() => ({
    trackerState,
    isListening,
    togglePersonal,
    toggleReimbursement,
    toggleGroup,
    getActiveTrackers,
    pendingTransaction,
    pendingGroupTracker,
    clearPendingTransaction,
    addTransactionToTracker,
    transactionVersion,
    toggleGroupAffectsGoal,
  }), [trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup, getActiveTrackers, pendingQueue, clearPendingTransaction, addTransactionToTracker, transactionVersion, toggleGroupAffectsGoal]);

  return (
    <TrackerContext.Provider value={value}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  return useContext(TrackerContext);
}
