# SIG municipal PPI — validação antes de publicar

Este diretório reúne a preparação para uma futura camada geográfica **municipal**, sem modificar o dashboard atualmente publicado. A base de projetos permanece em `dist/data.json`.

## Critérios

1. Projeto de município único: parear nome e UF com um único código IBGE de sete dígitos. Código homônimo sem UF ou resultado ambíguo => pendência.
2. Consórcio: usar a **sede administrativa documentalmente comprovada** como município de referência; manter municípios beneficiados em campo distinto. A palavra `consórcio` no título indica necessidade de revisão, não comprova sede.
3. Abrangência estadual, regional ou município não identificado: não mapear por suposição nem atribuir a capital da UF.
4. Coordenadas de centroide/ponto interno e geometria municipal representam o município e **não** a localização exata da obra.
5. Não remover projetos da carteira original. A camada municipal é um subconjunto auditável; todas as exclusões e pendências devem ficar registradas.

## Referências oficiais

- Códigos municipais e API de localidades do IBGE: https://servicodados.ibge.gov.br/api/v1/localidades/municipios
- Malhas territoriais IBGE: https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html

## Bloqueios de publicação

O SIG só deve aparecer no site depois de comparar todos os registros com as fichas PDF, confirmar sedes de consórcios e parear com código e geometria IBGE; obter GeoJSON municipal comprovado; revisar inconsistências e testar interface, filtros, contagens e ligações às fichas. **Não publicar GeoJSON vazio como mapa pronto.**

O código nesta branch é uma preparação em revisão; a branch `main` e o deploy atual ficam intactos.
