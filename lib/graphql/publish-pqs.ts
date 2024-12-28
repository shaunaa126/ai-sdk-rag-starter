const path = require("node:path");
const { readFileSync, readdirSync, writeFileSync, statSync } = require("node:fs");

const { spawnSync } = require("node:child_process");
const dotenv = require("dotenv");

const rootDir = path.dirname(__dirname);
const graphDir = path.join(rootDir + "../../","graph");

publish();

function publish() {
  const envPath = path.join(graphDir, ".env");
  const envText = readFileSync(envPath, "utf-8");
  const { APOLLO_GRAPH_REF, APOLLO_KEY } = dotenv.parse(envText);

  console.log(
    "Publishing persisted queries for",
    path.relative(rootDir, graphDir)
  );

  const result = spawnSync(
    "rover",
    [
      "persisted-queries",
      "publish",
      APOLLO_GRAPH_REF,
      "--manifest",
      "operation-manifest.json",
    ],
    {
      stdio: "pipe",
      cwd: graphDir,
      env: {
        ...process.env,
        "APOLLO_KEY": APOLLO_KEY
      }
    }
  );

  if (result.error) {
    console.error("Error:", result.error);
  }
  console.log("stdout:", result.stdout.toString());
  console.log("stderr:", result.stderr.toString());
}