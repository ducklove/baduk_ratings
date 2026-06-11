import { runFromSnapshot, runPipeline } from './lib/pipeline.mjs';

const fromSnapshot = process.argv.includes('--from-snapshot');
const dataDir = process.env.DATA_DIR || undefined;
const run = fromSnapshot ? runFromSnapshot : runPipeline;

run({ dataDir }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
