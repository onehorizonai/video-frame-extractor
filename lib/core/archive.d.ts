import type { CapturedFrame } from './media.ts';
export declare const MAX_ZIP_BYTES: number;
export declare function makeZip(frames: CapturedFrame[], signal?: AbortSignal): Promise<Blob>;
