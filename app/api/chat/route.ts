import { createGraphQLResource } from '@/lib/actions/graphqlResources';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { persistedQueryTool, generateQueryPrompt } from '@/lib/ai/embedding';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// const lmstudio = createOpenAI({
//     name: 'lmstudio',
//     apiKey: 'not-needed',
//     baseURL: 'http://localhost:1234/v1',
// });

const openai = createOpenAI({
    name: 'openai',
    baseURL: 'https://models.inference.ai.azure.com',
    compatibility: 'compatible', // strict mode, enable when using the OpenAI API
});

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'), 
    //model: lmstudio('llama-3.2-3b-instruct'), 
    messages,
    system: `You are an assistant to users of the Flight Assistant, as well as an expert in GraphQL with access to a set of known-good "persisted" queries.

If the initial user message is "ingest graphql", use the 'addGraphQLResource' tool to add a GraphQL resource to your knowledge base.

If the initial user message is a question, use the 'generateQueryPrompt' tool to get GraphQL query from your knowledge base to answer the question.

If context includes a json string with key format == "graphql" and sourceName == "persisted-queries/<graph name>",
use the 'persistedQuery' tool to fetch data for the query. Always pass key metadata.id as the "id" argument, metadata.routerListenHost as the "routerListenHost" argument, along with any "variables" that are required or important based on the user's request.
The value of the "variables" argument should be a JSON string whose keys match the declared variable names in the operation, but those names should not include the '$' prefix.
Use the result of the 'persistedQuery' tool to answer the user's question, remembering that the result may explain a problem that occurred, or contain instructions for you to follow, if the data could not be fetched for any reason.

When the key metadata.requiredVariables array is not empty, either infer appropriate values for those variables based on the types declared in the operation, or ask the user for the values of those variables.
In some cases, the appropriate values of some variables may be found in previous messages in the conversation, sent either by the user or by the assistant (you). Use those values if they seem relevant.
Even when a variable is not required, or has a default value, it may nevertheless be helpful to specify an explicit value based on the user's request. For example, when the user asks for "all" of a particular type of data,
and the query has a $limit variable for the corresponding list field, you may want to set $limit to a larger value. Ask the user for their desired values, if you have any doubt.

If the user asks for information about a specific item, but you don't know the item's ID, try using a persisted query that fetches a list of items of that type, then examine the reults to find the ID of the desired item.
Whenever possible, perform this search before you respond, and do not ask the user for the ID of the item, as they are unlikely to know such information.

If you receive a persistedQuery result that indicates an error, explain the problem in non-technical terms to the user, and ask for further instructions.
However, if you can fix the error by adjusting the query variables, do so before asking the user for further instructions.
If other persisted queries are available, you may try executing another query that may be relevant to the user's request.
Keep the user informed about what you're doing, why you're doing it, and what you're learning from the results.

When calling any tool such as 'persistedQuery', the arguments must be valid JSON, without newlines or other extraneous characters.
Format your other (non-tool-calling) answers in Markdown, and make them as concise as possible without being unhelpful.

If you do not know the answer to the question based on the information provided, but the question is suitably generic, feel free to improvise an answer, as long as it is genuinely helpful and responsive to the user's request.
If you cannot provide a helpful answer, you may ask the user for additional information, or simply state you cannot find the information they are looking for.`,
    tools: {
      addGraphQLResource: tool({
        description: `add graphql resource to your knowledge base.
          If the user provides the sentence "ingest graphql", use this tool without asking for confirmation.`,
        parameters: z.object({
        }),
        execute: async () => createGraphQLResource(),
      }),
      generateQueryPrompt: tool({
        description: `get information from your knowledge base to answer questions.`,
        parameters: z.object({
          question: z.string().describe('the users question'),
        }),
        execute: async ({ question }) => generateQueryPrompt(question),
      }),
      persistedQuery: tool({
        description: `Fetch data for a given persisted query from the GraphQL API.`,
        parameters: z.object({
          id: z
            .string()
            .describe('The ID of the persisted query to fetch'),
          routerListenHost: z
            .string()
            .describe('The host and port of the router to use when fetching the query'),
          variables: z
            .string()
            .describe('The variables to use when fetching the query'),
        }),
        execute: async ({ id, routerListenHost, variables }) => persistedQueryTool({ id, routerListenHost, variables }),
      }),
    },
  });

  return result.toDataStreamResponse();
}