# Azure Speech Services Setup

## What Was Added

### 1. Azure TTS Serverless Function
**File**: [api/azure-tts.ts](api/azure-tts.ts)

- Accepts text and language from frontend
- Calls Azure Speech Services with server-side API key
- Returns MP3 audio as base64
- Uses high-quality neural voices

### 2. Updated TTS Service
**File**: [services/ttsService.ts](services/ttsService.ts)

- Primary: Azure Speech Services (high-quality neural voices)
- Fallback: Browser Web Speech API (if Azure fails)
- Automatic audio playback from serverless function
- Proper cancellation and cleanup

### 3. Voice Configuration

**Supported Languages & Voices:**

| Language | Voice Name | Description |
|----------|-----------|-------------|
| `en-US` | `en-US-BrandonMultilingualNeural` | Natural male English (US) voice |
| `en-UK` | `en-GB-RyanNeural` | Natural male English (UK) voice |
| `pt-PT` | `pt-PT-DuarteNeural` | Natural male Portuguese voice |

## Setup Instructions

### Step 1: Get Azure Speech API Key

1. Go to Azure Portal: https://portal.azure.com
2. Navigate to your **Azure Speech Service** (or create one)
3. Go to **Keys and Endpoint**
4. Copy:
   - **Key 1** or **Key 2**
   - **Region** (e.g., `swedencentral`)

### Step 2: Add to Local Environment

Add to your `.env.local` file:

```bash
# Azure Speech Services Configuration
AZURE_SPEECH_KEY=your-actual-speech-key-here
AZURE_SPEECH_REGION=swedencentral
```

### Step 3: Add to Vercel Environment Variables

Go to: https://vercel.com/dashboard (navigate to your project → Settings → Environment Variables)

Add these **2 new environment variables**:

| Variable Name | Value | Environments |
|--------------|-------|--------------|
| `AZURE_SPEECH_KEY` | Your Azure Speech API Key | ☑ Production ☑ Preview ☑ Development |
| `AZURE_SPEECH_REGION` | `swedencentral` | ☑ Production ☑ Preview ☑ Development |

### Step 4: Redeploy on Vercel

After adding the environment variables:
1. Go to your Vercel project dashboard
2. Click **"Redeploy"**
3. Wait for deployment to complete

## Testing

### Local Testing

```bash
# Run with Vercel dev server to test serverless functions
vercel dev
```

Then open your app and test the TTS by asking a question.

### Production Testing

1. Open: https://bluecrow-demo.vercel.app/
2. Join a meeting
3. Ask a question
4. The AI should respond with **high-quality Azure neural voice** instead of browser TTS

## Features

### ✅ Advantages of Azure Speech

- **Higher quality** - Neural voices sound more natural
- **Multilingual support** - Professional voices for multiple languages
- **Consistent experience** - Same voice across all browsers/devices
- **Better pronunciation** - Improved handling of technical terms
- **More control** - Fine-tune prosody, speed, pitch, etc.

### 🔄 Fallback System

If Azure Speech fails (network issues, missing credentials, etc.):
- Automatically falls back to browser's Web Speech API
- User experience is maintained
- Error is logged for debugging

## Voice Customization

To change voices, edit [api/azure-tts.ts](api/azure-tts.ts:11):

```typescript
const VOICE_MAP: Record<string, string> = {
  'en-US': 'en-US-BrandonMultilingualNeural',  // Change this
  'en-UK': 'en-GB-RyanNeural',                  // Or this
  'pt-PT': 'pt-PT-DuarteNeural'                 // Or this
};
```

**Available voices**: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts

## Troubleshooting

### Issue: "Server configuration error"
**Solution**: Check that `AZURE_SPEECH_KEY` environment variable is set in Vercel

### Issue: Falls back to browser TTS
**Possible causes**:
1. Azure Speech credentials not configured
2. Network connectivity issue
3. Azure Speech API quota exceeded

**Check**:
- Vercel function logs: https://vercel.com/dashboard (navigate to your project → Logs)
- Browser console for error messages
- Azure Portal for API usage/quota

### Issue: Audio doesn't play
**Solution**:
- Check browser console for errors
- Ensure autoplay is allowed in browser
- Try user interaction before TTS (browsers require user gesture for audio)

## Cost Considerations

**Azure Speech Services Pricing**:
- Free tier: 5 million characters/month
- Standard tier: $1 per 1 million characters (Neural voices)

**Estimate**:
- Average response: 200 characters
- Free tier allows: ~25,000 responses/month
- More info: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/

## Next Steps

1. ✅ Get Azure Speech API key from Azure Portal
2. ✅ Add to `.env.local` for local development
3. ✅ Add to Vercel environment variables
4. ✅ Redeploy on Vercel
5. ✅ Test the improved voice quality
6. (Optional) Customize voices in `VOICE_MAP`
7. (Optional) Monitor usage in Azure Portal

## Toggle Azure TTS On/Off

To temporarily disable Azure TTS and use browser TTS only:

Edit [services/ttsService.ts](services/ttsService.ts:10):

```typescript
const USE_AZURE_TTS = false; // Change to false to use browser TTS
```

## Security

✅ API keys stored server-side only (in Vercel environment variables)
✅ Frontend never sees Azure Speech credentials
✅ Audio data transmitted via secure HTTPS
✅ No sensitive data logged

Your Azure Speech implementation is production-ready and secure! 🎤
