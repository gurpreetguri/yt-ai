import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'fs';
const base = 'agents/agent-03-fact-verification/';
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
try {
  const inputSchema = JSON.parse(fs.readFileSync(base + 'input.schema.json', 'utf8'));
  ajv.compile(inputSchema);
  console.log('input.schema.json compiled OK');
} catch (e) { console.log('INPUT SCHEMA ERROR:', e.message); process.exit(1); }
try {
  const outputSchema = JSON.parse(fs.readFileSync(base + 'output.schema.json', 'utf8'));
  ajv.compile(outputSchema);
  console.log('output.schema.json compiled OK');
} catch (e) { console.log('OUTPUT SCHEMA ERROR:', e.message); process.exit(1); }
