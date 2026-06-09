/**
 * Dispatch event atoms.
 *
 * Updated by store/listeners/dispatchListeners.ts. Components read from
 * these atoms instead of subscribing to IPC events directly.
 */

import { atom } from 'jotai';

export interface DispatchCreatedEvent {
  version: number;
  payload: { dispatchId: string; workspacePath: string };
}

export const dispatchCreatedAtom = atom<DispatchCreatedEvent | null>(null);
