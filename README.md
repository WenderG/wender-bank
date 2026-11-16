# Wender Bank

Controle financeiro simples no estilo planilha.  
Criado por **@WenderG**.

## Como funciona

| Conceito | Regra |
|----------|--------|
| **Carteira** | Dinheiro disponível. Pode adicionar ou remover, mas nunca fica negativa. |
| **Despesas** | O que você precisa pagar. Podem ser parceladas. |
| **Saldo atual** | Carteira − despesas em aberto (pode ser negativo). |
| **Entradas** | Valores positivos que entram na carteira. |
| **Fatura** | Movimentações do mês vigente. |
| **Tags** | Categorias para organizar e gerar gráficos. |

Dados com mais de **6 meses** são apagados automaticamente.

## Telas

- **Início** — saldo, carteira, despesas abertas
- **Fatura** — entradas e despesas do mês (segure para excluir)
- **Lançar** — nova entrada, despesa ou ajuste de carteira
- **Análise** — gráficos do mês por tag

## Instalação (APK)

1. Em **Releases**, baixe o `.apk`
2. Instale no celular

## Desenvolvimento

```bash
npm install
npx expo start
```

### Gerar APK

```bash
eas build --platform android --profile preview
```

Se der erro de Git:

```powershell
$env:EAS_NO_VCS=1
eas build --platform android --profile preview
```

---

@WenderG
