// VK Teams Custom Reactions - Content Script
// This runs in the context of VK Teams page

(function() {
    'use strict';

    console.log('[VK Teams Custom Reactions] Extension loaded!');
    console.log('[VK Teams Custom Reactions] URL:', window.location.href);

    // Configuration
    const RAPI_URL = 'https://u.teams.your-organization.com';
    const RAPI_API_VERSION = '125';
    const DEFAULT_REACTIONS = ['👍', '🤡', '🤦', '🔥', '💩', '✨'];

    // State
    let aimsid = null;
    let activePopup = null;
    let CUSTOM_REACTIONS = [...DEFAULT_REACTIONS];
    let aiManager = null;

    // === Utility Functions ===

    /**
     * Load custom reactions from storage
     */
    function loadCustomReactions() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['customReactions'], (result) => {
                if (result.customReactions && Array.isArray(result.customReactions)) {
                    CUSTOM_REACTIONS = result.customReactions;
                    console.log('[VK Teams Custom Reactions] Loaded reactions from storage:', CUSTOM_REACTIONS);
                } else {
                    CUSTOM_REACTIONS = [...DEFAULT_REACTIONS];
                    console.log('[VK Teams Custom Reactions] Using default reactions:', CUSTOM_REACTIONS);
                }
                resolve();
            });
        });
    }

    /**
     * Listen for messages from popup
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'reloadReactions' && message.reactions) {
            console.log('[VK Teams Custom Reactions] Reloading reactions:', message.reactions);
            CUSTOM_REACTIONS = message.reactions;

            // Close any open popup
            if (activePopup) {
                try {
                    activePopup.remove();
                } catch (e) {
                    console.error('[VK Teams Custom Reactions] Error removing popup:', e);
                }
                activePopup = null;
            }

            sendResponse({ success: true });
        }

        if (message.action === 'reloadAi') {
            console.log('[VK Teams AI] Reloading AI config...');
            if (aiManager) {
                aiManager.init().then(() => {
                    console.log('[VK Teams AI] AI config reloaded');
                    // Reprocess messages to add/remove AI buttons
                    processMessages();
                    sendResponse({ success: true });
                });
            } else {
                sendResponse({ success: false, error: 'AI Manager not initialized' });
            }
            return true; // Will respond asynchronously
        }

        if (message.action === 'extensionActivated') {
            console.log('[VK Teams Extension] Received activation notification. Reinitializing...');
            // Reinitialize extension after activation
            init();
            sendResponse({ success: true });
            return true;
        }
    });

    /**
     * Get AIMSID from cookies or localStorage
     */
    function getAIMSID() {
        console.log('[VK Teams Custom Reactions] Searching for AIMSID...');

        // Try cookies first
        console.log('[VK Teams Custom Reactions] Checking cookies...');
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'aimsid') {
                console.log('[VK Teams Custom Reactions] AIMSID found in cookies!');
                return value;
            }
        }

        // Try localStorage
        console.log('[VK Teams Custom Reactions] Checking localStorage...');
        try {
            const localStorageKeys = Object.keys(localStorage);
            console.log('[VK Teams Custom Reactions] localStorage keys:', localStorageKeys);

            for (let key of localStorageKeys) {
                const value = localStorage.getItem(key);
                if (key.includes('aimsid') || (value && value.includes('aimsid'))) {
                    console.log('[VK Teams Custom Reactions] Found aimsid-related key:', key);
                }

                // Check if value contains aimsid pattern
                if (value && typeof value === 'string') {
                    // Pattern: numbers.numbers.numbers:email
                    const aimsidPattern = /\d{3}\.\d+\.\d+:[a-zA-Z0-9.@_-]+/;
                    const match = value.match(aimsidPattern);
                    if (match) {
                        console.log('[VK Teams Custom Reactions] AIMSID found in localStorage key:', key);
                        return match[0];
                    }
                }
            }
        } catch (e) {
            console.error('[VK Teams Custom Reactions] Error reading localStorage:', e);
        }

        // Try sessionStorage
        console.log('[VK Teams Custom Reactions] Checking sessionStorage...');
        try {
            const sessionStorageKeys = Object.keys(sessionStorage);
            console.log('[VK Teams Custom Reactions] sessionStorage keys:', sessionStorageKeys);

            for (let key of sessionStorageKeys) {
                const value = sessionStorage.getItem(key);
                if (key.includes('aimsid') || (value && value.includes('aimsid'))) {
                    console.log('[VK Teams Custom Reactions] Found aimsid-related key:', key);
                }

                // Check if value contains aimsid pattern
                if (value && typeof value === 'string') {
                    const aimsidPattern = /\d{3}\.\d+\.\d+:[a-zA-Z0-9.@_-]+/;
                    const match = value.match(aimsidPattern);
                    if (match) {
                        console.log('[VK Teams Custom Reactions] AIMSID found in sessionStorage key:', key);
                        return match[0];
                    }
                }
            }
        } catch (e) {
            console.error('[VK Teams Custom Reactions] Error reading sessionStorage:', e);
        }

        console.warn('[VK Teams Custom Reactions] AIMSID not found anywhere');
        return null;
    }

    /**
     * Generate UUID for request ID
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Show notification
     */
    function showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#4CAF50' : '#f44336'};
            color: white;
            border-radius: 4px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Set reaction via RAPI
     */
    function setReaction(messageId, chatId, reaction) {
        if (!aimsid) {
            showNotification('❌ AIMSID not found', 'error');
            return;
        }

        // Create body with msgId as string, then manually convert to number in JSON
        const bodyForLog = {
            reqId: generateUUID(),
            aimsid: aimsid,
            params: {
                msgId: messageId,
                chatId: chatId,
                reactions: CUSTOM_REACTIONS,
                reaction: reaction
            }
        };

        console.log('[VK Teams Custom Reactions] Setting reaction:', { messageId, chatId, reaction });
        console.log('[VK Teams Custom Reactions] Request body (before serialization):', bodyForLog);

        // Manually construct JSON to preserve large integer precision
        const reqId = generateUUID();
        const jsonBody = `{"reqId":"${reqId}","aimsid":"${aimsid}","params":{"msgId":${messageId},"chatId":"${chatId}","reactions":${JSON.stringify(CUSTOM_REACTIONS)},"reaction":"${reaction}"}}`;

        console.log('[VK Teams Custom Reactions] JSON body:', jsonBody);

        fetch(`${RAPI_URL}/api/v${RAPI_API_VERSION}/rapi/reaction/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/plain'
            },
            body: jsonBody
        })
        .then(response => {
            console.log('[VK Teams Custom Reactions] HTTP Status:', response.status);
            return response.text();
        })
        .then(text => {
            console.log('[VK Teams Custom Reactions] Response text:', text);
            const data = JSON.parse(text);
            console.log('[VK Teams Custom Reactions] Parsed response:', data);
            const statusCode = data.status?.code;

            if (statusCode === 50000 || statusCode === 20000) {
                showNotification(`✅ Reaction ${reaction} set!`);
            } else if (statusCode === 40000) {
                console.error('[VK Teams Custom Reactions] Error 40000 - Invalid request or parameters');
                console.error('[VK Teams Custom Reactions] Full response:', JSON.stringify(data, null, 2));
                showNotification(`❌ Error 40000: ${data.status?.message || 'Invalid request'}`, 'error');
            } else {
                console.error('[VK Teams Custom Reactions] Unexpected code:', statusCode);
                console.error('[VK Teams Custom Reactions] Full response:', JSON.stringify(data, null, 2));
                showNotification(`⚠️ Code: ${statusCode}`, 'error');
            }
        })
        .catch(error => {
            console.error('[VK Teams Custom Reactions] Error:', error);
            showNotification('❌ Network error', 'error');
        });
    }

    /**
     * Create emoji popup
     */
    function createEmojiPopup(messageElement, messageId, chatId, buttonElement) {
        console.log('[VK Teams Custom Reactions] Creating popup for message:', messageId);

        // Close existing popup if any
        if (activePopup) {
            console.log('[VK Teams Custom Reactions] Closing existing popup');
            try {
                activePopup.remove();
            } catch (e) {
                console.error('[VK Teams Custom Reactions] Error removing popup:', e);
            }
            activePopup = null;
        }

        const popup = document.createElement('div');
        popup.className = 'vkteams-custom-reactions-popup';
        popup.style.cssText = `
            position: fixed;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 12px;
            z-index: 10000;
            display: flex;
            gap: 8px;
        `;

        CUSTOM_REACTIONS.forEach(emoji => {
            const button = document.createElement('button');
            button.textContent = emoji;
            button.style.cssText = `
                font-size: 24px;
                border: none;
                background: transparent;
                cursor: pointer;
                padding: 8px;
                border-radius: 4px;
                transition: background 0.2s;
            `;

            button.addEventListener('mouseenter', () => {
                button.style.background = '#f0f0f0';
            });

            button.addEventListener('mouseleave', () => {
                button.style.background = 'transparent';
            });

            button.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[VK Teams Custom Reactions] Emoji clicked:', emoji);
                setReaction(messageId, chatId, emoji);
                try {
                    popup.remove();
                } catch (err) {
                    console.error('[VK Teams Custom Reactions] Error removing popup:', err);
                }
                activePopup = null;
            });

            popup.appendChild(button);
        });

        // Position popup next to the button
        const buttonRect = buttonElement.getBoundingClientRect();

        // Try to position to the right of the button
        let left = buttonRect.right + 10;
        let top = buttonRect.top;

        // Check if popup would go off screen on the right
        const popupWidth = 300; // approximate
        if (left + popupWidth > window.innerWidth) {
            // Position to the left of button instead
            left = buttonRect.left - popupWidth - 10;
        }

        // Make sure it's not off screen on the left
        if (left < 10) {
            left = 10;
        }

        // Make sure it's not off screen vertically
        const popupHeight = 60; // approximate
        if (top + popupHeight > window.innerHeight) {
            top = window.innerHeight - popupHeight - 10;
        }
        if (top < 10) {
            top = 10;
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        // Append popup to body
        document.body.appendChild(popup);
        activePopup = popup;
        console.log('[VK Teams Custom Reactions] Popup created at:', { left, top });

        setTimeout(() => {
            document.addEventListener('click', function closePopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    activePopup = null;
                    document.removeEventListener('click', closePopup);
                }
            });
        }, 100);
    }

    /**
     * Create AI popup window
     */
    function createAiPopup(action, result, messageElement, chatId) {
        // Close existing popup if any
        if (activePopup) {
            try {
                activePopup.remove();
            } catch (e) {
                console.error('[VK Teams AI] Error removing popup:', e);
            }
            activePopup = null;
        }

        const popup = document.createElement('div');
        popup.className = 'vkteams-ai-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            padding: 20px;
            z-index: 10000;
            min-width: 400px;
            max-width: 600px;
            max-height: 70vh;
            overflow-y: auto;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e0e0e0;
        `;

        const actionIconsSvg = {
            'smart-reply': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M10 2.5a7.5 7.5 0 0 0-6.928 10.438l-.904 2.714a.417.417 0 0 0 .514.514l2.713-.905A7.5 7.5 0 1 0 10 2.5zm-3.333 7.917a.833.833 0 1 1-1.667 0 .833.833 0 0 1 1.667 0zm3.333 0a.833.833 0 1 1-1.667 0 .833.833 0 0 1 1.667 0zm3.333 0a.833.833 0 1 1-1.666 0 .833.833 0 0 1 1.666 0z"/></svg>',
            'summarize': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" fill-rule="evenodd" d="M4.375 5.833c0-.345.28-.625.625-.625h10a.625.625 0 1 1 0 1.25H5a.625.625 0 0 1-.625-.625zm0 4.167c0-.345.28-.625.625-.625h10a.625.625 0 1 1 0 1.25H5A.625.625 0 0 1 4.375 10zm0 4.167c0-.345.28-.625.625-.625h6a.625.625 0 1 1 0 1.25H5a.625.625 0 0 1-.625-.625z" clip-rule="evenodd"/></svg>',
            'translate': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" fill-rule="evenodd" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM10.625 3.789a6.25 6.25 0 0 1 5.586 5.586h-2.878c-.175-1.788-.683-3.342-1.404-4.45a11.51 11.51 0 0 1-1.304-1.136zm-1.25 0v5.586H6.667c.175-1.788.683-3.342 1.404-4.45a11.51 11.51 0 0 0 1.304-1.136zm0 6.836v5.586a11.51 11.51 0 0 1-1.304-1.136c-.721-1.108-1.229-2.662-1.404-4.50h2.708zm1.25 0h2.708c-.175 1.788-.683 3.342-1.404 4.45a11.51 11.51 0 0 1-1.304 1.136v-5.586zm2.708-1.25h-2.708V3.789c.489.327.923.715 1.304 1.136.721 1.108 1.229 2.662 1.404 4.45zm-6.666 0h2.708V3.789a11.51 11.51 0 0 0-1.304 1.136c-.721 1.108-1.229 2.662-1.404 4.45zm0 1.25H3.789a6.25 6.25 0 0 0 5.586 5.586v-5.586H6.667zm6.666 0v5.586a6.25 6.25 0 0 0 5.586-5.586h-5.586z" clip-rule="evenodd"/></svg>',
            'change-tone': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M9.167 2.5a.625.625 0 0 1 .625.625v13.75a.625.625 0 1 1-1.25 0V3.125A.625.625 0 0 1 9.167 2.5zm-4.167 4.167a.625.625 0 0 1 .625.625v6.666a.625.625 0 1 1-1.25 0V7.292a.625.625 0 0 1 .625-.625zm8.333-1.667a.625.625 0 0 1 .625.625v9.167a.625.625 0 1 1-1.25 0V5.625a.625.625 0 0 1 .625-.625zM2.5 8.333a.625.625 0 0 1 .625.625v1.667a.625.625 0 1 1-1.25 0V8.958a.625.625 0 0 1 .625-.625zm15 -1.666a.625.625 0 0 1 .625.625v5a.625.625 0 1 1-1.25 0v-5a.625.625 0 0 1 .625-.625z"/></svg>',
            'explain-manager': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" fill-rule="evenodd" d="M10 4.792a2.708 2.708 0 1 0 0 5.416 2.708 2.708 0 0 0 0-5.416zM8.542 7.5a1.458 1.458 0 1 1 2.916 0 1.458 1.458 0 0 1-2.916 0z" clip-rule="evenodd"/><path fill="currentColor" d="M3.125 17.5a6.875 6.875 0 0 1 13.75 0 .625.625 0 1 1-1.25 0 5.625 5.625 0 0 0-11.25 0 .625.625 0 1 1-1.25 0z"/></svg>',
            'custom-prompt': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 20 20" style="display: inline-block; vertical-align: middle; margin-right: 8px;"><path fill="currentColor" d="M4.167 5.625a.625.625 0 0 1 .625-.625h10.416a.625.625 0 1 1 0 1.25H4.792a.625.625 0 0 1-.625-.625zm0 4.167a.625.625 0 0 1 .625-.625h10.416a.625.625 0 1 1 0 1.25H4.792a.625.625 0 0 1-.625-.625zm.625 3.541a.625.625 0 1 0 0 1.25h6.25a.625.625 0 1 0 0-1.25h-6.25z"/></svg>'
        };

        const actionTitles = {
            'smart-reply': 'Умный ответ',
            'summarize': 'Краткое изложение',
            'translate': 'Перевод',
            'change-tone': 'Изменить тон',
            'explain-manager': 'Для менеджера',
            'custom-prompt': 'Свой промпт'
        };

        const title = document.createElement('div');
        title.style.cssText = 'font-size: 18px; font-weight: 600; color: #333; display: flex; align-items: center;';
        title.innerHTML = `${actionIconsSvg[action]}<span>${actionTitles[action]}</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            border: none;
            background: transparent;
            font-size: 20px;
            cursor: pointer;
            color: #999;
            padding: 4px 8px;
            border-radius: 4px;
        `;
        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#f0f0f0';
        });
        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = 'transparent';
        });
        closeBtn.addEventListener('click', () => {
            popup.remove();
            activePopup = null;
        });

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            margin-bottom: 16px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            font-size: 14px;
            line-height: 1.6;
            color: #333;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;
        content.textContent = result.text;

        // Usage info (if available)
        const usageDiv = document.createElement('div');
        if (result.usage && result.usage.total_tokens > 0) {
            usageDiv.style.cssText = `
                font-size: 11px;
                color: #999;
                margin-top: 8px;
                text-align: right;
            `;
            usageDiv.textContent = `Tokens: ${result.usage.total_tokens}`;
            content.appendChild(usageDiv);
        }

        // Buttons
        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        `;

        const buttonStyle = `
            padding: 10px 20px;
            border-radius: 6px;
            border: none;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        `;

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.textContent = 'Копировать';
        copyBtn.style.cssText = buttonStyle + `
            background: #e0e0e0;
            color: #333;
        `;
        copyBtn.addEventListener('mouseenter', () => {
            copyBtn.style.background = '#d0d0d0';
        });
        copyBtn.addEventListener('mouseleave', () => {
            copyBtn.style.background = '#e0e0e0';
        });
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(result.text);
            copyBtn.textContent = 'Скопировано!';
            setTimeout(() => {
                copyBtn.textContent = 'Копировать';
            }, 2000);
        });

        // Send button
        const sendBtn = document.createElement('button');
        sendBtn.textContent = 'Отправить';
        sendBtn.style.cssText = buttonStyle + `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        `;
        sendBtn.addEventListener('mouseenter', () => {
            sendBtn.style.opacity = '0.9';
        });
        sendBtn.addEventListener('mouseleave', () => {
            sendBtn.style.opacity = '1';
        });
        sendBtn.addEventListener('click', () => {
            // Try multiple selectors to find the input field (ProseMirror editor)
            let inputField = document.querySelector('.ProseMirror[contenteditable="true"]');

            if (!inputField) {
                inputField = document.querySelector('[role="textbox"][contenteditable="true"]');
            }

            if (!inputField) {
                inputField = document.querySelector('.InputPanelContentEditable__field-BooXx');
            }

            if (!inputField) {
                inputField = document.querySelector('[data-testid="inputPanel__field"]');
            }

            if (!inputField) {
                inputField = document.querySelector('.im-textfield_rich[contenteditable="true"]');
            }

            if (!inputField) {
                // Log all potential input fields for debugging
                console.log('[VK Teams AI] Looking for input field...');
                const allEditables = document.querySelectorAll('[contenteditable="true"]');
                console.log('[VK Teams AI] Found contenteditable elements:', allEditables.length);
                allEditables.forEach((el, i) => {
                    console.log(`[VK Teams AI] Element ${i}:`, el.className, el);
                });
            }

            if (inputField) {
                // For ProseMirror, we need to manipulate the paragraph element inside
                let targetElement = inputField.querySelector('p');
                if (!targetElement) {
                    targetElement = inputField;
                }

                // Clear existing content
                targetElement.innerHTML = '';

                // Insert text as text nodes
                const textNode = document.createTextNode(result.text);
                targetElement.appendChild(textNode);

                // Focus the field
                inputField.focus();

                // Move cursor to end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(targetElement);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);

                // Trigger input event to notify VK Teams/ProseMirror
                const inputEvent = new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: result.text
                });
                inputField.dispatchEvent(inputEvent);

                showNotification('✅ Текст вставлен в поле ввода');
                console.log('[VK Teams AI] Text inserted successfully into ProseMirror');

                // Auto-send if enabled
                chrome.storage.sync.get(['aiConfig'], (result) => {
                    if (result.aiConfig && result.aiConfig.autoSend) {
                        console.log('[VK Teams AI] Auto-send enabled, clicking send button');

                        // Find and click the send button
                        setTimeout(() => {
                            const sendButton = document.querySelector('[data-testid="sendButton"]') ||
                                              document.querySelector('.common__send-uRrhw') ||
                                              document.querySelector('button[data-title-type="scheduleMessage"]');

                            if (sendButton) {
                                sendButton.click();
                                console.log('[VK Teams AI] Send button clicked');
                            } else {
                                console.error('[VK Teams AI] Send button not found');
                            }
                        }, 100); // Small delay to ensure text is fully inserted
                    }
                });
            } else {
                console.error('[VK Teams AI] Could not find input field');
                showNotification('❌ Не удалось найти поле ввода', 'error');
            }
            popup.remove();
            activePopup = null;
        });

        buttons.appendChild(copyBtn);
        buttons.appendChild(sendBtn);

        popup.appendChild(header);
        popup.appendChild(content);
        popup.appendChild(buttons);

        document.body.appendChild(popup);
        activePopup = popup;

        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', function closeAiPopup(e) {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    activePopup = null;
                    document.removeEventListener('click', closeAiPopup);
                }
            });
        }, 100);
    }

    /**
     * Show loading popup
     */
    function showLoadingPopup(action) {
        if (activePopup) {
            try {
                activePopup.remove();
            } catch (e) {
                console.error('[VK Teams AI] Error removing popup:', e);
            }
        }

        const popup = document.createElement('div');
        popup.className = 'vkteams-ai-loading-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            padding: 40px;
            z-index: 10000;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 40px;
            height: 40px;
            border: 4px solid #f0f0f0;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        `;

        const text = document.createElement('div');
        text.style.cssText = 'font-size: 14px; color: #666;';
        text.textContent = 'Генерация ответа...';

        popup.appendChild(spinner);
        popup.appendChild(text);

        document.body.appendChild(popup);
        activePopup = popup;

        return popup;
    }

    /**
     * Handle AI action
     */
    async function handleAiAction(action, messageElement, chatId) {
        console.log('[VK Teams AI] AI action:', action);

        if (!aiManager || !aiManager.isConfigured()) {
            showNotification('⚠️ AI не настроен. Откройте настройки расширения.', 'error');
            return;
        }

        // Get message text - try multiple selectors
        let messageTextElement = messageElement.querySelector('.im-message__bubble-text');
        if (!messageTextElement) {
            messageTextElement = messageElement.querySelector('.im-message-text');
        }
        if (!messageTextElement) {
            messageTextElement = messageElement.querySelector('[class*="message"][class*="text"]');
        }
        if (!messageTextElement) {
            messageTextElement = messageElement.querySelector('[class*="bubble"]');
        }

        if (!messageTextElement) {
            console.error('[VK Teams AI] Could not find message text element. Message HTML:', messageElement.innerHTML);
            showNotification('❌ Не удалось получить текст сообщения', 'error');
            return;
        }

        const messageText = messageTextElement.textContent.trim();
        if (!messageText) {
            showNotification('❌ Сообщение пустое', 'error');
            return;
        }

        console.log('[VK Teams AI] Message text:', messageText.substring(0, 100));

        // Show loading
        const loadingPopup = showLoadingPopup(action);

        try {
            let result;

            switch (action) {
                case 'smart-reply':
                    result = await aiManager.generateSmartReply(messageText);
                    break;
                case 'summarize':
                    result = await aiManager.summarizeMessage(messageText);
                    break;
                case 'translate':
                    result = await aiManager.translateMessage(messageText);
                    break;
                case 'change-tone':
                    // Show tone selection dialog
                    const toneChoice = prompt(
                        'Выберите тональность для переписывания сообщения:\n\n' +
                        '1 - Формальный (официальный, вежливый)\n' +
                        '2 - Неформальный (расслабленный, простой)\n' +
                        '3 - Дружелюбный (тёплый, позитивный)\n\n' +
                        'Введите номер (1-3):'
                    );

                    if (!toneChoice) {
                        // User cancelled
                        if (loadingPopup && loadingPopup.parentNode) {
                            loadingPopup.parentNode.removeChild(loadingPopup);
                        }
                        return;
                    }

                    // Map choice to tone
                    const toneMap = {
                        '1': 'formal',
                        '2': 'casual',
                        '3': 'friendly'
                    };

                    const selectedTone = toneMap[toneChoice.trim()] || 'friendly';
                    result = await aiManager.changeTone(messageText, selectedTone);
                    break;
                case 'explain-manager':
                    result = await aiManager.explainForManager(messageText);
                    break;
                case 'custom-prompt':
                    // Show prompt input dialog
                    const customPrompt = prompt('Введите ваш промпт для AI (текст сообщения будет добавлен автоматически):');
                    if (!customPrompt) {
                        // User cancelled
                        if (loadingPopup && loadingPopup.parentNode) {
                            loadingPopup.parentNode.removeChild(loadingPopup);
                        }
                        return;
                    }
                    result = await aiManager.customPrompt(messageText, customPrompt);
                    break;
            }

            // Remove loading popup
            if (loadingPopup && loadingPopup.parentNode) {
                loadingPopup.remove();
            }

            // Show result popup
            createAiPopup(action, result, messageElement, chatId);

        } catch (error) {
            console.error('[VK Teams AI] Error:', error);

            // Remove loading popup
            if (loadingPopup && loadingPopup.parentNode) {
                loadingPopup.remove();
            }

            showNotification(`❌ Ошибка: ${error.message}`, 'error');
        }
    }

    /**
     * Add reaction button to a message
     */
    function addReactionButton(messageElement) {
        if (messageElement.querySelector('.vkteams-custom-reaction-btn')) {
            return;
        }

        const messageId = messageElement.getAttribute('data-arch-id');
        const chatId = messageElement.getAttribute('data-parent-chat-sn');

        if (!messageId || !chatId) {
            return;
        }

        // Find the quick menu block container
        const quickMenuBlock = messageElement.querySelector('.im-quick-menu-block');
        if (!quickMenuBlock) {
            // Quick menu block not found - this is normal for system messages, old messages, etc.
            return;
        }

        // Create button styled like native quick menu items
        const button = document.createElement('div');
        button.className = 'vkteams-custom-reaction-btn';
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zm-1.25 3.125a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0zm7.5 0a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0zM5.625 10a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm8.75 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM10 13.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z"/></svg>';
        button.title = 'Add custom reaction';
        button.style.cssText = `
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border-radius: 6px;
            transition: color 0.2s ease;
            width: 24px;
            height: 24px;
            color: #818c99;
        `;

        const svg = button.querySelector('svg');
        if (svg) {
            svg.style.cssText = `
                display: block;
                width: 20px;
                height: 20px;
            `;
        }

        // Add hover effect like native buttons
        button.addEventListener('mouseenter', () => {
            button.style.color = '#3f8ae0';
        });

        button.addEventListener('mouseleave', () => {
            button.style.color = '#818c99';
        });

        button.addEventListener('click', (e) => {
            console.log('[VK Teams Custom Reactions] Button clicked!', messageId);
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            createEmojiPopup(messageElement, messageId, chatId, button);
        }, true);

        // Add button to quick menu block
        quickMenuBlock.appendChild(button);

        // Add AI buttons if AI is configured
        if (aiManager && aiManager.isConfigured()) {
            addAiButtons(messageElement, messageId, chatId, quickMenuBlock);
        }
        // AI not configured - AI buttons will not be added
    }

    /**
     * Add AI buttons to quick menu
     */
    function addAiButtons(messageElement, messageId, chatId, quickMenuBlock) {
        // Check if AI buttons already added
        if (messageElement.querySelector('.vkteams-ai-btn')) {
            return;
        }

        const aiActionsSvg = {
            'smart-reply': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" d="M10 2.5a7.5 7.5 0 0 0-6.928 10.438l-.904 2.714a.417.417 0 0 0 .514.514l2.713-.905A7.5 7.5 0 1 0 10 2.5zm-3.333 7.917a.833.833 0 1 1-1.667 0 .833.833 0 0 1 1.667 0zm3.333 0a.833.833 0 1 1-1.667 0 .833.833 0 0 1 1.667 0zm3.333 0a.833.833 0 1 1-1.666 0 .833.833 0 0 1 1.666 0z"/></svg>',
            'summarize': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" fill-rule="evenodd" d="M4.375 5.833c0-.345.28-.625.625-.625h10a.625.625 0 1 1 0 1.25H5a.625.625 0 0 1-.625-.625zm0 4.167c0-.345.28-.625.625-.625h10a.625.625 0 1 1 0 1.25H5A.625.625 0 0 1 4.375 10zm0 4.167c0-.345.28-.625.625-.625h6a.625.625 0 1 1 0 1.25H5a.625.625 0 0 1-.625-.625z" clip-rule="evenodd"/></svg>',
            'translate': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" fill-rule="evenodd" d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM10.625 3.789a6.25 6.25 0 0 1 5.586 5.586h-2.878c-.175-1.788-.683-3.342-1.404-4.45a11.51 11.51 0 0 1-1.304-1.136zm-1.25 0v5.586H6.667c.175-1.788.683-3.342 1.404-4.45a11.51 11.51 0 0 0 1.304-1.136zm0 6.836v5.586a11.51 11.51 0 0 1-1.304-1.136c-.721-1.108-1.229-2.662-1.404-4.45h2.708zm1.25 0h2.708c-.175 1.788-.683 3.342-1.404 4.45a11.51 11.51 0 0 1-1.304 1.136v-5.586zm2.708-1.25h-2.708V3.789c.489.327.923.715 1.304 1.136.721 1.108 1.229 2.662 1.404 4.45zm-6.666 0h2.708V3.789a11.51 11.51 0 0 0-1.304 1.136c-.721 1.108-1.229 2.662-1.404 4.45zm0 1.25H3.789a6.25 6.25 0 0 0 5.586 5.586v-5.586H6.667zm6.666 0v5.586a6.25 6.25 0 0 0 5.586-5.586h-5.586z" clip-rule="evenodd"/></svg>',
            'change-tone': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" d="M9.167 2.5a.625.625 0 0 1 .625.625v13.75a.625.625 0 1 1-1.25 0V3.125A.625.625 0 0 1 9.167 2.5zm-4.167 4.167a.625.625 0 0 1 .625.625v6.666a.625.625 0 1 1-1.25 0V7.292a.625.625 0 0 1 .625-.625zm8.333-1.667a.625.625 0 0 1 .625.625v9.167a.625.625 0 1 1-1.25 0V5.625a.625.625 0 0 1 .625-.625zM2.5 8.333a.625.625 0 0 1 .625.625v1.667a.625.625 0 1 1-1.25 0V8.958a.625.625 0 0 1 .625-.625zm15 -1.666a.625.625 0 0 1 .625.625v5a.625.625 0 1 1-1.25 0v-5a.625.625 0 0 1 .625-.625z"/></svg>',
            'explain-manager': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" fill-rule="evenodd" d="M10 4.792a2.708 2.708 0 1 0 0 5.416 2.708 2.708 0 0 0 0-5.416zM8.542 7.5a1.458 1.458 0 1 1 2.916 0 1.458 1.458 0 0 1-2.916 0z" clip-rule="evenodd"/><path fill="currentColor" d="M3.125 17.5a6.875 6.875 0 0 1 13.75 0 .625.625 0 1 1-1.25 0 5.625 5.625 0 0 0-11.25 0 .625.625 0 1 1-1.25 0z"/></svg>',
            'custom-prompt': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path fill="currentColor" d="M4.167 5.625a.625.625 0 0 1 .625-.625h10.416a.625.625 0 1 1 0 1.25H4.792a.625.625 0 0 1-.625-.625zm0 4.167a.625.625 0 0 1 .625-.625h10.416a.625.625 0 1 1 0 1.25H4.792a.625.625 0 0 1-.625-.625zm.625 3.541a.625.625 0 1 0 0 1.25h6.25a.625.625 0 1 0 0-1.25h-6.25z"/></svg>'
        };

        const aiActions = [
            { action: 'smart-reply', title: 'Умный ответ' },
            { action: 'summarize', title: 'Кратко' },
            { action: 'translate', title: 'Перевести' },
            { action: 'change-tone', title: 'Изменить тон' },
            { action: 'explain-manager', title: 'Для менеджера' },
            { action: 'custom-prompt', title: 'Свой промпт' }
        ];

        aiActions.forEach(({ action, title }) => {
            const aiButton = document.createElement('div');
            aiButton.className = 'vkteams-ai-btn';
            aiButton.setAttribute('data-ai-action', action);
            aiButton.innerHTML = aiActionsSvg[action];
            aiButton.title = title;
            aiButton.style.cssText = `
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                background: transparent;
                border-radius: 6px;
                transition: color 0.2s ease;
                width: 24px;
                height: 24px;
                color: #818c99;
            `;

            // Style the SVG
            const svg = aiButton.querySelector('svg');
            if (svg) {
                svg.style.cssText = `
                    display: block;
                    width: 20px;
                    height: 20px;
                `;
            }

            // Add hover effect
            aiButton.addEventListener('mouseenter', () => {
                aiButton.style.color = '#3f8ae0';
            });

            aiButton.addEventListener('mouseleave', () => {
                aiButton.style.color = '#818c99';
            });

            // Add click handler
            aiButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log('[VK Teams AI] AI button clicked:', action);
                handleAiAction(action, messageElement, chatId);
            }, true);

            quickMenuBlock.appendChild(aiButton);
        });
    }

    /**
     * Process all messages
     */
    function processMessages() {
        const messages = document.querySelectorAll('.imMessage, .im-message');
        console.log('[VK Teams Custom Reactions] Found messages:', messages.length);

        messages.forEach(messageElement => {
            addReactionButton(messageElement);
        });
    }

    /**
     * Initialize
     */
    async function init() {
        console.log('[VK Teams Custom Reactions] Initializing...');

        // Check if extension is activated
        const activationStatus = await new Promise(resolve => {
            chrome.storage.sync.get(['extensionActivated'], (result) => {
                resolve(result.extensionActivated || false);
            });
        });

        if (!activationStatus) {
            console.log('[VK Teams Extension] Extension not activated. Functionality blocked.');
            return; // Stop initialization
        }

        console.log('[VK Teams Extension] Extension activated. Initializing...');

        // Load custom reactions from storage first
        await loadCustomReactions();

        // Initialize AI Manager
        if (window.VKTeamsAI && window.VKTeamsAI.AIManager) {
            aiManager = new window.VKTeamsAI.AIManager();
            await aiManager.init();
            console.log('[VK Teams AI] AI Manager initialized');
        } else {
            console.warn('[VK Teams AI] AI Provider module not loaded');
        }

        aimsid = getAIMSID();

        if (!aimsid) {
            console.warn('[VK Teams Custom Reactions] AIMSID not found');
        } else {
            console.log('[VK Teams Custom Reactions] AIMSID found');
        }

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }

            @keyframes spin {
                0% {
                    transform: rotate(0deg);
                }
                100% {
                    transform: rotate(360deg);
                }
            }
        `;
        document.head.appendChild(style);

        // Process existing messages
        processMessages();

        // Watch for new messages
        const observer = new MutationObserver(() => {
            processMessages();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log('[VK Teams Custom Reactions] Initialized successfully');

        // Initialize Call Recording
        initCallRecording();
    }

    // Initialize Call Recording Manager
    async function initCallRecording() {
        try {
            // Check if call recording modules are available
            if (!window.VKTeamsCallRecording || !window.VKTeamsCallRecording.CallRecordingManager) {
                // Modules not loaded yet
                return;
            }

            const { CallRecordingManager } = window.VKTeamsCallRecording;
            const manager = new CallRecordingManager();
            await manager.init();

            // Store manager globally for access from other parts
            window.VKTeamsCallRecordingManagerInstance = manager;

            console.log('[VK Teams CallRecording] Initialized successfully');
        } catch (error) {
            console.error('[VK Teams CallRecording] Initialization failed:', error);
        }
    }

    // Handle messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'reloadRecordingSettings') {
            console.log('[VK Teams CallRecording] Reloading settings...');

            // Reinitialize with new settings
            if (window.VKTeamsCallRecordingManagerInstance) {
                window.VKTeamsCallRecordingManagerInstance.loadSettings().then(settings => {
                    window.VKTeamsCallRecordingManagerInstance.isEnabled = settings.callRecordingEnabled;
                    window.VKTeamsCallRecordingManagerInstance.autoAnswer = settings.autoAnswerCalls;

                    if (settings.callRecordingEnabled) {
                        window.VKTeamsCallRecordingManagerInstance.start();
                    } else {
                        window.VKTeamsCallRecordingManagerInstance.stop();
                    }
                });
            }
        }

        // Handle getRecordings request from popup
        if (message.action === 'getRecordings') {
            console.log('[VK Teams CallRecording] Getting recordings...');

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.getRecordings()
                        .then(recordings => {
                            console.log('[VK Teams CallRecording] Retrieved recordings:', recordings.length);

                            // Convert blobs to base64 for transfer
                            const recordingsWithData = recordings.map(rec => ({
                                ...rec,
                                blobData: null // Will be loaded on demand
                            }));

                            sendResponse({ success: true, recordings: recordingsWithData });
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error getting recordings:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }

        // Handle getRecordingBlob request from popup
        if (message.action === 'getRecordingBlob' && message.recordingId) {
            console.log('[VK Teams CallRecording] Getting recording blob:', message.recordingId);

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.getRecording(message.recordingId)
                        .then(recording => {
                            if (recording && recording.blob) {
                                // Convert blob to base64
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    sendResponse({
                                        success: true,
                                        blobData: reader.result,
                                        mimeType: recording.mimeType
                                    });
                                };
                                reader.onerror = () => {
                                    sendResponse({ success: false, error: 'Failed to read blob' });
                                };
                                reader.readAsDataURL(recording.blob);
                            } else {
                                sendResponse({ success: false, error: 'Recording not found' });
                            }
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error getting recording blob:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }

        // Handle getRecordingStats request from popup
        if (message.action === 'getRecordingStats') {
            console.log('[VK Teams CallRecording] Getting recording stats...');

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.getStats()
                        .then(stats => {
                            console.log('[VK Teams CallRecording] Retrieved stats:', stats);
                            sendResponse({ success: true, stats: stats });
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error getting stats:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }

        // Handle deleteRecording request from popup
        if (message.action === 'deleteRecording' && message.recordingId) {
            console.log('[VK Teams CallRecording] Deleting recording:', message.recordingId);

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.deleteRecording(message.recordingId)
                        .then(() => {
                            console.log('[VK Teams CallRecording] Recording deleted');
                            sendResponse({ success: true });
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error deleting recording:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }

        // Handle transcribeRecording request from popup
        if (message.action === 'transcribeRecording' && message.recordingId) {
            console.log('[VK Teams CallRecording] Transcribing recording:', message.recordingId);

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.getRecording(message.recordingId)
                        .then(async (recording) => {
                            if (!recording || !recording.blob) {
                                throw new Error('Recording not found or has no audio data');
                            }

                            // Transcribe the recording
                            await window.VKTeamsCallRecordingManagerInstance.transcribeRecording(
                                message.recordingId,
                                recording.blob
                            );

                            console.log('[VK Teams CallRecording] Transcription completed for:', message.recordingId);
                            sendResponse({ success: true });
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error transcribing recording:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }

        // Handle deleteAllRecordings request from popup
        if (message.action === 'deleteAllRecordings') {
            console.log('[VK Teams CallRecording] Deleting all recordings...');

            if (window.VKTeamsCallRecordingManagerInstance) {
                const storageManager = window.VKTeamsCallRecordingManagerInstance.getStorageManager();

                if (storageManager) {
                    storageManager.deleteAllRecordings()
                        .then(() => {
                            console.log('[VK Teams CallRecording] All recordings deleted');
                            sendResponse({ success: true });
                        })
                        .catch(error => {
                            console.error('[VK Teams CallRecording] Error deleting all recordings:', error);
                            sendResponse({ success: false, error: error.message });
                        });
                } else {
                    sendResponse({ success: false, error: 'Storage manager not initialized' });
                }
            } else {
                sendResponse({ success: false, error: 'Recording manager not initialized' });
            }

            return true; // Will respond asynchronously
        }
    });

    // Wait for page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Give page time to render
        setTimeout(init, 2000);
    }
})();
