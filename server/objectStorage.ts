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

// Configure Cloudinary
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
  constructor() {
    // Verify Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error("Cloudinary configuration missing. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.");
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
        ...options.transformation && { transformation: options.transformation },
        ...options // Include all other options like eager_async
      };

      let result;
      if (Buffer.isBuffer(fileInput)) {
        // For large files, use the raw upload method instead of base64 encoding
        // This is more efficient and doesn't have the base64 size overhead
        result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(fileInput);
        });
      } else {
        // Upload from file path
        result = await cloudinary.uploader.upload(fileInput, uploadOptions);
      }
      
      return result;
    } catch (error: any) {
      console.error('Cloudinary upload error:', error);
      
      // Handle specific error types
      if (error.http_code === 413) {
        throw new Error('File too large for upload. Please use a smaller file or upgrade your Cloudinary plan.');
      } else if (error.http_code === 400 && error.message?.includes('Invalid')) {
        throw new Error('Invalid file format. Please ensure you are uploading a valid MP4 video file.');
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
    return this.uploadFile(fileInput, {
      ...options,
      resource_type: 'video',
      folder: options.folder || 'video-clipper/videos',
      eager_async: true, // Process videos asynchronously to avoid timeout
      transformation: {
        quality: options.quality || 'auto',
        fetch_format: 'auto'
      }
    });
  }

  // Upload a clip file
  async uploadClip(filePath: string, options: {
    folder?: string;
    public_id?: string;
    quality?: string;
  } = {}): Promise<any> {
    return this.uploadFile(filePath, {
      ...options,
      resource_type: 'video',
      folder: options.folder || 'video-clipper/clips',
      transformation: {
        quality: options.quality || 'auto',
        fetch_format: 'auto'
      }
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

    const signature = cloudinary.utils.api_sign_request(signatureParams, process.env.CLOUDINARY_API_SECRET!);

    return {
      signature,
      timestamp,
      api_key: process.env.CLOUDINARY_API_KEY!,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
      upload_url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resource_type}/upload`,
      folder
    };
  }

  // Get file information from Cloudinary
  async getFileInfo(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'video'): Promise<any> {
    try {
      const result = await cloudinary.api.resource(publicId, { resource_type: resourceType });
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
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
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
    return cloudinary.url(publicId, {
      resource_type: options.resource_type || 'video',
      secure: options.secure !== false,
      ...options.transformation && { transformation: options.transformation }
    });
  }

  // Generate a thumbnail URL for a video
  generateVideoThumbnail(publicId: string, options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: string;
  } = {}): string {
    return cloudinary.url(publicId, {
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
      const fileUrl = this.generateUrl(publicId, options);

      // Set appropriate headers
      res.set({
        'Content-Type': fileInfo.format === 'mp4' ? 'video/mp4' : 'application/octet-stream',
        'Content-Length': fileInfo.bytes,
        'Cache-Control': 'public, max-age=3600',
      });

      // Redirect to Cloudinary URL or proxy the content
      res.redirect(fileUrl);
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
      const result = await cloudinary.api.resources({
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
}

// Export a singleton instance
export const objectStorageService = new ObjectStorageService();
