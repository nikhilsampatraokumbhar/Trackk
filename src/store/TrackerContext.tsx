import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TrackerState, TrackerType, ActiveTracker, ParsedTransaction, Group,
} from '../models/types';
import { startSmsListener, stopSmsListener, requestSmsPermission } from '../services/SmsService';
import {
  showTransactionNotification,
  showTripTrackerReminderNotification,
  registerNotificationCallbacks,
  requestNotificationPermission,
  setupNotificationChannel,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction } from '../services/FirebaseService';
import {
  setupGoogleSignIn,
  connectGmail as gmailConnect,
  disconnectGmail as gmailDisconnect,
  silentGmailSignIn,
  fetchNewBankTransactionEmails,
} from '../services/EmailService';
import {
  connectOutlook as outlookConnect,
  disconnectOutlook as outlookDisconnect,
  fetchNewOutlookTransactionEmails,
} from '../services/OutlookService';

const TRACKER_STATE_KEY = '@tracker_state';
const GROUP_TRACKER_START_PREFIX = '@group_tracker_started_';
const TRIP_REMINDER_DAYS = 14;

// ── Setup Google Sign-In once at module load (iOS only) ──────────────────────
if (Platform.OS === 'ios') {
  setupGoogleSignIn();
}

interface TrackerContextValue {
  trackerState: TrackerState;
  isListening: boolean;
  togglePersonal: () => void;
  toggleReimbursement: () => void;
  toggleGroup: (groupId: string) => void | Promise<void>;
  getActiveTrackers: (groups: Group[]) => ActiveTracker[];
  pendingTransaction: ParsedTransaction | null;
  clearPendingTransaction: () => void;
  addTransactionToTracker: (
    parsed: ParsedTransaction,
    trackerType: TrackerType,
    trackerId: string,
  ) => Promise<void>;
  // iOS / Gmail (personal tracker)
  connectGmail: () => Promise<void>;
  disconnectGmail: () => Promise<void>;
  isPollingEmails: boolean;
  // iOS / Outlook (reimbursement tracker)
  connectOutlook: () => Promise<void>;
  disconnectOutlook: () => Promise<void>;
  isPollingOutlook: boolean;
}

const TrackerContext = createContext<TrackerContextValue>({} as TrackerContextValue);

export function TrackerProvider({
  children,
  groups,
  onPersonalExpense,
}: {
  children: ReactNode;
  groups: Group[];
  onPersonalExpense?: (amount: number) => Promise<void>;
}) {
  const [trackerState, setTrackerState] = useState<TrackerState>({
    personal: false,
    reimbursement: false,
    activeGroupIds: [],
  });
  const [isListening, setIsListening] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState<ParsedTransaction | null>(null);
  const [isPollingEmails, setIsPollingEmails] = useState(false);
  const [isPollingOutlook, setIsPollingOutlook] = useState(false);

  const trackerStateRef = useRef(trackerState);
  const groupsRef = useRef(groups);
  trackerStateRef.current = trackerState;
  groupsRef.current = groups;

  // ── Persist / hydrate tracker state ──────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(TRACKER_STATE_KEY).then(stored => {
      if (stored) setTrackerState(JSON.parse(stored));
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(TRACKER_STATE_KEY, JSON.stringify(trackerState));
  }, [trackerState]);

  // ── Shared helpers ────────────────────────────────────────────────────────

  const getActiveTrackers = useCallback((groupList: Group[]): ActiveTracker[] => {
    const active: ActiveTracker[] = [];
    const state = trackerStateRef.current;
    if (state.personal) active.push({ type: 'personal', id: 'personal', label: 'Personal' });
    if (state.reimbursement) active.push({ type: 'reimbursement', id: 'reimbursement', label: 'Reimbursement' });
    for (const gid of state.activeGroupIds) {
      const group = groupList.find(g => g.id === gid);
      if (group) active.push({ type: 'group', id: gid, label: group.name });
    }
    return active;
  }, []);

  const onPersonalExpenseRef = useRef(onPersonalExpense);
  onPersonalExpenseRef.current = onPersonalExpense;

  const handleTransactionDetected = useCallback(async (parsed: ParsedTransaction) => {
    const active = getActiveTrackers(groupsRef.current);
    if (active.length === 0) return;
    await showTransactionNotification(parsed, active);
  }, [getActiveTrackers]);

  const handleAddToTracker = useCallback(
    async (parsed: ParsedTransaction, trackerType: TrackerType, trackerId: string) => {
      try {
        if (trackerType === 'group') {
          await addGroupTransaction(parsed, trackerId);
        } else {
          await saveTransaction(parsed, trackerType, undefined, parsed.source ?? 'sms');
          if (trackerType === 'personal') {
            onPersonalExpenseRef.current?.(parsed.amount);
          }
        }
      } catch (err) {
        console.error('Failed to save transaction from notification:', err);
      }
    },
    [],
  );

  const handleChooseTracker = useCallback((parsed: ParsedTransaction) => {
    setPendingTransaction(parsed);
  }, []);

  // ── Android: SMS listener ─────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const hasAnyActive =
      trackerState.personal ||
      trackerState.reimbursement ||
      trackerState.activeGroupIds.length > 0;

    if (hasAnyActive && !isListening) {
      (async () => {
        const smsPerm = await requestSmsPermission();
        const notifPerm = await requestNotificationPermission();
        if (smsPerm && notifPerm) {
          await setupNotificationChannel();
          registerNotificationCallbacks(handleAddToTracker, handleChooseTracker);
          startSmsListener(handleTransactionDetected);
          setIsListening(true);
        }
      })();
    } else if (!hasAnyActive && isListening) {
      stopSmsListener();
      setIsListening(false);
    }
  }, [
    trackerState, isListening,
    handleTransactionDetected, handleAddToTracker, handleChooseTracker,
  ]);

  // ── iOS: Gmail polling on every app foreground ────────────────────────────

  const pollEmailsRef = useRef<(() => Promise<void>) | null>(null);

  pollEmailsRef.current = async () => {
    const state = trackerStateRef.current;
    // Only poll if personal tracker is ON and Gmail is connected
    if (!state.personal || !state.gmailEmail) return;

    setIsPollingEmails(true);
    try {
      const newTransactions = await fetchNewBankTransactionEmails();
      for (const parsed of newTransactions) {
        // Tag with source so the save path writes source: 'email' to Firestore
        await handleTransactionDetected({ ...parsed, source: 'email' });
      }
      // Record last poll time
      setTrackerState(prev => ({ ...prev, lastEmailPollAt: Date.now() }));
    } catch (err) {
      console.warn('[TrackerContext] Email poll failed:', err);
    } finally {
      setIsPollingEmails(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        pollEmailsRef.current?.();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Also poll immediately on mount (covers cold start)
    pollEmailsRef.current?.();

    return () => subscription.remove();
  }, []);

  // ── iOS: Outlook polling for reimbursement ────────────────────────────────

  const pollOutlookRef = useRef<(() => Promise<void>) | null>(null);

  pollOutlookRef.current = async () => {
    const state = trackerStateRef.current;
    if (!state.reimbursement || !state.outlookEmail) return;

    setIsPollingOutlook(true);
    try {
      const newTransactions = await fetchNewOutlookTransactionEmails();
      for (const parsed of newTransactions) {
        await handleTransactionDetected({ ...parsed, source: 'email' });
      }
      setTrackerState(prev => ({ ...prev, lastOutlookPollAt: Date.now() }));
    } catch (err) {
      console.warn('[TrackerContext] Outlook poll failed:', err);
    } finally {
      setIsPollingOutlook(false);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        pollOutlookRef.current?.();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    pollOutlookRef.current?.();
    return () => subscription.remove();
  }, []);

  // ── iOS: keep isListening in sync for the hero UI ────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const active = trackerState.personal || trackerState.reimbursement || trackerState.activeGroupIds.length > 0;
    setIsListening(active && !!trackerState.gmailEmail);
  }, [trackerState]);

  // ── iOS: Setup notifications channel once ─────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    setupNotificationChannel();
    registerNotificationCallbacks(handleAddToTracker, handleChooseTracker);
  }, [handleAddToTracker, handleChooseTracker]);

  // ── Trip tracker reminders ────────────────────────────────────────────────

  useEffect(() => {
    if (trackerState.activeGroupIds.length === 0) return;
    const checkTripReminders = async () => {
      const now = Date.now();
      for (const gid of trackerState.activeGroupIds) {
        const key = GROUP_TRACKER_START_PREFIX + gid;
        const stored = await AsyncStorage.getItem(key);
        if (!stored) continue;
        const startedAt = parseInt(stored, 10);
        const daysActive = Math.floor((now - startedAt) / (1000 * 60 * 60 * 24));
        if (daysActive >= TRIP_REMINDER_DAYS) {
          const group = groupsRef.current.find(g => g.id === gid);
          if (group) await showTripTrackerReminderNotification(gid, group.name, daysActive);
        }
      }
    };
    checkTripReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Toggle actions ────────────────────────────────────────────────────────

  const togglePersonal = () => {
    setTrackerState(prev => ({ ...prev, personal: !prev.personal }));
  };

  const toggleReimbursement = () => {
    setTrackerState(prev => ({ ...prev, reimbursement: !prev.reimbursement }));
  };

  const toggleGroup = async (groupId: string) => {
    const isCurrentlyActive = trackerState.activeGroupIds.includes(groupId);
    if (!isCurrentlyActive) {
      await AsyncStorage.setItem(GROUP_TRACKER_START_PREFIX + groupId, String(Date.now()));
    } else {
      await AsyncStorage.removeItem(GROUP_TRACKER_START_PREFIX + groupId);
    }
    setTrackerState(prev => {
      const active = prev.activeGroupIds.includes(groupId)
        ? prev.activeGroupIds.filter(id => id !== groupId)
        : [...prev.activeGroupIds, groupId];
      return { ...prev, activeGroupIds: active };
    });
  };

  // ── Gmail connect / disconnect (iOS) ──────────────────────────────────────

  const connectGmail = async () => {
    const email = await gmailConnect();
    if (email) {
      setTrackerState(prev => ({ ...prev, gmailEmail: email }));
      // Trigger an immediate poll after connecting
      pollEmailsRef.current?.();
    }
  };

  const disconnectGmail = async () => {
    await gmailDisconnect();
    setTrackerState(prev => ({ ...prev, gmailEmail: undefined, lastEmailPollAt: undefined }));
  };

  // ── Outlook connect / disconnect (iOS reimbursement) ─────────────────────

  const connectOutlook = async () => {
    const email = await outlookConnect();
    if (email) {
      setTrackerState(prev => ({ ...prev, outlookEmail: email }));
      pollOutlookRef.current?.();
    }
  };

  const disconnectOutlook = async () => {
    await outlookDisconnect();
    setTrackerState(prev => ({ ...prev, outlookEmail: undefined, lastOutlookPollAt: undefined }));
  };

  // ── addTransactionToTracker (used by TrackerSelectionDialog) ─────────────

  const addTransactionToTracker = async (
    parsed: ParsedTransaction,
    trackerType: TrackerType,
    trackerId: string,
  ) => {
    if (trackerType === 'group') {
      await addGroupTransaction(parsed, trackerId);
    } else {
      await saveTransaction(parsed, trackerType, undefined, parsed.source ?? 'sms');
      if (trackerType === 'personal') {
        onPersonalExpenseRef.current?.(parsed.amount);
      }
    }
  };

  const clearPendingTransaction = () => setPendingTransaction(null);

  return (
    <TrackerContext.Provider
      value={{
        trackerState,
        isListening,
        togglePersonal,
        toggleReimbursement,
        toggleGroup,
        getActiveTrackers,
        pendingTransaction,
        clearPendingTransaction,
        addTransactionToTracker,
        connectGmail,
        disconnectGmail,
        isPollingEmails,
        connectOutlook,
        disconnectOutlook,
        isPollingOutlook,
      }}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  return useContext(TrackerContext);
}
