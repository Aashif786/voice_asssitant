import { useCallback, useEffect, useRef, useState } from "react";

import { agent } from "@/src/services/agent/AgentOrchestrator";
import { conversationRepository as repo } from "@/src/services/storage/SQLiteService";
import { speechSynthesis } from "@/src/services/voice";
import { useSettings } from "@/src/store/settings";
import type { AssistantState, Message, ToolCall } from "@/src/types";
import { newId } from "@/src/utils/format";

export function useConversation(initialId: string | null) {
  const { settings } = useSettings();
  const [convId, setConvId] = useState<string | null>(initialId);
  const [title, setTitle] = useState("New conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<AssistantState>("idle");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(initialId));
  const busy = useRef(false);
  const msgsRef = useRef<Message[]>([]);
  useEffect(() => {
    msgsRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!initialId) return;
    (async () => {
      const [c, m] = await Promise.all([repo.getConversation(initialId), repo.getMessages(initialId)]);
      if (c) setTitle(c.title);
      setMessages(m);
      setLoading(false);
    })();
    return () => speechSynthesis.stop();
  }, [initialId]);

  const push = async (m: Message) => {
    setMessages((cur) => [...cur, m]);
    await repo.addMessage(m);
  };

  const speak = useCallback(async (m: Message) => {
    setSpeakingId(m.id);
    setState("speaking");
    await speechSynthesis.speak(m.content, { rate: settings.speechRate, voice: settings.voice });
    setSpeakingId((cur) => (cur === m.id ? null : cur));
    setState((s) => (s === "speaking" ? "idle" : s));
  }, [settings.speechRate, settings.voice]);

  const stopSpeaking = useCallback(() => speechSynthesis.stop(), []);

  const reply = async (cid: string, text: string, tool: ToolCall | null) => {
    const m: Message = { id: newId(), conversationId: cid, role: "assistant", content: text, createdAt: Date.now(), tool };
    await push(m);
    if (settings.autoPlayback && tool?.status !== "pending_confirmation") speak(m);
    else setState("idle");
  };

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || busy.current) return;
    busy.current = true;
    speechSynthesis.stop();
    try {
      let cid = convId;
      if (!cid) {
        const c = await repo.createConversation(text.length > 42 ? `${text.slice(0, 40)}…` : text);
        cid = c.id;
        setConvId(c.id);
        setTitle(c.title);
      }
      const history = msgsRef.current;
      await push({ id: newId(), conversationId: cid, role: "user", content: text, createdAt: Date.now(), tool: null });
      const res = await agent.handle(text, history, setState);
      await reply(cid, res.text, res.tool);
    } catch {
      setState("error");
    } finally {
      busy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, settings.autoPlayback, speak]);

  const resolveTool = useCallback(async (messageId: string, approved: boolean) => {
    const msg = msgsRef.current.find((m) => m.id === messageId);
    if (!msg?.tool || !convId || busy.current) return;
    busy.current = true;
    try {
      const res = await agent.resolveConfirmation(msg.tool, approved, setState);
      const updated = res.tool!;
      setMessages((cur) => cur.map((m) => (m.id === messageId ? { ...m, tool: updated } : m)));
      await repo.updateMessageTool(messageId, updated);
      await reply(convId, res.text, null);
    } catch {
      setState("error");
    } finally {
      busy.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, settings.autoPlayback, speak]);

  return { convId, title, messages, state, setState, speakingId, loading, send, resolveTool, speak, stopSpeaking };
}