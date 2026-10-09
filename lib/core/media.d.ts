export declare const MAX_INPUT_BYTES: number;
export declare const MAX_SOURCE_PIXELS: number;
export declare const MAX_OUTPUT_PIXELS: number;
export declare const MAX_WORK_BYTES: number;
export declare const MAX_PNG_BYTES: number;
export interface VideoInfo {
    duration: number;
    width: number;
    height: number;
    outputWidth: number;
    outputHeight: number;
}
export interface CapturedFrame {
    index: number;
    requestedTime: number;
    decodedTime: number | null;
    duplicate: boolean;
    name: string;
    blob: Blob;
}
export declare class VideoSession {
    private video;
    private canvas;
    private url;
    private closed;
    readonly info: VideoInfo;
    private constructor();
    static open(file: File, signal?: AbortSignal): Promise<VideoSession>;
    estimateBytes(frameCount: number): number;
    capture(times: number[], onFrame: (frame: CapturedFrame) => void, signal?: AbortSignal): Promise<void>;
    close(): void;
}
