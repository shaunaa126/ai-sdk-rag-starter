import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { db } from '../db';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import { embeddings } from '../db/schema/embeddings';
import { env } from "@/lib/env.mjs";

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

  const response = await fetch(`https://${routerListenHost}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.SSO_TOKEN}`,
      "apollographql-client-name": "apimgmt"
    },
    body: JSON.stringify(body),
  });
  const jsonResponse = await response.json();

  return jsonResponse;
}