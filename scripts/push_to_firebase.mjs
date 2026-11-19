import { readFileSync } from 'fs';

async function main() {
  const rods = JSON.parse(readFileSync('.data/chrome-rods.json', 'utf8'));
  const categories = JSON.parse(readFileSync('.data/categories.json', 'utf8'));

  console.log(`Syncing ${rods.length} rods and categories to /api/firebase-sync...`);

  const res = await fetch('http://localhost:3000/api/firebase-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rods, categories })
  });

  const data = await res.json();
  console.log('Sync response:', data);
}

main().catch(console.error);

