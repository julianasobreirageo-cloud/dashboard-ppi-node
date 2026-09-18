// Auditoria preliminar: node sig/validar-municipios-ibge.mjs
// Nao altera a base publica e nao atribui coordenadas nem sedes sem documento.
import fs from 'node:fs';
import path from 'node:path';
const ROOT=process.cwd();
const projects=JSON.parse(fs.readFileSync(path.join(ROOT,'dist','data.json'),'utf8'));
if(!Array.isArray(projects))throw new Error('Base invalida: esperado array de projetos');
const normalize=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,' ').trim().toUpperCase();
const seatFile=path.join(ROOT,'dados','sig','sedes_consorcios.csv');
const seats=new Map();
if(fs.existsSync(seatFile)){
 const lines=fs.readFileSync(seatFile,'utf8').trim().split(/\r?\n/);const keys=lines.shift().split(',');
 for(const line of lines){if(!line.trim())continue;const fields=line.split(',');if(fields.length!==keys.length)throw new Error('CSV de sedes: numero de colunas invalido; evite virgulas nos campos');const s=Object.fromEntries(keys.map((k,i)=>[k.trim(),fields[i].trim()]));if(!s.numero||seats.has(s.numero))throw new Error('Sede com identificador ausente ou duplicado: '+s.numero);seats.set(s.numero,s);}
}
const response=await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios');
if(!response.ok)throw new Error('Consulta ao IBGE falhou: HTTP '+response.status);
const municipalities=await response.json();
if(!Array.isArray(municipalities)||municipalities.length<5000)throw new Error('Resposta IBGE incompleta: auditoria interrompida');
const byName=new Map(),byCode=new Map();
for(const m of municipalities){const uf=m.microrregiao?.mesorregiao?.UF?.sigla??m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla;if(!uf||!Number.isInteger(m.id)||!m.nome)continue;const item={codigo_ibge:m.id,nome:m.nome,uf};const key=uf+'|'+normalize(m.nome);byName.set(key,[...(byName.get(key)||[]),item]);byCode.set(String(m.id),item);}
const ids=new Set(),records=[];
for(const p of projects){
 const id=String(p.numero??'').trim(),raw=String(p.municipio??'').trim(),originalUf=String(p.uf??'').trim().toUpperCase();
 const title=[p.projeto,p.municipio,p.categoria].join(' '),consorcio=/cons[oó]rcio/i.test(title),seat=seats.get(id),issues=[];
 if(!id||ids.has(id))issues.push('IDENTIFICADOR_AUSENTE_OU_DUPLICADO');else ids.add(id);
 if(seat&&!consorcio)issues.push('SEDE_INFORMADA_PARA_PROJETO_NAO_IDENTIFICADO_COMO_CONSORCIO');
 if(consorcio&&!seat)issues.push('CONSORCIO_EXIGE_SEDE_COMPROVADA_NO_PDF');
 if(seat&&(!seat.fonte_documental||!seat.pagina_ou_trecho||!seat.conferido_por||!seat.data_conferencia))issues.push('SEDE_SEM_EVIDENCIA_DOCUMENTAL_COMPLETA');
 const uf=seat?String(seat.uf_sede??'').toUpperCase():originalUf;
 const name=seat?String(seat.municipio_sede??'').trim():raw.replace(/\s*\([A-Z]{2}\)\s*$/,'').trim();
 const match=raw.match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/);
 if(!seat&&match&&match[2]!==originalUf)issues.push('UF_DIVERGENTE');
 if(!name||!/^[A-Z]{2}$/.test(uf))issues.push('MUNICIPIO_OU_UF_AUSENTE_OU_INVALIDA');
 if(/[,;/]|\s+e\s+/i.test(name))issues.push('MULTIPLOS_MUNICIPIOS_REVISAR');
 if(!seat&&/\b(estadual|regional|intermunicipal|metropolitano|multimunicipal|microrregional)\b/i.test(normalize(title).toLowerCase()))issues.push('ABRANGENCIA_TERRITORIAL_EXIGE_REVISAO');
 const matches=byName.get(uf+'|'+normalize(name))||[];
 if(matches.length!==1)issues.push(matches.length?'MUNICIPIO_IBGE_AMBIGUO':'MUNICIPIO_NAO_LOCALIZADO_IBGE');
 const candidate=matches.length===1?matches[0]:null;
 if(seat&&(!/^\d{7}$/.test(String(seat.codigo_ibge??''))||!byCode.has(String(seat.codigo_ibge))||candidate?.codigo_ibge!==Number(seat.codigo_ibge)))issues.push('CODIGO_IBGE_DA_SEDE_DIVERGENTE');
 records.push({numero:p.numero,projeto:p.projeto,municipio_original:raw,uf_original:originalUf,municipio_representado:name,uf_representada:uf,tipo_representacao:consorcio?'SEDE_ADMINISTRATIVA_CONSORCIO':'MUNICIPIO_CANDIDATO',municipio_ibge:candidate?.nome??null,codigo_ibge:candidate?.codigo_ibge??null,consorcio_indicio:consorcio,fonte_sede:seat?.fonte_documental??null,referencia_sede:seat?.pagina_ou_trecho??null,fonte_pdf:p.arquivo??null,fonte_ppi:p.url??null,status:issues.length?'PENDENTE':'CANDIDATO_IBGE_AGUARDA_REVISAO_DOCUMENTAL_E_GEOMETRIA',pendencias:issues});
}
for(const id of seats.keys())if(!ids.has(id))throw new Error('Sede cadastrada para projeto inexistente: '+id);
const summary={total:projects.length,ids_unicos:ids.size,sedes_cadastradas:seats.size,sedes_sem_pendencias_automaticas:records.filter(r=>r.consorcio_indicio&&r.status!=='PENDENTE').length,codigos_ibge_sem_pendencias:records.filter(r=>r.status!=='PENDENTE').length,pendentes:records.filter(r=>r.status==='PENDENTE').length,geometrias_validadas:0,nota:'Sede administrativa de consorcio nao e local da obra. Cadastro exige documento, trecho, revisor e data. Candidatos nao estao liberados para publicacao sem revisao documental e geometria.'};
const out=path.join(ROOT,'dados','sig');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'auditoria_ibge.json'),JSON.stringify({summary,fonte:'https://servicodados.ibge.gov.br/api/v1/localidades/municipios',records},null,2));fs.writeFileSync(path.join(out,'pendencias_ibge.json'),JSON.stringify(records.filter(r=>r.status==='PENDENTE'),null,2));console.log(JSON.stringify(summary,null,2));
