// Executar na raiz: node sig/testar-validacao.mjs
// Dados ficticios: NAO valida os 144 projetos reais.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ppi-sig-test-'));
const cwd=process.cwd(),fetchOriginal=globalThis.fetch;
try {
 fs.mkdirSync(path.join(root,'dist'));
 fs.writeFileSync(path.join(root,'dist','data.json'),JSON.stringify([
  {numero:1,projeto:'Iluminacao publica',municipio:'Alagoinhas (BA)',uf:'BA',arquivo:'001.pdf'},
  {numero:2,projeto:'Consórcio de saneamento',municipio:'Aracaju (SE)',uf:'SE',arquivo:'002.pdf'},
  {numero:3,projeto:'Projeto com UF divergente',municipio:'Aracaju (SE)',uf:'BA'},
  {numero:1,projeto:'Projeto duplicado',municipio:'Municipios',uf:'BA'},
  {numero:5,projeto:'Projeto regional de saneamento',municipio:'Aracaju (SE)',uf:'SE'}
 ]));
 const municipio=(id,nome,uf)=>({id,nome,microrregiao:{mesorregiao:{UF:{sigla:uf}}}});
 const ibge=[municipio(2900702,'Alagoinhas','BA'),municipio(2800308,'Aracaju','SE'),...Array.from({length:5000},(_,i)=>municipio(1000000+i,'Municipio ficticio '+i,'XX'))];
 globalThis.fetch=async url=>{assert.equal(url,'https://servicodados.ibge.gov.br/api/v1/localidades/municipios');return {ok:true,json:async()=>ibge};};
 process.chdir(root);
 await import('./validar-municipios-ibge.mjs');
 const audit=JSON.parse(fs.readFileSync(path.join(root,'dados','sig','auditoria_ibge.json'),'utf8'));
 const pending=JSON.parse(fs.readFileSync(path.join(root,'dados','sig','pendencias_ibge.json'),'utf8'));
 assert.equal(audit.summary.total,5);
 assert.equal(audit.summary.ids_unicos,4);
 assert.equal(audit.summary.codigos_ibge_sem_pendencias,1);
 assert.equal(audit.summary.pendentes,4);
 assert.equal(audit.summary.geometrias_validadas,0);
 assert.equal(audit.records[0].codigo_ibge,2900702);
 assert.ok(audit.records[1].pendencias.includes('CONSORCIO_EXIGE_SEDE_COMPROVADA_NO_PDF'));
 assert.ok(audit.records[2].pendencias.includes('UF_DIVERGENTE'));
 assert.ok(audit.records[3].pendencias.includes('IDENTIFICADOR_AUSENTE_OU_DUPLICADO'));
 assert.ok(audit.records[4].pendencias.includes('ABRANGENCIA_TERRITORIAL_EXIGE_REVISAO'));
 assert.equal(pending.length,4);
 console.log('TESTE OK: 5 registros ficticios, 1 candidato, 4 pendentes, 0 geometrias.');
} finally {process.chdir(cwd);globalThis.fetch=fetchOriginal;fs.rmSync(root,{recursive:true,force:true});}
