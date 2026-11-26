"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const tasks = [
  ["A", "精益供应链理论与实践", "负责案例背景、精益理论、Carestream 实践分析、开场及参考文献格式统一。", "案例 P1–2", "2分30秒"],
  ["B", "供应链流程与提前期分析", "负责供应链流程图、各环节运输与生产时间、提前期计算及数据核查。", "P2 及 Exhibit 3", "2分30秒"],
  ["C", "库存战略与波动分析", "负责库存位置、库存战略作用、供需波动来源及 Exhibit 4、5 图表分析。", "P2–3、P5–6", "2分45秒"],
  ["D", "港口危机与应对方案", "负责供应链中断影响、管理问题、替代运输方案及可行性对比。", "P3–4", "3分钟"],
  ["E", "空运决策与成本分析", "负责空运启动条件、空运数量、成本计算框架及最终管理建议。", "P3–4", "3分15秒"],
];
type Claim = { task: number; name: string };
type Connection = "loading" | "online" | "offline" | "invalid";

export default function Page() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [connection, setConnection] = useState<Connection>("loading");
  const [selection, setSelection] = useState<number>();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [own, setOwn] = useState(false);
  const roomKey = useRef("");
  const device = useRef("");
  const saving = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    const key = new URLSearchParams(location.search).get("room")
      ?? new URLSearchParams(location.hash.slice(1)).get("room");
    if (!key || !/^[A-Za-z0-9_-]{24}$/.test(key)) {
      setConnection("invalid");
      return;
    }
    roomKey.current = key;
    device.current = crypto.randomUUID();
    try {
      device.current = localStorage.getItem("carestream-device") || device.current;
      localStorage.setItem("carestream-device", device.current);
      setOwn(localStorage.getItem("carestream-claim-" + key) === "1");
    } catch {}

    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    async function refresh() {
      const version = revision.current;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 6000);
      try {
        const response = await fetch("/api/claims", {
          headers: { "x-room-key": roomKey.current }, signal: controller.signal,
        });
        if (response.status === 403) {
          if (active) setConnection("invalid");
          return;
        }
        if (!response.ok) throw new Error();
        const result = await response.json() as { claims: Claim[] };
        if (active && version === revision.current && !saving.current) {
          setClaims(result.claims);
          setConnection("online");
        }
      } catch {
        if (active && version === revision.current && !saving.current) setConnection("offline");
      } finally {
        clearTimeout(timeout);
      }
      if (active) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || connection !== "online" || own || !selection ||
        claims.some(claim => claim.task === selection) || !name.trim()) return;
    saving.current = true;
    revision.current++;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-room-key": roomKey.current },
        body: JSON.stringify({ task: selection, name, device: device.current }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
      });
      const result = await response.json() as { claims?: Claim[]; message?: string };
      if (Array.isArray(result.claims)) setClaims(result.claims);
      if (response.status === 201) {
        setOwn(true);
        setSelection(undefined);
        try { localStorage.setItem("carestream-claim-" + roomKey.current, "1"); } catch {}
        setMessage("认领成功。你的任务已锁定，组员会看到最新结果。");
      } else {
        if (response.status === 409) setSelection(undefined);
        setMessage(result.message || "提交失败，请稍后重试。");
      }
    } catch {
      setMessage("暂时无法确认提交结果，请先查看任务列表，再决定是否重试。");
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  const unavailable = connection !== "online" || pending || own;
  const selectedTaken = claims.some(claim => claim.task === selection);
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">GROUP 4 PRESENTATION</p>
        <h1>Carestream Health</h1>
        <p className="subtitle">第 4 组任务认领</p>
        <p className="rules">每人一项 · 每项限一人 · 先到先得</p>
        <div className="progress-label">
          <strong>{claims.length} / 5 已认领</strong>
          <span aria-live="polite">{{ loading: "连接中", online: "自动同步", offline: "连接中断，正在重试", invalid: "请扫码进入" }[connection]}</span>
        </div>
        <progress aria-label="认领进度" max={5} value={claims.length} />
      </header>

      <form onSubmit={submit}>
        <label className="name-label" htmlFor="name">你的姓名</label>
        <input id="name" autoComplete="name" placeholder="输入姓名" required maxLength={30} value={name}
          onChange={event => setName(event.target.value)} disabled={own || pending || connection === "invalid"} />

        <fieldset>
          <legend>请选择你负责的任务</legend>
          {tasks.map(([letter, title, detail, reading, time], i) => {
            const task = i + 1;
            const claim = claims.find(row => row.task === task);
            return <label className="card" key={letter} data-selected={selection === task && !claim}>
              <span className="card-head">
                <input type="radio" name="task" value={task} checked={selection === task && !claim}
                  onChange={() => setSelection(task)} disabled={unavailable || Boolean(claim)} />
                <span className="task-title">{letter}. {title} <small>Q{task}</small></span>
                <span className={claim ? "locked" : "available"}>{claim ? "已锁定" : connection === "online" ? "可认领" : "待同步"}</span>
              </span>
              {claim && <span className="owner">认领人 · {claim.name}</span>}
              <span className="detail">{detail}</span>
              <span className="metadata"><span>阅读 · {reading}</span><span>2 页 PPT</span><span>发言 · {time}</span></span>
            </label>;
          })}
        </fieldset>

        <aside><h2>统一交付要求</h2><p>英文 PPT、英文演讲提纲、案例证据、Harvard 参考文献及至少 2 道预设问答。所有成员均需准备英文发言及课堂问答。</p></aside>

        {selectedTaken && !own && <p role="status" className="feedback">所选任务刚被认领，请另选一项。</p>}
        {message && <p role="status" className="feedback">{message}</p>}
        <button type="submit" disabled={unavailable || !selection || selectedTaken || !name.trim()}>
          {own ? "你已认领一项任务" : pending ? "提交中…" : claims.length === 5 ? "五项任务均已认领" : "确认认领"}
        </button>
      </form>
    </main>
  );
}
