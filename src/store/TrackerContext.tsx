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
  showTransactionNotification, registerNotificationCallbacks,
  handleNotificationEvent,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction, getGroup, getGoals, getOrCreateTodaySpend } from '../services/StorageService';
import { addGroupTransactionCloud, getGroupCloud } from '../services/SyncService';
import { initDeepLinkListener } from '../services/DeepLinkService';
import { useGroups } from './GroupContext';

const TRACKER_STATE_KEY = '@et_tracker_state';

const DEFAULT_STATE: TrackerState = {
  personal: false,
  reimbursement: false,
  activeGroupIds: [],
};

interface TrackerContextType {
  trackerState: TrackerState;
  isListening: boolean;
  togglePersonal: () => Promise<void>;
  toggleReimbursement: () => Promise<void>;
  toggleGroup: (groupId: string) => Promise<void>;
  getActiveTrackers: (groups: Group[]) => ActiveTracker[];
  pendingTransaction: ParsedTransaction | null;
  clearPendingTransaction: () => void;
  addTransactionToTracker: (parsed: ParsedTransaction, trackerType: TrackerType, trackerId: string) => Promise<void>;
}

const TrackerContext = createContext<TrackerContextType>({} as TrackerContextType);

interface Props {
  children: ReactNode;
  groups: Group[];
  userId: string;
}

export function TrackerProvider({ children, groups, userId }: Props) {
  const [trackerState, setTrackerState] = useState<TrackerState>(DEFAULT_STATE);
  const [isListening, setIsListening] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<ParsedTransaction | null>(null);

  const { loadGroupTransactions, activeGroupId } = useGroups();

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

      const initial = await notifee.getInitialNotification();
      if (
        initial?.pressAction?.id === 'choose_tracker' &&
        initial?.notification?.data
      ) {
        const d = initial.notification.data as Record<string, string>;
        setPendingTransaction({
          amount: Number(d.amount),
          type: 'debit',
          merchant: d.merchant || undefined,
          bank: d.bank || undefined,
          rawMessage: d.rawMessage,
          timestamp: Number(d.timestamp),
        });
      }
    })();
  }, []);

  // Register notification callbacks
  useEffect(() => {
    registerNotificationCallbacks(
      async (parsed, tracker) => {
        await addTransactionToTracker(parsed, tracker.type, tracker.id);
      },
      (parsed) => {
        setPendingTransaction(parsed);
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

      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);

      if (activeTrackers.length > 0) {
        await showTransactionNotification(parsed, activeTrackers);
      }
    });

    return unsubscribe;
  }, []);

  // Initialize deep link listener for iOS (and as fallback on Android)
  useEffect(() => {
    const cleanup = initDeepLinkListener(async (parsed) => {
      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await showTransactionNotification(parsed, activeTrackers);
      }
    });
    return cleanup;
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
      const currentState = trackerStateRef.current;
      const currentGroups = groupsRef.current;
      const activeTrackers = getActiveTrackersFromState(currentState, currentGroups);
      if (activeTrackers.length > 0) {
        await showTransactionNotification(parsed, activeTrackers);
      }
    });

    setIsListening(true);
  };

  const persistState = async (state: TrackerState) => {
    await AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(state));
  };

  const togglePersonal = useCallback(async () => {
    setTrackerState(prev => {
      const next = { ...prev, personal: !prev.personal };
      persistState(next);
      return next;
    });
  }, []);

  const toggleReimbursement = useCallback(async () => {
    setTrackerState(prev => {
      const turningOn = !prev.reimbursement;
      // Block if trying to turn ON while group trackers are active
      if (turningOn && prev.activeGroupIds.length > 0) {
        Alert.alert(
          'Tracker Conflict',
          'Reimbursement and Group trackers cannot be active at the same time.\n\nDisable your group trackers first.',
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
      // Block if trying to turn ON while reimbursement is active
      if (!isCurrentlyActive && prev.reimbursement) {
        Alert.alert(
          'Tracker Conflict',
          'Group and Reimbursement trackers cannot be active at the same time.\n\nDisable the Reimbursement tracker first.',
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
  }, []);

  const clearPendingTransaction = useCallback(() => {
    setPendingTransaction(null);
  }, []);

  const value = useMemo(() => ({
    trackerState,
    isListening,
    togglePersonal,
    toggleReimbursement,
    toggleGroup,
    getActiveTrackers,
    pendingTransaction,
    clearPendingTransaction,
    addTransactionToTracker,
  }), [trackerState, isListening, togglePersonal, toggleReimbursement, toggleGroup, getActiveTrackers, pendingTransaction, clearPendingTransaction, addTransactionToTracker]);

  return (
    <TrackerContext.Provider value={value}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  return useContext(TrackerContext);
}
