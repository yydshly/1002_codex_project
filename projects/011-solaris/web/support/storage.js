import { SUPPORT_WORKSPACE_KEY, SUPPORT_FORMAT, SUPPORT_VERSION, MAX_SUPPORT_BACKUP_BYTES } from './state.js';

const fail = (code, reason, fields = {}) => ({ ok: false, code, reason, ...fields });
const errorText = error => error instanceof Error ? error.message : '本机存储不可用';
const bytes = rawText => typeof rawText === 'string' ? new TextEncoder().encode(rawText).byteLength : 0;

function checkEnvelope(rawText) {
  if (typeof rawText !== 'string') return fail('invalid-backup', '保存内容必须为经过验证的备份原文');
  if (bytes(rawText) > MAX_SUPPORT_BACKUP_BYTES) return fail('backup-too-large', '支撑工作台备份超过 64 KiB');
  let envelope;
  try { envelope = JSON.parse(rawText); }
  catch { return fail('invalid-backup', '备份 JSON 无法解析，未写入或采纳'); }
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).length !== 3 || !['format', 'version', 'state'].every(key => Object.hasOwn(envelope, key)) ||
    envelope.format !== SUPPORT_FORMAT || envelope.version !== SUPPORT_VERSION ||
    envelope.state === null || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) {
    return fail('invalid-backup', '不支持的工作台备份格式或版本，未写入或采纳');
  }
  return { ok: true };
}

/** Exact-raw stale-window protection for this workbench's one storage key.
 * The caller must validate fingerprints and geometry before save or acceptCurrent.
 * Envelope checks here do not certify a valid scene, and never rewrite its text.
 *
 * localStorage has no compare-and-swap: read/compare/write/read is NOT an atomic
 * cross-window lock. A writer between comparison and write can be overwritten;
 * a later writer after successful verification can replace this record. Detected
 * races fail without automatically rolling back somebody else's newer record.
 */
export class SupportStorage {
  #storage;
  #initialized = false;
  #expectedRaw;

  // A provider lets callers defer access to window.localStorage, whose getter
  // itself can throw in a blocked or unavailable browser storage environment.
  constructor(storage) { this.#storage = storage; }

  getSnapshot() { return { initialized: this.#initialized, ...this.#baselineFields() }; }

  #baselineFields() {
    const expectedRawBytes = bytes(this.#expectedRaw);
    return { baselineKnown: this.#initialized, expectedRawBytes,
      ...(expectedRawBytes <= MAX_SUPPORT_BACKUP_BYTES ? { expectedRaw: this.#expectedRaw } : {}) };
  }

  #read(storage) {
    try {
      storage ??= typeof this.#storage === 'function' ? this.#storage() : this.#storage;
      if (typeof storage?.getItem !== 'function') throw new Error('没有可用的本机读取接口');
      const currentRaw = storage.getItem(SUPPORT_WORKSPACE_KEY);
      if (currentRaw !== null && typeof currentRaw !== 'string') return fail('invalid-storage-value', '本机读取结果不是原文或空记录', this.#baselineFields());
      return { ok: true, storage, currentRaw };
    } catch (error) { return fail('storage-read-failed', `读取失败，保存基线保持：${errorText(error)}`, this.#baselineFields()); }
  }

  #fields(currentRaw) {
    const currentRawBytes = bytes(currentRaw);
    return { ...this.#baselineFields(), found: currentRaw !== null, currentRawBytes,
      ...(currentRawBytes <= MAX_SUPPORT_BACKUP_BYTES ? { currentRaw } : {}) };
  }

  #compare(currentRaw) {
    const fields = this.#fields(currentRaw);
    if (fields.currentRawBytes > MAX_SUPPORT_BACKUP_BYTES) {
      return fail('stored-backup-too-large', '本机存档超过 64 KiB，未显示或写入；保留当前方案，仍可下载备份',
        { ...fields, restricted: true, conflict: currentRaw !== this.#expectedRaw });
    }
    return currentRaw === this.#expectedRaw ? { ok: true, ...fields } :
      fail('storage-conflict', '本机存档已由其他窗口修改或删除；当前方案与保存基线保持，请先检查最新原文', fields);
  }

  loadSnapshot() {
    const read = this.#read();
    if (!read.ok) return read;
    if (!this.#initialized) {
      this.#expectedRaw = read.currentRaw;
      this.#initialized = true;
    }
    // Repeated loads are observations, never implicit permission to overwrite.
    return this.#compare(read.currentRaw);
  }

  checkCurrent() {
    if (!this.#initialized) return fail('storage-not-initialized', '尚未成功读取初始保存基线', this.#baselineFields());
    const read = this.#read();
    return read.ok ? this.#compare(read.currentRaw) : read;
  }

  save(rawText) {
    const checked = checkEnvelope(rawText);
    if (!checked.ok) return { ...checked, ...this.#baselineFields() };
    if (!this.#initialized) return fail('storage-not-initialized', '尚未成功读取初始保存基线，未写入', this.#baselineFields());
    const read = this.#read();
    if (!read.ok) return read;
    const compared = this.#compare(read.currentRaw);
    if (!compared.ok) return compared;
    if (read.currentRaw !== null && !checkEnvelope(read.currentRaw).ok) {
      return fail('stored-backup-invalid', '本机存档原文损坏，未覆盖；保留当前方案，仍可下载备份', this.#fields(read.currentRaw));
    }
    try {
      if (typeof read.storage.setItem !== 'function') throw new Error('没有可用的本机保存接口');
      read.storage.setItem(SUPPORT_WORKSPACE_KEY, rawText);
    } catch (error) {
      return fail('storage-write-failed', `保存失败，仍可导出备份：${errorText(error)}`, this.#fields(read.currentRaw));
    }
    const verified = this.#read(read.storage);
    if (!verified.ok) return { ...verified, writtenRaw: rawText };
    if (verified.currentRaw !== rawText) {
      return fail('storage-verification-failed', '写入后读回原文不一致，不能确认保存成功；未回滚本机存档',
        { ...this.#fields(verified.currentRaw), writtenRaw: rawText });
    }
    this.#expectedRaw = rawText;
    return { ok: true, ...this.#fields(rawText), rawText };
  }

  acceptCurrent(expectedRaw) {
    const checked = checkEnvelope(expectedRaw);
    if (!checked.ok) return { ...checked, ...this.#baselineFields() };
    if (!this.#initialized) return fail('storage-not-initialized', '尚未成功读取初始保存基线，不能采纳', this.#baselineFields());
    const read = this.#read();
    if (!read.ok) return read;
    if (read.currentRaw !== expectedRaw) {
      return fail('storage-accept-conflict', '最新存档在检查后再次变化；未采纳旧原文或更新保存基线',
        { ...this.#fields(read.currentRaw), checkedRaw: expectedRaw });
    }
    this.#expectedRaw = expectedRaw;
    return { ok: true, ...this.#fields(expectedRaw) };
  }
}

export const createSupportStorage = storage => new SupportStorage(storage);
