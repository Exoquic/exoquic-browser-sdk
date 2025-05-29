import { OnSrcFrame, EventFrame, Batch } from './types';

export class SourceManager {

  private activeSources: Map<string, number> = new Map();
  private bufferedEvents: Map<string /* sid */ , Batch[]> = new Map();
  
  handleSourceChange(frame: OnSrcFrame): Batch[] {
    const newSource = frame.src;
    
    const activeSource = this.activeSources.get(frame.sid);

    if (newSource === activeSource) {
      return [];
    }
    
    // Update active source
    const oldSource = activeSource;
    this.activeSources.set(frame.sid, newSource);
    
    if (newSource === 2 && oldSource === 1) {
      return this.processBufferedEvents(frame.sid);
    }
    
    return [];
  }
  
  processEventFrame(frame: EventFrame): boolean {
    const source = frame.src;
    const activeSource = this.activeSources.get(frame.sid);

    // If this is from the active source, process it immediately
    if (source === activeSource) {
      return true;
    }
    
    // Otherwise, buffer it for later
    this.bufferEvent(frame.sid, frame.batch);
    return false;
  }
  
  private bufferEvent(sid: string, batch: Batch): void {
    if (!this.bufferedEvents.has(sid)) {
      this.bufferedEvents.set(sid, []);
    }
    
    const destBuffer = this.bufferedEvents.get(sid)!;
    destBuffer.push(batch);
  }
  

  private processBufferedEvents(sid: string): Batch[] {
    const bufferedEventsForDestination = this.bufferedEvents.get(sid);
    if (bufferedEventsForDestination == null) {
      console.log("No events found in the buffer");
      return [];
    }
    
    this.bufferedEvents.delete(sid);
  
    return bufferedEventsForDestination;
  }

}
