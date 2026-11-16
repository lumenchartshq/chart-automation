import { ChartCommandError } from '../core-contracts/index.js';
import { AUTOMATION_CEILINGS } from './execution.js';

/** Local PNG handling; no upload, model SDK or application attachment format. */
export interface ChartPng { blob: Blob; width: number; height: number }

const DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** Signature, IHDR length/type and the width/height words. */
const HEADER_BYTES = 33;
const MAX_BASE64_LENGTH = Math.ceil(AUTOMATION_CEILINGS.imageBytes / 3) * 4;

/** Reads bounded dimensions from the PNG signature and IHDR chunk. */
function pngDimensions(header: Uint8Array): { width: number; height: number } {
  if (header.length < HEADER_BYTES) throw new ChartCommandError('invalid_input');
  if (PNG_SIGNATURE.some((value, index) => header[index] !== value)) throw new ChartCommandError('invalid_input');
  if (String.fromCharCode(...header.subarray(12, 16)) !== 'IHDR') throw new ChartCommandError('invalid_input');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bounded = (value: number) => value > 0 && value <= AUTOMATION_CEILINGS.imageDimension;
  if (!bounded(width) || !bounded(height)) throw new ChartCommandError('limit_exceeded');
  return { width, height };
}

function base64Bytes(encoded: string) {
  let binary: string;
  try { binary = atob(encoded); } catch { throw new ChartCommandError('invalid_input'); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Decodes a renderer PNG data URL; prefer `readChartPng` when the host already has a Blob. */
export function decodeChartPng(dataUrl: string): ChartPng {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) throw new ChartCommandError('invalid_input');
  if (dataUrl.length - DATA_URL_PREFIX.length > MAX_BASE64_LENGTH) throw new ChartCommandError('limit_exceeded');
  const bytes = base64Bytes(dataUrl.slice(DATA_URL_PREFIX.length));
  if (bytes.length > AUTOMATION_CEILINGS.imageBytes) throw new ChartCommandError('limit_exceeded');
  return { blob: new Blob([bytes], { type: 'image/png' }), ...pngDimensions(bytes) };
}

/** Validates a PNG Blob by reading only its header; the bytes are not copied. */
export async function readChartPng(blob: Blob): Promise<ChartPng> {
  if (blob.type !== 'image/png') throw new ChartCommandError('invalid_input');
  if (blob.size > AUTOMATION_CEILINGS.imageBytes) throw new ChartCommandError('limit_exceeded');
  const header = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  return { blob, ...pngDimensions(header) };
}
