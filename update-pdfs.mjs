import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Builder,By} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import AdmZip from 'adm-zip';

const argv=process.argv.slice(2),arg=name=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:null},simulate=argv.includes('--simular');
const catalog=arg('--catalogo'),base=arg('--base'),folder=arg('--pasta');
const parse=line=>{const out=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"')quoted=!quoted;else if(c===';'&&!quoted){out.push(value);value=''}else value+=c}out.push(value);return out};
const lines=fs.readFileSync(catalog,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean),headers=parse(lines.shift()),rows=lines.map(line=>Object.fromEntries(parse(line).map((v,i)=>[headers[i],v])));
if(rows.length!==144)throw new Error(`Catálogo recusado: esperados 144 projetos, encontrados ${rows.length}.`);
const counts=Object.fromEntries([...new Set(rows.map(r=>r.categoria))].map(c=>[c,rows.filter(r=>r.categoria===c).length]));
console.log(`Catálogo aprovado: 144 projetos — ${Object.entries(counts).map(([k,v])=>`${v} ${k}`).join(', ')}.`);
if(simulate){console.log(`Simulação concluída: ${rows.length} registros; ${rows.filter(r=>!r.url).length} URLs serão pesquisadas no portal.`);process.exit(0)}
const pdfDir=path.join(folder,'PDFs');fs.mkdirSync(pdfDir,{recursive:true});const zip=new AdmZip(base),entries=new Map(zip.getEntries().map(e=>[path.basename(e.entryName).toLowerCase(),e]));
let driver;let restored=0,downloaded=0,failed=0;
try{
 const options=new chrome.Options().addArguments('--headless=new','--window-size=1440,2200','--disable-notifications','--disable-popup-blocking');driver=await new Builder().forBrowser('chrome').setChromeOptions(options).build();await driver.manage().setTimeouts({pageLoad:50000,script:30000});
 for(const [index,row] of rows.entries()){
  const destination=path.join(pdfDir,row.arquivo);if(fs.existsSync(destination)&&fs.statSync(destination).size>1000){console.log(`[${index+1}/${rows.length}] Existente: ${row.projeto}`);continue}
  const entry=entries.get(row.arquivo.toLowerCase());
  if(!row.url){if(entry){fs.writeFileSync(destination,entry.getData());restored++;console.log(`[${index+1}/${rows.length}] Restaurado da base: ${row.projeto}`)}else{failed++;console.log(`[${index+1}/${rows.length}] Sem URL e sem cópia-base: ${row.projeto}`)}continue}
  try{await driver.get(row.url);const title=await driver.getTitle();const body=(await driver.findElement(By.css('body')).getText()).slice(0,4000);if(body.length<180||/404|não encontrada|not found/i.test(`${title} ${body.slice(0,800)}`))throw new Error('página oficial indisponível');const result=await driver.sendAndGetDevToolsCommand('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,marginTop:0.35,marginBottom:0.35,marginLeft:0.35,marginRight:0.35});const pdf=Buffer.from(result.data,'base64');if(pdf.length<1000||pdf.subarray(0,4).toString()!=='%PDF')throw new Error('PDF inválido');fs.writeFileSync(destination,pdf);downloaded++;console.log(`[${index+1}/${rows.length}] Atualizado: ${row.projeto}`)}catch(e){if(entry){fs.writeFileSync(destination,entry.getData());restored++;console.log(`[${index+1}/${rows.length}] Portal indisponível; restaurado da base: ${row.projeto}`)}else{failed++;console.log(`[${index+1}/${rows.length}] Falha: ${row.projeto} — ${e.message}`)}}
 }
}finally{if(driver)await driver.quit()}
const files=fs.readdirSync(pdfDir).filter(x=>x.toLowerCase().endsWith('.pdf'));const manifest=files.map(name=>{const data=fs.readFileSync(path.join(pdfDir,name));return {arquivo:name,tamanho:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')}});fs.writeFileSync(path.join(folder,'manifesto_node.json'),JSON.stringify(manifest,null,2));console.log(`Concluído em Node.js: ${restored} restaurados, ${downloaded} atualizados, ${failed} falhas, ${files.length} PDFs disponíveis.`);
