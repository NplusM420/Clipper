import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SimpleFileUpload } from "@/components/SimpleFileUpload";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoUploaded: (video: any) => void;
}

export function UploadModal({ isOpen, onClose, onVideoUploaded }: UploadModalProps) {
  const { toast } = useToast();

  // Validation and upload logic is now handled by SimpleFileUpload component

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl" data-testid="upload-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>Upload Video</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Instructions */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="font-medium mb-1">Upload Requirements</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• MP4 format only</li>
                  <li>• Maximum duration: 1 hour</li>
                  <li>• Maximum file size: 2GB</li>
                  <li>• Video will be automatically transcribed</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div data-testid="upload-area">
            <SimpleFileUpload
              onUploadComplete={onVideoUploaded}
              maxFileSize={2 * 1024 * 1024 * 1024} // 2GB
            />
          </div>

          {/* Progress is handled by SimpleFileUpload component */}

          {/* Processing Notice */}
          <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
              </div>
              <div>
                <p className="text-sm">
                  After upload, your video will be automatically processed and transcribed.
                  You'll be able to create clips once processing is complete.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
