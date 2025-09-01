import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Edit3, Save, X, Scissors } from "lucide-react";
import type { TranscriptSegment } from "@shared/schema";

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSegmentClick: (time: number) => void;
  onTranscriptUpdate: (segments: TranscriptSegment[]) => void;
  isEditable?: boolean;
  onCreateClipFromSegment?: (startTime: number, endTime: number, text: string) => void;
}

export const TranscriptPanel = React.memo(function TranscriptPanel({
  segments,
  currentTime,
  onSegmentClick,
  onTranscriptUpdate,
  isEditable = true,
  onCreateClipFromSegment,
}: TranscriptPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedSegments, setEditedSegments] = useState<TranscriptSegment[]>(segments);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditedSegments(segments);
  }, [segments]);

  // Auto-scroll to current segment (throttled)
  const lastScrollRef = useRef<number>(0);
  useEffect(() => {
    const currentSegment = segments.find(
      (segment) => currentTime >= segment.start && currentTime <= segment.end
    );

    if (currentSegment && scrollAreaRef.current) {
      const now = performance.now();
      if (now - lastScrollRef.current < 300) return;
      lastScrollRef.current = now;

      const segmentElement = scrollAreaRef.current.querySelector(
        `[data-segment-id="${currentSegment.id}"]`
      );
      if (segmentElement) {
        segmentElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [currentTime, segments]);

  const filteredSegments = segments.filter((segment) =>
    segment.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSaveEdit = () => {
    onTranscriptUpdate(editedSegments);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedSegments(segments);
    setIsEditing(false);
  };

  const updateSegmentText = (segmentId: string, newText: string) => {
    setEditedSegments((prev) =>
      prev.map((segment) =>
        segment.id === segmentId ? { ...segment, text: newText } : segment
      )
    );
  };

  const isCurrentSegment = (segment: TranscriptSegment) => {
    return currentTime >= segment.start && currentTime <= segment.end;
  };

  return (
    <div className="h-full flex flex-col bg-card rounded-lg" data-testid="transcript-panel">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Transcript</h3>
          <div className="flex items-center space-x-2">
            {isEditable && (
              <>
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveEdit}
                      className="text-green-400 hover:text-green-300"
                      data-testid="button-save-transcript"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelEdit}
                      className="text-destructive hover:text-destructive/80"
                      data-testid="button-cancel-edit"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="button-edit-transcript"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transcript..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-transcript"
          />
        </div>
      </div>

      {/* Transcript Content */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef} data-testid="transcript-content">
        <div className="space-y-4">
          {filteredSegments.map((segment) => {
            const isCurrent = isCurrentSegment(segment);
            const displaySegments = isEditing ? editedSegments : segments;
            const displaySegment = displaySegments.find(s => s.id === segment.id) || segment;

            return (
              <div
                key={segment.id}
                data-segment-id={segment.id}
                className={`group cursor-pointer transition-all duration-200 ${
                  isCurrent
                    ? "bg-primary/20 border border-primary/50 rounded-lg p-3"
                    : "hover:bg-muted/50 rounded-lg p-3"
                }`}
                onClick={() => !isEditing && onSegmentClick(segment.start)}
                data-testid={`transcript-segment-${segment.id}`}
              >
                <div className="flex items-start space-x-3">
                  <button
                    className={`text-xs font-mono px-2 py-1 rounded transition-colors ${
                      isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSegmentClick(segment.start);
                    }}
                    data-testid={`timestamp-${segment.id}`}
                  >
                    {formatTime(segment.start)}
                  </button>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <textarea
                        value={displaySegment.text}
                        onChange={(e) => updateSegmentText(segment.id, e.target.value)}
                        className="w-full bg-input border border-border rounded px-2 py-1 text-sm resize-none"
                        rows={Math.max(1, Math.ceil(displaySegment.text.length / 80))}
                        data-testid={`textarea-segment-${segment.id}`}
                      />
                    ) : (
                      <p
                        className={`text-sm leading-relaxed ${
                          searchTerm &&
                          segment.text.toLowerCase().includes(searchTerm.toLowerCase())
                            ? "mark"
                            : ""
                        }`}
                        data-testid={`text-segment-${segment.id}`}
                      >
                        {displaySegment.text}
                      </p>
                    )}

                    {segment.confidence && (
                      <div className="flex items-center mt-1 text-xs text-muted-foreground">
                        <span>Confidence: {Math.round(segment.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>

                  {/* Clip creation button - shown on hover */}
                  {!isEditing && onCreateClipFromSegment && (
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateClipFromSegment(segment.start, segment.end, segment.text);
                      }}
                      title="Create clip from this segment"
                      data-testid={`button-clip-segment-${segment.id}`}
                    >
                      <Scissors className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredSegments.length === 0 && searchTerm && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No segments found matching "{searchTerm}"</p>
            </div>
          )}

          {segments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>No transcript available. Upload a video to generate a transcript.</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {segments.length > 0 && (
        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {segments.length} segment{segments.length !== 1 ? 's' : ''}
            </span>
            {segments.some(s => s.confidence) && (
              <span>
                Avg. Confidence:{' '}
                {Math.round(
                  segments.reduce((sum, s) => sum + (s.confidence || 0), 0) / segments.length * 100
                )}%
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
