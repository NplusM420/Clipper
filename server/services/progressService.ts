import { Server as SocketServer } from "socket.io";

export interface ProgressEvent {
  uploadId: string;
  phase: 'upload' | 'analysis' | 'chunking' | 'ffmpeg' | 'cloudinary' | 'database' | 'complete';
  message: string;
  progress: number; // 0-100
  currentStep?: number;
  totalSteps?: number;
  details?: any;
}

export class ProgressService {
  private io?: SocketServer;

  constructor(io?: SocketServer) {
    this.io = io;
  }

  /**
   * Emit progress event to connected clients
   */
  emit(event: ProgressEvent): void {
    if (!this.io) {
      console.log(`📊 Progress [${event.uploadId}]: ${event.phase} - ${event.message} (${event.progress}%)`);
      return;
    }

    // Emit to all connected clients for now
    // In production, you might want to emit only to specific user sessions
    this.io.emit('upload-progress', event);
    console.log(`📊 Socket Progress [${event.uploadId}]: ${event.phase} - ${event.message} (${event.progress}%)`);
  }

  /**
   * Create a scoped emitter for a specific upload session
   */
  createUploadSession(uploadId: string) {
    return {
      emitPhase: (phase: ProgressEvent['phase'], message: string, progress: number, details?: any) => {
        this.emit({
          uploadId,
          phase,
          message,
          progress,
          details
        });
      },

      emitStep: (
        phase: ProgressEvent['phase'], 
        message: string, 
        currentStep: number, 
        totalSteps: number, 
        details?: any
      ) => {
        const progress = Math.round((currentStep / totalSteps) * 100);
        this.emit({
          uploadId,
          phase,
          message,
          progress,
          currentStep,
          totalSteps,
          details
        });
      },

      emitChunkProgress: (
        chunkIndex: number, 
        totalChunks: number, 
        chunkProgress: number, 
        operation: string
      ) => {
        const overallProgress = Math.round(
          ((chunkIndex * 100 + chunkProgress) / totalChunks)
        );
        
        this.emit({
          uploadId,
          phase: operation.includes('ffmpeg') ? 'ffmpeg' : 'cloudinary',
          message: `${operation} chunk ${chunkIndex + 1}/${totalChunks}`,
          progress: overallProgress,
          currentStep: chunkIndex + 1,
          totalSteps: totalChunks,
          details: { chunkProgress }
        });
      }
    };
  }
}

// Singleton instance
let progressServiceInstance: ProgressService;

export function initializeProgressService(io?: SocketServer): ProgressService {
  progressServiceInstance = new ProgressService(io);
  return progressServiceInstance;
}

export function getProgressService(): ProgressService {
  if (!progressServiceInstance) {
    progressServiceInstance = new ProgressService();
  }
  return progressServiceInstance;
}