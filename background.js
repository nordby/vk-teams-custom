// VK Teams Custom Reactions - Background Service Worker
// Handles AI API requests to bypass CORS

console.log('[VK Teams AI Background] Service worker loaded');

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[VK Teams AI Background] Message received:', message);

    if (message.action === 'aiRequest') {
        console.log('[VK Teams AI Background] Received AI request:', message.provider);

        // Make API request
        makeAiRequest(message)
            .then(result => {
                sendResponse({ success: true, result: result });
            })
            .catch(error => {
                console.error('[VK Teams AI Background] Error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Will respond asynchronously
    }

    if (message.action === 'audioTranscription') {
        console.log('[VK Teams AI Background] Received audio transcription request');

        // Make transcription request
        makeTranscriptionRequest(message)
            .then(result => {
                sendResponse({ success: true, result: result });
            })
            .catch(error => {
                console.error('[VK Teams AI Background] Transcription error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Will respond asynchronously
    }

    if (message.action === 'chatCompletion') {
        console.log('[VK Teams AI Background] Received chat completion request');

        // Make chat completion request using custom API
        makeCustomRequest(message.config, message.prompt, null)
            .then(result => {
                sendResponse({ success: true, result: result });
            })
            .catch(error => {
                console.error('[VK Teams AI Background] Chat completion error:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // Will respond asynchronously
    }
});

// Make AI API request based on provider
async function makeAiRequest(request) {
    const { provider, config, prompt, context } = request;
    console.log('[VK Teams AI Background] Making AI request for provider:', provider);

    try {
        switch (provider) {
        case 'openai':
            return await makeOpenAIRequest(config, prompt, context);
        case 'claude':
            return await makeClaudeRequest(config, prompt, context);
        case 'gemini':
            return await makeGeminiRequest(config, prompt, context);
        case 'ollama':
            return await makeOllamaRequest(config, prompt, context);
        case 'custom':
            return await makeCustomRequest(config, prompt, context);
        default:
            throw new Error(`Unknown provider: ${provider}`);
        }
    } catch (error) {
        console.error('[VK Teams AI Background] Error in makeAiRequest:', error);
        console.error('[VK Teams AI Background] Error stack:', error.stack);
        throw error;
    }
}

// OpenAI API
async function makeOpenAIRequest(config, prompt, context) {
    const messages = [];
    if (context) {
        messages.push({ role: 'user', content: context });
    }
    messages.push({ role: 'user', content: prompt });

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model || 'gpt-3.5-turbo',
                messages: messages,
                temperature: config.temperature || 0.7,
                max_tokens: config.maxTokens || 500
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] OpenAI error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`OpenAI API error (${response.status}): ${error.error?.message || errorText}`);
            } catch (e) {
                if (e.message.startsWith('OpenAI API error')) {
                    throw e;
                }
                throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();
        return {
            text: data.choices[0].message.content,
            usage: {
                prompt_tokens: data.usage.prompt_tokens,
                completion_tokens: data.usage.completion_tokens,
                total_tokens: data.usage.total_tokens
            }
        };
    } catch (error) {
        if (error.message.startsWith('OpenAI API error')) {
            throw error;
        }
        // Network errors, CORS, etc.
        throw new Error(`OpenAI network error: ${error.message}`);
    }
}

// Claude API
async function makeClaudeRequest(config, prompt, context) {
    console.log('[VK Teams AI Background] Making Claude request...');
    console.log('[VK Teams AI Background] Config:', { model: config.model, hasApiKey: !!config.apiKey });

    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    try {
        console.log('[VK Teams AI Background] Fetching from Claude API...');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: config.model || 'claude-3-5-haiku-20241022',
                messages: [{ role: 'user', content: fullPrompt }],
                temperature: config.temperature || 0.7,
                max_tokens: config.maxTokens || 500
            })
        });

        console.log('[VK Teams AI Background] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] Claude error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`Claude API error (${response.status}): ${error.error?.message || errorText}`);
            } catch (e) {
                if (e.message.startsWith('Claude API error')) {
                    throw e;
                }
                throw new Error(`Claude API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();
        console.log('[VK Teams AI Background] Success! Response:', data);
        return {
            text: data.content[0].text,
            usage: {
                prompt_tokens: data.usage.input_tokens,
                completion_tokens: data.usage.output_tokens,
                total_tokens: data.usage.input_tokens + data.usage.output_tokens
            }
        };
    } catch (error) {
        if (error.message.startsWith('Claude API error')) {
            throw error;
        }
        // Network errors, CORS, etc.
        throw new Error(`Claude network error: ${error.message}`);
    }
}

// Gemini API
async function makeGeminiRequest(config, prompt, context) {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
    const model = config.model || 'gemini-pro';

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {
                    temperature: config.temperature || 0.7,
                    maxOutputTokens: config.maxTokens || 500
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] Gemini error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`Gemini API error (${response.status}): ${error.error?.message || errorText}`);
            } catch (e) {
                if (e.message.startsWith('Gemini API error')) {
                    throw e;
                }
                throw new Error(`Gemini API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();
        return {
            text: data.candidates[0].content.parts[0].text,
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    } catch (error) {
        if (error.message.startsWith('Gemini API error')) {
            throw error;
        }
        // Network errors, CORS, etc.
        throw new Error(`Gemini network error: ${error.message}`);
    }
}

// Ollama API (Local)
async function makeOllamaRequest(config, prompt, context) {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
    const endpoint = config.endpoint || 'http://localhost:11434/api/generate';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model || 'llama2',
                prompt: fullPrompt,
                temperature: config.temperature || 0.7,
                stream: false
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] Ollama error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`Ollama API error (${response.status}): ${error.error || errorText}`);
            } catch (e) {
                if (e.message.startsWith('Ollama API error')) {
                    throw e;
                }
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();
        return {
            text: data.response,
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        };
    } catch (error) {
        if (error.message.startsWith('Ollama API error')) {
            throw error;
        }
        // Network errors - часто означает что Ollama не запущен
        throw new Error(`Ollama network error: ${error.message}. Убедитесь что Ollama запущен на ${endpoint}`);
    }
}

// Custom API
async function makeCustomRequest(config, prompt, context) {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    // Determine request format (simple or OpenAI-compatible)
    const format = config.format || 'simple';
    let requestBody;

    if (format === 'openai') {
        // OpenAI-compatible format
        // Add system message to suppress thinking/reasoning output
        const messages = [
            {
                role: 'system',
                content: 'Ты должен отвечать напрямую, без показа внутренних рассуждений. Не используй теги <thinking> или подобные. Сразу давай финальный ответ.'
            },
            {
                role: 'user',
                content: fullPrompt
            }
        ];

        requestBody = {
            model: config.model,
            messages: messages,
            temperature: config.temperature || 0.7,
            max_tokens: config.maxTokens || 500,
            // Try multiple parameter variations for disabling thinking
            enable_thinking: false,
            stream_thinking: false,
            show_reasoning: false
        };
    } else {
        // Simple format (default)
        requestBody = {
            prompt: fullPrompt,
            temperature: config.temperature || 0.7,
            max_tokens: config.maxTokens || 500,
            enable_thinking: false,
            stream_thinking: false,
            show_reasoning: false
        };

        // Include model if specified
        if (config.model) {
            requestBody.model = config.model;
        }
    }

    // Debug logging to see exact request
    console.log('[VK Teams AI Background] Custom API request:', {
        endpoint: config.endpoint,
        model: config.model,
        format: format,
        body: requestBody
    });

    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json',
            ...(config.headers || {})
        };

        // Add Authorization header if API key is provided
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] Custom API error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`Custom API error (${response.status}): ${error.error || error.message || error.detail || errorText}`);
            } catch (e) {
                if (e.message.startsWith('Custom API error')) {
                    throw e;
                }
                throw new Error(`Custom API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();

        // Debug: log raw response
        console.log('[VK Teams AI Background] Custom API raw response:', data);

        // Parse response based on format
        let text;
        if (format === 'openai') {
            // OpenAI format: choices[0].message.content
            text = data.choices?.[0]?.message?.content || data.response || data.text || data.content;
        } else {
            // Simple format: response, text, or content
            text = data.response || data.text || data.content || data.choices?.[0]?.message?.content;
        }

        // Remove thinking tags and their content (for models that use reasoning tags)
        // This removes everything between <think> and </think> tags
        if (text) {
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        }

        console.log('[VK Teams AI Background] Extracted text (after cleaning):', text);

        return {
            text: text,
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: data.usage?.completion_tokens || 0,
                total_tokens: data.usage?.total_tokens || 0
            }
        };
    } catch (error) {
        if (error.message.startsWith('Custom API error')) {
            throw error;
        }
        // Network errors, CORS, etc.
        throw new Error(`Custom API network error: ${error.message}. Проверьте доступность endpoint: ${config.endpoint}`);
    }
}

// Audio Transcription API (OpenAI Whisper compatible)
async function makeTranscriptionRequest(request) {
    const { endpoint, apiKey, model, audioData, audioType, language, prompt, responseFormat } = request;

    console.log('[VK Teams AI Background] ★★★ Making transcription request:', {
        endpoint,
        hasApiKey: !!apiKey,
        model,
        base64AudioSize: audioData.length,
        audioType,
        language,
        timestamp: new Date().toISOString()
    });

    try {
        // Convert base64 to Blob
        const audioBlob = base64ToBlob(audioData, audioType);

        console.log('[VK Teams AI Background] ★★★ Converted base64 to blob:', {
            blobSize: audioBlob.size,
            blobType: audioBlob.type,
            base64Size: audioData.length,
            timestamp: new Date().toISOString()
        });

        // Create FormData for multipart/form-data upload
        const formData = new FormData();
        // Use unique filename to prevent API caching issues
        const uniqueFilename = `recording_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.webm`;
        formData.append('file', audioBlob, uniqueFilename);
        formData.append('model', model);

        if (language) {
            formData.append('language', language);
        }

        if (prompt) {
            formData.append('prompt', prompt);
        }

        if (responseFormat) {
            formData.append('response_format', responseFormat);
        }

        // Build headers
        const headers = {};
        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        console.log('[VK Teams AI Background] ★★★ Sending transcription request:', {
            endpoint,
            filename: uniqueFilename,
            blobSize: audioBlob.size,
            model,
            language,
            timestamp: new Date().toISOString()
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[VK Teams AI Background] Transcription error response:', errorText);
            let error;
            try {
                error = JSON.parse(errorText);
                throw new Error(`Transcription API error (${response.status}): ${error.error?.message || errorText}`);
            } catch (e) {
                if (e.message.startsWith('Transcription API error')) {
                    throw e;
                }
                throw new Error(`Transcription API error (${response.status}): ${errorText}`);
            }
        }

        const data = await response.json();

        console.log('[VK Teams AI Background] ★★★ Transcription API response received:', {
            fullResponse: data,
            textLength: data.text?.length || 0,
            textPreview: data.text?.substring(0, 100) + '...',
            textFull: data.text,
            language: data.language,
            duration: data.duration,
            hasSegments: !!(data.segments && data.segments.length > 0),
            segmentsCount: data.segments?.length || 0,
            timestamp: new Date().toISOString()
        });

        return {
            text: data.text,
            language: data.language,
            duration: data.duration,
            segments: data.segments || []
        };
    } catch (error) {
        if (error.message.startsWith('Transcription API error')) {
            throw error;
        }
        // Network errors, CORS, etc.
        throw new Error(`Transcription network error: ${error.message}`);
    }
}

// Helper: Convert base64 to Blob
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}
