import { UUID, Config, EventFrame, Batch, OnSrcFrame, Event } from './types';
import { SourceManager } from './source';
import { CacheManager } from './cache';
import { SessionIdManager } from './session';

export type EventHandler = (batch: unknown[], dest: string) => void;

export class EventProcessor {
  private sourceManager: SourceManager;
  private cache: CacheManager;
  private sessionManager: SessionIdManager;
  private config: Config;
  
  private destinationHandlers = new Map<string, Set<EventHandler>>();
  
  constructor(
    sourceManager: SourceManager, 
    cache: CacheManager,
    sessionManager: SessionIdManager,
    config: Config
  ) {
    this.sourceManager = sourceManager;
    this.cache = cache;
    this.sessionManager = sessionManager;
    this.config = config;
  }
  
  // TODO: simplify
  async processEventFrame(frame: EventFrame): Promise<void> {
    const batch = frame.batch;
    const destination = batch.destination;
    const latestGid = batch.gid;
    
    if (!destination) {
      console.warn('Batch destination is undefined, skipping event frame');
      return;
    }

    // get stored gid for this destination from idb
    const storedGid = await this.sessionManager.getGid(destination);
    
    if (!storedGid) {
      // no stored gid, process all events in this batch
      await this.processEvent({ ...batch, sid: frame.sid });
      // update stored gid to the latest one from this batch
      await this.sessionManager.updateGid(destination, latestGid);
      return;
    }
    
    if (batch.data.length > 0) {
      const filteredBatch: Batch = {
        destination: batch.destination,
        gid: batch.gid,
        data: batch.data,
        sid: frame.sid
      };
      
      await this.processEvent(filteredBatch);
      await this.sessionManager.updateGid(destination, latestGid);
    }
  }

  async processSourceChange(frame: OnSrcFrame): Promise<void> {
    const batches = this.sourceManager.handleSourceChange(frame);
  
    for (const batch of batches) {
      await this.processEvent(batch).catch(err => {
        console.error('Failed to process buffered batch', err);
      });
    }
  }
  
  async processEvent(batch: Batch, skipCache = false): Promise<void> {
    if (this.config.cacheEnabled && !skipCache) {
      this.cache.storeEvent(batch).catch(err => {
        console.error('Failed to cache event', err);
      });
    }
    
    const eventData = batch.data.map(event => event.data);
    
    const destination = batch.destination;
    if (destination) {
      this.dispatch(eventData, destination);
    } else {
      console.warn('Batch destination is undefined, skipping dispatch');
    }
  }
  
  private dispatch(data: any[], dest: string): void {
    const handlers = this.destinationHandlers.get(dest);
    
    if (!handlers || handlers.size === 0) {
      return;
    }
    
    handlers.forEach(handler => {
      try {
        handler(data, dest);
      } catch (err) {
        console.error('Error in event handler for destination', dest, err);
      }
    });
  }
  
  addListener(destinations: string[], handler: EventHandler): void {
    for (const destination of destinations) {
      let handlers = this.destinationHandlers.get(destination);
      if (!handlers) {
        handlers = new Set<EventHandler>();
        this.destinationHandlers.set(destination, handlers);
      }
      
      handlers.add(handler);
    }
  }
  
}
