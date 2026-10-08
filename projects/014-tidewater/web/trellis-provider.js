/** Public Microsoft TRELLIS.2 adapter. Only the reference image is uploaded. */
export const TRELLIS_PROVIDER = Object.freeze({
  origin: 'https://microsoft-trellis-2.hf.space',
  space: 'https://huggingface.co/spaces/microsoft/TRELLIS.2',
  provider: 'Microsoft',
  model: 'TRELLIS.2-4B',
});

export class TrellisProviderError extends Error {
  constructor(code, message, { cause, providerMessage, receipt } = {}) {
    super(message, { cause });
    this.name = 'TrellisProviderError';
    this.code = code;
    this.providerMessage = providerMessage || message;
    this.receipt = receipt;
  }
}

const now = () => new Date().toISOString();
function messageOf(value) {
  if (typeof value === 'string') return value;
  if (!value) return '服务未提供错误详情';
  return value.error || value.detail || value.message || JSON.stringify(value).slice(0, 2000);
}
function providerError(value, receipt) {
  const text = String(messageOf(value));
  if (/quota|exceeded.*gpu|gpu.*exceeded|daily.*limit/i.test(text)) {
    return new TrellisProviderError('quota-exceeded', `TRELLIS 免费 GPU 额度不足：${text}`, { providerMessage: text, receipt });
  }
  if (/sign.?in|log.?in|unauthenticated|authentication|unauthorized/i.test(text)) {
    return new TrellisProviderError('auth-required', `TRELLIS 服务要求登录：${text}`, { providerMessage: text, receipt });
  }
  return new TrellisProviderError('queue-error', `TRELLIS 任务失败：${text}`, { providerMessage: text, receipt });
}
async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
}
function combinedSignal(signal, milliseconds) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) onAbort();
  else signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('TRELLIS 请求等待超时')), milliseconds);
  return { signal: controller.signal, dispose() { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); } };
}

/**
 * Generate one textured asset through the official public Space.
 * API indices and input defaults are read from live /config, not hard-coded.
 * fetchImpl is optional dependency injection for deterministic transport tests.
 * Canceling signal stops local waiting; an already submitted remote task may run on.
 */
export async function generateTrellisAsset({ imageBlob, seed = 20261005, onProgress, signal, fetchImpl = globalThis.fetch } = {}) {
  const receipt = {
    version: 1, provider: TRELLIS_PROVIDER.provider, model: TRELLIS_PROVIDER.model,
    space: TRELLIS_PROVIDER.space, startedAt: now(), transport: 'Gradio queue/join + SSE',
    input: { kind: 'image', sendsPlan: false, sendsTextPrompt: false }, stages: [],
    settings: { seed, resolution: '512', decimationTarget: 100000, textureSize: 2048 },
  };
  const progress = (stage, detail = {}) => onProgress?.({ stage, ...detail });
  const pendingBodies = new WeakMap();
  function guard() {
    if (signal?.aborted) throw new TrellisProviderError('aborted', '已停止本地等待；已经提交的远程任务可能继续运行。', { receipt });
  }
  async function request(url, options = {}, timeout = 30000) {
    guard(); const lifetime = combinedSignal(signal, timeout);
    try {
      const response = await fetchImpl(url, { ...options, credentials: 'omit', signal: lifetime.signal });
      pendingBodies.set(response, lifetime);
      return response;
    } catch (cause) {
      lifetime.dispose();
      if (signal?.aborted) throw new TrellisProviderError('aborted', '已停止本地等待；已经提交的远程任务可能继续运行。', { cause, receipt });
      throw new TrellisProviderError('provider-network', '连接 TRELLIS 官方服务失败或等待超时，请检查网络后重试。', { cause, providerMessage: cause.message, receipt });
    }
  }
  async function body(response, method) {
    try { return await response[method](); }
    catch (cause) {
      if (signal?.aborted) throw new TrellisProviderError('aborted', '已停止本地等待；已经提交的远程任务可能继续运行。', { cause, receipt });
      throw new TrellisProviderError('provider-network', '接收 TRELLIS 官方响应时连接中断或超时。', { cause, providerMessage: cause.message, receipt });
    } finally { pendingBodies.get(response)?.dispose(); pendingBodies.delete(response); }
  }
  async function readJson(response, stage) {
    const text = await body(response, 'text'); let data;
    try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 2000) }; }
    if (!response.ok) throw providerError(`${stage} HTTP ${response.status}：${messageOf(data)}`, receipt);
    return data;
  }

  try {
    guard();
    if (!imageBlob || typeof imageBlob.arrayBuffer !== 'function' || !imageBlob.size || !/^image\/(png|jpeg|webp)$/i.test(imageBlob.type)) {
      throw new TrellisProviderError('invalid-input', '请提供非空的 PNG、JPEG 或 WebP 参考图片。', { receipt });
    }
    if (imageBlob.size > 20 * 1024 * 1024) throw new TrellisProviderError('invalid-input', '参考图片超过 20 MB，请先缩小图片。', { receipt });
    if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw new TrellisProviderError('invalid-input', '生成种子必须是 0 到 2147483647 之间的整数。', { receipt });
    receipt.input = { ...receipt.input, mimeType: imageBlob.type, bytes: imageBlob.size, sha256: await sha256(await imageBlob.arrayBuffer()) };
    const session = `tidewater-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
    receipt.session = session;
    progress('connecting', { message: '读取 Microsoft 官方 TRELLIS.2 服务配置' });
    const config = await readJson(await request(`${TRELLIS_PROVIDER.origin}/config`), '读取配置');
    const prefix = config.api_prefix || '';
    if (!/^\/[a-zA-Z0-9_/-]*$/.test(prefix) && prefix !== '') throw new TrellisProviderError('api-changed', '服务 API 前缀发生变化，请更新适配器。', { receipt });
    const base = `${TRELLIS_PROVIDER.origin}${prefix}`;
    const components = new Map((config.components || []).map(component => [component.id, component]));
    function endpoint(name) {
      const dependency = config.dependencies?.find(item => item.api_name === name);
      if (!dependency || !Number.isInteger(dependency.id)) throw new TrellisProviderError('api-changed', `官方服务未提供 ${name} 接口。`, { receipt });
      return dependency;
    }
    const endpoints = Object.fromEntries(['start_session', 'preprocess_image', 'image_to_3d', 'extract_glb'].map(name => [name, endpoint(name)]));
    receipt.api = { version: config.version, prefix, indices: Object.fromEntries(Object.entries(endpoints).map(([name, item]) => [name, item.id])) };
    function inputs(dependency, override) {
      return dependency.inputs.map((id, index) => {
        const component = components.get(id);
        if (!component) throw new TrellisProviderError('api-changed', `服务输入组件 ${id} 缺失。`, { receipt });
        const supplied = override(component, index);
        if (supplied !== undefined) return supplied;
        if (component.type === 'state') return null;
        if ('value' in (component.props || {})) return component.props.value;
        throw new TrellisProviderError('api-changed', `服务输入“${component.props?.label || id}”没有默认值。`, { receipt });
      });
    }
    async function queued(name, data) {
      guard(); const dependency = endpoints[name];
      const joined = await readJson(await request(`${base}/queue/join`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data, fn_index: dependency.id, session_hash: session, trigger_id: null }),
      }), `提交 ${name}`);
      if (!joined.event_id) throw providerError(joined, receipt);
      const entry = { name, taskId: joined.event_id, submittedAt: now(), fnIndex: dependency.id };
      receipt.stages.push(entry);
      progress(name, { status: 'submitted', taskId: entry.taskId, message: '任务已提交官方服务' });
      const lifetime = combinedSignal(signal, 6 * 60 * 1000); let reader;
      try {
        const stream = await fetchImpl(`${base}/queue/data?session_hash=${encodeURIComponent(session)}`, { credentials: 'omit', signal: lifetime.signal });
        if (!stream.ok) throw providerError(`队列 HTTP ${stream.status}：${await stream.text()}`, receipt);
        if (!stream.body) throw new TrellisProviderError('queue-error', '官方服务未返回任务事件流。', { receipt });
        reader = stream.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
        while (true) {
          guard(); const { value, done } = await reader.read();
          if (done) throw new TrellisProviderError('queue-error', '任务事件流提前结束，尚未收到生成完成结果。', { receipt });
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              let event;
              try { event = JSON.parse(line.slice(6)); } catch { throw new TrellisProviderError('queue-error', '官方队列返回了无法解析的事件。', { receipt }); }
              if (event.event_id && event.event_id !== entry.taskId) continue;
              if (event.msg === 'estimation') progress(name, { status: 'queued', taskId: entry.taskId, rank: event.rank, queueSize: event.queue_size, etaSeconds: event.rank_eta });
              if (event.msg === 'process_starts') progress(name, { status: 'running', taskId: entry.taskId, message: '官方服务开始处理任务' });
              if (event.msg === 'progress') progress(name, { status: 'running', taskId: entry.taskId, progressData: event.progress_data });
              if (event.msg === 'unexpected_error') throw providerError(event.message || event, receipt);
              if (event.msg === 'process_completed') {
                entry.completedAt = now(); entry.success = event.success === true; entry.durationSeconds = event.output?.duration;
                if (!entry.success) { entry.error = messageOf(event.output); throw providerError(event.output, receipt); }
                if (!Array.isArray(event.output?.data)) throw new TrellisProviderError('queue-error', '官方任务没有返回有效输出。', { receipt });
                // Avoid retaining the generated preview HTML containing dozens of base64 views.
                entry.outputs = event.output.data.map(item => typeof item === 'string' ? { type: 'string', characters: item.length } : item && typeof item === 'object' ? { path: item.path, url: item.url } : item);
                progress(name, { status: 'complete', taskId: entry.taskId, durationSeconds: entry.durationSeconds });
                return event.output.data;
              }
              if (event.msg === 'close_stream') throw new TrellisProviderError('queue-error', '服务关闭了队列，任务没有完成。', { receipt });
            }
          }
        }
      } catch (cause) {
        if (cause instanceof TrellisProviderError) throw cause;
        if (signal?.aborted) throw new TrellisProviderError('aborted', '已停止本地等待；已经提交的远程任务可能继续运行。', { cause, receipt });
        throw new TrellisProviderError('provider-network', '等待 TRELLIS 官方任务时连接中断或超时。', { cause, providerMessage: cause.message, receipt });
      } finally { lifetime.dispose(); await reader?.cancel().catch(() => {}); }
    }

    progress('uploading', { message: '上传参考图片；不上传布局或文本提示词', bytes: imageBlob.size });
    const form = new FormData();
    const extension = imageBlob.type === 'image/jpeg' ? 'jpg' : imageBlob.type.split('/')[1];
    form.append('files', imageBlob, `reference.${extension}`);
    const uploaded = await readJson(await request(`${base}/upload`, { method: 'POST', body: form }, 60000), '上传图片');
    if (!Array.isArray(uploaded) || typeof uploaded[0] !== 'string') throw new TrellisProviderError('queue-error', '官方服务没有返回上传文件路径。', { receipt });
    receipt.uploadedPath = uploaded[0];
    await queued('start_session', inputs(endpoints.start_session, () => undefined));
    const [processed] = await queued('preprocess_image', inputs(endpoints.preprocess_image, component => component.type === 'image' ? { path: uploaded[0], orig_name: `reference.${extension}`, mime_type: imageBlob.type, meta: { _type: 'gradio.FileData' } } : undefined));
    if (!processed?.path) throw new TrellisProviderError('queue-error', '参考图片预处理没有返回文件。', { receipt });
    const generationData = inputs(endpoints.image_to_3d, component => {
      if (component.type === 'image') return processed;
      if (component.props?.label === 'Seed') return seed;
      if (component.props?.label === 'Resolution') return '512';
      return undefined;
    });
    receipt.settings.generationInputs = endpoints.image_to_3d.inputs.map((id, index) => ({ label: components.get(id)?.props?.label, value: components.get(id)?.type === 'image' ? 'preprocessed reference image' : generationData[index] }));
    await queued('image_to_3d', generationData);
    const files = await queued('extract_glb', inputs(endpoints.extract_glb, component => {
      if (component.props?.label === 'Decimation Target') return 100000;
      if (component.props?.label === 'Texture Size') return 2048;
      return undefined;
    }));
    const file = files.find(item => item && typeof item === 'object' && /\.glb$/i.test(item.path || ''));
    if (!file) throw new TrellisProviderError('invalid-model', '官方导出结果中没有 GLB 文件。', { receipt });
    const remote = new URL(file.url || `${base}/file=${file.path}`, TRELLIS_PROVIDER.origin);
    if (remote.origin !== TRELLIS_PROVIDER.origin) throw new TrellisProviderError('invalid-model', '导出地址不是固定的 Microsoft 官方服务。', { receipt });
    progress('downloading', { message: '下载真实生成的 PBR GLB' });
    const download = await request(remote.href, {}, 90000);
    if (!download.ok) throw providerError(`下载 GLB HTTP ${download.status}：${await body(download, 'text')}`, receipt);
    const buffer = await body(download, 'arrayBuffer'); const view = new DataView(buffer);
    if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new TrellisProviderError('invalid-model', '生成文件未通过 GLB v2 完整性检查。', { receipt });
    const glbBlob = new Blob([buffer], { type: 'model/gltf-binary' });
    const glbUrl = globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(glbBlob) : remote.href;
    receipt.completedAt = now(); receipt.output = { remoteUrl: remote.href, bytes: buffer.byteLength, sha256: await sha256(buffer) };
    const taskId = receipt.stages.find(entry => entry.name === 'image_to_3d').taskId;
    const exportTaskId = receipt.stages.find(entry => entry.name === 'extract_glb').taskId;
    progress('complete', { status: 'complete', taskId, exportTaskId, bytes: buffer.byteLength });
    return { glbUrl, glbBlob, remoteUrl: remote.href, provider: TRELLIS_PROVIDER.provider, model: TRELLIS_PROVIDER.model, taskId, exportTaskId, receipt, license: '官方模型 MIT；生成资产来源见任务记录' };
  } catch (error) {
    receipt.failure = { at: now(), code: error.code || 'unknown', message: error.message };
    if (error instanceof TrellisProviderError) throw error;
    throw new TrellisProviderError('provider-network', `TRELLIS 请求未完成：${error.message}`, { cause: error, receipt });
  }
}
