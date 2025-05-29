export interface SessionOptions {
  /** 
   * Function that calls your backend to retrieve an access token which 
   * determines what destinations the client can read and write to. 
   */
  jwtProvider: () => Promise<string>;
  
  /** WebSocket URL (defaults to https://ws.prod.exoquic.com) */
  url?: string;
  
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectTimeout?: number;
  
  /** Maximum reconnect delay in ms (default: 10000) */
  maxReconnectTimeout?: number;
  
  /** Whether to reconnect on close (default: true) */
  shouldReconnect?: boolean;
  
  /** Whether to cache events (default: true) */
  cacheEnabled?: boolean;
  
  /** IndexedDB database name (default: 'exoquic-cache') */
  cacheDbName?: string;
  
  /** Size of deduplication window (default: 1000) */
  dedupWindow?: number;
  
  /** Cache mode: 'never', 'end', or 'start' (default: 'start') */
  cacheMode?: 'never' | 'end' | 'start';
}

/**
 * Internal configuration with defaults applied.
 */
export class Config {
  readonly jwtProvider: () => Promise<string>;
  readonly url: string;
  readonly reconnectTimeout: number;
  readonly maxReconnectTimeout: number;
  readonly shouldReconnect: boolean;
  readonly cacheEnabled: boolean;
  readonly cacheDbName: string;
  readonly dedupWindow: number;
  readonly cacheMode: 'never' | 'end' | 'start';

  constructor(options: SessionOptions) {
    // Required options
    this.jwtProvider = options.jwtProvider;
    
    // Optional options with defaults
    this.url = options.url || this.defaultWsUrl();
    this.reconnectTimeout = options.reconnectTimeout || 1000;
    this.maxReconnectTimeout = options.maxReconnectTimeout || 10000;
    this.shouldReconnect = options.shouldReconnect !== false;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheDbName = options.cacheDbName || 'exoquic-cache-v3';
    this.dedupWindow = options.dedupWindow || 1000;
    this.cacheMode = options.cacheMode || 'start';
  }

  private defaultWsUrl(): string {
    return `wss://prod.ws.exoquic.com/v3/connect`;
  }
}

// UUID type alias
export type UUID = string;

// Event handler type
export type EventHandler = (batch: unknown[], dest: string) => void;

/**
 * Frame types for the protocol
 */

// Client -> Server frames
export interface SubscribeFrame { 
  type: 'subscribe'; 
  destination: string;
  cid: number;
  v?: 3;
  sid?: string;
  gid?: UUID;
  cache?: 'never' | 'end' | 'start';
}

export interface PublishFrame {
  v: 3; 
  type: 'publish';
  destination: string; 
  data: string;
}

// Server -> Client frames
export interface SubAckFrame {
  v: 3; 
  type: 'suback'; 
  sid: string;
}

export interface EventFrame {
  v: 3; 
  type: 'event'; 
  src: number;
  batch: Batch;
  sid: string;
}

export interface OnSrcFrame {
  v: 3; 
  type: 'onsrc';
  src: number;
  sid: string;
}

export interface ErrorFrame {
  v: 3; 
  type: 'error';
  code: string; 
  message: string;
}

export type Frame = 
  | SubscribeFrame 
  | PublishFrame 
  | SubAckFrame 
  | EventFrame 
  | OnSrcFrame 
  | ErrorFrame;

export interface Batch {
  destination: string;   
  gid: UUID;
  data: Event[];
  sid: string;
}

export interface Event {
  gid: UUID;
  data: any;
}

/**
 * Error codes
 */
export enum ErrorCode {
  CONNECTION_ERROR = 'connection_error',
  AUTHENTICATION_ERROR = 'auth_error',
  SUBSCRIPTION_ERROR = 'sub_error',
  SUBSCRIPTION_TIMEOUT = 'sub_timeout',
  PRODUCTION_ERROR = 'produce_error',
  INVALID_FRAME = 'invalid_frame',
  SERVER_ERROR = 'server_error'
}
