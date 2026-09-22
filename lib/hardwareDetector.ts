import { CPU_CATALOG, GPU_CATALOG } from '@/lib/hardwareCatalog';

export interface UserHardwareSpec {
  gpuRaw: string;
  gpuCleaned: string;
  cpuName?: string;
  ramGB: number;
  cpuCores: number;
  isWebGLSupported: boolean;
  isBasicRenderDriver: boolean;
  isDefaultRam: boolean;
}

/**
 * Clean the renderer string returned by the browser.
 */
export function cleanGpuName(rawGpu: string): string {
  if (!rawGpu || typeof rawGpu !== 'string') {
    return 'Unknown GPU';
  }

  let cleaned = rawGpu;

  // Loại bỏ các tiền tố ANGLE (Vendor, ...)
  cleaned = cleaned.replace(/^ANGLE\s*\([^,]+,\s*/i, '');
  cleaned = cleaned.replace(/^ANGLE\s*\(/i, '');

  // Loại bỏ các hậu tố API đồ họa và Shader Model
  cleaned = cleaned.replace(
    /\s+(Direct3D\d*|D3D\d*|Vulkan|OpenGL|Metal|vs_\d+_\d+|ps_\d+_\d+|PCIe|Driver|Subzero).*/gi,
    ''
  );

  // Loại bỏ mã hex phần cứng dạng (0x000046A8)
  cleaned = cleaned.replace(/\s*\([0-9a-fA-FxX]+\)/g, '');

  // Loại bỏ ký hiệu thương hiệu (R), (TM)
  cleaned = cleaned.replace(/\((?:R|TM)\)/gi, '');

  // Loại bỏ dấu ngoặc đóng dư thừa
  cleaned = cleaned.replace(/\)+$/, '');

  // Xử lý khoảng trắng thừa
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned || 'Standard Display Adapter';
}

export const POPULAR_CPUS = CPU_CATALOG;
export const POPULAR_GPUS = GPU_CATALOG;

const NOT_A_GPU_NAME =
  /microsoft basic|swiftshader|llvmpipe|gdi generic|software rasterizer|unknown gpu|standard display|offscreen|qualcomm|adreno|mali-|apple gpu\b|intel\(r\) hd graphics family/i;

const NAMED_GPU =
  /geforce|rtx\s*\d|gtx\s*\d|gt\s*\d{3,}|quadro|titan\s|radeon\s+(rx|hd|r[579]|vega|pro)|rx\s*\d{3,}|arc\s+[ab]\d|iris\s+(xe|plus|pro|graphics)|uhd\s+graphics|hd\s+graphics\s+\d|apple\s+m[1-9]|nvidia\s+mx\d/i;

/** True only when the string looks like a real GPU model, not a driver/fallback. */
export function isNamedGraphicsCard(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (NOT_A_GPU_NAME.test(name)) return false;
  return NAMED_GPU.test(name);
}

/**
 * Read available hardware hints on the client.
 * Prefer the high-performance graphics context.
 */
export function detectUserHardware(): UserHardwareSpec {
  if (typeof window === 'undefined') {
    return {
      gpuRaw: 'Server Environment',
      gpuCleaned: 'Unknown GPU',
      ramGB: 8,
      cpuCores: 4,
      isWebGLSupported: false,
      isBasicRenderDriver: false,
      isDefaultRam: true,
    };
  }

  let gpuRaw = 'Unknown GPU';
  let isWebGLSupported = false;

  try {
    const canvas = document.createElement('canvas');
    // Ưu tiên WebGL2 và yêu cầu high-performance GPU
    const contextOptions: WebGLContextAttributes = {
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    };

    const gl =
      (canvas.getContext('webgl2', contextOptions) as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', contextOptions) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', contextOptions) as WebGLRenderingContext | null);

    if (gl) {
      isWebGLSupported = true;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (typeof renderer === 'string' && renderer.trim().length > 0) {
          gpuRaw = renderer.trim();
        }
      } else {
        const standardRenderer = gl.getParameter(gl.RENDERER);
        if (typeof standardRenderer === 'string') {
          gpuRaw = standardRenderer;
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi truy xuất WebGL Debug Renderer:', err);
  }

  const gpuCleaned = cleanGpuName(gpuRaw);

  // Detect Microsoft Basic Render or software rasterizer fallbacks.
  const isBasicRenderDriver =
    /Microsoft Basic Render|SwiftShader|Software Rasterizer|llvmpipe|GDI Generic/i.test(gpuRaw);

  // Quét RAM
  let ramGB = 8;
  let isDefaultRam = true;
  if ('deviceMemory' in navigator && typeof (navigator as any).deviceMemory === 'number') {
    ramGB = (navigator as any).deviceMemory;
    isDefaultRam = false;
  }

  // Quét CPU Cores
  let cpuCores = 4;
  if ('hardwareConcurrency' in navigator && typeof navigator.hardwareConcurrency === 'number') {
    cpuCores = navigator.hardwareConcurrency;
  }

  return {
    gpuRaw,
    gpuCleaned,
    ramGB,
    cpuCores,
    isWebGLSupported,
    isBasicRenderDriver,
    isDefaultRam,
  };
}
