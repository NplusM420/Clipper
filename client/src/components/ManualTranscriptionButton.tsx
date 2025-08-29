import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, RefreshCw, Play } from "lucide-react";

interface ManualTranscriptionButtonProps {
  videoId: string;
  transcriptionStatus?: string | null;
}

export function ManualTranscriptionButton({ 
  videoId, 
  transcriptionStatus 
}: ManualTranscriptionButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const transcriptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/videos/${videoId}/transcribe`, {});
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Transcription Started",
        description: data.message || "Transcription process has begun. This may take a few minutes.",
      });
      // Refresh the video data to update transcription status
      queryClient.invalidateQueries({ queryKey: ["/api/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/videos", videoId, "transcript"] });
    },
    onError: (error: any) => {
      toast({
        title: "Transcription Failed",
        description: error.message || "Failed to start transcription process. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleTranscribe = () => {
    transcriptionMutation.mutate();
  };

  const getButtonConfig = () => {
    switch (transcriptionStatus) {
      case "processing":
        return {
          text: "Processing...",
          icon: RefreshCw,
          variant: "secondary" as const,
          disabled: true,
        };
      case "completed":
        return {
          text: "Retranscribe",
          icon: RefreshCw,
          variant: "outline" as const,
          disabled: false,
        };
      case "error":
        return {
          text: "Retry Transcription",
          icon: RefreshCw,
          variant: "default" as const,
          disabled: false,
        };
      default:
        return {
          text: "Generate Transcript",
          icon: Play,
          variant: "default" as const,
          disabled: false,
        };
    }
  };

  const { text, icon: Icon, variant, disabled } = getButtonConfig();

  return (
    <div className="space-y-3">
      <Button
        onClick={handleTranscribe}
        disabled={disabled || transcriptionMutation.isPending}
        variant={variant}
        size="sm"
        className="w-full"
        data-testid="manual-transcription-button"
      >
        <Icon 
          className={`h-4 w-4 mr-2 ${transcriptionStatus === "processing" ? "animate-spin" : ""}`} 
        />
        {transcriptionMutation.isPending ? "Starting..." : text}
      </Button>
      
      {transcriptionStatus === "error" && (
        <p className="text-sm text-destructive">
          Transcription failed. Check your OpenAI API key in Settings.
        </p>
      )}
      
      {!transcriptionStatus && (
        <p className="text-sm text-muted-foreground">
          Generate an AI transcript using OpenAI Whisper. Configure your API key in Settings.
        </p>
      )}
      
      {transcriptionStatus === "completed" && (
        <p className="text-sm text-muted-foreground">
          Transcript is ready. Click Retranscribe to generate a new one.
        </p>
      )}
    </div>
  );
}