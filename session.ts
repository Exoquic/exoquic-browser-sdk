import { IDBPDatabase } from 'idb';
import { UUID } from './types';

interface SessionData {
  destination: string;
  sid: string;
  gid?: UUID;
}

export class SessionIdManager {
  private db: IDBPDatabase | null = null;
  

  constructor(db?: IDBPDatabase) {
    this.db = db || null;
  }

  setDatabase(db: IDBPDatabase): void {
    this.db = db;
  }
  
  async storeSessionId(sid: string, destination: string): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not available, skipping session storage');
      return;
    }

    try {
      const tx = this.db.transaction('sids', 'readwrite');
      
      const sessionData: SessionData = {
        destination,
        sid,
        gid: undefined
      };

      await tx.store.put(sessionData);
      await tx.done;
    } catch (err) {
      console.error('Failed to store session ID', err);
      throw err;
    }
  }
  
  async updateGid(destination: string, gid: UUID): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not available, skipping GID update');
      return;
    }

    try {
      const sessionData = await this.db.get('sids', destination);
      if (sessionData) {
        sessionData.gid = gid;
        await this.db.put('sids', sessionData);
      }
    } catch (err) {
      console.error('Failed to update GID', err);
      throw err;
    }
  }
  
  async getSessionData(destination: string): Promise<SessionData | undefined> {
    if (!this.db) {
      console.warn('IndexedDB not available');
      return undefined;
    }

    try {
      return await this.db.get('sids', destination);
    } catch (err) {
      console.error('Failed to get session data', err);
      return undefined;
    }
  }
  
  async getGid(destination: string): Promise<UUID | undefined> {
    const sessionData = await this.getSessionData(destination);
    return sessionData?.gid;
  }
  
  async getDestinationsForSid(sid: string): Promise<string[]> {
    if (!this.db) {
      console.warn('IndexedDB not available');
      return [];
    }

    try {
      const allSessions = await this.db.getAllFromIndex('sids', 'sid', sid);
      return allSessions.map(session => session.destination);
    } catch (err) {
      console.error('Failed to get destinations for SID', err);
      return [];
    }
  }

  async removeDestination(destination: string): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not available, skipping destination removal');
      return;
    }

    try {
      await this.db.delete('sids', destination);
    } catch (err) {
      console.error('Failed to remove destination', err);
      throw err;
    }
  }

  async clearEventsByDestination(destination: string): Promise<void> {
    if (!this.db) {
      console.warn('IndexedDB not available, skipping event clearing');
      return;
    }

    try {
      const events = await this.db.getAllFromIndex('events', 'destination', destination);
      const tx = this.db.transaction('events', 'readwrite');
      for (const event of events) {
        await tx.store.delete(event.id);
      }
      await tx.done;
    } catch (err) {
      console.error('Failed to clear events by destination', err);
      throw err;
    }
  }

}
