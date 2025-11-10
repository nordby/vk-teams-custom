# Setup Guide

## 🔧 Configuration for Your Organization

This extension is configured to work with specific VK Teams domains. Follow this guide to set it up for your organization.

## Step 1: Update Domain Names

### In `manifest.json`

Replace the domain names with your organization's VK Teams domains:

```json
{
  "host_permissions": [
    "https://teams.YOUR-ORG.com/*",              // Replace with your main domain
    "https://*.teams.YOUR-ORG.com/*",            // Wildcard subdomain
    "https://webim.teams.YOUR-ORG.com/*",        // Web interface
    "https://u.teams.YOUR-ORG.com/*",            // API endpoint
    "https://ub.teams.YOUR-ORG.com/*",           // Backup API
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
    "https://generativelanguage.googleapis.com/*",
    "http://localhost:11434/*",
    "https://*/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://teams.YOUR-ORG.com/*",          // Replace
        "https://*.teams.YOUR-ORG.com/*",        // Replace
        "https://webim.teams.YOUR-ORG.com/*"     // Replace
      ],
      ...
    }
  ]
}
```

### In `content.js`

Update the RAPI URL (line 11):

```javascript
const RAPI_URL = 'https://u.teams.YOUR-ORG.com';  // Replace with your API domain
const RAPI_API_VERSION = '125';  // Check your VK Teams API version
```

### In `popup.js`

Update the domain patterns (lines 16-20):

```javascript
const patterns = [
    '*://teams.YOUR-ORG.com/*',              // Replace
    '*://*.teams.YOUR-ORG.com/*',            // Replace
    '*://webim.teams.YOUR-ORG.com/*'         // Replace
];
```

And the error message (line 1047):

```javascript
<div>2️⃣ Go to: <strong>webim.teams.YOUR-ORG.com</strong></div>
```

## Step 2: Configure API Keys (Optional)

If you want to use AI features:

1. **Open the extension**
2. **Go to Settings tab**
3. **Select AI Provider**:
   - OpenAI
   - Claude (Anthropic)
   - Google Gemini
   - Ollama (local)
   - Custom API
4. **Enter your API key**
5. **Configure model and parameters**
6. **Save**

**IMPORTANT**: Never commit API keys to version control!

## Step 3: Find Your VK Teams Domains

### Method 1: Check Your Browser

1. Open VK Teams in your browser
2. Look at the URL bar
3. Note the domain pattern (e.g., `webim.teams.example.com`)

### Method 2: Check Network Tab

1. Open VK Teams
2. Press `F12` (DevTools)
3. Go to **Network** tab
4. Look for API requests
5. Note the domain used for API calls (usually `u.teams.YOUR-ORG.com`)

### Method 3: Ask Your IT/Admin

Your organization's IT team should know:
- Web interface URL
- API endpoint URL
- API version

## Step 4: Test Configuration

1. **Load the extension**:
   ```
   chrome://extensions/ → Developer Mode → Load unpacked
   ```

2. **Open VK Teams** in a new tab

3. **Check console** (`F12` → Console):
   ```
   [VK Teams Custom Reactions] Extension loaded!
   [VK Teams Custom Reactions] AIMSID found
   [VK Teams Custom Reactions] Initialized successfully
   ```

4. **Test reactions**:
   - Hover over a message
   - Click the reaction button
   - Select an emoji
   - Verify it appears

## Step 5: API Version

Check your VK Teams API version:

1. Open DevTools (`F12`)
2. Go to **Network** tab
3. Find API requests to `/api/v{VERSION}/rapi/...`
4. Note the version number
5. Update in `content.js`:
   ```javascript
   const RAPI_API_VERSION = '125';  // Replace with your version
   ```

## Configuration Files

### CONFIG.example.json

Use this as a template for your configuration:

```json
{
  "vk_teams_domains": {
    "main": "teams.your-organization.com",
    "webim": "webim.teams.your-organization.com",
    "api": "u.teams.your-organization.com",
    "backup_api": "ub.teams.your-organization.com"
  },
  "api_version": "125",
  "custom_reactions": ["👍", "🤡", "🤦", "🔥", "💩", "✨"]
}
```

## Troubleshooting

### Extension doesn't load

- Check that domain names in `manifest.json` match your VK Teams URLs
- Verify content_scripts matches patterns are correct
- Reload extension: `chrome://extensions/` → Reload

### AIMSID not found

- Make sure you're logged in to VK Teams
- Check cookies: `F12` → Application → Cookies
- Look for `aimsid` cookie
- If missing, log out and log back in

### Reactions don't work

- Check API URL in `content.js`
- Verify API version matches your VK Teams instance
- Check console for error messages
- Verify network requests in DevTools

### Call recording doesn't work

- Check host_permissions in manifest.json
- Verify getUserMedia permissions in browser
- Check console for WebRTC errors

## Security Notes

### ⚠️ Important

- **Never commit**:
  - API keys
  - AIMSID cookies
  - Organization domain names (if sensitive)
  - User emails or credentials

- **Always use**:
  - Environment-specific configuration
  - Placeholder domains in public repos
  - Secure storage for API keys (chrome.storage)

- **Before deploying**:
  - Review all code
  - Test in development first
  - Verify permissions
  - Document your changes

## Distribution

### Internal Use

For internal organization use:
1. Configure domains
2. Test thoroughly
3. Package extension
4. Distribute via:
   - Internal Chrome Web Store
   - Group Policy deployment
   - Manual installation guide

### Public Use

For public distribution:
1. Remove all organization-specific data
2. Use generic placeholders
3. Provide configuration guide
4. Add setup instructions
5. Test with multiple organizations

## Support

For help with setup:
1. Check [INSTALL.md](./INSTALL.md)
2. Review [SECURITY.md](./SECURITY.md)
3. Check console logs
4. Create an issue with:
   - Error messages
   - Console logs
   - Steps to reproduce

---

**Last Updated**: 2025-11-10
**Version**: 1.1.0
