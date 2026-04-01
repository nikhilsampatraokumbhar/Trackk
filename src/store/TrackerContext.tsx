import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, useMemo, ReactNode,
} from 'react';
import { Alert, AppState } from 'react-native';
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
  showTransactionNotification,
  registerNotificationCallbacks, handleNotificationEvent,
  clearNotificationCallbacks,
  PENDING_GROUP_SPLIT_KEY,
  PENDING_CHOOSE_TRACKER_KEY,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction, getGroup, getGoals, getOrCreateTodaySpend, getOrCreateUser, getReimbursementTrips, createReimbursementTrip, saveReimbursementExpense } from '../services/StorageService';
import { addGroupTransactionCloud, getGroupCloud } from '../services/SyncService';
import { initDeepLinkListener } from '../services/DeepLinkService';
import {
  ingestTransaction,
  addToPendingReview,
  markMatchingPendingAsReviewed,
  TransactionSource,
} from '../services/TransactionSignalEngine';
import { processTransactionForTracking, checkEMICompletions, scanHistoricalSMS } from '../services/AutoDetectionService';
import { useGroups } from './GroupContext';
import { usePremium } from './PremiumContext';

const TRACKER_STATE_KEY = '@et_tracker_state';
const HISTORICAL_SCAN_DONE_KEY = '@et_historical_sms_scan_done';

const DEFAULT_STATE: TrackerState = {
  personal: false,
  reimbursement: false,
  activeGroupIds: [],
  groupAffectsGoal: true,
  defaultTrackerId: 'personal',
  trackingEnabled: true, // On by default — adding a tracker starts tracking immediately
};

interface TrackerContextType {
  trackerState: TrackerState;
  isListening: boolean;
  togglePersonal: () => Promise<void>;
  toggleReimbursement: () => Promise<void>;
  toggleGroup: (groupId: string) => Promise<void>;
  toggleTracking: () => void;
  setDefaultTracker: (trackerId: string) => void;
  getActiveTrackers: (groups: Group[]) => ActiveTracker[];
  pendingTransaction: ParsedTransaction | null;
  pendingGroupTracker: ActiveTracker | null; // auto-routed group tracker for SplitEditor
  pendingTargetTracker: ActiveTracker | null; // non-group tracker to auto-save + navigate
  clearPendingTransaction: () => void;
  addTransactionToTracker: (parsed: ParsedTransaction, trackerType: TrackerType, trackerId: string) => Promise<void>;
  transactionVersion: number; // increments on every new transaction, screens can react to this
  toggleGroupAffectsGoal: () => void;
}

const TrackerContext = createContext<TrackerContextType>({} as TrackerContextType);

/**
 * With the 3-slot notification design, each active tracker gets its own
 * action button in the notification. No "default" routing needed — the
 * user taps the specific tracker button they want.
 */

interface Props {
  children: ReactNode;
  groups: Group[];
  userId: string;
}

export function TrackerProvider({ children, groups, userId }: Props) {
  const [trackerState, setTrackerState] = useState<TrackerState>(DEFAULT_STATE);
  const [isListening, setIsListening] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<Array<{
    transaction: ParsedTransaction;
    groupTracker?: ActiveTracker;
    targetTracker?: ActiveTracker;
  }>>([]);

  // Derived: current pending transaction is the first item in the queue
  const pendingTransaction = pendingQueue.length > 0 ? pendingQueue[0].transaction : null;
  const pendingGroupTracker = pendingQueue.length > 0 ? (pendingQueue[0].groupTracker || null) : null;
  const pendingTargetTracker = pendingQueue.length > 0 ? (pendingQueue[0].targetTracker || null) : null;
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

  /**
   * Check AsyncStorage for a pending group split stashed by the background handler.
   * The background handler can't show UI, so it stashes the data for us to pick up
   * when the app comes to foreground and route to SplitEditor.
   */
  const consumePendingGroupSplit = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_GROUP_SPLIT_KEY);
      if (!raw) return;
      await AsyncStorage.removeItem(PENDING_GROUP_SPLIT_KEY);
      const { transaction, trackerId, trackerLabel } = JSON.parse(raw);
      if (!transaction || !trackerId) return;
      setPendingQueue(prev => [...prev, {
        transaction,
        groupTracker: {
          type: 'group' as const,
          id: trackerId,
          label: trackerLabel || 'Group',
        },
      }]);
    } catch {}
  }, []);

  /**
   * Check AsyncStorage for a pending "choose tracker" stashed by the background handler.
   * When user taps "Other" button while app is in background, the background handler
   * stashes the transaction. We pick it up here and show the TrackerSelectionDialog.
   */
  const consumePendingChooseTracker = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_CHOOSE_TRACKER_KEY);
      if (!raw) return;
      await AsyncStorage.removeItem(PENDING_CHOOSE_TRACKER_KEY);
      const { transaction } = JSON.parse(raw);
      if (!transaction) return;
      setPendingQueue(prev => [...prev, { transaction }]);
    } catch {}
  }, []);

  // When app comes back to foreground, check for stashed pending data
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        consumePendingGroupSplit();
        consumePendingChooseTracker();
      }
    });
    return () => sub.remove();
  }, [consumePendingGroupSplit, consumePendingChooseTracker]);

  // Load state on mount; also recover pending transaction if app was cold-launched
  // from a "Choose Tracker" notification action
  // Auto-enable personal tracking on first launch so SMS detection works immediately
  useEffect(() => {
    (async () => {
      await setupNotificationChannel();
      const raw = await AsyncStorage.getItem(TRACKER_STATE_KEY);
      if (raw) {
        const state: TrackerState = JSON.parse(raw);
        // Backward compat: existing saved state may not have trackingEnabled
        if (state.trackingEnabled === undefined) state.trackingEnabled = true;
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
        // First launch — auto-enable personal tracker so SMS detection works immediately
        // Users can add group/reimbursement trackers later
        const state = { ...DEFAULT_STATE, personal: true };
        await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
        setTrackerState(state);
      }

      // Check for completed EMIs on startup
      try { await checkEMICompletions(); } catch {}

      const initial = await notifee.getInitialNotification();
      if (initial?.notification?.data) {
        const actionId = initial.pressAction?.id;
        const d = initial.notification.data as Record<string, string>;
        const amt = Number(d.amount);
        if (amt && amt > 0 && isFinite(amt)) {
          const parsed: ParsedTransaction = {
            amount: amt,
            type: 'debit',
            merchant: d.merchant || undefined,
            bank: d.bank || undefined,
            rawMessage: d.rawMessage,
            timestamp: Number(d.timestamp),
          };

          // Determine if this is a group tracker notification
          // Handles both action button tap (add_to_tracker) and body tap (default/undefined)
          const isGroupTracker = d.trackerType === 'group';
          const isAddAction = actionId === 'add_to_tracker';
          const isBodyTap = !actionId || actionId === 'default';
          const hasTrackerData = !!d.trackerType && !!d.trackerId;

          if (isGroupTracker && (isAddAction || (isBodyTap && hasTrackerData))) {
            // Cold-start from group notification → open SplitEditor
            setPendingQueue(prev => [...prev, {
              transaction: parsed,
              groupTracker: {
                type: 'group',
                id: d.trackerId,
                label: d.trackerLabel || 'Group',
              },
            }]);
          } else if (actionId === 'choose_tracker' || (isBodyTap && !hasTrackerData)) {
            // Multiple trackers — show selection dialog
            setPendingQueue(prev => [...prev, { transaction: parsed }]);
          } else if ((isAddAction || isBodyTap) && hasTrackerData && !isGroupTracker) {
            // Non-group single tracker → enqueue with target so HomeScreen
            // can auto-save + navigate to the correct screen
            const trackerType = d.trackerType as TrackerType;
            setPendingQueue(prev => [...prev, {
              transaction: parsed,
              targetTracker: {
                type: trackerType,
                id: d.trackerId,
                label: d.trackerLabel || (trackerType === 'personal' ? 'Personal' : 'Reimbursement'),
              },
            }]);
          }
        }
      }

      // Check for pending group split stashed by background handler
      // (background handler can't show SplitEditor, so it stashes data for us)
      await consumePendingGroupSplit();
      await consumePendingChooseTracker();
    })();
  }, []);

  // Register notification callbacks — all types go through pendingQueue
  // so the active screen can navigate appropriately
  useEffect(() => {
    registerNotificationCallbacks(
      async (parsed, tracker) => {
        if (tracker.type === 'group') {
          setPendingQueue(prev => [...prev, { transaction: parsed, groupTracker: tracker }]);
        } else {
          // Personal / Reimbursement → enqueue with targetTracker so HomeScreen
          // can auto-save + navigate to the correct screen
          setPendingQueue(prev => [...prev, { transaction: parsed, targetTracker: tracker }]);
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

      // Always add to pending review so Review Expenses can show all today's transactions
      await addToPendingReview(parsed, 'email');

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);

      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      }
    });

    return unsubscribe;
  }, []);

  // Initialize deep link listener for iOS (and as fallback on Android)
  useEffect(() => {
    const cleanup = initDeepLinkListener(async (parsed) => {
      const signal = ingestTransaction(parsed, 'deep_link');
      if (!signal) return; // duplicate

      // Always add to pending review
      await addToPendingReview(parsed, 'deep_link');

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      }
    });
    return cleanup;
  }, []);

  /**
   * Handle an incoming transaction:
   * Each active tracker (up to 3) gets its own action button in the notification.
   * Skips notification entirely when tracking is paused via master toggle.
   */
  const handleIncomingTransaction = useCallback(async (
    parsed: ParsedTransaction,
    activeTrackers: ActiveTracker[],
  ) => {
    if (activeTrackers.length === 0) return;
    // Don't show notification if tracking is paused
    if (trackerStateRef.current.trackingEnabled === false) return;
    await showTransactionNotification(parsed, activeTrackers);
  }, []);

  // Start/stop SMS listener based on tracker state + master toggle (Android only)
  // Only listen when tracking is enabled AND user has at least one active tracker
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const hasActiveTracker =
      trackerState.personal ||
      trackerState.reimbursement ||
      trackerState.activeGroupIds.length > 0;

    const shouldListen = hasActiveTracker && (trackerState.trackingEnabled !== false);

    if (shouldListen && !isListeningRef.current) {
      isListeningRef.current = true;
      startListening();
    } else if (!shouldListen && isListeningRef.current) {
      isListeningRef.current = false;
      stopSmsListener();
      setIsListening(false);
    }
  }, [trackerState]);

  // Clean up all listeners on unmount (triggered by sign-out since
  // TrackerProvider is conditionally rendered only when authenticated)
  useEffect(() => {
    return () => {
      stopSmsListener();
      clearNotificationCallbacks();
      notifee.cancelAllNotifications();
      isListeningRef.current = false;
    };
  }, []);

  const startListening = async () => {
    const granted = await requestSmsPermission();
    if (!granted) {
      isListeningRef.current = false;
      // Show feedback so user knows why detection won't work
      Alert.alert(
        'SMS Permission Required',
        'Trackk needs SMS access to automatically detect your expenses from bank messages. You can grant it later from Settings.',
        [{ text: 'OK' }],
      );
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

      // Always add to pending review so Review Expenses can show all today's transactions
      // This works even if no active trackers — transactions are queued for review
      await addToPendingReview(parsed, 'sms');

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await handleIncomingTransaction(parsed, activeTrackers);
      }
    });

    setIsListening(true);

    // On first-ever listen, trigger historical SMS scan (1 year) to bootstrap
    // subscriptions, EMIs, and investments from existing bank messages
    try {
      const scanDone = await AsyncStorage.getItem(HISTORICAL_SCAN_DONE_KEY);
      if (!scanDone && Platform.OS === 'android') {
        // Run in background — don't block the listener startup
        scanHistoricalSMS('all').then(() => {
          AsyncStorage.setItem(HISTORICAL_SCAN_DONE_KEY, 'true').catch(() => {});
        }).catch(() => {});
      }
    } catch {}
  };

  const persistState = async (state: TrackerState) => {
    await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
  };

  /** Max 3 active trackers — matches Android's 3-button notification limit */
  const MAX_ACTIVE_TRACKERS = 3;

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
      if (turningOn && countActiveTrackers(prev) >= MAX_ACTIVE_TRACKERS) {
        Alert.alert(
          'Slot Full',
          'You can have up to 3 active trackers. Remove one to add another.',
          [{ text: 'OK' }],
        );
        return prev;
      }
      const next = { ...prev, personal: !prev.personal };
      persistState(next);
      return next;
    });
  }, []);

  const toggleReimbursement = useCallback(async () => {
    setTrackerState(prev => {
      const turningOn = !prev.reimbursement;
      if (turningOn && countActiveTrackers(prev) >= MAX_ACTIVE_TRACKERS) {
        Alert.alert(
          'Slot Full',
          'You can have up to 3 active trackers. Remove one to add another.',
          [{ text: 'OK' }],
        );
        return prev;
      }
      const next = { ...prev, reimbursement: !prev.reimbursement };
      persistState(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(async (groupId: string) => {
    setTrackerState(prev => {
      const isCurrentlyActive = prev.activeGroupIds.includes(groupId);
      if (!isCurrentlyActive && countActiveTrackers(prev) >= MAX_ACTIVE_TRACKERS) {
        Alert.alert(
          'Slot Full',
          'You can have up to 3 active trackers. Remove one to add another.',
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
  }, []);

  const setDefaultTracker = useCallback((trackerId: string) => {
    setTrackerState(prev => {
      const next = { ...prev, defaultTrackerId: trackerId };
      persistState(next);
      return next;
    });
  }, []);

  const toggleGroupAffectsGoal = useCallback(() => {
    setTrackerState(prev => {
      const next = { ...prev, groupAffectsGoal: !prev.groupAffectsGoal };
      persistState(next);
      return next;
    });
  }, []);

  /** Master toggle — pause/resume tracking without losing slot selections */
  const toggleTracking = useCallback(() => {
    setTrackerState(prev => {
      const next = { ...prev, trackingEnabled: !prev.trackingEnabled };
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
    // Default tracker always comes first (first notification button position)
    const defaultId = state.defaultTrackerId;
    if (defaultId && trackers.length > 1) {
      const idx = trackers.findIndex(t => t.id === defaultId);
      if (idx > 0) {
        const [defaultTracker] = trackers.splice(idx, 1);
        trackers.unshift(defaultTracker);
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
        await getOrCreateTodaySpend(goal.dailyBudget);
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

      // Group data stays in group storage — no personal sync needed
    } else if (trackerType === 'reimbursement') {
      // Reimbursement needs a trip — get or create active one
      let trips = await getReimbursementTrips();
      let activeTrip = trips.find(t => t.status === 'active');
      if (!activeTrip) {
        activeTrip = await createReimbursementTrip('General');
      }
      await saveReimbursementExpense(parsed, activeTrip.id, uid);
      // Reimbursements do NOT affect goal budget
    } else {
      await saveTransaction(parsed, trackerType, uid);
      // Personal expense → sync goal budget
      await syncGoalDailyBudget();
    }

    // Mark matching pending review item as reviewed so it doesn't show redundantly
    // in Review Expenses after being added via notification
    await markMatchingPendingAsReviewed(parsed);

    // Update default tracker to last-used
    setTrackerState(prev => {
      if (prev.defaultTrackerId !== trackerId) {
        const next = { ...prev, defaultTrackerId: trackerId };
        persistState(next);
        return next;
      }
      return prev;
    });

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
    toggleTracking,
    setDefaultTracker,
    getActiveTrackers,
    pendingTransaction,
    pendingGroupTracker,
    pendingTargetTracker,
    clearPendingTransaction,
    addTransactionToTracker,
    transactionVersion,
    toggleGroupAffectsGoal,
  }), [trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup, toggleTracking, setDefaultTracker, getActiveTrackers, pendingQueue, clearPendingTransaction, addTransactionToTracker, transactionVersion, toggleGroupAffectsGoal]);

  return (
    <TrackerContext.Provider value={value}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  return useContext(TrackerContext);
}
