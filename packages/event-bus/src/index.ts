import type { YctEvent, YctEventType } from '@yct/contracts';

export type EventHandler<TEvent extends YctEvent> = (event: TEvent) => void | Promise<void>;

export interface EventBus {
  emit<TEvent extends YctEvent>(event: TEvent): Promise<void>;
  subscribe<TType extends YctEventType>(
    type: TType,
    handler: EventHandler<Extract<YctEvent, { type: TType }>>,
  ): () => void;
}

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<YctEventType, Set<EventHandler<YctEvent>>>();

  async emit<TEvent extends YctEvent>(event: TEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers?.size) {
      return;
    }

    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe<TType extends YctEventType>(
    type: TType,
    handler: EventHandler<Extract<YctEvent, { type: TType }>>,
  ): () => void {
    const handlers = this.handlers.get(type) ?? new Set<EventHandler<YctEvent>>();
    handlers.add(handler as EventHandler<YctEvent>);
    this.handlers.set(type, handlers);

    return () => {
      handlers.delete(handler as EventHandler<YctEvent>);
      if (handlers.size === 0) {
        this.handlers.delete(type);
      }
    };
  }
}
