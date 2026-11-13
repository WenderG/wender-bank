import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

type Tx = {
  id: number;
  title: string;
  amount: number;
  kind: "income" | "expense";
  category: string;
  created_at: string;
};

type Goal = {
  id: number;
  title: string;
  target: number;
  saved: number;
  created_at: string;
};

type Debt = {
  id: number;
  title: string;
  amount: number;
  paid: number;
  due_date: string | null;
  transaction_id: number;
  created_at: string;
};

type Tab = "home" | "activity" | "goals" | "debts" | "reports";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseMoney = (s: string) =>
  Number(s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));

async function initialize(db: any) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      kind TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      target REAL NOT NULL,
      saved REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      paid REAL NOT NULL DEFAULT 0,
      due_date TEXT,
      transaction_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function AppContent() {
  const db = useSQLiteContext();
  const [tab, setTab] = useState<Tab>("home");
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);

  // Formulários
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"income" | "expense">("income");
  const [category, setCategory] = useState("Geral");

  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [contributeId, setContributeId] = useState<number | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  const [debtTitle, setDebtTitle] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDue, setDebtDue] = useState("");
  const [payDebtId, setPayDebtId] = useState<number | null>(null);
  const [payDebtAmount, setPayDebtAmount] = useState("");

  async function refresh() {
    const tx = await db.getAllAsync<Tx>(
      "SELECT * FROM transactions ORDER BY id DESC"
    );
    const gs = await db.getAllAsync<Goal>("SELECT * FROM goals ORDER BY id DESC");
    const ds = await db.getAllAsync<Debt>("SELECT * FROM debts ORDER BY id DESC");
    setTransactions(tx);
    setGoals(gs);
    setDebts(ds);
  }

  useEffect(() => {
    refresh();
  }, []);

  const balance = useMemo(
    () =>
      transactions.reduce(
        (sum, t) => sum + (t.kind === "income" ? t.amount : -t.amount),
        0
      ),
    [transactions]
  );
  const income = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === "income")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const expenses = useMemo(
    () =>
      transactions
        .filter((t) => t.kind === "expense")
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const reserved = useMemo(
    () => goals.reduce((s, g) => s + g.saved, 0),
    [goals]
  );
  const available = balance - reserved;
  const debtOutstanding = useMemo(
    () => debts.reduce((s, d) => s + Math.max(0, d.amount - d.paid), 0),
    [debts]
  );

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTx = transactions.filter(
    (t) => t.created_at.slice(0, 7) === monthKey
  );
  const monthIn = monthTx
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
  const monthOut = monthTx
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const categories = Object.entries(
    monthTx
      .filter((t) => t.kind === "expense")
      .reduce((a, t) => {
        a[t.category] = (a[t.category] || 0) + t.amount;
        return a;
      }, {} as Record<string, number>)
  ) as Array<[string, number]>;
  categories.sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categories.map((x) => x[1]));

  async function addTransaction() {
    const value = parseMoney(amount);
    if (!title.trim() || !Number.isFinite(value) || value <= 0) {
      Alert.alert(
        "Confira os dados",
        "Informe uma descrição e um valor maior que zero."
      );
      return;
    }
    if (kind === "expense" && value > available) {
      Alert.alert(
        "Saldo insuficiente",
        "O valor da saída é maior que seu saldo disponível (considerando as caixinhas)."
      );
      return;
    }
    await db.runAsync(
      "INSERT INTO transactions (title, amount, kind, category, created_at) VALUES (?, ?, ?, ?, ?)",
      title.trim(),
      value,
      kind,
      category.trim() || "Geral",
      new Date().toISOString()
    );
    setTitle("");
    setAmount("");
    setCategory("Geral");
    await refresh();
    setTab("activity");
  }

  async function addGoal() {
    const value = parseMoney(goalTarget);
    if (!goalTitle.trim() || !Number.isFinite(value) || value <= 0) {
      Alert.alert(
        "Confira os dados",
        "Informe o nome do objetivo e o valor desejado."
      );
      return;
    }
    await db.runAsync(
      "INSERT INTO goals (title, target, saved, created_at) VALUES (?, ?, 0, ?)",
      goalTitle.trim(),
      value,
      new Date().toISOString()
    );
    setGoalTitle("");
    setGoalTarget("");
    await refresh();
  }

  async function contribute() {
    const value = parseMoney(contributeAmount);
    const goal = goals.find((g) => g.id === contributeId);
    if (!goal || !Number.isFinite(value) || value <= 0) {
      Alert.alert("Confira o valor", "Informe quanto deseja guardar.");
      return;
    }
    if (value > available) {
      Alert.alert(
        "Saldo insuficiente",
        "Você não tem esse valor disponível para reservar."
      );
      return;
    }
    await db.runAsync(
      "UPDATE goals SET saved = saved + ? WHERE id = ?",
      value,
      goal.id
    );
    setContributeId(null);
    setContributeAmount("");
    await refresh();
  }

  async function deleteGoal(goal: Goal) {
    Alert.alert(
      "Excluir caixinha?",
      goal.saved > 0
        ? `O valor reservado de ${money(goal.saved)} voltará para o saldo disponível.`
        : "A caixinha será removida.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await db.runAsync("DELETE FROM goals WHERE id = ?", goal.id);
            await refresh();
          },
        },
      ]
    );
  }

  async function addDebt() {
    const value = parseMoney(debtAmount);
    if (!debtTitle.trim() || !Number.isFinite(value) || value <= 0) {
      Alert.alert("Confira os dados", "Informe descrição e valor da dívida.");
      return;
    }
    if (value > available) {
      Alert.alert(
        "Saldo insuficiente",
        "O valor da dívida ultrapassa seu saldo disponível."
      );
      return;
    }
    await db.withTransactionAsync(async () => {
      const tx = await db.runAsync(
        "INSERT INTO transactions (title, amount, kind, category, created_at) VALUES (?, ?, 'expense', 'Dívida', ?)",
        `Dívida: ${debtTitle.trim()}`,
        value,
        new Date().toISOString()
      );
      await db.runAsync(
        "INSERT INTO debts (title, amount, paid, due_date, transaction_id, created_at) VALUES (?, ?, 0, ?, ?, ?)",
        debtTitle.trim(),
        value,
        debtDue.trim() || null,
        tx.lastInsertRowId,
        new Date().toISOString()
      );
    });
    setDebtTitle("");
    setDebtAmount("");
    setDebtDue("");
    await refresh();
  }

  async function payDebt(debt: Debt) {
    const value = parseMoney(payDebtAmount);
    const remaining = debt.amount - debt.paid;
    if (!Number.isFinite(value) || value <= 0 || value > remaining) {
      Alert.alert("Valor inválido", `Informe um valor até ${money(remaining)}.`);
      return;
    }
    await db.runAsync(
      "UPDATE debts SET paid = paid + ? WHERE id = ?",
      value,
      debt.id
    );
    setPayDebtId(null);
    setPayDebtAmount("");
    await refresh();
  }

  async function deleteDebt(debt: Debt) {
    Alert.alert(
      "Excluir dívida?",
      "A despesa original também será removida do histórico e o saldo será ajustado.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await db.withTransactionAsync(async () => {
              await db.runAsync(
                "DELETE FROM transactions WHERE id = ?",
                debt.transaction_id
              );
              await db.runAsync("DELETE FROM debts WHERE id = ?", debt.id);
            });
            await refresh();
          },
        },
      ]
    );
  }

  async function deleteTransaction(id: number) {
    const linked = debts.find((d) => d.transaction_id === id);
    if (linked) {
      Alert.alert(
        "Movimentação vinculada",
        "Esta despesa está ligada a uma dívida. Exclua a dívida na aba Dívidas para remover os dois registros juntos."
      );
      return;
    }
    Alert.alert("Excluir movimentação?", "O saldo será recalculado automaticamente.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          await db.runAsync("DELETE FROM transactions WHERE id = ?", id);
          await refresh();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#101C2C" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>
            WENDER <Text style={styles.brandAccent}>BANK</Text>
          </Text>
          <Text style={styles.headerSub}>Seu dinheiro, sob seu controle.</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>W</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "home" && (
          <>
            <View style={styles.balanceCard}>
              <Text style={styles.mutedLight}>SALDO TOTAL</Text>
              <Text style={styles.balance}>{money(balance)}</Text>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.mutedLight}>Disponível</Text>
                  <Text style={styles.balanceSmall}>{money(available)}</Text>
                </View>
                <View>
                  <Text style={styles.mutedLight}>Reservado</Text>
                  <Text style={styles.balanceSmall}>{money(reserved)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Entradas</Text>
                <Text style={styles.income}>{money(income)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Saídas</Text>
                <Text style={styles.expense}>{money(expenses)}</Text>
              </View>
            </View>

            <SectionTitle title="Acesso rápido" />
            <View style={styles.quickRow}>
              <QuickAction
                icon="＋"
                label="Receber"
                onPress={() => {
                  setKind("income");
                  setTab("activity");
                }}
              />
              <QuickAction
                icon="−"
                label="Gastar"
                onPress={() => {
                  setKind("expense");
                  setTab("activity");
                }}
              />
              <QuickAction
                icon="◎"
                label="Caixinhas"
                onPress={() => setTab("goals")}
              />
            </View>
            <View style={styles.quickRow}>
              <QuickAction
                icon="▤"
                label="Dívidas"
                onPress={() => setTab("debts")}
              />
              <QuickAction
                icon="▥"
                label="Gráficos"
                onPress={() => setTab("reports")}
              />
            </View>

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Dívidas em aberto</Text>
                <Text style={styles.expense}>{money(debtOutstanding)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Caixinhas</Text>
                <Text style={styles.income}>{goals.length}</Text>
              </View>
            </View>

            <SectionTitle title="Movimentações recentes" />
            {transactions.length === 0 ? (
              <Empty text="Suas movimentações aparecerão aqui." />
            ) : (
              transactions
                .slice(0, 5)
                .map((t) => <TransactionRow key={t.id} tx={t} />)
            )}
          </>
        )}

        {tab === "activity" && (
          <>
            <SectionTitle title="Nova movimentação" />
            <View style={styles.formCard}>
              <View style={styles.segment}>
                <Pressable
                  onPress={() => setKind("income")}
                  style={[
                    styles.segmentButton,
                    kind === "income" && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      kind === "income" && styles.segmentTextActive,
                    ]}
                  >
                    Entrada
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setKind("expense")}
                  style={[
                    styles.segmentButton,
                    kind === "expense" && styles.segmentActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      kind === "expense" && styles.segmentTextActive,
                    ]}
                  >
                    Saída
                  </Text>
                </Pressable>
              </View>
              <Field
                label="Descrição"
                value={title}
                onChange={setTitle}
                placeholder="Ex.: Pagamento de evento"
              />
              <Field
                label="Valor (R$)"
                value={amount}
                onChange={setAmount}
                placeholder="Ex.: 150,00"
                keyboard="decimal-pad"
              />
              <Field
                label="Categoria"
                value={category}
                onChange={setCategory}
                placeholder="Ex.: Trabalho, alimentação..."
              />
              <Pressable style={styles.primaryButton} onPress={addTransaction}>
                <Text style={styles.primaryButtonText}>
                  Salvar movimentação
                </Text>
              </Pressable>
            </View>

            <SectionTitle title="Histórico" />
            {transactions.length === 0 ? (
              <Empty text="Ainda não há movimentações registradas." />
            ) : (
              transactions.map((t) => (
                <Pressable
                  key={t.id}
                  onLongPress={() => deleteTransaction(t.id)}
                >
                  <TransactionRow tx={t} />
                  <Text style={styles.hint}>Toque e segure para excluir</Text>
                </Pressable>
              ))
            )}
          </>
        )}

        {tab === "goals" && (
          <>
            <SectionTitle title="Minhas caixinhas" />
            <Text style={styles.intro}>
              Separe dinheiro para seus próximos objetivos. O valor reservado
              deixa de fazer parte do saldo disponível.
            </Text>
            <View style={styles.formCard}>
              <Field
                label="Nome do objetivo"
                value={goalTitle}
                onChange={setGoalTitle}
                placeholder="Ex.: Novo notebook"
              />
              <Field
                label="Quanto custa? (R$)"
                value={goalTarget}
                onChange={setGoalTarget}
                placeholder="Ex.: 3000,00"
                keyboard="decimal-pad"
              />
              <Pressable style={styles.primaryButton} onPress={addGoal}>
                <Text style={styles.primaryButtonText}>Criar caixinha</Text>
              </Pressable>
            </View>

            {goals.length === 0 ? (
              <Empty text="Crie uma caixinha para começar a guardar dinheiro." />
            ) : (
              goals.map((g) => {
                const pct = Math.min(100, (g.saved / g.target) * 100);
                const completed = g.saved >= g.target;
                return (
                  <View key={g.id} style={styles.goalCard}>
                    <View style={styles.goalTop}>
                      <Text style={styles.goalName}>{g.title}</Text>
                      <Text
                        style={[
                          styles.goalPct,
                          completed && { color: "#16A875" },
                        ]}
                      >
                        {completed ? "Meta atingida" : `${pct.toFixed(0)}%`}
                      </Text>
                    </View>
                    <Text style={styles.goalSaved}>
                      {money(g.saved)}{" "}
                      <Text style={styles.muted}>de {money(g.target)}</Text>
                    </Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[styles.progressFill, { width: `${pct}%` }]}
                      />
                    </View>
                    <Text style={styles.muted}>
                      Faltam {money(Math.max(0, g.target - g.saved))}
                    </Text>

                    {contributeId === g.id ? (
                      <View style={styles.contributeBox}>
                        <Field
                          label="Valor para guardar (R$)"
                          value={contributeAmount}
                          onChange={setContributeAmount}
                          placeholder="Ex.: 100,00"
                          keyboard="decimal-pad"
                        />
                        <View style={styles.buttonRow}>
                          <Pressable
                            style={styles.secondaryButton}
                            onPress={() => setContributeId(null)}
                          >
                            <Text style={styles.secondaryText}>Cancelar</Text>
                          </Pressable>
                          <Pressable
                            style={styles.primaryButtonFlex}
                            onPress={contribute}
                          >
                            <Text style={styles.primaryButtonText}>
                              Guardar
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.buttonRow}>
                        <Pressable
                          style={styles.outlineButton}
                          onPress={() => {
                            setContributeId(g.id);
                            setContributeAmount("");
                          }}
                        >
                          <Text style={styles.outlineText}>
                            ＋ Adicionar dinheiro
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={() => deleteGoal(g)}
                        >
                          <Text style={styles.secondaryText}>Excluir</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === "debts" && (
          <>
            <SectionTitle title="Dívidas e compromissos" />
            <Text style={styles.intro}>
              Ao registrar uma dívida, o valor integral é lançado como despesa.
              Pagamentos parciais atualizam o compromisso sem descontar o saldo
              duas vezes.
            </Text>
            <View style={styles.formCard}>
              <Field
                label="Descrição"
                value={debtTitle}
                onChange={setDebtTitle}
                placeholder="Ex.: Compra parcelada"
              />
              <Field
                label="Valor total (R$)"
                value={debtAmount}
                onChange={setDebtAmount}
                placeholder="500,00"
                keyboard="decimal-pad"
              />
              <Field
                label="Vencimento (AAAA-MM-DD, opcional)"
                value={debtDue}
                onChange={setDebtDue}
                placeholder="2026-12-10"
              />
              <Pressable style={styles.primaryButton} onPress={addDebt}>
                <Text style={styles.primaryButtonText}>Registrar dívida</Text>
              </Pressable>
            </View>

            <View style={styles.debtSummary}>
              <Text style={styles.mutedLight}>TOTAL EM ABERTO</Text>
              <Text style={styles.debtTotal}>{money(debtOutstanding)}</Text>
            </View>

            {debts.length === 0 ? (
              <Empty text="Nenhuma dívida cadastrada." />
            ) : (
              debts.map((d) => {
                const remaining = Math.max(0, d.amount - d.paid);
                const pct = Math.min(100, (d.paid / d.amount) * 100);
                return (
                  <View key={d.id} style={styles.goalCard}>
                    <View style={styles.goalTop}>
                      <Text style={styles.goalName}>{d.title}</Text>
                      <Text style={styles.goalPct}>
                        {remaining <= 0 ? "Quitada" : "Em aberto"}
                      </Text>
                    </View>
                    <Text style={styles.goalSaved}>
                      {money(remaining)}{" "}
                      <Text style={styles.muted}>
                        restantes de {money(d.amount)}
                      </Text>
                    </Text>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: "#D29A42",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.muted}>
                      Pago: {money(d.paid)}
                      {d.due_date ? ` · Vence: ${d.due_date}` : ""}
                    </Text>

                    {payDebtId === d.id ? (
                      <View style={styles.contributeBox}>
                        <Field
                          label="Valor do pagamento (R$)"
                          value={payDebtAmount}
                          onChange={setPayDebtAmount}
                          placeholder="100,00"
                          keyboard="decimal-pad"
                        />
                        <View style={styles.buttonRow}>
                          <Pressable
                            style={styles.secondaryButton}
                            onPress={() => setPayDebtId(null)}
                          >
                            <Text style={styles.secondaryText}>Cancelar</Text>
                          </Pressable>
                          <Pressable
                            style={styles.primaryButtonFlex}
                            onPress={() => payDebt(d)}
                          >
                            <Text style={styles.primaryButtonText}>
                              Registrar pagamento
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.buttonRow}>
                        {remaining > 0 && (
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => {
                              setPayDebtId(d.id);
                              setPayDebtAmount("");
                            }}
                          >
                            <Text style={styles.outlineText}>
                              Registrar pagamento
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.secondaryButton}
                          onPress={() => deleteDebt(d)}
                        >
                          <Text style={styles.secondaryText}>Excluir</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

        {tab === "reports" && (
          <>
            <SectionTitle title="Resumo financeiro" />
            <Text style={styles.intro}>
              Entradas e saídas registradas neste mês ({monthKey}).
            </Text>

            <View style={styles.goalCard}>
              <Text style={styles.goalName}>Entradas x saídas · mês atual</Text>
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Entradas</Text>
                <Text style={styles.income}>{money(monthIn)}</Text>
              </View>
              <View style={styles.reportTrack}>
                <View
                  style={[
                    styles.reportIncome,
                    {
                      width: `${Math.max(
                        2,
                        (monthIn / Math.max(1, monthIn, monthOut)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Saídas</Text>
                <Text style={styles.expense}>{money(monthOut)}</Text>
              </View>
              <View style={styles.reportTrack}>
                <View
                  style={[
                    styles.reportExpense,
                    {
                      width: `${Math.max(
                        2,
                        (monthOut / Math.max(1, monthIn, monthOut)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.balanceDividerLight} />
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Resultado do mês</Text>
                <Text
                  style={
                    monthIn - monthOut >= 0 ? styles.income : styles.expense
                  }
                >
                  {money(monthIn - monthOut)}
                </Text>
              </View>
            </View>

            <View style={styles.goalCard}>
              <Text style={styles.goalName}>Despesas por categoria</Text>
              {categories.length === 0 ? (
                <Empty text="Ainda não há despesas neste mês." />
              ) : (
                categories.map(([name, value]) => (
                  <View key={name} style={{ marginTop: 12 }}>
                    <View style={styles.reportLine}>
                      <Text style={styles.muted}>{name}</Text>
                      <Text style={styles.txAmount}>{money(value)}</Text>
                    </View>
                    <View style={styles.reportTrack}>
                      <View
                        style={[
                          styles.reportExpense,
                          { width: `${(value / maxCategory) * 100}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.goalCard}>
              <Text style={styles.goalName}>Visão geral</Text>
              <Text style={styles.reportBalance}>{money(balance)}</Text>
              <Text style={styles.muted}>Saldo total registrado</Text>
              <View style={styles.balanceDividerLight} />
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Disponível</Text>
                <Text style={styles.txAmount}>{money(available)}</Text>
              </View>
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Reservado (caixinhas)</Text>
                <Text style={styles.txAmount}>{money(reserved)}</Text>
              </View>
              <View style={styles.reportLine}>
                <Text style={styles.muted}>Dívidas em aberto</Text>
                <Text style={styles.expense}>{money(debtOutstanding)}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        <TabButton
          label="Início"
          icon="⌂"
          active={tab === "home"}
          onPress={() => setTab("home")}
        />
        <TabButton
          label="Movimentar"
          icon="⇄"
          active={tab === "activity"}
          onPress={() => setTab("activity")}
        />
        <TabButton
          label="Caixinhas"
          icon="◎"
          active={tab === "goals"}
          onPress={() => setTab("goals")}
        />
        <TabButton
          label="Dívidas"
          icon="▤"
          active={tab === "debts"}
          onPress={() => setTab("debts")}
        />
        <TabButton
          label="Gráficos"
          icon="▥"
          active={tab === "reports"}
          onPress={() => setTab("reports")}
        />
      </View>
      <Text style={styles.signature}>Feito por @WenderG</Text>
    </SafeAreaView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard?: any;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#7D8A9A"
        keyboardType={keyboard || "default"}
        style={styles.input}
      />
    </View>
  );
}

function TransactionRow({ tx }: { tx: Tx }) {
  const positive = tx.kind === "income";
  return (
    <View style={styles.transaction}>
      <View
        style={[
          styles.txIcon,
          positive ? styles.txIconIn : styles.txIconOut,
        ]}
      >
        <Text
          style={{
            color: positive ? "#36C98F" : "#F07878",
            fontSize: 19,
          }}
        >
          {positive ? "↙" : "↗"}
        </Text>
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txTitle}>{tx.title}</Text>
        <Text style={styles.txMeta}>
          {tx.category} ·{" "}
          {new Date(tx.created_at).toLocaleDateString("pt-BR")}
        </Text>
      </View>
      <Text
        style={[
          styles.txAmount,
          { color: positive ? "#36C98F" : "#F07878" },
        ]}
      >
        {positive ? "+" : "−"} {money(tx.amount)}
      </Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.tabButton} onPress={onPress}>
      <Text style={[styles.tabIcon, active && styles.tabActive]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabActive]}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <SQLiteProvider databaseName="wenderbank.db" onInit={initialize}>
      <AppContent />
    </SQLiteProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F3F6FA" },
  header: {
    backgroundColor: "#101C2C",
    paddingHorizontal: 22,
    paddingTop: Platform.OS === "android" ? 18 : 10,
    paddingBottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  brandAccent: { color: "#41D6A0" },
  headerSub: { color: "#AAB8C8", fontSize: 12, marginTop: 4 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#24384E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#3B536B",
  },
  avatarText: { color: "#41D6A0", fontSize: 17, fontWeight: "800" },
  content: { padding: 18, paddingBottom: 28 },
  balanceCard: {
    backgroundColor: "#142A40",
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
  },
  mutedLight: {
    color: "#AABCCD",
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700",
  },
  balance: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 8,
  },
  balanceDivider: {
    height: 1,
    backgroundColor: "#35516A",
    marginVertical: 18,
  },
  balanceRow: { flexDirection: "row", justifyContent: "space-between" },
  balanceSmall: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 5,
  },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E7ECF2",
  },
  statLabel: { color: "#758397", fontSize: 12, marginBottom: 8 },
  income: { color: "#16A875", fontWeight: "800", fontSize: 15 },
  expense: { color: "#E16F6F", fontWeight: "800", fontSize: 15 },
  sectionTitle: {
    color: "#172638",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 13,
  },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  quickAction: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E7ECF2",
  },
  quickIcon: { color: "#16A875", fontSize: 25, fontWeight: "700" },
  quickLabel: {
    color: "#34465A",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 7,
  },
  transaction: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E9EEF4",
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  txIconIn: { backgroundColor: "#E6F8F0" },
  txIconOut: { backgroundColor: "#FCEEEE" },
  txInfo: { flex: 1 },
  txTitle: { color: "#1C2C3E", fontWeight: "700", fontSize: 13 },
  txMeta: { color: "#8793A2", fontSize: 11, marginTop: 4 },
  txAmount: { fontSize: 12, fontWeight: "800" },
  formCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E6ECF2",
    marginBottom: 16,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: "#EFF3F7",
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  segmentButton: {
    flex: 1,
    padding: 11,
    alignItems: "center",
    borderRadius: 9,
  },
  segmentActive: { backgroundColor: "#142A40" },
  segmentText: { color: "#718096", fontWeight: "700", fontSize: 12 },
  segmentTextActive: { color: "#FFFFFF" },
  field: { marginBottom: 13 },
  fieldLabel: {
    color: "#4B5B6E",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E3E9F0",
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: "#1B2A3B",
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: "#16A875",
    padding: 14,
    alignItems: "center",
    borderRadius: 12,
    marginTop: 4,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  empty: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E9EEF4",
  },
  emptyText: { color: "#8491A0", fontSize: 13, textAlign: "center" },
  hint: {
    color: "#9AA5B2",
    fontSize: 10,
    marginTop: -5,
    marginBottom: 8,
    marginLeft: 10,
  },
  intro: {
    color: "#748295",
    lineHeight: 20,
    fontSize: 13,
    marginBottom: 14,
  },
  goalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 17,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E7ECF2",
  },
  goalTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  goalName: {
    color: "#1D2D40",
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  goalPct: { color: "#16A875", fontWeight: "900" },
  goalSaved: {
    color: "#1D2D40",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 12,
    marginBottom: 12,
  },
  muted: { color: "#8A96A5", fontSize: 12, fontWeight: "500" },
  progressTrack: {
    height: 9,
    backgroundColor: "#EAF0F4",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: 9,
    backgroundColor: "#16A875",
    borderRadius: 10,
  },
  outlineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#16A875",
    borderRadius: 10,
    padding: 11,
    alignItems: "center",
    marginTop: 14,
  },
  outlineText: { color: "#139568", fontWeight: "800", fontSize: 12 },
  contributeBox: { marginTop: 14 },
  buttonRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  secondaryButton: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#EDF1F5",
    marginTop: 14,
  },
  secondaryText: { color: "#526174", fontWeight: "700" },
  primaryButtonFlex: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#16A875",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderColor: "#E5EAF0",
    paddingTop: 9,
    paddingBottom: 7,
    justifyContent: "space-around",
  },
  tabButton: { alignItems: "center", minWidth: 68 },
  tabIcon: { color: "#97A3B1", fontSize: 21, fontWeight: "700" },
  tabLabel: {
    color: "#97A3B1",
    fontSize: 10,
    marginTop: 2,
    fontWeight: "700",
  },
  tabActive: { color: "#16A875" },
  debtSummary: {
    backgroundColor: "#263B50",
    padding: 17,
    borderRadius: 15,
    marginBottom: 12,
  },
  debtTotal: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 5,
  },
  reportLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  reportTrack: {
    height: 10,
    backgroundColor: "#EDF1F5",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 7,
  },
  reportIncome: {
    height: 10,
    backgroundColor: "#16A875",
    borderRadius: 8,
  },
  reportExpense: {
    height: 10,
    backgroundColor: "#E16F6F",
    borderRadius: 8,
  },
  reportBalance: {
    color: "#142A40",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 10,
  },
  balanceDividerLight: {
    height: 1,
    backgroundColor: "#E8EDF2",
    marginVertical: 12,
  },
  signature: {
    textAlign: "center",
    color: "#A2ACB8",
    backgroundColor: "#FFFFFF",
    fontSize: 9,
    paddingBottom: 5,
    letterSpacing: 0.4,
  },
});
