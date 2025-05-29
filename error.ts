import { Config, ErrorCode } from './types';

export type ErrorListener = (code: ErrorCode, message: string) => void;

export class ErrorHandler {
  private listeners: Set<ErrorListener> = new Set();
  private readonly config: Config;
  
  constructor(config: Config) {
    this.config = config;
  }
  
  handleError(code: ErrorCode, message: string, error?: any): void {
    console.error(`Exoquic error [${code}]: ${message}`, error);
    this.notifyListeners(code, message);
  }
  
  private notifyListeners(code: ErrorCode, message: string): void {
    this.listeners.forEach(listener => {
      try {
        listener(code, message);
      } catch (err) {
        console.error('Error in error listener', err);
      }
    });
  }

}
