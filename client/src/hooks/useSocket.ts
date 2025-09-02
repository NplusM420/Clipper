import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ProgressEvent } from "@/components/EnhancedProgressTracker";

interface UseSocketReturn {
  socket: Socket | null;
  connected: boolean;
  latestProgress: ProgressEvent | null;
}

export function useSocket(): UseSocketReturn {
  const [connected, setConnected] = useState(false);
  const [latestProgress, setLatestProgress] = useState<ProgressEvent | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // React 18 StrictMode protection - prevent double initialization
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Create socket connection with explicit URL handling
    const getSocketUrl = () => {
      // In development, ensure we're connecting to the right port
      if (import.meta.env.DEV) {
        return 'http://localhost:5000';
      }
      // In production, use the current origin
      return window.location.origin;
    };

    const socketUrl = getSocketUrl();
    console.log('🔌 Connecting WebSocket to:', socketUrl);
    
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      autoConnect: true,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('🔴 Socket connection error:', error);
      setConnected(false);
    });

    // Progress event handlers
    socket.on('upload-progress', (progress: ProgressEvent) => {
      console.log('📊 Upload progress update:', progress);
      setLatestProgress(progress);
    });

    socket.on('transcription_progress', (progress: any) => {
      console.log('🎤 Transcription progress update:', progress);
      // Convert transcription progress to ProgressEvent format for consistency
      const progressEvent: ProgressEvent = {
        phase: (progress.stage === 'transcription_complete' || 
                (progress.stage === 'finalizing' && progress.progress >= 100)) ? 'complete' : 'processing',
        progress: progress.progress,
        message: progress.message || `${progress.stage}...`,
        uploadId: progress.videoId,
        stage: progress.stage,
        estimatedTimeRemaining: progress.estimatedTime,
      };
      setLatestProgress(progressEvent);
    });

    // React 18 StrictMode compatible cleanup
    return () => {
      // Only disconnect if the socket is actually connected
      if (socket && socket.connected) {
        console.log('🧹 Cleaning up socket connection');
        socket.disconnect();
      }
      initializedRef.current = false;
    };
  }, []);

  return {
    socket: socketRef.current,
    connected,
    latestProgress
  };
}

export function useUploadProgress(uploadId?: string): {
  progress: ProgressEvent | null;
  clearProgress: () => void;
} {
  const { latestProgress } = useSocket();
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    if (latestProgress && (!uploadId || latestProgress.uploadId === uploadId)) {
      setCurrentProgress(latestProgress);
    }
  }, [latestProgress, uploadId]);

  const clearProgress = () => {
    setCurrentProgress(null);
  };

  return {
    progress: currentProgress,
    clearProgress
  };
}

export function useTranscriptionProgress(videoId?: string): {
  progress: ProgressEvent | null;
  clearProgress: () => void;
} {
  const { latestProgress } = useSocket();
  const [currentProgress, setCurrentProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    if (latestProgress && (!videoId || latestProgress.uploadId === videoId)) {
      // Only update for transcription-related progress
      if (latestProgress.stage && (
        latestProgress.stage.includes('transcription') || 
        latestProgress.stage === 'finalizing' ||
        latestProgress.stage === 'language_detection' ||
        latestProgress.stage === 'whisper_transcription' ||
        latestProgress.stage === 'cache_hit'
      )) {
        setCurrentProgress(latestProgress);
      }
    }
  }, [latestProgress, videoId]);

  const clearProgress = () => {
    setCurrentProgress(null);
  };

  return {
    progress: currentProgress,
    clearProgress
  };
}