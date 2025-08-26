import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SimpleFileUploadProps {
  onUploadComplete: (video: any) => void;
  maxFileSize?: number;
}

export function SimpleFileUpload({ 
  onUploadComplete, 
  maxFileSize = 2 * 1024 * 1024 * 1024 // 2GB default 
}: SimpleFileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

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
      // Get upload URL
      const response = await apiRequest("POST", "/api/videos/upload-url");
      const { uploadURL } = await response.json();

      // Upload file with progress tracking
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(percentComplete));
        }
      });

      xhr.onload = async () => {
        if (xhr.status === 200) {
          try {
            // Get video duration
            const duration = await getVideoDuration(selectedFile);
            
            // Validate duration (max 1 hour)
            if (duration > 3600) {
              toast({
                title: "Upload Error",
                description: "Video duration exceeds 1 hour limit",
                variant: "destructive",
              });
              setIsUploading(false);
              return;
            }

            // Create video record
            const videoData = {
              filename: selectedFile.name,
              originalPath: uploadURL,
              duration,
              size: selectedFile.size,
              metadata: {
                type: selectedFile.type,
                lastModified: selectedFile.lastModified,
              },
            };

            const videoResponse = await apiRequest("POST", "/api/videos", videoData);
            const video = await videoResponse.json();

            toast({
              title: "Upload Successful",
              description: "Video uploaded and processing started",
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
        toast({
          title: "Upload Error",
          description: "Failed to upload video. Please try again.",
          variant: "destructive",
        });
        setIsUploading(false);
      };

      xhr.open('PUT', uploadURL);
      xhr.setRequestHeader('Content-Type', selectedFile.type);
      xhr.send(selectedFile);

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
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
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