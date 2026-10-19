// HopLobby SDK v1 types (release 1.7.0). Put this file next to your code (or in a `types` folder) to get autocompletion
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

export type HopLobbyFeature = 'results' | 'options' | 'clock' | 'state' | 'device' | 'errors' | 'chat' | 'store' | 'late-join' | 'storage' | 'leaderboards' | 'achievements' | 'telemetry' | 'menu' | 'lobby-options' | 'session';
export type HopLobbyOptionValue = string | number | boolean;
/** Text shown to players: plain English, or per language ({ en: 'Rounds', 'pt-PT': 'Rondas' }). */
export type HopLobbyText = string | Record<string, string>;

/** A lobby option (init({ lobbyOptions }), hoplobby.json "options") or a menu setting (menu.set({ settings })). */
export type HopLobbyOption =
  | { key: string; label: HopLobbyText; hint?: HopLobbyText; type: 'choice'; choices: { value: string | number; label: HopLobbyText }[]; default: string | number }
  | { key: string; label: HopLobbyText; hint?: HopLobbyText; type: 'toggle'; default: boolean }
  | { key: string; label: HopLobbyText; hint?: HopLobbyText; type: 'range'; min: number; max: number; step?: number; default: number };
/** Where a menu setting goes in HopLobby's Esc menu: your own "Game" tab (default), or under one of HopLobby's tabs. */
export type HopLobbyMenuSetting = HopLobbyOption & { section?: 'game' | 'graphics' | 'audio' | 'controls' };
export type HopLobbySharedSetting = 'graphics' | 'fov' | 'shake' | 'audio' | 'sensitivity' | 'invertY' | 'touch';
export interface HopLobbyMenu {
  /** Personal settings (up to 24), saved per player on their device. Read them from HopLobby.prefs. */
  settings?: HopLobbyMenuSetting[];
  /** Your key list for the Controls page (up to 8 groups, 24 lines). Esc is added for you. */
  controls?: { title: HopLobbyText; keys: { keys: string[]; action: HopLobbyText }[] }[];
  /** Up to 4 buttons under Resume. Pressing one closes the menu and fires on('menuAction', id). */
  actions?: { id: string; label: HopLobbyText }[];
  /** Which of HopLobby's own settings your game uses (default: all). Graphics quality is always shown: every game has presets. */
  shared?: HopLobbySharedSetting[];
  /** One line under your key list. */
  controlsNote?: HopLobbyText;
}

export type HopLobbyGraphicsLevel = 'potato' | 'low' | 'medium' | 'high' | 'ultra';
/** The player's graphics preset as numbers. Every HopLobby game renders at it (platform rule: Graphics presets). */
export interface HopLobbyGraphics {
  level: HopLobbyGraphicsLevel;
  /** The player left it on Auto: HopLobby picked `level` for this device. You may step down further if frames drop. */
  auto: boolean;
  /** Render at min(devicePixelRatio, pixelRatio). Potato renders below 1. */
  pixelRatio: number;
  shadows: 'off' | 'simple' | 'soft';
  antialias: boolean;
  /** Post effects: bloom, depth of field, screen-space effects. */
  effects: boolean;
  /** Share of particles, decals and debris to spawn, 0..1. */
  particles: number;
  /** Share of your far draw distance / level of detail, 0..1. */
  drawDistance: number;
  /** 0.5 = half-resolution textures. */
  textureScale: number;
}

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
  /** What the player picked in the Graphics quality setting. */
  graphics: 'auto' | HopLobbyGraphicsLevel | string;
  /** The preset to render with: `graphics`, or for 'auto' the one HopLobby picked for this device. HopLobby.graphics has the numbers. */
  graphicsLevel: HopLobbyGraphicsLevel;
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
  /** The player's saved values for your menu settings from last time (checked once you call menu.set). */
  prefs: Record<string, HopLobbyOptionValue>;
  /** The game session (1.7): null on a HopLobby page without sessions. Standalone: a one-player round that is always on. */
  session: HopLobbySession | null;
}

/** Where the session is: HopLobby's pre-match lobby, the countdown, a running round, or its results and rematch window. */
export type HopLobbySessionPhase = 'lobby' | 'countdown' | 'playing' | 'results';
/**
 * The game session (1.7, HopLobby.session): HopLobby runs the pre-match lobby, Ready, the countdown, the rounds and the
 * rematch window; your game follows them. Start your match when `phase` becomes 'playing' with a new `round` and
 * `you.inRoster`; a later 'playing' with a higher round is a rematch.
 */
export interface HopLobbySession {
  phase: HopLobbySessionPhase;
  /** Rounds started so far (0 before the first match). */
  round: number;
  /** When this phase began (server ms: compare with HopLobby.now()). */
  since: number;
  /** countdown: when the round begins. results: when the rematch window closes. lobby (public sessions): the latest start. */
  deadline?: number;
  /** The server clock when HopLobby made this snapshot. */
  now: number;
  /** Who plays the current (or last) round. Players not in it wait for the next one. */
  roster: string[];
  /** This player: has the game loaded, is ready for the next round, plays the current one. */
  you: { inGame: boolean; ready: boolean; inRoster: boolean };
  /** Everyone in the lobby: loading the game, in it, or not in it (null: on the lobby page or away). */
  players: { id: string; name: string; inGame: 'loading' | 'in' | null; ready: boolean }[];
  /** results: the round's winners (player ids), when known. */
  winners?: string[];
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
  /** In cents, before tax (any VAT/sales tax is added at checkout). */
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
  code: 'unsupported' | 'invalid' | 'sign_in_required' | 'unavailable' | 'not_found' | 'forbidden' | 'limit' | 'failed' | 'timeout' | 'not_ready' | 'not_host' | 'not_now' | string;
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
  /** The player's graphics preset changed (from HopLobby's Esc menu). */
  graphics: (graphics: HopLobbyGraphics) => void;
  /** The player changed one of your menu settings (`key`), or reset them. Every value is passed. */
  prefs: (prefs: Record<string, HopLobbyOptionValue>, key?: string) => void;
  /** The player pressed one of your menu buttons (menu.set({ actions })). */
  menuAction: (id: string) => void;
  /** The lobby options changed while the game runs (Dev Mode, after init({ lobbyOptions }) declared new ones). */
  options: (options: Record<string, HopLobbyOptionValue>) => void;
  chat: (message: HopLobbyChatMessage) => void;
  purchase: (entitlement: HopLobbyEntitlement) => void;
  /** An achievement this player just unlocked (HopLobby also shows a toast). */
  achievement: (achievement: HopLobbyAchievement) => void;
  /** The game session changed: phase, round, roster or who's ready (1.7). */
  session: (session: HopLobbySession, previous: HopLobbySession | null) => void;
  pause: () => void;
  resume: () => void;
}

export interface HopLobbyInitOptions {
  timeoutMs?: number;
  /** Send uncaught errors and rejected promises to your portal's Errors page. Default true. */
  captureErrors?: boolean;
  /**
   * Your lobby options: the host picks them in the lobby's Match settings before launch. A Dev Mode lobby takes this
   * list from your game (it shows from the next time the lobby waits). A published game's come from its submission
   * (hoplobby.json "options"); you're warned in the console when this list differs.
   */
  lobbyOptions?: HopLobbyOption[];
  /** Defaults for lobby option keys: used standalone and for any key the lobby doesn't have. */
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
  /** The player's graphics preset as numbers to render with. Every HopLobby game follows it. */
  readonly graphics: HopLobbyGraphics;
  /** The player's values for your menu settings (menu.set). */
  readonly prefs: Record<string, HopLobbyOptionValue>;
  /** Your settings, key list and buttons in HopLobby's Esc menu: no menu of your own needed. */
  menu: {
    /** Declare (or replace) your part of the menu. Resolves with the player's values; rejects with code 'invalid' and the reason. */
    set(menu: HopLobbyMenu): Promise<Record<string, HopLobbyOptionValue>>;
    /** Open HopLobby's menu yourself, e.g. from your own settings button or key. */
    open(view?: 'main' | 'settings' | 'controls'): boolean;
  };
  supports(feature: HopLobbyFeature): boolean;
  /**
   * The game session (1.7): HopLobby's pre-match lobby, rounds and rematch. With session: true on your submission your
   * frame stays loaded through all of it; otherwise HopLobby loads it fresh for each round.
   */
  session: {
    /** The latest session, or null on a page without sessions. */
    get(): HopLobbySession | null;
    /** Ready (or not) for the next round, as HopLobby's Ready button. Rejects with code 'not_now' during a match or before the game is loaded. */
    ready(ready?: boolean): Promise<HopLobbySession | null>;
    /** Host only: finish the round with your results (as endGame), into the results and rematch window. Rejects with 'not_host' otherwise. */
    end(results?: HopLobbyResults): Promise<HopLobbySession | null>;
  };
  progress(fraction: number, label?: string): void;
  /** Your game finished loading (not the round's Ready: that's session.ready()). */
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
