import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const directory = new URL('../workflows/', import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith('.json'));
if (files.length === 0) throw new Error('No n8n workflow JSON files found');
for (const file of files) {
  const value = JSON.parse(await readFile(new URL(file, directory), 'utf8'));
  if (!value.name || !Array.isArray(value.nodes) || !value.connections) throw new Error(`${file} is not an importable n8n workflow shape`);
  const names = new Set(value.nodes.map((node: {name?: string}) => node.name));
  for (const source of Object.keys(value.connections)) if (!names.has(source)) throw new Error(`${file} has a connection from unknown node ${source}`);
  console.log(`validated ${file}: ${value.nodes.length} nodes`);
}
