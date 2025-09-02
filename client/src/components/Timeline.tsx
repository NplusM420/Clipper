import { useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TimelineClip {
  id: string;
  startTime: number;
  endTime: number;
  name: string;
  status?: "ready" | "processing" | "error" | "pending";
  duration?: number;
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  clips: TimelineClip[];
  onSeek: (time: number) => void;
  onClipSelect?: (clipId: string) => void;
  className?: string;
}

export function Timeline({
  duration,
  currentTime,
  clips,
  onSeek,
  onClipSelect,
  className = "",
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

  // Get status-based styling for clips
  const getClipStyling = (clip: TimelineClip) => {
    switch (clip.status) {
      case "ready":
        return {
          bg: "bg-emerald-500/80",
          border: "border-emerald-600", 
          hover: "hover:bg-emerald-600/90",
          shadow: "shadow-emerald-500/20"
        };
      case "processing":
        return {
          bg: "bg-blue-500/80",
          border: "border-blue-600",
          hover: "hover:bg-blue-600/90", 
          shadow: "shadow-blue-500/20"
        };
      case "error":
        return {
          bg: "bg-red-500/80",
          border: "border-red-600",
          hover: "hover:bg-red-600/90",
          shadow: "shadow-red-500/20"
        };
      default:
        return {
          bg: "bg-gray-500/80",
          border: "border-gray-600",
          hover: "hover:bg-gray-600/90",
          shadow: "shadow-gray-500/20"
        };
    }
  };

  // Check for overlapping clips to adjust positioning
  const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className={`bg-card rounded-lg p-4 ${className}`} data-testid="timeline">
      <div className="flex items-center justify-between mb-3 text-sm text-muted-foreground">
        <span className="font-medium">Timeline</span>
        <div className="flex items-center gap-4">
          {clips.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {clips.length} clip{clips.length !== 1 ? 's' : ''}
              </Badge>
            </div>
          )}
          <span className="font-mono">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Timeline Track */}
      <TooltipProvider>
        <div
          ref={timelineRef}
          className="relative h-16 bg-muted rounded-lg cursor-pointer shadow-inner"
          onClick={handleClick}
          data-testid="timeline-track"
        >
          {/* Background Grid Lines */}
          <div className="absolute inset-0 rounded-lg overflow-hidden">
            {Array.from({ length: 10 }, (_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-muted-foreground/10"
                style={{ left: `${(i + 1) * 10}%` }}
              />
            ))}
          </div>

          {/* Progress Bar */}
          <div
            className="absolute top-0 left-0 h-full bg-primary/20 rounded-lg transition-all duration-200"
            style={{ width: `${currentPercent}%` }}
            data-testid="timeline-progress"
          />

          {/* Enhanced Clip Segments */}
          {sortedClips.map((clip, index) => {
            const leftPercent = duration > 0 ? (clip.startTime / duration) * 100 : 0;
            const widthPercent = duration > 0 ? ((clip.endTime - clip.startTime) / duration) * 100 : 0;
            const styling = getClipStyling(clip);

            return (
              <Tooltip key={clip.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute rounded-md cursor-pointer transition-all duration-200 ${styling.bg} ${styling.border} ${styling.hover} ${styling.shadow} border-2 shadow-lg`}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${Math.max(widthPercent, 0.5)}%`, // Minimum width for visibility
                      top: "4px",
                      height: "calc(100% - 8px)",
                      zIndex: 10 + index, // Layer clips based on order
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClipSelect?.(clip.id);
                    }}
                    data-testid={`timeline-clip-${clip.id}`}
                  >
                    {/* Clip Name Label (for wider clips) */}
                    {widthPercent > 8 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white text-xs font-medium truncate px-1 drop-shadow-sm">
                          {clip.name}
                        </span>
                      </div>
                    )}
                    
                    {/* Status Indicator Dot */}
                    <div 
                      className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white/90 shadow-sm"
                      style={{
                        backgroundColor: clip.status === "ready" ? "#10b981" : 
                                       clip.status === "processing" ? "#3b82f6" :
                                       clip.status === "error" ? "#ef4444" : "#6b7280"
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{clip.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Duration: {formatTime(clip.endTime - clip.startTime)}
                    </p>
                    {clip.status && (
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          clip.status === "ready" ? "bg-emerald-100 text-emerald-800" :
                          clip.status === "processing" ? "bg-blue-100 text-blue-800" :
                          clip.status === "error" ? "bg-red-100 text-red-800" :
                          "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {clip.status.charAt(0).toUpperCase() + clip.status.slice(1)}
                      </Badge>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Enhanced Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-primary pointer-events-none z-50"
            style={{ left: `${currentPercent}%` }}
            data-testid="timeline-playhead"
          >
            {/* Playhead Handle */}
            <div className="absolute top-1 w-3 h-3 bg-primary rounded-full shadow-lg transform -translate-x-1/2" />
          </div>

          {/* Time Markers */}
          <div className="absolute -bottom-8 left-0 right-0">
            {Array.from({ length: 11 }, (_, i) => {
              const time = (duration * i) / 10;
              const leftPercent = i * 10;

              return (
                <div
                  key={i}
                  className="absolute text-xs text-muted-foreground font-mono"
                  style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
                >
                  {formatTime(time)}
                </div>
              );
            })}
          </div>
        </div>
      </TooltipProvider>
      
      {/* Legend */}
      {clips.length > 0 && (
        <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="font-medium">Clip Status:</span>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
            <span>Ready</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <span>Processing</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            <span>Error</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
            <span>Pending</span>
          </div>
        </div>
      )}
    </div>
  );
}
