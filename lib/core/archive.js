import { Zip, ZipPassThrough } from 'fflate';
export const MAX_ZIP_BYTES = 64 * 1024 ** 2;
export async function makeZip(frames, signal) {
    if (!frames.length)
        throw new Error('Select at least one frame.');
    const sourceBytes = frames.reduce((sum, frame) => sum + frame.blob.size, 0);
    if (sourceBytes > MAX_ZIP_BYTES)
        throw new Error('Selected images exceed the 64 MiB ZIP limit. Download them individually instead.');
    if (signal?.aborted)
        throw new DOMException('Operation cancelled.', 'AbortError');
    return new Promise((resolve, reject) => {
        const parts = [];
        let bytes = 0;
        let settled = false;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener('abort', cancelled);
            if (error) {
                zip.terminate();
                reject(error);
            }
            else {
                resolve(new Blob(parts, { type: 'application/zip' }));
            }
        };
        const cancelled = () => finish(new DOMException('Operation cancelled.', 'AbortError'));
        const zip = new Zip((error, chunk, final) => {
            if (error)
                return finish(error);
            bytes += chunk.length;
            if (bytes > MAX_ZIP_BYTES + 1024 * 1024)
                return finish(new Error('ZIP exceeded the safe memory limit. Download images individually.'));
            parts.push(chunk);
            if (final)
                finish();
        });
        signal?.addEventListener('abort', cancelled, { once: true });
        void (async () => {
            try {
                for (const frame of frames) {
                    if (signal?.aborted)
                        throw new DOMException('Operation cancelled.', 'AbortError');
                    const entry = new ZipPassThrough(frame.name);
                    zip.add(entry);
                    const reader = frame.blob.stream().getReader();
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (signal?.aborted)
                                throw new DOMException('Operation cancelled.', 'AbortError');
                            if (done)
                                break;
                            entry.push(value);
                        }
                        entry.push(new Uint8Array(0), true);
                    }
                    finally {
                        reader.releaseLock();
                    }
                }
                zip.end();
            }
            catch (error) {
                finish(error instanceof Error ? error : new Error('Could not create the ZIP archive.'));
            }
        })();
    });
}
