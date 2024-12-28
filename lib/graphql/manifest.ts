// This script generates operation-manifest.json and prepends any initial #
// comments from operations/*.graphql files to operation-manifest.json.

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readFileSync, readdirSync, writeFileSync, statSync } = require("node:fs");
const { parse: parseGraphQL } = require("graphql");

const rootDir = path.dirname(__dirname);
const graphDir = path.join(rootDir + "../../","graph");

generate();

function generate() {
  const manifestPath = path.join(graphDir, "operation-manifest.json");

  console.log("Generating operation-manifest.json for", path.relative(rootDir, graphDir));

  spawnSync(
    "npx",
    [
      "generate-persisted-query-manifest",
      "--config", "operation-manifest.config.ts",
    ],
    {
      stdio: "inherit",
      cwd: graphDir,
    },
  );

  const originalManifestString = readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(originalManifestString);

  const operationsDir = path.join(graphDir, "operations");
  const operationsByName = new Map<string, {
    name: string;
    body: string;
  }>();

  for (const op of manifest.operations) {
    operationsByName.set(op.name, op);
  }

  for (const opFile of readdirSync(operationsDir)) {
    const opPath = path.join(operationsDir, opFile);
    const opSource = readFileSync(opPath, "utf-8");
    const ast = parseGraphQL(opSource);

    const firstDef = ast.definitions[0];
    if (firstDef.kind === "OperationDefinition") {
      const opName = firstDef.name?.value;
      if (opName) {
        const op = operationsByName.get(opName);
        if (!op) continue;

        const comments: string[] = [];
        opSource.split("\n").every((line: string) => {
          if (line.trimStart().startsWith("#")) {
            comments.push(line);
            return true;
          }
          return false;
        });

        op.body = comments.join("\n") + "\n" + op.body;
      }
    }
  }

  writeFileSync(
    manifestPath,
    JSON.stringify(manifest, null, 2),
  );
}
