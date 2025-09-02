import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { VideoPlayer } from "@/components/VideoPlayer";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { ClipManager } from "@/components/ClipManager";
import { Timeline } from "@/components/Timeline";
import { UploadModal } from "@/components/UploadModal";
import { SettingsModal } from "@/components/SettingsModal";
import { ManualTranscriptionButton } from "@/components/ManualTranscriptionButton";
import { useAuth } from "@/hooks/useAuth";
import { useTranscriptionProgress } from "@/hooks/useSocket";
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
  Trash2,
  RefreshCw,
  SkipBack,
  SkipForward,
  Plus,
  Brain,
} from "lucide-react";
import type { Video as VideoType, Clip, Transcript, TranscriptSegment } from "@shared/schema";

export default function Dashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State management
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Monitor transcription progress for the selected video
  const { progress: transcriptionProgress } = useTranscriptionProgress(selectedVideo?.id);
  const [currentTime, setCurrentTime] = useState(0);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [clipStartTime, setClipStartTime] = useState<number | undefined>();
  const [clipEndTime, setClipEndTime] = useState<number | undefined>();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      toast({
        title: "Session expired",
        description: "Please log in again",
        variant: "destructive",
      });
      // No automatic redirect - let the router handle showing AuthPage
    }
  }, [isAuthenticated, toast]);

  // Fetch user videos
  const { data: videos = [], isLoading: videosLoading } = useQuery<VideoType[]>({
    queryKey: ["/api/videos"],
    enabled: isAuthenticated,
    refetchInterval: 5000, // Refresh every 5 seconds for processing updates
  });

  // Auto-select first video when videos are loaded and no video is selected
  useEffect(() => {
    console.log('🔍 Auto-selection check:', { 
      videosCount: videos.length, 
      selectedVideoId: selectedVideo?.id,
      firstVideoId: videos[0]?.id 
    });
    
    if (videos.length > 0) {
      // Clear invalid selection (video not in current user's videos)
      if (selectedVideo && !videos.find(v => v.id === selectedVideo.id)) {
        console.log('🔄 Clearing invalid video selection');
        setSelectedVideo(null);
        return;
      }
      
      // Auto-select first video if none selected
      if (!selectedVideo) {
        console.log('✅ Auto-selecting first video:', videos[0].id);
        setSelectedVideo(videos[0]);
      }
    } else if (selectedVideo) {
      // Clear selection if no videos available
      console.log('🧹 Clearing video selection - no videos available');
      setSelectedVideo(null);
    }
  }, [videos, selectedVideo]);

  // Sync video play/pause state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [selectedVideo]);


  // Handle transcription completion via WebSocket
  useEffect(() => {
    console.log('🔍 Transcription progress check:', {
      phase: transcriptionProgress?.phase,
      stage: transcriptionProgress?.stage,
      progress: transcriptionProgress?.progress,
      videoId: transcriptionProgress?.uploadId,
      selectedVideoId: selectedVideo?.id
    });
    
    if (transcriptionProgress?.phase === 'complete' && selectedVideo?.id) {
      console.log('🎉 Transcription completed via WebSocket, refreshing data...');
      
      // Invalidate and refetch video data to update transcriptionStatus
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      
      // Invalidate and refetch transcript data - force immediate fetch
      queryClient.invalidateQueries({ queryKey: ["/api/videos", selectedVideo.id, "transcript"] });
      queryClient.refetchQueries({ queryKey: ["/api/videos", selectedVideo.id, "transcript"] });
      
      // Show success toast
      toast({
        title: "Transcription Complete",
        description: `Transcription finished for ${selectedVideo.filename}`,
      });
    }
  }, [transcriptionProgress, selectedVideo, queryClient, toast]);

  // Fetch transcript for selected video
  const { data: transcript } = useQuery<Transcript>({
    queryKey: ["/api/videos", selectedVideo?.id, "transcript"],
    enabled: !!selectedVideo?.id,
    refetchInterval: (data) => {
      // Always poll if no transcript exists yet
      if (!data) {
        console.log(`🔄 Polling for transcript: no data yet`);
        return 3000;
      }
      
      // Find the current video status from the latest videos data
      const currentVideo = videos.find(v => v.id === selectedVideo?.id);
      const isStillProcessing = currentVideo?.transcriptionStatus === "processing";
      
      if (isStillProcessing) {
        console.log(`🔄 Polling for transcript: still processing`);
        return 3000;
      }
      
      // Stop polling if transcript exists and transcription is complete
      console.log(`⏹️ Stopping transcript polling: transcription complete`);
      return false;
    },
  });

  // Fetch clips for selected video
  const { data: clips = [] } = useQuery<Clip[]>({
    queryKey: ["/api/videos", selectedVideo?.id, "clips"],
    enabled: !!selectedVideo?.id,
    refetchInterval: 2000, // Refresh for processing updates
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/logout", {});
      return response;
    },
    onSuccess: () => {
      // Clear all cached data and force re-render
      queryClient.clear();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });
      // The router will automatically show AuthPage when isAuthenticated becomes false
    },
    onError: (error) => {
      toast({
        title: "Logout failed",
        description: "There was an error logging out",
        variant: "destructive",
      });
    },
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

  // Delete video mutation
  const deleteVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      await apiRequest("DELETE", `/api/videos/${videoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      // If we deleted the selected video, clear selection
      if (selectedVideo && deleteVideoMutation.variables === selectedVideo.id) {
        setSelectedVideo(null);
      }
      toast({
        title: "Video Deleted",
        description: "The video and all its clips have been removed.",
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
        description: "Failed to delete video. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Sync video data mutation  
  const syncVideoMutation = useMutation({
    mutationFn: async (videoId: string) => {
      const response = await apiRequest("POST", `/api/videos/${videoId}/sync`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos", data.video.id, "parts"] });
      
      const fixes = data.syncResults.fixed;
      if (fixes.length > 0) {
        toast({
          title: "Video Data Synced",
          description: `Fixed ${fixes.length} data inconsistency issues.`,
        });
      } else {
        toast({
          title: "Video Data OK",
          description: "No data issues found.",
        });
      }
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
        description: "Failed to sync video data. Please try again.",
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
    if (clip && clip.status === 'ready') {
      // Use the proper download endpoint
      console.log(`📥 Downloading clip: ${clip.name} (${clipId})`);
      window.open(`/api/clips/${clipId}/download`, '_blank');
    } else {
      console.warn(`⚠️ Clip not ready for download: ${clip?.status}`);
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
    if (video.status === "error" || video.transcriptionStatus === "error") {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    } else if (video.status === "ready") {
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    } else {
      return <Clock className="h-4 w-4 text-accent" />;
    }
  };

  const getVideoStatusText = (video: VideoType) => {
    if (video.status === "error" || video.transcriptionStatus === "error") {
      return "Error";
    } else if (video.status === "ready") {
      // Video is ready - show transcription status as secondary info
      if (video.transcriptionStatus === "completed") {
        return "Ready";
      } else if (video.transcriptionStatus === "processing") {
        return "Ready (Transcribing)";
      } else {
        return "Ready";
      }
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
                onClick={() => window.location.href = '/ai-discovery'}
                data-testid="nav-ai-discovery"
              >
                <Brain className="h-4 w-4 mr-2" />
                AI Assistant
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
            {/* Current Project Info - Moved from sidebar */}
            {selectedVideo && (
              <div className="flex items-center space-x-3 px-3 py-1 bg-muted/50 rounded-lg border">
                <div className="w-8 h-8 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
                  <FileVideo className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex items-center space-x-2 min-w-0">
                  <h3 className="font-medium truncate max-w-40" data-testid="header-project-name">
                    {selectedVideo.filename}
                  </h3>
                  <span className="text-sm text-muted-foreground">•</span>
                  <span className="text-sm text-muted-foreground font-mono" data-testid="header-project-duration">
                    {formatTime(selectedVideo.duration)}
                  </span>
                  <span className="text-sm text-muted-foreground">•</span>
                  <div className="flex items-center space-x-1">
                    {getVideoStatusIcon(selectedVideo)}
                    <span className="text-sm">{getVideoStatusText(selectedVideo)}</span>
                  </div>
                </div>
              </div>
            )}
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
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
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
        {/* Left Sidebar - Simplified for Clip Management */}
        <aside className="w-80 bg-card border-r border-border flex flex-col">
          {/* Expanded Clip Management - Now uses full sidebar */}
          {selectedVideo && (
            <div className="flex-1 overflow-hidden">
              <div className="p-6 h-full">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <FileVideo className="h-5 w-5 text-primary" />
                  Clip Management
                </h3>
                <div className="h-[calc(100%-3rem)] overflow-auto custom-scrollbar">
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
            </div>
          )}

          {!selectedVideo && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-muted-foreground">
                <FileVideo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">Select a video to manage clips</p>
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 flex overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            {selectedVideo ? (
              <>
                {/* Video Player Panel - Intelligent sizing */}
                <div className="flex flex-col p-6 pb-3">
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
                    ref={videoRef}
                  />
                </div>

                {/* Video Controls Panel - Moved from sidebar */}
                <div className="border-t border-border p-6 pt-4 max-h-80 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium text-lg">Video Controls</h4>
                    <div className="text-xs text-muted-foreground font-mono">
                      {formatTime(currentTime)} / {formatTime(selectedVideo.duration)}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {/* Enhanced Timeline with Clip Visualization */}
                    <Timeline
                      duration={selectedVideo.duration}
                      currentTime={currentTime}
                      clips={clips.map(clip => ({
                        id: clip.id,
                        name: clip.name,
                        startTime: clip.startTime,
                        endTime: clip.endTime,
                        status: clip.status as "ready" | "processing" | "error" | "pending",
                        duration: clip.duration
                      }))}
                      onSeek={(time) => {
                        setCurrentTime(time);
                        handleSeek(time);
                      }}
                      onClipSelect={(clipId) => {
                        const clip = clips.find(c => c.id === clipId);
                        if (clip) {
                          setCurrentTime(clip.startTime);
                          handleSeek(clip.startTime);
                        }
                      }}
                    />

                    {/* Playback Controls */}
                    <div className="flex items-center justify-center space-x-6">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newTime = Math.max(0, currentTime - 10);
                          setCurrentTime(newTime);
                          handleSeek(newTime);
                        }}
                        className="flex items-center space-x-1"
                      >
                        <SkipBack className="h-4 w-4" />
                        <span className="text-sm">10s</span>
                      </Button>
                      
                      <Button
                        size="lg"
                        onClick={() => {
                          if (!videoRef.current) {
                            console.error('No video element found!');
                            return;
                          }
                          
                          if (isPlaying) {
                            videoRef.current.pause();
                            setIsPlaying(false);
                          } else {
                            videoRef.current.play().catch((error) => {
                              console.error('Video play failed:', error);
                            });
                            setIsPlaying(true);
                          }
                        }}
                        className="bg-primary hover:bg-primary/90 px-6"
                      >
                        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newTime = Math.min(selectedVideo.duration, currentTime + 10);
                          setCurrentTime(newTime);
                          handleSeek(newTime);
                        }}
                        className="flex items-center space-x-1"
                      >
                        <SkipForward className="h-4 w-4" />
                        <span className="text-sm">10s</span>
                      </Button>
                    </div>

                    {/* Clip Management and Speed Controls - Responsive layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Clip Markers */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Clip Markers</span>
                          {(clipStartTime !== undefined || clipEndTime !== undefined) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setClipStartTime(undefined);
                                setClipEndTime(undefined);
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkStart}
                            className={`flex items-center justify-center space-x-1 ${
                              clipStartTime !== undefined ? 'border-green-500 text-green-600' : ''
                            }`}
                          >
                            <div className="w-2 h-2 bg-green-500 rounded-full" />
                            <span className="text-xs">Start</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleMarkEnd}
                            className={`flex items-center justify-center space-x-1 ${
                              clipEndTime !== undefined ? 'border-red-500 text-red-600' : ''
                            }`}
                          >
                            <div className="w-2 h-2 bg-red-500 rounded-full" />
                            <span className="text-xs">End</span>
                          </Button>
                        </div>
                      </div>

                      {/* Speed Control */}
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Playback Speed</span>
                        <div className="grid grid-cols-5 gap-1">
                          {[0.5, 1, 1.25, 1.5, 2].map((speed) => (
                            <Button
                              key={speed}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (!videoRef.current) {
                                  console.error('No video element for speed control!');
                                  return;
                                }
                                videoRef.current.playbackRate = speed;
                                setPlaybackSpeed(speed);
                              }}
                              className={`text-xs px-2 py-1 h-8 ${
                                playbackSpeed === speed ? 'bg-primary text-primary-foreground' : ''
                              }`}
                            >
                              {speed}x
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Selected Clip Info */}
                    {(clipStartTime !== undefined || clipEndTime !== undefined) && (
                      <div className="bg-muted rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium">Selected Clip</div>
                          {clipStartTime !== undefined && clipEndTime !== undefined && (
                            <Button
                              size="sm"
                              onClick={() => {
                                // Auto-generate clip name with timestamp
                                const clipName = `Clip ${formatTime(clipStartTime)}-${formatTime(clipEndTime)}`;
                                handleCreateClip({
                                  name: clipName,
                                  startTime: clipStartTime,
                                  endTime: clipEndTime,
                                  quality: "1080p"
                                });
                              }}
                              className="flex items-center space-x-1"
                            >
                              <Plus className="h-3 w-3" />
                              <span className="text-xs">Save Clip</span>
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                          {clipStartTime !== undefined && (
                            <div>
                              <div className="text-xs text-muted-foreground">Start</div>
                              <div className="font-mono">{formatTime(clipStartTime)}</div>
                            </div>
                          )}
                          {clipEndTime !== undefined && (
                            <div>
                              <div className="text-xs text-muted-foreground">End</div>
                              <div className="font-mono">{formatTime(clipEndTime)}</div>
                            </div>
                          )}
                          {clipStartTime !== undefined && clipEndTime !== undefined && (
                            <div>
                              <div className="text-xs text-muted-foreground">Duration</div>
                              <div className="font-mono font-medium text-foreground">{formatTime(clipEndTime - clipStartTime)}</div>
                            </div>
                          )}
                        </div>
                        {clipStartTime !== undefined && clipEndTime !== undefined && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                              💡 Tip: Click "Save Clip" above or use the Clip Manager in the left sidebar for more options
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
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
          </div>

          {/* Right Sidebar for Videos and Tools */}
          <div className="w-80 border-l border-border bg-card flex flex-col min-h-0">
            {/* Videos List */}
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold">Videos</h3>
                <Button
                  size="sm"
                  onClick={() => setIsUploadModalOpen(true)}
                  data-testid="button-upload-video"
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
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
                <div className="space-y-4 max-h-64 overflow-y-auto">
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
                        <div className="flex flex-col items-end space-y-1">
                          <div className="flex items-center space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent video selection
                                syncVideoMutation.mutate(video.id);
                              }}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-blue-500"
                              disabled={syncVideoMutation.isPending}
                              title="Sync video data - fix playback issues"
                            >
                              <RefreshCw className={`h-3 w-3 ${syncVideoMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent video selection
                                if (confirm(`Are you sure you want to delete "${video.filename}"? This will also delete all clips associated with this video.`)) {
                                  deleteVideoMutation.mutate(video.id);
                                }
                              }}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              disabled={deleteVideoMutation.isPending}
                              title="Delete video"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
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

            {/* Video Tools and Transcript */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
              {selectedVideo && (
                <>
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Video Tools</h3>
                    
                    {/* Manual Transcription Section */}
                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Transcription</h4>
                        <div className="flex items-center space-x-1 text-sm">
                          {selectedVideo.transcriptionStatus === "completed" && (
                            <>
                              <CheckCircle className="h-4 w-4 text-green-400" />
                              <span className="text-green-400">Complete</span>
                            </>
                          )}
                          {selectedVideo.transcriptionStatus === "processing" && (
                            <>
                              <Clock className="h-4 w-4 text-accent animate-spin" />
                              <span className="text-accent">Processing</span>
                            </>
                          )}
                          {selectedVideo.transcriptionStatus === "error" && (
                            <>
                              <AlertCircle className="h-4 w-4 text-destructive" />
                              <span className="text-destructive">Error</span>
                            </>
                          )}
                          {!selectedVideo.transcriptionStatus && (
                            <>
                              <AlertCircle className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">None</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <ManualTranscriptionButton 
                        videoId={selectedVideo.id}
                        transcriptionStatus={selectedVideo.transcriptionStatus}
                      />
                    </div>

                    {/* Video Information */}
                    <div className="border-t border-border pt-6">
                      <h4 className="font-medium mb-3">Video Information</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <span>{formatTime(selectedVideo.duration)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span>{getVideoStatusText(selectedVideo)}</span>
                        </div>
                        {selectedVideo.size && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Size:</span>
                            <span>{(selectedVideo.size / 1024 / 1024).toFixed(1)} MB</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Transcript Panel */}
                  <div className="border-t border-border pt-6">
                    <div className="mb-3">
                      <h4 className="font-medium text-lg">Transcript</h4>
                      <p className="text-sm text-muted-foreground">Click on any segment to jump to that time</p>
                    </div>
                    
                    <div className="flex-1 min-h-96 max-h-[calc(100vh-400px)]">
                      <TranscriptPanel
                        segments={(transcript?.segments as TranscriptSegment[]) || []}
                        currentTime={Math.round(currentTime * 5) / 5}
                        onSegmentClick={handleSegmentClick}
                        onTranscriptUpdate={handleTranscriptUpdate}
                        isEditable={true}
                        onCreateClipFromSegment={(startTime, endTime, text) => {
                          // Auto-generate clip name from transcript text
                          const clipName = `"${text.substring(0, 50)}${text.length > 50 ? '...' : '"'}`;
                          handleCreateClip({
                            name: clipName,
                            startTime,
                            endTime,
                            quality: "1080p"
                          });
                        }}
                      />
                    </div>
                    
                    {/* Additional Tools Section - Utilizing bottom space */}
                    <div className="border-t border-border pt-4 mt-4">
                      <div className="space-y-3">
                        <h5 className="font-medium text-sm text-muted-foreground">Quick Stats</h5>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-muted/50 rounded-lg p-2">
                            <div className="text-lg font-bold text-primary">{clips.length}</div>
                            <div className="text-xs text-muted-foreground">Clips</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2">
                            <div className="text-lg font-bold text-emerald-600">
                              {clips.filter(c => c.status === 'ready').length}
                            </div>
                            <div className="text-xs text-muted-foreground">Ready</div>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-2">
                            <div className="text-lg font-bold text-accent">
                              {Array.isArray(transcript?.segments) ? transcript.segments.length : 0}
                            </div>
                            <div className="text-xs text-muted-foreground">Segments</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
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
