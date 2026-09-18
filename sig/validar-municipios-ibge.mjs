// Auditoria preliminar: node sig/validar-municipios-ibge.mjs
// Nao modifica a base publica e nao atribui coordenadas ou sede de consorcio.
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const input=path.join(ROOT,'dist','data.json');
if(!fs.existsSync(input))throw new Error('Execute na raiz do repositorio: dist/data.json nao encontrado');
const projects=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(projects))throw new Error('Base invalida: esperado array de projetos');
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').trim().toUpperCase();
const response=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
if(!response.ok)throw new Error('Consulta ao IBGE falhou: HTTP '+response.status);
const municipalities=await response.json();
if(!Array.isArray(municipalities)||municipalities.length<5000)throw new Error('Resposta IBGE incompleta: auditoria interrompida');
const byName=new Map();
for(const m of municipalities){const uf=m.microrregiao?.mesorregiao?.UF?.sigla??m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;if(!uf||!Number.isInteger(m.id)||!m.nome)continue;const key=uf+'|'+normalize(m.nome);const list=byName.get(key)||[];list.push({codigo_ibge:m.id,nome:m.nome,uf});byName.set(key,list)}
const ids=new Set();const records=[];
for(const p of projects){
 const raw=String(p.municipio??'').trim(),uf=String(p.uf??'').trim().toUpperCase();
 const match=raw.match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/),name=(match?match[1]:raw).trim();
 const title=[p.projeto,p.municipio,p.categoria].join(' ');
 const consorcio=/cons[oó]rcio/i.test(title),issues=[];
 const id=String(p.numero??'').trim();
 if(!id||ids.has(id))issues.push('IDENTIFICADOR_AUSENTE_OU_DUPLICADO');else ids.add(id);
 if(match&&match[2]!==uf)issues.push('UF_DIVERGENTE');
 if(!name||!/^[A-Z]{2}$/.test(uf))issues.push('MUNICIPIO_OU_UF_AUSENTE_OU_INVALIDA');
 if(/[,;/]|\s+e\s+/i.test(name))issues.push('MULTIPLOS_MUNICIPIOS_REVISAR');
 if(consorcio)issues.push('CONSORCIO_EXIGE_SEDE_COMPROVADA_NO_PDF');
 if(/\b(estadual|regional|intermunicipal|metropolitano|multimunicipal|microrregional|abrangencia regional)\b/i.test(normalize(title).toLowerCase()))issues.push('ABRANGENCIA_TERRITORIAL_EXIGE_REVISAO');
 const matches=byName.get(uf+'|'+normalize(name))||[];
 if(matches.length!==1)issues.push(matches.length?'MUNICIPIO_IBGE_AMBIGUO':'MUNICIPIO_NAO_LOCALIZADO_IBGE');
 records.push({numero:p.numero,projeto:p.projeto,municipio_original:raw,uf,municipio_ibge:matches.length===1?matches[0].nome:null,codigo_ibge:matches.length===1?matches[0].codigo_ibge:null,consorcio_indicio:consorcio,fonte_pdf:p.arquivo??null,fonte_ppi:p.url??null,status:issues.length?'PENDENTE':'CANDIDATO_IBGE_AGUARDA_REVISAO_DOCUMENTAL_E_GEOMETRIA',pendencias:issues});
}
const summary={total:projects.length,ids_unicos:ids.size,codigos_ibge_sem_pendencias:records.filter(r=>r.status!=='PENDENTE').length,pendentes:records.filter(r=>r.status==='PENDENTE').length,geometrias_validadas:0,nota:'Correspondencia nominal IBGE e apenas candidata. Nenhum projeto esta liberado para publicacao sem revisao da ficha e da geometria; consorcios exigem sede comprovada.'};
const out=path.join(ROOT,'dados','sig');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'auditoria_ibge.json'),JSON.stringify({summary,fonte:'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',records},null,2));fs.writeFileSync(path.join(out,'pendencias_ibge.json'),JSON.stringify(records.filter(r=>r.status==='PENDENTE'),null,2));console.log(JSON.stringify(summary,null,2));
