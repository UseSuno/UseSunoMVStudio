import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';

/**
 * Trims a video file down to the first `seconds` in browser.
 * Tries mediabunny fast remux/trim first; falls back to HTMLVideoElement + MediaRecorder.
 */
export async function trimVideo(file: File, seconds: number): Promise<Blob> {
  // Method 1: Try mediabunny fast conversion/remux
  try {
    const target = new BufferTarget();
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const output = new Output({ format: new Mp4OutputFormat(), target });
      const conversion = await Conversion.init({
        input,
        output,
        trim: { start: 0, end: seconds },
      });
      if (conversion.isValid) {
        await conversion.execute();
        if (target.buffer && target.buffer.byteLength > 0) {
          return new Blob([target.buffer], { type: 'video/mp4' });
        }
      }
    } finally {
      input.dispose();
    }
  } catch (e) {
    console.warn('mediabunny trim fallback to media recorder:', e);
  }

  // Method 2: Universal browser video element + MediaRecorder fallback
  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    let mediaStream: MediaStream | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let animId = 0;
    let timerId: ReturnType<typeof setTimeout> | 0 = 0;
    let stopped = false;

    const cleanup = () => {
      stopped = true;
      if (timerId) {
        clearTimeout(timerId);
        timerId = 0;
      }
      if (animId) {
        cancelAnimationFrame(animId);
        animId = 0;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
        canvas = null;
      }
      URL.revokeObjectURL(url);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = async () => {
      try {
        const stream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
          || (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();

        const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
          ? 'video/mp4;codecs=avc1'
          : MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm';

        mediaStream = stream || null;

        if (!mediaStream) {
          canvas = document.createElement('canvas');
          canvas.width = Math.min(1920, video.videoWidth || 1280);
          canvas.height = Math.min(1080, video.videoHeight || 720);
          const ctx = canvas.getContext('2d')!;
          mediaStream = canvas.captureStream(30);
          const draw = () => {
            if (canvas && !stopped) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              animId = requestAnimationFrame(draw);
            }
          };
          draw();
        }

        const recorder = new MediaRecorder(mediaStream, { mimeType: mime });
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: mime.split(';')[0] }));
        };
        recorder.onerror = () => {
          cleanup();
          reject(new Error('MediaRecorder error'));
        };

        recorder.start();
        video.playbackRate = 2.0; // Fast playback during trimming
        await video.play();

        const checkTime = () => {
          if (stopped) return;
          if (video.currentTime >= seconds || video.ended) {
            recorder.stop();
          } else {
            timerId = setTimeout(checkTime, 100);
          }
        };
        checkTime();
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video file for trimming'));
    };
  });
}
