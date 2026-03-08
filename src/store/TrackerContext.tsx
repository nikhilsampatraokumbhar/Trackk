import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, ReactNode,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { TrackerState, ParsedTransaction, ActiveTracker, Group, TrackerType } from '../models/types';
import { Platform } from 'react-native';
import {
  requestSmsPermission, startSmsListener, stopSmsListener,
} from '../services/SmsService';
import {
  setupNotificationChannel, requestNotificationPermission,
  showTransactionNotification, registerNotificationCallbacks,
  handleNotificationEvent,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction } from '../services/StorageService';
import { initDeepLinkListener } from '../services/DeepLinkService';

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

  const groupsRef = useRef(groups);
  const userIdRef = useRef(userId);
  const trackerStateRef = useRef(trackerState);
  const isListeningRef = useRef(false);

  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { trackerStateRef.current = trackerState; }, [trackerState]);

  // Load state on mount; also recover pending transaction if app was cold-launched
  // from a "Choose Tracker" notification action
  useEffect(() => {
    (async () => {
      await setupNotificationChannel();
      const raw = await AsyncStorage.getItem(TRACKER_STATE_KEY);
      if (raw) setTrackerState(JSON.parse(raw));

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

  const addTransactionToTracker = useCallback(async (
    parsed: ParsedTransaction,
    trackerType: TrackerType,
    trackerId: string,
  ) => {
    const uid = userIdRef.current;
    if (trackerType === 'group') {
      await addGroupTransaction(parsed, trackerId, uid);
    } else {
      await saveTransaction(parsed, trackerType, uid);
    }
  }, []);

  const clearPendingTransaction = useCallback(() => {
    setPendingTransaction(null);
  }, []);

  return (
    <TrackerContext.Provider value={{
      trackerState,
      isListening,
      togglePersonal,
      toggleReimbursement,
      toggleGroup,
      getActiveTrackers,
      pendingTransaction,
      clearPendingTransaction,
      addTransactionToTracker,
    }}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  return useContext(TrackerContext);
}
