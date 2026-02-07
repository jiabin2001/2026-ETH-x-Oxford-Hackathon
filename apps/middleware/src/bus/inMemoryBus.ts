import { Bus, Topic } from "./bus.js";

type Handler = (payload: any) => void;

export class InMemoryBus implements Bus {
  private handlers: Record<Topic, Set<Handler>> = {
    OBSERVATIONS: new Set(),
    SIGNALS: new Set(),
    DECISIONS: new Set(),
  };

  publish<T>(topic: Topic, payload: T): void {
    for (const h of this.handlers[topic]) h(payload);
  }

  subscribe<T>(topic: Topic, handler: (payload: T) => void): () => void {
    this.handlers[topic].add(handler as Handler);
    return () => this.handlers[topic].delete(handler as Handler);
  }
}
