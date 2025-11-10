# Whisper API Integration

## 🎙️ Audio Transcription with Whisper

This extension supports audio transcription using OpenAI Whisper-compatible APIs.

## How It Works

### 1. Configuration

The extension uses the **Custom API** settings for transcription:

1. Open extension settings
2. Select **Custom API** provider
3. Enter your API endpoint (e.g., `https://your-api.com/v1/chat/completions`)
4. Enter your API key
5. Save

The transcription endpoint is automatically derived:
```
https://your-api.com/v1/chat/completions
↓ automatically converts to ↓
https://your-api.com/v1/audio/transcriptions
```

### 2. Audio Flow

```
[Call Recording]
    ↓
[Audio Blob (WebM)]
    ↓
[Convert to Base64]
    ↓
[Send to Background Script]
    ↓
[Convert Base64 → Blob]
    ↓
[FormData multipart/form-data]
    ↓
[POST to Whisper API]
    ↓
[Return Transcription]
    ↓
[Save to IndexedDB]
```

### 3. API Request Format

**Endpoint**: `POST /v1/audio/transcriptions`

**Headers**:
```http
Authorization: Bearer YOUR_API_KEY
Content-Type: multipart/form-data
```

**Body** (FormData):
```javascript
{
  file: [audio blob],           // WebM audio file
  model: "whisper-1",            // Or your model name
  language: "ru",                // Optional: language hint
  response_format: "json"        // json, text, srt, vtt
}
```

### 4. API Response Format

**Standard JSON Response**:
```json
{
  "text": "Full transcription of the audio",
  "language": "ru",
  "duration": 123.45,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 5.5,
      "text": "First phrase",
      "tokens": [123, 456, ...],
      "temperature": 0.0
    }
  ]
}
```

## Supported APIs

### OpenAI Whisper
```javascript
endpoint: "https://api.openai.com/v1/audio/transcriptions"
model: "whisper-1"
```

### Custom Whisper-compatible
Any API that implements the OpenAI Whisper format:
```javascript
endpoint: "https://your-api.com/v1/audio/transcriptions"
model: "your-model-name"
```

## Code Structure

### 1. AudioTranscription Class (`modules/call-recording/audio-transcription.js`)

Manages transcription configuration and requests:

```javascript
class AudioTranscription {
    constructor() {
        this.apiEndpoint = null;
        this.apiKey = null;
        this.model = 'whisper-1'; // Default model
    }

    async init() {
        // Load config from chrome.storage
        // Build transcription endpoint
    }

    async transcribe(audioBlob, options = {}) {
        // Convert blob → base64
        // Send to background script
        // Return transcription
    }
}
```

### 2. Background Script (`background.js`)

Handles API requests (bypasses CORS):

```javascript
async function makeTranscriptionRequest(request) {
    // Convert base64 → Blob
    const audioBlob = base64ToBlob(audioData, audioType);

    // Create FormData
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', model);
    formData.append('language', language);
    formData.append('response_format', responseFormat);

    // Send to API
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
    });

    return await response.json();
}
```

### 3. Call Recording Manager

Coordinates recording and transcription:

```javascript
async saveRecording(recordingData) {
    // Save audio to IndexedDB
    const saved = await storageManager.saveRecording(recordingData);

    // Auto-transcribe if enabled
    if (this.autoTranscribe && this.audioTranscription.isAvailable()) {
        this.transcribeRecording(saved.id, recordingData.blob);
    }
}
```

## Configuration Options

### In Extension Settings

- **Provider**: Custom API
- **API Key**: Your Whisper API key
- **Endpoint**: Base URL (automatically converts to transcription endpoint)
- **Model**: Model name (default: `whisper-1`)

### Audio Settings

- **Language**: `ru` (Russian) by default
- **Response Format**: `json` (includes segments)
- **Auto-transcribe**: Enable/disable automatic transcription
- **Use LLM for speakers**: Enable/disable speaker identification

## Customization

### Change Default Model

Edit `modules/call-recording/audio-transcription.js`:
```javascript
constructor() {
    this.model = 'your-model-name'; // Change here
}
```

### Add Prompt (Context)

Pass prompt in transcription options:
```javascript
await transcribe(audioBlob, {
    prompt: "This is a business call about...",
    language: 'ru',
    responseFormat: 'json'
});
```

### Custom Response Processing

Modify `background.js` function `makeTranscriptionRequest`:
```javascript
// Custom response parsing
const data = await response.json();
return {
    text: data.text,
    custom_field: data.custom_field, // Add your fields
    // ...
};
```

## Troubleshooting

### Transcription Not Working

1. **Check Configuration**:
   - Custom API provider selected
   - API key entered
   - Endpoint configured

2. **Check Console Logs**:
   ```
   [VK Teams AudioTranscription] Configured: { endpoint, hasApiKey }
   [VK Teams AI Background] Making transcription request
   ```

3. **Verify API Endpoint**:
   - Should end with `/v1/audio/transcriptions`
   - Test with curl:
     ```bash
     curl -X POST https://your-api.com/v1/audio/transcriptions \
       -H "Authorization: Bearer YOUR_KEY" \
       -F "file=@test.webm" \
       -F "model=whisper-1"
     ```

### Common Errors

**"Transcription service not configured"**
- Solution: Configure Custom API in settings

**"Extension context invalidated"**
- Solution: Reload VK Teams page (F5)

**"Transcription API error (401)"**
- Solution: Check API key is valid

**"Transcription API error (413)"**
- Solution: Audio file too large (check API limits)

## Performance

### Audio Size Limits

- Most APIs: 25MB max file size
- Typical call recording: 1-5MB (5-30 minutes)
- Base64 encoding adds ~33% overhead

### Processing Time

- 1 minute audio ≈ 2-5 seconds processing
- Depends on API performance
- Background processing doesn't block UI

## Security

### Data Flow

1. ✅ Audio recorded locally
2. ✅ Stored in IndexedDB (local)
3. ⚠️ Sent to API for transcription
4. ✅ Transcription saved locally
5. ❌ No data sent to third parties (except your configured API)

### Best Practices

- ✅ Use HTTPS endpoints only
- ✅ Store API keys in chrome.storage (encrypted)
- ✅ Never commit API keys to version control
- ⚠️ Audio is sent to external API (your configured endpoint)
- ✅ User consent required for recording

## API Compatibility

This integration is compatible with:

- ✅ OpenAI Whisper API
- ✅ Any Whisper-compatible API
- ✅ Self-hosted Whisper servers
- ✅ Custom transcription services

**Requirements**:
- Accepts multipart/form-data
- `file` parameter for audio
- `model` parameter for model name
- Returns JSON with `text` field

## Future Enhancements

Potential improvements:

- [ ] Support multiple API providers simultaneously
- [ ] Streaming transcription for long calls
- [ ] Custom model configuration per recording
- [ ] Automatic language detection
- [ ] Speaker diarization improvements
- [ ] Real-time transcription during call

---

**Version**: 1.1.0
**Last Updated**: 2025-11-10
