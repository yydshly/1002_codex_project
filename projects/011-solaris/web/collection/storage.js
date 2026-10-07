const STORE_KEY = 'atelier-collection-workspace-v1';
const TRIP_KEY = 'atelier-collection-trip-v1';
const STORE_LIMIT = 64 * 1024;
const TRIP_LIMIT = 256 * 1024;
const bytes = value => new TextEncoder().encode(value).length;

function jsonCopy(value, seen = new Set(), depth = 0) {
  if (depth > 64) throw new Error('JSON嵌套过深');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) throw new Error('只接受完整JSON数据');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) throw new Error('只接受普通JSON对象');
  const keys = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => typeof key !== 'string')) throw new Error('JSON不能包含符号字段');
  seen.add(value);
  const copy = array ? [] : Object.create(null);
  if (array) {
    if (keys.length !== value.length + 1) throw new Error('JSON数组必须连续且没有额外字段');
    for (let index = 0; index < value.length; index++) {
      const descriptor = descriptors[index];
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('JSON数组必须是数据字段');
      copy.push(jsonCopy(descriptor.value, seen, depth + 1));
    }
  } else {
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('JSON对象必须是可见数据字段');
      copy[key] = jsonCopy(descriptor.value, seen, depth + 1);
    }
  }
  seen.delete(value);
  return copy;
}

function encode(value, limit) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('保存内容必须是JSON对象');
  const raw = JSON.stringify(jsonCopy(value));
  if (bytes(raw) > limit) throw new Error('保存内容超过容量限制');
  return raw;
}

function readable(raw, limit) {
  if (raw === null) return true;
  try { encode(JSON.parse(raw), limit); return true; } catch { return false; }
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sameValue(raw, next, limit) {
  if (raw === next) return true;
  if (raw === null || !readable(raw, limit)) return false;
  return canonical(JSON.parse(raw)) === canonical(JSON.parse(next));
}

/**
 * A synchronous, conservative localStorage coordinator. Raw-string comparisons
 * detect stale windows; they are not an atomic cross-window lock. Business v1
 * validation remains the caller's responsibility. refresh() only adopts raw data.
 */
export function createCollectionStorage(storage, { storeKey = STORE_KEY, tripKey = TRIP_KEY } = {}) {
  if (typeof storeKey !== 'string' || !storeKey || typeof tripKey !== 'string' || !tripKey || storeKey === tripKey) throw new Error('存储键必须是两个不同的字符串');
  let currentRaw, currentTripRaw, ready = false, storeReadable = false, tripReadable = false, lastResult;

  function result(ok, status, message, extra = {}) {
    lastResult = Object.freeze({ ok, status, message, storeRaw: currentRaw, tripRaw: currentTripRaw, ...extra });
    return lastResult;
  }
  function get(key) {
    const raw = storage.getItem(key);
    if (raw !== null && typeof raw !== 'string') throw new Error('存储没有返回原文');
    return raw;
  }
  function readPair() { return { store: get(storeKey), trip: get(tripKey) }; }
  function adopt(pair) {
    currentRaw = pair.store; currentTripRaw = pair.trip; ready = true;
    storeReadable = readable(currentRaw, STORE_LIMIT); tripReadable = readable(currentTripRaw, TRIP_LIMIT);
  }
  function unavailable(message = '本机存储无法读取或写入，请恢复读取后再保存', extra = {}) {
    ready = false;
    return result(false, 'unavailable', message, extra);
  }
  function conflict(extra = {}) {
    return result(false, 'conflict', '其他窗口已修改陈列或行程；当前内容未覆盖最新记录，请先加载最新陈列', extra);
  }
  function restore(key, previous, written) {
    try {
      const present = get(key);
      if (present === previous) return 'restored';
      if (present !== written) return 'newer-preserved';
      if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
      return get(key) === previous ? 'restored' : 'newer-preserved';
    } catch { return 'failed'; }
  }

  const coordinator = {
    get currentRaw() { return currentRaw; },
    get currentTripRaw() { return currentTripRaw; },
    get ready() { return ready; },
    get storeReadable() { return storeReadable; },
    get tripReadable() { return tripReadable; },
    get status() { return lastResult.status; },
    get lastResult() { return lastResult; },
    refresh() {
      try { adopt(readPair()); }
      catch { return unavailable('本机存储未能完整读取；原文基线保持，不会保存'); }
      if (!storeReadable) return result(false, 'unreadable', '本机陈列原文无法解析，尚未覆盖；可保留备份后明确应用有效文件');
      return result(true, 'refreshed', '已读取最新原文；由工作台校验后决定是否加载');
    },
    save(value, { replaceUnreadable = false } = {}) {
      let next;
      try {
        if (typeof replaceUnreadable !== 'boolean') throw new Error();
        next = encode(value, STORE_LIMIT);
      } catch { return result(false, 'invalid-value', '保存内容必须是容量范围内的普通JSON对象'); }
      if (!ready) return unavailable('初始读取或上次存储操作失败，尚未写入；请先重新读取最新记录');
      let present;
      try { present = get(storeKey); } catch { return unavailable(); }
      if (present !== currentRaw) {
        if (!sameValue(present, next, STORE_LIMIT)) return conflict();
        currentRaw = present; storeReadable = true;
        return result(true, 'unchanged', '其他窗口已保存相同内容；已采用其原文，没有再次写入');
      }
      if (!storeReadable && !replaceUnreadable) return result(false, 'unreadable', '原有陈列无法解析，自动保存已暂停，原文保持');
      if (sameValue(present, next, STORE_LIMIT)) return result(true, 'unchanged', '保存内容已一致，没有改写原文');
      try {
        storage.setItem(storeKey, next);
        if (get(storeKey) !== next) return conflict();
      } catch { return unavailable(); }
      currentRaw = next; storeReadable = true;
      return result(true, 'saved', '陈列已保存到本机');
    },
    enter(checkpoint, shop, { replaceUnreadableTrip = false } = {}) {
      let nextTrip, nextStore;
      try {
        if (typeof replaceUnreadableTrip !== 'boolean') throw new Error();
        nextTrip = encode(checkpoint, TRIP_LIMIT); nextStore = encode(shop, STORE_LIMIT);
      }
      catch { return result(false, 'invalid-value', '行程和陈列必须是容量范围内的普通JSON对象'); }
      if (!ready) return unavailable('本机原文尚未完整读取，不能保存行程');
      if (!storeReadable || (!tripReadable && !replaceUnreadableTrip)) return result(false, 'unreadable', '陈列或行程原文损坏，尚未覆盖；请先恢复有效记录');
      let before;
      try { before = readPair(); } catch { return unavailable(); }
      if (before.store !== currentRaw || before.trip !== currentTripRaw) {
        if (sameValue(before.store, nextStore, STORE_LIMIT) && sameValue(before.trip, nextTrip, TRIP_LIMIT)) {
          adopt(before);
          return result(true, 'unchanged', '该行程与陈列已一致，没有再次写入');
        }
        return conflict();
      }
      let tripAttempted = false, storeAttempted = false, cause = 'unavailable';
      try {
        tripAttempted = true; storage.setItem(tripKey, nextTrip);
        if (get(tripKey) !== nextTrip || get(storeKey) !== before.store) { cause = 'conflict'; throw new Error('行程期间存储已变化'); }
        storeAttempted = true; storage.setItem(storeKey, nextStore);
        const written = readPair();
        if (written.store !== nextStore || written.trip !== nextTrip) { cause = 'conflict'; throw new Error('行程提交期间存储已变化'); }
        adopt(written);
        return result(true, 'entered', '陈列与返回检查点已保存，可以进入登记场景');
      } catch {
        const outcomes = [];
        if (storeAttempted) outcomes.push(restore(storeKey, before.store, nextStore));
        if (tripAttempted) outcomes.push(restore(tripKey, before.trip, nextTrip));
        const rollback = outcomes.includes('failed') ? 'failed' : outcomes.includes('newer-preserved') ? 'newer-preserved' : 'restored';
        if (rollback === 'failed') return unavailable('行程未完成，回滚也未能完整确认；请先重新读取，不会继续覆盖记录', { rollback });
        if (rollback === 'newer-preserved' || cause === 'conflict') return conflict({ rollback });
        return unavailable('行程未能完整保存；已恢复本次写入前的原文，请重新读取后重试', { rollback });
      }
    },
  };
  coordinator.refresh();
  return Object.freeze(coordinator);
}
