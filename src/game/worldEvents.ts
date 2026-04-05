type Handler = (payload?: any) => void;

class WorldEvents {
  private map = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    const set = this.map.get(event) ?? new Set<Handler>();
    set.add(handler);
    this.map.set(event, set);
  }

  off(event: string, handler: Handler) {
    const set = this.map.get(event);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.map.delete(event);
  }

  emit(event: string, payload?: any) {
    const set = this.map.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(payload);
    }
  }
}

export const worldEvents = new WorldEvents();

