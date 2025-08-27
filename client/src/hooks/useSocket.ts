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

  useEffect(() => {
    // Create socket connection
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
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

    // Progress event handler
    socket.on('upload-progress', (progress: ProgressEvent) => {
      console.log('📊 Progress update:', progress);
      setLatestProgress(progress);
    });

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up socket connection');
      socket.disconnect();
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