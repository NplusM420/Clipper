import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LIMITS } from "@shared/constants";
import { EnhancedProgressTracker } from "./EnhancedProgressTracker";
import { useUploadProgress } from "@/hooks/useSocket";

interface SimpleFileUploadProps {
  onUploadComplete: (video: any) => void;
  maxFileSize?: number;
}

export function SimpleFileUpload({ 
  onUploadComplete, 
  maxFileSize = LIMITS.MAX_VIDEO_SIZE 
}: SimpleFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentUploadId, setCurrentUploadId] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Hook for real-time progress updates
  const { progress: socketProgress, clearProgress } = useUploadProgress(currentUploadId || undefined);

  // Handle upload completion based on socket progress
  useEffect(() => {
    if (socketProgress?.phase === 'complete' && isUploading) {
      // Upload completed via socket, we can finish the process
      setIsUploading(false);
      setCurrentUploadId(null);
      clearProgress();
    }
  }, [socketProgress, isUploading, clearProgress]);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('video/mp4')) {
      return "Only MP4 files are supported";
    }
    if (file.size > maxFileSize) {
      return "File size exceeds 2GB limit";
    }
    return null;
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      
      video.onerror = () => {
        window.URL.revokeObjectURL(video.src);
        reject(new Error('Failed to load video metadata'));
      };
      
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const error = validateFile(file);
    if (error) {
      toast({
        title: "Invalid File",
        description: error,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      console.log("🚀 Starting server-side upload...");
      
      // Create FormData for server upload
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      console.log("📦 Uploading file:", {
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        fileType: selectedFile.type
      });

      // Upload file with progress tracking to our server
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      xhr.onload = async () => {
        console.log("📡 Upload completed with status:", xhr.status);
        console.log("📄 Response text:", xhr.responseText);
        
        if (xhr.status === 200) {
          try {
            const uploadResult = JSON.parse(xhr.responseText);
            console.log("✅ Upload result:", uploadResult);
            
            // Store upload ID for progress tracking
            if (uploadResult.uploadId) {
              setCurrentUploadId(uploadResult.uploadId);
            }
            
            // Get video duration
            const duration = await getVideoDuration(selectedFile);
            
            // Validate duration (max 1 hour)
            if (duration > LIMITS.MAX_VIDEO_DURATION) {
              toast({
                title: "Upload Error",
                description: "Video duration exceeds 1 hour limit",
                variant: "destructive",
              });
              setIsUploading(false);
              return;
            }

            // Create video record with server upload result
            const videoData = {
              filename: selectedFile.name,
              originalPath: uploadResult.secure_url,
              duration: uploadResult.duration || duration, // Use Cloudinary duration if available
              size: uploadResult.bytes || selectedFile.size,
              isChunked: uploadResult.isChunked || false,
              totalChunks: uploadResult.totalChunks || 1,
              metadata: {
                type: selectedFile.type,
                lastModified: selectedFile.lastModified,
                cloudinary_public_id: uploadResult.public_id,
                cloudinary_resource_type: uploadResult.resource_type,
                ...(uploadResult.isChunked && { isChunked: true, totalChunks: uploadResult.totalChunks })
              },
            };

            // Include parts data for chunked videos
            const requestBody = uploadResult.isChunked ? 
              { ...videoData, parts: uploadResult.parts } : 
              videoData;

            const videoResponse = await apiRequest("POST", "/api/videos", requestBody);
            const video = await videoResponse.json();

            toast({
              title: "Upload Successful",
              description: uploadResult.isChunked 
                ? `Video split into ${uploadResult.totalChunks} parts and uploaded successfully`
                : "Video uploaded and processing started",
            });

            onUploadComplete(video);
            setSelectedFile(null);
            setUploadProgress(0);
          } catch (error) {
            console.error("Failed to create video record:", error);
            toast({
              title: "Upload Error",
              description: "Failed to process uploaded video. Please try again.",
              variant: "destructive",
            });
          }
        } else {
          throw new Error('Upload failed');
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        console.error("❌ XHR Error during upload");
        toast({
          title: "Upload Error",
          description: "Failed to upload video. Please try again.",
          variant: "destructive",
        });
        setIsUploading(false);
      };

      console.log("🎯 Starting upload to server: /api/videos/upload");
      xhr.open('POST', '/api/videos/upload');
      xhr.send(formData);

    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Error",
        description: "Failed to start upload. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-4">
      {/* File Selection */}
      {!selectedFile ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium">Upload Video</p>
              <p className="text-sm text-muted-foreground">MP4 files up to 2GB, max 1 hour</p>
            </div>
            <input
              type="file"
              accept="video/mp4"
              onChange={handleFileSelect}
              className="hidden"
              id="video-upload"
              data-testid="input-video-file"
            />
            <Button asChild>
              <label htmlFor="video-upload" className="cursor-pointer" data-testid="button-select-file">
                Select Video File
              </label>
            </Button>
          </div>
        </div>
      ) : (
        /* Selected File Display */
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
            {!isUploading && (
              <Button variant="ghost" size="sm" onClick={clearFile} data-testid="button-clear-file">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-4 mb-3">
              {/* Enhanced Progress Tracker for detailed backend progress */}
              {socketProgress ? (
                <EnhancedProgressTracker currentProgress={socketProgress} />
              ) : (
                /* Simple progress bar for initial file upload */
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Uploading file to server...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>
          )}

          {/* Upload Button */}
          {!isUploading && (
            <Button onClick={handleUpload} className="w-full" data-testid="button-upload">
              <Upload className="h-4 w-4 mr-2" />
              Upload Video
            </Button>
          )}
        </div>
      )}
    </div>
  );
}