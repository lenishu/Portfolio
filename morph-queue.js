// Finish each visible shape before accepting the latest requested destination.
// Keep one pending destination: fast scrolling must not create a long backlog.
export function createMorphQueue({ duration = .9, hold = .14 } = {}) {
  let current = null, pending = null, remaining = 0;
  function start(key) {
    remaining = current === null ? 0 : duration + hold;
    current = key;
    pending = null;
    return key;
  }
  return {
    request(key) {
      if (key === current) { pending = null; return null; }
      if (remaining > 0) { pending = key; return null; }
      return start(key);
    },
    advance(dt) {
      remaining = Math.max(0, remaining - Math.max(0, dt));
      return remaining === 0 && pending !== null ? start(pending) : null;
    },
    get state() { return { current, pending, remaining }; },
  };
}
