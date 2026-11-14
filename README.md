# Wender Bank

Aplicativo pessoal de controle financeiro criado por **@WenderG**.

Pense nele como uma **planilha no celular**: você vê quanto entrou, quanto saiu e **quanto sobrou** (mesmo que seja negativo).

---

## Instalação no celular (APK)

1. Vá em **Releases** deste repositório
2. Baixe o arquivo `.apk` da versão mais recente
3. Abra o arquivo no celular e instale
4. Se o Android pedir, permita “Instalar apps desconhecidos”

---

## Funcionalidades

- **Painel inicial** — saldo total, entradas, saídas e **resultado** (pode ser negativo)
- **Movimentações** — lançamento livre de receitas e despesas
- **Caixinhas** — reserve dinheiro para um objetivo quando você já tem o valor
- **Dívidas / Parcelas** — só visualização (não altera o saldo sozinho)
- **Resumo** — gráficos de colunas do mês e por categoria
- **Dados locais** — tudo salvo no aparelho

---

## Como funciona

| Ação                        | Mexe no saldo?      |
|----------------------------|---------------------|
| Lançar Entrada / Saída     | Sim                 |
| Registrar Dívida / Parcela | Não (só visual)     |
| Guardar em Caixinha        | Reserva do disponível |
| Excluir Caixinha           | Libera o reservado  |

O **resultado** (entradas − saídas) aparece em verde quando positivo e em vermelho quando negativo.

---

## Gerar APK

```bash
npm install
eas login
eas build --platform android --profile preview
```

Se der erro de Git:

```powershell
$env:EAS_NO_VCS=1
eas build --platform android --profile preview
```

---

Feito por **@WenderG**
