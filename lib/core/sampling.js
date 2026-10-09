export const MAX_FRAMES = 30;
export function sampleTimes(duration, start, end, sampling) {
    if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('This video has no usable duration.');
    if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end > duration) {
        throw new Error('Choose a range with 0 ≤ start < end ≤ video duration.');
    }
    if (sampling.mode === 'count') {
        if (!Number.isInteger(sampling.count) || sampling.count < 1 || sampling.count > MAX_FRAMES) {
            throw new Error(`Choose between 1 and ${MAX_FRAMES} frames.`);
        }
        return Array.from({ length: sampling.count }, (_, i) => start + ((i + 0.5) * (end - start)) / sampling.count);
    }
    if (!Number.isFinite(sampling.interval) || sampling.interval <= 0) {
        throw new Error('Interval must be greater than zero.');
    }
    const count = Math.ceil((end - start) / sampling.interval);
    if (count > MAX_FRAMES)
        throw new Error(`This interval would exceed ${MAX_FRAMES} frames. Increase it or shorten the range.`);
    return Array.from({ length: count }, (_, i) => start + i * sampling.interval).filter(time => time < end);
}
export function formatTime(seconds) {
    const ms = Math.round(seconds * 1000);
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${hours ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
export function frameName(index, requestedTime) {
    return `frame-${String(index + 1).padStart(3, '0')}-${Math.round(requestedTime * 1000)}ms.png`;
}
