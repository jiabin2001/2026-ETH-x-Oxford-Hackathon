export type Topic = "OBSERVATIONS" | "SIGNALS" | "DECISIONS";

export interface Bus {
  publish<T>(topic: Topic, payload: T): void;
  subscribe<T>(topic: Topic, handler: (payload: T) => void): () => void;
}
