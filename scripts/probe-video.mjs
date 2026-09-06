import { readFile } from 'node:fs/promises';
import { Input, BufferSource, ALL_FORMATS } from 'mediabunny';
// Inspect the actual container and packet timing, not the requested export settings.
const bytes = await readFile(process.argv[2]);
const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
try {
 const video = await input.getPrimaryVideoTrack(), audio = await input.getPrimaryAudioTrack();
 if (!video || !audio) throw new Error('Output must contain both video and audio');
 console.log(JSON.stringify({ file: process.argv[2], bytes: bytes.length, duration: await input.computeDuration(), video: { codec: await video.getCodec(), width: await video.getCodedWidth(), height: await video.getCodedHeight(), duration: await video.computeDuration(), stats: await video.computePacketStats() }, audio: { codec: await audio.getCodec(), sampleRate: await audio.getSampleRate(), channels: await audio.getNumberOfChannels(), duration: await audio.computeDuration() } }, null, 2));
} finally { input.dispose(); }
