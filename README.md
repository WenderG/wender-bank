# Wender Bank

Aplicativo pessoal de controle financeiro criado por **@WenderG**.

Controle saldo, gastos, metas (caixinhas) e dívidas de forma simples, tudo armazenado localmente no aparelho.

## Funcionalidades (v1.0.0)

- **Painel inicial**: saldo total, disponível e reservado; entradas e saídas; dívidas em aberto; atalhos rápidos e últimas movimentações.
- **Movimentações**: registro de receitas e despesas com categoria; histórico completo; exclusão com confirmação.
- **Caixinhas**: criação de metas, aportes que reservam valor do saldo disponível, barra de progresso e exclusão (libera o valor reservado).
- **Dívidas**: registro que lança despesa completa; acompanhamento de pagamentos parciais; exclusão que remove também a despesa original.
- **Resumo financeiro**: entradas x saídas do mês, despesas por categoria e visão geral de saldos.
- **Persistência**: SQLite local (dados permanecem após fechar o app).

## Stack

- Expo SDK 58 / React Native 0.88 / React 19
- TypeScript
- expo-sqlite

## Como executar

Requer **Node.js 22.13** ou superior.

```bash
# Clone o repositório (ou baixe o ZIP)
git clone https://github.com/SEU_USUARIO/wender-bank.git
cd wender-bank

# Instale as dependências
npm install

# Inicie o Expo
npx expo start
```

Depois escaneie o QR Code com o app **Expo Go** (Android/iOS) ou pressione `a` para emulador Android / `w` para web.

## Gerar APK (opcional)

Com [EAS CLI](https://docs.expo.dev/build/setup/) configurado:

```bash
eas build --platform android --profile preview
```

O perfil `preview` gera um APK instalável.

## Regras de cálculo

- O **saldo total** é a soma de todas as entradas menos todas as saídas.
- O **saldo disponível** = saldo total − valor reservado nas caixinhas.
- Registrar uma **dívida** lança o valor integral como despesa e cria o compromisso em aberto.
- **Pagamentos parciais** de dívida atualizam apenas o compromisso (não descontam o saldo novamente).
- **Aportes em caixinhas** movem valor do disponível para o reservado.
- **Excluir uma caixinha** libera novamente o valor que estava reservado.
- Excluir uma movimentação vinculada a dívida só é permitido pela aba Dívidas (remove os dois registros juntos).

## Atenção

Versão de uso pessoal. Os dados ficam **somente no aparelho**. Desinstalar o app ou limpar os dados do aplicativo apaga tudo. Para uso definitivo, implemente exportação/backup antes.

---

Feito por **@WenderG**
