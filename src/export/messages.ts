import i18n from '../i18n';

const en = {
  canceled: 'Export canceled.', captureTimeout: 'The animation did not return a frame in time.',
  frameMissing: 'No animation frame was received.', canvasMissing: 'The animation canvas is not ready. Wait for the preview and try again.',
  composeFailed: 'The animation frame could not be composed.', unsupportedComposition: 'This effect needs browser recording to preserve its appearance. Choose compatible recording.',
  realtimeRequired: 'This animation and background combination requires compatible recording.', stageMissing: 'The animation stage is not ready.',
  codecMissing: 'This browser cannot record the selected format.', regionMissing: 'This effect requires tab-region recording, which is unavailable in this browser. Use desktop Chrome or choose a Canvas animation with a different background.',
  cropMissing: 'This browser cannot crop the recording to the animation stage.', visibilityLost: 'Recording stopped because Studio is no longer visible. Keep this page in the foreground.',
  sharingStopped: 'Tab sharing stopped. The recording was canceled.', preparingFrames: 'Preparing the animation and fonts…',
  recordingFailed: 'The animation could not be recorded.', recording: 'Recording the animation…',
  frames: 'Rendering frame {{current}} of {{total}}', muxing: 'Finishing the video…', muxFailed: 'The video could not be finalized.',
  complete: 'Export complete.', canvasReadFailed: 'The animation canvas could not be read.',
  legacyWrongRenderer: 'Use the Folia export path for this animation.', invalidRange: 'The export range is outside the audio duration.',
  codecCombination: 'This browser cannot encode the selected audio and video combination. Choose another format.',
  commonRecording: 'This background includes browser-rendered shapes and requires compatible recording.',
  captureCheck: 'Tab-region recording is available.', captureUnavailable: 'Tab-region recording is unavailable in this browser.',
};
const zh: Record<keyof typeof en, string> = {
  canceled: '已取消导出。', captureTimeout: '等待动画画布超时。', frameMissing: '没有收到动画帧。',
  canvasMissing: '动画画布尚未就绪，请等待预览加载后重试。', composeFailed: '动画画面合成失败。',
  unsupportedComposition: '这个效果需要浏览器录制才能保留完整画面，请选择兼容录制。', realtimeRequired: '此动画与背景组合需要使用兼容录制。',
  stageMissing: '动画舞台尚未准备好。', codecMissing: '此浏览器不支持所选录制格式。',
  regionMissing: '此效果需要浏览器标签页区域录制，当前浏览器不支持。请使用桌面 Chrome，或选择画布动画与其他背景。', cropMissing: '浏览器无法裁切动画区域。',
  visibilityLost: '页面不再可见，录制已中断，请保持 Studio 页面在前台。', sharingStopped: '页面共享已停止，录制取消。',
  preparingFrames: '正在准备动画与字体…', recordingFailed: '动画录制失败。', recording: '正在录制动画…',
  frames: '正在生成 {{current}} / {{total}} 帧', muxing: '正在封装视频…', muxFailed: '视频封装失败。', complete: '导出完成。',
  canvasReadFailed: '无法读取动画画布。', legacyWrongRenderer: '请使用 Folia 动画导出路径。', invalidRange: '导出范围超出音频时长。',
  codecCombination: '浏览器不支持此音视频编码组合，请选择其他格式。', commonRecording: '此背景包含浏览器绘制的图形，需要兼容录制。',
  captureCheck: '支持标签页区域录制。', captureUnavailable: '此浏览器不支持标签页区域录制。',
};
for (const [language, entries] of [['en', en], ['zh-CN', zh]] as const) {
  i18n.addResourceBundle(language, 'translation', Object.fromEntries(Object.entries(entries).map(([key, value]) => [`exportRuntime.${key}`, value])), true, false);
}
export const exportMessage = (key: keyof typeof en, values?: Record<string, string | number>) => String(i18n.t(`exportRuntime.${key}`, { defaultValue: en[key], ...values }));
