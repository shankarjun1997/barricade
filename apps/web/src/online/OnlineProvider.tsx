import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ClientMessage,
  LobbySnapshot,
  MatchSnapshot,
  PublicPlayer,
  QueueStatus,
  RoomSnapshot,
  ServerMessage,
} from '@barricade/protocol';
import type { ModeId, Move } from '@barricade/engine';
import { useApp } from '../state/AppContext.js';
import { createId, loadJSON, saveJSON } from '../lib/storage.js';
import { validateName } from '../lib/profile.js';

export type OnlineStatus =
  | 'unconfigured'
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline';

interface StoredIdentity {
  readonly playerId: string;
  readonly name: string;
  readonly token?: string;
}

export interface OnlineNotice {
  readonly id: number;
  readonly kind: 'info' | 'success' | 'warning' | 'error';
  readonly message: string;
}

export interface OnlineContextValue {
  readonly status: OnlineStatus;
  readonly configured: boolean;
  readonly serverUrl: string | null;
  readonly identity: StoredIdentity;
  readonly self: PublicPlayer | null;
  readonly lobby: LobbySnapshot | null;
  readonly queue: QueueStatus;
  readonly room: RoomSnapshot | null;
  readonly match: MatchSnapshot | null;
  readonly drawOffer: { matchId: string; from: PublicPlayer } | null;
  readonly rematchRequests: readonly PublicPlayer[];
  readonly notice: OnlineNotice | null;
  readonly sessionNotice: string | null;
  readonly latencyMs: number | null;
  readonly serverOffset: number;
  connect: () => void;
  retry: () => void;
  resetIdentity: () => void;
  setName: (name: string) => boolean;
  quickMatch: (modeId: ModeId, timeControlId: string) => void;
  cancelQueue: () => void;
  createRoom: (modeId: ModeId, timeControlId: string, visibility: 'public' | 'private') => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  move: (matchId: string, move: Move, clientMoveId: string) => void;
  resign: (matchId: string) => void;
  offerDraw: (matchId: string) => void;
  respondDraw: (matchId: string, accept: boolean) => void;
  requestRematch: (matchId: string) => void;
  respondRematch: (matchId: string, accept: boolean) => void;
  leaveMatch: (matchId: string) => void;
  clearNotice: () => void;
}

const OnlineContext = createContext<OnlineContextValue | null>(null);
const IDENTITY_KEY = 'online.identity.v1';

function normalizeServerUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') url.protocol = 'wss:';
    if (url.protocol === 'http:') url.protocol = 'ws:';
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws';
    return url.toString();
  } catch {
    return value;
  }
}

function resolveServerUrl(): string | null {
  const explicit = normalizeServerUrl(import.meta.env.VITE_WS_URL as string | undefined);
  if (explicit) return explicit;
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `ws://${window.location.hostname}:8787/ws`;
  }
  return null;
}

function loadIdentity(fallbackName: string): StoredIdentity {
  const stored = loadJSON<StoredIdentity | null>(IDENTITY_KEY, null);
  if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored.playerId) && stored.name) {
    return stored;
  }
  return {
    playerId: createId('player'),
    name: validateName(fallbackName) === null ? fallbackName.trim() : 'Guest',
  };
}

export function OnlineProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile, toast } = useApp();
  const serverUrl = useMemo(resolveServerUrl, []);
  const configured = serverUrl !== null;
  const [identity, setIdentity] = useState<StoredIdentity>(() => loadIdentity(profile.name));
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const [status, setStatus] = useState<OnlineStatus>(configured ? 'idle' : 'unconfigured');
  const [self, setSelf] = useState<PublicPlayer | null>(null);
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [queue, setQueue] = useState<QueueStatus>({ state: 'idle' });
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [drawOffer, setDrawOffer] = useState<{ matchId: string; from: PublicPlayer } | null>(null);
  const [rematchRequests, setRematchRequests] = useState<readonly PublicPlayer[]>([]);
  const [notice, setNotice] = useState<OnlineNotice | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const stoppedRef = useRef(false);
  const noticeId = useRef(1);
  const serverUrlRef = useRef(serverUrl);
  serverUrlRef.current = serverUrl;

  const pushNotice = useCallback(
    (kind: OnlineNotice['kind'], message: string) => {
      setNotice({ id: noticeId.current++, kind, message });
    },
    [],
  );

  const handleMessageRef = useRef<(message: ServerMessage) => void>(() => undefined);

  handleMessageRef.current = (message: ServerMessage) => {
    switch (message.type) {
      case 'welcome': {
        setSelf(message.player);
        setStatus('online');
        attemptsRef.current = 0;
        setSessionNotice(null);
        setServerOffset(message.serverNow - Date.now());
        const next: StoredIdentity = {
          playerId: message.player.id,
          name: message.player.name,
          token: message.sessionToken,
        };
        identityRef.current = next;
        setIdentity(next);
        saveJSON(IDENTITY_KEY, next);
        if (message.resumed) pushNotice('success', 'Reconnected to your online session.');
        return;
      }
      case 'error':
        pushNotice('error', message.message);
        if (message.code === 'AUTH_FAILED') {
          setSessionNotice('Your guest session could not be verified. Reset your online identity to continue as a new guest.');
        }
        return;
      case 'lobby':
        setLobby(message.lobby);
        setServerOffset(message.lobby.serverNow - Date.now());
        return;
      case 'queue':
        setQueue(message.queue);
        return;
      case 'room':
        setRoom(message.room);
        if (!message.room) setRematchRequests([]);
        return;
      case 'match':
      case 'match_end':
        setMatch(message.match);
        setServerOffset(message.match.serverNow - Date.now());
        setRematchRequests(message.match.rematchRequests);
        if (!message.match.drawOfferBy) setDrawOffer(null);
        return;
      case 'draw_offer':
        setDrawOffer({ matchId: message.matchId, from: message.from });
        return;
      case 'rematch_state':
        setRematchRequests(message.requestedBy);
        return;
      case 'notice':
        pushNotice(message.kind, message.message);
        return;
      case 'pong':
        setLatencyMs(Math.max(0, Date.now() - message.t));
        setServerOffset(message.serverNow - Date.now());
        return;
      case 'session_replaced':
        stoppedRef.current = true;
        setStatus('offline');
        setSessionNotice('This online session was opened in another tab or device. Only one connection can control a player.');
        return;
      case 'server_restart':
        pushNotice('warning', 'The game server restarted. Your match was restored and clocks were paused during downtime.');
        return;
      default:
        return;
    }
  };

  const openSocket = useCallback(() => {
    const url = serverUrlRef.current;
    if (!url) return;
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return;
    }

    setStatus(attemptsRef.current > 0 ? 'reconnecting' : 'connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      setStatus('offline');
      setSessionNotice('The online server URL is invalid.');
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      attemptsRef.current = 0;
      const current = identityRef.current;
      socket.send(
        JSON.stringify({
          type: 'hello',
          playerId: current.playerId,
          name: current.name,
          ...(current.token ? { token: current.token } : {}),
          version: 1,
        } satisfies ClientMessage),
      );
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as ServerMessage;
        handleMessageRef.current(parsed);
      } catch {
        // Ignore malformed frames from the network; the server is authoritative.
      }
    };

    socket.onerror = () => {
      // The close handler performs reconnection scheduling.
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) socketRef.current = null;
      if (stoppedRef.current) return;
      if (event.code === 4001) {
        stoppedRef.current = true;
        setStatus('offline');
        setSessionNotice('This online session was opened in another tab or device.');
        return;
      }
      if (event.code === 4003) {
        setStatus('offline');
        setSessionNotice((current) => current ?? 'The online server rejected this guest session.');
        return;
      }
      attemptsRef.current += 1;
      setStatus('reconnecting');
      const delay = Math.min(10_000, 800 * 2 ** Math.min(attemptsRef.current, 4));
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(() => openSocket(), delay);
    };
  }, []);

  const connect = useCallback(() => {
    stoppedRef.current = false;
    if (!configured) return;
    openSocket();
  }, [configured, openSocket]);

  const retry = useCallback(() => {
    stoppedRef.current = false;
    attemptsRef.current = 0;
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    const socket = socketRef.current;
    if (socket) {
      socketRef.current = null;
      stoppedRef.current = true;
      socket.close();
      stoppedRef.current = false;
    }
    openSocket();
  }, [openSocket]);

  const send = useCallback(
    (message: ClientMessage): boolean => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      pushNotice('warning', 'Not connected to the online server. Reconnecting…');
      connect();
      return false;
    },
    [connect, pushNotice],
  );

  const resetIdentity = useCallback(() => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    const socket = socketRef.current;
    if (socket) {
      stoppedRef.current = true;
      socket.close();
      socketRef.current = null;
    }
    const next: StoredIdentity = {
      playerId: createId('player'),
      name: validateName(identityRef.current.name) === null ? identityRef.current.name : 'Guest',
    };
    identityRef.current = next;
    setIdentity(next);
    saveJSON(IDENTITY_KEY, next);
    setSelf(null);
    setMatch(null);
    setRoom(null);
    setQueue({ state: 'idle' });
    setDrawOffer(null);
    setRematchRequests([]);
    setSessionNotice(null);
    setStatus('idle');
    attemptsRef.current = 0;
    stoppedRef.current = false;
    window.setTimeout(() => openSocket(), 50);
    toast('New online identity created.', 'success');
  }, [openSocket, toast]);

  const setName = useCallback(
    (rawName: string): boolean => {
      const problem = validateName(rawName);
      if (problem) {
        pushNotice('error', problem);
        return false;
      }
      const name = rawName.trim();
      const next = { ...identityRef.current, name };
      identityRef.current = next;
      setIdentity(next);
      saveJSON(IDENTITY_KEY, next);
      updateProfile((current) => ({ ...current, name }));
      send({ type: 'rename', name });
      return true;
    },
    [pushNotice, send, updateProfile],
  );

  const quickMatch = useCallback(
    (modeId: ModeId, timeControlId: string) => {
      send({ type: 'queue_join', modeId, timeControlId });
    },
    [send],
  );

  const cancelQueue = useCallback(() => send({ type: 'queue_leave' }), [send]);
  const createRoom = useCallback(
    (modeId: ModeId, timeControlId: string, visibility: 'public' | 'private') => {
      send({ type: 'room_create', modeId, timeControlId, visibility });
    },
    [send],
  );
  const joinRoom = useCallback((code: string) => send({ type: 'room_join', code }), [send]);
  const leaveRoom = useCallback(() => send({ type: 'room_leave' }), [send]);
  const move = useCallback(
    (matchId: string, gameMove: Move, clientMoveId: string) =>
      send({ type: 'move', matchId, move: gameMove, clientMoveId }),
    [send],
  );
  const resign = useCallback((matchId: string) => send({ type: 'resign', matchId }), [send]);
  const offerDraw = useCallback((matchId: string) => send({ type: 'draw_offer', matchId }), [send]);
  const respondDraw = useCallback(
    (matchId: string, accept: boolean) => send({ type: 'draw_respond', matchId, accept }),
    [send],
  );
  const requestRematch = useCallback(
    (matchId: string) => send({ type: 'rematch_request', matchId }),
    [send],
  );
  const respondRematch = useCallback(
    (matchId: string, accept: boolean) => send({ type: 'rematch_respond', matchId, accept }),
    [send],
  );
  const leaveMatch = useCallback(
    (matchId: string) => {
      send({ type: 'match_leave', matchId });
      setMatch(null);
      setDrawOffer(null);
      setRematchRequests([]);
    },
    [send],
  );
  const clearNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      const socket = socketRef.current;
      if (socket) socket.close();
    };
  }, []);

  useEffect(() => {
    if (status !== 'online') return;
    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', t: Date.now() } satisfies ClientMessage));
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onOnline = () => {
      if (status === 'reconnecting' || status === 'offline') retry();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [status, retry]);

  const value = useMemo<OnlineContextValue>(
    () => ({
      status,
      configured,
      serverUrl,
      identity,
      self,
      lobby,
      queue,
      room,
      match,
      drawOffer,
      rematchRequests,
      notice,
      sessionNotice,
      latencyMs,
      serverOffset,
      connect,
      retry,
      resetIdentity,
      setName,
      quickMatch,
      cancelQueue,
      createRoom,
      joinRoom,
      leaveRoom,
      move,
      resign,
      offerDraw,
      respondDraw,
      requestRematch,
      respondRematch,
      leaveMatch,
      clearNotice,
    }),
    [
      status,
      configured,
      serverUrl,
      identity,
      self,
      lobby,
      queue,
      room,
      match,
      drawOffer,
      rematchRequests,
      notice,
      sessionNotice,
      latencyMs,
      serverOffset,
      connect,
      retry,
      resetIdentity,
      setName,
      quickMatch,
      cancelQueue,
      createRoom,
      joinRoom,
      leaveRoom,
      move,
      resign,
      offerDraw,
      respondDraw,
      requestRematch,
      respondRematch,
      leaveMatch,
      clearNotice,
    ],
  );

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}

export function useOnline(): OnlineContextValue {
  const context = useContext(OnlineContext);
  if (!context) throw new Error('useOnline must be used inside OnlineProvider');
  return context;
}
