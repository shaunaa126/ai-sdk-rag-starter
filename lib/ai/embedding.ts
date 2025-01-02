import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { db } from '../db';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { embeddings } from '../db/schema/embeddings';

const lmstudio = createOpenAI({
    name: 'lmstudio',
    apiKey: 'not-needed',
    baseURL: 'http://localhost:1234/v1',
});

// const openai = createOpenAI({
//     name: 'openai',
//     baseURL: 'https://models.inference.ai.azure.com',
//     compatibility: 'compatible', // strict mode, enable when using the OpenAI API
// });

const embeddingModel = lmstudio.embedding('text-embedding-nomic-embed-text-v1.5');

// const embeddingModel = openai.embedding('text-embedding-ada-002');

const generateChunks = (input: string): string[] => {
  return input
    .trim()
    .split('|')
    .filter(i => i !== '');
};

export const generateEmbeddings = async (
  value: string,
): Promise<Array<{ embedding: number[]; content: string }>> => {
  const chunks = generateChunks(value);
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings.map((e, i) => ({ content: chunks[i], embedding: e }));
};

export const generateEmbedding = async (value: string): Promise<number[]> => {
  const input = value.replaceAll('\\n', ' ');
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};

export const findRelevantContent = async (userQuery: string) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;
  const similarGuides = await db
    .select({ name: embeddings.content, similarity })
    .from(embeddings)
    .where(gt(similarity, 0.5))
    .orderBy(t => desc(t.similarity))
    .limit(4);
  return similarGuides;
};

export const generateQueryPrompt = async (question: string) => {
  const content = await findRelevantContent(question);
  const chunkSeparator = "~~~~~~";
  const contentForLlm = `Using the following information, respond to the implied intent of the user's request.
  Different pieces of information are separated by "${chunkSeparator}".

  Information:
  ${content.map((c) => c.name).join(`\n${chunkSeparator}\n`)}

  User query: ${question}`;
  return { role: "user", content: contentForLlm };
};

export const persistedQueryTool = async ({ id, routerListenHost, variables }: { id: string; routerListenHost: string; variables?: string; }) => {
  console.log(`Fetching persisted query with id ${id} and variables ${
    JSON.stringify(variables, null, 2)
  } from ${routerListenHost}`);

  const body: {
    extensions: {
      persistedQuery: {
        version: number;
        sha256Hash: string;
      };
    };
    variables?: string;
  } = {
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: id,
      },
    },
  };
  if (variables) {
    try {
      body.variables = JSON.parse(variables, (key, value) => {
        if (typeof value === 'string' && !isNaN(value as any)) {
          return Number(value);
        }
        return value;
      });
    } catch (error) {
      console.error("Failed to parse variables string:", error);
      throw new Error("Invalid JSON string for variables");
    }
  }

  const response = await fetch(`http://${routerListenHost}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer <token>",
      "apollographql-client-name": "apimgmt"
    },
    body: JSON.stringify(body),
  });

  console.log("Request body:", JSON.stringify(body));
  const jsonResponse = await response.json();
  console.log("Response from fetch:", JSON.stringify(jsonResponse));

  // Mocking the jsonResponse variable with the provided data
  // const jsonResponse = {
  //   data: {
  //     flight: {
  //       id: "1",
  //       departureAirportCode: "LAX",
  //       arrivalAirportCode: "SFO",
  //       seats: [
  //         { available: true, seatNumber: "1A", id: "1-1A", __typename: "Seat" },
  //         { available: true, seatNumber: "1B", id: "1-1B", __typename: "Seat" },
  //         { available: true, seatNumber: "1C", id: "1-1C", __typename: "Seat" },
  //         { available: true, seatNumber: "1D", id: "1-1D", __typename: "Seat" },
  //         { available: true, seatNumber: "1E", id: "1-1E", __typename: "Seat" },
  //         { available: true, seatNumber: "1F", id: "1-1F", __typename: "Seat" },
  //         { available: true, seatNumber: "2A", id: "1-2A", __typename: "Seat" },
  //         { available: true, seatNumber: "2B", id: "1-2B", __typename: "Seat" },
  //         { available: true, seatNumber: "2C", id: "1-2C", __typename: "Seat" },
  //         { available: true, seatNumber: "2D", id: "1-2D", __typename: "Seat" },
  //         { available: true, seatNumber: "2E", id: "1-2E", __typename: "Seat" },
  //         { available: true, seatNumber: "2F", id: "1-2F", __typename: "Seat" },
  //         { available: true, seatNumber: "3A", id: "1-3A", __typename: "Seat" },
  //         { available: true, seatNumber: "3B", id: "1-3B", __typename: "Seat" },
  //         { available: true, seatNumber: "3C", id: "1-3C", __typename: "Seat" },
  //         { available: true, seatNumber: "3D", id: "1-3D", __typename: "Seat" },
  //         { available: true, seatNumber: "3E", id: "1-3E", __typename: "Seat" },
  //         { available: true, seatNumber: "3F", id: "1-3F", __typename: "Seat" },
  //         { available: true, seatNumber: "4A", id: "1-4A", __typename: "Seat" },
  //         { available: true, seatNumber: "4B", id: "1-4B", __typename: "Seat" },
  //         { available: true, seatNumber: "4C", id: "1-4C", __typename: "Seat" },
  //         { available: true, seatNumber: "4D", id: "1-4D", __typename: "Seat" },
  //         { available: true, seatNumber: "4E", id: "1-4E", __typename: "Seat" },
  //         { available: true, seatNumber: "4F", id: "1-4F", __typename: "Seat" },
  //         { available: true, seatNumber: "5A", id: "1-5A", __typename: "Seat" },
  //         { available: true, seatNumber: "5B", id: "1-5B", __typename: "Seat" },
  //         { available: true, seatNumber: "5C", id: "1-5C", __typename: "Seat" },
  //         { available: true, seatNumber: "5D", id: "1-5D", __typename: "Seat" },
  //         { available: true, seatNumber: "5E", id: "1-5E", __typename: "Seat" },
  //         { available: true, seatNumber: "5F", id: "1-5F", __typename: "Seat" },
  //         { available: true, seatNumber: "6A", id: "1-6A", __typename: "Seat" },
  //         { available: true, seatNumber: "6B", id: "1-6B", __typename: "Seat" },
  //         { available: true, seatNumber: "6C", id: "1-6C", __typename: "Seat" },
  //         { available: true, seatNumber: "6D", id: "1-6D", __typename: "Seat" },
  //         { available: true, seatNumber: "6E", id: "1-6E", __typename: "Seat" },
  //         { available: true, seatNumber: "6F", id: "1-6F", __typename: "Seat" },
  //       ],
  //       __typename: "Flight",
  //     },
  //   },
  // };

  return jsonResponse;
}