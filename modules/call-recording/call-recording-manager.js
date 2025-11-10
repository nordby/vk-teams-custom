// VK Teams Call Recording - Manager
// Integrates CallDetector, AudioRecorder, and StorageManager

(function() {
    'use strict';

    class CallRecordingManager {
        constructor() {
            this.callDetector = null;
            this.audioRecorder = null;
            this.storageManager = null;
            this.audioMixer = null;
            this.audioTranscription = null;
            this.isEnabled = false;
            this.autoAnswer = false;
            this.currentRecording = null;

            console.log('[VK Teams CallRecordingManager] Initialized');
        }

        // Initialize all modules
        async init() {
            console.log('[VK Teams CallRecordingManager] Initializing modules...');

            // Check if modules are loaded
            if (!window.VKTeamsCallRecording) {
                throw new Error('Call recording modules not loaded');
            }

            const { CallDetector, AudioRecorder, StorageManager, AudioTranscription } = window.VKTeamsCallRecording;

            // Load settings
            const settings = await this.loadSettings();
            this.isEnabled = settings.callRecordingEnabled || false;
            this.autoAnswer = settings.autoAnswerCalls || false;
            this.autoTranscribe = settings.autoTranscribe !== false; // default true
            this.useLLMForSpeakers = settings.useLLMForSpeakers !== false; // default true

            console.log('[VK Teams CallRecordingManager] Settings loaded:', {
                enabled: this.isEnabled,
                autoAnswer: this.autoAnswer,
                autoTranscribe: this.autoTranscribe,
                useLLMForSpeakers: this.useLLMForSpeakers
            });

            // Initialize storage
            this.storageManager = new StorageManager();
            await this.storageManager.init();

            // Initialize audio recorder
            this.audioRecorder = new AudioRecorder();

            // Initialize audio transcription
            this.audioTranscription = new AudioTranscription();
            await this.audioTranscription.init();
            if (this.audioTranscription.isAvailable()) {
                console.log('[VK Teams CallRecordingManager] Audio transcription is available');
            } else {
                console.log('[VK Teams CallRecordingManager] Audio transcription not configured');
            }

            // Initialize call detector
            console.log('[VK Teams CallRecordingManager] Initializing CallDetector with autoAnswer:', this.autoAnswer);
            this.callDetector = new CallDetector({
                autoAnswer: this.autoAnswer
            });
            console.log('[VK Teams CallRecordingManager] CallDetector.options.autoAnswer:', this.callDetector.options.autoAnswer);

            // Setup event handlers
            this.setupEventHandlers();

            // Start detection if enabled
            if (this.isEnabled) {
                this.start();
            }

            console.log('[VK Teams CallRecordingManager] Initialization complete');
        }

        // Setup event handlers to connect modules
        setupEventHandlers() {
            // Handle incoming call
            this.callDetector.on('incomingCall', (callInfo) => {
                console.log('[VK Teams CallRecordingManager] Incoming call:', callInfo.callerName);
                // Auto-answer is handled by CallDetector
            });

            // Handle call answered
            this.callDetector.on('callAnswered', (callInfo) => {
                console.log('[VK Teams CallRecordingManager] Call answered:', callInfo.callerName);
            });

            // Handle call started
            this.callDetector.on('callStarted', (callInfo) => {
                console.log('[VK Teams CallRecordingManager] Call started, starting recording...');

                if (this.isEnabled) {
                    // Check if already recording to prevent duplicate start attempts
                    if (this.audioRecorder.isRecording) {
                        console.warn('[VK Teams CallRecordingManager] Already recording, ignoring duplicate call start event');
                        return;
                    }
                    this.startRecording(callInfo);
                }
            });

            // Handle streams updated (participants joined/left)
            this.callDetector.on('streamsUpdated', async (callInfo) => {
                console.log('[VK Teams CallRecordingManager] ⚠️⚠️⚠️ STREAMS UPDATED EVENT RECEIVED!');
                console.log('[VK Teams CallRecordingManager] Event data:', {
                    hasCallInfo: !!callInfo,
                    hasStreams: !!(callInfo && callInfo.streams),
                    streamsCount: callInfo?.streams?.length || 0,
                    isEnabled: this.isEnabled,
                    isRecording: this.audioRecorder?.isRecording
                });

                if (!this.isEnabled) {
                    console.warn('[VK Teams CallRecordingManager] Recording is disabled, ignoring stream update');
                    return;
                }

                if (!this.audioRecorder.isRecording) {
                    console.warn('[VK Teams CallRecordingManager] Not currently recording, ignoring stream update');
                    return;
                }

                console.log('[VK Teams CallRecordingManager] 🔄 Starting seamless recording restart...');

                // Log current recording state BEFORE restart
                console.log('[VK Teams CallRecordingManager] 📊 Current recording state:', {
                    chunks: this.audioRecorder.chunks?.length || 0,
                    duration: this.audioRecorder.getDuration(),
                    totalSize: this.audioRecorder.getTotalSize(),
                    recorderState: this.audioRecorder.getState()
                });

                // Cleanup old mixer
                if (this.audioMixer) {
                    console.log('[VK Teams CallRecordingManager] 🧹 Cleaning up old mixer...');
                    this.audioMixer.cleanup();
                    this.audioMixer = null;
                    console.log('[VK Teams CallRecordingManager] ✓ Old mixer cleaned up');
                }

                // Log incoming streams
                console.log('[VK Teams CallRecordingManager] 📥 Incoming streams:', callInfo.streams.map((s, i) => ({
                    index: i,
                    id: s.id,
                    active: s.active,
                    audioTracks: s.getAudioTracks().map(t => ({
                        id: t.id,
                        label: t.label,
                        enabled: t.enabled,
                        readyState: t.readyState
                    }))
                })));

                // Create new mixed stream from updated streams
                let newRecordingStream;
                if (callInfo.streams && callInfo.streams.length > 1) {
                    console.log('[VK Teams CallRecordingManager] 🎛️ Mixing', callInfo.streams.length, 'updated streams...');

                    const { AudioMixer } = window.VKTeamsCallRecording;
                    this.audioMixer = new AudioMixer();
                    newRecordingStream = this.audioMixer.mixStreams(callInfo.streams);

                    if (!newRecordingStream) {
                        console.error('[VK Teams CallRecordingManager] ❌ Failed to mix updated streams, falling back to first stream');
                        newRecordingStream = callInfo.streams[0];
                        console.log('[VK Teams CallRecordingManager] 📌 Using fallback stream:', {
                            id: newRecordingStream.id,
                            tracks: newRecordingStream.getAudioTracks().length
                        });
                    } else {
                        console.log('[VK Teams CallRecordingManager] ✅ Updated streams mixed successfully');
                        console.log('[VK Teams CallRecordingManager] 📌 Mixed stream:', {
                            id: newRecordingStream.id,
                            active: newRecordingStream.active,
                            audioTracks: newRecordingStream.getAudioTracks().map(t => ({
                                id: t.id,
                                label: t.label,
                                enabled: t.enabled,
                                readyState: t.readyState
                            }))
                        });
                    }
                } else if (callInfo.streams && callInfo.streams.length === 1) {
                    newRecordingStream = callInfo.streams[0];
                    console.log('[VK Teams CallRecordingManager] 📌 Using single updated stream:', {
                        id: newRecordingStream.id,
                        tracks: newRecordingStream.getAudioTracks().length
                    });
                } else {
                    console.error('[VK Teams CallRecordingManager] ❌ No streams available for restart!');
                    return;
                }

                // Seamlessly restart recording with new stream (keeps all chunks)
                console.log('[VK Teams CallRecordingManager] 🚀 Calling audioRecorder.restartRecording()...');
                const success = await this.audioRecorder.restartRecording(newRecordingStream);

                if (success) {
                    console.log('[VK Teams CallRecordingManager] ✅✅✅ Recording restarted seamlessly!');
                    console.log('[VK Teams CallRecordingManager] 📊 Recording state after restart:', {
                        chunks: this.audioRecorder.chunks?.length || 0,
                        duration: this.audioRecorder.getDuration(),
                        totalSize: this.audioRecorder.getTotalSize(),
                        recorderState: this.audioRecorder.getState()
                    });
                } else {
                    console.error('[VK Teams CallRecordingManager] ❌❌❌ Failed to restart recording!');
                }
            });

            // Handle call ended
            this.callDetector.on('callEnded', (callInfo) => {
                console.log('[VK Teams CallRecordingManager] Call ended');

                if (this.isEnabled && this.audioRecorder.isRecording) {
                    this.stopRecording(callInfo);
                }
            });

            // Handle recording stopped
            this.audioRecorder.on('recordingStopped', async (recordingData) => {
                console.log('[VK Teams CallRecordingManager] Recording stopped, saving...');

                try {
                    await this.saveRecording(recordingData);
                } catch (error) {
                    console.error('[VK Teams CallRecordingManager] Failed to save recording:', error);
                }
            });

            // Handle recording errors
            this.audioRecorder.on('error', (error) => {
                console.error('[VK Teams CallRecordingManager] Recording error:', error);
            });
        }

        // Start recording
        startRecording(callInfo) {
            // Check if we have streams (array) or stream (single)
            const hasStreams = callInfo && callInfo.streams && callInfo.streams.length > 0;
            const hasStream = callInfo && callInfo.stream;

            if (!hasStreams && !hasStream) {
                console.error('[VK Teams CallRecordingManager] No stream available for recording');
                return false;
            }

            // Get caller name from multiple sources
            let callerName = null;

            // 1. Try to get from callInfo (already determined by detector)
            if (callInfo.callerName && callInfo.callerName !== 'Unknown') {
                callerName = callInfo.callerName;
                console.log('[VK Teams CallRecordingManager] Using caller name from callInfo:', callerName);
            }
            // 2. Try from incoming call
            else if (this.callDetector.getIncomingCall()) {
                const incomingCall = this.callDetector.getIncomingCall();
                if (incomingCall.callerName && incomingCall.callerName !== 'Unknown') {
                    callerName = incomingCall.callerName;
                    console.log('[VK Teams CallRecordingManager] Using caller name from incoming call:', callerName);
                }
            }
            // 3. Try to extract from UI directly
            if (!callerName || callerName === 'Unknown') {
                const extractedName = this.callDetector.extractCallerNameFromUI();
                if (extractedName) {
                    callerName = extractedName;
                    console.log('[VK Teams CallRecordingManager] Using caller name extracted from UI:', callerName);
                }
            }
            // 4. Final fallback
            if (!callerName) {
                callerName = 'Unknown';
                console.warn('[VK Teams CallRecordingManager] Could not determine caller name, using "Unknown"');
            }

            this.currentRecording = {
                callInfo: callInfo,
                callerName: callerName
            };

            // Determine which stream to use for recording
            let recordingStream;

            if (hasStreams && callInfo.streams.length > 1) {
                // Multiple streams - mix them together
                console.log('[VK Teams CallRecordingManager] Mixing', callInfo.streams.length, 'audio streams...');

                const { AudioMixer } = window.VKTeamsCallRecording;
                this.audioMixer = new AudioMixer();
                recordingStream = this.audioMixer.mixStreams(callInfo.streams);

                if (!recordingStream) {
                    console.error('[VK Teams CallRecordingManager] Failed to mix audio streams, falling back to first stream');
                    recordingStream = callInfo.streams[0];
                    console.warn('[VK Teams CallRecordingManager] ⚠️ Recording will use only the first stream (missing audio from other participants)');
                } else {
                    console.log('[VK Teams CallRecordingManager] Audio streams mixed successfully');
                }
            } else if (hasStreams) {
                // Single stream in array
                recordingStream = callInfo.streams[0];
                console.log('[VK Teams CallRecordingManager] Using single stream from array');
            } else {
                // Legacy single stream
                recordingStream = callInfo.stream;
                console.log('[VK Teams CallRecordingManager] Using legacy single stream');
            }

            const success = this.audioRecorder.startRecording(recordingStream);

            if (success) {
                console.log('[VK Teams CallRecordingManager] Recording started successfully');
            } else {
                console.error('[VK Teams CallRecordingManager] Failed to start recording');
            }

            return success;
        }

        // Stop recording
        stopRecording(callInfo) {
            const recordingData = this.audioRecorder.stopRecording();

            if (recordingData) {
                console.log('[VK Teams CallRecordingManager] Recording stopped successfully');
            } else {
                console.error('[VK Teams CallRecordingManager] Failed to stop recording');
            }

            // Cleanup audio mixer if it was used
            if (this.audioMixer) {
                console.log('[VK Teams CallRecordingManager] Cleaning up audio mixer...');
                this.audioMixer.cleanup();
                this.audioMixer = null;
            }

            return recordingData;
        }

        // Save recording to storage
        async saveRecording(recordingData) {
            if (!this.currentRecording) {
                throw new Error('No current recording info');
            }

            try {
                const saved = await this.storageManager.saveRecording(
                    recordingData,
                    {
                        callerName: this.currentRecording.callerName
                    }
                );

                console.log('[VK Teams CallRecordingManager] Recording saved:', saved.id);

                // Start transcription in background if available and enabled
                if (this.autoTranscribe && this.audioTranscription && this.audioTranscription.isAvailable()) {
                    // Clone blob to ensure each transcription gets its own independent copy
                    // This prevents race conditions when multiple calls end quickly
                    const blobClone = recordingData.blob.slice(0, recordingData.blob.size, recordingData.blob.type);

                    console.log('[VK Teams CallRecordingManager] ★★★ Starting transcription for recording:', {
                        recordingId: saved.id,
                        blobSize: blobClone.size,
                        blobType: blobClone.type,
                        duration: recordingData.duration,
                        callerName: this.currentRecording.callerName,
                        timestamp: new Date().toISOString()
                    });
                    this.transcribeRecording(saved.id, blobClone).catch(error => {
                        console.error('[VK Teams CallRecordingManager] Transcription failed:', error);
                    });
                } else {
                    console.log('[VK Teams CallRecordingManager] Transcription not available, skipping');
                }

                this.currentRecording = null;

                return saved;
            } catch (error) {
                console.error('[VK Teams CallRecordingManager] Failed to save recording:', error);
                throw error;
            }
        }

        // Transcribe recording and save result
        async transcribeRecording(recordingId, audioBlob) {
            try {
                console.log('[VK Teams CallRecordingManager] ★★★ Transcribing recording:', {
                    recordingId,
                    blobSize: audioBlob.size,
                    blobType: audioBlob.type,
                    timestamp: new Date().toISOString()
                });

                const transcription = await this.audioTranscription.transcribe(audioBlob, {
                    language: 'ru',
                    responseFormat: 'json'
                });

                console.log('[VK Teams CallRecordingManager] ★★★ Transcription completed:', {
                    recordingId,
                    textLength: transcription.text?.length || 0,
                    textPreview: transcription.text?.substring(0, 100) + '...',
                    hasSegments: !!(transcription.segments && transcription.segments.length > 0),
                    segmentsCount: transcription.segments?.length || 0,
                    timestamp: new Date().toISOString()
                });

                // Format transcription with speaker separation using LLM (if enabled)
                let formattedTranscription = null;
                if (this.useLLMForSpeakers) {
                    try {
                        formattedTranscription = await this.formatTranscriptionWithSpeakers(transcription);
                        console.log('[VK Teams CallRecordingManager] ★★★ Speaker separation completed');
                    } catch (error) {
                        console.error('[VK Teams CallRecordingManager] Failed to format transcription with speakers:', error);
                    }
                } else {
                    console.log('[VK Teams CallRecordingManager] Speaker separation disabled, using raw transcription');
                }

                // Update recording with transcription
                await this.storageManager.updateRecording(recordingId, {
                    transcription: transcription.text, // Raw transcription
                    transcriptionFormatted: formattedTranscription, // Formatted with speakers
                    transcriptionLanguage: transcription.language,
                    transcriptionDuration: transcription.duration,
                    transcriptionSegments: transcription.segments
                });

                console.log('[VK Teams CallRecordingManager] ★★★ Transcription saved to recording:', {
                    recordingId,
                    textPreview: transcription.text?.substring(0, 100) + '...',
                    hasFormatted: !!formattedTranscription,
                    timestamp: new Date().toISOString()
                });

                return transcription;
            } catch (error) {
                console.error('[VK Teams CallRecordingManager] Failed to transcribe recording:', error);
                throw error;
            }
        }

        // Start call detection
        start() {
            if (!this.callDetector) {
                console.error('[VK Teams CallRecordingManager] Call detector not initialized');
                return false;
            }

            this.callDetector.start();
            console.log('[VK Teams CallRecordingManager] Call detection started');
            return true;
        }

        // Stop call detection
        stop() {
            if (!this.callDetector) {
                return false;
            }

            this.callDetector.stop();
            console.log('[VK Teams CallRecordingManager] Call detection stopped');
            return true;
        }

        // Enable recording
        async enable() {
            this.isEnabled = true;
            await this.saveSettings();
            this.start();
            console.log('[VK Teams CallRecordingManager] Recording enabled');
        }

        // Disable recording
        async disable() {
            this.isEnabled = false;
            await this.saveSettings();
            this.stop();
            console.log('[VK Teams CallRecordingManager] Recording disabled');
        }

        // Set auto-answer
        async setAutoAnswer(enabled) {
            this.autoAnswer = enabled;
            if (this.callDetector) {
                this.callDetector.options.autoAnswer = enabled;
            }
            await this.saveSettings();
            console.log('[VK Teams CallRecordingManager] Auto-answer:', enabled);
        }

        // Load settings from chrome.storage
        async loadSettings() {
            return new Promise((resolve) => {
                chrome.storage.sync.get(['callRecordingEnabled', 'autoAnswerCalls', 'autoTranscribe', 'useLLMForSpeakers'], (result) => {
                    resolve({
                        callRecordingEnabled: result.callRecordingEnabled || false,
                        autoAnswerCalls: result.autoAnswerCalls || false,
                        autoTranscribe: result.autoTranscribe !== false, // default true
                        useLLMForSpeakers: result.useLLMForSpeakers !== false // default true
                    });
                });
            });
        }

        // Save settings to chrome.storage
        async saveSettings() {
            return new Promise((resolve) => {
                chrome.storage.sync.set({
                    callRecordingEnabled: this.isEnabled,
                    autoAnswerCalls: this.autoAnswer
                }, resolve);
            });
        }

        // Format transcription with speaker separation using LLM
        async formatTranscriptionWithSpeakers(transcription) {
            console.log('[VK Teams CallRecordingManager] Formatting transcription with speakers...');

            // Get AI config from storage
            const aiConfig = await new Promise((resolve) => {
                chrome.storage.sync.get(['aiConfig'], (result) => {
                    resolve(result.aiConfig);
                });
            });

            if (!aiConfig || aiConfig.provider !== 'custom') {
                console.log('[VK Teams CallRecordingManager] Custom API not configured, skipping speaker separation');
                return null;
            }

            // Build prompt with segments if available
            let promptText = 'Это транскрипция разговора в VK Teams. Определи всех участников и раздели текст на их реплики.\n\n';

            if (transcription.segments && transcription.segments.length > 0) {
                promptText += 'Сегменты с временными метками:\n';
                transcription.segments.forEach((segment, index) => {
                    promptText += `[${segment.start.toFixed(1)}s - ${segment.end.toFixed(1)}s]: ${segment.text}\n`;
                });
            } else {
                promptText += 'Текст разговора:\n' + transcription.text;
            }

            promptText += '\n\nФормат ответа:\nУчастник 1: [текст реплики]\nУчастник 2: [текст реплики]\nУчастник 3: [текст реплики]\n...\n\nОпредели количество участников и кто говорит каждую реплику, основываясь на контексте, паузах, вопросах и ответах, обращениях. Если участников больше двух, пронумеруй их всех. Отвечай ТОЛЬКО в указанном формате, без дополнительных комментариев.';

            try {
                // Send to background script for LLM processing
                const response = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'chatCompletion',
                        prompt: promptText,
                        config: aiConfig
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (!response) {
                            reject(new Error('No response from background script'));
                        } else if (response.success) {
                            resolve(response.result);
                        } else {
                            reject(new Error(response.error));
                        }
                    });
                });

                console.log('[VK Teams CallRecordingManager] LLM response received:', {
                    textLength: response.text?.length || 0
                });

                return response.text;
            } catch (error) {
                console.error('[VK Teams CallRecordingManager] Failed to format with LLM:', error);
                throw error;
            }
        }

        // Get storage manager (for popup to access recordings)
        getStorageManager() {
            return this.storageManager;
        }

        // Get statistics
        async getStats() {
            if (!this.storageManager) {
                return null;
            }
            return await this.storageManager.getStats();
        }
    }

    // Export to global scope
    window.VKTeamsCallRecording = window.VKTeamsCallRecording || {};
    window.VKTeamsCallRecording.CallRecordingManager = CallRecordingManager;

    console.log('[VK Teams CallRecordingManager] Module loaded');
})();
