import { recordingDB } from './recordingDB';
import type { RecordingData } from './recordingDB';

export async function uploadRecordingToBackend(recording: RecordingData): Promise<void> {
  try {
    console.log(`[UPLOAD] Starting upload for recording: ${recording.id}`);
    console.log(`  - Session ID: ${recording.sessionId}`);
    console.log(`  - User ID: ${recording.userId}`);
    console.log(`  - Duration: ${recording.duration}s`);
    console.log(`  - Size: ${recording.blob.size} bytes`);
    console.log(`  - Timestamp: ${new Date(recording.timestamp).toISOString()}`);

    // Update status to uploading
    await recordingDB.updateUploadStatus(recording.id, 'uploading');

    // Create FormData
    const formData = new FormData();
    formData.append('video', recording.blob, `recording-${recording.id}.webm`);
    formData.append('sessionId', recording.sessionId);
    formData.append('userId', recording.userId);
    formData.append('roomId', recording.roomId);
    formData.append('timestamp', recording.timestamp.toString());
    formData.append('duration', recording.duration.toString());

    // Upload to backend via Worker
    // Use Worker domain to ensure request goes through BackendProxy
    const workerDomain = import.meta.env.VITE_WORKER_URL || 'https://woff-cl.m-tama-ramu.workers.dev';
    const uploadUrl = `${workerDomain}/api/recordings/upload`;

    console.log(`[UPLOAD] Uploading to: ${uploadUrl}`);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    // Handle duplicate (409 Conflict)
    if (response.status === 409) {
      console.log(`[UPLOAD] Recording rejected as duplicate (409): ${recording.id}`);
      await recordingDB.updateUploadStatus(recording.id, 'denied');
      console.log(`[UPLOAD] Marked as denied, keeping local backup`);
      return;
    }

    // Handle other errors
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload failed with status ${response.status}: ${errorText}`);
    }

    // Parse success response
    const result = await response.json();
    console.log(`[UPLOAD] Upload successful:`, result);

    // Update status to completed
    await recordingDB.updateUploadStatus(recording.id, 'completed');
    console.log(`[UPLOAD] Marked as completed: ${recording.id}`);
  } catch (error) {
    console.error(`[UPLOAD] Upload failed for recording: ${recording.id}`, error);

    // Update status to failed
    await recordingDB.updateUploadStatus(
      recording.id,
      'failed',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}

// Upload all pending recordings in parallel
export async function uploadPendingRecordings(): Promise<void> {
  const pendingRecordings = await recordingDB.getPendingUploads();

  console.log(`Found ${pendingRecordings.length} pending uploads`);

  if (pendingRecordings.length === 0) return;

  // Upload all in parallel
  const uploadPromises = pendingRecordings.map((recording) =>
    uploadRecordingToBackend(recording).catch((error) => {
      console.error(`Failed to upload recording ${recording.id}:`, error);
      // Don't throw, just log - we want other uploads to continue
    })
  );

  await Promise.all(uploadPromises);
}
