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
  const [videoDimensions, setVideoDimensions] = useState<{width: number, height: number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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

    const handleLoadedMetadata = () => {
      if (videoElement.videoWidth && videoElement.videoHeight) {
        // Delay dimension update to prevent jarring resize effect
        setTimeout(() => {
          setVideoDimensions({
            width: videoElement.videoWidth,
            height: videoElement.videoHeight
          });
          console.log('📐 Video dimensions detected:', {
            width: videoElement.videoWidth,
            height: videoElement.videoHeight,
            aspectRatio: (videoElement.videoWidth / videoElement.videoHeight).toFixed(2)
          });
        }, 100); // Small delay to let video settle
      }
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
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

  // Handle window resize to recalculate optimal dimensions
  useEffect(() => {
    const handleResize = () => {
      if (videoDimensions) {
        // Force a re-render with new dimensions by updating state
        setVideoDimensions({...videoDimensions});
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [videoDimensions]);

  // Calculate intelligent container styling based on video aspect ratio
  const getOptimalContainerStyle = () => {
    if (!videoDimensions || !containerRef.current) {
      return { height: '100%' };
    }

    const videoAspectRatio = videoDimensions.width / videoDimensions.height;
    const container = containerRef.current.parentElement;
    
    if (!container) return { height: '100%' };
    
    const containerWidth = container.clientWidth;
    // More generous height limits to prevent cropping
    const availableHeight = window.innerHeight - 200; // Reserve 200px for controls and header
    const maxHeight = Math.max(availableHeight * 0.8, 400); // At least 400px, up to 80% of available space
    
    // Calculate height needed to show full video at this width
    const optimalHeight = containerWidth / videoAspectRatio;
    
    // Prefer optimal height, only constrain if absolutely necessary
    const finalHeight = Math.min(optimalHeight, maxHeight);
    
    console.log('📏 Container sizing:', {
      videoAspectRatio: videoAspectRatio.toFixed(2),
      containerWidth,
      optimalHeight: Math.round(optimalHeight),
      maxHeight,
      finalHeight: Math.round(finalHeight)
    });
    
    return { 
      height: `${finalHeight}px`,
      minHeight: '300px' // Ensure minimum usable size
    };
  };

  const containerStyle = getOptimalContainerStyle();

  return (
    <div className="bg-card rounded-lg overflow-hidden" data-testid="video-player">
      {/* Video Element - Intelligent aspect ratio sizing */}
      <div 
        ref={containerRef}
        className="relative bg-black w-full flex items-center justify-center"
        style={containerStyle}
      >
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
