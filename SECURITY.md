# Security & Privacy Information

## 🔒 Clean Version

This is a **sanitized version** of the VK Teams Custom Reactions extension with all sensitive data removed.

## 🚫 Removed Secrets

The following sensitive data has been removed from this distribution:

### 1. API Keys (popup.js)
- **Custom AI API Key** - Replaced with empty string
- **Custom API endpoint** - Replaced with empty string
- **Model name** - Replaced with empty string

**Location**: `popup.js:416-423`

```javascript
// BEFORE (contained hardcoded token):
'custom': {
    model: 'ExampleModel',
    endpoint: 'https://example-api.com/v1/completions',
    apiKey: 'sk-XXXXXXXXXXXXXXXXXXXXXXX',  // ❌ REMOVED
    format: 'openai',
    temperature: 0.5,
    maxTokens: 4000
}

// AFTER (clean version):
'custom': {
    model: '',
    endpoint: '',
    apiKey: '',
    format: 'openai',
    temperature: 0.5,
    maxTokens: 4000
}
```

### 2. User Credentials (Documentation)
- **AIMSID examples** - Replaced with `YOUR_AIMSID_HERE`
- **Email addresses** - Replaced with placeholders
- **Chat IDs** - Replaced with `YOUR_CHAT_ID@chat.agent`

**Locations**: `README.md:95`, `INSTALL.md:191`

## ✅ How to Use This Extension

### Before First Use

1. **Configure AI Provider** (Optional):
   - Open extension popup
   - Go to Settings tab
   - Select your AI provider (OpenAI, Claude, Gemini, Ollama, or Custom)
   - Enter your **own** API key
   - Save settings

2. **Set Custom Endpoint** (If using Custom API):
   - In Settings, select "Custom API"
   - Enter your API endpoint URL
   - Enter your API key
   - Configure model name and parameters
   - Save settings

3. **Enable Call Recording** (Optional):
   - Open extension popup
   - Go to Settings tab
   - Enable "Call Recording"
   - Configure transcription settings
   - Save settings

### Security Best Practices

#### ✅ DO:
- Store API keys in extension settings (chrome.storage)
- Use environment-specific configurations
- Keep your API keys private
- Review code before installing
- Use HTTPS for all API endpoints

#### ❌ DON'T:
- Hardcode API keys in source code
- Share your AIMSID or API keys
- Commit secrets to version control
- Use production keys in development
- Share your chrome.storage data

## 🔐 Data Storage

This extension stores the following data **locally in your browser**:

### Chrome Storage (chrome.storage.sync):
- Custom reaction presets
- AI provider configuration (API keys, models, endpoints)
- Call recording settings
- Extension activation status

### IndexedDB:
- Call recordings (audio blobs)
- Call metadata (date, duration, caller name)
- Transcriptions

**Privacy**: All data stays on your device. Nothing is sent to third parties except:
- AI API requests (to your configured provider)
- VK Teams RAPI requests (to VK Teams servers)

## 🛡️ Permissions Explained

This extension requires the following permissions:

```json
{
  "permissions": [
    "activeTab",        // Access to current tab
    "cookies",          // Read AIMSID cookie for authentication
    "storage",          // Store settings
    "unlimitedStorage"  // Store call recordings
  ],
  "host_permissions": [
    "https://teams.your-organization.com/*",              // VK Teams domain
    "https://*.teams.your-organization.com/*",            // VK Teams subdomains
    "https://api.openai.com/*",               // OpenAI API
    "https://api.anthropic.com/*",            // Claude API
    "https://generativelanguage.googleapis.com/*", // Gemini API
    "http://localhost:11434/*",               // Local Ollama
    "https://*/*"                             // Custom API endpoints
  ]
}
```

## 🚨 Security Checklist

Before installing this extension:

- [ ] Review all source code
- [ ] Verify no hardcoded secrets
- [ ] Check permissions list
- [ ] Understand data storage
- [ ] Configure your own API keys
- [ ] Test in development first

## 📝 Reporting Security Issues

If you find security vulnerabilities:

1. **DO NOT** open a public issue
2. Contact the maintainer privately
3. Provide detailed information
4. Wait for fix before disclosure

## 🔄 Updates

This clean version should be used as a **template** for your own deployment.

**To update**:
1. Pull latest changes from source
2. Re-sanitize secrets
3. Add your configuration
4. Test before deploying

## 📄 License

Same as original project (MIT)

## ⚠️ Disclaimer

This extension:
- Is provided "as is" without warranty
- Requires manual configuration
- Stores data locally on your device
- Makes API calls to external services (if configured)
- Works only with VK Teams domains

**Use at your own risk**. Always review code before installing browser extensions.

---

**Last Updated**: 2025-11-10
**Clean Version**: 1.1.0
