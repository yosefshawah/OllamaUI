type Listener = (payload: unknown) => void;

const listeners = new Map<string, Set<Listener>>();
const lastPayloadById = new Map<string, unknown>();

export function publish(id: string, payload: unknown) {
  lastPayloadById.set(id, payload);
  const set = listeners.get(id);
  if (!set) return;
  set.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // ignore
    }
  });
}

export function subscribe(id: string, listener: Listener): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  // Immediately send last known payload if exists (handles late subscribers)
  if (lastPayloadById.has(id)) {
    try {
      listener(lastPayloadById.get(id));
    } catch {}
  }
  return () => {
    const s = listeners.get(id);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) listeners.delete(id);
  };
}
