import { apiRequest } from "@/lib/queryClient";

export interface VideoPart {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  cloudinaryPublicId: string;
  size: number;
  secure_url?: string;
}

export interface ChunkedVideo {
  id: string;
  isChunked: boolean;
  totalChunks: number;
  totalDuration: number;
  parts?: VideoPart[];
}

export class VideoChunkingService {
  private videoPartsCache = new Map<string, VideoPart[]>();

  /**
   * Gets all parts for a chunked video
   */
  async getVideoParts(videoId: string): Promise<VideoPart[]> {
    if (this.videoPartsCache.has(videoId)) {
      return this.videoPartsCache.get(videoId)!;
    }

    try {
      const response = await apiRequest("GET", `/api/videos/${videoId}/parts`);
      if (!response.ok) {
        throw new Error(`Failed to fetch video parts: ${response.statusText}`);
      }
      
      const parts = await response.json();
      this.videoPartsCache.set(videoId, parts);
      return parts;
    } catch (error) {
      console.error("Failed to get video parts:", error);
      return [];
    }
  }

  /**
   * Determines which video part should be playing at a given time
   */
  getPartForTime(parts: VideoPart[], currentTime: number): { part: VideoPart; offsetTime: number } | null {
    for (const part of parts) {
      if (currentTime >= part.startTime && currentTime < part.endTime) {
        return {
          part,
          offsetTime: currentTime - part.startTime
        };
      }
    }
    return null;
  }

  /**
   * Gets the URL for a specific video part
   */
  getPartUrl(part: VideoPart): string {
    // Generate Cloudinary URL from public ID
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dapernzun';
    return `https://res.cloudinary.com/${cloudName}/video/upload/${part.cloudinaryPublicId}.mp4`;
  }

  /**
   * Converts a time in the original video to the appropriate part and offset
   */
  convertTimeToPartOffset(parts: VideoPart[], originalTime: number): { partIndex: number; offsetTime: number } | null {
    const partInfo = this.getPartForTime(parts, originalTime);
    if (!partInfo) return null;

    return {
      partIndex: partInfo.part.index,
      offsetTime: partInfo.offsetTime
    };
  }

  /**
   * Converts a part index and offset back to original video time
   */
  convertPartOffsetToTime(parts: VideoPart[], partIndex: number, offsetTime: number): number {
    const part = parts.find(p => p.index === partIndex);
    if (!part) return 0;

    return part.startTime + offsetTime;
  }

  /**
   * Preloads the next video part for smooth playback
   */
  preloadNextPart(parts: VideoPart[], currentPartIndex: number): void {
    const nextPart = parts.find(p => p.index === currentPartIndex + 1);
    if (!nextPart) return;

    // Create a hidden video element to preload the next part
    const video = document.createElement('video');
    video.src = this.getPartUrl(nextPart);
    video.preload = 'metadata';
    video.style.display = 'none';
    document.body.appendChild(video);

    // Remove after preloading
    setTimeout(() => {
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }, 5000);
  }

  /**
   * Clears the cache for a specific video
   */
  clearCache(videoId: string): void {
    this.videoPartsCache.delete(videoId);
  }

  /**
   * Clears all cached video parts
   */
  clearAllCache(): void {
    this.videoPartsCache.clear();
  }
}