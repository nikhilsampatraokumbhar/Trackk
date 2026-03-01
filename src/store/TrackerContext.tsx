import React, {
  createContext, useContext, useState, useEffect,
  useCallback, useRef, ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import { TrackerState, ParsedTransaction, ActiveTracker, Group, TrackerType } from '../models/types';
import {
  requestSmsPermission, startSmsListener, stopSmsListener,
} from '../services/SmsService';
import {
  setupNotificationChannel, requestNotificationPermission,
  showTransactionNotification, registerNotificationCallbacks,
  handleNotificationEvent,
} from '../services/NotificationService';
import { saveTransaction, addGroupTransaction } from '../services/StorageService';

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

  // Load state on mount
  useEffect(() => {
    (async () => {
      await setupNotificationChannel();
      const raw = await AsyncStorage.getItem(TRACKER_STATE_KEY);
      if (raw) setTrackerState(JSON.parse(raw));
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
      handleNotificationEvent({ type, detail }, []);
    });
    return () => unsubscribe();
  }, []);

  // Start/stop SMS listener based on tracker state
  useEffect(() => {
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
      const next = { ...prev, reimbursement: !prev.reimbursement };
      persistState(next);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(async (groupId: string) => {
    setTrackerState(prev => {
      const isActive = prev.activeGroupIds.includes(groupId);
      const next = {
        ...prev,
        activeGroupIds: isActive
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
