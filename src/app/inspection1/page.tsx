"use client";

import { useState, useEffect, useRef, useId } from "react";
import React from "react";
import type { InspectionApiPayload, PlcPinStatus } from '../../lib/inspectionDataService';
import { Activity, ArrowRight, CheckCircle2, Gauge, Maximize2, QrCode, ScanLine, X, XCircle } from "lucide-react";
import { useTheme } from "./components/ThemeContext";
import { useRouter } from "next/navigation";
// Current model for this PLC-backed screen.
const CURRENT_MODEL_NO = "6630865";
const MODEL_ROUTES: Record<string, string> = {
  "6630865": "/inspection1",
  "6630867": "/inspection2",
  "6630862": "/inspection3",
};
/* ═══════════════════════════════════════════════════════════
  DATA
═══════════════════════════════════════════════════════════ */
const stations = [
  {
    id: 1, name: "Loading Section", code: "ST-01", color: "#f97316", emoji: "⚙️",
    params: [
      { name: "Shaft OD (Left)", req: 35, tol: 0.025, unit: "mm" },
      { name: "Shaft OD (Right)", req: 35, tol: 0.025, unit: "mm" },
      { name: "Overall Length", req: 466, tol: 0.1, unit: "mm" },
      { name: "Dowel CF (Left)", req: 26.9, tol: 0.1, unit: "mm" },
      { name: "Dowel CF (Right)", req: 26.9, tol: 0.1, unit: "mm" },
      { name: "12.2mm Diameter", req: 12.2, tol: 0.025, unit: "mm" }
    ],
  },
  {
    id: 2, name: "Receiver Gauge", code: "ST-02", color: "#64748b", emoji: "📏",
    params: [
      { name: "15 Holes Ø3mm", req: 3, tol: 0.2, unit: "mm", pins: 15 },
      { name: "3 Holes Ø3mm", req: 3, tol: 0.2, unit: "mm", pins: 3 },
      { name: "4mm Hole 51°", req: 4, tol: 0.2, unit: "mm" },
      { name: "4 Hole Positions", req: null, tol: null, unit: "" },
      { name: "12.2–13mm Slot", req: 12.2, tol: 0.12, unit: "mm" },
    ],
  },
  {
    id: 3, name: "Laser Marking", code: "ST-03", color: "#16a34a", emoji: "▦",
    params: [
      { name: "QR Front (8×8)", req: null, tol: null, unit: "", grade: true },
      { name: "QR Back (8×8)", req: null, tol: null, unit: "", grade: true },
      { name: "Grade Verify", req: null, tol: null, unit: "", grade: true },
    ],
  },
  {
    id: 4, name: "Rotating", code: "ST-04", color: "#f59e0b", emoji: "↻",
    params: [],
  },
  {
    id: 5, name: "14.5 APG", code: "ST-05", color: "#dc2626", emoji: "◆",
    params: [
      { name: "Plug Reamer (Left)", req: 14.5, tol: 0.013, unit: "mm" },
      { name: "Plug Reamer (Right)", req: 14.5, tol: 0.013, unit: "mm" },
    ],
  },
  {
    id: 6, name: "6.3/4.98 APG", code: "ST-06", color: "#94a3b8", emoji: "⬡",
    params: [
      { name: "Reamer Hole (Left)", req: 4.98, tol: 0.013, unit: "mm" },
      { name: "Reamer Hole (Right)", req: 4.98, tol: 0.013, unit: "mm" },
      { name: "Hole Ø6.3 (Left)", req: 6.3, tol: 0.013, unit: "mm" },
      { name: "Hole Ø6.3 (Right)", req: 6.3, tol: 0.013, unit: "mm" },
    ],
  },
];

const LOADING_MS = 2000;

type Param = {
  name: string; req: number | null; tol: number | null;
  unit: string; pins?: number; grade?: boolean;
};
function isPass(req: number | null, tol: number | null, val: number | null): boolean | null {
  if (req === null || tol === null || val === null) return null;
  return val >= req - tol && val <= req + tol;
}
const empty15PinStatuses = (): PlcPinStatus[] => Array.from({ length: 15 }, () => null);
const empty3PinStatuses = (): PlcPinStatus[] => Array.from({ length: 3 }, () => null);
const pinStatusLabel = (status: PlcPinStatus) => status === 4 ? "OK" : status === 5 ? "NG" : status === 2 ? "LOAD" : "-";
const pinStatusTone = (status: PlcPinStatus, C: T) => status === 4 ? C.ok : status === 5 ? C.ng : status === 2 ? "#f97316" : C.txtMid;
const pinStatusSoftTone = (status: PlcPinStatus, C: T) => status === 4 ? C.okSoft : status === 5 ? C.ngSoft : status === 2 ? "rgba(249,115,22,0.14)" : C.cellNeutral;
/* ═══════════════════════════════════════════════════════════
  THEME
═══════════════════════════════════════════════════════════ */
type T = {
  bg: string; panel: string; card: string; hdr: string; brd: string;
  txt: string; txtMid: string; txtDim: string; accent: string;
  ok: string; ng: string; warn: string;
  okSoft: string; ngSoft: string; warnSoft: string;
  rowAlt: string; isDark: boolean;
  tblHdr: string; tblHdrTxt: string; tblBrd: string;
  cellPass: string; cellPassTxt: string;
  cellFail: string; cellFailTxt: string;
  cellNeutral: string; cellNeutralTxt: string;
  viewBg: string; svgLine: string; svgRing: string;
  svgCardTop: string; svgCardMid: string; svgCardMidAlt: string;
  svgCardValue: string; svgCardBorder: string; svgCardText: string; svgCardValueTxt: string;
};

function makeTheme(dark: boolean): T {
  if (dark) return {
    bg: "#0f1217", panel: "#151922", card: "#1c222d", hdr: "#202733", brd: "#343c49",
    txt: "#f8fafc", txtMid: "#cbd5e1", txtDim: "#94a3b8",
    accent: "#ff6200", ok: "#22c55e", ng: "#ef4444", warn: "#f59e0b",
    okSoft: "rgba(34,197,94,0.16)", ngSoft: "rgba(239,68,68,0.16)", warnSoft: "rgba(245,158,11,0.16)",
    rowAlt: "rgba(255,255,255,0.045)", isDark: true,
    tblHdr: "#ff6200", tblHdrTxt: "#ffffff",
    tblBrd: "#343c49",
    cellPass: "#22c55e", cellPassTxt: "#ffffff",
    cellFail: "#ef4444", cellFailTxt: "#ffffff",
    cellNeutral: "#202733", cellNeutralTxt: "#e5edf7",
    viewBg: "#111827", svgLine: "#e2e8f0", svgRing: "#22c55e",
    svgCardTop: "#f8fafc", svgCardMid: "#d1d5db", svgCardMidAlt: "#c4cad3",
    svgCardValue: "#22c55e", svgCardBorder: "#111827", svgCardText: "#111827", svgCardValueTxt: "#ffffff",
  };
  return {
    bg: "#e8edf3", panel: "#ffffff", card: "#f8fafc", hdr: "#f3f6fa", brd: "#c6d0dc",
    txt: "#172033", txtMid: "#334155", txtDim: "#64748b",
    accent: "#ff6200", ok: "#16a34a", ng: "#dc2626", warn: "#b7791f",
    okSoft: "#ecfdf3", ngSoft: "#fff1f2", warnSoft: "#fff7ed",
    rowAlt: "rgba(15,23,42,0.045)", isDark: false,
    tblHdr: "#ff6200", tblHdrTxt: "#ffffff",
    tblBrd: "#c6d0dc",
    cellPass: "#22c55e", cellPassTxt: "#ffffff",
    cellFail: "#ef4444", cellFailTxt: "#ffffff",
    cellNeutral: "#e9eef5", cellNeutralTxt: "#111827",
    viewBg: "#fbfcfe", svgLine: "#334155", svgRing: "#16a34a",
    svgCardTop: "#ffffff", svgCardMid: "#e5eaf0", svgCardMidAlt: "#d7dee8",
    svgCardValue: "#16a34a", svgCardBorder: "#1f2937", svgCardText: "#111827", svgCardValueTxt: "#ffffff",
  };
}

/* ═══════════════════════════════════════════════════════════
  GLOBAL STYLES
═══════════════════════════════════════════════════════════ */
const GLOBAL = `
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #__next { width: 100%; height: 100%; overflow: hidden; font-family: 'Montserrat', sans-serif; }
    .inspection-responsive-root, .inspection-responsive-root * { min-width: 0; }
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 2px; }
    .inspection-industrial-panel {
      box-shadow: inset 0 0 0 1px rgba(15,23,42,0.08);
    }
    .inspection-industrial-panel * {
      text-rendering: geometricPrecision;
    }
    .inspection-panel-shell {
      box-shadow: 0 10px 24px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9);
    }
    .inspection-stations-theme .inspection-industrial-panel {
      border: 1.5px solid var(--station-border) !important;
      border-radius: 3px !important;
      background: var(--station-panel) !important;
      box-shadow: 0 2px 8px rgba(15,23,42,0.08) !important;
    }
    .inspection-stations-theme .inspection-industrial-panel > div:first-child {
      background: var(--station-header) !important;
      border-bottom: 1px solid var(--station-border) !important;
    }
    @keyframes pulse-dot  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(1.35)} }
    @keyframes ng-flash   { 0%,49%{opacity:1} 50%,100%{opacity:.3} }
    @keyframes slide-in   { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
    @keyframes colon-blink{ 0%,49%{opacity:1} 50%,100%{opacity:0} }
    @keyframes alarm-pulse{ 0%,100%{filter:none} 50%{filter:saturate(1.18)} }
  `;

const fs = {
  xs: "clamp(9px, 0.58vw, 12px)",
  sm: "clamp(10px, 0.68vw, 13px)",
  base: "clamp(11px, 0.78vw, 14.5px)",
  md: "clamp(12px, 0.9vw, 16px)",
  lg: "clamp(13px, 1.05vw, 18px)",
  xl: "clamp(15px, 1.2vw, 21px)",
  hdr: "clamp(14px, 1.22vw, 22px)",
  val: "clamp(15px, 1.12vw, 22px)",
  stat: "clamp(22px, 1.9vw, 36px)",
};

const sp = {
  xs: "clamp(3px, 0.24vw, 5px)",
  sm: "clamp(5px, 0.36vw, 7px)",
  md: "clamp(6px, 0.52vw, 10px)",
  lg: "clamp(8px, 0.68vw, 13px)",
  xl: "clamp(10px, 0.86vw, 16px)",
  hdr: "clamp(5px, 0.58vh, 11px)",
};

const MONO: React.CSSProperties = { fontFamily: "'Montserrat', sans-serif" };
const sideBorders = (border: string): Pick<React.CSSProperties, "borderRight" | "borderBottom" | "borderLeft"> => ({
  borderRight: border,
  borderBottom: border,
  borderLeft: border,
});

/* ═══════════════════════════════════════════════════════════
  THEME TOGGLE
═══════════════════════════════════════════════════════════ */
function ThemeToggle({ dark, onToggle, C }: { dark: boolean; onToggle: () => void; C: T }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: "flex", alignItems: "center", gap: sp.xs,
        padding: `${sp.xs} ${sp.sm}`,
        background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
        border: `1px solid ${C.brd}`,
        borderRadius: 20, cursor: "pointer",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: "clamp(22px,1.6vw,28px)", height: "clamp(12px,0.9vw,16px)", borderRadius: 10,
        background: dark ? C.accent : C.txtDim,
        position: "relative", transition: "background 0.25s", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: "20%",
          left: dark ? "52%" : "10%",
          width: "42%", height: "60%", borderRadius: "50%",
          background: "#ffffff",
          transition: "left 0.25s cubic-bezier(.34,1.56,.64,1)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </div>
      <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, letterSpacing: "0.12em", color: C.txtMid, userSelect: "none" }}>
        {dark ? "LIGHT" : "DARK"}
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
  LIVE CLOCK
═══════════════════════════════════════════════════════════ */
function LiveClock({ C, cpuTime }: { C: T; cpuTime?: string }) {
  const date = cpuTime ? new Date(cpuTime) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const z = (n: number) => String(n).padStart(2, "0");
  const text = valid ? `${z(date.getHours())}:${z(date.getMinutes())}:${z(date.getSeconds())}` : "--:--:--";

  return (
    <div id="cpuTime" title={cpuTime ?? ""} style={{ ...MONO, fontSize: fs.sm, fontWeight: 700, color: C.txt, letterSpacing: "0.1em", userSelect: "none" }}>
      {text}
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
  PROGRESS BAR
═══════════════════════════════════════════════════════════ */
function ProgressBar({ loading, C }: { loading: boolean; C: T }) {
  const [w, setW] = useState(100);
  const raf = useRef<number | null>(null);
  const t0 = useRef<number | null>(null);
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    t0.current = null;
    if (!loading) {
      raf.current = requestAnimationFrame(() => setW(100));
      return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }
    const tick = (ts: number) => {
      if (!t0.current) t0.current = ts;
      const p = Math.max(0, 100 - ((ts - t0.current) / LOADING_MS) * 100);
      setW(p);
      if (p > 0) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [loading]);
  return (
    <div style={{ height: 2, background: C.brd, flexShrink: 0 }}>
      <div style={{ height: "100%", width: `${w}%`, background: loading ? C.warn : C.ok, transition: "background 0.3s" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
  STATUS CARDS
═══════════════════════════════════════════════════════════ */
function PlcCommunicationAlarm({ C, message }: { C: T; message?: string }) {
  return (
    <div
      id="plcCommunicationAlarm"
      role="alert"
      style={{
        margin: `${sp.sm} ${sp.md} 0`,
        border: `1.5px solid ${C.warn}`,
        borderLeft: `5px solid ${C.ng}`,
        borderRadius: 5,
        background: C.isDark ? "rgba(249,115,22,0.16)" : "#fff7ed",
        boxShadow: C.isDark ? "0 10px 28px rgba(0,0,0,0.22)" : "0 10px 26px rgba(154,52,18,0.14)",
        padding: `${sp.sm} ${sp.md}`,
        display: "grid",
        gridTemplateColumns: "auto minmax(0,1fr)",
        gap: sp.sm,
        alignItems: "center",
        animation: "alarm-pulse 1.35s ease-in-out infinite",
      }}
    >
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: "50%",
          background: C.ng,
          boxShadow: `0 0 0 5px ${C.isDark ? "rgba(239,68,68,0.18)" : "rgba(239,68,68,0.16)"}`,
          animation: "pulse-dot 1s ease-in-out infinite",
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...MONO, fontSize: fs.sm, fontWeight: 950, letterSpacing: "0.08em", color: C.ng, textTransform: "uppercase" }}>
          PLC communication alarm
        </div>
        <div style={{ ...MONO, marginTop: 3, fontSize: fs.xs, fontWeight: 800, color: C.txt }}>
          PLC is not communicating. Check PLC power, Ethernet cable, IP/port, and MC protocol connection.
        </div>
        {message && (
          <div style={{ ...MONO, marginTop: 3, fontSize: "clamp(8px,0.52vw,10px)", fontWeight: 700, color: C.txtMid, overflowWrap: "anywhere" }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
function StatusCards({ total, okCount, ngCount, C }: {
  total: number | null; okCount: number | null; ngCount: number | null; C: T;
}) {
  return (
    <div style={{ padding: `${sp.sm} ${sp.md}`, display: "flex", flexDirection: "column", gap: sp.sm }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: sp.sm }}>
        {[
          { id: "summaryTotal", valueId: "summaryTotalValue", label: "TOTAL", value: total, color: C.txtMid, Icon: Gauge },
          { id: "summaryOk", valueId: "summaryOkValue", label: "OK", value: okCount, color: C.ok, Icon: CheckCircle2 },
          { id: "summaryNg", valueId: "summaryNgValue", label: "NG", value: ngCount, color: C.ng, Icon: XCircle },
        ].map(({ id, valueId, label, value, color, Icon }) => (
          <div key={label} id={id} style={{
            padding: `${sp.md} ${sp.sm}`,
            background: C.card,
            ...sideBorders(`1px solid ${C.brd}`),
            borderTop: `3px solid ${color}`,
            borderRadius: "0 0 5px 5px",
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            alignItems: "center",
            gap: sp.sm,
            minWidth: 0,
          }}>
            <span style={{
              width: "clamp(26px,2vw,34px)",
              height: "clamp(26px,2vw,34px)",
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color,
              background: C.isDark ? "rgba(255,255,255,0.06)" : `${color}16`,
              border: `1px solid ${C.isDark ? C.brd : `${color}33`}`,
              flexShrink: 0,
            }}>
              <Icon size={18} strokeWidth={2.6} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.12em", color: C.txtMid, textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
              <span id={valueId} style={{ ...MONO, fontSize: fs.stat, fontWeight: 900, color, lineHeight: 1 }}>{value ?? "-"}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
  STATION STRIP
═══════════════════════════════════════════════════════════ */
function StationStrip({
  activeId, completedIds, loadingId,
  onClick, hoveredStation, onHover, C
}: {
  activeId: number;
  completedIds: number[];
  loadingId: number | null;
  onClick: (id: number) => void;
  hoveredStation: number | null;
  onHover: (id: number | null) => void;
  C: T;
}) {
  return (
    <div
      className="inspection-industrial-panel"
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: "clamp(76px, 8.8vh, 104px)",
        width: "100%",          // ✅ force inside
        overflow: "hidden",     // ✅ no scroll
        borderBottom: `1px solid ${C.brd}`,
        background: C.hdr,
        borderTop: `1.5px solid ${C.brd}`,
      }}
    >
      {stations.map((st, i) => {
        const done = completedIds.includes(st.id);
        const active = st.id === activeId;
        const hovered = hoveredStation === st.id;

        const col = done ? C.ok : active ? st.color : hovered ? st.color : C.txtDim;
        const canClick = active && !loadingId;

        return (
          <div
            key={st.id}
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,                 // ✅ equal width
              minWidth: 0,             // ✅ allow shrinking
            }}
          >
            {/* STATION */}
            <div
              onClick={() => { if (canClick) onClick(st.id); }}
              onMouseEnter={() => onHover(st.id)}
              onMouseLeave={() => onHover(null)}
              style={{
                flex: "1 1 0",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: sp.xs,
                padding: `${sp.lg} clamp(4px,0.5vw,9px)`,
                background: active ? C.panel : hovered ? C.card : "transparent",
                cursor: canClick ? "pointer" : "default",
                borderRadius: 3,
                border: active ? `1px solid ${C.accent}` : "1px solid transparent",
                minWidth: 0,
                minHeight: "clamp(68px, 7.8vh, 94px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: sp.xs, minWidth: 0, maxWidth: "100%" }}>
                {done ? (
                  <CheckCircle2 size={20} color={C.ok} strokeWidth={2.5} style={{ width: "clamp(16px,1.15vw,22px)", height: "clamp(16px,1.15vw,22px)", flexShrink: 0 }} />
                ) : (
                  <div
                    style={{
                      width: "clamp(7px,0.6vw,10px)",
                      height: "clamp(7px,0.6vw,10px)",
                      borderRadius: "50%",
                      background: col,
                      flexShrink: 0,
                    }}
                  />
                )}

                <span style={{
                  ...MONO,
                  fontSize: "clamp(13px,0.88vw,17px)",
                  fontWeight: 900,
                  color: active ? C.accent : col,
                  whiteSpace: "normal",
                  lineHeight: 1,
                }}>
                  {st.code}
                </span>
              </div>

              <span style={{
                ...MONO,
                fontSize: "clamp(11px,0.72vw,15px)",
                fontWeight: 800,
                color: active ? C.txt : done ? C.ok : C.txtMid,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                textAlign: "center",
                lineHeight: 1.08,
                overflow: "visible",
                maxWidth: "100%",
              }}>
                {st.name}
              </span>
            </div>

            {/* ARROW */}
            {i < stations.length - 1 && (
              <ArrowRight
                size={20}
                strokeWidth={2}
                color={done ? C.ok : C.txtDim}
                style={{ width: "clamp(14px,0.95vw,20px)", height: "clamp(14px,0.95vw,20px)", flex: "0 1 clamp(14px,1vw,20px)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
  INSPECTION TABLE HELPERS
═══════════════════════════════════════════════════════════ */

/* Table section header — orange band like the reference */
function StatusPill({ label, tone, C }: { label: string; tone: "ok" | "ng" | "warn"; C: T }) {
  const color = tone === "ok" ? C.ok : tone === "warn" ? "#f97316" : C.ng;
  return (
    <span style={{
      ...MONO,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 19,
      padding: "3px 8px",
      borderRadius: 3,
      border: `1px solid ${color}`,
      background: tone === "ok" ? C.okSoft : tone === "warn" ? "rgba(249,115,22,0.14)" : C.ngSoft,
      color,
      fontSize: "clamp(8px,0.52vw,10.5px)",
      fontWeight: 900,
      lineHeight: 1,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function TblSectionHeader({
  code, name, right, C, accent = C.accent
}: {
  code: string; name: string; right?: React.ReactNode; C: T; accent?: string;
}) {
  return (
    <div className="inspection-responsive-root" style={{
      display: "grid", gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      background: C.hdr,
      borderBottom: `1px solid ${C.brd}`,
      padding: `${sp.xs} ${sp.sm}`,
      gap: sp.sm,
      flexShrink: 0,
      minWidth: 0,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{
          ...MONO,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 26,
          padding: "5px 10px",
          borderRadius: 3,
          border: `1px solid ${accent}`,
          background: C.panel,
          color: accent,
          fontSize: "clamp(9px,0.6vw,12px)",
          fontWeight: 900,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}>{code}</span>
      </span>
      <span style={{ ...MONO, minWidth: 0, fontSize: "clamp(11px,0.78vw,15px)", fontWeight: 900, color: C.txt, letterSpacing: 0, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      {right && <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{right}</div>}
    </div>
  );
}

/* Single value cell — assembly-style OK/NG card */
function ValCell({
  id, value, pass, unit, label, rangeLabel, C, width, fontSize
}: {
  id?: string;
  value: string | null; pass: boolean | null; unit?: string; label?: string; rangeLabel?: string; C: T;
  width?: string | number; fontSize?: string;
}) {
  const tone = pass === null ? C.txtDim : pass ? C.ok : C.ng;
  const bg = C.isDark ? C.card : "#f8fafc";
  const border = pass === null
    ? (C.isDark ? C.brd : "#e0e6ef")
    : pass
      ? (C.isDark ? "rgba(34,197,94,0.38)" : C.brd)
      : (C.isDark ? "rgba(239,68,68,0.42)" : C.brd);
  return (
    <div id={id} style={{
      position: "relative",
      background: bg,
      borderRadius: 3,
      display: "grid",
      gridTemplateRows: "auto auto auto",
      gap: "clamp(5px, 0.58vh, 9px)",
      padding: `clamp(8px, 0.82vh, 12px) clamp(9px, 0.68vw, 14px)`,
      minHeight: "clamp(76px, 7.8vh, 104px)",
      minWidth: width ?? 0,
      width: width ?? "100%",
      height: "100%",
      ...sideBorders(`1.5px solid ${border}`),
      borderTop: `3px solid ${tone}`,
      boxShadow: C.isDark ? "0 1px 8px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(15,23,42,0.06)",
      overflow: "hidden",
      containerType: "size",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "start", gap: 2, minWidth: 0 }}>
        <span style={{
          ...MONO,
          minWidth: 0,
          fontSize: "clamp(9px, 10cqw, 13px)",
          fontWeight: 900,
          color: C.txt,
          lineHeight: 1.05,
          whiteSpace: "normal",
          overflow: "hidden",
          overflowWrap: "anywhere",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {label ?? "CHECK"}
        </span>
        <span style={{
          ...MONO,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 35,
          borderRadius: 3,
          padding: "3px 6px",
          background: pass === null ? C.cellNeutral : pass ? C.okSoft : C.ngSoft,
          border: `1px solid ${tone}`,
          color: tone,
          fontSize: "clamp(7px, min(3.9cqw, .86vh), 9px)",
          fontWeight: 900,
          lineHeight: 1,
          textAlign: "center",
        }}>
          {pass === null ? "--" : pass ? "OK" : "NG"}
        </span>
      </div>
      <div style={{ alignSelf: "center", justifySelf: "center", display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 2, maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
        <span style={{
          ...MONO,
          minWidth: 0,
          fontSize: fontSize ?? "clamp(20px, min(18cqw, 6.8cqh), 34px)",
          fontWeight: 900,
          color: pass === null ? C.txt : "#0f4c8a",
          letterSpacing: 0,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          maxWidth: "100%",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "clip",
        }}>
          {value ?? "—"}
        </span>
        {unit && (
          <span style={{ ...MONO, flexShrink: 0, background: "transparent", fontSize: "clamp(8px, min(4.3cqw, 1.05dvh), 12px)", fontWeight: 900, color: C.txtMid, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap", marginTop: 2 }}>
            {unit}
          </span>
        )}
      </div>

      <div style={{
        ...MONO,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        fontSize: "clamp(9.5px, 7.9cqw, 13px)",
        fontWeight: 900,
        color: C.txt,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
      }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {rangeLabel ?? "-"}
        </span>
      </div>
    </div>
  );
}

/* Column header cell */
function ColHdr({ label, C, span }: { label: string; C: T; span?: number }) {
  return (
    <div style={{
      ...MONO, fontSize: fs.xs, fontWeight: 900, color: C.txt,
      letterSpacing: 0, textAlign: "center", padding: `${sp.xs} ${sp.xs}`,
      background: C.panel, border: "none", gridColumn: span ? `span ${span}` : undefined,
      overflow: "visible", textOverflow: "clip", whiteSpace: "normal", lineHeight: 1.1,
    }}>
      {label}
    </div>
  );
}

/* Left/Right dual value pair */
function DualCell({ leftVal, rightVal, req, tol, unit, C }: {
  leftVal: number | null; rightVal: number | null;
  req: number | null; tol: number | null; unit: string; C: T;
}) {
  const lPass = isPass(req, tol, leftVal);
  const rPass = isPass(req, tol, rightVal);
  const fmt = (v: number | null) => v !== null ? v.toFixed(3) : "—";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
      <ValCell value={fmt(leftVal)} pass={lPass} unit={unit} C={C} />
      <ValCell value={fmt(rightVal)} pass={rPass} unit={unit} C={C} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
  STATION 01 — inspection table layout
═══════════════════════════════════════════════════════════ */
function Station01Panel({
  actuals,
  C,
}: {
  actuals: Record<number, number | null>;
  C: T;
}) {
  const p = stations[0].params;

  const shaftL = actuals[0] ?? null;
  const shaftR = actuals[1] ?? null;
  const oaLen = actuals[2] ?? null;
  const dowelL = actuals[3] ?? null;
  const dowelR = actuals[4] ?? null;
  const dia122 = actuals[5] ?? null;
  const results = [
    isPass(p[0].req, p[0].tol, shaftL),
    isPass(p[1].req, p[1].tol, shaftR),
    isPass(p[2].req, p[2].tol, oaLen),
    isPass(p[3].req, p[3].tol, dowelL),
    isPass(p[5].req, p[5].tol, dia122),
    null,
    isPass(p[4].req, p[4].tol, dowelR),
  ];
  const okCount = results.filter(result => result === true).length;
  const ngCount = results.filter(result => result === false).length;

  const baseCell = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: `${sp.xs} ${sp.xs}`,
    borderRight: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`,
    minWidth: 0,
  };

  const headerText = {
    ...MONO,
    fontSize: fs.xs,
    fontWeight: 700,
    color: C.txtMid,
    letterSpacing: 0.3,
  };
  const gridCols = "minmax(176px,1.9fr) repeat(5,minmax(118px,1fr))";
  const station01ValueFont = "clamp(16px, min(13cqw, 5.1cqh), 28px)";

  return (
    <div
      className="inspection-industrial-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1.5px solid ${C.brd}`,
        borderRadius: 3,
        overflow: "hidden",
        background: C.panel,
        height: "100%",
        minHeight: 0,
        boxShadow: C.isDark ? "0 12px 24px rgba(0,0,0,0.18)" : "0 2px 8px rgba(15,23,42,0.08)",
      }}
    >
      <TblSectionHeader
        code="ST-01"
        name="LOADING STATION"
        C={C}
        accent={C.accent}
        right={
          <>
            {ngCount > 0 && <StatusPill label={`${ngCount} NG`} tone="ng" C={C} />}
            {okCount > 0 && <StatusPill label={`${okCount} OK`} tone="ok" C={C} />}
          </>
        }
      />

      {/* MAIN HEADERS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          background: C.hdr,
          borderBottom: `1px solid ${C.brd}`,
        }}
      >
        <div style={{ ...baseCell }}>
          <span style={headerText}>Outer Diameter</span>
        </div>
        <div style={baseCell}>
          <span style={headerText}>Overall</span>
        </div>
        <div style={baseCell}>
          <span style={headerText}>Dowel Length</span>
        </div>
        <div style={baseCell}>
          <span style={headerText}>12.2 Diameter</span>
        </div>
        <div style={baseCell}>
          <span style={headerText}></span>
        </div>
        <div style={{ ...baseCell, borderRight: "none" }}>
          <span style={headerText}></span>
        </div>
      </div>
      {/* VALUES */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: gridCols,
          padding: sp.xs,
          gap: sp.xs,
          flex: 1,
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        {/* Outer Diameter */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: sp.xs, minWidth: 0 }}>
          <ValCell
            id="shaftOdLeft"
            value={shaftL !== null ? shaftL.toFixed(3) : "—"}
            pass={isPass(p[0].req, p[0].tol, shaftL)}
            unit={p[0].unit}
            label="Left"
            rangeLabel="34.996-35.100"
            fontSize={station01ValueFont}
            C={C}
          />
          <ValCell
            id="shaftOdRight"
            value={shaftR !== null ? shaftR.toFixed(3) : "—"}
            pass={isPass(p[1].req, p[1].tol, shaftR)}
            unit={p[1].unit}
            label="Right"
            rangeLabel="34.996-35.100"
            fontSize={station01ValueFont}
            C={C}
          />
        </div>

        <ValCell
          id="overallLength"
          value={oaLen !== null ? oaLen.toFixed(3) : "—"}
          pass={isPass(p[2].req, p[2].tol, oaLen)}
          unit={p[2].unit}
          label="Calc"
          rangeLabel="466.621-466.821"
          fontSize={station01ValueFont}
          C={C}
        />

        <ValCell
          id="dowelCfLeft"
          value={dowelL !== null ? dowelL.toFixed(3) : "—"}
          pass={isPass(p[3].req, p[3].tol, dowelL)}
          unit={p[3].unit}
          label="Calc"
          rangeLabel="458.900-459.100"
          fontSize={station01ValueFont}
          C={C}
        />

        <ValCell
          id="diameter122"
          value={dia122 !== null ? dia122.toFixed(3) : "—"}
          pass={isPass(p[5].req, p[5].tol, dia122)}
          unit={p[5].unit}
          label="APG"
          rangeLabel="12.2-12.4"
          fontSize={station01ValueFont}
          C={C}
        />

        <ValCell value="OK" pass={true} label="Vision" fontSize={station01ValueFont} C={C} />

        <ValCell
          id="dowelCfRight"
          value={dowelR !== null ? dowelR.toFixed(3) : "—"}
          pass={isPass(p[4].req, p[4].tol, dowelR)}
          unit={p[4].unit}
          label="Guage"
          rangeLabel="445.134-445.135"
          fontSize={station01ValueFont}
          C={C}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
  STATION 02 — pin matrix layout
═══════════════════════════════════════════════════════════ */
function Station02Panel({
  pinStatuses,
  smallPinStatuses,
  specialStatuses,
  C,
}: {
  pinStatuses: PlcPinStatus[];
  smallPinStatuses: PlcPinStatus[];
  specialStatuses: PlcPinStatus[];
  C: T;
}) {
  type PinCell = { id: string; n: number; status: PlcPinStatus; label: string; register: string };
  const pins15: PinCell[] = Array.from({ length: 15 }, (_, index) => {
    const pinNo = index + 1;
    const register = 102 + index * 2;
    return {
      id: `15pin${pinNo}`,
      n: pinNo,
      status: pinStatuses[index] ?? null,
      label: String(pinNo).padStart(2, "0"),
      register: `D${register}`,
    };
  });
  const pins3: PinCell[] = Array.from({ length: 3 }, (_, index) => ({
    id: `3pin${index + 1}`,
    n: index + 16,
    status: smallPinStatuses[index] ?? null,
    label: String(index + 1).padStart(2, "0"),
    register: `M${index + 1}`,
  }));
  const specialPins: PinCell[] = [
    { id: "fourMm51", n: 19, status: specialStatuses[0] ?? null, label: "4mm / 51deg", register: "SP1" },
    { id: "fourHolePositions", n: 20, status: specialStatuses[1] ?? null, label: "4 Hole Positions", register: "SP2" },
    { id: "slot12213", n: 21, status: specialStatuses[2] ?? null, label: "12.2-13 Slot", register: "SP3" },
  ];
  const allPins = [...pins15, ...pins3, ...specialPins];
  const okCount = allPins.filter(cell => cell.status === 4).length;
  const ngCount = allPins.filter(cell => cell.status === 5).length;
  const loadingCount = allPins.filter(cell => cell.status === 2).length;

  const Cell = ({ cell }: { cell: PinCell }) => {
    const tone = pinStatusTone(cell.status, C);
    const softTone = pinStatusSoftTone(cell.status, C);

    return (
      <div
        id={cell.id}
        data-register={cell.register}
        data-status={cell.status ?? ""}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) auto",
          gridTemplateRows: "1fr",
          alignItems: "center",
          background: C.isDark ? C.card : "#f8fafc",
          ...sideBorders(`1.5px solid ${C.isDark ? tone : C.brd}`),
          borderTop: `3px solid ${tone}`,
          borderRadius: 3,
          padding: `clamp(6px,0.62vh,10px) clamp(8px,0.64vw,13px)`,
          minHeight: "clamp(44px,5.2vh,62px)",
          height: "100%",
          minWidth: 0,
          boxShadow: C.isDark ? "0 1px 7px rgba(0,0,0,0.14)" : "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(15,23,42,0.06)",
        }}
      >
        <span
          style={{
            ...MONO,
            alignSelf: "center",
            fontSize: "clamp(12px, 0.86vw, 16px)",
            fontWeight: 900,
            color: tone,
            lineHeight: 1.05,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          {cell.label}
        </span>
        <span
          title={cell.register}
          style={{
            ...MONO,
            justifySelf: "center",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 42,
            borderRadius: 3,
            padding: "4px 7px",
            background: softTone,
            border: `1px solid ${tone}`,
            fontSize: "clamp(9px, min(0.75vw, 1.25vh), 12px)",
            fontWeight: 900,
            color: tone,
            lineHeight: 1,
            textAlign: "center",
          }}
        >
          {pinStatusLabel(cell.status)}
        </span>
      </div>
    );
  };

  return (
    <div
      className="inspection-industrial-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1.5px solid ${C.brd}`,
        borderRadius: 3,
        overflow: "hidden",
        background: C.panel,
        height: "100%",
        minHeight: 0,
        boxShadow: C.isDark ? "0 12px 24px rgba(0,0,0,0.18)" : "0 2px 8px rgba(15,23,42,0.08)",
      }}
    >
      <TblSectionHeader
        code="ST-02"
        name="RECEIVER GAUGE STATION"
        C={C}
        accent="#6366f1"
        right={
          <>
            {loadingCount > 0 && <StatusPill label={`${loadingCount} LOAD`} tone="warn" C={C} />}
            {ngCount > 0 && <StatusPill label={`${ngCount} NG`} tone="ng" C={C} />}
            {okCount > 0 && <StatusPill label={`${okCount} OK`} tone="ok" C={C} />}
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 0.9fr) minmax(0, 1.2fr)",
          gap: sp.xs,
          padding: sp.xs,
          flex: 1,
          alignItems: "stretch",
          minHeight: 0,
        }}
      >
        <div style={{ display: "grid", gridTemplateRows: "auto minmax(0,1fr)", gap: sp.xs, minHeight: 0 }}>
          <Station02GroupTitle C={C}>15 Nos of 3mm Hole</Station02GroupTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gridTemplateRows: "repeat(3, minmax(0, 1fr))", gap: sp.xs, minHeight: 0 }}>
            {pins15.map((cell) => <Cell key={cell.id} cell={cell} />)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateRows: "auto repeat(3, minmax(0,1fr))", gap: sp.xs, minHeight: 0 }}>
          <Station02GroupTitle C={C}>3 Nos of 3mm Hole</Station02GroupTitle>
          {pins3.map((cell) => <Cell key={cell.id} cell={cell} />)}
        </div>
        <div style={{ display: "grid", gridTemplateRows: "auto repeat(3, minmax(0,1fr))", gap: sp.xs, minHeight: 0 }}>
          <Station02GroupTitle C={C}>Special</Station02GroupTitle>
          {specialPins.map((cell) => <Cell key={cell.id} cell={cell} />)}
        </div>
      </div>
    </div>
  );
}
function Station02GroupTitle({ children, C }: { children: React.ReactNode; C: T }) {
  return (
    <div
      style={{
        ...MONO,
        fontSize: fs.xs,
        fontWeight: 900,
        textAlign: "center",
        padding: sp.xs,
        color: C.txt,
        background: C.hdr,
        border: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`,
        borderRadius: 3,
      }}
    >
      {children}
    </div>
  );
}
type Station03Cell = { id: string; name: string; pass: boolean | null; grade?: string | null };
type Station3Data = NonNullable<InspectionApiPayload["station3"]>;

function plcStatusToPass(status: PlcPinStatus): boolean | null {
  if (status === 4) return true;
  if (status === 5) return false;
  return null;
}

function Station03Panel({ station3, C }: { station3: Station3Data | null; C: T }) {
  const cols: Station03Cell[] = [
    { id: "laser2dMarking", name: "2D Marking", pass: plcStatusToPass(station3?.marking2d ?? null) },
    { id: "laserTopEngraving", name: "Top Engraving", pass: plcStatusToPass(station3?.topEngraving ?? null) },
    { id: "laserSideEngraving", name: "Side Engraving", pass: plcStatusToPass(station3?.sideEngraving ?? null) },
    { id: "laserVerifier", name: "Verifier", pass: station3?.qrVerifierValue ? true : null, grade: station3?.qrGrade ?? station3?.qrVerifierValue ?? null },
  ];

  return (
    <div
      className="inspection-industrial-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${C.isDark ? C.brd : "#d8e0ea"}`,
        borderRadius: 8,
        overflow: "hidden",
        background: C.panel,
        height: "100%",
        minHeight: 0,
        boxShadow: C.isDark ? "0 12px 24px rgba(0,0,0,0.18)" : "0 2px 8px rgba(15,23,42,0.06)",
      }}
    >
      <TblSectionHeader
        code="ST-03"
        name="LASER MARKING"
        C={C}
        accent="#0ea5e9"
        right={null}
      />

      {/* 4-column grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: sp.xs,
          padding: sp.xs,
          flex: 1,
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        {cols.map((col, i) => (
          <div
            key={i}
            id={col.id}
            style={{
              display: "flex",
              flexDirection: "column",
              ...sideBorders(`1.5px solid ${C.brd}`),
              borderTop: `3px solid ${col.pass === null ? C.txtDim : col.grade ? "#0f4c8a" : col.pass ? C.ok : C.ng}`,
              borderRadius: 3,
              overflow: "hidden",
              minHeight: "clamp(86px,9vh,116px)",
              height: "100%",
              background: C.isDark ? C.card : "#f8fafc",
              boxShadow: C.isDark ? "0 1px 7px rgba(0,0,0,0.14)" : "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(15,23,42,0.06)",
            }}
          >
            {/* Row 1 — Name */}
            <div
              style={{
                background: C.hdr,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: `${sp.xs} ${sp.sm}`,
                borderBottom: "none",
              }}
            >
              <span
                style={{
                  ...MONO,
                  fontSize: "clamp(11px,0.78vw,15px)",
                  fontWeight: 900,
                  color: C.txt,
                  letterSpacing: 0,
                  lineHeight: 1.2,
                  textAlign: "center",
                }}
              >
                {col.name}
              </span>
            </div>

            {/* Row 2 — Result */}
            <div
              style={{
                background: C.isDark ? C.card : "#f8fafc",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: `${sp.xs} ${sp.xs}`,
                minHeight: "clamp(52px,5.8vh,74px)",
                flex: 1,
              }}
            >
              {col.grade ? (
                <>
                  <QrCode size={30} color={C.ok} strokeWidth={2.4} style={{ width: "clamp(28px,2vw,42px)", height: "clamp(28px,2vw,42px)" }} />
                  <span
                    style={{
                      ...MONO,
                      fontSize: fs.sm,
                      fontWeight: 900,
                      color: C.ok,
                      letterSpacing: "0.12em",
                      marginTop: 3,
                      whiteSpace: "normal",
                      textAlign: "center",
                    }}
                  >
                    QR | GRADE {col.grade}
                  </span>
                </>
              ) : (
                <span
                  style={{
                    ...MONO,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 50,
                    borderRadius: 3,
                    padding: "7px 12px",
                    background: col.pass === null ? C.cellNeutral : col.pass ? C.okSoft : C.ngSoft,
                    border: `1px solid ${col.pass === null ? C.txtDim : col.pass ? C.ok : C.ng}`,
                    fontSize: "clamp(13px,1.05vw,18px)",
                    fontWeight: 900,
                    color: col.pass === null ? C.txtDim : col.pass ? C.ok : C.ng,
                    lineHeight: 1,
                  }}
                >
                  {col.pass === null ? "-" : col.pass ? "OK" : "NG"}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
  STATIONS 4/5/6 — APG row
═══════════════════════════════════════════════════════════ */
function Station456Panel({ actuals, C }: {
  actuals: Record<number, Record<number, number | null>>;
  C: T;
}) {
  const st5 = stations[4]; // 14.5 APG
  const st6 = stations[5]; // 6.3/4.98 APG

  const st5a = actuals[5] ?? {};
  const st6a = actuals[6] ?? {};

  const reamL = st6a[0] ?? null;
  const reamR = st6a[1] ?? null;
  const hole63L = st6a[2] ?? null;
  const hole63R = st6a[3] ?? null;
  const plug14L = st5a[0] ?? null;
  const plug14R = st5a[1] ?? null;
  const results = [
    isPass(st6.params[0].req, st6.params[0].tol, reamL),
    isPass(st6.params[1].req, st6.params[1].tol, reamR),
    isPass(st6.params[2].req, st6.params[2].tol, hole63L),
    isPass(st6.params[3].req, st6.params[3].tol, hole63R),
    isPass(st5.params[0].req, st5.params[0].tol, plug14L),
    isPass(st5.params[1].req, st5.params[1].tol, plug14R),
  ];
  const okCount = results.filter(result => result === true).length;
  const ngCount = results.filter(result => result === false).length;

  return (
    <div className="inspection-industrial-panel" style={{ display: "flex", flexDirection: "column", border: `1.5px solid ${C.brd}`, borderRadius: 3, overflow: "hidden", background: C.panel, height: "100%", minHeight: 0, boxShadow: C.isDark ? "0 12px 24px rgba(0,0,0,0.18)" : "0 2px 8px rgba(15,23,42,0.08)" }}>
      <TblSectionHeader
        code="ST-04/05/06"
        name="ROTATING · 14.5 APG · 6.3/4.98 APG"
        C={C}
        accent="#f59e0b"
        right={
          <>
            {ngCount > 0 && <StatusPill label={`${ngCount} NG`} tone="ng" C={C} />}
            {okCount > 0 && <StatusPill label={`${okCount} OK`} tone="ok" C={C} />}
          </>
        }
      />


      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", background: C.panel, gap: 0 }}>
        <ColHdr label="Ball Hole" C={C} />
        <ColHdr label="Plug Hole" C={C} />
        <ColHdr label="Dowel Hole" C={C} />
      </div>

      {/* Sub-headers Left/Right */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", background: C.panel, gap: 0 }}>
        {["Ball Hole", "Plug Hole", "Dowel Hole"].map(g => (
          <div key={g} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", borderRight: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`, minWidth: 0 }}>
            <div style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, color: C.txtMid, textAlign: "center", padding: sp.xs, borderRight: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`, background: C.hdr }}>Left</div>
            <div style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, color: C.txtMid, textAlign: "center", padding: sp.xs, background: C.hdr }}>Right</div>
          </div>
        ))}
        <div style={{ background: C.hdr }}></div>
      </div>

      {/* Values */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 0, padding: sp.xs, flex: 1, minHeight: 0, alignItems: "stretch" }}>
        {/* Ball hole: station 6 */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: sp.xs, minWidth: 0, height: "100%" }}>
          <ValCell id="ballHoleLeft" value={hole63L !== null ? hole63L.toFixed(3) : "—"} pass={isPass(st6.params[2].req, st6.params[2].tol, hole63L)} unit={st6.params[2].unit} C={C} rangeLabel="6.285-6.311" />
          <ValCell id="ballHoleRight" value={hole63R !== null ? hole63R.toFixed(3) : "—"} pass={isPass(st6.params[3].req, st6.params[3].tol, hole63R)} unit={st6.params[3].unit} C={C} rangeLabel="6.285-6.311" />
        </div>
        {/* Plug hole: station 5 */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: sp.xs, minWidth: 0, height: "100%" }}>
          <ValCell id="plugHoleLeft" value={plug14L !== null ? plug14L.toFixed(3) : "—"} pass={isPass(st5.params[0].req, st5.params[0].tol, plug14L)} unit={st5.params[0].unit} C={C} rangeLabel="14.285-14.311" />
          <ValCell id="plugHoleRight" value={plug14R !== null ? plug14R.toFixed(3) : "—"} pass={isPass(st5.params[1].req, st5.params[1].tol, plug14R)} unit={st5.params[1].unit} C={C} rangeLabel="14.285-14.311" />
        </div>
        {/* Dowel hole: station 6 */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: sp.xs, minWidth: 0, height: "100%" }}>
          <ValCell id="dowelHoleLeft" value={reamL !== null ? reamL.toFixed(3) : "—"} pass={isPass(st6.params[0].req, st6.params[0].tol, reamL)} unit={st6.params[0].unit} C={C} rangeLabel="4.967-4.993" />
          <ValCell id="dowelHoleRight" value={reamR !== null ? reamR.toFixed(3) : "—"} pass={isPass(st6.params[1].req, st6.params[1].tol, reamR)} unit={st6.params[1].unit} C={C} rangeLabel="4.967-4.993" />
        </div>


      </div>


    </div>
  );
}

function DiagramFullscreenButton({ label, onClick, C }: { label: string; onClick: () => void; C: T }) {
  return (
    <button
      type="button"
      aria-label={`Open ${label} full screen`}
      title={`Open ${label} full screen`}
      onClick={onClick}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 2,
        width: 34,
        height: 34,
        borderRadius: 7,
        border: `1px solid ${C.isDark ? C.brd : "#d7dee8"}`,
        background: C.isDark ? "rgba(15,18,23,0.88)" : "rgba(255,255,255,0.92)",
        color: C.txt,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(15,23,42,0.18)",
      }}
    >
      <Maximize2 size={17} strokeWidth={2.5} />
    </button>
  );
}

type DiagramSvgProps = {
  C: T;
  actuals: Record<number, Record<number, number | null>>;
  pinStatuses: PlcPinStatus[];
};

const svgStatusColor = (pass: boolean | null, C: T) => pass === false ? C.ng : C.svgRing;
const svgSpecLow = (param: Param) => param.req !== null && param.tol !== null ? String(param.req - param.tol) : "";
const svgSpecHigh = (param: Param) => param.req !== null && param.tol !== null ? String(param.req + param.tol) : "";
const svgActualValue = (param: Param, value: number | null | undefined) => String(value ?? param.req ?? "");
const frontPinPoints = [
  { cx: 82, cy: 145 }, { cx: 112, cy: 145 }, { cx: 142, cy: 145 }, { cx: 209, cy: 145 }, { cx: 245, cy: 145 },
  { cx: 448, cy: 146 }, { cx: 485, cy: 146 }, { cx: 555, cy: 146 }, { cx: 585, cy: 146 }, { cx: 615, cy: 146 },
  { cx: 770, cy: 147 }, { cx: 802, cy: 147 }, { cx: 835, cy: 147 }, { cx: 915, cy: 147 }, { cx: 960, cy: 147 },
];


function FrontDiagramSvg({ C, pinStatuses }: DiagramSvgProps) {
  return (
    <svg
      viewBox="0 0 1100 300"
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path
            d="M0,0 L6,3 L0,6 Z"
            fill={C.svgLine}
          />
        </marker>
      </defs>
      {/* 🔥 IMAGE INSIDE SVG */}
      <image
        href="/images/shaft1front.png"
        x="0"
        y="0"
        width="1100"
        height="300"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Overall Length bottom  */}

      <line x1="35" y1="280" x2="1065" y2="280" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <line x1="30" y1="290" x2="30" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="1070" y1="290" x2="1070" y2="190" stroke={C.svgLine} strokeWidth="1.5" />

      <SvgCard
        x={480}
        y={250}
        label="Overall Length"
        high="472"
        low="470"
        value="471"
        C={C}
      />
      {/* ABove Dowel Lenth bottom  */}
      <line x1="90" y1="10" x2="995" y2="10" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <line x1="85" y1="5" x2="85" y2="100" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="1000" y1="5" x2="1000" y2="100" stroke={C.svgLine} strokeWidth="1.5" />
         <SvgCard
        x={480}
        y={-10}
        label="Dowel Length"
        high="450"
        low="448"
        value="448"
        C={C}
      />


      {/* 15pins 15pin1 continuously */}
      {[82, 112, 142, 209, 245].map(cx => <circle key={cx} cx={cx} cy={145} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />)}
      {[448, 485, 555, 585, 615].map(cx => <circle key={cx} cx={cx} cy={146} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />)}
      {[770, 802, 835, 915, 960].map(cx => <circle key={cx} cx={cx} cy={147} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />)}
{/* no parameter */}
<circle cx={1035} cy={150} r="16" stroke={C.svgRing} strokeWidth="6" fill="none" />
      {/* Right side hole */}
      <circle cx={1010} cy={165} r="5" stroke={C.svgRing} strokeWidth="4" fill="none" />
      
       {/* 4.98 mm  */}
      <line x1="75" y1="170" x2="75" y2="220" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />

     
      {/* left side 4.98 .. */}
      <SvgCard
        x={60}
        y={215}
        label="4.98mm Diameter"
        high="5.0"
        low="4.9"
        value="4.98"
        C={C}
      />

      {/* Left  side hole  no parameter */}
      <circle cx={70} cy={165} r="4" stroke={C.svgRing} strokeWidth="3" fill="none" />
      {/* 12.2 mm fron apg 12mm dia
      */}
      <circle cx={50} cy={145} r="16" stroke={C.svgRing} strokeWidth="6" fill="none" />
       {/* 12.2 mm  */}
      <line x1="1035" y1="170" x2="1035" y2="210" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />

      {/* right side 12 mm */}

      <SvgCard
        x={930}
        y={205}
        label="12.2mm Diameter"
        high="12.3"
        low="12.1"
        value="12.2"
        C={C}
      />




      {/* left side 35 mm diameter */}
      <line x1="220" y1="60" x2="260" y2="60" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="220" y1="100" x2="220" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="180" y1="105" x2="260" y2="105" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="180" y1="190" x2="260" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="220" y1="230" x2="220" y2="195" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />

  {/* left side 35 mm */}
      <SvgCard
        x={250}
        y={35}
        label="Outer Diameter"
        high="35.2"
        low="34.8"
        value="35"
        C={C}
      />
    
      {/* Right side 35 diameter */}

      <line x1="900" y1="225" x2="860" y2="225" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="900" y1="100" x2="900" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="860" y1="105" x2="940" y2="105" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="860" y1="190" x2="940" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="900" y1="225" x2="900" y2="190" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />
  {/* RIght side 35 mm */}
      <SvgCard
        x={735}
        y={205}
        label="Outer Diameter"
        high="35.2"
        low="34.8"
        value="35"
        C={C}
      />


     
    

    </svg>
  );
}

function BottomDiagramSvg({ C, pinStatuses }: DiagramSvgProps) {
  return (

    <svg
      viewBox="0 0 1100 300"
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      {/* 🔥 IMAGE INSIDE SVG */}
      <image
        href="/images/6630865inspectionbottom.png"
        x="0"
        y="0"
        width="1100"
        height="300"
        preserveAspectRatio="xMidYMid meet"
      />       <defs>
        <marker
          id="arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path
            d="M0,0 L6,3 L0,6 Z"
            fill={C.svgLine}
          />
        </marker>
      </defs>

      {/* bottom 56degree hole  special 4mm/51 degree */}
      <circle cx={725} cy={135} r="6" stroke={C.svgRing} strokeWidth="4" fill="none" />
      <line x1="725" y1="142" x2="725" y2="58" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <SvgCard x={660} y={15} label="Hole Diameter" high="4.0" low="4.2" value="4.1" C={C} />

      {/* ---------3nos 3 pin continously */} 
      {/* bottom1 hole */}
      <circle cx={225} cy={173} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />
      {/* bottom2 hole */}
      <circle cx={440} cy={173} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />
      {/* bottom3 hole */}
      <circle cx={966} cy={173} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />

      {/* top  4.1*/}
      <circle cx={25} cy={60} r="6" stroke={C.svgRing} strokeWidth="4" fill="none" />
      <line x1="25" y1="55" x2="100" y2="5" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />

      <SvgCard x={100} y={-25} label="Hole Diameter" high="4.0" low="4.2" value="4.1" C={C} />
      {/* -------------- */}
      {/* top  6.2*/}
      <circle cx={52} cy={60} r="13" stroke={C.svgRing} strokeWidth="4" fill="none" />
      <line x1="70" y1="60" x2="250" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <SvgCard x={250} y={32} label="Reamer Diameter" high="6.2" low="6.1" value="6.2" C={C} />



      {/* bottom 4.1*/}
      <circle cx={1036} cy={246} r="6" stroke={C.svgRing} strokeWidth="4" fill="none" />
      <line x1="870" y1="245" x2="1030" y2="245" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />
      <SvgCard x={750} y={215} label="Hole Diameter" high="4.0" low="4.2" value="4.1" C={C} />




      {/* bottom 6.2*/}
      <circle cx={1062} cy={246} r="13" stroke={C.svgRing} strokeWidth="4" fill="none" />
      <line x1="1060" y1="265" x2="1060" y2="300" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="990" y1="300" x2="1060" y2="300" stroke={C.svgLine} strokeWidth="1.5" />
      <SvgCard x={870} y={280} label="Reamer Hole" high="6.2" low="6.1" value="6.2" C={C} />




    </svg>
  );
}

function DiagramFullscreenModal({
  view,
  onClose,
  C,
  actuals,
  pinStatuses,
}: {
  view: "front" | "bottom";
  onClose: () => void;
  C: T;
  actuals: Record<number, Record<number, number | null>>;
  pinStatuses: PlcPinStatus[];
}) {
  const title = view === "front" ? "Front View" : "Bottom View";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} full screen`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(2,6,23,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(14px, 2vw, 28px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(96vw, 1480px)",
          height: "min(88vh, 820px)",
          display: "grid",
          gridTemplateRows: "auto minmax(0,1fr)",
          borderRadius: 10,
          border: `1px solid ${C.isDark ? C.brd : "#d7dee8"}`,
          background: C.panel,
          boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.isDark ? C.brd : "#d7dee8"}`,
          background: C.hdr,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <ScanLine size={22} color={C.accent} strokeWidth={2.5} />
            <span style={{ ...MONO, color: C.txt, fontSize: fs.hdr, fontWeight: 900, textTransform: "uppercase" }}>{title} Full View</span>
          </div>
          <button
            type="button"
            aria-label="Close full screen view"
            title="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              border: `1px solid ${C.isDark ? C.brd : "#d7dee8"}`,
              background: C.isDark ? C.card : "#ffffff",
              color: C.txt,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={20} strokeWidth={2.7} />
          </button>
        </div>
        <div style={{ minHeight: 0, padding: 16, background: C.viewBg, overflow: "hidden" }}>
          {view === "front" ? <FrontDiagramSvg C={C} actuals={actuals} pinStatuses={pinStatuses} /> : <BottomDiagramSvg C={C} actuals={actuals} pinStatuses={pinStatuses} />}
        </div>
      </div>
    </div>
  );
}

function SvgCard({
  id,
  x,
  y,
  label,
  high,
  low,
  value,
  C,
  tone,
}: {
  id?: string;
  x: number;
  y: number;
  label: string;
  high: string;
  low: string;
  value: string;
  C: T;
  tone?: string;
}) {
  // ---- FORMAT VALUES (STRICT 3 DECIMALS) ----
  const format = (v: string) => {
    const n = parseFloat(v);
    return isNaN(n) ? v : n.toFixed(3);
  };

  const fHigh = format(high);
  const fLow = format(low);
  const fValue = format(value);

  // ---- SIZE ----
  const width = 122;
  const height = 52;
  const radius = 6;

  const row1 = 16; // label
  const row2 = 14; // tolerance
  const row3 = height - row1 - row2;

  const clipId = `clip-${x}-${y}`;

  return (
    <g id={id} transform={`translate(${x}, ${y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={width} height={height} rx={radius} />
        </clipPath>
      </defs>

      {/* Outer Border */}
      <rect
        width={width}
        height={height}
        rx={radius}
        fill="none"
        stroke={tone ?? C.svgCardBorder}
        strokeWidth={0.8}
      />

      <g clipPath={`url(#${clipId})`}>
        {/* Backgrounds */}
        <rect width={width} height={row1} fill={C.svgCardTop} />

        <rect y={row1} width={width / 2} height={row2} fill={C.svgCardMid} />
        <rect
          y={row1}
          x={width / 2}
          width={width / 2}
          height={row2}
          fill={C.svgCardMidAlt}
        />

        <rect
          y={row1 + row2}
          width={width}
          height={row3}
          fill={tone ?? C.svgCardValue}

        />

        {/* Grid lines */}
        <line x1={0} y1={row1} x2={width} y2={row1} stroke={C.svgCardBorder} strokeWidth={0.6} />
        <line x1={0} y1={row1 + row2} x2={width} y2={row1 + row2} stroke={C.svgCardBorder} strokeWidth={0.6} />
        <line x1={width / 2} y1={row1} x2={width / 2} y2={row1 + row2} stroke={C.svgCardBorder} strokeWidth={0.6} />
      </g>

      {/* TEXT */}

      {/* Label */}
      <text
        x={width / 2}
        y={row1 / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={C.svgCardText}
        fontSize={8.5}
        fontWeight="700"
        fontFamily="Montserrat, sans-serif"
      >
        {label}
      </text>

      {/* High */}
      <text
        x={width / 4}
        y={row1 + row2 / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={C.svgCardText}
        fontSize={8.5}
        fontWeight="700"
        fontFamily="Montserrat, sans-serif"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        H: {fHigh}
      </text>

      {/* Low */}
      <text
        x={(width * 3) / 4}
        y={row1 + row2 / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={C.svgCardText}
        fontSize={8.5}
        fontWeight="700"
        fontFamily="Montserrat, sans-serif"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        L: {fLow}
      </text>

      {/* Value */}
      <text
        x={width / 2}
        y={row1 + row2 + row3 / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={C.svgCardValueTxt}
        fontSize={13.5}
        fontWeight="800"
        fontFamily="Montserrat, sans-serif"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fValue}
      </text>
    </g>
  );
}

/* ═══════════════════════════════════════════════════════════
  ROOT
═══════════════════════════════════════════════════════════ */
function Inspection1Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme.mode === "dark";
  const C = makeTheme(dark);
  const rightC: T = dark ? C : {
    ...C,
    bg: "#eef3f8",
    panel: "#ffffff",
    card: "#f6f8fb",
    hdr: "#e6edf4",
    brd: "#aebdcc",
    txt: "#071b33",
    txtMid: "#334760",
    txtDim: "#8a9bae",
    accent: "#ff5b13",
    ok: "#008a3d",
    ng: "#e11919",
    okSoft: "#f4fbf7",
    ngSoft: "#fff7f7",
    warnSoft: "#fff5e8",
    rowAlt: "rgba(15,23,42,0.035)",
    tblHdr: "#ff5b13",
    tblBrd: "#aebdcc",
    cellPass: "#f4fbf7",
    cellPassTxt: "#008a3d",
    cellFail: "#fff7f7",
    cellFailTxt: "#e11919",
    cellNeutral: "#f8fafc",
    cellNeutralTxt: "#071b33",
    viewBg: "#f8fafc",
    svgLine: "#071b33",
    svgRing: "#008a3d",
    svgCardMid: "#e6edf4",
    svgCardMidAlt: "#d9e2eb",
    svgCardValue: "#0f4c8a",
    svgCardBorder: "#aebdcc",
    svgCardText: "#071b33",
  };
  const rightPanelStyle: React.CSSProperties = dark ? {} : {
    "--station-panel": rightC.panel,
    "--station-card": "#f8fafc",
    "--station-header": rightC.hdr,
    "--station-border": rightC.brd,
    "--station-text": rightC.txt,
    "--station-mid": rightC.txtMid,
    "--station-accent": rightC.accent,
  } as React.CSSProperties;

  const [activeId, setActiveId] = useState(1);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [actuals, setActuals] = useState<Record<number, Record<number, number | null>>>({});
  const [pinStatuses, setPinStatuses] = useState<PlcPinStatus[]>(() => empty15PinStatuses());
  const [smallPinStatuses, setSmallPinStatuses] = useState<PlcPinStatus[]>(() => empty3PinStatuses());
  const [specialStatuses, setSpecialStatuses] = useState<PlcPinStatus[]>(() => empty3PinStatuses());
  const [total, setTotal] = useState<number | null>(null);
  const [okCount, setOkCount] = useState<number | null>(null);
  const [ngCount, setNgCount] = useState<number | null>(null);
  const [inspectionData, setInspectionData] = useState<InspectionApiPayload | null>(null);
  const [station3, setStation3] = useState<Station3Data | null>(null);
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);
  const [fullscreenView, setFullscreenView] = useState<"front" | "bottom" | null>(null);
  const router = useRouter();

  const stationIds = stations.map(s => s.id);
  const nextId = (id: number) => {
    const idx = stationIds.indexOf(id);
    return idx < stationIds.length - 1 ? stationIds[idx + 1] : id;
  };

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/inspection/current?modelNo=${encodeURIComponent(CURRENT_MODEL_NO)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Inspection API request failed");

        const data: InspectionApiPayload = await response.json();
        if (!alive) return;

        const activeRoute = MODEL_ROUTES[data.modelNo];
        if (activeRoute && data.modelNo !== CURRENT_MODEL_NO) {
          router.replace(activeRoute);
          return;
        }

        setInspectionData(data);
        setActuals(data.actuals);
        const communicating = data.source.connected;
        setPinStatuses(communicating ? data.pinStatuses?.holes15 ?? empty15PinStatuses() : empty15PinStatuses());
        setSmallPinStatuses(communicating ? data.pinStatuses?.holes3 ?? empty3PinStatuses() : empty3PinStatuses());
        setSpecialStatuses(communicating ? data.pinStatuses?.special ?? empty3PinStatuses() : empty3PinStatuses());
        setStation3(communicating ? data.station3 ?? null : null);
        setTotal(communicating ? data.summary.total : null);
        setOkCount(communicating ? data.summary.ok : null);
        setNgCount(communicating ? data.summary.ng : null);
      } catch (error) {
        console.error("Inspection data refresh failed:", error);
        setPinStatuses(empty15PinStatuses());
        setSmallPinStatuses(empty3PinStatuses());
        setSpecialStatuses(empty3PinStatuses());
        setStation3(null);
        setTotal(null);
        setOkCount(null);
        setNgCount(null);
      }
    };

    refresh();
    const iv = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [router]);

  useEffect(() => {
    if (!fullscreenView) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreenView(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreenView]);

  const plcCommunicating = inspectionData?.source.connected === true;
  const plcAlarmMessage = inspectionData?.source.message;

  const handleClick = (id: number) => {
    if (id !== activeId || loadingId) return;
    setLoadingId(id);
    setTimeout(() => {
      setCompletedIds(prev => prev.includes(id) ? prev : [...prev, id]);
      setActiveId(nextId(id));
      setLoadingId(null);
    }, LOADING_MS);
  };

  return (
    <div style={{
      flex: 1,
      display: "flex",
      width: "100%",
      height: "100%",
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
      background: C.bg,
      color: C.txt,
      fontFamily: "'Montserrat', sans-serif",
      transition: "background 0.25s ease, color 0.25s ease",
    }}>
      <style>{GLOBAL}</style>
      {fullscreenView && <DiagramFullscreenModal view={fullscreenView} onClose={() => setFullscreenView(null)} C={C} actuals={actuals} pinStatuses={pinStatuses} />}

      {/* ════════════ LEFT PANEL (60%) ════════════ */}
      <div style={{
        flex: "0 0 52%",
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${C.brd}`,
        background: C.panel,
        flexShrink: 0,
        height: "100%",
        minHeight: 0,
        minWidth: 0,
      }}>
        {/* Header */}
        <div style={{
          height: "clamp(36px,4.6vh,52px)",
          display: "flex", alignItems: "center",
          padding: `0 ${sp.md}`, gap: sp.sm,
          borderBottom: `1px solid ${C.brd}`,
          background: C.hdr, flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                ...MONO,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "clamp(9px,0.58vw,12px)",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              <div style={{ color: C.txtMid }}>
                Component Assembly
              </div>
              <div style={{ display: "flex", gap: sp.xs, minWidth: 0, whiteSpace: "nowrap" }}>
                <span style={{ color: C.txtMid }}>Component No :</span>
                <span id="componentNumber" style={{ color: C.accent }}>{inspectionData?.header.componentNo ?? "--"}</span>
              </div>
              <div style={{ display: "flex", gap: sp.xs, minWidth: 0, whiteSpace: "nowrap" }}>
                <span style={{ color: C.txtMid }}>Model No :</span>
                <span id="modelNumber" style={{ color: C.accent }}>{inspectionData?.header.modelNumber ?? "--"}</span>
              </div>
            </div>
          </div>

        </div>

        {/* FRONT VIEW */}
        <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.brd}`, minHeight: 0 }}>
          <div style={{ padding: `${sp.xs} ${sp.md}`, borderBottom: `1px solid ${C.brd}`, background: C.hdr, flexShrink: 0, display: "flex", alignItems: "center", gap: sp.sm }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />
            <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.txtMid }}>Front View</span>
          </div>
          <div style={{ flex: 1, position: "relative", background: C.viewBg }}>
            <DiagramFullscreenButton label="Front View" onClick={() => setFullscreenView("front")} C={C} />

            <FrontDiagramSvg C={C} actuals={actuals} pinStatuses={pinStatuses} />
          </div>
        </div>

        {/* BACK VIEW */}
        <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.brd}`, minHeight: 0 }}>
          <div style={{ padding: `${sp.xs} ${sp.md}`, borderBottom: `1px solid ${C.brd}`, background: C.hdr, flexShrink: 0, display: "flex", alignItems: "center", gap: sp.sm }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.txtDim }} />
            <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.txtMid }}>Bottom View</span>
          </div>
          <div style={{ flex: 1, position: "relative", background: C.viewBg, padding: "0 clamp(4px,0.75vw,14px)", minWidth: 0, overflow: "hidden" }}>
            <DiagramFullscreenButton label="Bottom View" onClick={() => setFullscreenView("bottom")} C={C} />


            <BottomDiagramSvg C={C} actuals={actuals} pinStatuses={pinStatuses} />
          </div>
        </div>

        {/* INSPECTION STATUS */}
        <div style={{ flex: "0 0 auto", minHeight: 0 }}>
          <div style={{ padding: `${sp.xs} ${sp.md}`, borderBottom: `1px solid ${C.brd}`, borderTop: `1px solid ${C.brd}`, background: C.hdr, display: "flex", alignItems: "center", gap: sp.sm }}>
            <Activity size={14} color={C.accent} strokeWidth={2.6} />
            <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.txtMid }}>Inspection Status</span>
          </div>
          {!plcCommunicating && <PlcCommunicationAlarm C={C} message={plcAlarmMessage} />}
          <StatusCards total={total} okCount={okCount} ngCount={ngCount} C={C} />
        </div>
      </div>

      {/* ════════════ RIGHT PANEL (40%) ════════════ */}
      <div
        className="inspection-stations-theme"
        style={{
          ...rightPanelStyle,
          flex: "0 0 48%",
          display: "flex",
          flexDirection: "column",
          background: `
            linear-gradient(${dark ? "rgba(255,255,255,0.04)" : "#d9e2eb"} 1px, transparent 1px),
            linear-gradient(90deg, ${dark ? "rgba(255,255,255,0.04)" : "#d9e2eb"} 1px, transparent 1px),
            ${rightC.bg}
          `,
          backgroundSize: "34px 34px",
          minWidth: 0,
          minHeight: 0,
          height: "100%",          // 🔥 important
          flexShrink: 0,
        }}
      >
        {/* TOP STRIP (fixed height) */}
        <div style={{ flexShrink: 0 }}>
          <StationStrip
            activeId={activeId}
            completedIds={completedIds}
            loadingId={loadingId}
            onClick={handleClick}
            hoveredStation={hoveredStation}
            onHover={setHoveredStation}
            C={rightC}
          />
        </div>

        {/* STATION TABLES */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            padding: sp.md,
            display: "grid",
            gridTemplateRows: "minmax(160px,1fr) minmax(238px,1.45fr) minmax(132px,0.72fr) minmax(156px,0.9fr)",
            gap: sp.md,
          }}
        >
          <Station01Panel actuals={actuals[1] ?? {}} C={rightC} />
          <Station02Panel pinStatuses={pinStatuses} smallPinStatuses={smallPinStatuses} specialStatuses={specialStatuses} C={rightC} />
          <Station03Panel station3={station3} C={rightC} />
          <Station456Panel actuals={actuals} C={rightC} />
        </div>
      </div>
    </div>
  );
}
export default function Dashboard() {
  return <Inspection1Dashboard />;
}
