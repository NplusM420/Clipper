import { v2 as cloudinary } from "cloudinary";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { cloudinaryService } from "./services/cloudinaryService";

// Global Cloudinary configuration (fallback)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Cloudinary-based object storage service
export class ObjectStorageService {
  private userCloudinarySettings?: { cloudName: string; apiKey: string; apiSecret: string };

  constructor(userCloudinarySettings?: { cloudName: string; apiKey: string; apiSecret: string }) {
    this.userCloudinarySettings = userCloudinarySettings;
    
    if (!userCloudinarySettings) {
      // Verify global configuration if no user settings provided
      if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new Error("Cloudinary configuration missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.");
      }
    }
  }

  // Static method to create ObjectStorageService with user-specific settings
  static async createForUser(userId: string): Promise<ObjectStorageService> {
    try {
      const settings = await cloudinaryService.getEffectiveSettings(userId);
      return new ObjectStorageService(settings);
    } catch (error) {
      // Fall back to environment settings if user settings fail
      return new ObjectStorageService();
    }
  }

  // Get configured cloudinary instance
  private getCloudinaryInstance() {
    if (this.userCloudinarySettings) {
      // Configure cloudinary with user-specific settings temporarily
      const currentConfig = cloudinary.config();
      cloudinary.config({
        cloud_name: this.userCloudinarySettings.cloudName,
        api_key: this.userCloudinarySettings.apiKey,
        api_secret: this.userCloudinarySettings.apiSecret,
      });
      return cloudinary;
    } else {
      // Use global configuration
      return cloudinary;
    }
  }

  // Upload a file to Cloudinary
  async uploadFile(fileInput: string | Buffer, options: {
    folder?: string;
    resource_type?: 'image' | 'video' | 'raw' | 'auto';
    public_id?: string;
    transformation?: any;
    eager_async?: boolean;
    [key: string]: any; // Allow additional Cloudinary options
  } = {}): Promise<any> {
    try {
      const uploadOptions = {
        folder: options.folder || 'video-clipper',
        resource_type: options.resource_type || 'auto',
        public_id: options.public_id || randomUUID(),
        eager_async: options.resource_type === 'video' ? true : options.eager_async, // Force async for all videos
        ...options.transformation && { transformation: options.transformation },
        ...options // Include all other options
      };

      let result;
      if (Buffer.isBuffer(fileInput)) {
        // For Buffer input, use upload_stream with proper error handling
        console.log(`📤 Uploading ${fileInput.length} bytes to Cloudinary via stream with options:`, JSON.stringify(uploadOptions, null, 2));
        
        result = await new Promise((resolve, reject) => {
          const uploadStream = this.getCloudinaryInstance().uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) {
                console.error('❌ Cloudinary stream error:', {
                  message: error.message,
                  http_code: error.http_code,
                  name: error.name
                });
                reject(error);
              } else {
                console.log('✅ Cloudinary stream success:', { 
                  public_id: result?.public_id, 
                  bytes: result?.bytes,
                  format: result?.format 
                });
                resolve(result);
              }
            }
          );
          
          // Handle stream errors
          uploadStream.on('error', (error) => {
            console.error('❌ Upload stream error:', error);
            reject(error);
          });
          
          try {
            uploadStream.end(fileInput);
          } catch (streamError) {
            console.error('❌ Stream end error:', streamError);
            reject(streamError);
          }
        });
      } else {
        // Upload from file path
        console.log(`📤 Uploading file ${fileInput} to Cloudinary with options:`, JSON.stringify(uploadOptions, null, 2));
        result = await this.getCloudinaryInstance().uploader.upload(fileInput, uploadOptions);
      }
      
      console.log(`✅ Upload successful:`, { public_id: (result as any).public_id, bytes: (result as any).bytes, format: (result as any).format });
      return result;
    } catch (error: any) {
      console.error('❌ Cloudinary upload error details:', {
        message: error.message,
        http_code: error.http_code,
        name: error.name,
        // uploadOptions: JSON.stringify(uploadOptions, null, 2)
      });
      
      // Handle specific error types with more context
      if (error.http_code === 413) {
        throw new Error('File too large for upload. Please use a smaller file or upgrade your Cloudinary plan.');
      } else if (error.http_code === 400) {
        if (error.message?.includes('too large to process synchronously')) {
          console.log('🔄 Large video detected, should be using eager_async=true');
          throw new Error('Video processing error: File is too large. Async processing should be enabled.');
        } else if (error.message?.includes('Invalid')) {
          throw new Error('Invalid file format. Please ensure you are uploading a valid MP4 video file.');
        } else {
          throw new Error(`Upload validation error: ${error.message}`);
        }
      } else if (error.http_code === 401) {
        throw new Error('Cloudinary authentication failed. Please check your API credentials.');
      } else {
        throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
      }
    }
  }

  // Upload a video file specifically
  async uploadVideo(fileInput: string | Buffer, options: {
    folder?: string;
    public_id?: string;
    quality?: string;
    resource_type?: string;
  } = {}): Promise<any> {
    // RESEARCH FINDING: For videos >40MB (free) or >100MB (paid), avoid incoming transformations
    // Instead, upload raw and generate transformed URLs on-demand
    return this.uploadFile(fileInput, {
      ...options,
      resource_type: 'video',
      folder: options.folder || 'video-clipper/videos',
      // NO transformations during upload - this prevents "too large to process synchronously" errors
      // Transformations can be applied on-demand via URL parameters
    });
  }

  // Upload a clip file
  async uploadClip(filePath: string, options: {
    folder?: string;
    public_id?: string;
    quality?: string;
  } = {}): Promise<any> {
    // RESEARCH FINDING: Upload clips raw to avoid transformation limits
    // Note: quality parameter is ignored for upload - it's already applied during FFmpeg processing
    const { quality, ...uploadOptions } = options;
    return this.uploadFile(filePath, {
      ...uploadOptions,
      resource_type: 'video',
      folder: options.folder || 'video-clipper/clips',
      // NO transformations during upload - generate optimized URLs on-demand
    });
  }

  // Get a signed upload URL for direct uploads
  async getUploadSignature(options: {
    folder?: string;
    resource_type?: 'image' | 'video' | 'raw' | 'auto';
    public_id?: string;
  } = {}): Promise<{
    signature: string;
    timestamp: number;
    api_key: string;
    cloud_name: string;
    upload_url: string;
    folder: string;
  }> {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = options.folder || 'video-clipper';
    const resource_type = options.resource_type || 'auto';
    
    // These are the parameters that will be signed - must match exactly what's sent
    const signatureParams: Record<string, any> = {
      timestamp,
      folder
    };
    
    console.log("🔐 Signature params being used:", signatureParams);
    
    // Add public_id if provided
    if (options.public_id) {
      signatureParams.public_id = options.public_id;
    }

    const signature = this.getCloudinaryInstance().utils.api_sign_request(signatureParams, this.getCloudinaryInstance().config().api_secret!);

    return {
      signature,
      timestamp,
      api_key: this.getCloudinaryInstance().config().api_key!,
      cloud_name: this.getCloudinaryInstance().config().cloud_name!,
      upload_url: `https://api.cloudinary.com/v1_1/${this.getCloudinaryInstance().config().cloud_name}/${resource_type}/upload`,
      folder
    };
  }

  // Get file information from Cloudinary
  async getFileInfo(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'video'): Promise<any> {
    try {
      const result = await this.getCloudinaryInstance().api.resource(publicId, { resource_type: resourceType });
      return result;
    } catch (error: any) {
      if (error.http_code === 404) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
  }

  // Delete a file from Cloudinary
  async deleteFile(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'video'): Promise<any> {
    try {
      const result = await this.getCloudinaryInstance().uploader.destroy(publicId, { resource_type: resourceType });
      return result;
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new Error('Failed to delete file from Cloudinary');
    }
  }

  // Generate a URL for a Cloudinary asset
  generateUrl(publicId: string, options: {
    resource_type?: 'image' | 'video' | 'raw';
    transformation?: any;
    secure?: boolean;
  } = {}): string {
    return this.getCloudinaryInstance().url(publicId, {
      resource_type: options.resource_type || 'video',
      secure: options.secure !== false,
      ...options.transformation && { transformation: options.transformation }
    });
  }

  // Generate an optimized video URL with automatic quality and format
  generateOptimizedVideoUrl(publicId: string, options: {
    quality?: string;
    format?: string;
    width?: number;
    height?: number;
    crop?: string;
  } = {}): string {
    return this.getCloudinaryInstance().url(publicId, {
      resource_type: 'video',
      secure: true,
      transformation: {
        quality: options.quality || 'auto',
        fetch_format: options.format || 'auto',
        ...options.width && { width: options.width },
        ...options.height && { height: options.height },
        ...options.crop && { crop: options.crop }
      }
    });
  }

  // Generate a thumbnail URL for a video
  generateVideoThumbnail(publicId: string, options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string;
  } = {}): string {
    return this.getCloudinaryInstance().url(publicId, {
      resource_type: 'video',
      format: 'jpg',
      transformation: {
        width: options.width || 320,
        height: options.height || 240,
        crop: options.crop || 'fill',
        quality: options.quality || 'auto'
      }
    });
  }

  // Stream a file to response (for downloads)
  async downloadObject(publicId: string, res: Response, options: {
    resource_type?: 'image' | 'video' | 'raw';
    transformation?: any;
  } = {}): Promise<void> {
    try {
      const fileInfo = await this.getFileInfo(publicId, options.resource_type);
      const fileUrl = this.generateOptimizedVideoUrl(publicId, {
        quality: 'auto',
        format: 'auto'
      });

      // PERFORMANCE FIX: For videos, use 302 redirect to direct Cloudinary URL
      // This allows the browser to handle range requests directly with Cloudinary
      // which supports proper video streaming and seeking
      console.log(`🎥 Redirecting video stream to optimized Cloudinary URL: ${fileUrl}`);
      
      // Set proper headers for video streaming
      res.set({
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',  // Important for video seeking
      });

      // Redirect to optimized Cloudinary URL - this supports range requests
      res.redirect(302, fileUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error downloading file' });
      }
    }
  }

  // Get upload URL for object entity (compatibility method)
  async getObjectEntityUploadURL(): Promise<string> {
    const uploadSignature = await this.getUploadSignature({
      folder: 'video-clipper/uploads',
      resource_type: 'auto'
    });
    return uploadSignature.upload_url;
  }

  // Normalize object entity path (compatibility method)
  normalizeObjectEntityPath(rawPath: string): string {
    // Convert Cloudinary URLs to normalized paths
    if (rawPath.includes('cloudinary.com')) {
      try {
        const url = new URL(rawPath);
        const pathParts = url.pathname.split('/');
        const publicId = pathParts[pathParts.length - 1].split('.')[0];
        return `/objects/${publicId}`;
      } catch (error) {
        console.error('Error parsing Cloudinary URL:', error);
        return rawPath;
      }
    }
    return rawPath;
  }

  // Set ACL policy (compatibility method - Cloudinary handles permissions differently)
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    // Note: Cloudinary doesn't use ACL policies like Google Cloud Storage
    // Access control is handled through signed URLs and upload presets
    return normalizedPath;
  }

  // Get object entity file from path (compatibility method)
  async getObjectEntityFile(path: string): Promise<string> {
    // Extract public_id from path like /objects/public_id
    return path.replace('/objects/', '');
  }

  // Check access permissions (compatibility method)
  async canAccessObjectEntity({
    objectFile,
    userId,
    requestedPermission,
  }: {
    objectFile?: string;
    userId?: string;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    // For now, allow access - implement proper access control based on your needs
    // You might want to store access permissions in your database
    return true;
  }

  // Download object compatibility method (renamed to avoid conflict)
  async downloadObjectEntity(publicId: string, res: Response): Promise<void> {
    return this.downloadObject(publicId, res);
  }

  // List files in a folder
  async listFiles(folder: string = 'video-clipper', resourceType: 'image' | 'video' | 'raw' = 'video'): Promise<any[]> {
    try {
      const result = await this.getCloudinaryInstance().api.resources({
        type: 'upload',
        resource_type: resourceType,
        prefix: folder,
        max_results: 100
      });
      return result.resources;
    } catch (error) {
      console.error('Error listing files:', error);
      throw new Error('Failed to list files from Cloudinary');
    }
  }

  // Extract public ID from various path formats
  extractPublicId(path: string): string {
    // If it's already a Cloudinary public ID, return as is
    if (!path.includes('/') && !path.includes('http') && !path.includes('.')) {
      return path;
    }
    
    // If it's a full Cloudinary URL, extract the public ID
    if (path.includes('cloudinary.com')) {
      const urlParts = path.split('/');
      const versionIndex = urlParts.findIndex(part => part.startsWith('v'));
      
      if (versionIndex !== -1 && versionIndex < urlParts.length - 1) {
        // Get everything after the version number, remove file extension
        const publicIdWithExt = urlParts.slice(versionIndex + 1).join('/');
        return publicIdWithExt.replace(/\.[^/.]+$/, ''); // Remove file extension
      }
    }
    
    // If it's a path like /objects/something, extract the ID
    if (path.startsWith('/objects/')) {
      return path.replace('/objects/', '');
    }
    
    // If it contains a folder structure, preserve it but remove extension
    if (path.includes('/')) {
      return path.replace(/\.[^/.]+$/, ''); // Remove file extension
    }
    
    // Default: assume it's already a public ID, just remove extension if present
    return path.replace(/\.[^/.]+$/, '');
  }
}

// Export a singleton instance
export const objectStorageService = new ObjectStorageService();
