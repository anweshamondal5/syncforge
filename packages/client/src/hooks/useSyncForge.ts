import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { SyncForgeProvider } from '../lib/sync/SyncForgeProvider';
import { getOrCreateUserProfile, saveUserProfile } from '../lib/sync/awareness';
import {
  ConnectionState,
  SyncTelemetry,
  UserProfile,
  CRDTOperationLog,
  DecodedStateVectorEntry,
} from '@syncforge/shared';

export function useSyncForge(docId: string) {
  const [provider, setProvider] = useState<SyncForgeProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [userProfile, setUserProfileState] = useState<UserProfile>(getOrCreateUserProfile);
  const [peers, setPeers] = useState<Map<number, any>>(new Map());
  const [timeline, setTimeline] = useState<CRDTOperationLog[]>([]);
  const [decodedStateVector, setDecodedStateVector] = useState<DecodedStateVectorEntry[]>([]);
  const [telemetry, setTelemetry] = useState<SyncTelemetry>({
    clientId: 0,
    clock: 0,
    stateVectorEntries: 0,
    receivedUpdates: 0,
    sentUpdates: 0,
    documentBytes: 0,
    activePeers: 0,
    pendingUpdates: 0,
  });

  const providerRef = useRef<SyncForgeProvider | null>(null);

  useEffect(() => {
    if (!docId) return;

    const doc = new Y.Doc();
    const currentProfile = getOrCreateUserProfile();
    const newProvider = new SyncForgeProvider(docId, doc, currentProfile);

    providerRef.current = newProvider;
    setYdoc(doc);
    setProvider(newProvider);

    const unsubStatus = newProvider.onStatus(setStatus);
    const unsubTelemetry = newProvider.onTelemetry((t) => {
      setTelemetry(t);
      if (providerRef.current) {
        setDecodedStateVector(providerRef.current.getDecodedStateVector());
      }
    });
    const unsubPeers = newProvider.onPeers(setPeers);
    const unsubTimeline = newProvider.onTimeline(setTimeline);

    return () => {
      unsubStatus();
      unsubTelemetry();
      unsubPeers();
      unsubTimeline();
      newProvider.destroy();
      providerRef.current = null;
    };
  }, [docId]);

  const updateProfile = (name: string, color: string) => {
    const updated: UserProfile = { ...userProfile, name, color };
    setUserProfileState(updated);
    saveUserProfile(updated);
    if (providerRef.current) {
      providerRef.current.setUserProfile(updated);
    }
  };

  const toggleOffline = () => {
    if (!providerRef.current) return;
    if (status === 'offline') {
      providerRef.current.connect();
    } else {
      providerRef.current.disconnect();
    }
  };

  const clearTimeline = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.clearTimeline();
    }
  }, []);

  return {
    provider,
    ydoc,
    status,
    userProfile,
    updateProfile,
    peers,
    telemetry,
    timeline,
    decodedStateVector,
    clearTimeline,
    toggleOffline,
  };
}
