const fs = require('fs');
const path = require('path');
const STATIC = 'D:/odysseus-dev/static/';
const refIds = new Set();
function walk(file) {
  try {
    const c = fs.readFileSync(file, 'utf8');
    const re = /getElementById\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(c))) refIds.add(m[1]);
  } catch (e) {}
}
walk(STATIC + 'app.js');
const jsDir = STATIC + 'js/';
const items = fs.readdirSync(jsDir);
for (const f of items) {
  const fp = jsDir + f;
  const st = fs.statSync(fp);
  if (st.isFile() && f.endsWith('.js')) walk(fp);
  else if (st.isDirectory()) {
    for (const g of fs.readdirSync(fp)) {
      const gp = fp + g;
      if (g.endsWith('.js')) walk(gp);
    }
  }
}
const html = fs.readFileSync(STATIC + 'index.html', 'utf8');
const htmlIds = new Set();
let m;
while ((m = /id="([^"]+)"/g.exec(html))) htmlIds.add(m[1]);
const single = [...refIds].filter(x => !/[\s.:>+~\[\]#]/.test(x)).sort();
const missing = single.filter(id => !htmlIds.has(id));
fs.writeFileSync('D:/odysseus-dev/missing_ids.txt',
  'Single IDs in JS: ' + single.length + '\n' +
  'Missing from HTML: ' + missing.length + '\n\n' +
  missing.map(id => '#' + id).join('\n'));
console.log('Wrote', missing.length, 'missing IDs to missing_ids.txt');
