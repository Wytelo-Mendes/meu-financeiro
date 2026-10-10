# Meu Financeiro

Aplicativo web instalável (PWA) de controle financeiro pessoal, em português.

## Recursos

- Resumo mensal de entradas, saídas e saldo.
- Lançamentos com categoria, data e observação.
- Metas com progresso e aportes manuais.
- Registro de aportes e retiradas de investimentos.
- Cópia de segurança e restauração em JSON.
- Categorias personalizadas para entradas e saídas.
- Comparação de planejamento mensal com valores realizados.
- Interface adaptada a celular, tablet e computador.
- Aplicativo e interface disponíveis offline após o primeiro acesso.

## Como abrir para desenvolvimento

Abra esta pasta com um servidor HTTP local. O service worker e a instalação PWA precisam de `localhost` durante desenvolvimento ou de um endereço HTTPS em produção. Abrir `index.html` diretamente como arquivo não ativa essas funções.

## Instalar no celular

Publique os arquivos em um site com HTTPS. Abra o endereço no navegador do celular e escolha **Adicionar à tela inicial** ou **Instalar aplicativo** no menu do navegador. No iPhone, use **Compartilhar → Adicionar à Tela de Início** no Safari.

## Importar os dados da planilha

O arquivo `meu-financeiro-dados-pessoais.json` é uma cópia separada com seus lançamentos e planejamento migrados. No app, toque no ícone de backup, escolha **Restaurar uma cópia** e selecione esse arquivo. Ele pode ser importado depois de abrir o app no celular. Mantenha esse arquivo privado e não o coloque no mesmo site público do aplicativo.

## Armazenamento e conta

O app usa Supabase Auth para criar conta e entrar com e-mail e senha. Após entrar, lançamentos, metas, categorias personalizadas, planejamentos e cartões são sincronizados com as tabelas protegidas por RLS. A chave publicável do Supabase fica no código do navegador; nunca use a chave `service_role`/secret neste app. O backup JSON continua disponível.

Ao entrar pela primeira vez, se as tabelas do usuário estiverem vazias, os dados já existentes neste navegador são enviados à conta. Se a conta já tiver dados na nuvem, eles substituem a cópia local. Para levar os dados da planilha, importe o JSON pessoal pelo menu de backup depois de entrar.

No Supabase, mantenha a confirmação de e-mail habilitada ou desabilitada conforme preferir em **Authentication → Providers → Email**. Com confirmação habilitada, confirme o link enviado ao e-mail e depois entre no app. As tabelas são privadas por usuário via RLS.

## Escopo desta versão

O aplicativo foi organizado a partir dos módulos identificados na planilha. A cópia de dados separada contém os lançamentos registrados, as categorias, o planejamento mensal e o cartão cadastrado. A aba de registro de investimentos não tinha movimentações para importar. Os macros do Excel precisam ser recriados caso algum fluxo específico dependa deles.

## Supabase

O esquema e as instruções de configuração estão em `supabase/SETUP.md`. O app está conectado ao projeto Supabase configurado no `app.js`. Para torná-lo SaaS com outros usuários e planos pagos, ainda serão necessários painel administrativo e integração de cobrança no servidor.
