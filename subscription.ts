import { Connection } from './connection';
import { SessionIdManager } from './session';
import { EventProcessor } from './events';
import { SubscribeFrame, SubAckFrame, OnSrcFrame, EventFrame } from './types';
import { CacheManager } from './cache';

export class SubscriptionManager {
  private connection: Connection;
  private sessionManager: SessionIdManager;
  private eventProcessor: EventProcessor;
  private cacheManager: CacheManager;
  
  private pendingSubscriptions = new Map<number, SubscribeFrame>();
  
  constructor(
    connection: Connection,
    sessionManager: SessionIdManager,
    eventProcessor: EventProcessor,
    cache: CacheManager
  ) {
    this.connection = connection;
    this.sessionManager = sessionManager;
    this.eventProcessor = eventProcessor;
    this.cacheManager = cache;
    
    this.connection.addFrameHandler(async frame => {
      if (frame.type === 'suback') {
        await this.handleSubAck(frame as SubAckFrame);
      }

      if (frame.type === "onsrc") {
        await eventProcessor.processSourceChange(frame as OnSrcFrame);
      }

      if (frame.type === "event") {
        await eventProcessor.processEventFrame(frame as EventFrame);
      }
    });

  }
  
  async subscribe(destinations: string[]): Promise<void> {
    if (!this.connection.isOpen()) {
      await this.connection.open();
    }
  
    for (const dest of destinations) {
      const sessionData = await this.sessionManager.getSessionData(dest);
      const cid = Math.floor(Math.random() * 1_000_000_000); // correlation id

      const subscribeFrame: SubscribeFrame = {
        type: 'subscribe',
        destination: dest,
        sid: sessionData?.sid,
        gid: sessionData?.gid,
        cid,
        cache: 'start'
      };

      this.pendingSubscriptions.set(cid, subscribeFrame);
      this.connection.sendFrame(subscribeFrame);
    }
    
  }
  
  private async handleSubAck(frame: SubAckFrame): Promise<void> {
    let matchedCid: number | undefined;
    let matchedFrame: SubscribeFrame | undefined;
    
    for (const [key, subscribeFrame] of this.pendingSubscriptions.entries()) {
      matchedCid = key;
      matchedFrame = subscribeFrame;
      break;
    }
    
    if (matchedCid && matchedFrame) {
      const originalSid = matchedFrame.sid;
      const newSid = frame.sid;
      
      if (!originalSid) {
        // no sid stored in indexeddb, store the new one from suback.
        await this.sessionManager.storeSessionId(newSid, matchedFrame.destination);
      } else if (originalSid && originalSid !== newSid) { // check whether the sid in the returned suback is the same as the sid in the subscribe frame.

        // the sid stored in idb is invalid(tampered or expired), we replace the old sid and remove the old data.
        console.log(`Session ID changed for destination ${matchedFrame.destination}: ${originalSid} -> ${newSid}`);
        
        try {
          // clear all events for this destination from the events store
          await this.sessionManager.clearEventsByDestination(matchedFrame.destination);
          
          // remove the old session entry from the sids store
          await this.sessionManager.removeDestination(matchedFrame.destination);

          // store new session id
          await this.sessionManager.storeSessionId(newSid, matchedFrame.destination);
          
          console.log(`Cleared stale data for destination ${matchedFrame.destination}`);
        } catch (error) {
          console.error('Failed to clear stale data:', error);
        }
      } else {
        // the sid in the suback and the sid in the db are matching, we simply retrieve all the
        // events from the db and run the handlers on them!
        const batches = await this.cacheManager.getEventsBySid(frame.sid);
        await Promise.all(batches.map(async batch => this.eventProcessor.processEvent(batch, true)));
      }
      
      // remove from pending subscriptions
      this.pendingSubscriptions.delete(matchedCid);
    } else {
      console.warn('Received subscription acknowledgment for unknown subscription', frame);
    }
  }
  
}
