import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Builder,By} from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url)),DIST=path.join(ROOT,'dist'),DATA=path.join(ROOT,'dados');
const PDF_DIR=path.join(ROOT,'pdfs_atualizados','PDFs'),CATALOG=path.join(DATA,'catalogo_ppi_144_projetos.csv');
const EXCEL=path.join(DATA,'base_power_bi_projetos_ppi_TABELA_ORIGINAL_ATUALIZADA_144_PROJETOS_15_08_2026.xlsx');
const RESULT=path.join(ROOT,'pdfs_atualizados','resultado_atualizacao_completa.json');
const REPORT=path.join(ROOT,'pdfs_atualizados','RELATORIO_ATUALIZACAO_COMPLETA.txt');
const log=m=>{console.log(m);lines.push(m)},lines=[];
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replaceAll(' ','-');
const parse=line=>{const out=[];let v='',q=false;for(const c of line){if(c==='"')q=!q;else if(c===';'&&!q){out.push(v);v=''}else v+=c}out.push(v);return out};
const csvLines=fs.readFileSync(CATALOG,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean),headers=parse(csvLines.shift());
const catalog=csvLines.map(l=>Object.fromEntries(parse(l).map((v,i)=>[headers[i],v]))),projects=JSON.parse(fs.readFileSync(path.join(DIST,'data.json'),'utf8'));
if(catalog.length!==projects.length)throw new Error(`Catálogo (${catalog.length}) e dashboard (${projects.length}) têm quantidades diferentes.`);
const quote=v=>/[;"\n]/.test(String(v??''))?'"'+String(v??'').replaceAll('"','""')+'"':String(v??'');
function candidates(p){const city=slug((p.municipio||p.projeto).replace(/\([A-Z]{2}\).*/,'')),uf=String(p.uf||'').toLowerCase();return [...new Set([p.url,`https://ppi.gov.br/projetos/${city}/`,`https://ppi.gov.br/projetos/iluminacao-publica-${city}-${uf}/`,`https://ppi.gov.br/projetos/iluminacao-publica-ip-${city}-${uf}/`,`https://portal.ppi.gov.br/iluminacao-publica-${city}-${uf}`].filter(Boolean))]}
function phaseFrom(text,old){const t=norm(text);const rules=[['Contrato',/contrato assinado|assinatura do contrato|contrato celebrado|fase 5[^.]{0,60}100/],['Leilão de Projeto',/leilao previsto|leilao do projeto|entrega de envelopes/],['Edital',/edital publicado|publicacao do edital|fase de edital/],['Consulta Pública',/consulta publica aberta|audiencia publica|fase de consulta publica/],['Estudo',/estudos em andamento|elaboracao dos estudos|fase de estudo/]];for(const [phase,re] of rules)if(re.test(t))return {phase,confidence:'alta'};return {phase:old||'A confirmar no PPI',confidence:'preservada'} }
async function valid(driver,url,p){try{await driver.get(url);await driver.sleep(2500);const title=await driver.getTitle(),body=(await driver.findElement(By.css('body')).getText()).slice(0,15000),all=norm(`${title} ${body}`),terms=norm((p.municipio||p.projeto).replace(/\([A-Z]{2}\).*/,'')).split(' ').filter(x=>x.length>3);return {ok:body.length>250&&!/404|nao encontrada|not found/.test(all)&&terms.some(x=>all.includes(x)),body,url:await driver.getCurrentUrl()}}catch{return {ok:false}}}
async function search(driver,p){for(const url of candidates(p)){const r=await valid(driver,url,p);if(r.ok)return r}try{const q=encodeURIComponent(`site:ppi.gov.br/projetos "${p.projeto}"`);await driver.get(`https://www.bing.com/search?q=${q}`);await driver.sleep(2500);const links=await driver.findElements(By.css('a[href]'));for(const a of links){const href=await a.getAttribute('href');if(href?.includes('ppi.gov.br')&&href.includes('/projetos/')){const r=await valid(driver,href,p);if(r.ok)return r}}}catch{}return {ok:false}}

fs.mkdirSync(PDF_DIR,{recursive:true});let driver,downloaded=0,found=0,phaseChanges=0;const audit=[];
try{
 const options=new chrome.Options().addArguments('--headless=new','--window-size=1440,2200','--disable-notifications','--disable-popup-blocking');
 driver=await new Builder().forBrowser('chrome').setChromeOptions(options).build();await driver.manage().setTimeouts({pageLoad:45000,script:30000});
 for(const p of projects){const file=path.join(PDF_DIR,p.arquivo),needs=!fs.existsSync(file)||fs.statSync(file).size<50000||!p.url;if(!needs){audit.push({numero:p.numero,status:'PDF válido existente',fase:p.etapa,url:p.url});continue}log(`[${p.numero}/${projects.length}] Pesquisando ${p.projeto}`);const r=await search(driver,p);if(!r.ok){audit.push({numero:p.numero,status:'Revisão necessária',fase:p.etapa,url:p.url||''});continue}found++;p.url=r.url;const cat=catalog.find(x=>Number(x.numero)===Number(p.numero));if(cat)cat.url=r.url;const ph=phaseFrom(r.body,p.etapa);if(ph.confidence==='alta'&&ph.phase!==p.etapa){p.etapa=ph.phase;phaseChanges++}try{const out=await driver.sendAndGetDevToolsCommand('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});const pdf=Buffer.from(out.data,'base64');if(pdf.length>50000&&pdf.subarray(0,4).toString()==='%PDF'){const temp=file+'.novo';fs.writeFileSync(temp,pdf);fs.renameSync(temp,file);downloaded++}}catch{}audit.push({numero:p.numero,status:'Página oficial localizada',fase:p.etapa,confianca:ph.confidence,url:r.url})}
}finally{if(driver)await driver.quit()}
fs.writeFileSync(path.join(DIST,'data.json'),JSON.stringify(projects,null,2));fs.writeFileSync(CATALOG,[headers.join(';'),...catalog.map(r=>headers.map(h=>quote(r[h])).join(';'))].join('\n'),'utf8');fs.writeFileSync(RESULT,JSON.stringify({data:new Date().toISOString(),audit},null,2),'utf8');
const ps=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'atualizar-excel-dashboard.ps1'),'-ExcelPath',EXCEL,'-DataJson',path.join(DIST,'data.json'),'-PdfFolder',PDF_DIR],{encoding:'utf8',windowsHide:true});
const counts=Object.fromEntries([...new Set(projects.map(p=>p.etapa))].map(f=>[f,projects.filter(p=>p.etapa===f).length]));lines.push('',`CONCLUÍDO: ${downloaded} PDFs substituídos; ${found} páginas localizadas; ${phaseChanges} fases alteradas com evidência alta.`,`Excel: ${ps.status===0?'atualizado':'não atualizado — '+(ps.stderr||ps.stdout).trim()}`,`Fases: ${JSON.stringify(counts)}`);fs.writeFileSync(REPORT,lines.join('\r\n'),'utf8');console.log(lines.slice(-4).join('\n'));
