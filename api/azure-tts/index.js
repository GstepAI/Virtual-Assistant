"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const sdk = __importStar(require("microsoft-cognitiveservices-speech-sdk"));
// Azure Speech Service Configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "swedencentral";
// Voice mappings for different languages and genders
const VOICE_MAP = {
    'en-US': {
        male: 'en-US-AndrewMultilingualNeural', // Male voice for US English
        female: 'en-US-AvaMultilingualNeural' // Female voice for US English
    },
    'en-UK': {
        male: 'en-GB-NoahNeural', // Male voice for UK English
        female: 'en-GB-AbbiNeural' // Female voice for UK English
    },
    'pt-BR': {
        male: 'pt-BR-AntonioNeural', // Male voice for Brazilian Portuguese
        female: 'pt-BR-ThalitaMultilingualNeural' // Female voice for Brazilian Portuguese
    }
};
// Azure Static Web Apps Managed Functions format
async function default_1(context, req) {
    context.log('🔊 [API] Azure TTS endpoint called');
    // Only allow POST requests
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' }
        };
        return;
    }
    // Validate environment variables
    if (!SPEECH_KEY) {
        context.log.error('Missing Azure Speech key');
        context.res = {
            status: 500,
            body: { error: 'Server configuration error' }
        };
        return;
    }
    try {
        const { text, language = 'en-US', voiceName, voiceGender = 'female' } = req.body;
        // Validate request body
        if (!text) {
            context.res = {
                status: 400,
                body: { error: 'Missing required field: text' }
            };
            return;
        }
        // Select voice based on language and gender, or use provided voiceName
        let selectedVoice = voiceName;
        if (!selectedVoice) {
            const languageVoices = VOICE_MAP[language] || VOICE_MAP['en-US'];
            selectedVoice = languageVoices[voiceGender] || languageVoices.female;
        }
        // Create speech config
        const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
        speechConfig.speechSynthesisVoiceName = selectedVoice;
        speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
        // Create synthesizer with undefined audio config (we'll get the audio data directly)
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig);
        // Synthesize speech
        const result = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(text, result => {
                synthesizer.close();
                resolve(result);
            }, error => {
                synthesizer.close();
                reject(error);
            });
        });
        // Check result
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // Convert audio data to base64
            const audioData = Buffer.from(new Uint8Array(result.audioData)).toString('base64');
            context.res = {
                status: 200,
                body: {
                    audioData,
                    format: 'mp3',
                    voiceName: selectedVoice
                }
            };
            return;
        }
        else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.CancellationDetails.fromResult(result);
            context.log.error('Speech synthesis canceled:', cancellation.reason);
            if (cancellation.reason === sdk.CancellationReason.Error) {
                context.log.error('Error details:', cancellation.errorDetails);
                context.res = {
                    status: 500,
                    body: {
                        error: 'Speech synthesis failed',
                        details: cancellation.errorDetails
                    }
                };
                return;
            }
            context.res = {
                status: 500,
                body: { error: 'Speech synthesis was canceled' }
            };
            return;
        }
        context.res = {
            status: 500,
            body: { error: 'Unknown speech synthesis error' }
        };
    }
    catch (error) {
        context.log.error('Azure Speech synthesis failed:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to synthesize speech',
                details: error.message
            }
        };
    }
}
