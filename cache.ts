import { openDB, IDBPDatabase } from 'idb';
import { Config, Batch } from './types';

interface EventCacheEntry {
  destination: string;
  sid: string       
  batch: Batch;
}

export class CacheManager {
  private db: IDBPDatabase | null;
  private readonly config: Config;
  
  constructor(config: Config, db: IDBPDatabase | null) {
    this.config = config;
    this.db = db;
  }
  
  async storeEvent(batch: Batch): Promise<void> {
    if (!this.config.cacheEnabled) {
      return;
    }

    if (!this.db) {
      console.error("DB is not initialized");
      return;
    }
    
    const entry: EventCacheEntry = {
      destination: batch.destination,
      sid: batch.sid,
      batch
    };
    
    try {
      await this.db.put('events', entry);
    } catch (err) {
      console.error('Failed to store event', err);
      throw err;
    }
  }
  
  async getEventsBySid(sid: string): Promise<Batch[]> {
    if (!this.config.cacheEnabled) {
      return [];
    }
    
    if (!this.db) {
      return [];
    }
    
    try {
      const entries = await this.db.getAllFromIndex('events', 'sid', sid);
      return entries.map(entry => entry.batch);
    } catch (err) {
      console.error('Failed to retrieve events', err);
      return [];
    }
  }
  
  async clearAllEvents(): Promise<void> {
    if (!this.config.cacheEnabled) {
      return;
    }
    
    if (!this.db) {
      return;
    }
    
    try {
      await this.db.clear('events');
    } catch (err) {
      console.error('Failed to clear events', err);
      throw err;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
