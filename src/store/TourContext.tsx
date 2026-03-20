import React, { createContext, useContext, useCallback, useRef, ReactNode } from 'react';
import { View } from 'react-native';

export interface ElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TourContextType {
  registerElement: (key: string, ref: React.RefObject<View>) => void;
  measureElement: (key: string) => Promise<ElementRect | null>;
}

const TourContext = createContext<TourContextType>({
  registerElement: () => {},
  measureElement: async () => null,
});

export function TourProvider({ children }: { children: ReactNode }) {
  const refs = useRef<Record<string, React.RefObject<View>>>({});

  const registerElement = useCallback((key: string, ref: React.RefObject<View>) => {
    refs.current[key] = ref;
  }, []);

  const measureElement = useCallback(async (key: string): Promise<ElementRect | null> => {
    const ref = refs.current[key];
    if (!ref?.current) return null;
    return new Promise((resolve) => {
      ref.current!.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          resolve({ x, y, width, height });
        } else {
          resolve(null);
        }
      });
    });
  }, []);

  return (
    <TourContext.Provider value={{ registerElement, measureElement }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  return useContext(TourContext);
}
