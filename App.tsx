import React from 'react';
import { VideoEditor } from './components/VideoEditor';
import { Zap } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 selection:bg-blue-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-lg">
              <Zap size={24} className="text-white" fill="currentColor" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              VinaCrop AI
            </h1>
          </div>
          <div className="text-sm font-medium text-slate-400 hidden sm:block">
            Công cụ chuyển đổi video dọc chuyên nghiệp
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-8">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Biến Video Ngang thành <span className="text-blue-400">Video Dọc (9:16)</span>
            </h1>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Tải lên video của bạn, thêm tiêu đề và tự động cắt cúp để tối ưu hóa cho TikTok, Reels, và Shorts. 
              Hỗ trợ xuất file MP4 chất lượng cao.
            </p>
          </div>
          
          <VideoEditor />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 mt-12 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} VinaCrop. Powered by React, Tailwind & FFmpeg.wasm.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;