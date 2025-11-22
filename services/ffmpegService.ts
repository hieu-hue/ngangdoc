import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Singleton instance
let ffmpeg: FFmpeg | null = null;

export const loadFFmpeg = async (): Promise<FFmpeg> => {
  if (ffmpeg) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();

  // Load ffmpeg.wasm from CDN
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    console.log("FFmpeg loaded successfully");
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    ffmpeg = null;
    throw new Error("Không thể tải thư viện xử lý video. Vui lòng thử lại hoặc kiểm tra kết nối mạng.");
  }

  return ffmpeg;
};

export const transcodeWebMToMP4 = async (
  webmBlob: Blob, 
  onProgress: (progress: number) => void
): Promise<Blob> => {
  const ffmpegInstance = await loadFFmpeg();

  const inputName = 'input.webm';
  const outputName = 'output.mp4';

  // Write file to memory
  await ffmpegInstance.writeFile(inputName, await fetchFile(webmBlob));

  // Track progress
  ffmpegInstance.on('progress', ({ progress }) => {
    // progress is 0-1
    onProgress(Math.round(progress * 100));
  });

  // Execute FFmpeg command
  // High Quality Settings:
  // -c:v libx264: Use H.264 codec
  // -preset superfast: Balance between speed and compression (ultrafast makes bigger files/lower quality per bit)
  // -crf 20: Constant Rate Factor (18-28 is the sweet spot, lower is better quality). 20 is visually lossless for HD.
  // -c:a aac: Encode audio to AAC (standard for MP4)
  // -b:a 192k: Audio bitrate
  // -movflags +faststart: Optimize for web playback (optional but good practice)
  
  await ffmpegInstance.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'superfast',
    '-crf', '20', 
    '-c:a', 'aac',
    '-b:a', '192k',
    '-strict', 'experimental',
    outputName
  ]);

  // Read result
  const data = await ffmpegInstance.readFile(outputName);
  
  // Cleanup
  await ffmpegInstance.deleteFile(inputName);
  await ffmpegInstance.deleteFile(outputName);

  return new Blob([data], { type: 'video/mp4' });
};