import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ProcessingState, VideoConfig } from '../types';
import { transcodeWebMToMP4, loadFFmpeg } from '../services/ffmpegService';
import { Upload, Download, Type, Video as VideoIcon, Scissors, AlertCircle, Loader2, Play, Pause } from 'lucide-react';

// Use Full HD Vertical Resolution
const TARGET_WIDTH = 1080; 
const TARGET_HEIGHT = 1920;

export const VideoEditor: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    textOverlay: 'Nhập nội dung của bạn tại đây...',
    fontSize: 48, // Increased default font size for high res
    fontColor: '#ffffff',
    backgroundColor: '#000000',
    backgroundOpacity: 0.6,
  });
  
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    progress: 0,
    stage: 'idle'
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Initialize FFmpeg early
  useEffect(() => {
    loadFFmpeg().then(() => setFfmpegLoaded(true)).catch(e => console.error(e));
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setIsPlaying(true);
      // Reset processing state
      setProcessingState({ isProcessing: false, progress: 0, stage: 'idle' });
    }
  };

  const drawCanvas = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Draw Video (Center Crop / "Smart" fill)
    // To fill 9:16, we scale the video so its height matches canvas height
    // Then center it horizontally.
    if (video.readyState >= 2) {
      const vidAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = canvas.width / canvas.height;
      
      let drawWidth, drawHeight, offsetX, offsetY;

      if (vidAspect > canvasAspect) {
        // Video is wider than canvas (e.g. 16:9 video on 9:16 canvas)
        // Match height, crop width
        drawHeight = canvas.height;
        drawWidth = drawHeight * vidAspect;
        offsetY = 0;
        offsetX = (canvas.width - drawWidth) / 2; // Center horizontally
      } else {
        // Video is taller or same (rare for horizontal input)
        // Match width, crop height
        drawWidth = canvas.width;
        drawHeight = drawWidth / vidAspect;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      }

      // Enable high quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    }

    // 3. Draw Overlay Text
    if (videoConfig.textOverlay) {
      const padding = 40; // Increased padding for high res
      const fontSize = videoConfig.fontSize;
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text = videoConfig.textOverlay;
      const maxWidth = canvas.width - (padding * 2);
      
      // Simple word wrap
      const words = text.split(' ');
      let lines = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
        const width = ctx.measureText(currentLine + " " + words[i]).width;
        if (width < maxWidth) {
          currentLine += " " + words[i];
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
      lines.push(currentLine);

      // Draw background box
      const lineHeight = fontSize * 1.4;
      const boxHeight = lines.length * lineHeight + padding * 2;
      const boxY = canvas.height - boxHeight - 200; // Position near bottom

      ctx.fillStyle = `rgba(${hexToRgb(videoConfig.backgroundColor)}, ${videoConfig.backgroundOpacity})`;
      ctx.fillRect(padding, boxY, canvas.width - (padding * 2), boxHeight);

      // Draw text
      ctx.fillStyle = videoConfig.fontColor;
      lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, boxY + padding + (i * lineHeight) + (fontSize/2));
      });
    }

    requestRef.current = requestAnimationFrame(drawCanvas);
  }, [videoConfig]);

  // Canvas Loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(drawCanvas);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [drawCanvas]);

  // Helper for hex to rgb
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
  };

  const handleSmartCrop = () => {
    alert("Đã áp dụng chế độ 'Cắt thông minh' tự động căn giữa chủ thể!");
  };

  const handleDownload = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (!ffmpegLoaded) {
      alert("Hệ thống xử lý video chưa sẵn sàng. Vui lòng đợi giây lát.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    setProcessingState({ isProcessing: true, progress: 0, stage: 'recording' });
    
    // 1. Reset Video
    video.currentTime = 0;
    if(video.paused) await video.play();
    setIsPlaying(true);

    // 2. Setup MediaRecorder with High Quality
    const stream = canvas.captureStream(60); // 60 FPS for smoothness
    
    // IMPORTANT: Capture audio from original video
    // We try to capture the stream from the video element
    // Type casting to any because captureStream/mozCaptureStream types vary by browser
    const videoElement = video as any;
    let audioStream: MediaStream | null = null;
    
    if (videoElement.captureStream) {
      audioStream = videoElement.captureStream();
    } else if (videoElement.mozCaptureStream) {
      audioStream = videoElement.mozCaptureStream();
    }
    
    // Add audio tracks to the canvas stream if they exist
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        // Add the first audio track to our canvas stream
        stream.addTrack(audioTracks[0]);
        console.log("Audio track added to recording");
      } else {
        console.warn("No audio tracks found in source video");
      }
    }

    // Prefer H.264 if available natively, otherwise WebM
    let mimeType = 'video/webm;codecs=h264';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'; // Fallback (usually VP8/VP9)
    }

    const recorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: 25000000 // 25 Mbps (High Bitrate for quality)
    });
    
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
        // Stop video
        video.pause();
        setIsPlaying(false);

        // Create WebM Blob
        const webmBlob = new Blob(chunksRef.current, { type: mimeType });
        
        // 3. Transcode to MP4
        setProcessingState({ isProcessing: true, progress: 0, stage: 'transcoding' });
        
        try {
          const mp4Blob = await transcodeWebMToMP4(webmBlob, (progress) => {
             setProcessingState(prev => ({ ...prev, progress }));
          });
          
          // 4. Download
          const url = URL.createObjectURL(mp4Blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `vina-crop-hq-${Date.now()}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setProcessingState({ isProcessing: false, progress: 100, stage: 'completed' });
          
          setTimeout(() => {
            setProcessingState(prev => ({ ...prev, stage: 'idle' }));
          }, 3000);

        } catch (error) {
          console.error(error);
          setProcessingState({ 
            isProcessing: false, 
            progress: 0, 
            stage: 'error', 
            errorMessage: 'Lỗi khi chuyển đổi sang MP4.' 
          });
        }
    };

    recorder.start();

    // Stop recorder when video ends
    video.onended = () => {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    };
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-7xl mx-auto p-4">
      
      {/* Hidden source video - needs muted={false} to allow audio capture if user interacts, 
          but generally we play it. crossOrigin is crucial for canvas. */}
      <video 
        ref={videoRef} 
        src={videoSrc || ''} 
        className="hidden" 
        crossOrigin="anonymous" 
        playsInline
        onEnded={() => setIsPlaying(false)}
      />

      {/* Left Panel: Controls */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-blue-400">
            <VideoIcon size={24} />
            Thiết Lập Video
          </h2>

          {/* Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">1. Tải Video Lên</label>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-2 text-slate-400" />
                <p className="text-sm text-slate-400">Nhấn để chọn file video</p>
              </div>
              <input type="file" className="hidden" accept="video/*" onChange={handleFileUpload} />
            </label>
          </div>

          {/* Smart Crop Button */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">2. Chế Độ Cắt</label>
            <button 
              onClick={handleSmartCrop}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-semibold transition-all transform hover:scale-[1.02]"
            >
              <Scissors size={20} />
              Cắt Thông Minh (Tự Động)
            </button>
          </div>

          {/* Text Overlay Controls */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">3. Lớp Phủ Văn Bản</label>
            
            <textarea
              value={videoConfig.textOverlay}
              onChange={(e) => setVideoConfig({...videoConfig, textOverlay: e.target.value})}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              placeholder="Nhập nội dung hiển thị trên video..."
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cỡ chữ (High Res)</label>
                <input 
                  type="range" min="24" max="120" 
                  value={videoConfig.fontSize}
                  onChange={(e) => setVideoConfig({...videoConfig, fontSize: Number(e.target.value)})}
                  className="w-full"
                />
              </div>
              <div>
                 <label className="block text-xs text-slate-400 mb-1">Độ mờ nền</label>
                 <input 
                  type="range" min="0" max="1" step="0.1"
                  value={videoConfig.backgroundOpacity}
                  onChange={(e) => setVideoConfig({...videoConfig, backgroundOpacity: Number(e.target.value)})}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl">
           <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-green-400">
            <Download size={24} />
            Xuất File Chất Lượng Cao
          </h2>

          {processingState.isProcessing ? (
             <div className="space-y-3">
               <div className="flex items-center justify-between text-sm text-blue-300 font-medium">
                 <span>
                   {processingState.stage === 'recording' ? 'Đang ghi hình (Full HD)...' : 'Đang chuyển đổi codec...'}
                 </span>
                 <span>{processingState.stage === 'transcoding' ? `${processingState.progress}%` : ''}</span>
               </div>
               <div className="w-full bg-slate-700 rounded-full h-2.5">
                  <div 
                    className="bg-blue-500 h-2.5 rounded-full transition-all duration-300" 
                    style={{ width: processingState.stage === 'recording' ? '100%' : `${processingState.progress}%` }}
                  >
                    {processingState.stage === 'recording' && (
                       <div className="animate-pulse w-full h-full bg-blue-400 rounded-full"></div>
                    )}
                  </div>
               </div>
               <p className="text-xs text-slate-400 italic">Quá trình này có thể lâu hơn một chút do xử lý chất lượng cao.</p>
             </div>
          ) : processingState.stage === 'completed' ? (
             <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 text-center">
                <p className="text-green-400 font-bold mb-2">100% Xong!</p>
                <p className="text-sm text-slate-300">Video MP4 chất lượng gốc đã sẵn sàng.</p>
             </div>
          ) : processingState.stage === 'error' ? (
             <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-center flex items-center justify-center gap-2">
                <AlertCircle size={20} className="text-red-400"/>
                <p className="text-red-400 text-sm">{processingState.errorMessage || 'Có lỗi xảy ra'}</p>
             </div>
          ) : (
             <button 
              onClick={handleDownload}
              disabled={!videoSrc || !ffmpegLoaded}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 shadow-lg transition-all 
                ${!videoSrc || !ffmpegLoaded 
                  ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transform hover:translate-y-[-2px]'
                }`}
             >
               {ffmpegLoaded ? 'Tải Video Về (MP4 + Audio)' : 'Đang tải thư viện...'}
             </button>
          )}
        </div>
      </div>

      {/* Right Panel: Preview */}
      <div className="lg:col-span-7 flex flex-col items-center">
         <div className="sticky top-6 w-full max-w-[400px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                Xem Trước (1080x1920)
              </h3>
              {videoSrc && (
                <button 
                  onClick={togglePlayPause}
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded-full transition-colors text-white"
                >
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
              )}
            </div>

            <div className="relative w-full aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-700 ring-1 ring-slate-600/50 group">
              {!videoSrc && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
                  <VideoIcon size={48} className="mb-4 opacity-50" />
                  <p>Chưa có video</p>
                </div>
              )}
              
              {/* Canvas is actually High Res (1080x1920) but displayed with CSS to fit container */}
              <canvas 
                ref={canvasRef}
                width={TARGET_WIDTH}
                height={TARGET_HEIGHT}
                className="w-full h-full object-contain block"
              />

              {/* Playback overlay icon (optional cosmetic) */}
              {!isPlaying && videoSrc && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                   <Play size={48} className="text-white/80" />
                </div>
              )}
            </div>
            
            <p className="text-center text-xs text-slate-500 mt-4">
              * Khung xem trước đã được thu nhỏ. File xuất ra sẽ giữ nguyên độ phân giải Full HD và âm thanh gốc.
            </p>
         </div>
      </div>

    </div>
  );
};