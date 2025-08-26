import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, Volume2, SkipBack, SkipForward } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  onTimeUpdate?: (currentTime: number) => void;
  onSeek?: (time: number) => void;
  currentTime?: number;
  clips?: Array<{ startTime: number; endTime: number; id: string }>;
  onMarkStart?: () => void;
  onMarkEnd?: () => void;
}

export function VideoPlayer({
  src,
  onTimeUpdate,
  onSeek,
  currentTime,
  clips = [],
  onMarkStart,
  onMarkEnd,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      onTimeUpdate?.(time);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [onTimeUpdate]);

  useEffect(() => {
    if (videoRef.current && typeof currentTime === 'number') {
      videoRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSeek = (value: number[]) => {
    const time = value[0];
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      onSeek?.(time);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 1000);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };

  const skipTime = (seconds: number) => {
    if (videoRef.current) {
      const newTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
      videoRef.current.currentTime = newTime;
      onSeek?.(newTime);
    }
  };

  return (
    <div className="bg-card rounded-lg overflow-hidden" data-testid="video-player">
      {/* Video Element */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full"
          data-testid="video-element"
        />
        
        {/* Timeline Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm p-4">
          {/* Timeline with Clip Markers */}
          <div className="relative mb-4">
            <Slider
              value={[currentTime || 0]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="w-full"
              data-testid="timeline-slider"
            />
            
            {/* Clip Segments */}
            {clips.map((clip) => {
              const leftPercent = (clip.startTime / duration) * 100;
              const widthPercent = ((clip.endTime - clip.startTime) / duration) * 100;
              
              return (
                <div
                  key={clip.id}
                  className="absolute top-0 h-6 bg-primary/30 border border-primary rounded-sm pointer-events-none"
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                  data-testid={`clip-segment-${clip.id}`}
                />
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-4">
              {/* Playback Controls */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipTime(-10)}
                className="text-white hover:bg-white/20"
                data-testid="button-skip-back"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={togglePlayPause}
                className="text-white hover:bg-white/20"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipTime(10)}
                className="text-white hover:bg-white/20"
                data-testid="button-skip-forward"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              {/* Time Display */}
              <span className="text-sm font-mono" data-testid="text-current-time">
                {formatTime(currentTime || 0)}
              </span>
              <span className="text-sm font-mono text-gray-400">/</span>
              <span className="text-sm font-mono text-gray-400" data-testid="text-duration">
                {formatTime(duration)}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              {/* Clip Markers */}
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkStart}
                className="text-xs bg-white/20 border-white/20 text-white hover:bg-white/30"
                data-testid="button-mark-start"
              >
                Mark Start
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={onMarkEnd}
                className="text-xs bg-white/20 border-white/20 text-white hover:bg-white/30"
                data-testid="button-mark-end"
              >
                Mark End
              </Button>

              {/* Playback Speed */}
              <select
                value={playbackRate}
                onChange={(e) => changePlaybackRate(Number(e.target.value))}
                className="text-xs bg-white/20 border border-white/20 rounded px-2 py-1 text-white"
                data-testid="select-playback-rate"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>

              {/* Volume */}
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4" />
                <Slider
                  value={[volume]}
                  max={1}
                  step={0.1}
                  onValueChange={handleVolumeChange}
                  className="w-20"
                  data-testid="volume-slider"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
