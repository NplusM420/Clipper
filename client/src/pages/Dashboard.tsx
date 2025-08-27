import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VideoPlayer } from "@/components/VideoPlayer";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ClipManager } from "@/components/ClipManager";
import { UploadModal } from "@/components/UploadModal";
import { SettingsModal } from "@/components/SettingsModal";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import {
  Video,
  Settings,
  Upload,
  Play,
  Pause,
  Download,
  User,
  LogOut,
  FileVideo,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import type { Video as VideoType, Clip, Transcript, TranscriptSegment } from "@shared/schema";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [clipStartTime, setClipStartTime] = useState<number | undefined>();
  const [clipEndTime, setClipEndTime] = useState<number | undefined>();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, toast]);

  // Fetch user videos
  const { data: videos = [], isLoading: videosLoading } = useQuery<VideoType[]>({
    queryKey: ["/api/videos"],
    enabled: isAuthenticated,
    refetchInterval: 5000, // Refresh every 5 seconds for processing updates
  });

  // Fetch transcript for selected video
  const { data: transcript } = useQuery<Transcript>({
    queryKey: ["/api/videos", selectedVideo?.id, "transcript"],
    enabled: !!selectedVideo?.id,
  });

  // Fetch clips for selected video
  const { data: clips = [] } = useQuery<Clip[]>({
    queryKey: ["/api/videos", selectedVideo?.id, "clips"],
    enabled: !!selectedVideo?.id,
    refetchInterval: 2000, // Refresh for processing updates
  });

  // Create clip mutation
  const createClipMutation = useMutation({
    mutationFn: async (clipData: {
      name: string;
      startTime: number;
      endTime: number;
      quality: string;
    }) => {
      if (!selectedVideo) throw new Error("No video selected");
      
      const response = await apiRequest("POST", "/api/clips", {
        videoId: selectedVideo.id,
        ...clipData,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", selectedVideo?.id, "clips"] });
      toast({
        title: "Clip Created",
        description: "Your clip is being processed and will be ready shortly.",
      });
      setClipStartTime(undefined);
      setClipEndTime(undefined);
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create clip. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete clip mutation
  const deleteClipMutation = useMutation({
    mutationFn: async (clipId: string) => {
      await apiRequest("DELETE", `/api/clips/${clipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", selectedVideo?.id, "clips"] });
      toast({
        title: "Clip Deleted",
        description: "The clip has been removed.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete clip. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update transcript mutation
  const updateTranscriptMutation = useMutation({
    mutationFn: async (segments: TranscriptSegment[]) => {
      if (!transcript) throw new Error("No transcript to update");
      await apiRequest("PUT", `/api/transcripts/${transcript.id}`, { segments });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos", selectedVideo?.id, "transcript"] });
      toast({
        title: "Transcript Updated",
        description: "Your changes have been saved.",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update transcript. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleVideoUpload = (video: VideoType) => {
    queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
    setSelectedVideo(video);
    setIsUploadModalOpen(false);
  };

  const handleVideoSelect = (video: VideoType) => {
    setSelectedVideo(video);
    setCurrentTime(0);
    setClipStartTime(undefined);
    setClipEndTime(undefined);
  };

  const handleMarkStart = () => {
    setClipStartTime(currentTime);
  };

  const handleMarkEnd = () => {
    setClipEndTime(currentTime);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
  };

  const handleSegmentClick = (time: number) => {
    setCurrentTime(time);
  };

  const handleCreateClip = (clipData: {
    name: string;
    startTime: number;
    endTime: number;
    quality: string;
  }) => {
    createClipMutation.mutate(clipData);
  };

  const handleDeleteClip = (clipId: string) => {
    deleteClipMutation.mutate(clipId);
  };

  const handleDownloadClip = (clipId: string) => {
    const clip = clips.find(c => c.id === clipId);
    if (clip?.outputPath) {
      window.open(clip.outputPath, '_blank');
    }
  };

  const handlePreviewClip = (clip: Clip) => {
    setCurrentTime(clip.startTime);
  };

  const handleTranscriptUpdate = (segments: TranscriptSegment[]) => {
    updateTranscriptMutation.mutate(segments);
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

  const getVideoStatusIcon = (video: VideoType) => {
    if (video.status === "ready" && video.transcriptionStatus === "completed") {
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    } else if (video.status === "error" || video.transcriptionStatus === "error") {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    } else {
      return <Clock className="h-4 w-4 text-accent" />;
    }
  };

  const getVideoStatusText = (video: VideoType) => {
    if (video.status === "error" || video.transcriptionStatus === "error") {
      return "Error";
    } else if (video.status === "ready" && video.transcriptionStatus === "completed") {
      return "Ready";
    } else if (video.transcriptionStatus === "processing") {
      return "Transcribing";
    } else if (video.status === "processing") {
      return "Processing";
    } else {
      return "Uploading";
    }
  };

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground" data-testid="dashboard">
      {/* Navigation Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Video className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Video Clipper</h1>
            </div>
            <nav className="hidden md:flex space-x-1">
              <Button variant="default" size="sm" data-testid="nav-dashboard">
                Dashboard
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsModalOpen(true)}
                data-testid="nav-settings"
              >
                Settings
              </Button>
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-muted-foreground">
              Videos: <span className="text-foreground font-medium">{videos.length}</span>
            </div>
            <div className="flex items-center space-x-2">
              {user?.profileImageUrl ? (
                <img
                  src={user.profileImageUrl}
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
              <span className="text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = "/api/logout"}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-card border-r border-border flex flex-col">
          {/* Current Project */}
          {selectedVideo && (
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold mb-4">Current Project</h2>
              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-16 h-12 bg-secondary rounded-md flex items-center justify-center">
                    <FileVideo className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate" data-testid="current-project-name">
                      {selectedVideo.filename}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid="current-project-duration">
                      {formatTime(selectedVideo.duration)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <div className="flex items-center space-x-2">
                    {getVideoStatusIcon(selectedVideo)}
                    <span>{getVideoStatusText(selectedVideo)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Videos List */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Videos</h3>
              <Button
                size="sm"
                onClick={() => setIsUploadModalOpen(true)}
                data-testid="button-upload-video"
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>

            {videosLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-muted rounded-lg p-3 animate-pulse">
                    <div className="h-4 bg-secondary rounded mb-2"></div>
                    <div className="h-3 bg-secondary rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileVideo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No videos uploaded yet</p>
                <p className="text-sm">Upload your first video to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div
                    key={video.id}
                    className={`bg-muted rounded-lg p-3 border transition-all cursor-pointer hover:bg-muted/80 ${
                      selectedVideo?.id === video.id
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                    onClick={() => handleVideoSelect(video)}
                    data-testid={`video-item-${video.id}`}
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-12 h-8 bg-secondary rounded flex items-center justify-center">
                        <FileVideo className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{video.filename}</h4>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(video.duration)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end">
                        <div className="flex items-center space-x-1">
                          {getVideoStatusIcon(video)}
                          <span className="text-xs">{getVideoStatusText(video)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clip Management */}
          {selectedVideo && (
            <div className="border-t border-border">
              <div className="p-6">
                <ClipManager
                  clips={clips}
                  onCreateClip={handleCreateClip}
                  onDeleteClip={handleDeleteClip}
                  onDownloadClip={handleDownloadClip}
                  onPreviewClip={handlePreviewClip}
                  currentTime={currentTime}
                  startTime={clipStartTime}
                  endTime={clipEndTime}
                  onSetStartTime={setClipStartTime}
                  onSetEndTime={setClipEndTime}
                />
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedVideo ? (
            <div className="flex-1 flex">
              {/* Video Player Panel */}
              <div className="flex-1 flex flex-col p-6">
                <VideoPlayer
                  video={selectedVideo}
                  onTimeUpdate={setCurrentTime}
                  onSeek={handleSeek}
                  currentTime={currentTime}
                  clips={clips.map(clip => ({
                    id: clip.id,
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                  }))}
                  onMarkStart={handleMarkStart}
                  onMarkEnd={handleMarkEnd}
                />
              </div>

              {/* Transcript Panel */}
              <div className="w-96 border-l border-border p-6">
                <TranscriptPanel
                  segments={(transcript?.segments as TranscriptSegment[]) || []}
                  currentTime={currentTime}
                  onSegmentClick={handleSegmentClick}
                  onTranscriptUpdate={handleTranscriptUpdate}
                  isEditable={true}
                />
              </div>
            </div>
          ) : (
            // Welcome State
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-6 max-w-md">
                <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto">
                  <Video className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Welcome to Video Clipper</h2>
                  <p className="text-muted-foreground mb-6">
                    Upload a video to get started with creating clips and generating transcripts.
                  </p>
                  <Button
                    size="lg"
                    onClick={() => setIsUploadModalOpen(true)}
                    data-testid="button-upload-welcome"
                  >
                    <Upload className="h-5 w-5 mr-2" />
                    Upload Your First Video
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onVideoUploaded={handleVideoUpload}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}
