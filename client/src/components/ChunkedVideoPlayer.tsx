import React, { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Video as VideoType } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface ChunkedVideoPlayerProps {
  video: VideoType;
  currentTime: number;
  onTimeUpdate?: (time: number) => void;
  onLoadedMetadata?: () => void;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
}

export const ChunkedVideoPlayer = forwardRef<HTMLVideoElement, ChunkedVideoPlayerProps>((
  {
    video,
    currentTime,
    onTimeUpdate,
    onLoadedMetadata,
    className,
    controls = true,
    autoPlay = false
  },
  ref
) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [seamlessVideoUrl, setSeamlessVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expose the video element ref to parent component
  useImperativeHandle(ref, () => videoRef.current!, []);

  // Notify parent when video element changes (for callback refs)
  useEffect(() => {
    if (ref && typeof ref === 'function' && videoRef.current) {
      ref(videoRef.current);
    }
  }, [ref, videoRef.current]);

  // SMART SOLUTION: Get seamless playback URL for chunked videos
  useEffect(() => {
    const getSeamlessPlaybackUrl = async () => {
      if (!video.isChunked) {
        // For non-chunked videos, use original path directly
        setSeamlessVideoUrl(getOptimizedVideoUrl(video.originalPath));
        return;
      }

      setIsLoading(true);
      try {
        console.log('🎯 Getting seamless playback URL for chunked video:', video.id);
        
        const response = await apiRequest("GET", `/api/videos/${video.id}/playback`);
        if (!response.ok) {
          throw new Error(`Failed to get playback URL: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Got seamless playback response:', data);
        
        if (data.playbackUrl) {
          // Convert relative URL to full URL if needed
          const playbackUrl = data.playbackUrl.startsWith('/') 
            ? `${window.location.origin}${data.playbackUrl}`
            : data.playbackUrl;
          
          setSeamlessVideoUrl(playbackUrl);
          console.log('🎬 Using seamless video URL:', playbackUrl);
        } else {
          throw new Error('No playback URL provided');
        }
      } catch (err) {
        console.error('❌ Failed to get seamless playback URL:', err);
        setError('Failed to load seamless video');
        
        // Fallback to original path with optimization
        setSeamlessVideoUrl(getOptimizedVideoUrl(video.originalPath));
      } finally {
        setIsLoading(false);
      }
    };

    getSeamlessPlaybackUrl();
  }, [video.id, video.isChunked, video.originalPath]);

  // Get optimized Cloudinary URL
  const getOptimizedVideoUrl = (originalPath: string | null): string | null => {
    if (!originalPath) return null;
    
    if (originalPath.startsWith('/objects/')) {
      // Let the server proxy/generate the URL to avoid exposing cloud config
      const publicId = originalPath.replace('/objects/', '');
      return `${window.location.origin}/objects/${publicId}`;
    }
    
    return originalPath;
  };

  // Handle time updates
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  }, [onTimeUpdate]);

  // Handle metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      console.log('✅ Seamless video loaded:', {
        duration: videoRef.current.duration,
        dimensions: `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`,
        isChunked: video.isChunked
      });
    }
    onLoadedMetadata?.();
  }, [onLoadedMetadata, video.isChunked]);

  // Handle external time changes (from timeline, etc.)
  useEffect(() => {
    if (!videoRef.current || typeof currentTime !== 'number') return;
    
    const delta = Math.abs(videoRef.current.currentTime - currentTime);
    if (delta > 0.5) {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  if (isLoading) {
    return (
      <div className={`bg-black flex items-center justify-center ${className}`}>
        <div className="text-white">Loading seamless video...</div>
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

  if (!seamlessVideoUrl) {
    return (
      <div className={`bg-black flex items-center justify-center ${className}`}>
        <div className="text-white">No video source available</div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={seamlessVideoUrl}
      className={`${className} object-contain w-full h-full`}
      controls={controls}
      autoPlay={autoPlay}
      onTimeUpdate={handleTimeUpdate}
      onLoadedMetadata={handleLoadedMetadata}
      preload="auto"
      playsInline
      crossOrigin="anonymous"
      onError={(e) => {
        console.error('❌ Seamless video error:', {
          error: e.currentTarget.error?.message,
          code: e.currentTarget.error?.code,
          src: e.currentTarget.src
        });
        setError('Video playback failed');
      }}
      onLoadStart={() => {
        console.log('🔄 Loading seamless video...');
      }}
      onCanPlay={() => {
        console.log('📺 Seamless video ready to play');
      }}
    />
  );
});

ChunkedVideoPlayer.displayName = 'ChunkedVideoPlayer';