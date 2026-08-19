import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import AdmZip from 'adm-zip';
import {auditPortfolio} from './portfolio-audit.mjs';
import {classifyRecord, verifyPpiPage} from './situation-verifier.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DIST=path.join(ROOT,'dist'),DATA=path.join(ROOT,'dados'),UPDATED=path.join(ROOT,'pdfs_atualizados','PDFs');
const EXCEL_NAME='base_power_bi_projetos_ppi_TABELA_ORIGINAL_ATUALIZADA_144_PROJETOS_15_08_2026.xlsx',EXCEL=path.join(DATA,EXCEL_NAME);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.pdf':'application/pdf','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const send=(res,status,data,type='application/json; charset=utf-8',headers={})=>{const body=Buffer.isBuffer(data)?data:Buffer.from(data);res.writeHead(status,{'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store',...headers});res.end(body)};
const json=(res,status,obj)=>send(res,status,JSON.stringify(obj),types['.json']);
const body=async req=>{const parts=[];for await(const part of req)parts.push(part);try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}')}catch{return {}}};
function pdfFromBase(name){const zip=new AdmZip(path.join(DATA,'base_ppi_144_projetos.zip'));const entry=zip.getEntries().find(e=>path.basename(e.entryName).toLocaleLowerCase()===name.toLocaleLowerCase());return entry?entry.getData():null}
async function update(req,res){const input=await body(req),args=['update-pdfs.mjs','--catalogo',path.join(DATA,'catalogo_ppi_144_projetos.csv'),'--base',path.join(DATA,'base_ppi_144_projetos.zip'),'--pasta',path.join(ROOT,'pdfs_atualizados')];if(input.simulate!==false)args.push('--simular');const child=spawn(process.execPath,args,{cwd:ROOT,windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',e=>json(res,500,{ok:false,error:e.message}));child.on('close',code=>json(res,200,{ok:code===0,output:output.trim()}))}
async function fullUpdate(req,res){const child=spawn(process.execPath,['atualizacao-completa.mjs'],{cwd:ROOT,windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',e=>json(res,500,{ok:false,error:e.message}));child.on('close',code=>json(res,200,{ok:code===0,output:output.trim()||'Atualização concluída.'}))}
async function aiSummary(req,res){
 const input=await body(req),apiKey=String(input.api_key||process.env.OPENAI_API_KEY||'').trim();
 if(!apiKey)return json(res,400,{ok:false,error:'Informe uma chave da API OpenAI.'});
 const projects=JSON.parse(fs.readFileSync(path.join(DIST,'data.json'),'utf8'));
 let portfolio;
 try{portfolio=auditPortfolio(projects,144)}catch(e){return json(res,500,{ok:false,error:`Falha ao auditar a base: ${e.message}`})}
 if(!portfolio.audit.complete)return json(res,422,{ok:false,error:'A base não contém exatamente 144 projetos únicos e numerados. O resumo por IA foi interrompido para evitar uma análise incompleta.',dataset_audit:portfolio.audit});
 try{
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
   model:'gpt-5.6-luna',
   instructions:'Você é um analista sênior de infraestrutura pública e concessões. Use somente os dados fornecidos. Não estime valores ausentes e não omita registros do manifesto.',
   input:`Produza um briefing executivo completo da carteira PPI. A auditoria determinística confirmou EXATAMENTE 144 projetos únicos. Abra a resposta com: "Base analisada: 144 projetos únicos". Analise carteira, setores, território, maturidade, finanças, lacunas, riscos, oportunidades e recomendações. Diferencie zero de valor não informado. As contagens e somas do bloco ESTATISTICAS são as referências oficiais; o MANIFESTO contém cada um dos 144 projetos e deve ser considerado integralmente.\n\nAUDITORIA:\n${JSON.stringify(portfolio.audit)}\n\nESTATISTICAS:\n${JSON.stringify({totals:portfolio.totals,informed:portfolio.informed,distributions:portfolio.distributions,field_gaps:portfolio.field_gaps})}\n\nMANIFESTO_144_PROJETOS:\n${JSON.stringify(portfolio.manifest)}`,
   text:{verbosity:'medium'}
  })});
  const data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'Falha na API OpenAI');
  const text=data.output?.flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();
  if(!text)return json(res,502,{ok:false,error:'A API não retornou texto para o resumo.',dataset_audit:portfolio.audit});
  json(res,200,{ok:true,summary:text,dataset_audit:portfolio.audit});
 }catch(e){json(res,500,{ok:false,error:e.message,dataset_audit:portfolio.audit})}
}
async function verifySituationPages(req,res){
 const input=await body(req),urls=Array.isArray(input.urls)?input.urls.map(String).filter(Boolean).slice(0,50):[];
 if(!urls.length)return json(res,400,{ok:false,error:'Informe ao menos uma URL oficial do PPI.'});
 const results=[];
 for(const value of urls){try{results.push(await verifyPpiPage(value))}catch(e){results.push({url:value,classification:'ERRO',candidate_status:'',error:e.message})}}
 return json(res,200,{ok:true,results});
}
function verifyCurrentBase(res){
 const projects=JSON.parse(fs.readFileSync(path.join(DIST,'data.json'),'utf8'));
 const results=projects.map(project=>({...project,...classifyRecord(project)})).filter(item=>item.classification!=='COM_SITUACAO');
 return json(res,200,{ok:true,review_required:true,results});
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method==='POST'&&url.pathname==='/api/update')return update(req,res);
 if(req.method==='POST'&&url.pathname==='/api/full-update')return fullUpdate(req,res);
 if(req.method==='POST'&&url.pathname==='/api/summary')return aiSummary(req,res);
 if(req.method==='POST'&&url.pathname==='/api/verificar-situacao')return verifySituationPages(req,res);
 if(req.method==='GET'&&url.pathname==='/api/verificar-base-situacao')return verifyCurrentBase(res);
 if(req.method==='GET'&&url.pathname==='/api/excel')return fs.existsSync(EXCEL)?send(res,200,fs.readFileSync(EXCEL),types['.xlsx'],{'Content-Disposition':`attachment; filename="${EXCEL_NAME}"`}):json(res,404,{ok:false,error:'Excel atualizado não encontrado na pasta dados.'});
 if(req.method==='GET'&&url.pathname==='/api/export')return send(res,200,fs.readFileSync(path.join(DIST,'data.json')),types['.json'],{'Content-Disposition':'attachment; filename="projetos_ppi.json"'});
 if(req.method==='GET'&&url.pathname.startsWith('/api/pdf/')){const name=path.basename(decodeURIComponent(url.pathname.slice(9))),updated=path.join(UPDATED,name);const data=fs.existsSync(updated)?fs.readFileSync(updated):pdfFromBase(name);return data?send(res,200,data,types['.pdf'],{'Content-Disposition':`attachment; filename="${name.replaceAll('"','')}"`}):json(res,404,{ok:false,error:'PDF não encontrado'})}
 let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';let target=path.resolve(DIST,relative);if(!target.startsWith(path.resolve(DIST))||!fs.existsSync(target)||fs.statSync(target).isDirectory())target=path.join(DIST,'index.html');send(res,200,fs.readFileSync(target),types[path.extname(target)]||'application/octet-stream');
});const port = Number(process.env.PORT || process.env.PPI_DASHBOARD_PORT || 49175);
const host = process.env.PORT ? '0.0.0.0' : '127.0.0.1';

server.listen(port, host, () => {
  const address = server.address();

  console.log(
    `Centro de Inteligência PPI disponível na porta ${address.port}`
  );

  // Só abre o navegador automaticamente no Windows/local.
  if (!process.env.PORT && process.platform === 'win32') {
    const url = `http://127.0.0.1:${address.port}`;

    spawn(
      'cmd.exe',
      ['/d', '/c', 'start', '', url],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    ).unref();
  }
});
;
