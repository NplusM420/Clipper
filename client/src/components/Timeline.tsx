import { useRef, useEffect } from "react";

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: Array<{
    id: string;
    startTime: number;
    endTime: number;
    name: string;
  }>;
  onSeek: (time: number) => void;
  onClipSelect?: (clipId: string) => void;
}

export function Timeline({
  duration,
  currentTime,
  clips,
  onSeek,
  onClipSelect,
}: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const time = percentage * duration;
    
    onSeek(Math.max(0, Math.min(duration, time)));
  };

  const formatTime = (time: number) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-card rounded-lg p-4" data-testid="timeline">
      <div className="flex items-center justify-between mb-2 text-sm text-muted-foreground">
        <span>Timeline</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Timeline Track */}
      <div
        ref={timelineRef}
        className="relative h-12 bg-muted rounded-lg cursor-pointer"
        onClick={handleClick}
        data-testid="timeline-track"
      >
        {/* Progress Bar */}
        <div
          className="absolute top-0 left-0 h-full bg-primary rounded-lg"
          style={{ width: `${currentPercent}%` }}
          data-testid="timeline-progress"
        />

        {/* Clip Segments */}
        {clips.map((clip) => {
          const leftPercent = duration > 0 ? (clip.startTime / duration) * 100 : 0;
          const widthPercent = duration > 0 ? ((clip.endTime - clip.startTime) / duration) * 100 : 0;

          return (
            <div
              key={clip.id}
              className="absolute top-1 bottom-1 bg-accent/30 border border-accent rounded cursor-pointer hover:bg-accent/50 transition-colors"
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClipSelect?.(clip.id);
              }}
              title={`${clip.name} (${formatTime(clip.startTime)} - ${formatTime(clip.endTime)})`}
              data-testid={`timeline-clip-${clip.id}`}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-accent rounded-full pointer-events-none"
          style={{ left: `${currentPercent}%` }}
          data-testid="timeline-playhead"
        />

        {/* Time Markers */}
        <div className="absolute -bottom-6 left-0 right-0">
          {Array.from({ length: 11 }, (_, i) => {
            const time = (duration * i) / 10;
            const leftPercent = i * 10;

            return (
              <div
                key={i}
                className="absolute text-xs text-muted-foreground"
                style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
              >
                {formatTime(time)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
