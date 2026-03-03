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
// Language code mappings for Azure Speech Services
// Our app uses 'en-UK' but Azure expects 'en-GB'
const LANGUAGE_MAP = {
    'en-US': 'en-US',
    'en-UK': 'en-GB', // Azure uses en-GB for UK English.
    'pt-BR': 'pt-BR'
};
// Azure Static Web Apps Managed Functions format
async function default_1(context, req) {
    context.log('🎤 [API] Azure STT endpoint called');
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
        const { audioData, language = 'en-US' } = req.body;
        // Validate request body
        if (!audioData) {
            context.res = {
                status: 400,
                body: { error: 'Missing required field: audioData' }
            };
            return;
        }
        // Convert base64 audio to buffer
        const audioBuffer = Buffer.from(audioData, 'base64');
        // Create speech config
        const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
        // Map our language codes to Azure's expected codes
        const azureLanguage = LANGUAGE_MAP[language] || language;
        speechConfig.speechRecognitionLanguage = azureLanguage;
        // Create audio config from buffer
        const pushStream = sdk.AudioInputStream.createPushStream();
        pushStream.write(audioBuffer.buffer);
        pushStream.close();
        const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
        // Create recognizer
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
        // Perform recognition
        const result = await new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(result => {
                recognizer.close();
                resolve(result);
            }, error => {
                recognizer.close();
                reject(error);
            });
        });
        // Check result
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            context.res = {
                status: 200,
                body: {
                    text: result.text,
                    language: language
                }
            };
            return;
        }
        else if (result.reason === sdk.ResultReason.NoMatch) {
            context.res = {
                status: 200,
                body: {
                    text: '',
                    language: language,
                    noMatch: true
                }
            };
            return;
        }
        else if (result.reason === sdk.ResultReason.Canceled) {
            const cancellation = sdk.CancellationDetails.fromResult(result);
            context.log.error('Speech recognition canceled:', cancellation.reason);
            if (cancellation.reason === sdk.CancellationReason.Error) {
                context.log.error('Error details:', cancellation.errorDetails);
                context.res = {
                    status: 500,
                    body: {
                        error: 'Speech recognition failed',
                        details: cancellation.errorDetails
                    }
                };
                return;
            }
            context.res = {
                status: 500,
                body: { error: 'Speech recognition was canceled' }
            };
            return;
        }
        context.res = {
            status: 500,
            body: { error: 'Unknown speech recognition error' }
        };
    }
    catch (error) {
        context.log.error('Azure Speech recognition failed:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to recognize speech',
                details: error.message
            }
        };
    }
}
