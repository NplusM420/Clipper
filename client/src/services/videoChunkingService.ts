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
      
      const raw = await response.json();
      // Normalize and sort parts; ensure contiguous index
      const parts: VideoPart[] = (raw as any[])
        .map((p, i) => ({
          index: typeof p.index === 'number' ? p.index : (typeof p.partIndex === 'number' ? p.partIndex : i),
          startTime: p.startTime,
          endTime: p.endTime,
          duration: p.duration,
          cloudinaryPublicId: p.cloudinaryPublicId,
          size: p.size,
          secure_url: p.secure_url
        }))
        .sort((a, b) => a.startTime - b.startTime)
        .map((p, i) => ({ ...p, index: i }));

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
  getPartForTime(parts: VideoPart[], currentTime: number): { partIndex: number; offsetTime: number } | null {
    let left = 0;
    let right = parts.length - 1;
    while (left <= right) {
      const mid = (left + right) >> 1;
      const part = parts[mid];
      if (currentTime < part.startTime) {
        right = mid - 1;
      } else if (currentTime >= part.endTime) {
        left = mid + 1;
      } else {
        return { partIndex: mid, offsetTime: currentTime - part.startTime };
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
    // Use unsigned, cache-friendly delivery with no credentials; ensure extension is omitted
    return `https://res.cloudinary.com/${cloudName}/video/upload/f_auto,q_auto/${part.cloudinaryPublicId}`;
  }

  /**
   * Converts a time in the original video to the appropriate part and offset
   */
  convertTimeToPartOffset(parts: VideoPart[], originalTime: number): { partIndex: number; offsetTime: number } | null {
    const info = this.getPartForTime(parts, originalTime);
    if (!info) return null;
    return info;
  }

  /**
   * Converts a part index and offset back to original video time
   */
  convertPartOffsetToTime(parts: VideoPart[], partIndex: number, offsetTime: number): number {
    const part = parts[partIndex];
    if (!part) return 0;
    return part.startTime + offsetTime;
  }

  /**
   * Preloads the next video part for smooth playback
   */
  preloadNextPart(parts: VideoPart[], currentPartIndex: number): void {
    const nextPart = parts[currentPartIndex + 1];
    if (!nextPart) return;

    // Create a hidden video element to preload the next part
    const video = document.createElement('video');
    video.src = this.getPartUrl(nextPart);
    video.preload = 'auto';
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