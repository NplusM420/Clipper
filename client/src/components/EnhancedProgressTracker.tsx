import React from "react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Upload, 
  Search, 
  Scissors, 
  Zap, 
  Cloud, 
  Database, 
  CheckCircle2,
  Clock,
  Loader2
} from "lucide-react";

export interface ProgressEvent {
  uploadId: string;
  phase: 'upload' | 'analysis' | 'chunking' | 'ffmpeg' | 'cloudinary' | 'database' | 'complete' | 'processing';
  message: string;
  progress: number;
  currentStep?: number;
  totalSteps?: number;
  details?: any;
  stage?: string;
  estimatedTimeRemaining?: number;
}

interface EnhancedProgressTrackerProps {
  currentProgress?: ProgressEvent;
  className?: string;
}

const phaseConfig = {
  upload: {
    icon: Upload,
    title: "File Upload",
    color: "bg-blue-500",
    description: "Uploading your video file to the server"
  },
  analysis: {
    icon: Search,
    title: "Video Analysis",
    color: "bg-purple-500", 
    description: "Analyzing video properties and determining optimal processing strategy"
  },
  chunking: {
    icon: Scissors,
    title: "Video Chunking",
    color: "bg-orange-500",
    description: "Splitting large video into smaller chunks for optimal upload"
  },
  ffmpeg: {
    icon: Zap,
    title: "Video Processing",
    color: "bg-yellow-500",
    description: "Processing video chunks with FFmpeg for optimal quality"
  },
  cloudinary: {
    icon: Cloud,
    title: "Cloud Upload",
    color: "bg-green-500",
    description: "Uploading processed chunks to Cloudinary storage"
  },
  database: {
    icon: Database,
    title: "Database Updates",
    color: "bg-indigo-500",
    description: "Creating database records and organizing video metadata"
  },
  complete: {
    icon: CheckCircle2,
    title: "Complete",
    color: "bg-emerald-500",
    description: "Video upload and processing completed successfully!"
  },
  processing: {
    icon: Loader2,
    title: "Processing",
    color: "bg-blue-500",
    description: "Processing video transcription and analysis"
  }
} as const;

const phaseOrder = ['upload', 'analysis', 'chunking', 'ffmpeg', 'cloudinary', 'database', 'processing', 'complete'] as const;

export function EnhancedProgressTracker({ 
  currentProgress, 
  className = "" 
}: EnhancedProgressTrackerProps) {
  if (!currentProgress) {
    return null;
  }

  const currentPhaseIndex = phaseOrder.indexOf(currentProgress.phase);
  
  return (
    <Card className={`w-full max-w-2xl mx-auto ${className}`}>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Video Upload Progress</h3>
            <Badge variant="outline" className="text-sm">
              Upload ID: {currentProgress.uploadId.slice(-8)}
            </Badge>
          </div>

          {/* Phase Timeline */}
          <div className="flex items-center justify-between mb-6">
            {phaseOrder.map((phase, index) => {
              const config = phaseConfig[phase];
              const Icon = config.icon;
              const isActive = phase === currentProgress.phase;
              const isCompleted = index < currentPhaseIndex;
              const isPending = index > currentPhaseIndex;

              return (
                <div key={phase} className="flex flex-col items-center relative">
                  {/* Connection Line */}
                  {index < phaseOrder.length - 1 && (
                    <div 
                      className={`absolute top-5 left-8 h-0.5 w-16 transition-colors duration-300 ${
                        isCompleted || isActive ? 'bg-primary' : 'bg-muted'
                      }`}
                    />
                  )}
                  
                  {/* Phase Icon */}
                  <div 
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all duration-300
                      ${isActive ? `${config.color} text-white shadow-lg scale-110` : ''}
                      ${isCompleted ? 'bg-primary text-white' : ''}
                      ${isPending ? 'bg-muted text-muted-foreground' : ''}
                    `}
                  >
                    {isActive && phase !== 'complete' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  
                  {/* Phase Label */}
                  <span className={`
                    text-xs text-center font-medium transition-colors duration-300
                    ${isActive ? 'text-primary' : ''}
                    ${isCompleted ? 'text-primary' : ''}
                    ${isPending ? 'text-muted-foreground' : ''}
                  `}>
                    {config.title}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Current Phase Details */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${phaseConfig[currentProgress.phase].color} text-white
              `}>
                {currentProgress.phase === 'complete' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">
                    {phaseConfig[currentProgress.phase].title}
                  </h4>
                  <span className="text-sm font-mono tabular-nums">
                    {currentProgress.progress}%
                  </span>
                </div>
                
                <p className="text-sm text-muted-foreground mb-3">
                  {phaseConfig[currentProgress.phase].description}
                </p>
                
                {/* Progress Bar */}
                <Progress 
                  value={currentProgress.progress} 
                  className="h-2 mb-2"
                />
                
                {/* Current Message */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{currentProgress.message}</span>
                  
                  {currentProgress.currentStep && currentProgress.totalSteps && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {currentProgress.currentStep}/{currentProgress.totalSteps}
                    </Badge>
                  )}
                </div>

                {/* Chunk Progress Details */}
                {currentProgress.details?.chunkProgress && (
                  <div className="mt-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span>Chunk Progress:</span>
                      <span>{currentProgress.details.chunkProgress}%</span>
                    </div>
                    <Progress 
                      value={currentProgress.details.chunkProgress} 
                      className="h-1 mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Overall Progress Summary */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Overall Progress</span>
            <span>
              Phase {currentPhaseIndex + 1} of {phaseOrder.length}
            </span>
          </div>
          
          <Progress 
            value={(currentPhaseIndex / (phaseOrder.length - 1)) * 100} 
            className="h-1"
          />
        </div>
      </CardContent>
    </Card>
  );
}