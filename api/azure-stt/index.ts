import * as sdk from 'microsoft-cognitiveservices-speech-sdk';

// Azure Speech Service Configuration
const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "swedencentral";

// Language code mappings for Azure Speech Services
// Our app uses 'en-UK' but Azure expects 'en-GB'
const LANGUAGE_MAP: Record<string, string> = {
  'en-US': 'en-US',
  'en-UK': 'en-GB',  // Azure uses en-GB for UK English.
  'pt-BR': 'pt-BR'
};

// Azure Static Web Apps Managed Functions format
export default async function (context: any, req: any) {
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
    const result = await new Promise<sdk.SpeechRecognitionResult>((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        result => {
          recognizer.close();
          resolve(result);
        },
        error => {
          recognizer.close();
          reject(error);
        }
      );
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
    } else if (result.reason === sdk.ResultReason.NoMatch) {
      context.res = {
        status: 200,
        body: {
          text: '',
          language: language,
          noMatch: true
        }
      };
      return;
    } else if (result.reason === sdk.ResultReason.Canceled) {
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

  } catch (error: any) {
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
