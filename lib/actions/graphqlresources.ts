'use server';

import {
  NewResourceParams,
  insertResourceSchema,
  resources,
} from '@/lib/db/schema/resources';
import { db } from '../db';
import { generateEmbeddings } from '../ai/embedding';
import { embeddings as embeddingsTable } from '../db/schema/embeddings';
import path from 'path';
import { readFileSync, readdirSync } from 'fs';
import { parse as parseGraphQL, visit, VariableDefinitionNode } from 'graphql';
import { parse as parseYaml } from 'yaml';

interface ManifestOperation {
  id: string;
  name: string;
  type: string;
  body: string;
}

type DataSource = {
  name: string;
  fetchPages(): Promise<Page[]>;
}

type Page = {
  url: string;
  title?: string;
  body: string;
  format: PageFormat;
  sourceName: string;
  metadata?: PageMetadata;
}

type PageFormat = ("txt" | "md" | "mdx" | "restructuredtext" | "csv" | "json" | "yaml" | "toml" | "xml" | "openapi-yaml" | "openapi-json" | "graphql" | "c" | "cpp" | "csharp" | "go" | "html" | "java" | "javascript" | "kotlin" | "latex" | "objective-c" | "php" | "python" | "ruby" | "rust" | "scala" | "shell" | "swift" | "typescript");

type PageMetadata = {
  [k: string]: unknown;
  tags?: string[];
}

const rootDir = path.dirname((__dirname));

async function persistedQueryDataSource(): Promise<DataSource> {
  return {
    name: "persisted-queries",
    async fetchPages(): Promise<Page[]> {
      const pages: Page[] = [];
      const graphDir = path.join(rootDir, "../../../../", "graph");
      const manifestPath = path.join(graphDir, "operation-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      const routerYamlPath = path.join(graphDir, "router.yaml");
      const routerYaml = readFileSync(routerYamlPath, "utf-8");
      const {
        supergraph: { listen: routerListenHost = "127.0.0.1:4000" },
      } = parseYaml(routerYaml);

      manifest.operations.forEach((operation: ManifestOperation) => {
        const operationAST = parseGraphQL(operation.body);
        const requiredVariablesSet = new Set<string>();

        visit(operationAST, {
          VariableDefinition(node) {
            if (node.type.kind === "NonNullType") {
              const varName = node.variable.name.value;
              requiredVariablesSet.add(varName);
            }
          },
        });

        const metadata = {
          id: operation.name,
          requiredVariables: Array.from(requiredVariablesSet),
          routerListenHost,
        };

        const pseudoPageURL = `/persisted-queries/${operation.name}/?id=${operation.name}`;

        pages.push({
          url: pseudoPageURL,
          title: `${operation.name}`,
          body: operation.body,
          format: "graphql",
          sourceName: `persisted-queries/`,
          metadata,
        });
      });

      return pages;
    },
  };
}

export const createGraphQLResource = async () => {
  try {
    const dataSource = await persistedQueryDataSource();
    const pages = await dataSource.fetchPages();

    for (const page of pages) {
      const resourceData = { content: JSON.stringify(page) };
      const { content } = insertResourceSchema.parse(resourceData);

      const [resource] = await db
        .insert(resources)
        .values({ content })
        .returning();
  
      const embeddings = await generateEmbeddings(content);
      await db.insert(embeddingsTable).values(
        embeddings.map(embedding => ({
          resourceId: resource.id,
          ...embedding,
        })),
      );
    }

    return 'GraphQL Resource successfully created and embedded.';
  } catch (error) {
    return error instanceof Error && error.message.length > 0
      ? error.message
      : 'Error, please try again.';
  }
};