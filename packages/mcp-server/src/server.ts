import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerState } from "./data/loader";
import { AnimeSearch } from "./search/engine";
import { browseTaxonomy } from "./tools/browse";
import { getAnimeDetails } from "./tools/details";
import { recommendSimilar } from "./tools/recommend";
import { searchAnime } from "./tools/search";

const TOOLS = [
  {
    name: "search_anime",
    description:
      "Search for anime by natural language query. Returns matching anime with titles, types, episodes, tags, and synopses.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Natural language search query (e.g., 'time travel romance', 'cyberpunk action')",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 10, max: 50)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "recommend_similar",
    description:
      "Get anime recommendations similar to titles the user likes. Uses semantic similarity and multi-signal scoring.",
    inputSchema: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          items: { type: "string" },
          description: "1-10 anime titles the user likes",
        },
        preferences: {
          type: "string",
          description: "Optional natural language preferences (e.g., 'post-2020', 'darker tone')",
        },
        excludeTitles: {
          type: "array",
          items: { type: "string" },
          description: "Titles to exclude from recommendations (already seen)",
        },
        limit: {
          type: "number",
          description: "Maximum number of recommendations (default: 8, max: 20)",
        },
      },
      required: ["titles"],
    },
  },
  {
    name: "get_anime_details",
    description: "Get full metadata for a specific anime by title or ID.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Anime title (fuzzy search)",
        },
        id: {
          type: "string",
          description: "Exact anime ID",
        },
      },
    },
  },
  {
    name: "browse_taxonomy",
    description: "Browse available tags, genres, and themes for discovery.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["genre", "theme", "demographic", "setting"],
          description: "Filter by tag category",
        },
        search: {
          type: "string",
          description: "Search within tags",
        },
      },
    },
  },
];

export function createServer(state: ServerState): Server {
  const server = new Server(
    { name: "anime-rag", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  const search = new AnimeSearch(state.db, state.client, state.vectors);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "search_anime": {
          result = await searchAnime(search, args as { query: string; limit?: number });
          break;
        }

        case "recommend_similar": {
          result = await recommendSimilar(
            search,
            state.vectors,
            args as {
              titles: string[];
              preferences?: string;
              excludeTitles?: string[];
              limit?: number;
            }
          );
          break;
        }

        case "get_anime_details": {
          result = getAnimeDetails(state.db, args as { title?: string; id?: string });
          break;
        }

        case "browse_taxonomy": {
          result = browseTaxonomy(state.db, args as { category?: string; search?: string });
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer(state: ServerState): Promise<void> {
  const server = createServer(state);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
