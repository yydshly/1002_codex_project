// This tracker compares validated worker states only. It neither validates
// asset geometry nor reads or writes a stored backup. A verified save or an
// explicitly adopted, verified stored state is the caller's responsibility.
const MAX_DEPTH = 32;
const MAX_NODES = 4096;
const MAX_SIGNATURE_LENGTH = 65536;

function signature(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('方案必须为普通 JSON 对象');
  }
  let nodes = 0;
  let length = 0;
  const ancestors = new Set();
  const token = text => {
    length += text.length;
    if (length > MAX_SIGNATURE_LENGTH) throw new TypeError('方案文本超过比较上限');
    return text;
  };
  function visit(value, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new TypeError('方案结构超过比较上限');
    if (value === null || typeof value === 'boolean') return token(JSON.stringify(value));
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('方案包含非有限数值');
      return token(JSON.stringify(value));
    }
    if (typeof value === 'string') {
      if (value.length > MAX_SIGNATURE_LENGTH) throw new TypeError('方案文本超过比较上限');
      const text = JSON.stringify(value);
      if (text.length > MAX_SIGNATURE_LENGTH) throw new TypeError('方案文本超过比较上限');
      return token(text);
    }
    if (typeof value !== 'object') throw new TypeError('方案包含不支持的 JSON 值');
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype : prototype !== null && prototype !== Object.prototype) {
      throw new TypeError('方案包含非普通 JSON 对象');
    }
    if (ancestors.has(value)) throw new TypeError('方案包含循环引用');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some(key => typeof key !== 'string')) throw new TypeError('方案包含符号字段');
    const keys = ownKeys.filter(key => !(array && key === 'length'));
    if (keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) {
      throw new TypeError('方案字段必须为可枚举的数据值');
    }
    if (array && (value.length > MAX_NODES || keys.length !== value.length ||
      keys.some((key, index) => key !== String(index)))) {
      throw new TypeError('方案数组必须连续且不包含附加字段');
    }
    ancestors.add(value);
    token(array ? '[' : '{');
    const items = (array ? keys : keys.sort()).map((key, index) => {
      if (key.length > MAX_SIGNATURE_LENGTH) throw new TypeError('方案字段超过比较上限');
      if (index > 0) token(',');
      const prefix = array ? '' : token(`${JSON.stringify(key)}:`);
      const child = visit(descriptors[key].value, depth + 1);
      return `${prefix}${child}`;
    });
    token(array ? ']' : '}');
    ancestors.delete(value);
    const text = array ? `[${items.join(',')}]` : `{${items.join(',')}}`;
    if (text.length > MAX_SIGNATURE_LENGTH) throw new TypeError('方案文本超过比较上限');
    return text;
  }
  return visit(state, 0);
}

/** A value-based status tracker, separate from storage's exact-raw conflict
 * baseline. It retains strings, so subsequent mutation of input or returned
 * snapshots cannot silently change what was observed or verified as saved.
 */
export class SupportDraft {
  #current;
  #saved;
  #pendingSelection = false;
  #transactionActive = false;
  #externalChanged = false;

  getSnapshot() {
    const hasState = this.#current !== undefined;
    return { hasState,
      dirty: hasState && (this.#saved === undefined || this.#current !== this.#saved || this.#externalChanged),
      pendingSelection: this.#pendingSelection,
      transactionActive: this.#transactionActive,
      externalChanged: this.#externalChanged };
  }

  #failure(code, error) {
    return { ok: false, code, reason: error instanceof Error ? error.message : '方案状态无法比较', ...this.getSnapshot() };
  }

  observe(state, options = {}) {
    let pendingSelection, transactionActive, next;
    try {
      if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('操作状态必须为对象');
      ({ pendingSelection = false, transactionActive = false } = options);
      if (typeof pendingSelection !== 'boolean' || typeof transactionActive !== 'boolean') throw new TypeError('操作状态必须为布尔值');
    } catch (error) { return this.#failure('invalid-status', error); }
    try {
      // Pending selection replies do not contain a new validated placement.
      // They must not erase the previous scheme or its comparison baseline.
      next = state == null ? this.#current : signature(state);
    } catch (error) { return this.#failure('invalid-state', error); }
    this.#current = next;
    this.#pendingSelection = pendingSelection;
    this.#transactionActive = transactionActive;
    return { ok: true, ...this.getSnapshot() };
  }

  markSaved(state) {
    let saved;
    try { saved = signature(state); }
    catch (error) { return this.#failure('invalid-state', error); }
    // A late verified save for an older state does not make a newer observed
    // draft clean. Only the saved comparison baseline advances here.
    this.#saved = saved;
    this.#externalChanged = false;
    return { ok: true, ...this.getSnapshot() };
  }

  markExternalChanged() {
    this.#externalChanged = true;
    return { ok: true, ...this.getSnapshot() };
  }
}

export const createSupportDraft = () => new SupportDraft();
