// VK Teams Custom Reactions - Popup Settings
(function() {
    'use strict';

    // Preset definitions
    const PRESETS = {
        'default': ['👍', '🤡', '🤦', '🔥', '💩', '✨'],
        'work': ['✅', '❌', '⚠️', '📌', '💡', '🎯'],
        'positive': ['❤️', '😂', '😍', '🎉', '👏', '🔥'],
        'emotions': ['😊', '😢', '😮', '😡', '🤔', '😴'],
        'memes': ['🤡', '💀', '🗿', '☠️', '👁️', '🤨']
    };

    // Get all VK Teams tabs
    async function getAllTeamsTabs() {
        try {
            const patterns = [
                '*://teams.your-organization.com/*',
                '*://*.teams.your-organization.com/*',
                '*://webim.teams.your-organization.com/*'
            ];

            const allTabs = [];
            for (const pattern of patterns) {
                const tabs = await chrome.tabs.query({ url: pattern });
                allTabs.push(...tabs);
            }

            // Remove duplicates by tab id
            const uniqueTabs = Array.from(new Map(allTabs.map(tab => [tab.id, tab])).values());
            return uniqueTabs;
        } catch (error) {
            console.error('[VK Teams] Error getting tabs:', error);
            return [];
        }
    }

    // Load current preset
    function loadCurrentPreset() {
        chrome.storage.sync.get(['selectedPreset'], (result) => {
            const currentPreset = result.selectedPreset || 'default';
            console.log('[VK Teams Reactions Settings] Current preset:', currentPreset);

            // Update preview
            updatePreview(currentPreset);

            // Highlight active card
            updateActiveCard(currentPreset);
        });
    }

    // Update preview display
    function updatePreview(presetName) {
        const reactions = PRESETS[presetName];
        const previewElement = document.getElementById('currentPreview');

        if (reactions && previewElement) {
            previewElement.innerHTML = reactions.map(emoji =>
                `<span>${emoji}</span>`
            ).join('');
        }
    }

    // Update active card styling
    function updateActiveCard(presetName) {
        // Remove active class from all cards
        document.querySelectorAll('.preset-card').forEach(card => {
            card.classList.remove('active');
            const checkIcon = card.querySelector('.check-icon');
            if (checkIcon) {
                checkIcon.style.display = 'none';
            }
        });

        // Add active class to current card
        const activeCard = document.querySelector(`[data-preset="${presetName}"]`);
        if (activeCard) {
            activeCard.classList.add('active');
            const checkIcon = activeCard.querySelector('.check-icon');
            if (checkIcon) {
                checkIcon.style.display = 'inline';
            }
        }
    }

    // Save preset selection
    function savePreset(presetName) {
        const reactions = PRESETS[presetName];

        chrome.storage.sync.set({
            selectedPreset: presetName,
            customReactions: reactions
        }, () => {
            console.log('[VK Teams Reactions Settings] Preset saved:', presetName);

            // Update UI
            updatePreview(presetName);
            updateActiveCard(presetName);

            // Notify content script to reload reactions
            getAllTeamsTabs().then(tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'reloadReactions',
                        reactions: reactions
                    }).catch(err => {
                        // Ignore errors for tabs where content script isn't loaded
                        console.log('[VK Teams Reactions Settings] Tab not ready:', tab.id);
                    });
                });
            });
        });
    }

    // === AI Settings ===

    // Load AI config
    function loadAiConfig() {
        chrome.storage.sync.get(['aiConfig'], (result) => {
            if (result.aiConfig) {
                const config = result.aiConfig;
                document.getElementById('aiProvider').value = config.provider || '';
                document.getElementById('aiApiKey').value = config.apiKey || '';
                document.getElementById('aiModel').value = config.model || '';
                document.getElementById('aiTemperature').value = config.temperature || 0.7;
                document.getElementById('aiMaxTokens').value = config.maxTokens || 500;
                document.getElementById('aiAutoSend').checked = config.autoSend || false;

                if (config.provider === 'custom') {
                    if (config.endpoint) {
                        document.getElementById('aiEndpoint').value = config.endpoint;
                    }
                    if (config.format) {
                        document.getElementById('aiFormat').value = config.format;
                    }
                    document.getElementById('customEndpointGroup').style.display = 'block';
                    document.getElementById('customFormatGroup').style.display = 'block';
                }

                updateTemperatureLabel();
                console.log('[VK Teams AI Settings] Config loaded');
            }
        });
    }

    // Update temperature label
    function updateTemperatureLabel() {
        const temperature = document.getElementById('aiTemperature').value;
        const label = document.querySelector('label[for="aiTemperature"]');
        if (label) {
            label.textContent = `Temperature (${temperature})`;
        }
    }

    // Save AI config
    function saveAiConfig() {
        const provider = document.getElementById('aiProvider').value;
        const apiKey = document.getElementById('aiApiKey').value;
        const model = document.getElementById('aiModel').value;
        const temperature = parseFloat(document.getElementById('aiTemperature').value);
        const maxTokens = parseInt(document.getElementById('aiMaxTokens').value);
        const endpoint = document.getElementById('aiEndpoint').value;
        const format = document.getElementById('aiFormat').value;
        const autoSend = document.getElementById('aiAutoSend').checked;

        // Validation
        if (!provider) {
            showAiStatus('Выберите провайдер', 'error');
            return;
        }

        if (!apiKey && provider !== 'ollama') {
            showAiStatus('Введите API ключ', 'error');
            return;
        }

        if (!model) {
            showAiStatus('Введите название модели', 'error');
            return;
        }

        const config = {
            provider: provider,
            apiKey: apiKey,
            model: model,
            temperature: temperature,
            maxTokens: maxTokens,
            autoSend: autoSend
        };

        if (provider === 'custom') {
            if (endpoint) {
                config.endpoint = endpoint;
            }
            if (format) {
                config.format = format;
            }
        }

        chrome.storage.sync.set({ aiConfig: config }, () => {
            console.log('[VK Teams AI Settings] Config saved:', config);
            showAiStatus('✅ Настройки сохранены!', 'success');

            // Notify content script to reload AI
            getAllTeamsTabs().then(tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'reloadAi'
                    }).catch(err => {
                        console.log('[VK Teams AI Settings] Tab not ready:', tab.id);
                    });
                });
            });
        });
    }

    // Show AI status message
    function showAiStatus(message, type) {
        const statusDiv = document.getElementById('aiStatusMessage');
        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.className = 'status-message';
            }, 3000);
        }
    }

    // === Tab switching ===
    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    // === Accordion functionality ===
    function toggleSection(sectionId) {
        const header = document.querySelector(`[data-section="${sectionId}"]`);
        const content = document.getElementById(sectionId);

        if (!header || !content) return;

        const isCollapsed = content.classList.contains('collapsed');

        if (isCollapsed) {
            // Expand
            content.classList.remove('collapsed');
            header.setAttribute('aria-expanded', 'true');
        } else {
            // Collapse
            content.classList.add('collapsed');
            header.setAttribute('aria-expanded', 'false');
        }
    }

    // Initialize accordion sections
    function initializeAccordion() {
        document.querySelectorAll('.section-header').forEach(header => {
            const sectionId = header.getAttribute('data-section');
            const content = document.getElementById(sectionId);

            // Set initial aria-expanded based on collapsed class
            const isCollapsed = content && content.classList.contains('collapsed');
            header.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

            // Add click handler
            header.addEventListener('click', () => {
                toggleSection(sectionId);
            });
        });
    }

    // === Activation System ===

    // Check if extension is activated
    function checkActivation() {
        chrome.storage.sync.get(['extensionActivated'], (result) => {
            const isActivated = result.extensionActivated || false;
            const donationOverlay = document.getElementById('donationOverlay');
            const mainTabs = document.getElementById('mainTabs');
            const presetTab = document.getElementById('presets-tab');
            const aiTab = document.getElementById('ai-tab');

            if (!isActivated) {
                // Show donation overlay, hide main content
                donationOverlay.style.display = 'block';
                mainTabs.style.display = 'none';
                presetTab.style.display = 'none';
                aiTab.style.display = 'none';
            } else {
                // Hide donation overlay, show main content
                donationOverlay.style.display = 'none';
                mainTabs.style.display = 'flex';
            }
        });
    }

    // Activate extension
    function activateExtension() {
        chrome.storage.sync.set({ extensionActivated: true }, () => {
            console.log('[VK Teams Extension] Extension activated!');
            checkActivation();

            // Notify content script
            getAllTeamsTabs().then(tabs => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'extensionActivated'
                    }).catch(err => {
                        console.log('[VK Teams Extension] Tab not ready:', tab.id);
                    });
                });
            });
        });
    }

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[VK Teams Reactions Settings] Popup loaded');

        // Check activation status first
        checkActivation();

        // Activation button handler
        const activateButton = document.getElementById('activateButton');
        if (activateButton) {
            activateButton.addEventListener('click', activateExtension);
        }

        // Load current preset
        loadCurrentPreset();

        // Add click handlers to preset cards
        document.querySelectorAll('.preset-card').forEach(card => {
            card.addEventListener('click', () => {
                const presetName = card.getAttribute('data-preset');
                console.log('[VK Teams Reactions Settings] Preset selected:', presetName);
                savePreset(presetName);
            });
        });

        // Initialize accordion functionality
        initializeAccordion();

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.getAttribute('data-tab');
                switchTab(tabName);

                // Load specific data when switching tabs
                if (tabName === 'recordings') {
                    loadRecordings();
                } else if (tabName === 'settings') {
                    // Load all settings when opening settings tab
                    loadAiConfig();
                    loadCurrentPreset();
                    loadRecordingSettings();
                }
            });
        });

        // Load recordings immediately on startup (since it's the default tab)
        loadRecordings();

        // AI provider change handler
        document.getElementById('aiProvider').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customEndpointGroup');
            const formatGroup = document.getElementById('customFormatGroup');
            if (e.target.value === 'custom') {
                customGroup.style.display = 'block';
                formatGroup.style.display = 'block';
            } else {
                customGroup.style.display = 'none';
                formatGroup.style.display = 'none';
            }

            // Set default models and settings
            const modelInput = document.getElementById('aiModel');
            const endpointInput = document.getElementById('aiEndpoint');
            const formatInput = document.getElementById('aiFormat');
            const temperatureInput = document.getElementById('aiTemperature');
            const maxTokensInput = document.getElementById('aiMaxTokens');
            const apiKeyInput = document.getElementById('aiApiKey');

            const defaults = {
                'openai': {
                    model: 'gpt-4o-mini',
                    temperature: 0.7,
                    maxTokens: 500
                },
                'claude': {
                    model: 'claude-3-5-haiku-20241022',
                    temperature: 0.7,
                    maxTokens: 500
                },
                'gemini': {
                    model: 'gemini-pro',
                    temperature: 0.7,
                    maxTokens: 500
                },
                'ollama': {
                    model: 'llama2',
                    temperature: 0.7,
                    maxTokens: 500
                },
                'custom': {
                    model: '',
                    endpoint: '',
                    apiKey: '',
                    format: 'openai',
                    temperature: 0.5,
                    maxTokens: 4000
                }
            };

            const config = defaults[e.target.value];
            if (config) {
                modelInput.value = config.model;

                if (config.temperature !== undefined) {
                    temperatureInput.value = config.temperature;
                    updateTemperatureLabel();
                }

                if (config.maxTokens !== undefined) {
                    maxTokensInput.value = config.maxTokens;
                }

                // Set custom provider specific settings
                if (e.target.value === 'custom') {
                    if (config.endpoint) {
                        endpointInput.value = config.endpoint;
                    }
                    if (config.format) {
                        formatInput.value = config.format;
                    }
                    if (config.apiKey) {
                        apiKeyInput.value = config.apiKey;
                    }
                }
            }
        });

        // Temperature slider
        document.getElementById('aiTemperature').addEventListener('input', updateTemperatureLabel);

        // Save AI config button
        document.getElementById('saveAiButton').addEventListener('click', saveAiConfig);

        // === Recordings Tab ===

        // Load recording settings
        function loadRecordingSettings() {
            chrome.storage.sync.get(['callRecordingEnabled', 'autoAnswerCalls', 'autoTranscribe', 'useLLMForSpeakers'], (result) => {
                document.getElementById('enableCallRecording').checked = result.callRecordingEnabled || false;
                document.getElementById('autoAnswerCalls').checked = result.autoAnswerCalls || false;
                document.getElementById('autoTranscribe').checked = result.autoTranscribe !== false; // default true
                document.getElementById('useLLMForSpeakers').checked = result.useLLMForSpeakers !== false; // default true
            });
        }

        // Save recording settings
        function saveRecordingSettings() {
            const enabled = document.getElementById('enableCallRecording').checked;
            const autoAnswer = document.getElementById('autoAnswerCalls').checked;
            const autoTranscribe = document.getElementById('autoTranscribe').checked;
            const useLLMForSpeakers = document.getElementById('useLLMForSpeakers').checked;

            chrome.storage.sync.set({
                callRecordingEnabled: enabled,
                autoAnswerCalls: autoAnswer,
                autoTranscribe: autoTranscribe,
                useLLMForSpeakers: useLLMForSpeakers
            }, () => {
                console.log('[VK Teams Recordings] Settings saved');

                // Notify content script
                getAllTeamsTabs().then(tabs => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'reloadRecordingSettings'
                        }).catch(err => {
                            console.log('[VK Teams Recordings] Tab not ready:', tab.id);
                        });
                    });
                });
            });
        }

        // Get active VK Teams tab
        async function getActiveTeamsTab() {
            try {
                const tabs = await getAllTeamsTabs();

                // Debug: log found tabs
                console.log('[VK Teams] Found tabs:', tabs.length);
                tabs.forEach((tab, i) => {
                    console.log(`[VK Teams] Tab ${i + 1}:`, {
                        id: tab.id,
                        url: tab.url,
                        title: tab.title
                    });
                });

                return tabs.length > 0 ? tabs[0] : null;
            } catch (error) {
                console.error('[VK Teams Recordings] Error getting active tab:', error);
                return null;
            }
        }

        // Send message to content script
        async function sendToContentScript(message) {
            const tab = await getActiveTeamsTab();
            if (!tab) {
                throw new Error('VK Teams tab not found. Please open VK Teams.');
            }

            return new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, message, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error(response?.error || 'Unknown error'));
                    }
                });
            });
        }

        // Format duration (ms to mm:ss)
        function formatDuration(ms) {
            const seconds = Math.floor(ms / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }

        // Format size (bytes to KB/MB)
        function formatSize(bytes) {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }

        // Format date (relative for UI)
        function formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays === 1) return 'Yesterday';
            if (diffDays < 7) return `${diffDays}d ago`;

            return date.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        // Format absolute date and time (for file export)
        function formatAbsoluteDateTime(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }

        // Load recording blob
        async function loadRecordingBlob(recordingId) {
            try {
                const response = await sendToContentScript({
                    action: 'getRecordingBlob',
                    recordingId: recordingId
                });

                if (response.success && response.blobData) {
                    return response.blobData; // This is base64 data URL
                }
            } catch (error) {
                console.error('[VK Teams Recordings] Failed to load blob:', error);
            }
            return null;
        }

        // Create recording card HTML
        function createRecordingCard(recording) {
            const card = document.createElement('div');
            card.className = 'recording-card';
            card.dataset.recordingId = recording.id;

            // Build transcription HTML
            let transcriptionHtml = '';
            if (recording.transcription) {
                // Use formatted transcription if available, otherwise raw
                const transcriptionContent = recording.transcriptionFormatted
                    ? formatDialogTranscription(recording.transcriptionFormatted)
                    : `<div class="transcription-text">${escapeHtml(recording.transcription)}</div>`;

                transcriptionHtml = `
                    <div class="recording-transcription transcription-collapsed">
                        <div class="transcription-header">
                            <span class="transcription-toggle"></span>
                            <span>📝 Расшифровка разговора</span>
                        </div>
                        ${transcriptionContent}
                        <div class="transcription-download" data-recording-id="${recording.id}">
                            📥 Скачать текст (.txt)
                        </div>
                    </div>
                `;
            } else if (recording.transcriptionError) {
                transcriptionHtml = `
                    <div class="recording-transcription">
                        <div class="transcription-header">
                            <span>⚠️ Ошибка расшифровки</span>
                        </div>
                        <div class="transcription-status">${escapeHtml(recording.transcriptionError)}</div>
                        <button class="transcription-trigger" data-recording-id="${recording.id}">
                            🔄 Повторить транскрипцию
                        </button>
                    </div>
                `;
            } else {
                // No transcription yet
                transcriptionHtml = `
                    <button class="transcription-trigger" data-recording-id="${recording.id}">
                        🎤 Транскрибировать запись
                    </button>
                `;
            }

            // Format recording title: use date/time as primary identifier
            const recordingDate = new Date(recording.date);
            const dateStr = recordingDate.toLocaleDateString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const timeStr = recordingDate.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const primaryTitle = `Звонок от ${dateStr} в ${timeStr}`;

            // Show participant name as secondary info only if it's valid (not Unknown, not email)
            const isValidName = recording.callerName &&
                                recording.callerName !== 'Unknown' &&
                                recording.callerName !== 'Unknown Caller' &&
                                !recording.callerName.includes('@');
            const participantInfo = isValidName ? `<div class="recording-participant">👤 ${escapeHtml(recording.callerName)}</div>` : '';

            card.innerHTML = `
                <div class="recording-header">
                    <div class="recording-info">
                        <div class="recording-caller">${primaryTitle}</div>
                        ${participantInfo}
                        <div class="recording-meta">
                            <div class="recording-meta-item">
                                <span>⏱️</span>
                                <span>${formatDuration(recording.duration)}</span>
                            </div>
                            <div class="recording-meta-item">
                                <span>💾</span>
                                <span>${formatSize(recording.size)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="recording-actions">
                        <button class="icon-button download" title="Download" data-id="${recording.id}">⬇️</button>
                        <button class="icon-button delete" title="Delete" data-id="${recording.id}">🗑️</button>
                    </div>
                </div>
                <div class="recording-player">
                    <audio controls preload="metadata" src="">
                        Your browser does not support audio playback.
                    </audio>
                </div>
                ${transcriptionHtml}
            `;

            // Add event listeners for buttons
            const downloadBtn = card.querySelector('.download');
            const deleteBtn = card.querySelector('.delete');
            const audioElement = card.querySelector('audio');

            // Load blob immediately for playback
            (async () => {
                const blobUrl = await loadRecordingBlob(recording.id);
                if (blobUrl) {
                    audioElement.src = blobUrl;
                }
            })();

            downloadBtn.addEventListener('click', () => downloadRecording(recording));
            deleteBtn.addEventListener('click', () => deleteRecording(recording.id));

            // Add transcription toggle listener
            const transcriptionHeader = card.querySelector('.transcription-header');
            if (transcriptionHeader) {
                transcriptionHeader.addEventListener('click', () => {
                    const transcriptionDiv = card.querySelector('.recording-transcription');
                    if (transcriptionDiv) {
                        transcriptionDiv.classList.toggle('transcription-collapsed');
                    }
                });
            }

            // Add download transcription listener
            const downloadTranscriptionBtn = card.querySelector('.transcription-download');
            if (downloadTranscriptionBtn) {
                downloadTranscriptionBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Don't toggle collapse
                    downloadTranscriptionAsText(recording);
                });
            }

            // Add manual transcription trigger listener
            const transcriptionTrigger = card.querySelector('.transcription-trigger');
            if (transcriptionTrigger) {
                transcriptionTrigger.addEventListener('click', () => {
                    triggerManualTranscription(recording.id);
                });
            }

            return card;
        }

        // Format transcription as dialog
        function formatDialogTranscription(formattedText) {
            const lines = formattedText.split('\n').filter(line => line.trim());
            let dialogHtml = '<div class="transcription-dialog">';

            for (const line of lines) {
                // Match "Участник N:" or "Speaker N:" or similar patterns
                const match = line.match(/^(Участник\s*\d+|Speaker\s*\d+|Звонящий|Собеседник|Клиент|Оператор):\s*(.+)$/i);

                if (match) {
                    const speaker = match[1].trim();
                    const text = match[2].trim();

                    // Extract speaker number
                    let speakerNumber = 1;
                    const numberMatch = speaker.match(/\d+/);
                    if (numberMatch) {
                        speakerNumber = parseInt(numberMatch[0]);
                    } else if (speaker.includes('2') || speaker.includes('Собеседник') || speaker.includes('Оператор')) {
                        speakerNumber = 2;
                    }

                    // Limit to max 6 speaker classes (fallback to speaker6 for 7+)
                    const speakerClass = `speaker${Math.min(speakerNumber, 6)}`;

                    dialogHtml += `
                        <div class="dialog-message ${speakerClass}">
                            <div class="dialog-speaker">${escapeHtml(speaker)}</div>
                            <div class="dialog-text">${escapeHtml(text)}</div>
                        </div>
                    `;
                }
            }

            dialogHtml += '</div>';
            return dialogHtml;
        }

        // Download transcription as text file
        function downloadTranscriptionAsText(recording) {
            const date = new Date(recording.date);
            const dateStr = date.toISOString().split('T')[0];
            const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
            const callerName = (recording.callerName || 'Unknown').replace(/[^a-zA-Z0-9а-яА-Я]/g, '_');
            const filename = `${callerName}_${dateStr}_${timeStr}_transcription.txt`;

            // Create text content with both versions
            let textContent = `VK Teams - Расшифровка разговора\n`;
            textContent += `Дата: ${formatAbsoluteDateTime(recording.date)}\n`;
            textContent += `Длительность: ${formatDuration(recording.duration)}\n`;
            textContent += `Собеседник: ${recording.callerName || 'Unknown'}\n`;
            textContent += `${'='.repeat(50)}\n\n`;

            if (recording.transcriptionFormatted) {
                textContent += 'ДИАЛОГ:\n\n';
                textContent += recording.transcriptionFormatted.replace(/<[^>]*>/g, '');
                textContent += '\n\n';
                textContent += `${'='.repeat(50)}\n\n`;
            }

            textContent += 'СЫРАЯ ТРАНСКРИПЦИЯ:\n\n';
            textContent += recording.transcription;

            // Create download
            const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Escape HTML to prevent XSS
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Trigger manual transcription
        async function triggerManualTranscription(recordingId) {
            try {
                console.log('[VK Teams Recordings] Triggering manual transcription for:', recordingId);

                // Update button state
                const button = document.querySelector(`.transcription-trigger[data-recording-id="${recordingId}"]`);
                if (button) {
                    button.disabled = true;
                    button.textContent = '⏳ Транскрибируем...';
                }

                // Get tabs with content script
                const tabs = await getAllTeamsTabs();
                if (tabs.length === 0) {
                    throw new Error('VK Teams tab not found');
                }

                // Send transcription request
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'transcribeRecording',
                        recordingId: recordingId
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (!response) {
                            reject(new Error('No response from content script'));
                        } else if (response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response.error));
                        }
                    });
                });

                console.log('[VK Teams Recordings] Transcription completed:', response);

                // Reload recordings to show updated transcription
                await loadRecordings();

            } catch (error) {
                console.error('[VK Teams Recordings] Manual transcription failed:', error);
                alert(`Ошибка транскрипции: ${error.message}`);

                // Reset button state
                const button = document.querySelector(`.transcription-trigger[data-recording-id="${recordingId}"]`);
                if (button) {
                    button.disabled = false;
                    button.textContent = '🔄 Повторить транскрипцию';
                }
            }
        }

        // Download recording
        async function downloadRecording(recording) {
            try {
                // Load blob data
                const blobUrl = await loadRecordingBlob(recording.id);
                if (!blobUrl) {
                    alert('Failed to load recording');
                    return;
                }

                const a = document.createElement('a');
                a.href = blobUrl;

                // Create filename: CallerName_YYYY-MM-DD_HH-MM.webm
                const date = new Date(recording.date);
                const dateStr = date.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
                const callerName = (recording.callerName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_');
                const extension = recording.mimeType.split(';')[0].split('/')[1] || 'webm';

                a.download = `${callerName}_${dateStr}.${extension}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                console.log('[VK Teams Recordings] Downloaded:', recording.id);
            } catch (error) {
                console.error('[VK Teams Recordings] Download failed:', error);
                alert('Failed to download recording');
            }
        }

        // Delete recording
        async function deleteRecording(id) {
            if (!confirm('Delete this recording? This cannot be undone.')) {
                return;
            }

            try {
                await sendToContentScript({
                    action: 'deleteRecording',
                    recordingId: id
                });

                console.log('[VK Teams Recordings] Deleted recording:', id);

                // Reload recordings
                await loadRecordings();
            } catch (error) {
                console.error('[VK Teams Recordings] Failed to delete recording:', error);
                alert('Failed to delete recording: ' + error.message);
            }
        }

        // Delete all recordings
        async function deleteAllRecordings() {
            if (!confirm('Delete ALL recordings? This cannot be undone.')) {
                return;
            }

            try {
                await sendToContentScript({
                    action: 'deleteAllRecordings'
                });

                console.log('[VK Teams Recordings] Deleted all recordings');

                // Reload recordings
                await loadRecordings();
            } catch (error) {
                console.error('[VK Teams Recordings] Failed to delete all recordings:', error);
                alert('Failed to delete all recordings: ' + error.message);
            }
        }

        // Load and display recordings
        async function loadRecordings() {
            console.log('[VK Teams Recordings] Loading recordings...');

            const recordingsList = document.getElementById('recordingsList');
            const recordingsEmpty = document.getElementById('recordingsEmpty');
            const recordingsStats = document.getElementById('recordingsStats');
            const deleteAllButton = document.getElementById('deleteAllButton');

            // Ensure recordingsList exists
            if (!recordingsList) {
                console.error('[VK Teams Recordings] recordingsList element not found in DOM');
                return;
            }

            try {
                // Get recordings and stats from content script
                const [recordingsResponse, statsResponse] = await Promise.all([
                    sendToContentScript({ action: 'getRecordings' }),
                    sendToContentScript({ action: 'getRecordingStats' })
                ]);

                const recordings = recordingsResponse.recordings || [];
                const stats = statsResponse.stats || { count: 0, totalSize: 0, totalDuration: 0 };

                console.log('[VK Teams Recordings] Loaded:', recordings.length, 'recordings');
                console.log('[VK Teams Recordings] Stats:', stats);

                // Clear existing recordings
                recordingsList.innerHTML = '';

                if (recordings.length === 0) {
                    // Show empty state
                    if (recordingsEmpty) recordingsList.appendChild(recordingsEmpty);
                    if (recordingsStats) recordingsStats.style.display = 'none';
                    if (deleteAllButton) deleteAllButton.style.display = 'none';
                } else {
                    // Hide empty state
                    if (recordingsEmpty) recordingsEmpty.style.display = 'none';
                    if (recordingsStats) recordingsStats.style.display = 'block';
                    if (deleteAllButton) deleteAllButton.style.display = 'block';

                    // Update stats
                    const statsCount = document.getElementById('statsCount');
                    const statsSize = document.getElementById('statsSize');
                    const statsDuration = document.getElementById('statsDuration');

                    if (statsCount) statsCount.textContent = stats.count;
                    if (statsSize) statsSize.textContent = formatSize(stats.totalSize);
                    if (statsDuration) statsDuration.textContent = formatDuration(stats.totalDuration);

                    // Create and append recording cards
                    recordings.forEach(recording => {
                        const card = createRecordingCard(recording);
                        recordingsList.appendChild(card);
                    });
                }
            } catch (error) {
                console.error('[VK Teams Recordings] Failed to load recordings:', error);

                // Ensure recordingsList exists
                if (!recordingsList) {
                    console.error('[VK Teams Recordings] recordingsList element not found');
                    return;
                }

                // Check if it's a "tab not found" error
                const isTabNotFound = error.message.includes('VK Teams tab not found') ||
                                     error.message.includes('tab') ||
                                     error.message.includes('not found');

                // Show error message
                if (isTabNotFound) {
                    recordingsList.innerHTML = `
                        <div style="text-align: center; padding: 30px 20px; color: #dc3545;">
                            <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                            <div style="font-weight: 600; margin-bottom: 10px;">VK Teams tab not found</div>
                            <div style="font-size: 12px; color: #666; line-height: 1.6; margin-bottom: 15px;">
                                Extension doesn't work with installed web apps (PWA)
                            </div>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: left; font-size: 11px; line-height: 1.8;">
                                <div style="font-weight: 600; margin-bottom: 8px;">How to fix:</div>
                                <div>1️⃣ Open new browser tab</div>
                                <div>2️⃣ Go to: <strong>webim.teams.your-organization.com</strong></div>
                                <div>3️⃣ Reload this popup</div>
                                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6; color: #888;">
                                    💡 Don't use installed app - open in regular browser tab
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    recordingsList.innerHTML = `
                        <div style="text-align: center; padding: 40px 20px; color: #dc3545;">
                            <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                            <div style="font-weight: 600; margin-bottom: 5px;">Failed to load recordings</div>
                            <div style="font-size: 11px;">${error.message}</div>
                        </div>
                    `;
                }
            }
        }

        // Recording settings change handlers
        document.getElementById('enableCallRecording').addEventListener('change', saveRecordingSettings);
        document.getElementById('autoAnswerCalls').addEventListener('change', saveRecordingSettings);
        document.getElementById('autoTranscribe').addEventListener('change', saveRecordingSettings);
        document.getElementById('useLLMForSpeakers').addEventListener('change', saveRecordingSettings);

        // Delete all button
        document.getElementById('deleteAllButton').addEventListener('click', deleteAllRecordings);

        // Load recording settings on startup
        loadRecordingSettings();
    });
})();
