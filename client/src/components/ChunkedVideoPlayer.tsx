import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { VideoChunkingService, VideoPart } from "@/services/videoChunkingService";
import { Video as VideoType } from "@shared/schema";

interface ChunkedVideoPlayerProps {
  video: VideoType;
  currentTime: number;
  onTimeUpdate?: (time: number) => void;
  onLoadedMetadata?: () => void;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
}

export const ChunkedVideoPlayer = forwardRef<HTMLVideoElement, ChunkedVideoPlayerProps>(({
  video,
  currentTime,
  onTimeUpdate,
  onLoadedMetadata,
  className,
  controls = true,
  autoPlay = false
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Expose the video element ref to parent component
  useImperativeHandle(ref, () => videoRef.current!, []);
  const [parts, setParts] = useState<VideoPart[]>([]);
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const chunkingService = useRef(new VideoChunkingService());

  // Load video parts if chunked
  useEffect(() => {
    if (!video.isChunked) {
      setIsLoading(false);
      return;
    }

    const loadParts = async () => {
      try {
        setIsLoading(true);
        const videoParts = await chunkingService.current.getVideoParts(video.id);
        setParts(videoParts);
        setError(null);
      } catch (err) {
        console.error("Failed to load video parts:", err);
        setError("Failed to load video parts");
      } finally {
        setIsLoading(false);
      }
    };

    loadParts();
  }, [video.id, video.isChunked]);

  // Update video source when current part changes
  useEffect(() => {
    if (!videoRef.current || !video.isChunked || parts.length === 0) return;

    const currentPart = parts[currentPartIndex];
    if (!currentPart) return;

    const newSrc = chunkingService.current.getPartUrl(currentPart);
    if (videoRef.current.src !== newSrc) {
      const wasPlaying = !videoRef.current.paused;
      const currentVideoTime = videoRef.current.currentTime;
      
      videoRef.current.src = newSrc;
      
      if (wasPlaying) {
        videoRef.current.play().catch(console.error);
      }
      
      // Preload next part for smooth playback
      chunkingService.current.preloadNextPart(parts, currentPartIndex);
    }
  }, [currentPartIndex, parts, video.isChunked]);

  // Handle time updates from external source (timeline, etc.)
  useEffect(() => {
    if (!videoRef.current || !video.isChunked || parts.length === 0) {
      // For non-chunked videos, just set the time directly
      if (videoRef.current && Math.abs(videoRef.current.currentTime - currentTime) > 0.5) {
        videoRef.current.currentTime = currentTime;
      }
      return;
    }

    const partInfo = chunkingService.current.convertTimeToPartOffset(parts, currentTime);
    if (!partInfo) return;

    // Switch to the correct part if needed
    if (partInfo.partIndex !== currentPartIndex) {
      setCurrentPartIndex(partInfo.partIndex);
    }

    // Set the time within the current part
    if (videoRef.current && Math.abs(videoRef.current.currentTime - partInfo.offsetTime) > 0.5) {
      videoRef.current.currentTime = partInfo.offsetTime;
    }
  }, [currentTime, parts, currentPartIndex, video.isChunked]);

  // Handle video time updates
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || !onTimeUpdate) return;

    if (!video.isChunked || parts.length === 0) {
      // Non-chunked video - report time directly
      onTimeUpdate(videoRef.current.currentTime);
      return;
    }

    // Chunked video - convert part time to original video time
    const originalTime = chunkingService.current.convertPartOffsetToTime(
      parts,
      currentPartIndex,
      videoRef.current.currentTime
    );
    onTimeUpdate(originalTime);

    // Check if we need to switch to the next part
    const currentPart = parts[currentPartIndex];
    if (currentPart && videoRef.current.currentTime >= currentPart.duration - 0.1) {
      // Near the end of current part, switch to next part
      const nextPartIndex = currentPartIndex + 1;
      if (nextPartIndex < parts.length) {
        setCurrentPartIndex(nextPartIndex);
      }
    }
  }, [video.isChunked, parts, currentPartIndex, onTimeUpdate]);

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    onLoadedMetadata?.();
  }, [onLoadedMetadata]);

  if (isLoading) {
    return (
      <div className={`bg-black flex items-center justify-center ${className}`}>
        <div className="text-white">Loading video...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-black flex items-center justify-center ${className}`}>
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  // For non-chunked videos, use regular video element
  if (!video.isChunked) {
    // Use the streaming endpoint for authenticated video access
    const videoSrc = video.originalPath?.startsWith('/objects/') 
      ? `/api/videos/${video.id}/stream`
      : video.originalPath;

    return (
      <video
        ref={videoRef}
        src={videoSrc}
        className={className}
        controls={controls}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
        crossOrigin="use-credentials"
      />
    );
  }

  // For chunked videos, show current part with seamless switching
  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={parts.length === 0 ? video.originalPath : undefined} // Fallback to original video if no parts
        className={className}
        controls={controls}
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        preload="metadata"
      />
      
      {/* Chunked video indicator - only show if parts are loaded */}
      {parts.length > 1 && (
        <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          Part {Math.max(1, currentPartIndex + 1)} of {parts.length}
        </div>
      )}
    </div>
  );
});