// Regenerate with: node www/vps/scripts/field-inventory.cjs
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../hack-the-ried/node_modules/typescript');
const root = path.resolve(__dirname, '../../hack-the-ried');
const files = ['demographicsData','financeData','realestateData','economyData','electionsData','infrastructureData','regionalStats','mapData','telemetryData'];
const result = [];
for (const name of files) {
  const file = `lib/${name}.ts`;
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true);
  for (const declaration of source.statements) {
    if (!ts.isInterfaceDeclaration(declaration) && !ts.isTypeAliasDeclaration(declaration)) continue;
    const members = ts.isInterfaceDeclaration(declaration) ? declaration.members : ts.isTypeLiteralNode(declaration.type) ? declaration.type.members : [];
    for (const field of members) if (ts.isPropertySignature(field)) result.push({file,contract:declaration.name.text,field:field.name.getText(source),optional:!!field.questionToken,type:field.type?.getText(source),line:source.getLineAndCharacterOfPosition(field.getStart(source)).line+1});
  }
}
fs.writeFileSync(path.resolve(__dirname,'../ui-field-inventory.json'),JSON.stringify({notice:'Static declared-field inventory, including inactive legacy contracts. Cross-reference ui-data-coverage.md for active publications and gaps. Types are not runtime validation or proof of source coverage.',fields:result},null,2)+'\n');
console.log(`${result.length} declared fields inventoried`);
