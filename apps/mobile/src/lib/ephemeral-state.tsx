import { MobileBehaviourProvider, useMobileBehaviour } from './behaviour';

/** Backwards-compatible name retained while existing screens migrate. */
export const EphemeralStateProvider = MobileBehaviourProvider;

export function useEphemeralPlaceState() {
  return useMobileBehaviour();
}
