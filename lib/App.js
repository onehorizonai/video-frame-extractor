import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { formatTime, makeZip, MAX_ZIP_BYTES, sampleTimes, VideoSession } from './core/index.js';
function errorMessage(error) {
    return error instanceof Error ? error.message : 'Something went wrong. Try another file.';
}
export function App({ embedded = false } = {}) {
    const session = useRef(null);
    const operation = useRef(null);
    const previews = useRef([]);
    const downloadUrls = useRef(new Set());
    const [fileName, setFileName] = useState('');
    const [info, setInfo] = useState(null);
    const [start, setStart] = useState(0);
    const [end, setEnd] = useState(0);
    const [mode, setMode] = useState('count');
    const [count, setCount] = useState(8);
    const [interval, setIntervalValue] = useState(2);
    const [frames, setFrames] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    function download(blob, name) {
        const url = URL.createObjectURL(blob);
        downloadUrls.current.add(url);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => {
            URL.revokeObjectURL(url);
            downloadUrls.current.delete(url);
        }, 60000);
    }
    function clearFrames() {
        previews.current.forEach(frame => URL.revokeObjectURL(frame.previewUrl));
        previews.current = [];
        setFrames([]);
        setSelected(new Set());
    }
    function reset() {
        operation.current?.abort();
        operation.current = null;
        session.current?.close();
        session.current = null;
        downloadUrls.current.forEach(url => URL.revokeObjectURL(url));
        downloadUrls.current.clear();
        clearFrames();
        setInfo(null);
        setFileName('');
        setError('');
        setNotice('');
        setProgress('');
        setBusy(false);
    }
    useEffect(() => () => {
        operation.current?.abort();
        session.current?.close();
        previews.current.forEach(frame => URL.revokeObjectURL(frame.previewUrl));
        downloadUrls.current.forEach(url => URL.revokeObjectURL(url));
        downloadUrls.current.clear();
    }, []);
    async function selectFile(file) {
        reset();
        if (!file)
            return;
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setProgress('Reading video metadata…');
        try {
            const next = await VideoSession.open(file, controller.signal);
            if (operation.current !== controller) {
                next.close();
                return;
            }
            session.current = next;
            setFileName(file.name);
            setInfo(next.info);
            setStart(0);
            setEnd(next.info.duration);
            setProgress('');
        }
        catch (cause) {
            if (operation.current === controller && !(cause instanceof DOMException && cause.name === 'AbortError'))
                setError(errorMessage(cause));
        }
        finally {
            if (operation.current === controller) {
                operation.current = null;
                setBusy(false);
            }
        }
    }
    async function extract() {
        const current = session.current;
        if (!current || !info)
            return;
        setError('');
        setNotice('');
        let times;
        try {
            const sampling = mode === 'count' ? { mode, count } : { mode, interval };
            times = sampleTimes(info.duration, start, end, sampling);
            if (current.estimateBytes(times.length) > 256 * 1024 ** 2) {
                throw new Error('This batch could use too much memory. Reduce the count or choose a smaller video.');
            }
        }
        catch (cause) {
            setError(errorMessage(cause));
            return;
        }
        clearFrames();
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setProgress(`Capturing 0 of ${times.length}…`);
        try {
            await current.capture(times, frame => {
                if (operation.current !== controller)
                    return;
                const preview = { ...frame, previewUrl: URL.createObjectURL(frame.blob) };
                previews.current = [...previews.current, preview];
                setFrames(previews.current);
                setSelected(previous => new Set(previous).add(frame.index));
                setProgress(`Capturing ${frame.index + 1} of ${times.length}…`);
            }, controller.signal);
            if (operation.current === controller)
                setNotice(`${times.length} PNG ${times.length === 1 ? 'frame is' : 'frames are'} ready. Choose which to export.`);
        }
        catch (cause) {
            if (operation.current === controller) {
                clearFrames();
                setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'Capture cancelled. No frames were kept.' : errorMessage(cause));
            }
        }
        finally {
            if (operation.current === controller) {
                operation.current = null;
                setBusy(false);
                setProgress('');
            }
        }
    }
    function cancel() {
        operation.current?.abort();
        setNotice('');
    }
    function toggle(index) {
        setSelected(previous => {
            const next = new Set(previous);
            if (next.has(index))
                next.delete(index);
            else
                next.add(index);
            return next;
        });
    }
    const chosen = frames.filter(frame => selected.has(frame.index));
    const zipBytes = chosen.reduce((sum, frame) => sum + frame.blob.size, 0);
    async function exportZip() {
        setError('');
        const controller = new AbortController();
        operation.current = controller;
        setBusy(true);
        setProgress('Creating ZIP on this device…');
        try {
            const blob = await makeZip(chosen, controller.signal);
            if (operation.current === controller)
                download(blob, 'video-frames.zip');
        }
        catch (cause) {
            if (operation.current === controller)
                setError(cause instanceof DOMException && cause.name === 'AbortError' ? 'ZIP creation cancelled.' : errorMessage(cause));
        }
        finally {
            if (operation.current === controller) {
                operation.current = null;
                setBusy(false);
                setProgress('');
            }
        }
    }
    const MainTag = embedded ? 'div' : 'main';
    return _jsxs("div", { className: embedded ? 'video-frame-extractor embedded' : 'video-frame-extractor', children: [!embedded && _jsxs("header", { className: "topbar", children: [_jsxs("a", { className: "brand", href: "https://onehorizon.ai/", "aria-label": "One Horizon home", children: [_jsx("span", { className: "brand-mark", children: "\u25E7" }), " One Horizon"] }), _jsx("span", { className: "topbar-label", children: "Free local tools" })] }), _jsxs(MainTag, { className: "content", children: [_jsxs("div", { className: "hero", children: [_jsx("p", { className: "eyebrow", children: "A lighter way to find your stills" }), _jsx("h1", { children: "Video frame extractor" }), _jsx("p", { className: "intro", children: "Turn a local video into a small set of timestamped PNGs. Review the frames, keep the useful ones, and export them directly from your browser." }), _jsxs("div", { className: "privacy", children: [_jsx("span", { "aria-hidden": "true", children: "\u25CF" }), " Your video and images stay on this device. No account or upload."] })] }), _jsxs("div", { className: "workspace", children: [_jsxs("section", { className: "panel setup", "aria-labelledby": "choose-title", children: [_jsxs("div", { className: "section-heading", children: [_jsx("span", { className: "step", children: "01" }), _jsxs("div", { children: [_jsx("h2", { id: "choose-title", children: "Choose a video" }), _jsx("p", { children: "Use a file your browser can play, such as a supported MP4 or WebM." })] })] }), _jsxs("label", { className: "file-picker", children: [_jsx("input", { type: "file", accept: "video/*", onChange: event => { void selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; } }), _jsx("span", { children: "Select local video" }), _jsx("span", { "aria-hidden": "true", children: "\u2197" })] }), info && _jsxs("div", { className: "file-details", children: [_jsx("strong", { children: fileName }), _jsxs("span", { children: [formatTime(info.duration), " \u00B7 ", info.width, " \u00D7 ", info.height, " source \u00B7 ", info.outputWidth, " \u00D7 ", info.outputHeight, " PNG"] }), _jsx("button", { className: "text-button", type: "button", onClick: reset, children: "Remove video and frames" })] })] }), _jsxs("section", { className: "panel controls", "aria-labelledby": "capture-title", children: [_jsxs("div", { className: "section-heading", children: [_jsx("span", { className: "step", children: "02" }), _jsxs("div", { children: [_jsx("h2", { id: "capture-title", children: "Choose your frames" }), _jsx("p", { children: "Set a range, then sample by count or interval." })] })] }), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { children: ["Start (seconds)", _jsx("input", { type: "number", min: "0", max: info?.duration, step: "0.001", value: start, disabled: !info || busy, onChange: event => setStart(event.currentTarget.valueAsNumber) })] }), _jsxs("label", { children: ["End (seconds)", _jsx("input", { type: "number", min: "0", max: info?.duration, step: "0.001", value: end, disabled: !info || busy, onChange: event => setEnd(event.currentTarget.valueAsNumber) })] }), _jsxs("label", { children: ["Sampling", _jsxs("select", { value: mode, disabled: !info || busy, onChange: event => setMode(event.currentTarget.value), children: [_jsx("option", { value: "count", children: "Even count" }), _jsx("option", { value: "interval", children: "Time interval" })] })] }), mode === 'count' ? _jsxs("label", { children: ["Number of frames", _jsx("input", { type: "number", min: "1", max: "30", step: "1", value: count, disabled: !info || busy, onChange: event => setCount(event.currentTarget.valueAsNumber) })] }) : _jsxs("label", { children: ["Every (seconds)", _jsx("input", { type: "number", min: "0.001", step: "0.001", value: interval, disabled: !info || busy, onChange: event => setIntervalValue(event.currentTarget.valueAsNumber) })] })] }), _jsxs("p", { className: "hint", children: [mode === 'count' ? 'Frames are requested at the midpoint of each equal part of the range. One frame uses the range midpoint.' : 'Frames are requested at the start, then at each interval strictly before the end.', " Browser seeking may show a nearby decoded frame."] }), _jsxs("div", { className: "actions", children: [_jsxs("button", { className: "primary", type: "button", disabled: !info || busy, onClick: () => void extract(), children: ["Extract frames ", _jsx("span", { "aria-hidden": "true", children: "\u2192" })] }), busy && _jsx("button", { className: "secondary", type: "button", onClick: cancel, children: "Cancel" })] }), busy && _jsx("p", { className: "status", role: "status", children: progress }), error && _jsx("p", { className: "message error", role: "alert", children: error }), notice && _jsx("p", { className: "message success", role: "status", children: notice })] })] }), _jsxs("section", { className: "results", "aria-labelledby": "results-title", children: [_jsxs("div", { className: "results-heading", children: [_jsxs("div", { className: "section-heading", children: [_jsx("span", { className: "step", children: "03" }), _jsxs("div", { children: [_jsx("h2", { id: "results-title", children: "Review & export" }), _jsx("p", { children: frames.length ? `${frames.length} captured · ${selected.size} selected` : 'Your captured frames will appear here.' })] })] }), frames.length > 0 && _jsxs("div", { className: "result-actions", children: [_jsx("button", { className: "secondary", type: "button", disabled: !selected.size || busy, onClick: () => chosen.forEach(frame => download(frame.blob, frame.name)), children: "Download selected PNGs" }), _jsxs("button", { className: "primary", type: "button", disabled: !selected.size || zipBytes > MAX_ZIP_BYTES || busy, onClick: () => void exportZip(), children: ["Download ZIP ", _jsx("span", { "aria-hidden": "true", children: "\u2193" })] })] })] }), zipBytes > MAX_ZIP_BYTES && _jsx("p", { className: "message error", children: "Selected images exceed the 64 MiB ZIP limit. Download individual PNGs instead." }), frames.length ? _jsx("div", { className: "frame-grid", children: frames.map(frame => _jsxs("article", { className: "frame-card", children: [_jsx("img", { src: frame.previewUrl, alt: `Captured frame ${frame.index + 1} requested at ${formatTime(frame.requestedTime)}` }), _jsxs("div", { className: "frame-meta", children: [_jsxs("label", { className: "frame-select", children: [_jsx("input", { type: "checkbox", checked: selected.has(frame.index), onChange: () => toggle(frame.index) }), " ", _jsxs("strong", { children: ["Frame ", String(frame.index + 1).padStart(2, '0')] })] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsx("dt", { children: "Requested" }), _jsx("dd", { children: formatTime(frame.requestedTime) })] }), _jsxs("div", { children: [_jsx("dt", { children: "Decoded" }), _jsx("dd", { children: frame.decodedTime === null ? 'Unavailable' : formatTime(frame.decodedTime) })] })] }), frame.duplicate && _jsx("p", { className: "duplicate", children: "Same decoded time as an earlier frame" }), _jsx("button", { className: "text-button", type: "button", onClick: () => download(frame.blob, frame.name), children: "Download PNG \u2193" })] })] }, frame.index)) }) : _jsxs("div", { className: "empty", children: [_jsx("span", { "aria-hidden": "true", children: "\u25A7" }), _jsx("p", { children: "Frames you capture will be shown here for selection." })] })] }), _jsxs("aside", { className: "limits", children: [_jsx("h2", { children: "Good to know" }), _jsx("p", { children: "Capture is limited to 30 frames, a 2 GiB source file, and resized PNGs up to 1920 \u00D7 1080 pixels. Browser codec support varies; the file extension alone does not guarantee playback. Decoded times are shown only when the browser reports them. The browser may return the same frame for nearby requests." })] })] }), !embedded && _jsxs("footer", { children: [_jsxs("span", { children: ["Made by ", _jsx("a", { href: "https://onehorizon.ai/", children: "One Horizon" })] }), _jsx("a", { href: "https://github.com/onehorizonai/video-frame-extractor", children: "View source" })] })] });
}
