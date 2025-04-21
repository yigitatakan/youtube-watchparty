import React, { useState } from 'react';
import { Search, Youtube } from 'lucide-react';

interface SearchVideoProps {
  onVideoSelect: (videoId: string) => void;
}

// Helper function to extract video ID from various YouTube URL formats
const extractVideoId = (url: string): string | null => {
  // Handle youtube.com/watch?v= format
  const watchRegex = /youtube\.com\/watch\?v=([^&]+)/;
  const watchMatch = url.match(watchRegex);
  if (watchMatch) return watchMatch[1];

  // Handle youtu.be/ format
  const shortRegex = /youtu\.be\/([^?&]+)/;
  const shortMatch = url.match(shortRegex);
  if (shortMatch) return shortMatch[1];

  // Handle youtube.com/embed/ format
  const embedRegex = /youtube\.com\/embed\/([^?&]+)/;
  const embedMatch = url.match(embedRegex);
  if (embedMatch) return embedMatch[1];

  // If it's already just a video ID (11 chars, alphanumeric + dash + underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;

  return null;
};

const SearchVideo: React.FC<SearchVideoProps> = ({ onVideoSelect }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const videoId = extractVideoId(videoUrl.trim());

    if (!videoId) {
      setError('Geçersiz YouTube URL veya video ID');
      return;
    }

    onVideoSelect(videoId);
    setVideoUrl('');
  };

  const addSampleVideo = (videoId: string) => {
    onVideoSelect(videoId);
    setVideoUrl('');
  };

  return (
    <div className="card">
      <div className="flex items-center mb-4">
        <Youtube className="h-5 w-5 mr-2 text-red-500" />
        <h2 className="font-medium">Video Ekle</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="videoUrl" className="block text-sm mb-1 text-gray-300">
            YouTube URL veya video ID yapıştırın
          </label>
          <input
            type="text"
            id="videoUrl"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="input-field w-full"
          />
          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>

        <button type="submit" className="btn-primary w-full flex items-center justify-center">
          <Search className="h-4 w-4 mr-2" />
          Video Ekle
        </button>
      </form>

      <div className="mt-4">
        <p className="text-sm text-gray-300 mb-2">Hızlı Test Videoları:</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => addSampleVideo('dQw4w9WgXcQ')}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
            Test Video 1
          </button>
          <button
            onClick={() => addSampleVideo('jNQXAC9IVRw')}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
            Test Video 2
          </button>
          <button
            onClick={() => addSampleVideo('9bZkp7q19f0')}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
            Test Video 3
          </button>
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        <p>Desteklenen formatlar:</p>
        <ul className="list-disc list-inside mt-1">
          <li>youtube.com/watch?v=videoId</li>
          <li>youtu.be/videoId</li>
          <li>Sadece video ID (örn., dQw4w9WgXcQ)</li>
        </ul>
      </div>
    </div>
  );
};

export default SearchVideo;