export declare const MAX_FRAMES = 30;
export type Sampling = {
    mode: 'count';
    count: number;
} | {
    mode: 'interval';
    interval: number;
};
export declare function sampleTimes(duration: number, start: number, end: number, sampling: Sampling): number[];
export declare function formatTime(seconds: number): string;
export declare function frameName(index: number, requestedTime: number): string;
