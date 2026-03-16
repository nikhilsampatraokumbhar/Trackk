import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkContextType {
  isConnected: boolean;
  /** True briefly after reconnecting — auto-clears after 3s */
  justReconnected: boolean;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  justReconnected: false,
});

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasDisconnected = useRef(false);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // NetInfo uses OS-level network change events — no polling, no battery drain
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const connected = state.isConnected ?? true;
      setIsConnected(connected);

      if (!connected) {
        wasDisconnected.current = true;
        // Clear any pending "back online" toast
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        setJustReconnected(false);
      } else if (wasDisconnected.current) {
        // Just came back online
        wasDisconnected.current = false;
        setJustReconnected(true);
        reconnectTimer.current = setTimeout(() => {
          setJustReconnected(false);
          reconnectTimer.current = null;
        }, 3000);
      }
    });

    return () => {
      unsubscribe();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  return (
    <NetworkContext.Provider value={{ isConnected, justReconnected }}>
      {children}
    </NetworkContext.Provider>
  );
}
