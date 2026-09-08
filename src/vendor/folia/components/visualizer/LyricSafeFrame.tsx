import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Fit the animated glyph bounds, rather than the untransformed flex boxes.
 * Keep a line's smallest scale until its layout changes, so word pulses cannot
 * make the whole composition repeatedly zoom in and out. Backgrounds stay full bleed.
 */
export function LyricSafeFrame({ children, layoutKey, absolute = false }: {
    children: ReactNode; layoutKey: unknown; absolute?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        let scale = 1, id = 0;
        element.style.transform = 'scale(1)';
        const reset = () => { scale = 1; element.style.transform = 'scale(1)'; };
        window.addEventListener('resize', reset);
        const fit = () => {
            const rect = element.getBoundingClientRect();
            const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
            const margin = Math.min(window.innerWidth, window.innerHeight) * .05;
            let next = scale;
            for (const word of element.querySelectorAll<HTMLElement>('[data-lyric-bounds]')) {
                const box = word.getBoundingClientRect();
                if (!box.width || !box.height) continue;
                // Undo our own scale, retaining all native rotation, offsets and springs.
                const left = (cx - box.left) / scale, right = (box.right - cx) / scale;
                const top = (cy - box.top) / scale, bottom = (box.bottom - cy) / scale;
                if (left > 0) next = Math.min(next, (cx - margin) / left);
                if (right > 0) next = Math.min(next, (window.innerWidth - margin - cx) / right);
                if (top > 0) next = Math.min(next, (cy - margin) / top);
                if (bottom > 0) next = Math.min(next, (window.innerHeight - margin - cy) / bottom);
            }
            if (next > 0 && next < scale - .0001) {
                scale = next * .98; // reserve room for the following animation frame
                element.style.transform = `scale(${scale})`;
            }
            id = requestAnimationFrame(fit);
        };
        fit();
        return () => { cancelAnimationFrame(id); window.removeEventListener('resize', reset); };
    }, [layoutKey]);
    return <div ref={ref} data-lyric-safe-frame style={{
        width: '100%', ...(absolute ? { position: 'absolute', inset: 0, height: '100%', zIndex: 10 } : {}),
        transformOrigin: '50% 50%',
    }}>{children}</div>;
}
