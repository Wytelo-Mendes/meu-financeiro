# Meu Financeiro

Aplicativo web instalável (PWA) de controle financeiro pessoal, em português.

## Recursos

- Resumo mensal de entradas, saídas e saldo.
- Lançamentos com categoria, data e observação.
- Metas com progresso e aportes manuais.
- Registro de aportes e retiradas de investimentos.
- Cópia de segurança e restauração em JSON.
- Categorias padrão e categorias personalizadas por conta.
- Comparação de planejamento mensal com valores realizados.
- Relatórios mensais por categoria, com comparação de planejado/realizado, exportação CSV e impressão profissional em PDF pelo navegador.
- Interface adaptada a celular, tablet e computador, com navegação lateral e área de trabalho ampliada em telas grandes.
- Aplicativo e interface disponíveis offline após o primeiro acesso.

## Como abrir para desenvolvimento

Abra esta pasta com um servidor HTTP local. O service worker e a instalação PWA precisam de `localhost` durante desenvolvimento ou de um endereço HTTPS em produção. Abrir `index.html` diretamente como arquivo não ativa essas funções.

## Instalar no celular

Publique os arquivos em um site com HTTPS. Toque em **Instalar** na tela inicial do app para ver as instruções do aparelho. No Android, use Chrome e confirme **Instalar aplicativo** (ou **Adicionar à tela inicial**) quando solicitado. No iPhone/iPad, abra o endereço no Safari, toque em **Compartilhar → Adicionar à Tela de Início**. O iOS não abre o mesmo prompt de instalação dos navegadores Android.

## Importar os dados da planilha

O arquivo `meu-financeiro-dados-pessoais.json` é uma cópia separada com seus lançamentos e planejamento migrados. No app, toque no ícone de backup, escolha **Restaurar uma cópia** e selecione esse arquivo. Ele pode ser importado depois de abrir o app no celular. Mantenha esse arquivo privado e não o coloque no mesmo site público do aplicativo.

## Armazenamento e conta

O app usa Supabase Auth para criar conta e entrar com e-mail e senha. Após entrar, lançamentos, metas, categorias personalizadas, planejamentos e cartões são sincronizados com as tabelas protegidas por RLS. A chave publicável do Supabase fica no código do navegador; nunca use a chave `service_role`/secret neste app. O backup JSON continua disponível.

Ao entrar pela primeira vez, se as tabelas do usuário estiverem vazias, os dados já existentes neste navegador são enviados à conta. Se a conta já tiver dados na nuvem, eles substituem a cópia local. Para levar os dados da planilha, importe o JSON pessoal pelo menu de backup depois de entrar.

No Supabase, mantenha a confirmação de e-mail habilitada ou desabilitada conforme preferir em **Authentication → Providers → Email**. Com confirmação habilitada, confirme o link enviado ao e-mail e depois entre no app. As tabelas são privadas por usuário via RLS.

## Escopo desta versão

O aplicativo foi organizado a partir dos módulos identificados na planilha. A cópia de dados separada contém os lançamentos registrados, as categorias, o planejamento mensal e o cartão cadastrado. A aba de registro de investimentos não tinha movimentações para importar. Os macros do Excel precisam ser recriados caso algum fluxo específico dependa deles.

## Supabase

O esquema e as instruções de configuração estão em `supabase/SETUP.md`. O app está conectado ao projeto Supabase configurado no `app.js`.

## Painel administrativo

Após definir `profiles.role = 'admin'`, o app mostra a aba **Admin** com lista de contas, busca, plano e status. O painel não lê lançamentos financeiros dos clientes. Para salvar alterações de plano/status, aplique a migração `supabase/migrations/202610100001_admin_account_management.sql` no SQL Editor do Supabase. Os planos são metadados; ainda não há cobrança integrada.

## Categorias por conta

Contas de clientes começam com as categorias padrão de despesa **Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Compras e Outros** e podem criar categorias próprias pela tela de lançamentos. Categorias personalizadas ficam associadas à conta que as criou; não são compartilhadas com o administrador nem com outros clientes. O banco aplica RLS por `user_id` nas tabelas, isolando os registros entre usuários.

O armazenamento local do navegador também é separado por conta. Ao entrar pela primeira vez com uma conta sem dados na nuvem, o app não copia automaticamente dados locais de outra conta; para migrar dados, entre na conta correta e restaure seu próprio arquivo de backup.
