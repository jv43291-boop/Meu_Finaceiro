# Live Finanças

Aplicativo de finanças pessoais em Expo, React Native e TypeScript, sucessor do Meu Financeiro 1.0. É **offline-first**: os dados ficam no SQLite do celular e sincronizam com o Supabase quando há conexão. Pacote Android `com.victor.live`, que instala ao lado do app antigo.

## Visão geral

```text
                         LIVE FINANÇAS
                              │
                 ┌────────────┴────────────┐
           React Native                Expo Router
                 └────────────┬────────────┘
                              │
                 Domínio (src/domain, TypeScript puro)
                              │
          ┌───────────────────┼───────────────────┐
        SQLite            Supabase (RLS)     Motor de sync
      (src/db)             (supabase/)        (src/sync)
          └───────────────────┴───────────────────┘
                              │
                     Regras financeiras
       ┌──────────────────────┼──────────────────────┐
   Lançamentos          Cartões/Faturas         Recorrências
       └──────────────────────┼──────────────────────┘
                              │
                        Planejamento
         ┌──────────┬─────────┼─────────┬──────────┐
    Orçamentos    Metas   Projeção   Análises   Pix/recibos
```

## Arquitetura do projeto

| Camada | Responsabilidade |
|---|---|
| `src/app` | Rotas e telas (Expo Router) |
| `src/domain` | Regras financeiras puras e testáveis: dinheiro, datas, recorrência, cartões, planejamento, projeção, análise, Pix, integridade |
| `src/db` | SQLite: schema com migrações (`PRAGMA user_version`), leitura/gravação, fila local do sync e diagnóstico |
| `src/state` | Providers: finanças, nuvem/sync, lembretes, bloqueio |
| `src/sync` | Motor de sincronização, Supabase, relógio das alterações, isolamento entre contas |
| `src/ui` | Componentes, tema claro/escuro, formulários, gráficos |
| `modules/receipt-reader` | Módulo nativo próprio: PDF → imagem e leitura de texto com posição (ML Kit no Android, Vision no iOS) |
| `supabase/migrations` | Tabelas, RLS e gatilhos do servidor |

## Regras financeiras importantes

- **Dinheiro em centavos (inteiros).** Nada de soma em ponto flutuante.
- **Recorrência é uma regra**, não N cópias: "R$ X todo dia D, de início até fim (ou sem fim)". Os meses aparecem projetados e só viram registro quando pagos, editados ou pulados. Editar pergunta: só este mês, este e os próximos, ou todos. Excluir "só este mês" grava um marcador para aquele mês não voltar.
- **Saldo por conta** = saldo inicial + tudo que já foi pago ou recebido. Não existe "fechar mês".
- **Cartão:** a fatura é identificada pelo mês de vencimento. Compra no dia do fechamento ou depois cai na fatura seguinte. Parcelas se espalham pelas faturas seguintes, e "Todo mês" no cartão vira assinatura. Compra no cartão não mexe no saldo: o que sai da conta é o **pagamento da fatura**, que não conta de novo como gasto de categoria.
- **Orçamentos e gasto por categoria** contam pela data da despesa. Compras no cartão entram pela data da compra, inclusive as parceladas, e os fixos previstos também entram. Pagamento de fatura fica de fora. Aviso a partir de 80% do limite; estourado acima de 100%.
- **Fluxo de caixa, projeção e "receitas × despesas"** usam o dia em que o dinheiro entra ou sai, com as faturas no vencimento.
- **Projeção de saldo** (Início), para 7, 30, 60 e 90 dias:
  - o ponto de partida é o saldo de hoje; somam-se os lançamentos em aberto, os fixos, as parcelas e as faturas;
  - a fatura aberta entra pelo valor atual somado às assinaturas previstas até o fechamento;
  - **os atrasados não entram**: aparecem como aviso;
  - **as metas não mexem no saldo**;
  - dá para ver o total ou cada conta.
- **Comprometimento da renda** = (fixos + parcelas + faturas do mês) ÷ receitas do mês. Fixos e parcelas no cartão entram só pela fatura.
- **Metas** calculam quanto guardar por mês até a data-alvo.

## Funcionalidades

- Contas, categorias, lançamentos, recorrências (Fixos), parcelamentos.
- Cartões de crédito e faturas, com pagamento parcial e restante.
- Orçamentos por categoria, metas e relatórios:
  - gasto por categoria;
  - receitas × despesas em 6 meses;
  - mês atual × anterior;
  - indicadores do mês: comprometimento, fixos, parcelas futuras, próxima fatura e saldo em 30 dias.
- Início com a projeção do saldo e "O que mudou este mês?".
- **Comprovante de Pix** (Mais → Lançar comprovante de Pix, ou "Compartilhar → Live" no app do banco):
  - a leitura é feita no aparelho: foto ou PDF → OCR → valor, recebedor, CPF/CNPJ, data, hora e ID do Pix;
  - uma tela de conferência aparece sempre, e nada é lançado sem confirmação;
  - **gasto ou receita**: o app só escolhe sozinho quando o comprovante mostra o sentido — o seu nome/CPF em um dos lados (aprendido dos comprovantes que você confirmou, guardado só no aparelho e apagado ao sair da conta) ou frases como "Pix enviado"/"Você recebeu". Sem isso, a tela pede "Paguei" ou "Recebi" e não lança nada até você escolher; você dos dois lados vira aviso de transferência entre suas contas;
  - **regras por recebedor** (ex.: "José Ribeiro" vira "Compra de pão"), com sugestão pelo histórico quando não há regra;
  - aviso de comprovante repetido;
  - **mês certo:** entra na data do Pix escrita no comprovante, não no dia em que foi lido (Pix de agosto lido em setembro vai para agosto). Sem data legível, o campo fica vazio para digitar; data no futuro pede confirmação;
  - funciona só no APK, porque usa o módulo nativo.
- **Importar extrato** (Mais → Importar extrato do mês, ou "Importar como extrato" quando um extrato cai na tela de comprovante):
  - lê todas as páginas do PDF (até 30) no aparelho; cada linha com data e valor vira um lançamento;
  - gasto ou entrada pelo sinal do valor ("-", "D"/"C", "+"); sem sinal, pelas palavras ("Pix enviado", "Salário"…); sem nada disso, a linha fica com "?" e não entra até você escolher;
  - saldos e totais do dia não entram; aplicação, resgate, fatura do cartão e o que já está no app vêm desmarcados;
  - importar o mesmo extrato de novo não duplica: cada linha guarda uma chave.
- Lembretes de vencimento: notificações locais que agrupam o mesmo dia, com opção de esconder o valor na tela bloqueada.
- Bloqueio com digital ou rosto, com a senha do celular como alternativa.
- Exportar para planilha: CSV no padrão brasileiro.
- Importar o backup do Meu Financeiro 1.0.
- Personalizar: tema claro/escuro, cor de destaque, foto de fundo e "esconder valores".
- Diagnóstico (Mais → Avançado):
  - SQLite, registros por tabela, conta, Supabase, estado da sincronização e relógio;
  - "Revalidar integridade", que só aponta problemas, sem corrigir;
  - compartilhar o diagnóstico sem valores nem nomes.

## Offline-first e sincronização

```text
Pessoa ─► SQLite no celular ─► app funciona sem internet
                  │
       fila (dirty + quarentena local)
                  │
              Supabase ─► RLS por usuário, chave (user_id, id)
```

- **Sincroniza sozinho:** ao abrir o app, 3 s depois de cada alteração, a cada 5 min e no botão. Um registro por vez, e vence a alteração mais recente. O gatilho `live_sync_stamp` do servidor ignora versões mais antigas.
- **Relógio das alterações** (`src/sync/clock.ts`):
  - nunca volta para trás: cada alteração fica depois de qualquer versão que o aparelho já viu;
  - é corrigido pela hora do servidor; acima de 2 min de diferença, o app avisa.
- **Fila:**
  - um registro recusado pelo servidor vai para a quarentena e não trava o resto;
  - ele é tentado de novo em 5 min, 15 min, 1 h e depois a cada 6 h, ou na hora se for editado;
  - sem internet, o estado é "sem internet", com novas tentativas em 30 s, 1, 2, 5, 10, 20 e 30 min;
  - em Conta e sincronização aparecem as pendências e os recusados, com "Tentar de novo" e "Descartar".
- **Isolamento entre contas** (`src/sync/account.ts`):
  - sair da conta envia o que está pendente (e avisa se não conseguir) e **apaga tudo do aparelho**: dados, preferências, foto de fundo, lembretes, bloqueio e cache;
  - entrar numa conta diferente da dona do aparelho apaga antes de sincronizar;
  - dados criados sem conta sobem para a primeira conta que entrar;
  - a conta e as categorias padrão nascem com data antiga, para nunca sobrescrever a versão da nuvem.

### Configurar o Supabase

1. No **SQL Editor** do projeto, rode em ordem os arquivos de `supabase/migrations`:
   - `20260925000000_live_sync.sql`: tabelas, RLS e gatilho;
   - `20260926000000_live_cards.sql`: cartões;
   - `20260927000000_live_planning.sql`: orçamentos e metas;
   - `20260928000000_live_pix.sql`: ID do Pix e regras de recebedor;
   - `20260929000000_live_isolamento.sql`: chave `(user_id, id)`.

   Nenhum deles mexe na tabela antiga `finance_backups`.
2. Copie `.env.example` para `.env` e preencha `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com a chave **publishable**. Nunca use a chave secret/service_role no app.
3. **E-mail de confirmação** (Authentication no painel do Supabase). O envio de e-mail que vem de fábrica só entrega para os e-mails da equipe do projeto e manda poucos por hora. Escolha um:
   - **app pessoal:** em *Sign In / Providers → Email*, desligue **Confirm email**. A conta já entra sincronizando assim que é criada;
   - **manter a confirmação:** configure um SMTP próprio em *Emails → SMTP Settings* (ex.: Resend ou Brevo) e, em *Emails → Templates → Confirm signup*, inclua `{{ .Token }}` para o app aceitar o código. O link sozinho não serve no celular, porque aponta para o *Site URL*.

   No app, depois de criar a conta, aparece a confirmação por código, com "Reenviar e-mail".
4. `node scripts/verificar-supabase.mjs` confere se o projeto responde e se as tabelas existem. O script nunca mostra a chave.

Ao entrar com a conta do app antigo, o Live encontra o backup em `finance_backups` e oferece a importação.

## Testes

```text
TESTES (vitest)
├── Domínio ........ dinheiro, datas, recorrência, operações, CSV, lembretes
├── Cartões ........ fatura, parcelas, pagamento
├── Planejamento ... orçamentos, metas, projeção, análise do mês
├── Pix/recibo ..... parser por banco, gasto × receita, casos ambíguos, regras, histórico
├── Extrato ........ três formatos de extrato, sinal × palavras, saldos, repetidos
├── Integridade .... checagens e diagnóstico sem dados sensíveis
└── Sync/offline ... motor, relógio, fila/quarentena, isolamento A↔B
                     (SQLite real via sql.js, só nos testes)
```

```bash
npm run typecheck
npm run lint
npm test
```

Todos os dados dos testes são fictícios.

## Desenvolvimento

```bash
npm install
npx expo start
```

- Expo Go serve para telas e lógica. Comprovante de Pix, ícone e splash só aparecem no APK.
- `npm run apk`: gera o APK de teste no EAS (perfil `preview`). É necessário quando entra código nativo.
- `npm run atualizar`: manda a atualização pelo ar (EAS Update, canal `preview`). Serve para mudança só de tela ou de lógica.
- `npm run icons`: gera ícone e splash a partir de `assets/brand/logo.svg`.

## Roteiro

Só o que ainda **não** existe no código:

- Assistente com IA, que interpreta os números calculados pelo domínio. Aguarda decisão sobre custo, provedor e privacidade; precisa de back-end, porque a chave não pode ficar no app.
- Ajuste da leitura de comprovante com exemplos reais de cada banco (Itaú, Santander, PicPay, Nubank, Banco do Brasil, Caixa Tem, Caixa e Bradesco).
- Ajuste da leitura de extrato com o PDF real de cada banco.
- Transferência entre contas; importar OFX/CSV; backup em arquivo sem nuvem; widget no Android.
- Resumo do comprometimento futuro do cartão; notificação de saldo projetado baixo.
- Finanças familiares (compartilhamento e permissões); relatórios em PDF.
