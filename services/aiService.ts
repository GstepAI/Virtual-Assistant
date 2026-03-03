import type { GeminiResponse, ChatMessage } from '../types';
import { canProcessInteractions } from './consentService';

export async function getQaAnswer(
  question: string,
  context: string | null,
  slidesManifest: string,
  useAzureSearch: boolean = true,
  language: string = 'en-US',
  conversationHistory: ChatMessage[] = []
): Promise<GeminiResponse> {
  // GDPR: Check consent before processing text through Azure AI
  if (!canProcessInteractions()) {
    throw new Error('Interaction processing not consented. Please accept voice & text processing in privacy settings.');
  }

  // Retrieval now happens inside /api/azure-openai to avoid a second API round trip.
  // Keep `context` and `useAzureSearch` in the signature for compatibility.
  const knowledgeContext = typeof context === 'string' ? context : null;

  try {
    // Call the serverless function instead of directly calling Azure OpenAI
    const response = await fetch('/api/azure-openai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        context: knowledgeContext,
        slidesManifest,
        language,
        conversationHistory
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get AI response');
    }

    const parsedResponse: GeminiResponse = await response.json();

    // Validate the response structure
    if (!parsedResponse.answer || !parsedResponse.slideId) {
      throw new Error("Invalid response structure from AI");
    }

    return parsedResponse;

  } catch (error) {
    console.error("Azure OpenAI API call failed:", error);
    throw new Error("Failed to get a valid response from the AI model.");
  }
}
