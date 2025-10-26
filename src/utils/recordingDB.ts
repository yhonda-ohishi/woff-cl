// IndexedDB for storing video recordings
const DB_NAME = 'VideoRecordingsDB';
const STORE_NAME = 'recordings';
const DB_VERSION = 1;

export interface RecordingData {
  id: string; // Unique ID (timestamp-based)
  sessionId: string; // Session ID to identify recordings from the same call
  userId: string; // User ID who made this recording
  roomId: string; // Room ID where recording was made
  timestamp: number; // Recording start time
  blob: Blob; // Video blob
  duration: number; // Duration in seconds
  uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed' | 'denied';
  uploadError?: string;
  expiresAt: number; // Expiration timestamp
}

class RecordingDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('uploadStatus', 'uploadStatus', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }

  async saveRecording(recording: RecordingData): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(recording);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getRecording(id: string): Promise<RecordingData | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getAllRecordings(): Promise<RecordingData[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async updateUploadStatus(
    id: string,
    status: RecordingData['uploadStatus'],
    error?: string
  ): Promise<void> {
    const recording = await this.getRecording(id);
    if (!recording) throw new Error('Recording not found');

    recording.uploadStatus = status;
    if (error) recording.uploadError = error;

    await this.saveRecording(recording);
  }

  async deleteRecording(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteExpiredRecordings(): Promise<number> {
    const now = Date.now();
    const allRecordings = await this.getAllRecordings();
    let deletedCount = 0;

    for (const recording of allRecordings) {
      if (recording.expiresAt <= now) {
        await this.deleteRecording(recording.id);
        deletedCount++;
        console.log(`Deleted expired recording: ${recording.id}`);
      }
    }

    return deletedCount;
  }

  async getPendingUploads(): Promise<RecordingData[]> {
    const allRecordings = await this.getAllRecordings();
    return allRecordings.filter(
      (r) => r.uploadStatus === 'pending' || r.uploadStatus === 'failed'
    );
  }
}

export const recordingDB = new RecordingDB();
