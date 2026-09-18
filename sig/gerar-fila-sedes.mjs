// Execute na raiz: node sig/gerar-fila-sedes.mjs
// Apenas cria fila de revisao; nunca infere ou atribui sede.
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const base=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
if(!Array.isArray(base))throw new Error('dist/data.json deve conter uma lista');
const out=path.join(root,'dados/sig');fs.mkdirSync(out,{recursive:true});
const rows=base.filter(p=>/cons[oó]rcio/i.test([p.projeto,p.municipio,p.categoria].join(' '))).map(p=>({numero:String(p.numero??''),projeto:p.projeto??'',municipio_original:p.municipio??'',uf_original:p.uf??'',arquivo_pdf:p.arquivo??'',pagina_ppi:p.url??'',municipio_sede:null,uf_sede:null,codigo_ibge:null,fonte_documental:null,pagina_ou_trecho:null,conferido_por:null,data_conferencia:null,situacao:'AGUARDA_CONFERENCIA_DOCUMENTAL'}));
const ids=new Set();for(const r of rows){if(!r.numero||ids.has(r.numero))throw new Error('Identificador ausente ou duplicado na fila: '+r.numero);ids.add(r.numero);}
const target=path.join(out,'fila_conferencia_sedes.json');fs.writeFileSync(target,JSON.stringify({total_projetos:base.length,total_consorcios_identificados:rows.length,criterio:'Indicio textual de consorcio; revisar tambem registros sem a palavra consorcio.',aviso:'Campos de sede vazios intencionalmente. Conferir PDF oficial antes de preencher sedes_consorcios.csv. Municipio-sede nao e local da obra.',registros:rows},null,2)+'\n');
console.log(`Fila criada: ${rows.length} indícios de consórcio entre ${base.length} registros. Sedes atribuídas automaticamente: 0. Arquivo: ${target}`);
