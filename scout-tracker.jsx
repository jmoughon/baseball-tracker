import { useState, useEffect, useRef } from "react";

// ---------- constants ----------
const HIT_TYPES = [
  { key: "GB", label: "GB", full: "Ground ball", color: "#B5651D" },
  { key: "LD", label: "LD", full: "Line drive", color: "#D64545" },
  { key: "FB", label: "FB", full: "Fly ball", color: "#3E7CB1" },
  { key: "K", label: "K", full: "Strikeout", color: "#6B7280" },
];
const TIMINGS = [
  { key: "early", label: "Early" },
  { key: "on", label: "On time" },
  { key: "late", label: "Late" },
];
const STORAGE_KEY = "scout-tracker-v1";

const uid = () => Math.random().toString(36).slice(2, 9);

async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch {
    return null;
  }
}
async function saveData(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("save failed", e);
  }
}

// ---------- field geometry ----------
// viewBox 0..100. Home plate at (50, 88). Foul lines at 45°.
const HOME = { x: 50, y: 88 };

function FieldSVG({ dots, onTap, interactive, highlightId }) {
  const ref = useRef(null);

  const handleTap = (e) => {
    if (!interactive || !onTap) return;
    const svg = ref.current;
    const rect = svg.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const x = (cx / rect.width) * 100;
    const y = (cy / rect.height) * 100;
    onTap({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
  };

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 92"
      onClick={handleTap}
      style={{
        width: "100%",
        display: "block",
        touchAction: "manipulation",
        cursor: interactive ? "crosshair" : "default",
        borderRadius: 12,
      }}
    >
      {/* grass */}
      <rect x="0" y="0" width="100" height="92" fill="#4A7C59" />
      {/* outfield arc lighter mow rings */}
      <circle cx={HOME.x} cy={HOME.y} r="78" fill="#52885F" />
      <circle cx={HOME.x} cy={HOME.y} r="64" fill="#4A7C59" />
      <circle cx={HOME.x} cy={HOME.y} r="50" fill="#52885F" />
      {/* infield dirt */}
      <circle cx={HOME.x} cy={HOME.y - 19} r="24" fill="#D9A05B" />
      {/* infield grass diamond */}
      <path
        d={`M ${HOME.x} ${HOME.y - 4} L ${HOME.x + 14} ${HOME.y - 18} L ${HOME.x} ${HOME.y - 32} L ${HOME.x - 14} ${HOME.y - 18} Z`}
        fill="#4A7C59"
      />
      {/* mound */}
      <circle cx={HOME.x} cy={HOME.y - 18} r="2.6" fill="#C8956C" />
      {/* foul lines */}
      <line x1={HOME.x} y1={HOME.y} x2="2" y2="40" stroke="#FFFFFF" strokeWidth="0.8" />
      <line x1={HOME.x} y1={HOME.y} x2="98" y2="40" stroke="#FFFFFF" strokeWidth="0.8" />
      {/* bases */}
      {[
        [HOME.x + 14, HOME.y - 18],
        [HOME.x, HOME.y - 32],
        [HOME.x - 14, HOME.y - 18],
      ].map(([bx, by], i) => (
        <rect key={i} x={bx - 1.5} y={by - 1.5} width="3" height="3" fill="#FFFFFF" transform={`rotate(45 ${bx} ${by})`} />
      ))}
      {/* home plate */}
      <rect x={HOME.x - 1.5} y={HOME.y - 1.5} width="3" height="3" fill="#FFFFFF" transform={`rotate(45 ${HOME.x} ${HOME.y})`} />
      {/* dots */}
      {dots.map((d) => {
        const t = HIT_TYPES.find((h) => h.key === d.type);
        const isNew = d.id === highlightId;
        return (
          <g key={d.id}>
            <circle cx={d.x} cy={d.y} r={isNew ? 3 : 2.2} fill={t ? t.color : "#333"} stroke="#FFFFFF" strokeWidth="0.7" opacity="0.95" />
            {d.timing === "late" && (
              <circle cx={d.x} cy={d.y} r={isNew ? 4.4 : 3.6} fill="none" stroke="#FFD166" strokeWidth="0.6" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ---------- tendency helpers ----------
function batterStats(batter) {
  const abs = batter.abs || [];
  const total = abs.length;
  const counts = { GB: 0, LD: 0, FB: 0, K: 0 };
  const timing = { early: 0, on: 0, late: 0 };
  let left = 0, center = 0, right = 0, located = 0;
  abs.forEach((ab) => {
    if (counts[ab.type] !== undefined) counts[ab.type]++;
    if (ab.timing && timing[ab.timing] !== undefined) timing[ab.timing]++;
    if (ab.x != null) {
      located++;
      // angle from home plate; thirds of fair territory
      const ang = (Math.atan2(HOME.y - ab.y, ab.x - HOME.x) * 180) / Math.PI; // 0=right field line side, 90=CF
      if (ang > 105) left++;
      else if (ang < 75) right++;
      else center++;
    }
  });
  return { total, counts, timing, spray: { left, center, right, located } };
}

function tendencyTags(batter) {
  const s = batterStats(batter);
  const tags = [];
  if (s.total < 2) return tags;
  const inPlay = s.total - s.counts.K;
  if (s.counts.K / s.total >= 0.5) tags.push({ txt: "K risk low", tone: "good" });
  if (inPlay > 0 && s.counts.GB / inPlay >= 0.6) tags.push({ txt: "GB heavy", tone: "info" });
  if (inPlay > 0 && s.counts.FB / inPlay >= 0.6) tags.push({ txt: "FB heavy", tone: "info" });
  const swings = s.timing.early + s.timing.on + s.timing.late;
  if (swings > 0 && s.timing.late / swings >= 0.5) tags.push({ txt: "Late swing", tone: "warn" });
  if (swings > 0 && s.timing.early / swings >= 0.5) tags.push({ txt: "Out front", tone: "warn" });
  if (s.spray.located > 1) {
    const pullSide = batter.hand === "L" ? s.spray.right : s.spray.left;
    if (pullSide / s.spray.located >= 0.65) tags.push({ txt: "Pulls", tone: "info" });
  }
  return tags.slice(0, 3);
}

// ---------- export ----------
function buildReport(team) {
  const lines = [`SCOUTING REPORT — ${team.name}`, `Generated ${new Date().toLocaleDateString()}`, ""];
  team.batters.forEach((b, i) => {
    const s = batterStats(b);
    const swings = s.timing.early + s.timing.on + s.timing.late;
    const tags = tendencyTags(b).map((t) => t.txt).join(", ");
    lines.push(`${b.number ? "#" + b.number : i + 1} ${b.name} (bats ${b.hand}) — ${s.total} AB`);
    lines.push(`  Results: GB ${s.counts.GB} · LD ${s.counts.LD} · FB ${s.counts.FB} · K ${s.counts.K}`);
    if (swings) {
      lines.push(
        `  Timing: early ${Math.round((s.timing.early / swings) * 100)}% · on ${Math.round((s.timing.on / swings) * 100)}% · late ${Math.round((s.timing.late / swings) * 100)}%`
      );
    }
    if (s.spray.located) {
      lines.push(
        `  Spray L/C/R: ${Math.round((s.spray.left / s.spray.located) * 100)}% / ${Math.round((s.spray.center / s.spray.located) * 100)}% / ${Math.round((s.spray.right / s.spray.located) * 100)}%`
      );
    }
    if (tags) lines.push(`  Tags: ${tags}`);
    lines.push("");
  });
  return lines.join("\n");
}

function buildCSV(team) {
  const rows = [["team", "number", "batter", "hand", "ab", "result", "timing", "x", "y", "date"]];
  team.batters.forEach((b) => {
    (b.abs || []).forEach((ab, i) => {
      rows.push([
        team.name,
        b.number || "",
        b.name,
        b.hand,
        i + 1,
        ab.type,
        ab.timing || "",
        ab.x ?? "",
        ab.y ?? "",
        ab.ts ? new Date(ab.ts).toISOString().slice(0, 10) : "",
      ]);
    });
  });
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ---------- main app ----------
export default function ScoutTracker() {
  const [data, setData] = useState(null);
  const [view, setView] = useState({ screen: "roster" }); // roster | batter
  const [pendingType, setPendingType] = useState(null);
  const [pendingTiming, setPendingTiming] = useState(null);
  const [lastDotId, setLastDotId] = useState(null);
  const [newName, setNewName] = useState("");
  const [newNum, setNewNum] = useState("");
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  useEffect(() => {
    (async () => {
      const d = await loadData();
      if (d) setData(d);
      else {
        const teamId = uid();
        setData({ teams: [{ id: teamId, name: "Opponent 1", batters: [] }], activeTeamId: teamId });
      }
    })();
  }, []);

  useEffect(() => {
    if (data) saveData(data);
  }, [data]);

  if (!data) {
    return (
      <div style={S.shell}>
        <div style={{ padding: 40, textAlign: "center", color: "#6B7280", fontSize: 14 }}>Loading your scouting book…</div>
      </div>
    );
  }

  const team = data.teams.find((t) => t.id === data.activeTeamId) || data.teams[0];
  const batter = view.screen === "batter" ? team.batters.find((b) => b.id === view.batterId) : null;

  const updateTeam = (fn) =>
    setData((d) => ({
      ...d,
      teams: d.teams.map((t) => (t.id === team.id ? fn(t) : t)),
    }));

  const addBatter = () => {
    const name = newName.trim();
    if (!name) return;
    const b = { id: uid(), name, number: newNum.trim(), hand: "R", abs: [] };
    updateTeam((t) => ({ ...t, batters: [...t.batters, b] }));
    setNewName("");
    setNewNum("");
  };

  const createTeam = () => {
    const name = newTeamName.trim();
    if (!name) return;
    const t = { id: uid(), name, batters: [] };
    setData((d) => ({ ...d, teams: [...d.teams, t], activeTeamId: t.id }));
    setNewTeamName("");
    setShowNewTeam(false);
    setView({ screen: "roster" });
  };

  const logAB = (loc) => {
    if (!pendingType) return;
    const ab = {
      id: uid(),
      type: pendingType,
      timing: pendingTiming,
      x: loc ? loc.x : null,
      y: loc ? loc.y : null,
      ts: Date.now(),
    };
    updateTeam((t) => ({
      ...t,
      batters: t.batters.map((b) => (b.id === batter.id ? { ...b, abs: [...b.abs, ab] } : b)),
    }));
    setLastDotId(ab.id);
    setPendingType(null);
    setPendingTiming(null);
  };

  const undoLast = () => {
    if (!batter || batter.abs.length === 0) return;
    updateTeam((t) => ({
      ...t,
      batters: t.batters.map((b) => (b.id === batter.id ? { ...b, abs: b.abs.slice(0, -1) } : b)),
    }));
  };

  // ---------- screens ----------
  return (
    <div style={S.shell}>
      <style>{`
        button { -webkit-tap-highlight-color: transparent; }
        input { outline: none; }
      `}</style>

      {/* header */}
      <div style={S.header}>
        {view.screen !== "roster" ? (
          <button style={S.backBtn} onClick={() => { setView({ screen: "roster" }); setPendingType(null); setPendingTiming(null); }}>
            ‹ Roster
          </button>
        ) : (
          <select
            value={team.id}
            onChange={(e) => {
              if (e.target.value === "__new") setShowNewTeam(true);
              else setData((d) => ({ ...d, activeTeamId: e.target.value }));
            }}
            style={S.teamSelect}
          >
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
            <option value="__new">+ New team…</option>
          </select>
        )}
        <div style={S.brand}>SCOUT BOOK</div>
      </div>

      {view.screen === "roster" && (
        <div style={{ padding: "12px 14px 28px" }}>
          {showNewTeam && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                autoFocus
                style={{ ...S.input, flex: 1 }}
                placeholder="New team name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTeam()}
              />
              <button style={S.addBtn} onClick={createTeam}>Create</button>
              <button
                style={{ ...S.addBtn, background: "#FFFFFF", color: "#6B7280", border: "1.5px solid #C9C6BC" }}
                onClick={() => { setShowNewTeam(false); setNewTeamName(""); }}
              >
                ✕
              </button>
            </div>
          )}          {team.batters.length === 0 && (
            <div style={S.empty}>Add the opposing lineup below, then tap a batter to start charting.</div>
          )}
          {team.batters.map((b, i) => {
            const s = batterStats(b);
            const tags = tendencyTags(b);
            return (
              <button key={b.id} style={S.batterCard} onClick={() => setView({ screen: "batter", batterId: b.id })}>
                <div style={S.batterNum}>{b.number || i + 1}</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#1B2A41" }}>{b.name}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                    {s.total} AB{s.total === 1 ? "" : "s"} · bats {b.hand}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 130 }}>
                  {tags.map((t, j) => (
                    <span key={j} style={{ ...S.tag, ...(t.tone === "warn" ? S.tagWarn : S.tagInfo) }}>{t.txt}</span>
                  ))}
                </div>
              </button>
            );
          })}

          <div style={S.addRow}>
            <input
              style={{ ...S.input, width: 52 }}
              placeholder="#"
              inputMode="numeric"
              value={newNum}
              onChange={(e) => setNewNum(e.target.value)}
            />
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="Batter name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBatter()}
            />
            <button style={S.addBtn} onClick={addBatter}>Add</button>
          </div>

          {team.batters.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button style={{ ...S.exportBtn, marginTop: 0, flex: 1 }} onClick={() => setView({ screen: "export" })}>
                Export report / CSV
              </button>
              <button style={{ ...S.exportBtn, marginTop: 0, flex: 1 }} onClick={() => setView({ screen: "print" })}>
                Spray chart sheet
              </button>
            </div>
          )}
        </div>
      )}

      {view.screen === "export" && <ExportScreen team={team} />}

      {view.screen === "print" && <PrintScreen team={team} />}

      {view.screen === "batter" && batter && (
        <BatterScreen
          batter={batter}
          pendingType={pendingType}
          pendingTiming={pendingTiming}
          setPendingType={setPendingType}
          setPendingTiming={setPendingTiming}
          logAB={logAB}
          undoLast={undoLast}
          lastDotId={lastDotId}
          toggleHand={() =>
            updateTeam((t) => ({
              ...t,
              batters: t.batters.map((b) => (b.id === batter.id ? { ...b, hand: b.hand === "R" ? "L" : "R" } : b)),
            }))
          }
        />
      )}
    </div>
  );
}

// ---------- sheet image (replaces window.print, which is blocked in this sandbox) ----------
const escXML = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fieldSVGInner(dots) {
  let s = "";
  s += `<rect x="0" y="0" width="100" height="92" fill="#4A7C59"/>`;
  s += `<circle cx="${HOME.x}" cy="${HOME.y}" r="78" fill="#52885F"/>`;
  s += `<circle cx="${HOME.x}" cy="${HOME.y}" r="64" fill="#4A7C59"/>`;
  s += `<circle cx="${HOME.x}" cy="${HOME.y}" r="50" fill="#52885F"/>`;
  s += `<circle cx="${HOME.x}" cy="${HOME.y - 19}" r="24" fill="#D9A05B"/>`;
  s += `<path d="M ${HOME.x} ${HOME.y - 4} L ${HOME.x + 14} ${HOME.y - 18} L ${HOME.x} ${HOME.y - 32} L ${HOME.x - 14} ${HOME.y - 18} Z" fill="#4A7C59"/>`;
  s += `<circle cx="${HOME.x}" cy="${HOME.y - 18}" r="2.6" fill="#C8956C"/>`;
  s += `<line x1="${HOME.x}" y1="${HOME.y}" x2="2" y2="40" stroke="#FFFFFF" stroke-width="0.8"/>`;
  s += `<line x1="${HOME.x}" y1="${HOME.y}" x2="98" y2="40" stroke="#FFFFFF" stroke-width="0.8"/>`;
  [
    [HOME.x + 14, HOME.y - 18],
    [HOME.x, HOME.y - 32],
    [HOME.x - 14, HOME.y - 18],
    [HOME.x, HOME.y],
  ].forEach(([bx, by]) => {
    s += `<rect x="${bx - 1.5}" y="${by - 1.5}" width="3" height="3" fill="#FFFFFF" transform="rotate(45 ${bx} ${by})"/>`;
  });
  dots.forEach((d) => {
    const t = HIT_TYPES.find((h) => h.key === d.type);
    s += `<circle cx="${d.x}" cy="${d.y}" r="2.2" fill="${t ? t.color : "#333"}" stroke="#FFFFFF" stroke-width="0.7" opacity="0.95"/>`;
    if (d.timing === "late") {
      s += `<circle cx="${d.x}" cy="${d.y}" r="3.6" fill="none" stroke="#FFD166" stroke-width="0.6"/>`;
    }
  });
  return s;
}

function buildSheetSVG(team) {
  const W = 1000, pad = 24, gap = 16;
  const colW = (W - pad * 2 - gap) / 2;
  const fieldW = colW - 16;
  const fieldH = Math.round(fieldW * 0.92);
  const cardH = 30 + fieldH + 72;
  const rows = Math.max(1, Math.ceil(team.batters.length / 2));
  const top = 118;
  const H = top + rows * (cardH + gap) - gap + pad;
  const font = `font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"`;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  s += `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`;
  s += `<text x="${W / 2}" y="46" text-anchor="middle" ${font} font-size="26" font-weight="800" fill="#1B2A41">${escXML(team.name)} — Spray Charts</text>`;
  s += `<text x="${W / 2}" y="68" text-anchor="middle" ${font} font-size="13" fill="#6B7280">${escXML(new Date().toLocaleDateString())}</text>`;

  const legend = [
    ...HIT_TYPES.filter((h) => h.key !== "K").map((h) => ({ color: h.color, label: h.full, ring: false })),
    { color: "#FFD166", label: "Late swing", ring: true },
  ];
  let lx = W / 2 - 290;
  legend.forEach((l) => {
    if (l.ring) s += `<circle cx="${lx}" cy="92" r="5" fill="none" stroke="${l.color}" stroke-width="2.5"/>`;
    else s += `<circle cx="${lx}" cy="92" r="5.5" fill="${l.color}"/>`;
    s += `<text x="${lx + 11}" y="96" ${font} font-size="12" font-weight="700" fill="#374151">${escXML(l.label)}</text>`;
    lx += 150;
  });

  team.batters.forEach((b, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = pad + col * (colW + gap);
    const y = top + row * (cardH + gap);
    const st = batterStats(b);
    const swings = st.timing.early + st.timing.on + st.timing.late;
    const dots = (b.abs || []).filter((a) => a.x != null);
    const tags = tendencyTags(b).map((t) => t.txt).join(" · ");

    s += `<rect x="${x}" y="${y}" width="${colW}" height="${cardH}" rx="10" fill="#FFFFFF" stroke="#E2E0D8"/>`;
    s += `<text x="${x + 10}" y="${y + 21}" ${font} font-size="15" font-weight="800" fill="#1B2A41">${escXML((b.number ? "#" + b.number + " " : i + 1 + ". ") + b.name)} <tspan font-weight="600" fill="#6B7280">(${escXML(b.hand)})</tspan></text>`;
    s += `<svg x="${x + 8}" y="${y + 28}" width="${fieldW}" height="${fieldH}" viewBox="0 0 100 92" preserveAspectRatio="xMidYMid meet">${fieldSVGInner(dots)}</svg>`;

    let ty = y + 28 + fieldH + 19;
    s += `<text x="${x + 10}" y="${ty}" ${font} font-size="12" fill="#374151">${st.total} AB · GB ${st.counts.GB} / LD ${st.counts.LD} / FB ${st.counts.FB} / K ${st.counts.K}</text>`;
    if (swings > 0) {
      ty += 17;
      s += `<text x="${x + 10}" y="${ty}" ${font} font-size="12" fill="#374151">Timing: E ${Math.round((st.timing.early / swings) * 100)}% · On ${Math.round((st.timing.on / swings) * 100)}% · L ${Math.round((st.timing.late / swings) * 100)}%</text>`;
    }
    if (tags) {
      ty += 17;
      s += `<text x="${x + 10}" y="${ty}" ${font} font-size="12" font-weight="700" fill="#B07D1A">${escXML(tags)}</text>`;
    }
  });

  s += `</svg>`;
  return { svg: s, w: W, h: H };
}

function svgToPng(svgString, w, h) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        const scale = 2;
        c.width = w * scale;
        c.height = h * scale;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
  });
}

function PrintScreen({ team }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const makeImage = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { svg, w, h } = buildSheetSVG(team);
      setImg(await svgToPng(svg, w, h));
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  return (
    <div style={{ padding: "12px 14px 28px" }}>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: "#1B2A41" }}>{team.name} — Spray Charts</div>
        <div style={{ fontSize: 11, color: "#6B7280" }}>{new Date().toLocaleDateString()}</div>
      </div>

      <button
        style={{ ...S.addBtn, width: "100%", padding: "13px 0", opacity: busy ? 0.7 : 1 }}
        onClick={makeImage}
        disabled={busy}
      >
        {busy ? "Building sheet…" : img ? "Rebuild sheet image" : "Create sheet image"}
      </button>

      {failed && (
        <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 8, textAlign: "center" }}>
          Couldn't build the image on this device — a screenshot of the preview below works just as well.
        </div>
      )}

      {img && (
        <div style={{ marginTop: 12 }}>
          <img
            src={img}
            alt={`${team.name} spray charts`}
            style={{ width: "100%", borderRadius: 10, border: "1px solid #E2E0D8", display: "block" }}
          />
          <a
            href={img}
            download={`${team.name.replace(/[^\w-]+/g, "_")}-spray-charts.png`}
            style={{
              ...S.exportBtn,
              display: "block",
              textAlign: "center",
              textDecoration: "none",
              marginTop: 10,
              boxSizing: "border-box",
            }}
          >
            Download PNG
          </a>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
            On a phone, press and hold the image to save or share it — use that if the download button does nothing here.
          </div>
        </div>
      )}

      {/* live preview */}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, margin: "16px 0 12px", flexWrap: "wrap" }}>
        {HIT_TYPES.filter((h) => h.key !== "K").map((h) => (
          <span key={h.key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#374151" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: h.color, display: "inline-block" }} />
            {h.full}
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#374151" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #FFD166", display: "inline-block", boxSizing: "border-box" }} />
          Late swing
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
        {team.batters.map((b, i) => {
          const s = batterStats(b);
          const swings = s.timing.early + s.timing.on + s.timing.late;
          const dots = (b.abs || []).filter((a) => a.x != null);
          const tags = tendencyTags(b).map((t) => t.txt).join(" · ");
          return (
            <div key={b.id} style={{ background: "#FFFFFF", border: "1px solid #E2E0D8", borderRadius: 10, padding: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#1B2A41", marginBottom: 4 }}>
                {b.number ? `#${b.number} ` : `${i + 1}. `}{b.name} <span style={{ fontWeight: 600, color: "#6B7280" }}>({b.hand})</span>
              </div>
              <FieldSVG dots={dots} interactive={false} />
              <div style={{ fontSize: 10, color: "#374151", marginTop: 5, lineHeight: 1.45 }}>
                <div>
                  {s.total} AB · GB {s.counts.GB} / LD {s.counts.LD} / FB {s.counts.FB} / K {s.counts.K}
                </div>
                {swings > 0 && (
                  <div>
                    Timing: E {Math.round((s.timing.early / swings) * 100)}% · On {Math.round((s.timing.on / swings) * 100)}% · L {Math.round((s.timing.late / swings) * 100)}%
                  </div>
                )}
                {tags && <div style={{ fontWeight: 700, color: "#B07D1A" }}>{tags}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExportScreen({ team }) {
  const [mode, setMode] = useState("report"); // report | csv
  const [copied, setCopied] = useState(false);
  const text = mode === "report" ? buildReport(team) : buildCSV(team);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — user can long-press the textarea below
    }
  };

  return (
    <div style={{ padding: "12px 14px 28px" }}>
      <div style={S.segRow}>
        {[["report", "Scouting report"], ["csv", "Raw CSV"]].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              ...S.segBtn,
              fontSize: 14,
              borderColor: "#1B2A41",
              background: mode === k ? "#1B2A41" : "#FFFFFF",
              color: mode === k ? "#FFFFFF" : "#1B2A41",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <button style={{ ...S.addBtn, width: "100%", padding: "13px 0", marginTop: 10 }} onClick={copy}>
        {copied ? "Copied ✓" : "Copy to clipboard"}
      </button>
      <textarea
        readOnly
        value={text}
        onFocus={(e) => e.target.select()}
        style={{
          width: "100%",
          height: 320,
          marginTop: 10,
          border: "1.5px solid #C9C6BC",
          borderRadius: 10,
          padding: 12,
          fontSize: 12,
          fontFamily: "ui-monospace, Menlo, monospace",
          background: "#FFFFFF",
          color: "#1B2A41",
          boxSizing: "border-box",
        }}
      />
      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>
        Copy the report into Notes or a group text, or paste the CSV into a spreadsheet. If the copy button doesn't work on your phone, long-press inside the box and select all.
      </div>
    </div>
  );
}

function BatterScreen({ batter, pendingType, pendingTiming, setPendingType, setPendingTiming, logAB, undoLast, lastDotId, toggleHand }) {
  const s = batterStats(batter);
  const dots = (batter.abs || []).filter((a) => a.x != null);
  const awaitingTap = pendingType && pendingType !== "K";
  const swings = s.timing.early + s.timing.on + s.timing.late;

  return (
    <div style={{ padding: "10px 14px 28px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#1B2A41" }}>
            {batter.number ? `#${batter.number} ` : ""}{batter.name}
          </span>
        </div>
        <button style={S.handBtn} onClick={toggleHand}>Bats {batter.hand} ⇄</button>
      </div>

      <FieldSVG dots={dots} onTap={awaitingTap ? logAB : null} interactive={awaitingTap} highlightId={lastDotId} />

      {/* instruction strip */}
      <div style={{ ...S.instruction, background: awaitingTap ? "#FFF4D6" : "#EEF1F4" }}>
        {awaitingTap
          ? `Tap the field where the ${pendingType} landed`
          : pendingType === "K"
            ? "Strikeout selected — save below"
            : "1. Pick result · 2. Pick timing · 3. Tap field"}
      </div>

      {/* result buttons */}
      <div style={S.segRow}>
        {HIT_TYPES.map((h) => (
          <button
            key={h.key}
            onClick={() => setPendingType(pendingType === h.key ? null : h.key)}
            style={{
              ...S.segBtn,
              borderColor: h.color,
              background: pendingType === h.key ? h.color : "#FFFFFF",
              color: pendingType === h.key ? "#FFFFFF" : h.color,
            }}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* timing buttons */}
      <div style={S.segRow}>
        {TIMINGS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPendingTiming(pendingTiming === t.key ? null : t.key)}
            style={{
              ...S.segBtn,
              fontSize: 14,
              borderColor: "#1B2A41",
              background: pendingTiming === t.key ? "#1B2A41" : "#FFFFFF",
              color: pendingTiming === t.key ? "#FFFFFF" : "#1B2A41",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pendingType === "K" && (
        <button style={S.saveK} onClick={() => logAB(null)}>Save strikeout</button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1B2A41", letterSpacing: 0.5 }}>TENDENCIES · {s.total} AB</div>
        <button style={S.undoBtn} onClick={undoLast} disabled={batter.abs.length === 0}>Undo last</button>
      </div>

      <div style={S.statGrid}>
        {HIT_TYPES.map((h) => (
          <div key={h.key} style={S.statCell}>
            <div style={{ fontSize: 18, fontWeight: 800, color: h.color }}>{s.counts[h.key]}</div>
            <div style={S.statLabel}>{h.key}</div>
          </div>
        ))}
        {TIMINGS.map((t) => (
          <div key={t.key} style={S.statCell}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#1B2A41" }}>
              {swings ? Math.round((s.timing[t.key] / swings) * 100) + "%" : "–"}
            </div>
            <div style={S.statLabel}>{t.label}</div>
          </div>
        ))}
        <div style={S.statCell}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1B2A41" }}>
            {s.spray.located
              ? `${Math.round((s.spray.left / s.spray.located) * 100)}/${Math.round((s.spray.center / s.spray.located) * 100)}/${Math.round((s.spray.right / s.spray.located) * 100)}`
              : "–"}
          </div>
          <div style={S.statLabel}>L/C/R %</div>
        </div>
      </div>

      {/* AB log */}
      {batter.abs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {[...batter.abs].reverse().slice(0, 6).map((ab, i) => {
            const h = HIT_TYPES.find((x) => x.key === ab.type);
            return (
              <div key={ab.id} style={S.logRow}>
                <span style={{ ...S.logBadge, background: h.color }}>{ab.type}</span>
                <span style={{ color: "#374151" }}>
                  {ab.timing ? TIMINGS.find((t) => t.key === ab.timing).label : "timing n/a"}
                </span>
                <span style={{ marginLeft: "auto", color: "#9CA3AF", fontSize: 11 }}>
                  AB {batter.abs.length - i}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- styles ----------
const S = {
  shell: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    background: "#FAFAF7",
    minHeight: "100vh",
    maxWidth: 480,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    borderBottom: "2px solid #1B2A41",
    background: "#FAFAF7",
    position: "sticky",
    top: 0,
    zIndex: 5,
  },
  brand: { fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#1B2A41" },
  teamSelect: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1B2A41",
    border: "1.5px solid #1B2A41",
    borderRadius: 8,
    padding: "6px 8px",
    background: "#FFFFFF",
    maxWidth: 220,
  },
  backBtn: {
    fontSize: 15,
    fontWeight: 700,
    color: "#1B2A41",
    background: "none",
    border: "none",
    padding: "6px 4px",
    cursor: "pointer",
  },
  empty: {
    padding: "28px 18px",
    textAlign: "center",
    color: "#6B7280",
    fontSize: 14,
    lineHeight: 1.5,
  },
  batterCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    background: "#FFFFFF",
    border: "1px solid #E2E0D8",
    borderRadius: 12,
    padding: "12px 14px",
    marginBottom: 8,
    cursor: "pointer",
  },
  batterNum: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "#1B2A41",
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  tag: {
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  tagInfo: { background: "#E8F0F7", color: "#3E7CB1" },
  tagWarn: { background: "#FFF1D6", color: "#B07D1A" },
  addRow: { display: "flex", gap: 8, marginTop: 14 },
  input: {
    border: "1.5px solid #C9C6BC",
    borderRadius: 10,
    padding: "11px 12px",
    fontSize: 15,
    background: "#FFFFFF",
  },
  addBtn: {
    background: "#1B2A41",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 10,
    padding: "0 18px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  exportBtn: {
    width: "100%",
    marginTop: 16,
    background: "#FFFFFF",
    color: "#1B2A41",
    border: "1.5px solid #1B2A41",
    borderRadius: 10,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
  handBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1B2A41",
    background: "#FFFFFF",
    border: "1.5px solid #1B2A41",
    borderRadius: 8,
    padding: "5px 10px",
    cursor: "pointer",
  },
  instruction: {
    marginTop: 10,
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "#1B2A41",
    textAlign: "center",
  },
  segRow: { display: "flex", gap: 8, marginTop: 10 },
  segBtn: {
    flex: 1,
    border: "2px solid",
    borderRadius: 12,
    padding: "13px 0",
    fontSize: 17,
    fontWeight: 800,
    cursor: "pointer",
  },
  saveK: {
    width: "100%",
    marginTop: 10,
    background: "#6B7280",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 12,
    padding: "13px 0",
    fontSize: 16,
    fontWeight: 800,
    cursor: "pointer",
  },
  undoBtn: {
    fontSize: 12,
    fontWeight: 700,
    color: "#B07D1A",
    background: "#FFF8EB",
    border: "1px solid #E8D5A8",
    borderRadius: 8,
    padding: "5px 10px",
    cursor: "pointer",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 6,
    marginTop: 8,
  },
  statCell: {
    background: "#FFFFFF",
    border: "1px solid #E2E0D8",
    borderRadius: 10,
    padding: "8px 4px",
    textAlign: "center",
  },
  statLabel: { fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: 0.5, marginTop: 2 },
  logRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    padding: "7px 10px",
    background: "#FFFFFF",
    border: "1px solid #EDEBE3",
    borderRadius: 8,
    marginBottom: 5,
  },
  logBadge: {
    color: "#FFFFFF",
    fontWeight: 800,
    fontSize: 11,
    borderRadius: 6,
    padding: "2px 7px",
  },
};
