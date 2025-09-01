import { useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, SkipBack, SkipForward } from "lucide-react";
import { ChunkedVideoPlayer } from "./ChunkedVideoPlayer";
import { Video as VideoType } from "@shared/schema";

interface VideoPlayerProps {
  src?: string; // Deprecated: use video object instead
  video?: VideoType; // New: video object with chunking support
  onTimeUpdate?: (currentTime: number) => void;
  onSeek?: (time: number) => void;
  currentTime?: number;
  clips?: Array<{ startTime: number; endTime: number; id: string }>;
  onMarkStart?: () => void;
  onMarkEnd?: () => void;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(({
  src,
  video,
  onTimeUpdate,
  onSeek,
  currentTime,
  clips = [],
  onMarkStart,
  onMarkEnd,
}, ref) => {
  // Create a callback ref that will be called when the video element is available
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  
  // Use a callback ref to capture the video element when it's mounted
  const videoCallbackRef = useCallback((element: HTMLVideoElement | null) => {
    setVideoElement(element);
  }, []);
  
  // Forward the video element to parent component
  useImperativeHandle(ref, () => videoElement!, [videoElement]);

  useEffect(() => {
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      const time = videoElement.currentTime;
      onTimeUpdate?.(time);
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [onTimeUpdate, videoElement]);

  useEffect(() => {
    if (!videoElement || typeof currentTime !== 'number') return;
    // Avoid fighting playback: only seek while paused or when there's a meaningful delta
    const isPaused = videoElement.paused;
    const delta = Math.abs(videoElement.currentTime - currentTime);
    if (isPaused || delta > 0.25) {
      videoElement.currentTime = currentTime;
    }
  }, [currentTime, videoElement]);

  return (
    <div className="bg-card rounded-lg overflow-hidden" data-testid="video-player">
      {/* Video Element - Maintain aspect ratio */}
      <div className="relative bg-black w-full h-full flex items-center justify-center">
        {video ? (
          // Use ChunkedVideoPlayer for video objects (supports chunking)
          <ChunkedVideoPlayer
            video={video}
            currentTime={currentTime || 0}
            onTimeUpdate={onTimeUpdate}
            className="w-full h-full object-contain"
            controls={false} // Disable native controls - use custom controls
            ref={videoCallbackRef}
          />
        ) : src ? (
          // Fallback to regular video element for src prop (backward compatibility)
          <video
            ref={videoCallbackRef}
            src={src}
            className="w-full h-full object-contain"
            controls={false}
            crossOrigin="anonymous"
            data-testid="video-element"
          />
        ) : (
          // No video source provided
          <div className="w-full h-full flex items-center justify-center text-white">
            <div className="text-center">
              <div className="text-lg mb-2">No video selected</div>
              <div className="text-sm text-gray-400">Select a video from the list to start watching</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
