import { Connection } from './connection';
import { ErrorCode } from './types';
import { ErrorHandler } from './error';

export class Publisher {
  private connection: Connection;
  private errorHandler: ErrorHandler;

  constructor(connection: Connection, errorHandler: ErrorHandler) {
    this.connection = connection;
    this.errorHandler = errorHandler;
  }

  async publish(destination: string, data: string): Promise<void> {
    try {
      if (!this.connection.isOpen()) {
        await this.connection.open();
      }

      await this.connection.produce(destination, data);
      
      return Promise.resolve();
    } catch (error) {
      this.errorHandler.handleError(
        ErrorCode.PRODUCTION_ERROR,
        `Failed to publish to ${destination}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  async publishJson<T>(destination: string, data: T): Promise<void> {
    try {
      const jsonData = JSON.stringify(data);
      return this.publish(destination, jsonData);
    } catch (error) {
      this.errorHandler.handleError(
        ErrorCode.PRODUCTION_ERROR,
        `Failed to serialize JSON data for ${destination}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  async publishBatch(destination: string, dataItems: string[]): Promise<void> {
    const promises = dataItems.map(data => this.publish(destination, data));
    await Promise.all(promises);
  }

  isReady(): boolean {
    return this.connection.isOpen();
  }
}
