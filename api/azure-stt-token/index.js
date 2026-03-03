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
/**
 * Generate a temporary authorization token for client-side Azure Speech SDK
 * This is more secure than exposing the subscription key to the client
 * Azure Static Web Apps Managed Functions format
 */
async function default_1(context, req) {
    context.log('🎤 [API] Azure STT Token endpoint called');
    // Only allow GET requests
    if (req.method !== 'GET') {
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
        // Generate authorization token
        const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
        // Get the authorization token
        const tokenObj = speechConfig.authorizationToken;
        // If no token is directly available, we need to fetch it
        // For now, return the key (in production, you'd want to fetch a proper token)
        const response = await fetch(`https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': SPEECH_KEY,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to get authorization token from Azure');
        }
        const token = await response.text();
        context.res = {
            status: 200,
            body: {
                token,
                region: SPEECH_REGION
            }
        };
    }
    catch (error) {
        context.log.error('Failed to generate Azure Speech token:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to generate authorization token',
                details: error.message
            }
        };
    }
}
