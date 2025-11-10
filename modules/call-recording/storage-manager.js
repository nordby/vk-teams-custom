// VK Teams Call Recording - Storage Manager
// Manages storage of call recordings in IndexedDB

(function() {
    'use strict';

    class StorageManager {
        constructor(options = {}) {
            this.options = {
                dbName: options.dbName || 'VKTeamsRecordings',
                dbVersion: options.dbVersion || 1,
                storeName: options.storeName || 'recordings',
                autoCleanupDays: options.autoCleanupDays || 7, // Auto-delete after 7 days
                ...options
            };

            this.db = null;
            console.log('[VK Teams StorageManager] Initialized with options:', this.options);
        }

        // Initialize IndexedDB
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.options.dbName, this.options.dbVersion);

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to open database:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('[VK Teams StorageManager] Database opened successfully');

                    // Run auto-cleanup on init
                    this.cleanupOldRecordings().catch(error => {
                        console.error('[VK Teams StorageManager] Auto-cleanup failed:', error);
                    });

                    resolve();
                };

                request.onupgradeneeded = (event) => {
                    console.log('[VK Teams StorageManager] Upgrading database...');
                    const db = event.target.result;

                    // Create object store if it doesn't exist
                    if (!db.objectStoreNames.contains(this.options.storeName)) {
                        const objectStore = db.createObjectStore(this.options.storeName, {
                            keyPath: 'id',
                            autoIncrement: true
                        });

                        // Create indexes
                        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                        objectStore.createIndex('date', 'date', { unique: false });
                        objectStore.createIndex('callerName', 'callerName', { unique: false });

                        console.log('[VK Teams StorageManager] Object store created');
                    }
                };
            });
        }

        // Save recording to IndexedDB
        async saveRecording(recordingData, callInfo) {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            const recording = {
                // Recording data
                blob: recordingData.blob,
                mimeType: recordingData.mimeType,
                size: recordingData.size,
                duration: recordingData.duration,
                chunks: recordingData.chunks,

                // Call metadata
                callerName: callInfo?.callerName || 'Unknown',
                timestamp: Date.now(),
                date: new Date().toISOString(),
                startTime: recordingData.startTime,
                endTime: recordingData.endTime,

                // Additional metadata
                transcription: null, // Will be filled by AI later
                summary: null, // Will be filled by AI later
                processed: false
            };

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readwrite');
                const objectStore = transaction.objectStore(this.options.storeName);
                const request = objectStore.add(recording);

                request.onsuccess = () => {
                    const id = request.result;
                    console.log('[VK Teams StorageManager] Recording saved with ID:', id);
                    resolve({
                        id: id,
                        ...recording
                    });
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to save recording:', request.error);
                    reject(request.error);
                };
            });
        }

        // Get all recordings
        async getRecordings(options = {}) {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            const {
                limit = 100,
                offset = 0,
                sortBy = 'timestamp',
                sortOrder = 'desc'
            } = options;

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readonly');
                const objectStore = transaction.objectStore(this.options.storeName);
                const index = objectStore.index(sortBy);

                const request = index.openCursor(null, sortOrder === 'desc' ? 'prev' : 'next');
                const recordings = [];
                let count = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;

                    if (cursor) {
                        if (count >= offset && recordings.length < limit) {
                            recordings.push(cursor.value);
                        }
                        count++;
                        cursor.continue();
                    } else {
                        console.log(`[VK Teams StorageManager] Retrieved ${recordings.length} recordings`);
                        resolve(recordings);
                    }
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to get recordings:', request.error);
                    reject(request.error);
                };
            });
        }

        // Get single recording by ID
        async getRecording(id) {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readonly');
                const objectStore = transaction.objectStore(this.options.storeName);
                const request = objectStore.get(id);

                request.onsuccess = () => {
                    console.log('[VK Teams StorageManager] Retrieved recording:', id);
                    resolve(request.result);
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to get recording:', request.error);
                    reject(request.error);
                };
            });
        }

        // Update recording (e.g., add transcription/summary)
        async updateRecording(id, updates) {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            return new Promise(async (resolve, reject) => {
                try {
                    // First get the existing recording
                    const recording = await this.getRecording(id);

                    if (!recording) {
                        reject(new Error(`Recording not found: ${id}`));
                        return;
                    }

                    console.log('[VK Teams StorageManager] ★★★ Updating recording:', {
                        recordingId: id,
                        callerName: recording.metadata?.callerName,
                        hasOldTranscription: !!recording.transcription,
                        oldTranscriptionPreview: recording.transcription?.substring(0, 50) + '...',
                        hasNewTranscription: !!updates.transcription,
                        newTranscriptionPreview: updates.transcription?.substring(0, 50) + '...',
                        timestamp: new Date().toISOString()
                    });

                    // Merge updates
                    const updatedRecording = {
                        ...recording,
                        ...updates
                    };

                    // Save back to DB
                    const transaction = this.db.transaction([this.options.storeName], 'readwrite');
                    const objectStore = transaction.objectStore(this.options.storeName);
                    const request = objectStore.put(updatedRecording);

                    request.onsuccess = () => {
                        console.log('[VK Teams StorageManager] ★★★ Recording updated successfully:', {
                            recordingId: id,
                            callerName: updatedRecording.metadata?.callerName,
                            transcriptionPreview: updatedRecording.transcription?.substring(0, 100) + '...',
                            timestamp: new Date().toISOString()
                        });
                        resolve(updatedRecording);
                    };

                    request.onerror = () => {
                        console.error('[VK Teams StorageManager] Failed to update recording:', request.error);
                        reject(request.error);
                    };
                } catch (error) {
                    reject(error);
                }
            });
        }

        // Delete recording by ID
        async deleteRecording(id) {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readwrite');
                const objectStore = transaction.objectStore(this.options.storeName);
                const request = objectStore.delete(id);

                request.onsuccess = () => {
                    console.log('[VK Teams StorageManager] Recording deleted:', id);
                    resolve();
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to delete recording:', request.error);
                    reject(request.error);
                };
            });
        }

        // Delete all recordings
        async deleteAllRecordings() {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readwrite');
                const objectStore = transaction.objectStore(this.options.storeName);
                const request = objectStore.clear();

                request.onsuccess = () => {
                    console.log('[VK Teams StorageManager] All recordings deleted');
                    resolve();
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to delete all recordings:', request.error);
                    reject(request.error);
                };
            });
        }

        // Cleanup old recordings
        async cleanupOldRecordings() {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            const cutoffDate = Date.now() - (this.options.autoCleanupDays * 24 * 60 * 60 * 1000);
            console.log(`[VK Teams StorageManager] Cleaning up recordings older than ${this.options.autoCleanupDays} days`);

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readwrite');
                const objectStore = transaction.objectStore(this.options.storeName);
                const index = objectStore.index('timestamp');
                const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));

                let deletedCount = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;

                    if (cursor) {
                        cursor.delete();
                        deletedCount++;
                        cursor.continue();
                    } else {
                        console.log(`[VK Teams StorageManager] Cleanup complete. Deleted ${deletedCount} old recordings`);
                        resolve(deletedCount);
                    }
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Cleanup failed:', request.error);
                    reject(request.error);
                };
            });
        }

        // Get storage statistics
        async getStats() {
            if (!this.db) {
                throw new Error('Database not initialized. Call init() first.');
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.options.storeName], 'readonly');
                const objectStore = transaction.objectStore(this.options.storeName);
                const request = objectStore.openCursor();

                let totalSize = 0;
                let totalDuration = 0;
                let count = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;

                    if (cursor) {
                        totalSize += cursor.value.size || 0;
                        totalDuration += cursor.value.duration || 0;
                        count++;
                        cursor.continue();
                    } else {
                        resolve({
                            count: count,
                            totalSize: totalSize,
                            totalDuration: totalDuration,
                            averageSize: count > 0 ? Math.round(totalSize / count) : 0,
                            averageDuration: count > 0 ? Math.round(totalDuration / count) : 0
                        });
                    }
                };

                request.onerror = () => {
                    console.error('[VK Teams StorageManager] Failed to get stats:', request.error);
                    reject(request.error);
                };
            });
        }

        // Close database connection
        close() {
            if (this.db) {
                this.db.close();
                this.db = null;
                console.log('[VK Teams StorageManager] Database closed');
            }
        }
    }

    // Export to global scope
    window.VKTeamsCallRecording = window.VKTeamsCallRecording || {};
    window.VKTeamsCallRecording.StorageManager = StorageManager;

    console.log('[VK Teams StorageManager] Module loaded');
})();
