import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "react-router-dom";
import { MessageSquare, Users, Megaphone, SquarePen, Send, Loader2, Search } from "lucide-react";
import { Screen } from "@/components/Screen";
import { ErrorState, SkeletonList, Sheet } from "@/components/ui";
import { useAsync } from "@/lib/useAsync";
import { messageService } from "@/lib/services";
import { useFileUrl } from "@/lib/fileUrl";
import { onPush } from "@/lib/pushEvents";
import { fb } from "@/lib/feedback";
import styles from "./GuardMessages.module.css";

const newId = () =>
  (globalThis.crypto && (globalThis.crypto as any).randomUUID
    ? (globalThis.crypto as any).randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

type Chip = "all" | "unread";

function nameOf(c: any): string {
  return c.recipientName || c.counterpartName || c.subject || "Empresa";
}
function fmtTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (same(d, y)) return "Ayer";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function ConvAvatar({ c }: { c: any }) {
  const photo = useFileUrl(c.avatarUrl || c.avatar || null);
  const meta = c.isOneWay
    ? { bg: "#22c55e22", fg: "#22c55e", icon: <Megaphone size={20} /> }
    : c.isGroup
      ? { bg: "#3b82f622", fg: "#3b82f6", icon: <Users size={20} /> }
      : { bg: "var(--surface-2)", fg: "var(--muted)", icon: <MessageSquare size={20} /> };
  return (
    <span className={styles.avatarWrap}>
      <span className={styles.avatar} style={{ background: meta.bg, color: meta.fg }}>
        {photo ? <img src={photo} alt="" /> : meta.icon}
      </span>
    </span>
  );
}

function ConvRow({ c, onOpen }: { c: any; onOpen: () => void }) {
  const preview = c.lastMessagePreview || (c.isGroup ? "Grupo" : "");
  const [sender, ...rest] = String(preview).split(/:\s(.+)/);
  const hasSender = rest.length > 0;
  return (
    <button type="button" onClick={onOpen} className={styles.row}>
      <ConvAvatar c={c} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`truncate ${styles.name}`}>{nameOf(c)}</span>
          <span className={styles.time}>{fmtTime(c.lastMessageAt)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className={`min-w-0 flex-1 truncate ${styles.preview}`}>
            {hasSender ? (<><span className={styles.previewSender} style={{ color: "var(--online)" }}>{sender}: </span>{rest[0]}</>) : preview}
          </span>
          {(c.unreadCount || 0) > 0 && <span className={styles.badge}>{c.unreadCount}</span>}
        </span>
      </span>
    </button>
  );
}

export default function GuardMessages() {
  const { t } = useTranslation();
  const history = useHistory();
  const { data, loading, error, reload } = useAsync<any>(() => messageService.listThreads({ limit: 50 }));
  const rows: any[] = (data?.rows || []).filter((c: any) => c && c.id);
  const [composing, setComposing] = useState(false);
  const [chip, setChip] = useState<Chip>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const off = onPush((d: any) => { if (d?.type === "message.new") reload(); });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    let list = rows;
    if (chip === "unread") list = list.filter((c) => (c.unreadCount || 0) > 0);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => `${nameOf(c)} ${c.lastMessagePreview || ""}`.toLowerCase().includes(s));
    }
    return list;
  }, [rows, chip, q]);

  const onSent = async (conversationId: string) => {
    setComposing(false);
    await reload();
    if (conversationId) { fb.tap(); history.push(`/guard/messages/${conversationId}`); }
  };

  return (
    <Screen
      root
      largeTitle={t("messages.title", "Mensajes")}
      largeSubtitle={t("messages.subtitle", "Todas las conversaciones")}
      flush
      onRefresh={async () => { await reload(); }}
      right={
        <button
          onClick={() => { fb.tap(); setComposing(true); }}
          aria-label={t("messages.new", "Nuevo mensaje")}
          className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted active:bg-surface-2"
        >
          <SquarePen size={18} />
        </button>
      }
    >
      {/* Search + filter chips */}
      <div className="px-4 pt-3">
        <label className={styles.search}>
          <Search size={18} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("messages.searchConversations", "Buscar conversaciones")} />
        </label>
        <div className="mt-3 flex gap-2">
          {([["all", t("visitors.all", "Todas")], ["unread", t("messages.unread", "No leídas")]] as [Chip, string][]).map(([key, label]) => (
            <button key={key} type="button" onClick={() => { fb.select(); setChip(key); }} className={`${styles.chip} ${chip === key ? styles.chipActive : ""}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="px-4 pt-4"><SkeletonList /></div>
      ) : error ? (
        <div className="px-4 pt-8"><ErrorState onRetry={reload} /></div>
      ) : (
        <div className="mt-3">
          {shown.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-2 text-center">
              <MessageSquare size={30} className="text-faint" />
              <p className="text-sm text-muted">{t("messages.empty", "Sin conversaciones")}</p>
              <button onClick={() => setComposing(true)} className="mt-2 flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-on-accent">
                <SquarePen size={16} />{t("messages.contactOffice", "Escribir a la oficina")}
              </button>
            </div>
          ) : (
            shown.map((c) => <ConvRow key={c.id} c={c} onOpen={() => { fb.tap(); history.push(`/guard/messages/${c.id}`); }} />)
          )}
        </div>
      )}

      <ComposeSheet open={composing} onClose={() => setComposing(false)} onSent={onSent} />
    </Screen>
  );
}

/* ----------------------------------------------------------- Compose sheet */

function ComposeSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: (conversationId: string) => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      fb.press();
      const res: any = await messageService.create(text, newId());
      fb.success();
      onSent(res?.conversationId || "");
    } catch {
      fb.error();
      setError(t("messages.sendFailed", "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo."));
      setBusy(false);
    }
  };

  const requestClose = () => { if (!busy) onClose(); };

  return (
    <Sheet open={open} onClose={requestClose} title={t("messages.toOffice", "Para la oficina")}>
      <p className="label-eyebrow -mt-1 mb-2">{t("messages.new", "Nuevo mensaje")}</p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        autoFocus
        placeholder={t("messages.placeholder", "Escribe tu mensaje para la empresa…")}
        className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-gold/50"
      />
      {error && <p className="mt-2 text-xs text-critical">{error}</p>}

      <button
        onClick={send}
        disabled={busy || !body.trim()}
        className="btn-xl mt-4 w-full bg-gold-strong text-on-accent active:bg-gold-hover disabled:opacity-50"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {t("messages.send", "Enviar")}
      </button>
    </Sheet>
  );
}
