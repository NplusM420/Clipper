import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Scissors, Download, Edit3, Trash2, Play, Plus } from "lucide-react";
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
        return "bg-green-500";
      case "processing":
        return "bg-accent";
      case "error":
        return "bg-destructive";
      default:
        return "bg-muted-foreground";
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
    <div className="space-y-6" data-testid="clip-manager">
      {/* Clip Creation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Scissors className="h-5 w-5" />
            <span>Create New Clip</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <div className="flex space-x-2">
                <Input
                  id="startTime"
                  placeholder="00:12:34.250"
                  value={startTime !== undefined ? formatTime(startTime) : ""}
                  onChange={(e) => {
                    const time = parseTimeString(e.target.value);
                    onSetStartTime(time);
                  }}
                  className="font-mono"
                  data-testid="input-start-time"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetStartTime(currentTime)}
                  data-testid="button-set-start-current"
                >
                  Current
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="endTime">End Time</Label>
              <div className="flex space-x-2">
                <Input
                  id="endTime"
                  placeholder="00:15:22.180"
                  value={endTime !== undefined ? formatTime(endTime) : ""}
                  onChange={(e) => {
                    const time = parseTimeString(e.target.value);
                    onSetEndTime(time);
                  }}
                  className="font-mono"
                  data-testid="input-end-time"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSetEndTime(currentTime)}
                  data-testid="button-set-end-current"
                >
                  Current
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="clipName">Clip Name</Label>
            <Input
              id="clipName"
              placeholder="Enter clip name"
              value={clipName}
              onChange={(e) => setClipName(e.target.value)}
              data-testid="input-clip-name"
            />
          </div>

          <div>
            <Label htmlFor="quality">Quality</Label>
            <select
              id="quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="select-quality"
            >
              <option value="1080p">1080p (High)</option>
              <option value="720p">720p (Medium)</option>
              <option value="480p">480p (Low)</option>
            </select>
          </div>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Duration:{" "}
              <span className="font-mono" data-testid="text-duration">
                {formatTime(calculateDuration())}
              </span>
            </div>
            <div className="flex flex-col space-y-2">
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
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                Preview Clip
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
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Clip
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clips List */}
      <div className="space-y-3">
        <h3 className="font-semibold flex items-center justify-between">
          Clips
          <Badge variant="secondary" data-testid="clips-count">
            {clips.length}
          </Badge>
        </h3>

        {clips.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <Scissors className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No clips created yet</p>
                <p className="text-sm">Create your first clip using the form above</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          clips.map((clip) => (
            <Card key={clip.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium truncate" data-testid={`clip-name-${clip.id}`}>
                      {clip.name}
                    </h4>
                    <p className="text-sm text-muted-foreground" data-testid={`clip-time-range-${clip.id}`}>
                      {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      className={`${getStatusColor(clip.status)} text-white`}
                      data-testid={`clip-status-${clip.id}`}
                    >
                      {getStatusText(clip.status)}
                    </Badge>
                    <span className="text-sm text-muted-foreground" data-testid={`clip-duration-${clip.id}`}>
                      {formatTime(clip.duration)}
                    </span>
                  </div>
                </div>

                {clip.status === "processing" && (
                  <div className="mb-3">
                    <Progress
                      value={clip.processingProgress || 0}
                      className="h-2"
                      data-testid={`clip-progress-${clip.id}`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Processing... {clip.processingProgress || 0}%
                    </p>
                  </div>
                )}

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPreviewClip(clip)}
                    data-testid={`button-preview-${clip.id}`}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Preview
                  </Button>

                  {clip.status === "ready" && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => onDownloadClip(clip.id)}
                      data-testid={`button-download-${clip.id}`}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteClip(clip.id)}
                    className="text-destructive hover:text-destructive/80"
                    data-testid={`button-delete-${clip.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
