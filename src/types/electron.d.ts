export {};

declare global {
  interface Window {
    listenOS?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
      on<T>(eventName: string, callback: (payload: T) => void): () => void;
      window: {
        minimize(): Promise<void>;
        toggleMaximize(): Promise<boolean>;
        isMaximized(): Promise<boolean>;
        close(): Promise<void>;
      };
      updates: {
        check(silent: boolean): Promise<{ available: boolean; version?: string }>;
      };
      platform: "win32" | "darwin" | "linux";
    };
  }
}
