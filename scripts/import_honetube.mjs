import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rawCsv = `Rod name,Diameter(mm),length(inch),quantity
Hose Pipe,180x200,42.,1.
Hose Pipe,180x200,7.,1.
Hose Pipe,180x200,6.5,1.
Hose Pipe,200x220,8.5,1.
Hose Pipe,200x230,28.,1.
Hose Pipe,200x230,21.,1.
Hose Pipe,200x230,28.5,1.
Hose Pipe,180x210,13.,1.
Hose Pipe,180x210,26.5,1.
Hose Pipe,180x210,33.5,1.
Hose Pipe,180x210,11.,1.
Hose Pipe,150x170,29.5,1.
Hose Pipe,150x170,9.,1.
Hose Pipe,150x180,25.5,
Hose Pipe,160x180,25.,1.
Hose Pipe,160x180,7.5,1.
Hose Pipe,160x180,10.5,1.
Hose Pipe,160x180,4.5,1.
Hose Pipe,120x140,14.5,1.
Hose Pipe,100x115,19.,1.
Hose Pipe,100x115,17.5,2.
Hose Pipe,100x115,15.5,1.
Hose Pipe,100x115,11.,1.
Hose Pipe,100x115,23.,1.
Hose Pipe,95x110,13.5,1.
Hose Pipe,110x125,10.5,1.
Hose Pipe,70x82,30.,6.
Hose Pipe,70x82,18.,1.
Hose Pipe,70x82,21.5,1.
Hose Pipe,70x82,15.,1.
Hose Pipe,70x82,13.,1.
Hose Pipe,70x82,13.5,1.
Hose Pipe,70x82,8.5,2.
Hose Pipe,70x82,8.,1.
Hose Pipe,70x82,7.,1.
Hose Pipe,70x82,5.5,1.
Hose Pipe,70x82,5.5,1.
Hose Pipe,70x82,6.5,1.
Hose Pipe,140x160,10.,1.
Hose Pipe,90x105,9.,4.
,90x105,9.5,1.
,90x105,6.,1.
,80x100,7.5,1.
,80x95,5.5,1.
,130x148,10.,1.
,130x148,9.,1.
,115x130,9.5,1.
,110x125,5.5,2.
,110x125,6.5,1.
,110x125,8.5,1.
,110x125,6.,3.
,110x130,9.5,1.
,80x92,28.,1.
,80x92,26.,1.
,80x92,22.5,1.
,80x92,19.,1.
,80x92,4.,1.
,80x92,5.5,1.
,80x92,6.,1.
,80x92,5.,2.
,75x90,14.,1.
,75x90,11.,1.
,75x90,10.,1.
,75x90,7.5,1.
,75x90,7.,1.
,75x90,4.5,1.
,105x120,17.,1.
,55x65,27.,1.
,55x65,12.,1.
,55x65,8.,1.
,63x75,16.5,1.
,63x75,2.,1.
,63x73,14.5,1.
,63x73,13.5,1.
,63x73,9.5,2.
,63x73,8.,2.
,63x73,6.5,1.
,63x73,5.,5.
,63x73,7.,2.
,63x73,4.,3.
,63x73,5.5,1.
,50x60,20.,1.
,50x60,15.,1.
,50x60,8.,1.
,50x60,6.,1.
,50x60,4.,2.
,60x70,10.5,1.
,48x58,11.5,1.
,40x50,16.,1.
,45x55,8.,1.
,25x35,11.,1.
,25x35,8.5,1.`;

const lines = rawCsv.trim().split('\n').slice(1);
console.log(`Parsed ${lines.length} lines from CSV.`);

const rodsFilePath = join(process.cwd(), '.data', 'chrome-rods.json');
let currentRods = [];
try {
  currentRods = JSON.parse(readFileSync(rodsFilePath, 'utf8'));
} catch (e) {
  currentRods = [];
}

const newRecords = [];
let index = 1;

for (const line of lines) {
  if (!line.trim()) continue;
  const parts = line.split(',').map(s => s.trim());
  // Parts: [0] Rod name, [1] Diameter(mm), [2] length(inch), [3] quantity
  const rawDia = parts[1];
  const rawLen = parts[2];
  const rawQty = parts[3];

  if (!rawDia || !rawLen) continue;

  const diaClean = rawDia.toLowerCase().replace(/\s+/g, '');
  const lenClean = parseFloat(rawLen.replace(/[^0-9.]/g, ''));
  const qtyClean = rawQty ? (parseInt(rawQty.replace(/[^0-9]/g, ''), 10) || 1) : 1;

  if (isNaN(lenClean) || lenClean <= 0) continue;

  const sku = `ROD-HONE-${diaClean.toUpperCase()}-${Math.round(lenClean)}IN-${index}`;
  const id = `rod-hone-${diaClean}-${lenClean}-${index}-${Date.now()}`;

  newRecords.push({
    id,
    sku,
    name: 'HoneTube',
    category: 'HoneTube',
    diameterMm: diaClean, // Store as dimension string e.g. "180x200"
    lengthIn: lenClean,
    lengthFt: lenClean,
    quantity: qtyClean,
    notes: 'Imported HoneTube stock',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  index++;
}

console.log(`Created ${newRecords.length} HoneTube records.`);
console.log(`Sample record:`, newRecords[0]);

// Remove any existing HoneTube / Hose Pipe to avoid duplicates
const filteredExisting = currentRods.filter(r => {
  const cat = String(r.category || r.name || '').toLowerCase();
  return cat !== 'honetube' && cat !== 'hose pipe';
});

const combined = [...filteredExisting, ...newRecords];
writeFileSync(rodsFilePath, JSON.stringify(combined, null, 2), 'utf8');
console.log(`Successfully saved ${combined.length} total rods to ${rodsFilePath}.`);

