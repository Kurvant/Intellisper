import { TelemetryEvent } from '@intelblocks/shared';
import React from 'react';

/**
 * Frontend telemetry relay (Segment + PostHog) has been removed for this
 * edition — no analytics SDK is loaded and no user data leaves the browser.
 * The provider and useTelemetry() surface are intentionally preserved as a
 * dormant no-op so existing capture()/reset() call sites keep compiling and a
 * future first-party analytics backend can be wired in without churn.
 */
interface TelemetryProviderProps {
  children: React.ReactNode;
}

const TelemetryProvider = ({ children }: TelemetryProviderProps) => {
  // no-op: no external analytics relay
  const reset = () => {};
  const capture = (_event: TelemetryEvent) => {};

  return (
    <TelemetryContext.Provider value={{ capture, reset }}>
      {children}
    </TelemetryContext.Provider>
  );
};

interface TelemetryContextType {
  capture: (event: TelemetryEvent) => void;
  reset: () => void;
}

const TelemetryContext = React.createContext<TelemetryContextType>({
  capture: () => {},
  reset: () => {},
});

export const useTelemetry = () => React.useContext(TelemetryContext);

export default TelemetryProvider;
