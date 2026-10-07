// This experiment has its own key. It never reads or writes the living-room project.
export const SUPPORT_WORKSPACE_KEY = 'atelier-support-workspace-v1';
export const SUPPORT_FORMAT = 'atelier-support-workspace';
export const SUPPORT_VERSION = 1;
export const MAX_SUPPORT_BACKUP_BYTES = 64 * 1024;

const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
const keys = (value, expected) => object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
const fail = reason => ({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function assetFrom(options, assetId) {
  if (typeof options.resolveAsset === 'function') return options.resolveAsset(assetId);
  if (options.assets instanceof Map) return options.assets.get(assetId);
  return Object.hasOwn(options.assets || {}, assetId) ? options.assets[assetId] : undefined;
}

function geometryResult(callback, args, fallback) {
  try {
    const result = callback(...args.map(clone));
    if (!object(result) || result.ok !== true) return fail(text(result?.reason) ? result.reason : fallback);
    // Geometry evidence is returned for inspection, but is never trusted as stored state.
    return { ok: true, ...(result.worldPose === undefined ? {} : { worldPose: clone(result.worldPose) }),
      ...(result.evidence === undefined ? {} : { evidence: clone(result.evidence) }) };
  } catch (error) {
    return fail(`${fallback}：${error instanceof Error ? error.message : '几何检查异常'}`);
  }
}

/** Validate the exact same relation for editing, initial state, history and restore.
 * localAnchor is the lamp model root in table-local X/Z; it is not its base centre.
 * The geometry callback owns the contact offset, full coverage and collision checks.
 */
export function validateSupportState(input, options) {
  if (!object(options) || !text(options.analysisVersion) || typeof options.validatePlacement !== 'function') return fail('支撑分析资料尚未就绪');
  if (!keys(input, ['table', 'lamp', 'attachment'])) return fail('工作台状态字段不完整或包含未支持字段');
  const { table, lamp, attachment } = input;
  if (!keys(table, ['assetId', 'sha256', 'analysisVersion', 'surfaceId', 'transform']) ||
    !keys(lamp, ['assetId', 'sha256', 'scale', 'yaw']) || !keys(attachment, ['localAnchor'])) return fail('桌灯或附件字段不符合版本 1');
  if (![table.assetId, table.sha256, table.analysisVersion, table.surfaceId, lamp.assetId, lamp.sha256].every(text)) return fail('资产、分析版本和支撑面标识必须完整');
  if (table.analysisVersion !== options.analysisVersion) return fail('分析规则版本不匹配，未修改原状态');
  let tableAsset, lampAsset;
  try { tableAsset = assetFrom(options, table.assetId); lampAsset = assetFrom(options, lamp.assetId); }
  catch { return fail('资产资料尚未就绪'); }
  if (!tableAsset || !lampAsset) return fail('工作台引用了未注册资产');
  if (tableAsset.sha256 !== table.sha256 || lampAsset.sha256 !== lamp.sha256) return fail('资产文件指纹不匹配，未修改原状态');
  if (tableAsset.analysisVersion !== undefined && tableAsset.analysisVersion !== table.analysisVersion) return fail('资产分析版本不匹配');
  if (tableAsset.surfaces !== undefined && (!Array.isArray(tableAsset.surfaces) || !tableAsset.surfaces.some(surface => (typeof surface === 'string' ? surface : surface?.id) === table.surfaceId))) return fail('所选支撑面不存在');
  const transform = table.transform, anchor = attachment.localAnchor;
  if (!keys(transform, ['x', 'y', 'z', 'yaw', 'scale']) || !keys(transform.scale, ['x', 'y', 'z']) || !keys(anchor, ['x', 'z'])) return fail('仅支持平移、绕 Y 旋转与正轴向尺度');
  if (![transform.x, transform.y, transform.z, transform.yaw, transform.scale.x, transform.scale.y, transform.scale.z, anchor.x, anchor.z, lamp.scale, lamp.yaw].every(finite)) return fail('变换和锚点必须为有限数值');
  if ([transform.scale.x, transform.scale.y, transform.scale.z, lamp.scale].some(value => value <= 0)) return fail('尺度必须大于零，不允许翻转或塌缩');
  // Canonical field order also makes export, equality and history deterministic.
  const state = {
    table: { assetId: table.assetId, sha256: table.sha256, analysisVersion: table.analysisVersion, surfaceId: table.surfaceId,
      transform: { x: transform.x, y: transform.y, z: transform.z, yaw: transform.yaw,
        scale: { x: transform.scale.x, y: transform.scale.y, z: transform.scale.z } } },
    lamp: { assetId: lamp.assetId, sha256: lamp.sha256, scale: lamp.scale, yaw: lamp.yaw },
    attachment: { localAnchor: { x: anchor.x, z: anchor.z } },
  };
  const placement = geometryResult(options.validatePlacement, [state], '完整底座或灯体几何检查未通过');
  return placement.ok ? { ...placement, state } : placement;
}

export function parseSupportBackup(rawText, options) {
  if (typeof rawText !== 'string') return fail('备份必须是 JSON 文本');
  if (new TextEncoder().encode(rawText).byteLength > MAX_SUPPORT_BACKUP_BYTES) return fail('支撑工作台备份超过 64 KiB');
  let envelope;
  try { envelope = JSON.parse(rawText); } catch { return fail('JSON 无法解析，保留原文本和原状态'); }
  if (!keys(envelope, ['format', 'version', 'state']) || envelope.format !== SUPPORT_FORMAT || envelope.version !== SUPPORT_VERSION) return fail('不支持的工作台备份格式或版本');
  return validateSupportState(envelope.state, options);
}

export function serializeSupportBackup(state, options) {
  const checked = validateSupportState(state, options);
  if (!checked.ok) throw new Error(checked.reason);
  const output = JSON.stringify({ format: SUPPORT_FORMAT, version: SUPPORT_VERSION, state: checked.state }, null, 2);
  if (new TextEncoder().encode(output).byteLength > MAX_SUPPORT_BACKUP_BYTES) throw new Error('支撑工作台备份超过 64 KiB');
  return output;
}

/** A pure state store: persistence occurs only through explicit save/load adapters.
 * Discrete apply checks the whole final relation. Pointer update additionally proves
 * the swept path from the previous legal preview; illegal release rolls back the
 * entire gesture, rather than committing that preview or shrinking the lamp.
 */
export class SupportStore {
  constructor(options) {
    if (typeof options?.checkSweep !== 'function') throw new Error('需要连续路径几何检查函数');
    const checked = validateSupportState(options.initialState, options);
    if (!checked.ok) throw new Error(checked.reason);
    this._options = options;
    this._state = checked.state;
    this._undo = [];
    this._redo = [];
    this._transaction = null;
  }

  getState() { return clone(this._state); }

  getStatus() {
    return { transactionActive: this._transaction !== null, invalidPending: this._transaction?.invalidPending ?? false,
      label: this._transaction?.label ?? null, canUndo: this._undo.length > 0, canRedo: this._redo.length > 0 };
  }

  _result(fields) { return { ...fields, state: this.getState() }; }

  _pushHistory(before) {
    this._undo.push(clone(before));
    if (this._undo.length > 100) this._undo.shift();
    this._redo = [];
  }

  _check(input, from, sweep) {
    const checked = validateSupportState(input, this._options);
    if (!checked.ok || !sweep || same(from, checked.state)) return checked;
    const path = geometryResult(this._options.checkSweep, [from, checked.state], '连续贴面路径检查未通过');
    return path.ok ? checked : path;
  }

  begin(label = '鼠标操作') {
    if (this._transaction) return this._result(fail('已有未完成的鼠标事务'));
    const checked = validateSupportState(this._state, this._options);
    if (!checked.ok) return this._result(checked);
    this._transaction = { baseline: clone(this._state), invalidPending: false, reason: '', label: String(label).slice(0, 256) };
    return this._result({ ok: true });
  }

  update(input) {
    if (!this._transaction) return this._result(fail('尚未开始鼠标事务'));
    const checked = this._check(input, this._state, true);
    this._transaction.invalidPending = !checked.ok;
    this._transaction.reason = checked.reason ?? '';
    if (!checked.ok) return this._result(checked);
    this._state = checked.state;
    return this._result(checked);
  }

  commit() {
    if (!this._transaction) return this._result(fail('没有可提交的鼠标事务'));
    const pending = this._transaction;
    const checked = pending.invalidPending ? fail(pending.reason || '鼠标释放位置非法') : validateSupportState(this._state, this._options);
    this._transaction = null;
    if (!checked.ok) {
      this._state = pending.baseline;
      return this._result({ ...checked, rolledBack: true, label: pending.label });
    }
    const changed = !same(pending.baseline, this._state);
    if (changed) this._pushHistory(pending.baseline);
    return this._result({ ...checked, changed, label: pending.label });
  }

  cancel(reason = '取消操作') {
    const pending = this._transaction;
    if (!pending) return this._result({ ok: true, cancelled: false, reason });
    this._state = pending.baseline;
    this._transaction = null;
    return this._result({ ok: true, cancelled: true, reason, label: pending.label });
  }

  apply(input, detail = '修改工作台') {
    const options = typeof detail === 'string' ? { label: detail, sweep: false } : detail;
    if (!object(options) || (options.sweep !== undefined && typeof options.sweep !== 'boolean')) return this._result(fail('修改选项无效'));
    if (this._transaction) return this._result(fail('请先完成或取消鼠标事务'));
    const checked = this._check(input, this._state, options.sweep === true);
    if (!checked.ok) return this._result(checked);
    const changed = !same(this._state, checked.state);
    if (changed) this._pushHistory(this._state);
    this._state = checked.state;
    return this._result({ ...checked, changed, label: options.label ?? '修改工作台' });
  }

  undo() { return this._history(this._undo, this._redo, '撤销'); }
  redo() { return this._history(this._redo, this._undo, '重做'); }

  _history(source, destination, label) {
    if (this._transaction) this.cancel(`${label}前取消鼠标事务`);
    if (!source.length) return this._result(fail(`没有可${label}的操作`));
    const checked = validateSupportState(source.at(-1), this._options);
    if (!checked.ok) return this._result(checked);
    destination.push(clone(this._state));
    source.pop();
    this._state = checked.state;
    return this._result({ ...checked, changed: true, label });
  }

  export() {
    this.cancel('导出前取消鼠标事务');
    return serializeSupportBackup(this._state, this._options);
  }

  restore(rawText) {
    // Parse first: a failed paste never interrupts the valid current state/gesture.
    const checked = parseSupportBackup(rawText, this._options);
    if (!checked.ok) return this._result(checked);
    this.cancel('恢复前取消鼠标事务');
    return this.apply(checked.state, '恢复支撑工作台');
  }

  save(storage) {
    this.cancel('保存前取消鼠标事务');
    let rawText;
    try {
      rawText = serializeSupportBackup(this._state, this._options);
      if (typeof storage?.setItem !== 'function') return this._result(fail('没有可用的本机保存接口'));
      storage.setItem(SUPPORT_WORKSPACE_KEY, rawText);
    } catch (error) {
      return this._result({ ...fail(`保存失败，仍可导出备份：${error instanceof Error ? error.message : '本机存储不可用'}`), ...(rawText ? { rawText } : {}) });
    }
    return this._result({ ok: true, rawText });
  }

  load(storage) {
    let rawText;
    try {
      if (typeof storage?.getItem !== 'function') return this._result(fail('没有可用的本机读取接口'));
      rawText = storage.getItem(SUPPORT_WORKSPACE_KEY);
    } catch (error) { return this._result(fail(`读取失败，未修改原状态：${error instanceof Error ? error.message : '本机存储不可用'}`)); }
    if (rawText === null || rawText === undefined) return this._result({ ok: true, found: false });
    const result = this.restore(rawText);
    return { ...result, found: true, rawText };
  }
}

export const createSupportStore = options => new SupportStore(options);
