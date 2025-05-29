import { openDB, IDBPDatabase } from 'idb';
import { Connection } from './connection';
import { SubscriptionManager } from './subscription';
import { EventProcessor } from './events';
import { CacheManager } from './cache';
import { SessionIdManager } from './session';
import { SourceManager } from './source';
import { ErrorHandler } from './error';
import { Publisher } from './publish';
import { Config, SessionOptions } from './types';

export class Exoquic {
  private connection: Connection | undefined;
  private subscriptions: SubscriptionManager | undefined;
  private eventProcessor: EventProcessor | undefined;
  private cache: CacheManager | undefined;
  private sessionManager: SessionIdManager;
  private sourceManager: SourceManager | undefined;
  private errorHandler: ErrorHandler | undefined;
  private publisher: Publisher | undefined;
  private config: Config;
  private db: IDBPDatabase | null = null;
  private closed = false;
  private isInitialized = false;
  /**
   * Creates a new RealtimeSession instance.
   * @param options Configuration options for the session.
   */
  constructor(options: SessionOptions) {
    this.sessionManager = new SessionIdManager();
    this.config = new Config(options);

    // Initialize remaining components
    this.initialize();
  }

  /**
   * Initialize all components and establish connections.
   * @private
   */
  private async initialize(): Promise<void> {
    // Initialize the shared IndexedDB database
    await this.initializeDatabase();
    
    this.errorHandler = new ErrorHandler(this.config);
    this.connection = new Connection(this.config, this.errorHandler);
    this.cache = new CacheManager(this.config, this.db);
    this.sourceManager = new SourceManager();
    this.publisher = new Publisher(this.connection, this.errorHandler);

    this.eventProcessor = new EventProcessor(
      this.sourceManager, 
      this.cache, 
      this.sessionManager,
      this.config
    );

    this.subscriptions = new SubscriptionManager(
      this.connection,
      this.sessionManager,
      this.eventProcessor,
      this.cache
    );
    
    // Pass the database to components that need it
    if (this.db) {
      this.sessionManager.setDatabase(this.db);
    }

    this.isInitialized = true;
    
  }


  private async initializeDatabase(): Promise<void> {
    try {
      const theDb = await openDB(this.config.cacheDbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('events')) {
            const eventsStore = db.createObjectStore('events', {
              autoIncrement: true
            });
            
            eventsStore.createIndex('destination', 'destination');
            eventsStore.createIndex('sid', 'sid');
          }

          if (!db.objectStoreNames.contains('sids')) {
            const sidsStore = db.createObjectStore('sids', { 
              keyPath: 'destination'
            });
            
            sidsStore.createIndex('sid', 'sid');
          }
        },
      });
      this.db = theDb;
    } catch (err) {
      console.error('Failed to initialize IndexedDB', err);
      throw err;
    }
  }

  async subscribe(
    destinations: string[], 
    onEvent?: (batch: unknown[], destination: string) => void
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Session is closed');
    }
    
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (onEvent) {
      this.eventProcessor!.addListener(destinations, onEvent);
    }
    
    return this.subscriptions!.subscribe(destinations);
  }

  async produce(dest: string, value: unknown): Promise<void> {
    if (this.closed) {
      throw new Error('Session is closed');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Convert value to string if needed
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    return this.publisher!.publish(dest, data);
  }

  async publishJson<T>(dest: string, value: T): Promise<void> {
    if (this.closed) {
      throw new Error('Session is closed');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.publisher!.publishJson(dest, value);
  }

  async publishBatch(dest: string, values: string[]): Promise<void> {
    if (this.closed) {
      throw new Error('Session is closed');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return this.publisher!.publishBatch(dest, values);
  }

  onEvent(destinations: string[], handler: (batch: unknown[], dest: string) => void): void {
    if (!this.eventProcessor) {
      console.error("Event processor is not defined");
      return;
    }

    this.eventProcessor.addListener(destinations, handler);
  }

  async close(code = 1000, reason = 'client close'): Promise<void> {
    if (this.closed) return;
    
    this.closed = true;
    if (this.connection) {
      this.connection.close(code, reason);
    }
  }
}

export * from './types';
