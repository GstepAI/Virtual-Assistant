/**
 * Searches the Azure AI Search index for relevant knowledge base content via serverless function
 * @param query - The search query or question
 * @param options - Optional search parameters
 * @returns Formatted knowledge base string
 */
export async function searchKnowledgeBase(
  query: string,
  options?: {
    top?: number;
    filter?: string;
    semanticSearch?: boolean;
  }
): Promise<string> {
  try {
    const response = await fetch('/api/azure-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        options
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to search knowledge base');
    }

    const data = await response.json();
    return data.context;

  } catch (error) {
    console.error("Azure Search query failed:", error);
    throw new Error("Failed to retrieve knowledge base from Azure Search.");
  }
}