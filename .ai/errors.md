🔄 Processing part 7/8 (1578.16s - 1841.1866s)
⬇️ Downloading video for audio extraction...
🎵 Extracting audio from video...
🚀 FFmpeg audio extraction started: ffmpeg -i D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\video_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_6.mp4 -y -acodec pcm_s24le -ac 1 -ar 22050 -filter:a volume=1.2,highpass=f=80,lowpass=f=8000 -vn -f wav D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\audio_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_6.wav
✅ Audio extraction completed: D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\audio_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_6.wav
✅ Part 7 audio extracted
🔄 Processing part 8/8 (1841.1866s - 2104.2134s)
⬇️ Downloading video for audio extraction...
🎵 Extracting audio from video...
🚀 FFmpeg audio extraction started: ffmpeg -i D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\video_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_7.mp4 -y -acodec pcm_s24le -ac 1 -ar 22050 -filter:a volume=1.2,highpass=f=80,lowpass=f=8000 -vn -f wav D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\audio_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_7.wav
✅ Audio extraction completed: D:\Clients\AI Layer Labs\Demos\ClipperBuild\Clipper_fresh\temp\audio_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_7.wav
✅ Part 8 audio extracted
🎤 Transcribing audio segment 1/8
✅ Audio segment 1 is 16.60MB, transcribing directly
🎤 Transcribing audio file: audio_102b0594-cb6a-43e4-9cea-51ea444a56d5_part_0.wav
Transcription error: WhisperError: Unknown Whisper API error
    at TranscriptionService.transcribeAudioFile (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:14937)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async TranscriptionService.transcribeChunkedVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:8523)
    at async TranscriptionService.transcribeVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:4033) {
  code: 'WHISPER_ERROR',
  originalError: TypeError: crypto.SHA256 is not a function
      at TranscriptionService.generateAudioFingerprint (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:1903)
      at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
      at async TranscriptionService.transcribeAudioFile (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:11873)
      at async TranscriptionService.transcribeChunkedVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:8523)
      at async TranscriptionService.transcribeVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:4033),
  whisperCode: 'UNKNOWN'
}
WhisperError: Unknown Whisper API error
    at TranscriptionService.transcribeAudioFile (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:14937)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async TranscriptionService.transcribeChunkedVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:8523)
    at async TranscriptionService.transcribeVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:4033) {
  code: 'WHISPER_ERROR',
  originalError: TypeError: crypto.SHA256 is not a function
      at TranscriptionService.generateAudioFingerprint (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:1903)
      at process.processTicksAndRejections (node:internal/process/task_queues:95:5)
      at async TranscriptionService.transcribeAudioFile (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:11873)
      at async TranscriptionService.transcribeChunkedVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:8523)
      at async TranscriptionService.transcribeVideo (file:///D:/Clients/AI%20Layer%20Labs/Demos/ClipperBuild/Clipper_fresh/server/services/transcriptionService.ts:1:4033),
  whisperCode: 'UNKNOWN'
}