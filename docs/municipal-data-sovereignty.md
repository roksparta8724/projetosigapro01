# Soberania de dados municipais no SIGAPRO

## Objetivo

O SIGAPRO deve permitir que cada Prefeitura escolha onde os arquivos oficiais do processo ficam fisicamente armazenados, sem misturar objetos entre municípios e sem obrigar todos os clientes a usar o armazenamento da plataforma.

A arquitetura possui dois níveis distintos:

1. **BYOS — Bring Your Own Storage**: a Prefeitura conecta um repositório S3 compatível (AWS S3, MinIO, Ceph, R2 próprio ou gateway equivalente). O SIGAPRO continua sendo a aplicação que autoriza e entrega os arquivos aos usuários permitidos, mas os bytes ficam no ambiente escolhido pela Prefeitura.
2. **Soberania criptográfica / BYOK**: a Prefeitura também controla a chave de criptografia. Nesse modo, nem o operador da plataforma deve conseguir descriptografar o conteúdo sem uma autorização/chave municipal. Este nível exige integração com KMS/HSM ou criptografia no cliente/gateway municipal e não deve ser confundido com simples BYOS.

## Estado atual

Enquanto uma Prefeitura não tiver contratado/configurado um repositório próprio:

- arquivos de processo continuam no Cloudflare R2 do SIGAPRO;
- cada objeto permanece prefixado por municipality_id;
- permissões de aplicação e escopo municipal continuam obrigatórias.

Quando um administrador municipal configurar, testar e ativar um repositório próprio:

- novos arquivos oficiais de processo são enviados para o bucket municipal;
- leitura por URL temporária, exclusão e recuperação de uploads usam o mesmo repositório;
- o objectKey lógico continua estável no banco, evitando acoplamento do processo ao fornecedor de storage;
- branding/logos continuam no storage da plataforma por enquanto;
- metadados transacionais, perfis, tramitação, pagamentos e auditoria continuam no banco operacional do SIGAPRO.

## Segurança das credenciais

Credenciais do storage municipal:

- nunca são enviadas novamente ao navegador;
- são cifradas no backend com AES-256-GCM;
- usam uma chave mestre server-side em `MUNICIPAL_STORAGE_MASTER_KEY`;
- são acessíveis apenas por funções de backend e RPCs controladas;
- devem utilizar endpoint HTTPS por padrão;
- podem ser rotacionadas sem mudar o objectKey lógico dos documentos.

## Fluxo administrativo

Configurações > Dados e armazenamento:

1. R2 do SIGAPRO permanece ativo por padrão.
2. O administrador informa endpoint, região, bucket, prefixo e credenciais.
3. Salvar não muda o storage ativo.
4. O SIGAPRO executa teste real de gravação.
5. Apenas após teste bem-sucedido o administrador pode ativar o repositório municipal.
6. É possível retornar ao R2 do SIGAPRO.

## Limite de segurança do BYOS

BYOS determina **onde os dados ficam**, mas não garante por si só que o software não possa ler os arquivos. Se o SIGAPRO gera uma URL assinada, faz preview ou entrega o PDF a um usuário autorizado, o backend possui capacidade técnica de intermediar esse acesso.

Para um contrato que determine que o fornecedor não possa descriptografar o conteúdo, adotar uma das estratégias:

- KMS/HSM da Prefeitura, com chave não exportável e autorização controlada pelo município;
- gateway municipal que assina e entrega os objetos após validar a identidade do usuário;
- criptografia de envelope com CMK municipal;
- criptografia no cliente, quando compatível com análise/preview/assinatura;
- banco e storage dedicados no ambiente do município quando o contrato exigir isolamento total.

## Banco de dados

O BYOS implementado nesta fase cobre arquivos (PDFs, projetos, anexos).

Se o município exigir que **também os dados estruturados** fiquem no ambiente dele, o próximo nível de arquitetura deve oferecer:

- Postgres dedicado por Prefeitura ou conexão com Postgres municipal;
- migrations versionadas por tenant;
- pool/roteamento por municipality_id;
- chave/segredo por conexão no backend;
- backup, retenção e restauração definidos no contrato;
- trilha de auditoria sem acesso transversal do operador, exceto suporte explicitamente autorizado.

## Princípio operacional

O SIGAPRO deve controlar o fluxo, identidade, autorização e experiência da aplicação. O local físico e a política criptográfica dos dados devem ser selecionáveis por Prefeitura conforme contrato, política de segurança e requisitos legais.
