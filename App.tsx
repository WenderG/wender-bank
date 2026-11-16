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
  useColorScheme,
  View,
} from "react-native";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";

type Entry = {
  id: number;
  title: string;
  amount: number;
  tag: string;
  month_key: string;
  created_at: string;
};

type Expense = {
  id: number;
  title: string;
  amount: number;
  tag: string;
  installments: number;
  start_month: string;
  created_at: string;
};

type WalletAdj = {
  id: number;
  title: string;
  amount: number;
  kind: "add" | "remove";
  month_key: string;
  created_at: string;
};

type Tab = "home" | "invoice" | "add" | "analysis";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const parseMoney = (s: string) => {
  const n = Number(
    String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
  );
  return Number.isFinite(n) ? n : NaN;
};

const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${names[(m || 1) - 1]} ${y}`;
};

const addMonths = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
};

const monthsBetween = (start: string, end: string) => {
  const [y1, m1] = start.split("-").map(Number);
  const [y2, m2] = end.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

async function initialize(db: any) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      tag TEXT NOT NULL DEFAULT 'Geral',
      month_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      tag TEXT NOT NULL DEFAULT 'Geral',
      installments INTEGER NOT NULL DEFAULT 1,
      start_month TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      kind TEXT NOT NULL,
      month_key TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const cutoff = addMonths(monthKey(), -6);
  await db.runAsync("DELETE FROM entries WHERE month_key < ?", cutoff);
  await db.runAsync("DELETE FROM wallet WHERE month_key < ?", cutoff);
  const allExp = await db.getAllAsync<Expense>("SELECT * FROM expenses");
  for (const e of allExp) {
    const last = addMonths(e.start_month, Math.max(0, (e.installments || 1) - 1));
    if (last < cutoff) {
      await db.runAsync("DELETE FROM expenses WHERE id = ?", e.id);
    }
  }
}

function useTheme() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  return {
    dark,
    bg: dark ? "#0B1220" : "#F3F6FA",
    card: dark ? "#152033" : "#FFFFFF",
    text: dark ? "#E8EEF7" : "#1C2C3E",
    muted: dark ? "#8B9BB0" : "#758397",
    border: dark ? "#243247" : "#E7ECF2",
    header: "#101C2C",
    accent: "#16A875",
    danger: "#E16F6F",
    warn: "#D29A42",
    inputBg: dark ? "#0F1A2B" : "#F5F7FA",
    tabBg: dark ? "#0E1726" : "#FFFFFF",
  };
}

function AppContent() {
  const db = useSQLiteContext();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>("home");
  const currentMonth = monthKey();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [wallet, setWallet] = useState<WalletAdj[]>([]);

  const [fTitle, setFTitle] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fTag, setFTag] = useState("Geral");
  const [fParcels, setFParcels] = useState("1");
  const [fKind, setFKind] = useState<"entry" | "expense" | "wallet_add" | "wallet_remove">("entry");

  async function refresh() {
    setEntries(await db.getAllAsync<Entry>("SELECT * FROM entries ORDER BY id DESC"));
    setExpenses(await db.getAllAsync<Expense>("SELECT * FROM expenses ORDER BY id DESC"));
    setWallet(await db.getAllAsync<WalletAdj>("SELECT * FROM wallet ORDER BY id DESC"));
  }

  useEffect(() => {
    refresh();
  }, []);

  const carteira = useMemo(() => {
    return (
      wallet.reduce((s, w) => s + (w.kind === "add" ? w.amount : -w.amount), 0) +
      entries.reduce((s, e) => s + e.amount, 0)
    );
  }, [wallet, entries]);

  function expenseInMonth(exp: Expense, mk: string) {
    const parcels = Math.max(1, exp.installments || 1);
    const idx = monthsBetween(exp.start_month, mk);
    if (idx < 0 || idx >= parcels) return 0;
    return exp.amount / parcels;
  }

  const despesasMes = useMemo(
    () => expenses.reduce((s, e) => s + expenseInMonth(e, currentMonth), 0),
    [expenses, currentMonth]
  );

  const despesasAbertas = useMemo(() => {
    return expenses.reduce((s, e) => {
      const parcels = Math.max(1, e.installments || 1);
      const parcel = e.amount / parcels;
      let left = 0;
      for (let i = 0; i < parcels; i++) {
        const mk = addMonths(e.start_month, i);
        if (mk >= currentMonth) left += parcel;
      }
      return s + left;
    }, 0);
  }, [expenses, currentMonth]);

  const saldoAtual = carteira - despesasAbertas;

  const entradasMes = useMemo(
    () =>
      entries.filter((e) => e.month_key === currentMonth).reduce((s, e) => s + e.amount, 0) +
      wallet
        .filter((w) => w.month_key === currentMonth && w.kind === "add")
        .reduce((s, w) => s + w.amount, 0),
    [entries, wallet, currentMonth]
  );

  const tagMap = useMemo(() => {
    const map: Record<string, { in: number; out: number }> = {};
    for (const e of entries.filter((x) => x.month_key === currentMonth)) {
      if (!map[e.tag]) map[e.tag] = { in: 0, out: 0 };
      map[e.tag].in += e.amount;
    }
    for (const e of expenses) {
      const v = expenseInMonth(e, currentMonth);
      if (v <= 0) continue;
      if (!map[e.tag]) map[e.tag] = { in: 0, out: 0 };
      map[e.tag].out += v;
    }
    return Object.entries(map).sort(
      (a, b) => b[1].out + b[1].in - (a[1].out + a[1].in)
    );
  }, [entries, expenses, currentMonth]);

  const maxTag = Math.max(1, ...tagMap.map(([, v]) => Math.max(v.in, v.out)));

  async function save() {
    const value = parseMoney(fAmount);
    if (!fTitle.trim() || !Number.isFinite(value) || value <= 0) {
      Alert.alert("Dados inválidos", "Informe nome e um valor positivo.");
      return;
    }

    try {
      if (fKind === "entry") {
        await db.runAsync(
          "INSERT INTO entries (title, amount, tag, month_key, created_at) VALUES (?, ?, ?, ?, ?)",
          fTitle.trim(),
          value,
          fTag.trim() || "Geral",
          currentMonth,
          new Date().toISOString()
        );
      } else if (fKind === "expense") {
        const parcels = Math.max(1, Math.floor(Number(fParcels) || 1));
        await db.runAsync(
          "INSERT INTO expenses (title, amount, tag, installments, start_month, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          fTitle.trim(),
          value,
          fTag.trim() || "Geral",
          parcels,
          currentMonth,
          new Date().toISOString()
        );
      } else if (fKind === "wallet_add") {
        await db.runAsync(
          "INSERT INTO wallet (title, amount, kind, month_key, created_at) VALUES (?, ?, 'add', ?, ?)",
          fTitle.trim(),
          value,
          currentMonth,
          new Date().toISOString()
        );
      } else if (fKind === "wallet_remove") {
        if (value > carteira) {
          Alert.alert("Carteira", "A carteira não pode ficar negativa.");
          return;
        }
        await db.runAsync(
          "INSERT INTO wallet (title, amount, kind, month_key, created_at) VALUES (?, ?, 'remove', ?, ?)",
          fTitle.trim(),
          value,
          currentMonth,
          new Date().toISOString()
        );
      }

      setFTitle("");
      setFAmount("");
      setFTag("Geral");
      setFParcels("1");
      await refresh();
      setTab(fKind === "expense" ? "invoice" : "home");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar.");
    }
  }

  function confirmDelete(title: string, action: () => Promise<void>) {
    Alert.alert("Excluir?", title, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          try {
            await action();
            await refresh();
          } catch {
            Alert.alert("Erro", "Falha ao excluir.");
          }
        },
      },
    ]);
  }

  const s = makeStyles(t);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={t.header} translucent={false} />
      <View style={s.header}>
        <View>
          <Text style={s.brand}>
            WENDER <Text style={{ color: "#41D6A0" }}>BANK</Text>
          </Text>
          <Text style={s.headerSub}>{monthLabel(currentMonth)}</Text>
        </View>
        <View style={s.avatar}>
          <Text style={s.avatarText}>W</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab === "home" && (
          <>
            <View style={s.balanceCard}>
              <Text style={s.mutedLight}>SALDO ATUAL</Text>
              <Text style={[s.balance, saldoAtual < 0 && { color: "#F07878" }]}>
                {money(saldoAtual)}
              </Text>
              <Text style={s.formula}>carteira − despesas em aberto</Text>
              <View style={s.balanceDivider} />
              <View style={s.balanceRow}>
                <View>
                  <Text style={s.mutedLight}>CARTEIRA</Text>
                  <Text style={s.balanceSmall}>{money(carteira)}</Text>
                </View>
                <View>
                  <Text style={s.mutedLight}>DESPESAS ABERTAS</Text>
                  <Text style={[s.balanceSmall, { color: "#F07878" }]}>
                    {money(despesasAbertas)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.statRow}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Entradas do mês</Text>
                <Text style={s.income}>{money(entradasMes)}</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Despesas do mês</Text>
                <Text style={s.expense}>{money(despesasMes)}</Text>
              </View>
            </View>

            <Text style={s.section}>Atalhos</Text>
            <View style={s.quickRow}>
              <Quick label="Entrada" onPress={() => { setFKind("entry"); setTab("add"); }} t={t} />
              <Quick label="Despesa" onPress={() => { setFKind("expense"); setTab("add"); }} t={t} />
              <Quick label="Fatura" onPress={() => setTab("invoice")} t={t} />
              <Quick label="Análise" onPress={() => setTab("analysis")} t={t} />
            </View>
          </>
        )}

        {tab === "invoice" && (
          <>
            <Text style={s.section}>Fatura · {monthLabel(currentMonth)}</Text>
            <View style={s.statCard}>
              <View style={s.rowBetween}>
                <Text style={s.muted}>Saldo atual</Text>
                <Text style={{ color: saldoAtual < 0 ? t.danger : t.accent, fontWeight: "800" }}>
                  {money(saldoAtual)}
                </Text>
              </View>
            </View>

            <Text style={s.section}>Entradas</Text>
            {entries.filter((e) => e.month_key === currentMonth).length === 0 &&
            wallet.filter((w) => w.month_key === currentMonth && w.kind === "add").length === 0 ? (
              <Empty text="Nenhuma entrada neste mês." t={t} />
            ) : (
              <>
                {entries
                  .filter((e) => e.month_key === currentMonth)
                  .map((e) => (
                    <Row
                      key={"e-" + e.id}
                      title={e.title}
                      meta={e.tag}
                      value={money(e.amount)}
                      positive
                      t={t}
                      onDelete={() =>
                        confirmDelete(e.title, async () => {
                          await db.runAsync("DELETE FROM entries WHERE id = ?", e.id);
                        })
                      }
                    />
                  ))}
                {wallet
                  .filter((w) => w.month_key === currentMonth && w.kind === "add")
                  .map((w) => (
                    <Row
                      key={"w-" + w.id}
                      title={w.title}
                      meta="Carteira +"
                      value={money(w.amount)}
                      positive
                      t={t}
                      onDelete={() =>
                        confirmDelete(w.title, async () => {
                          await db.runAsync("DELETE FROM wallet WHERE id = ?", w.id);
                        })
                      }
                    />
                  ))}
              </>
            )}

            <Text style={s.section}>Despesas</Text>
            {expenses.filter((e) => expenseInMonth(e, currentMonth) > 0).length === 0 ? (
              <Empty text="Nenhuma despesa neste mês." t={t} />
            ) : (
              expenses
                .filter((e) => expenseInMonth(e, currentMonth) > 0)
                .map((e) => {
                  const v = expenseInMonth(e, currentMonth);
                  const parcels = Math.max(1, e.installments || 1);
                  const idx = monthsBetween(e.start_month, currentMonth) + 1;
                  return (
                    <Row
                      key={"x-" + e.id}
                      title={e.title}
                      meta={
                        parcels > 1
                          ? e.tag + " · " + idx + "/" + parcels + "x de " + money(e.amount / parcels)
                          : e.tag
                      }
                      value={money(v)}
                      positive={false}
                      t={t}
                      onDelete={() =>
                        confirmDelete(e.title, async () => {
                          await db.runAsync("DELETE FROM expenses WHERE id = ?", e.id);
                        })
                      }
                    />
                  );
                })
            )}

            {wallet.filter((w) => w.month_key === currentMonth && w.kind === "remove").length > 0 && (
              <>
                <Text style={s.section}>Saídas da carteira</Text>
                {wallet
                  .filter((w) => w.month_key === currentMonth && w.kind === "remove")
                  .map((w) => (
                    <Row
                      key={"wr-" + w.id}
                      title={w.title}
                      meta="Carteira −"
                      value={money(w.amount)}
                      positive={false}
                      t={t}
                      onDelete={() =>
                        confirmDelete(w.title, async () => {
                          await db.runAsync("DELETE FROM wallet WHERE id = ?", w.id);
                        })
                      }
                    />
                  ))}
              </>
            )}
          </>
        )}

        {tab === "add" && (
          <>
            <Text style={s.section}>Novo lançamento</Text>
            <View style={s.formCard}>
              <View style={s.segment}>
                {([
                  ["entry", "Entrada"],
                  ["expense", "Despesa"],
                  ["wallet_add", "Carteira +"],
                  ["wallet_remove", "Carteira −"],
                ] as const).map(([k, label]) => (
                  <Pressable
                    key={k}
                    onPress={() => setFKind(k)}
                    style={[s.segmentBtn, fKind === k && s.segmentActive]}
                  >
                    <Text style={[s.segmentText, fKind === k && s.segmentTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Field label="Nome" value={fTitle} onChange={setFTitle} placeholder="Ex.: Salário" t={t} />
              <Field
                label="Valor (R$)"
                value={fAmount}
                onChange={setFAmount}
                placeholder="0,00"
                keyboard="decimal-pad"
                t={t}
              />
              {(fKind === "entry" || fKind === "expense") && (
                <Field
                  label="Tag"
                  value={fTag}
                  onChange={setFTag}
                  placeholder="Ex.: Moradia"
                  t={t}
                />
              )}
              {fKind === "expense" && (
                <Field
                  label="Parcelas"
                  value={fParcels}
                  onChange={setFParcels}
                  placeholder="1"
                  keyboard="number-pad"
                  t={t}
                />
              )}
              <Pressable style={s.primaryBtn} onPress={save}>
                <Text style={s.primaryBtnText}>Salvar</Text>
              </Pressable>
            </View>
          </>
        )}

        {tab === "analysis" && (
          <>
            <Text style={s.section}>Análise · {monthLabel(currentMonth)}</Text>

            {/* Colunas Entradas x Despesas */}
            <View style={s.statCard}>
              <Text style={[s.statLabel, { marginBottom: 16 }]}>Entradas x Despesas</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: 160, marginBottom: 8 }}>
                {(() => {
                  const maxV = Math.max(1, entradasMes, despesasMes);
                  const hIn = Math.max(8, (entradasMes / maxV) * 140);
                  const hOut = Math.max(8, (despesasMes / maxV) * 140);
                  return (
                    <>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700", marginBottom: 6 }}>
                          {money(entradasMes)}
                        </Text>
                        <View style={{ width: 48, height: hIn, backgroundColor: t.accent, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
                        <Text style={{ color: t.muted, fontSize: 11, marginTop: 8, fontWeight: "700" }}>Entradas</Text>
                      </View>
                      <View style={{ alignItems: "center", flex: 1 }}>
                        <Text style={{ color: t.danger, fontSize: 11, fontWeight: "700", marginBottom: 6 }}>
                          {money(despesasMes)}
                        </Text>
                        <View style={{ width: 48, height: hOut, backgroundColor: t.danger, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
                        <Text style={{ color: t.muted, fontSize: 11, marginTop: 8, fontWeight: "700" }}>Despesas</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
              <View style={s.divider} />
              <View style={s.rowBetween}>
                <Text style={s.muted}>Resultado do mês</Text>
                <Text
                  style={{
                    fontWeight: "800",
                    color: entradasMes - despesasMes >= 0 ? t.accent : t.danger,
                  }}
                >
                  {money(entradasMes - despesasMes)}
                </Text>
              </View>
            </View>

            {/* Linha de despesas por categoria */}
            <Text style={s.section}>Despesas por categoria (linha)</Text>
            {tagMap.filter(([, v]) => v.out > 0).length === 0 ? (
              <Empty text="Sem despesas este mês." t={t} />
            ) : (
              <View style={s.statCard}>
                <LineChart
                  items={tagMap.filter(([, v]) => v.out > 0).map(([tag, v]) => ({ label: tag, value: v.out }))}
                  color={t.danger}
                  t={t}
                />
              </View>
            )}

            {/* Pizzas */}
            <Text style={s.section}>Divisão por categorias</Text>
            <View style={s.statCard}>
              <Text style={[s.statLabel, { marginBottom: 10 }]}>Entradas</Text>
              {tagMap.filter(([, v]) => v.in > 0).length === 0 ? (
                <Text style={{ color: t.muted, marginBottom: 8 }}>Sem entradas neste mês.</Text>
              ) : (
                <PieChart
                  items={tagMap.filter(([, v]) => v.in > 0).map(([tag, v]) => ({ label: tag, value: v.in }))}
                  t={t}
                />
              )}
            </View>
            <View style={s.statCard}>
              <Text style={[s.statLabel, { marginBottom: 10 }]}>Despesas</Text>
              {tagMap.filter(([, v]) => v.out > 0).length === 0 ? (
                <Text style={{ color: t.muted, marginBottom: 8 }}>Sem despesas neste mês.</Text>
              ) : (
                <PieChart
                  items={tagMap.filter(([, v]) => v.out > 0).map(([tag, v]) => ({ label: tag, value: v.out }))}
                  t={t}
                />
              )}
            </View>
          </>
        )}
      </ScrollView>

      <View style={s.tabBar}>
        <TabBtn label="Início" active={tab === "home"} onPress={() => setTab("home")} t={t} />
        <TabBtn label="Fatura" active={tab === "invoice"} onPress={() => setTab("invoice")} t={t} />
        <TabBtn label="Lançar" active={tab === "add"} onPress={() => setTab("add")} t={t} />
        <TabBtn label="Análise" active={tab === "analysis"} onPress={() => setTab("analysis")} t={t} />
      </View>
      <Text style={s.signature}>@WenderG</Text>
    </SafeAreaView>
  );
}

function Quick({
  label,
  onPress,
  t,
}: {
  label: string;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: t.card,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
        borderWidth: 1,
        borderColor: t.border,
      }}
    >
      <Text style={{ color: t.text, fontWeight: "700", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function Empty({ text, t }: { text: string; t: ReturnType<typeof useTheme> }) {
  return (
    <View
      style={{
        backgroundColor: t.card,
        padding: 18,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.border,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: t.muted, textAlign: "center", fontSize: 13 }}>{text}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  t,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboard?: any;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", marginBottom: 6 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        keyboardType={keyboard || "default"}
        style={{
          backgroundColor: t.inputBg,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: 11,
          paddingHorizontal: 13,
          paddingVertical: 12,
          color: t.text,
          fontSize: 14,
        }}
      />
    </View>
  );
}

function Row({
  title,
  meta,
  value,
  positive,
  onDelete,
  t,
}: {
  title: string;
  meta: string;
  value: string;
  positive: boolean;
  onDelete: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onLongPress={onDelete}
      style={{
        backgroundColor: t.card,
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: t.border,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: "700", fontSize: 14 }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 11, marginTop: 3 }}>{meta} · segure para excluir</Text>
      </View>
      <Text style={{ color: positive ? t.accent : t.danger, fontWeight: "800", fontSize: 13 }}>
        {positive ? "+" : "−"} {value}
      </Text>
    </Pressable>
  );
}

function TabBtn({
  label,
  active,
  onPress,
  t,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: "center", minWidth: 70 }}>
      <Text style={{ color: active ? t.accent : t.muted, fontWeight: "800", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}



const PIE_COLORS = ["#16A875", "#E16F6F", "#D29A42", "#5B8DEF", "#A78BFA", "#F472B6", "#38BDF8", "#FBBF24"];

/** Divisão por categorias — visual tipo pizza (sem lib externa) */
function PieChart({
  items,
  t,
}: {
  items: { label: string; value: number }[];
  t: ReturnType<typeof useTheme>;
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const slices = sorted.map((item, idx) => ({
    ...item,
    color: PIE_COLORS[idx % PIE_COLORS.length],
    pct: (item.value / total) * 100,
  }));

  return (
    <View>
      <View
        style={{
          height: 18,
          borderRadius: 9,
          overflow: "hidden",
          flexDirection: "row",
          backgroundColor: t.inputBg,
          marginBottom: 14,
        }}
      >
        {slices.map((sl) => (
          <View
            key={sl.label}
            style={{
              width: (Math.max(2, sl.pct) + "%") as any,
              backgroundColor: sl.color,
              height: "100%" as any,
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12, justifyContent: "center" }}>
        {slices.map((sl) => (
          <View
            key={sl.label + "-chip"}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: sl.color,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{sl.pct.toFixed(0)}%</Text>
          </View>
        ))}
      </View>

      {slices.map((sl) => (
        <View
          key={sl.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: sl.color,
                marginRight: 8,
              }}
            />
            <Text style={{ color: t.text, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
              {sl.label}
            </Text>
          </View>
          <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700" }}>
            {sl.pct.toFixed(0)}% · {money(sl.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Linha simplificada por categoria */
function LineChart({
  items,
  color,
  t,
}: {
  items: { label: string; value: number }[];
  color: string;
  t: ReturnType<typeof useTheme>;
}) {
  const maxV = Math.max(1, ...items.map((i) => i.value));
  const h = 120;

  return (
    <View>
      <View style={{ height: h, flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: 4 }}>
        {items.map((item) => {
          const barH = Math.max(6, (item.value / maxV) * (h - 24));
          return (
            <View key={item.label} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: t.muted, fontSize: 9, marginBottom: 4 }} numberOfLines={1}>
                {money(item.value)}
              </Text>
              <View
                style={{
                  width: 10,
                  height: barH,
                  borderRadius: 5,
                  backgroundColor: color,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", marginTop: 8, gap: 4 }}>
        {items.map((item) => (
          <Text
            key={item.label}
            style={{ flex: 1, textAlign: "center", color: t.muted, fontSize: 9 }}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function makeStyles(t: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    header: {
      backgroundColor: t.header,
      paddingHorizontal: 22,
      paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 28) + 12 : 16,
      paddingBottom: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    brand: { color: "#FFF", fontSize: 19, fontWeight: "900", letterSpacing: 1.2 },
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
    content: { padding: 16, paddingBottom: 90 },
    balanceCard: {
      backgroundColor: "#142A40",
      borderRadius: 22,
      padding: 22,
      marginBottom: 14,
    },
    mutedLight: { color: "#AABCCD", fontSize: 11, letterSpacing: 1, fontWeight: "700" },
    balance: { color: "#FFF", fontSize: 32, fontWeight: "800", marginTop: 8 },
    formula: { color: "#7F93A8", fontSize: 11, marginTop: 4 },
    balanceDivider: { height: 1, backgroundColor: "#35516A", marginVertical: 16 },
    balanceRow: { flexDirection: "row", justifyContent: "space-between" },
    balanceSmall: { color: "#FFF", fontSize: 16, fontWeight: "700", marginTop: 5 },
    statRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    statCard: {
      flex: 1,
      backgroundColor: t.card,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 10,
    },
    statLabel: { color: t.muted, fontSize: 12, marginBottom: 6 },
    income: { color: t.accent, fontWeight: "800", fontSize: 15 },
    expense: { color: t.danger, fontWeight: "800", fontSize: 15 },
    section: {
      color: t.text,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 8,
      marginBottom: 12,
    },
    quickRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
    formCard: {
      backgroundColor: t.card,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: t.border,
    },
    segment: {
      flexDirection: "row",
      flexWrap: "wrap",
      backgroundColor: t.inputBg,
      padding: 4,
      borderRadius: 12,
      marginBottom: 14,
      gap: 4,
    },
    segmentBtn: {
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 9,
      minWidth: "47%",
      alignItems: "center",
    },
    segmentActive: { backgroundColor: "#142A40" },
    segmentText: { color: t.muted, fontWeight: "700", fontSize: 12 },
    segmentTextActive: { color: "#FFF" },
    primaryBtn: {
      backgroundColor: t.accent,
      padding: 14,
      alignItems: "center",
      borderRadius: 12,
      marginTop: 4,
    },
    primaryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
    rowBetween: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    barTrack: {
      height: 10,
      backgroundColor: t.inputBg,
      borderRadius: 8,
      overflow: "hidden",
      marginTop: 6,
    },
    barFill: { height: 10, borderRadius: 8 },
    divider: { height: 1, backgroundColor: t.border, marginVertical: 12 },
    muted: { color: t.muted, fontSize: 12 },
    tabBar: {
      flexDirection: "row",
      backgroundColor: t.tabBg,
      borderTopWidth: 1,
      borderColor: t.border,
      paddingTop: 12,
      // Espaço grande para não ficar sob os botões do sistema (Samsung etc.)
      paddingBottom: Platform.OS === "android" ? 48 : 24,
      justifyContent: "space-around",
      minHeight: Platform.OS === "android" ? 72 : 56,
    },
    signature: {
      display: "none",
    },
  });
}

export default function App() {
  return (
    <SQLiteProvider databaseName="wenderbank_v2.db" onInit={initialize}>
      <AppContent />
    </SQLiteProvider>
  );
}
