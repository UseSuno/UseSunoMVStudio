import { useCallback, useEffect, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';
import type { Theme } from '../vendor/folia/types';
import { frameClock } from '../folia/exportClock';

export interface CustomMediaBackgroundProps {
  url: string | null;
  mimeType?: string;
  mediaType?: 'image' | 'video' | 'gif';
  currentTime: MotionValue<number>;
  paused: boolean;
  theme: Theme;
  isDaylight: boolean;
  blur?: number;
  dim?: number;
}

const hasCanvasFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

export function CustomMediaBackground({
  url,
  mimeType,
  mediaType,
  currentTime,
  paused,
  theme,
  isDaylight,
  blur = 0,
  dim = 0.25,
}: CustomMediaBackgroundProps) {
  const isVideo = mediaType === 'video' || (mimeType || '').startsWith('video/');
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isExportingSession, setIsExportingSession] = useState(() => frameClock.exporting);
  const [isReady, setIsReady] = useState(true);

  // Synchronous export detection
  const isExporting = isExportingSession || frameClock.exporting;

  // 1. Core canvas rasterization for export frames
  const drawCurrentFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;

    const media: HTMLVideoElement | HTMLImageElement | null = isVideo ? videoRef.current : imgRef.current;
    if (!media) return;

    const mediaWidth = isVideo && 'videoWidth' in media ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth;
    const mediaHeight = isVideo && 'videoHeight' in media ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight;
    if (!mediaWidth || !mediaHeight) return;

    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // A. Base background fill
    ctx.fillStyle = theme.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    // B. Object-fit cover scaling
    const scale = Math.max(w / mediaWidth, h / mediaHeight) * (blur > 0 ? 1.06 : 1);
    const dw = mediaWidth * scale;
    const dh = mediaHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    // C. Draw media with blur
    ctx.save();
    if (blur > 0 && hasCanvasFilter) {
      ctx.filter = `blur(${blur}px)`;
    }
    ctx.drawImage(media, dx, dy, dw, dh);
    ctx.restore();

    // D. Dim overlay
    if (dim > 0) {
      ctx.fillStyle = isDaylight ? '#ffffff' : '#000000';
      ctx.globalAlpha = Math.max(0, Math.min(1, dim));
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1.0;
    }
  }, [url, isVideo, theme.backgroundColor, blur, dim, isDaylight]);

  // 2. Export session lifecycle & before-capture trigger
  useEffect(() => {
    const onExportBegin = () => {
      setIsExportingSession(true);
      if (isVideo && videoRef.current) {
        videoRef.current.pause();
      }
      drawCurrentFrame();
    };

    const onExportEnd = () => {
      setIsExportingSession(false);
      setIsReady(true);
      if (isVideo && videoRef.current && !paused) {
        void videoRef.current.play().catch(() => {});
      }
    };

    const onBeforeCapture = () => {
      drawCurrentFrame();
    };

    window.addEventListener('verse:export-begin', onExportBegin);
    window.addEventListener('verse:export-end', onExportEnd);
    window.addEventListener('verse:before-capture', onBeforeCapture);

    return () => {
      window.removeEventListener('verse:export-begin', onExportBegin);
      window.removeEventListener('verse:export-end', onExportEnd);
      window.removeEventListener('verse:before-capture', onBeforeCapture);
    };
  }, [isVideo, paused, drawCurrentFrame]);

  // 3. Play / Pause synchronization for interactive preview
  useEffect(() => {
    if (!isVideo || !url || isExporting) return;
    const video = videoRef.current;
    if (!video) return;

    if (!paused) {
      const t = currentTime.get();
      if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
        const target = Math.max(0, t) % video.duration;
        if (Math.abs(video.currentTime - target) > 0.5) {
          video.currentTime = target;
        }
      }
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [paused, isVideo, url, isExporting, currentTime]);

  // 4. Timeline seek synchronization (both export step and interactive preview)
  useEffect(() => {
    if (!url) return;
    const video = videoRef.current;

    const unsub = currentTime.on('change', t => {
      if (isExporting) {
        // Frame-by-frame offline export mode:
        if (isVideo && video) {
          video.pause();
          if (video.duration && Number.isFinite(video.duration) && video.duration > 0) {
            const target = Math.max(0, t) % video.duration;
            if (Math.abs(video.currentTime - target) > 0.005) {
              setIsReady(false);
              video.currentTime = target;
            } else {
              drawCurrentFrame();
              setIsReady(true);
            }
          } else {
            drawCurrentFrame();
            setIsReady(true);
          }
        } else {
          drawCurrentFrame();
          setIsReady(true);
        }
      } else if (isVideo && video) {
        // Interactive preview mode:
        if (!video.duration || !Number.isFinite(video.duration) || video.duration <= 0) return;
        const target = Math.max(0, t) % video.duration;

        if (paused) {
          video.currentTime = target;
        } else if (Math.abs(video.currentTime - target) > 1.5) {
          video.currentTime = target;
        }
      }
    });

    return () => unsub();
  }, [url, isVideo, paused, isExporting, currentTime, drawCurrentFrame]);

  // 5. Video seeked and ready listeners
  useEffect(() => {
    if (!isVideo || !url) return;
    const video = videoRef.current;
    if (!video) return;

    const onSeeked = () => {
      drawCurrentFrame();
      setIsReady(true);
    };

    const onCanPlay = () => {
      drawCurrentFrame();
      setIsReady(true);
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onCanPlay);

    return () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onCanPlay);
    };
  }, [isVideo, url, drawCurrentFrame]);

  // 6. Image load listener
  useEffect(() => {
    if (isVideo || !url) return;
    const img = imgRef.current;
    if (!img) return;

    const onLoad = () => {
      drawCurrentFrame();
      setIsReady(true);
    };

    if (img.complete && img.naturalWidth > 0) {
      drawCurrentFrame();
      setIsReady(true);
    } else {
      img.addEventListener('load', onLoad);
      return () => img.removeEventListener('load', onLoad);
    }
  }, [isVideo, url, drawCurrentFrame]);

  if (!url) {
    return (
      <div
        data-capture-solid
        className="absolute inset-0 flex items-center justify-center overflow-hidden"
        style={{ background: theme.backgroundColor }}
      >
        <div
          className="text-xs opacity-40 px-6 py-3 rounded-md border border-current text-center max-w-sm"
          style={{ color: theme.primaryColor }}
        >
          {isDaylight ? '未选择背景画面，请在右侧检查器上传图片、GIF 或视频' : 'No background media selected. Upload an image, GIF, or video in the Inspector.'}
        </div>
      </div>
    );
  }

  const transformScale = blur > 0 ? 'scale(1.06)' : undefined;
  const filterStyle = blur > 0 ? `blur(${blur}px)` : undefined;

  return (
    <div
      data-capture-solid
      className="absolute inset-0 overflow-hidden select-none"
      style={{ background: theme.backgroundColor }}
    >
      {/* 1. Canvas surface: active during export */}
      <canvas
        ref={canvasRef}
        data-capture-ready={isReady ? 'true' : 'false'}
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
        style={{
          display: isExporting ? 'block' : 'none',
          filter: blur > 0 && !hasCanvasFilter ? filterStyle : undefined,
          transform: blur > 0 && !hasCanvasFilter ? transformScale : undefined,
          zIndex: 2,
        }}
      />

      {/* 2. Media elements for preview & decoding */}
      {url ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={url}
            muted
            playsInline
            loop
            autoPlay
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              filter: filterStyle,
              transform: transformScale,
              willChange: blur > 0 ? 'filter, transform' : undefined,
              opacity: isExporting ? 0 : 1,
            }}
          />
        ) : (
          <img
            ref={imgRef}
            src={url}
            alt="custom background"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              filter: filterStyle,
              transform: transformScale,
              opacity: isExporting ? 0 : 1,
            }}
          />
        )
      ) : null}

      {/* 3. Dim overlay for interactive preview */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity"
        style={{
          backgroundColor: isDaylight ? '#ffffff' : '#000000',
          opacity: isExporting ? 0 : dim,
          zIndex: 1,
        }}
      />
    </div>
  );
}
