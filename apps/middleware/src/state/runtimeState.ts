import type { ObservationFrame } from "../observe/types.js";
import type { Signal, Decision } from "@rpm/shared";

export type RuntimeState = {
  ok: boolean;
  serverTime: string;
  lastObservedAt?: string;
  lastTickAt?: string;
  lastRiskScore?: number;
  lastDecision?: Decision;
  lastSignals?: Signal[];
  lastFrame?: ObservationFrame;
};

export const RUNTIME_STATE: RuntimeState = {
  ok: true,
  serverTime: new Date().toISOString(),
};

export function updateRuntimeState(patch: Partial<RuntimeState>) {
  Object.assign(RUNTIME_STATE, patch, { serverTime: new Date().toISOString(), ok: true });
}
