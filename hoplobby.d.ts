// HopLobby SDK v1 types (release 1.3.0). Put this file next to your code (or in a `types` folder) to get autocompletion
// for the global `HopLobby` that https://hoplobby.com/sdk/v1/hoplobby.js defines.
// Changelog: https://developers.hoplobby.com/changelog

export interface HopLobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isYou: boolean;
  /** A HopLobby account is behind this player (their player token then carries a `uid`). */
  signedIn: boolean;
}

export type HopLobbyFeature = 'results' | 'options' | 'clock' | 'state' | 'device' | 'errors' | 'chat' | 'store' | 'late-join' | 'storage' | 'leaderboards' | 'achievements' | 'telemetry';
export type HopLobbyOptionValue = string | number | boolean;

export interface HopLobbyDevice {
  /** A touch screen is the main input (or the player turned touch controls on in HopLobby's settings). */
  touch: boolean;
  /** A phone-sized screen. */
  mobile: boolean;
  /** A gamepad is connected right now. */
  gamepad: boolean;
  width: number;
  height: number;
  pixelRatio: number;
  /** The player asked their system for less motion. */
  reducedMotion: boolean;
}

/** The player's HopLobby settings (the Esc menu). Follow them instead of asking again. */
export interface HopLobbySettings {
  /** Effective 0..1 volumes (master × channel, 0 when muted). */
  audio: { master: number; music: number; sfx: number; muted: boolean };
  graphics: 'auto' | 'potato' | 'low' | 'medium' | 'high' | 'ultra' | string;
  /** Look sensitivity: 1 is your game's default feel (0.1 to 3). */
  sensitivity: number;
  invertY: boolean;
  /** Horizontal field of view in degrees on 16:9. */
  fov: number;
  shake: boolean;
}

export interface HopLobbyContext {
  sdk: number;
  /** The HopLobby page's SDK release, e.g. "1.1.0". */
  release: string;
  /** What the page supports. Prefer HopLobby.supports(feature). */
  features: HopLobbyFeature[];
  /** Your game id on HopLobby ("dev" in a Dev Mode test lobby, "standalone" outside HopLobby). The `aud` of player tokens. */
  gameId: string;
  lobbyCode: string;
  playerId: string;
  hostId: string;
  players: HopLobbyPlayer[];
  /** The player's language on HopLobby, e.g. "en" or "pt-PT". */
  locale: string;
  /** True in a Dev Mode test lobby (and standalone). */
  dev: boolean;
  /** Opened on its own, not inside HopLobby. */
  standalone?: boolean;
  /** The lobby options the host picked, merged over the defaults you gave init({ options }). */
  options: Record<string, HopLobbyOptionValue>;
  /** People may join while the game runs (you declared lateJoin). */
  lateJoin: boolean;
  /** This frame opened after the game had started: a late join, a reload or a reconnect. Expect on('state'). */
  joinedLate: boolean;
  device: HopLobbyDevice;
  settings: HopLobbySettings;
  /** Your game sells items through HopLobby. */
  store: boolean;
}

export interface HopLobbyTokenClaims {
  iss: string;
  /** Your game id. Always check it. */
  aud: string;
  /** The player's id in this lobby. */
  sub: string;
  lobby: string;
  name: string;
  /** Stable per account and per game; absent for guests. Use it to save progress. */
  uid?: string;
  iat: number;
  exp: number;
}

export interface HopLobbyResultEntry {
  playerId: string;
  /** 1 for the winner. */
  place?: number;
  score?: number;
  /** Up to 40 characters, e.g. "3 laps" or "Survivor". */
  label?: string;
}
export interface HopLobbyResults { title?: string; entries: HopLobbyResultEntry[]; }

export interface HopLobbyChatMessage { id: string; playerId: string; name: string; text: string; at: number; }

export interface HopLobbyStoreItem {
  id: string;
  name: string;
  description: string;
  /** In cents, tax included. */
  price: number;
  currency: string;
  image?: string;
}
export interface HopLobbyEntitlement { itemId: string; purchasedAt: number; }
export type HopLobbyPurchaseResult = { status: 'purchased' | 'owned'; entitlement: HopLobbyEntitlement } | { status: 'cancelled' };

export interface HopLobbyStorageEntry { key: string; value: unknown; updatedAt: number; }

export interface HopLobbyLeaderboard {
  id: string;
  name: string | Record<string, string>;
  /** 'desc': higher is better. 'asc': lower is better (times). */
  order: 'desc' | 'asc';
  format: 'number' | 'time' | 'percent';
  /** 'server': only your server may submit scores. */
  writes: 'game' | 'server';
}
export interface HopLobbyLeaderboardEntry { rank: number; name: string; score: number; at: number; isYou?: boolean; }
export interface HopLobbyLeaderboardPage { board: HopLobbyLeaderboard; entries: HopLobbyLeaderboardEntry[]; total: number; you: HopLobbyLeaderboardEntry | null; }

export interface HopLobbyAchievement {
  id: string; name: string; description: string; icon?: string; hidden: boolean;
  unlocked: boolean; unlockedAt: number | null;
  /** Share of your game's players who have it, 0–100 (null until enough players). */
  rarity: number | null;
}

/** Every rejected SDK promise is an Error with a code. */
export interface HopLobbyError extends Error {
  code: 'unsupported' | 'sign_in_required' | 'unavailable' | 'not_found' | 'forbidden' | 'limit' | 'failed' | 'timeout' | 'not_ready' | string;
}

export interface HopLobbyEvents {
  message: (data: unknown, from: string) => void;
  players: (players: HopLobbyPlayer[], hostId: string) => void;
  join: (player: HopLobbyPlayer) => void;
  leave: (player: HopLobbyPlayer) => void;
  host: (hostId: string, previousHostId: string) => void;
  peers: (online: string[]) => void;
  relay: (status: 'connecting' | 'open' | 'closed') => void;
  state: (state: unknown, from: string) => void;
  settings: (settings: HopLobbySettings, device: HopLobbyDevice) => void;
  chat: (message: HopLobbyChatMessage) => void;
  purchase: (entitlement: HopLobbyEntitlement) => void;
  /** An achievement this player just unlocked (HopLobby also shows a toast). */
  achievement: (achievement: HopLobbyAchievement) => void;
  pause: () => void;
  resume: () => void;
}

export interface HopLobbyInitOptions {
  timeoutMs?: number;
  /** Send uncaught errors and rejected promises to your portal's Errors page. Default true. */
  captureErrors?: boolean;
  /** Defaults for your lobby options: used standalone and for any key the lobby doesn't have. */
  options?: Record<string, HopLobbyOptionValue>;
  /** Frame-rate summaries for your portal's Analytics page. Default true. */
  telemetry?: boolean;
  /** Your own build label (e.g. '1.4.2'), so errors and performance can be compared per build. */
  build?: string;
}

export interface HopLobbySdk {
  readonly version: number;
  readonly release: string;
  init(options?: HopLobbyInitOptions): Promise<HopLobbyContext>;
  readonly context: HopLobbyContext | null;
  readonly players: HopLobbyPlayer[];
  readonly me: HopLobbyPlayer | null;
  readonly isHost: boolean;
  readonly options: Record<string, HopLobbyOptionValue>;
  readonly device: HopLobbyDevice;
  readonly settings: HopLobbySettings;
  supports(feature: HopLobbyFeature): boolean;
  progress(fraction: number, label?: string): void;
  ready(): void;
  send(data: unknown, to?: string | string[]): boolean;
  /** The server clock in ms, the same for every player. */
  now(): number;
  /** Round trip to the relay in ms (null until measured). */
  readonly latency: number | null;
  /** Round trip to another player in ms. */
  ping(playerId: string): Promise<number>;
  /** Host: describe the game for players who join, reload or reconnect mid-game. Return undefined to send nothing. */
  syncState(provider: (playerId: string) => unknown): () => void;
  requestState(): void;
  /** A portrait as an image data: URL (WebP, transparent background). */
  avatar(playerId?: string, options?: { format?: 'portrait'; size?: number }): Promise<string>;
  /** A rigged glTF binary of the player's own character, with the clips idle, walk, run, jump, fall, wave, cheer, shrug, sit and sit-table. */
  avatar(playerId: string | undefined, options: { format: 'glb'; size?: number }): Promise<ArrayBuffer>;
  playerToken(): Promise<{ token: string; expiresAt: number }>;
  exit(): void;
  /** Host only. With results, the lobby shows a results card. */
  endGame(results?: HopLobbyResults): void;
  reportError(error: unknown, where?: string): void;
  chat: {
    send(text: string): boolean;
    open(): boolean;
    close(): boolean;
    /** Show or hide HopLobby's chat button over your game. */
    button(visible: boolean): boolean;
  };
  /** Cloud saves (signed-in players; localStorage when standalone). Keys starting with "server." are read-only here. */
  storage: {
    readonly available: boolean;
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<true>;
    remove(key: string): Promise<true>;
    list(): Promise<HopLobbyStorageEntry[]>;
  };
  leaderboards: {
    list(): Promise<HopLobbyLeaderboard[]>;
    top(id: string, options?: { limit?: number; around?: 'me' }): Promise<HopLobbyLeaderboardPage>;
    /** Keeps the player's best. Refused (code 'forbidden') on boards only your server writes. */
    submit(id: string, score: number): Promise<{ best: boolean; entry: HopLobbyLeaderboardEntry }>;
  };
  achievements: {
    list(): Promise<HopLobbyAchievement[]>;
    unlock(id: string): Promise<{ achievement: HopLobbyAchievement; new: boolean }>;
  };
  store: {
    items(): Promise<HopLobbyStoreItem[]>;
    owned(): Promise<HopLobbyEntitlement[]>;
    purchase(itemId: string): Promise<HopLobbyPurchaseResult>;
  };
  on<E extends keyof HopLobbyEvents>(event: E, listener: HopLobbyEvents[E]): () => void;
  off<E extends keyof HopLobbyEvents>(event: E, listener: HopLobbyEvents[E]): void;
}

declare global {
  interface Window { HopLobby: HopLobbySdk; }
  const HopLobby: HopLobbySdk;
}
