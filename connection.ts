import { Config, Frame, PublishFrame, ErrorCode } from './types';
import { ErrorHandler } from './error';

enum ConnectionState {
  CLOSED,
  CONNECTING,
  OPEN,
  CLOSING
}

type FrameHandler = (frame: Frame) => Promise<void>;

export class Connection {
  private ws: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.CLOSED;
  private readonly config: Config;
  private readonly errorHandler: ErrorHandler;
  private reconnectMs: number;
  private frameHandlers: Set<FrameHandler> = new Set();
  
  constructor(config: Config, errorHandler: ErrorHandler) {
    this.config = config;
    this.errorHandler = errorHandler;
    this.reconnectMs = this.config.reconnectTimeout;
  }
  
  async open(): Promise<void> {
    if (this.state === ConnectionState.OPEN || this.state === ConnectionState.CONNECTING) {
      return;
    }
    
    this.state = ConnectionState.CONNECTING;
    
    try {
      const jwt = await this.config.jwtProvider();
      const ws = new WebSocket(this.config.url, jwt);
      
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
          ws.close();
        }, 10000);
        
        ws.onopen = () => {
          clearTimeout(timeout);
          this.state = ConnectionState.OPEN;
          this.reconnectMs = this.config.reconnectTimeout;
          this.setupEventHandlers(ws);
          this.ws = ws;
          resolve();
        };
        
        ws.onerror = (err) => {
          clearTimeout(timeout);
          this.state = ConnectionState.CLOSED;
          this.errorHandler.handleError(ErrorCode.CONNECTION_ERROR, 'Failed to connect');
          reject(err);
        };
      });
    } catch (err) {
      this.state = ConnectionState.CLOSED;
      this.errorHandler.handleError(ErrorCode.CONNECTION_ERROR, 'Failed to get Exoquic access token');
      throw err;
    }
  }
  
  private setupEventHandlers(ws: WebSocket): void {
    // TODO: do we need ordering on this level or do we just want ordering on the event level?
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data as string) as Frame;
        this.handleFrame(frame);
      } catch (err) {
        this.errorHandler.handleError(
          ErrorCode.INVALID_FRAME, 
          'Failed to parse frame'
        );
      }
    };
    
    ws.onerror = (err) => {
      this.errorHandler.handleError(
        ErrorCode.CONNECTION_ERROR, 
        'WebSocket error'
      );
      console.error('Exoquic WS error', err);
    };
    
    ws.onclose = (e) => {
      this.handleClose(e);
    };
  }
  
  private handleClose(ev: CloseEvent): void {
    this.state = ConnectionState.CLOSED;
    this.ws = null;
    
    // don't reconnect if the close was intentional or reconnection is disabled
    if (ev.code === 1000 || !this.config.shouldReconnect) {
      return;
    }
    
    // schedule reconnection with exponential backoff
    const wait = Math.min(
      this.reconnectMs * 1.5, 
      this.config.maxReconnectTimeout
    );
    
    setTimeout(() => {
      this.reconnectMs = wait;
      this.open();
    }, this.reconnectMs);
  }
  
  private handleFrame(frame: Frame): void {
    this.frameHandlers.forEach(handler => {
      try {
        handler(frame);
      } catch (err) {
        console.error('Error in frame handler', err);
      }
    });
  }
  
  addFrameHandler(handler: FrameHandler): void {
    this.frameHandlers.add(handler);
  }
  
  sendFrame(frame: Frame): void {
    if (this.state !== ConnectionState.OPEN || !this.ws) {
      throw new Error('WebSocket not open');
    }
    
    this.ws.send(JSON.stringify(frame));
  }

  async produce(destination: string, data: string): Promise<void> {
    if (this.state !== ConnectionState.OPEN) {
      await this.open();
    }
    
    const frame: PublishFrame = {
      v: 3,
      type: 'publish',
      destination,
      data
    };
    
    this.sendFrame(frame);
  }
  
  isOpen(): boolean {
    return this.state === ConnectionState.OPEN;
  }
  
  close(code = 1000, reason = 'client close'): void {
    if (this.state === ConnectionState.CLOSED) {
      return;
    }
    
    this.state = ConnectionState.CLOSING;
    
    if (this.ws) {
      this.ws.close(code, reason);
    }
    
    this.state = ConnectionState.CLOSED;
    this.ws = null;
    this.frameHandlers.clear();
  }
}
