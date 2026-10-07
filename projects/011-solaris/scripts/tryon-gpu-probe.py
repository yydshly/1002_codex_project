"""Small GPU kernel checks; not a full try-on or image-quality validation.

Never enables the memory-intensive MATH attention backend. Tests only tiny
real tensors with the model's registered CFG batch, heads and head dimension.
"""
import json
from pathlib import Path
import torch
import torch.nn.functional as F
from torch.nn.attention import SDPBackend, sdpa_kernel

if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
    raise RuntimeError('The registered CUDA/bf16 device is unavailable')
report = {'purpose': 'small GPU attention kernel availability; no quality claim',
          'torch': torch.__version__, 'cuda': torch.version.cuda,
          'gpu': torch.cuda.get_device_name(0), 'capability': list(torch.cuda.get_device_capability(0)),
          'cudnn': torch.backends.cudnn.version(),
          'flash_compiled': torch.backends.cuda.is_flash_attention_available(), 'tests': []}
backends = [('efficient', SDPBackend.EFFICIENT_ATTENTION, torch.backends.cuda.can_use_efficient_attention),
            ('cudnn', SDPBackend.CUDNN_ATTENTION, torch.backends.cuda.can_use_cudnn_attention)]
with torch.inference_mode():
    for layout in ['contiguous', 'strided_linear1']:
        if layout == 'contiguous':
            q, k, v = [torch.randn(2, 10, 64, 128, device='cuda', dtype=torch.bfloat16) for _ in range(3)]
        else:
            base = torch.randn(2, 64, 7 * 1280, device='cuda', dtype=torch.bfloat16)
            q, k, v = [t.permute(0, 2, 1, 3) for t in base[..., :3 * 1280].reshape(2, 64, 3, 10, 128).unbind(2)]
        parameters = torch.backends.cuda.SDPAParams(q, k, v, None, 0.0, False, False)
        for name, backend, can_use in backends:
            row = {'layout': layout, 'backend': name, 'q_stride': list(q.stride()),
                   'supported': can_use(parameters, debug=True)}
            torch.cuda.reset_peak_memory_stats()
            try:
                with sdpa_kernel(backends=[backend]):
                    result = F.scaled_dot_product_attention(q, k, v)
                torch.cuda.synchronize()
                row.update(executed=True, finite=bool(torch.isfinite(result).all().item()),
                           peak_allocated_mib=round(torch.cuda.max_memory_allocated() / 2**20, 2))
                del result
            except RuntimeError as error:
                row.update(executed=False, error_type=type(error).__name__, error=str(error)[:500])
            report['tests'].append(row)
        del q, k, v
        if layout == 'strided_linear1':
            del base
target = Path(__file__).resolve().parents[1] / '.runtime' / 'tryon' / 'gpu-kernel-probe.json'
target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
