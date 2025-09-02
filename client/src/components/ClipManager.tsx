import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Scissors, Download, Play, Plus, Trash2, Clock, Timer, FileVideo } from "lucide-react";
import type { Clip } from "@shared/schema";

interface ClipManagerProps {
  clips: Clip[];
  onCreateClip: (clipData: {
    name: string;
    startTime: number;
    endTime: number;
    quality: string;
  }) => void;
  onDeleteClip: (clipId: string) => void;
  onDownloadClip: (clipId: string) => void;
  onPreviewClip: (clip: Clip) => void;
  currentTime?: number;
  startTime?: number;
  endTime?: number;
  onSetStartTime: (time: number) => void;
  onSetEndTime: (time: number) => void;
}

export function ClipManager({
  clips,
  onCreateClip,
  onDeleteClip,
  onDownloadClip,
  onPreviewClip,
  currentTime = 0,
  startTime,
  endTime,
  onSetStartTime,
  onSetEndTime,
}: ClipManagerProps) {
  const [clipName, setClipName] = useState("");
  const [quality, setQuality] = useState("1080p");

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

  const parseTimeString = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
    } else if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return parseInt(minutes) * 60 + parseFloat(seconds);
    }
    return parseFloat(timeStr) || 0;
  };

  const handleCreateClip = () => {
    if (!clipName.trim() || startTime === undefined || endTime === undefined) {
      return;
    }

    if (startTime >= endTime) {
      return;
    }

    onCreateClip({
      name: clipName.trim(),
      startTime,
      endTime,
      quality,
    });

    // Reset form
    setClipName("");
  };

  const calculateDuration = () => {
    if (startTime !== undefined && endTime !== undefined) {
      return endTime - startTime;
    }
    return 0;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-emerald-500 hover:bg-emerald-600";
      case "processing":
        return "bg-blue-500 hover:bg-blue-600";
      case "error":
        return "bg-red-500 hover:bg-red-600";
      default:
        return "bg-gray-500 hover:bg-gray-600";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "ready":
        return "Ready";
      case "processing":
        return "Processing";
      case "error":
        return "Error";
      default:
        return "Pending";
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="clip-manager">
      {/* CREATE CLIP SECTION */}
      <div className="flex-shrink-0 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Scissors className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-lg">Create New Clip</h3>
        </div>
        
        <Card>
          <CardContent className="p-4">
            <div className="space-y-4">
              {/* TIME CONTROLS */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Start Time
                  </Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="00:12:34.250"
                      value={startTime !== undefined ? formatTime(startTime) : ""}
                      onChange={(e) => {
                        const time = parseTimeString(e.target.value);
                        onSetStartTime(time);
                      }}
                      className="font-mono text-sm"
                      data-testid="input-start-time"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetStartTime(currentTime)}
                      className="w-full h-8 text-xs"
                      data-testid="button-set-start-current"
                    >
                      Use Current Time
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    End Time
                  </Label>
                  <div className="space-y-2">
                    <Input
                      placeholder="00:15:22.180"
                      value={endTime !== undefined ? formatTime(endTime) : ""}
                      onChange={(e) => {
                        const time = parseTimeString(e.target.value);
                        onSetEndTime(time);
                      }}
                      className="font-mono text-sm"
                      data-testid="input-end-time"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSetEndTime(currentTime)}
                      className="w-full h-8 text-xs"
                      data-testid="button-set-end-current"
                    >
                      Use Current Time
                    </Button>
                  </div>
                </div>
              </div>

              <Separator />

              {/* CLIP DETAILS */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Clip Name</Label>
                  <Input
                    placeholder="Enter clip name"
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    data-testid="input-clip-name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Quality</Label>
                    <select
                      value={quality}
                      onChange={(e) => setQuality(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid="select-quality"
                    >
                      <option value="1080p">1080p (High)</option>
                      <option value="720p">720p (Medium)</option>
                      <option value="480p">480p (Low)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700">Duration</Label>
                    <div className="bg-muted/50 border border-border rounded-md px-3 py-2">
                      <span className="font-mono text-sm" data-testid="text-duration">
                        {formatTime(calculateDuration())}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SIZE WARNING */}
                {calculateDuration() > 600 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 text-amber-800 text-sm">
                      <FileVideo className="h-4 w-4 flex-shrink-0" />
                      <span>Long clips ({Math.round(calculateDuration() / 60)} min+) will be optimized for storage</span>
                    </div>
                  </div>
                )}

                {/* ACTION BUTTONS */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (startTime !== undefined && endTime !== undefined) {
                        onPreviewClip({
                          id: "preview",
                          startTime,
                          endTime,
                          name: clipName || "Preview",
                        } as Clip);
                      }
                    }}
                    disabled={startTime === undefined || endTime === undefined}
                    data-testid="button-preview-clip"
                    className="flex-1"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                  <Button
                    onClick={handleCreateClip}
                    disabled={
                      !clipName.trim() ||
                      startTime === undefined ||
                      endTime === undefined ||
                      startTime >= endTime
                    }
                    data-testid="button-create-clip"
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Clip
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CLIPS LIST SECTION */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileVideo className="h-5 w-5 text-gray-600" />
            <h3 className="font-semibold text-lg">Your Clips</h3>
          </div>
          <Badge variant="secondary" className="px-2 py-1" data-testid="clips-count">
            {clips.length}
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
          {clips.length === 0 ? (
            <Card className="border-dashed border-2 border-gray-200">
              <CardContent className="pt-8 pb-8">
                <div className="text-center text-gray-500">
                  <Scissors className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium mb-1">No clips created yet</p>
                  <p className="text-sm">Create your first clip using the form above</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            clips.map((clip) => (
              <Card key={clip.id} className="hover:shadow-sm transition-all duration-150 border border-gray-200">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* CLIP HEADER */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate text-gray-900" data-testid={`clip-name-${clip.id}`}>
                          {clip.name}
                        </h4>
                        <p className="text-sm text-gray-500 font-mono" data-testid={`clip-time-range-${clip.id}`}>
                          {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge
                          className={`${getStatusColor(clip.status)} text-white text-xs px-2 py-1`}
                          data-testid={`clip-status-${clip.id}`}
                        >
                          {getStatusText(clip.status)}
                        </Badge>
                        <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded" data-testid={`clip-duration-${clip.id}`}>
                          {formatTime(clip.duration)}
                        </span>
                      </div>
                    </div>

                    {/* PROGRESS BAR */}
                    {clip.status === "processing" && (
                      <div className="space-y-1">
                        <Progress
                          value={clip.processingProgress || 0}
                          className="h-2"
                          data-testid={`clip-progress-${clip.id}`}
                        />
                        <p className="text-xs text-gray-500 text-center">
                          Processing... {clip.processingProgress || 0}%
                        </p>
                      </div>
                    )}

                    {/* ACTION BUTTONS - Stacked layout for better spacing */}
                    <div className="space-y-2">
                      {/* Delete Button - Moved to top for better visibility */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteClip(clip.id)}
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          data-testid={`button-delete-${clip.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {/* Main Action Buttons */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onPreviewClip(clip)}
                          className="flex-1 h-8 text-xs"
                          data-testid={`button-preview-${clip.id}`}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Preview
                        </Button>

                        {clip.status === "ready" && (
                          <Button
                            size="sm"
                            onClick={() => onDownloadClip(clip.id)}
                            className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                            data-testid={`button-download-${clip.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}