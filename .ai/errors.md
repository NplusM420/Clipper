🚀 FFmpeg started: ffmpeg -ss 1841.1866663750002 -i D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper\temp\upload_1756255404729.mp4 -y -acodec aac -b:a 96k -vcodec libx264 -b:v 800k -filter:v scale=w=1280:h=720 -t 263.02666662499996 -f mp4 -movflags +faststart -preset superfast -avoid_negative_ts make_zero -threads 0 -tune fastdecode -crf 30 D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper\temp\video_1756255407318_chunk_7.mp4
📊 FFmpeg progress: 0% (00:00:02.33)
📊 FFmpeg progress: 0% (00:00:06.52)
📊 FFmpeg progress: 10% (00:03:22.70)
📊 FFmpeg progress: 10% (00:03:27.61)
📊 FFmpeg progress: 10% (00:03:32.43)
📊 FFmpeg progress: 10% (00:03:38.04)
✅ FFmpeg completed: video_1756255407318_chunk_7.mp4
✅ Chunk 7 recreated with lower quality: 26.91MB
✅ All 8 chunks created successfully
📦 Created 8 chunks, uploading to Cloudinary...
📤 Uploading chunk 1/8 (28530322 bytes)
7:49:39 PM [express] GET /api/videos 304 in 734ms :: []
7:49:45 PM [express] GET /api/videos 304 in 180ms :: []
📤 Uploading chunk 2/8 (68928801 bytes)
7:49:50 PM [express] GET /api/videos 304 in 195ms :: []
7:50:01 PM [express] GET /api/videos 304 in 398ms :: []
Cloudinary upload error: {
  message: 'Video is too large to process synchronously, please use an eager transformation with eager_async=true to resolve',
  name: 'Error',
  http_code: 400
}
❌ Upload/chunking error: Error: Upload failed: Video is too large to process synchronously, please use an eager transformation with eager_async=true to resolve
    at ObjectStorageService.uploadFile (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper/server/objectStorage.ts:1:1973)