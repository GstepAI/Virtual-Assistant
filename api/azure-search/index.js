"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const search_documents_1 = require("@azure/search-documents");
// Azure AI Search configuration from environment variables
const SEARCH_ENDPOINT = process.env.AZURE_SEARCH_ENDPOINT;
const SEARCH_API_KEY = process.env.AZURE_SEARCH_API_KEY;
const INDEX_NAME = process.env.AZURE_SEARCH_INDEX_NAME || "full-index-bluecrow";
async function default_1(context, req) {
    context.log('🔍 [API] Azure Search endpoint called');
    // Only allow POST requests
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' }
        };
        return;
    }
    // Validate environment variables
    if (!SEARCH_API_KEY) {
        context.log.error('Missing Azure Search API key');
        context.res = {
            status: 500,
            body: { error: 'Server configuration error' }
        };
        return;
    }
    try {
        const { query, options } = req.body;
        // Validate request body
        if (!query) {
            context.res = {
                status: 400,
                body: { error: 'Missing required field: query' }
            };
            return;
        }
        // Initialize the search client (server-side only)
        const searchClient = new search_documents_1.SearchClient(SEARCH_ENDPOINT, INDEX_NAME, new search_documents_1.AzureKeyCredential(SEARCH_API_KEY));
        const searchOptions = {
            top: (options === null || options === void 0 ? void 0 : options.top) || 10,
            includeTotalCount: true,
            ...((options === null || options === void 0 ? void 0 : options.filter) && { filter: options.filter }),
        };
        // Only add semantic search if explicitly enabled
        // Note: Requires semantic configuration to be set up in Azure Search index
        if (options === null || options === void 0 ? void 0 : options.semanticSearch) {
            searchOptions.queryType = "semantic";
        }
        const searchResults = await searchClient.search(query, searchOptions);
        // Collect all relevant documents
        const documents = [];
        for await (const result of searchResults.results) {
            if (result.document.chunk) {
                // Format document with metadata for better context
                const metadata = result.document.title
                    ? `Source: ${result.document.title}\n${result.document.chunk}`
                    : result.document.chunk;
                documents.push(metadata);
            }
        }
        // If no results found, return a message
        if (documents.length === 0) {
            context.res = {
                status: 200,
                body: {
                    context: "No relevant information found in the knowledge base.",
                    count: 0
                }
            };
            return;
        }
        // Format and return the knowledge base
        const searchContext = documents.join("\n\n---\n\n");
        context.res = {
            status: 200,
            body: {
                context: searchContext,
                count: documents.length
            }
        };
    }
    catch (error) {
        context.log.error("Azure Search query failed:", error);
        context.res = {
            status: 500,
            body: {
                error: 'Failed to retrieve knowledge base from Azure Search',
                details: error.message
            }
        };
    }
}
