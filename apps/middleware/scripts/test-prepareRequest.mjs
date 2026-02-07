import 'dotenv/config';

function must(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

// bytes32 hex (right-pad to 32 bytes)
function toBytes32Hex(s) {
  return '0x' + Buffer.from(s, 'utf8').toString('hex').padEnd(64, '0');
}

const base = must('WEB2JSON_VERIFIER_URL').replace(/\/+$/, ''); // trim trailing /
const url = `${base}/Web2Json/prepareRequest`;

const body = {
  attestationType: toBytes32Hex('Web2Json'),
  sourceId: toBytes32Hex('PublicWeb2'),
  requestBody: {
    url: must('FDC_WEB2JSON_URL'),
    httpMethod: 'GET',
    headers: '{}',
    queryParams: '{}',
    body: '{}',
    postProcessJq: must('FDC_WEB2JSON_JQ'),
    abiSignature: must('FDC_WEB2JSON_ABI'),
  },
};

const r = await fetch(url, {
  method: 'POST',
  headers: {
    'X-API-KEY': must('FLARE_API_KEY'),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

console.log('POST', url);
console.log('status =', r.status);
const t = await r.text();
console.log(t.slice(0, 1200));
