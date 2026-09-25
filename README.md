# Live Finanças

App de finanças pessoais em Expo (React Native), sucessor do Meu Financeiro 1.0. Pacote Android `com.victor.live` (instala ao lado do app antigo). Reescrita do zero: o celular é a fonte principal dos dados e a sincronização com o Supabase entra na fase 2.

## Rodar

```bash
npm install
npx expo start
```

Abra no Expo Go (Android) lendo o QR code, ou pressione `a` com um emulador aberto.

Verificações:

```bash
npm run typecheck
npm run lint
npm test
```

## Estrutura

| Pasta | O que tem |
|---|---|
| `src/domain` | Regras puras em TypeScript (dinheiro, datas, recorrência, resumo, importação). Sem React, com testes. |
| `src/db` | Schema SQLite com migrações (`PRAGMA user_version`) e leitura/gravação. |
| `src/state` | `FinanceProvider`: carrega o banco e expõe as ações para as telas. |
| `src/ui` | Componentes, tema claro/escuro, formulário de lançamento. |
| `src/app` | Telas (expo-router). |

## Decisões

- **Valores em centavos (inteiro).** Nada de soma em ponto flutuante.
- **Recorrência é uma regra**, não N cópias: "R$ X todo dia D, de início até fim (ou sem fim)". Os meses aparecem projetados e só são gravados quando pagos, editados ou pulados. Editar pergunta: só este mês, este e os próximos, ou todos.
- **Excluir "só este mês"** grava um marcador (registro com `deleted_at`) para aquele mês não reaparecer.
- **Saldo por conta** = saldo inicial + tudo que foi marcado como pago/recebido. Não existe "fechar mês": o saldo passa de um mês para o outro naturalmente, positivo ou negativo.
- **Toda tabela tem `updated_at`, `deleted_at` e `dirty`**, prontos para a sincronização registro a registro da fase 2.

## Visual

- Violeta `#5B45FF` como destaque padrão, fonte Plus Jakarta Sans, tema claro e escuro.
- **Mais → Personalizar**: foto de fundo da galeria, intensidade do véu (suave/médio/forte), desfoque, cor de destaque (violeta, azul, verde, rosa, laranja) e tema. A foto é reduzida para no máximo 1440 px e copiada para dentro do app; preenche a tela em qualquer proporção sem distorcer, e um véu na cor do tema mantém os textos legíveis. Se o arquivo sumir, o app volta ao fundo normal. Essas escolhas ficam só no aparelho (não sincronizam).
- Ícone e splash saem de `assets/brand/logo.svg`. Depois de mudar o desenho, rode `npm run icons` para gerar os PNGs.
- O Expo Go mostra o ícone dele; o ícone e o splash do Live só aparecem num build (`npx eas-cli@latest build -p android --profile preview`).

## Nuvem (Supabase)

Os dados ficam no celular e sincronizam sozinhos com o Supabase: ao abrir o app, alguns segundos depois de cada alteração e a cada 5 minutos. Vence a alteração mais recente de cada registro.

1. No Supabase (projeto `xnsajwmjezhabawctxla`), abra o **SQL Editor** e rode `supabase/migrations/20260925000000_live_sync.sql`. Ele cria `accounts`, `categories`, `recurrences` e `transactions` com RLS por usuário e não mexe na tabela antiga `finance_backups`.
2. Copie `.env.example` para `.env` e cole a chave **publishable** em `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca use a chave secreta ou service_role no app.
3. Reinicie o `npx expo start` e entre em **Mais → Conta e sincronização**.

Ao entrar com a mesma conta do app antigo, o Live encontra o backup em `finance_backups` e oferece a importação.

## Importar do app antigo

Em **Mais → Importar do app antigo**, escolha o JSON do backup (o `payload` da tabela `finance_backups`) ou cole o texto. Lançamentos recorrentes viram regras mensais de verdade.

## Roteiro

1. ~~Base local: contas, categorias, lançamentos, recorrência, parcelas, importação~~
2. ~~Login e sincronização automática com Supabase (tabelas novas + RLS)~~
3. Cartão de crédito e faturas
4. Orçamentos, metas e relatórios
5. Lembretes de vencimento, exportar CSV, biometria
