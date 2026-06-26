"use client";

import { useState, useEffect, useRef } from "react";
import React from "react";
import type { InspectionApiPayload } from '../../lib/inspectionDataService';
import { Activity, ArrowRight, CheckCircle2, Gauge, Maximize2, QrCode, ScanLine, X, XCircle } from "lucide-react";
import { useTheme } from "./components/ThemeContext";
import { useRouter } from "next/navigation";

const CURRENT_MODEL_NO = "6630862";
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
function isPass(req: number | null, tol: number | null, val: number | null): boolean {
  if (req === null || tol === null || val === null) return true;
  return val >= req - tol && val <= req + tol;
}
function genPins(count: number, seed: number): boolean[] {
  return Array.from({ length: count }, (_, i) => ((seed * 31 + i * 17 + count * 7) % 100) > 12);
}

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
  LIVE CLOCK
═══════════════════════════════════════════════════════════ */
function LiveClock({ C }: { C: T }) {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  const z = (n: number) => String(n).padStart(2, "0");
  return (
    <div style={{ ...MONO, fontSize: fs.sm, fontWeight: 700, color: C.txt, letterSpacing: "0.1em", userSelect: "none" }}>
      {z(t.getHours())}<span style={{ animation: "colon-blink 1s step-end infinite" }}>:</span>
      {z(t.getMinutes())}<span style={{ animation: "colon-blink 1s step-end infinite" }}>:</span>
      {z(t.getSeconds())}
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
function StatusCards({ total, okCount, ngCount, C }: {
  total: number; okCount: number; ngCount: number; C: T;
}) {
  return (
    <div style={{ padding: `${sp.sm} ${sp.md}`, display: "flex", flexDirection: "column", gap: sp.sm }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: sp.sm }}>
        {[
          { label: "TOTAL", value: total, color: C.txtMid, Icon: Gauge },
          { label: "OK", value: okCount, color: C.ok, Icon: CheckCircle2 },
          { label: "NG", value: ngCount, color: C.ng, Icon: XCircle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} style={{
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
              <span style={{ ...MONO, fontSize: fs.stat, fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
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
function StatusPill({ label, tone, C }: { label: string; tone: "ok" | "ng"; C: T }) {
  const color = tone === "ok" ? C.ok : C.ng;
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
      background: tone === "ok" ? C.okSoft : C.ngSoft,
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
  value, pass, unit, label, rangeLabel, C, width, fontSize
}: {
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
    <div style={{
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
          fontSize: fontSize ?? "clamp(20px, min(20cqw, 7.2cqh), 36px)",
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
    true,
    isPass(p[4].req, p[4].tol, dowelR),
  ];
  const okCount = results.filter(Boolean).length;
  const ngCount = results.length - okCount;

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
            <StatusPill label={`${okCount} OK`} tone="ok" C={C} />
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
            value={shaftL !== null ? shaftL.toFixed(3) : "—"}
            pass={isPass(p[0].req, p[0].tol, shaftL)}
            unit={p[0].unit}
            label="Left"
            rangeLabel="34.996-35.100"
            fontSize={station01ValueFont}
            C={C}
          />
          <ValCell
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
          value={oaLen !== null ? oaLen.toFixed(3) : "—"}
          pass={isPass(p[2].req, p[2].tol, oaLen)}
            unit={p[2].unit}
          label="Calc"
          rangeLabel="466.621-466.821"
          fontSize={station01ValueFont}
          C={C}
        />

        <ValCell
          value={dowelL !== null ? dowelL.toFixed(3) : "—"}
          pass={isPass(p[3].req, p[3].tol, dowelL)}
            unit={p[3].unit}
          label="Calc"
          rangeLabel="458.900-459.100"
          fontSize={station01ValueFont}
          C={C}
        />

        <ValCell
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
function Station02Panel({ pinSeed, C }: { pinSeed: number; C: T }) {
  type PinCell = { n: number; pass: boolean; label: string };

  const first6 = genPins(6, pinSeed);
  const second6 = genPins(6, pinSeed + 50);
  const fourMm51 = genPins(1, pinSeed + 100)[0];
  const slot12213 = genPins(1, pinSeed + 200)[0];

  // ---- SPLIT DATA ----
  const col1: PinCell[] = first6.map((p, i) => ({
    n: i + 1,
    pass: p,
    label: String(i + 1).padStart(2, "0"),
  }));

  const col2: PinCell[] = second6.map((p, i) => ({
    n: i + 7,
    pass: p,
    label: String(i + 7).padStart(2, "0"),
  }));

  const col3: PinCell[] = [
    { n: 13, pass: fourMm51, label: "4mm / 51°" },
    { n: 14, pass: slot12213, label: "12.2–13" },
    { n: 15, pass: genPins(1, pinSeed + 300)[0], label: "Slot" },
  ];

  const allPins = [...col1, ...col2, ...col3];
  const okCount = allPins.filter((cell) => cell.pass).length;
  const ngCount = allPins.length - okCount;

  const Cell = ({ cell }: { cell: PinCell }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        alignItems: "center",
        background: C.isDark ? C.card : "#f8fafc",
        ...sideBorders(
          `1.5px solid ${
            C.isDark
              ? cell.pass
                ? "rgba(34,197,94,0.48)"
                : "rgba(239,68,68,0.54)"
              : C.brd
          }`
        ),
        borderTop: `3px solid ${cell.pass ? C.ok : C.ng}`,
        borderRadius: 3,
        padding: `clamp(6px,0.62vh,10px) clamp(8px,0.64vw,13px)`,
        minHeight: "clamp(44px,5.2vh,62px)",
        height: "100%",
        minWidth: 0,
        boxShadow: C.isDark
          ? "0 1px 7px rgba(0,0,0,0.14)"
          : "inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 2px rgba(15,23,42,0.06)",
      }}
    >
      <span
        style={{
          ...MONO,
          fontSize: fs.sm,
          fontWeight: 900,
          color: cell.pass ? C.ok : C.ng,
          lineHeight: 1.05,
          whiteSpace: "normal",
          overflowWrap: "anywhere",
        }}
      >
        {cell.label}
      </span>

      <span
        style={{
          ...MONO,
          justifySelf: "center",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 38,
          borderRadius: 3,
          padding: "4px 7px",
          background: cell.pass ? C.okSoft : C.ngSoft,
          border: `1px solid ${cell.pass ? C.ok : C.ng}`,
          fontSize: "clamp(9px, min(0.75vw, 1.25vh), 12px)",
          fontWeight: 900,
          color: cell.pass ? C.ok : C.ng,
          lineHeight: 1,
          textAlign: "center",
        }}
      >
        {cell.pass ? "OK" : "NG"}
      </span>
    </div>
  );

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
        boxShadow: C.isDark
          ? "0 12px 24px rgba(0,0,0,0.18)"
          : "0 2px 8px rgba(15,23,42,0.08)",
      }}
    >
      <TblSectionHeader
        code="ST-02"
        name="RECEIVER GAUGE STATION"
        C={C}
        accent="#6366f1"
        right={
          <>
            {ngCount > 0 && (
              <StatusPill label={`${ngCount} NG`} tone="ng" C={C} />
            )}
            <StatusPill label={`${okCount} OK`} tone="ok" C={C} />
          </>
        }
      />

      {/* HEADER */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,2fr) minmax(0,2fr) minmax(120px,1fr)",
          background: C.panel,
          borderBottom: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`,
        }}
      >
        {["3mm 6 Holes", "3mm 6  6 Holes", "Special"].map((label) => (
          <div
            key={label}
            style={{
              ...MONO,
              fontSize: fs.sm,
              fontWeight: 800,
              textAlign: "center",
              padding: sp.xs,
              whiteSpace: "normal",
              lineHeight: 1.1,
              color: C.txt,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* BODY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,2fr) minmax(0,2fr) minmax(120px,1fr)",
          gap: sp.xs,
          padding: sp.xs,
          flex: 1,
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        {/* FIRST 6 → 2 COLUMNS × 3 ROWS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gridTemplateRows: "repeat(3, minmax(0, 1fr))",
            gap: sp.xs,
            padding: sp.xs,
            borderRadius: 4,
            minHeight: 0,
          }}
        >
          {col1.map((cell) => (
            <Cell key={cell.n} cell={cell} />
          ))}
        </div>

        {/* SECOND 6 → 2 COLUMNS × 3 ROWS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gridTemplateRows: "repeat(3, minmax(0, 1fr))",
            gap: sp.xs,
            padding: sp.xs,
            borderRadius: 4,
            minHeight: 0,
          }}
        >
          {col2.map((cell) => (
            <Cell key={cell.n} cell={cell} />
          ))}
        </div>

        {/* SPECIAL → 1 COLUMN × 3 ROWS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gridTemplateRows: "repeat(3, minmax(0, 1fr))",
            gap: sp.xs,
            padding: sp.xs,
            borderRadius: 4,
            minHeight: 0,
          }}
        >
          {col3.map((cell) => (
            <Cell key={cell.n} cell={cell} />
          ))}
        </div>
      </div>
    </div>
  );
}
/* ═══════════════════════════════════════════════════════════
  STATION 03 — Laser Marking / QR + Grade
═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
  STATION 03 — Laser Marking
═══════════════════════════════════════════════════════════ */


function Station03Panel({ C }: { C: T }) {
  const cols = [
    { name: "2D Marking", pass: true },
    { name: "Top Engraving", pass: true },
    { name: "Side Engraving", pass: true },
    { name: "Verifier", pass: true, grade: "A" },
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
        right={<StatusPill label="ALL OK" tone="ok" C={C} />}
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
            style={{
              display: "flex",
              flexDirection: "column",
              ...sideBorders(`1.5px solid ${C.brd}`),
              borderTop: `3px solid ${col.grade ? "#0f4c8a" : C.ok}`,
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
                    background: col.pass ? C.okSoft : C.ngSoft,
                    border: `1px solid ${col.pass ? C.ok : C.ng}`,
                    fontSize: "clamp(13px,1.05vw,18px)",
                    fontWeight: 900,
                    color: col.pass ? C.ok : C.ng,
                    lineHeight: 1,
                  }}
                >
                  {col.pass ? "OK" : "NG"}
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
function Station456Panel({
  actuals,
  C,
}: {
  actuals: Record<number, Record<number, number | null>>;
  C: T;
}) {
  const st5 = stations[4]; // 14.5 APG
  const st6 = stations[5]; // 6.3/4.98 APG

  const st5a = actuals[5] ?? {};
  const st6a = actuals[6] ?? {};

  const reamL = st6a[0] ?? null;
  const reamR = st6a[1] ?? null;
  const plug14L = st5a[0] ?? null;
  const plug14R = st5a[1] ?? null;

  const results = [
    isPass(st6.params[0].req, st6.params[0].tol, reamL),
    isPass(st6.params[1].req, st6.params[1].tol, reamR),
    isPass(st5.params[0].req, st5.params[0].tol, plug14L),
    isPass(st5.params[1].req, st5.params[1].tol, plug14R),
  ];

  const okCount = results.filter(Boolean).length;
  const ngCount = results.length - okCount;

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
        boxShadow: C.isDark
          ? "0 12px 24px rgba(0,0,0,0.18)"
          : "0 2px 8px rgba(15,23,42,0.08)",
      }}
    >
      <TblSectionHeader
        code="ST-04/05/06"
        name="ROTATING · 14.5 APG · 6.3/4.98 APG"
        C={C}
        accent="#f59e0b"
        right={
          <>
            {ngCount > 0 && (
              <StatusPill label={`${ngCount} NG`} tone="ng" C={C} />
            )}
            <StatusPill label={`${okCount} OK`} tone="ok" C={C} />
          </>
        }
      />

      {/* COLUMN HEADERS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          background: C.panel,
          gap: 0,
        }}
      >
        <ColHdr label="Dowel Hole" C={C} />
        <ColHdr label="Plug Hole" C={C} />
      </div>

      {/* LEFT / RIGHT */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          background: C.panel,
          gap: 0,
        }}
      >
        {["Dowel Hole", "Plug Hole"].map((g) => (
          <div
            key={g}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
              borderRight: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`,
              minWidth: 0,
            }}
          >
            <div
              style={{
                ...MONO,
                fontSize: fs.xs,
                fontWeight: 700,
                color: C.txtMid,
                textAlign: "center",
                padding: sp.xs,
                borderRight: `1.5px solid ${C.isDark ? C.brd : "#dfe7f0"}`,
                background: C.hdr,
              }}
            >
              Left
            </div>

            <div
              style={{
                ...MONO,
                fontSize: fs.xs,
                fontWeight: 700,
                color: C.txtMid,
                textAlign: "center",
                padding: sp.xs,
                background: C.hdr,
              }}
            >
              Right
            </div>
          </div>
        ))}
      </div>

      {/* VALUES */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: sp.xs,
          padding: sp.xs,
          flex: 1,
          minHeight: 0,
          alignItems: "stretch",
        }}
      >
        {/* Dowel Hole */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: sp.xs,
            minWidth: 0,
            height: "100%",
          }}
        >
          <ValCell
            value={reamL !== null ? reamL.toFixed(3) : "—"}
            pass={isPass(st6.params[0].req, st6.params[0].tol, reamL)}
            unit={st6.params[0].unit}
            C={C}
            rangeLabel="4.967-4.993"
          />
          <ValCell
            value={reamR !== null ? reamR.toFixed(3) : "—"}
            pass={isPass(st6.params[1].req, st6.params[1].tol, reamR)}
            unit={st6.params[1].unit}
            C={C}
            rangeLabel="4.967-4.993"
          />
        </div>

        {/* Plug Hole */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
            gap: sp.xs,
            minWidth: 0,
            height: "100%",
          }}
        >
          <ValCell
            value={plug14L !== null ? plug14L.toFixed(3) : "—"}
            pass={isPass(st5.params[0].req, st5.params[0].tol, plug14L)}
            unit={st5.params[0].unit}
            C={C}
            rangeLabel="14.285-14.311"
          />
          <ValCell
            value={plug14R !== null ? plug14R.toFixed(3) : "—"}
            pass={isPass(st5.params[1].req, st5.params[1].tol, plug14R)}
            unit={st5.params[1].unit}
            C={C}
            rangeLabel="14.285-14.311"
          />
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

const svgSpecLow = (param: Param) => param.req !== null && param.tol !== null ? String(param.req - param.tol) : "";
const svgSpecHigh = (param: Param) => param.req !== null && param.tol !== null ? String(param.req + param.tol) : "";
const svgActualValue = (param: Param, value: number | null | undefined) => String(value ?? param.req ?? "");

function FrontDiagramSvg({ C, actuals }: { C: T; actuals: Record<number, Record<number, number | null>> }) {
  const st1 = stations[0];
  const st6 = stations[5];
  const st1a = actuals[1] ?? {};
  const st6a = actuals[6] ?? {};
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
        href="/images/shaft3front.png"
        x="0"
        y="0"
        width="1100"
        height="300"
        preserveAspectRatio="xMidYMid meet"
      />

      {/* Overall Length bottom  */}

      <line id="overallLengthLine" x1="50" y1="280" x2="1045" y2="280" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <line id="overallLengthLeftLimit" x1="45" y1="290" x2="45" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="overallLengthRightLimit" x1="1050" y1="290" x2="1050" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
       
      
      <SvgCard
        id="overallLengthCard"
        x={480}
        y={250}
        label="Overall Length"
        high={svgSpecHigh(st1.params[2])} low={svgSpecLow(st1.params[2])} value={svgActualValue(st1.params[2], st1a[2])}
        C={C}
      />


      {/* ABove Dowel Lenth bottom  */}
      <line id="dowelLengthLine" x1="105" y1="10" x2="985" y2="10" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <line id="dowelLengthLeftLimit" x1="100" y1="5" x2="100" y2="100" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="dowelLengthRightLimit" x1="990" y1="5" x2="990" y2="100" stroke={C.svgLine} strokeWidth="1.5" />


      <SvgCard
        id="dowelLengthCard"
        x={480}
        y={-10}
        label="Dowel Length"
        high={svgSpecHigh(st1.params[3])} low={svgSpecLow(st1.params[3])} value={svgActualValue(st1.params[3], st1a[3])}
        C={C}
      />

      {/* 6 pin in sations 2 first 3mm 6 holes  */}
      {[162, 294, 495, 628, 835, 975].map((cx, i) => {
        const pinId = `6pin${i + 1}`;
        return (
          <g key={pinId} id={pinId} data-station="ST-02" data-group="frontPinPresence">
            <circle id={`${pinId}Circle`} cx={cx} cy={129} r="5" stroke={C.svgRing} strokeWidth="3" fill="none" />
          </g>
        );
      })}


      {/* Right side hole  no parameter */}
      <circle id="frontRightReferenceHoleCircle" cx={1040} cy={170} r="6" stroke={C.svgRing} strokeWidth="4" fill="none" />
 {/* 12.2 mm  right side 12 mm  */}
      <circle id="diameter122Circle" cx={1020} cy={150} r="14" stroke={C.svgRing} strokeWidth="6" fill="none" />

      <line id="diameter122Line" x1="1020" y1="170" x2="1020" y2="220" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />

 

      <SvgCard
        id="diameter122Card"
        x={910}
        y={205}
        label="12.2mm Diameter"
        high={svgSpecHigh(st1.params[5])} low={svgSpecLow(st1.params[5])} value={svgActualValue(st1.params[5], st1a[5])}
        C={C}
      />

      {/* Left  side hole */}
      <circle id="reamerHoleLeftCircle" cx={55} cy={168} r="6" stroke={C.svgRing} strokeWidth="4" fill="none" />
        {/* 4.98 mm  */}
      <line id="reamerHoleLeftLine" x1="55" y1="175" x2="55" y2="220" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      {/* left side 4.98 .. */}
      <SvgCard
        id="reamerHoleLeftCard"
        x={55}
        y={215}
        label="4.98mm Diameter"
        high="5.0"
        low="4.9"
        value="4.98"
        C={C}
      />
    {/* Left  side hole  no parameter */}
      <circle id="frontLeftReferenceHoleCircle" cx={70} cy={145} r="14" stroke={C.svgRing} strokeWidth="6" fill="none" />


      {/* left side 35 mm diameter */}
      <line id="shaftOdLeftTopLeader" x1="220" y1="60" x2="260" y2="60" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdLeftArrowTop" x1="220" y1="103" x2="220" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line id="shaftOdLeftUpperLimit" x1="180" y1="107" x2="260" y2="107" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdLeftLowerLimit" x1="180" y1="190" x2="260" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdLeftArrowBottom" x1="220" y1="230" x2="220" y2="195" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />
   <SvgCard
        id="shaftOdLeftCard"
        x={250}
        y={35}
        label="Outer Diameter"
        high={svgSpecHigh(st1.params[0])} low={svgSpecLow(st1.params[0])} value={svgActualValue(st1.params[0], st1a[0])}
        C={C}
      />
     

      {/* Right side 35 diameter */}

      <line id="shaftOdRightBottomLeader" x1="900" y1="230" x2="860" y2="230" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdRightArrowTop" x1="900" y1="103" x2="900" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line id="shaftOdRightUpperLimit" x1="860" y1="107" x2="940" y2="107" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdRightLowerLimit" x1="860" y1="190" x2="940" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
      <line id="shaftOdRightArrowBottom" x1="900" y1="230" x2="900" y2="195" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />
 {/* RIght side 35 mm */}
      <SvgCard
        id="shaftOdRightCard"
        x={735}
        y={205}
        label="Outer Diameter"
        high={svgSpecHigh(st1.params[1])} low={svgSpecLow(st1.params[1])} value={svgActualValue(st1.params[1], st1a[1])}
        C={C}
      /> 


    
    </svg>
  );
}

function BottomDiagramSvg({ C, actuals }: { C: T; actuals: Record<number, Record<number, number | null>> }) {
  const st5 = stations[4];
  const st6 = stations[5];
  const st5a = actuals[5] ?? {};
  const st6a = actuals[6] ?? {};
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
                href="/images/shaft3backend.png"
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
{/* second 2 stations2 second 3mm 6 hole continuosly map it  */}
              {[140, 268, 462, 595, 803, 945].map((cx, i) => {
                const pinId = `bottom6pin${i + 1}`;
                const cy = i < 3 ? 162 : i < 5 ? 165 : 167;
                return (
                  <g key={pinId} id={pinId} data-station="ST-02" data-group="bottomPinPresence">
                    <circle id={`${pinId}Circle`} cx={cx} cy={cy} r="7" stroke={C.svgRing} strokeWidth="5" fill="none" />
                  </g>
                );
              })}

              {/* top  */}              {/* top  */}
              <line id="plugPresenceLeftLine" x1="120" y1="45" x2="250" y2="45" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />

              <circle id="plugPresenceLeftCircle" cx={105} cy={40} r="17" stroke={C.svgRing} strokeWidth="4" fill="none" />

            

              {/* left  plug hole */}
              <circle id="plugPresenceRightCircle" cx={995} cy={257} r="17" stroke={C.svgRing} strokeWidth="4" fill="none" />
              <SvgCard id="plugPresenceLeftCard" x={200} y={25} label="Plug Hole" high={svgSpecHigh(st5.params[0])} low={svgSpecLow(st5.params[0])} value={svgActualValue(st5.params[0], st5a[0])} C={C} />


{/* right plug hole  */}

              <line id="plugPresenceRightLine" x1="810" y1="260" x2="980" y2="260" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />
              <SvgCard id="plugPresenceRightCard" x={750} y={230} label="Plug Hole" high={svgSpecHigh(st5.params[1])} low={svgSpecLow(st5.params[1])} value={svgActualValue(st5.params[1], st5a[1])} C={C} />



            </svg> 
  );
}

function DiagramFullscreenModal({
  view,
  onClose,
  C,
  actuals,
}: {
  view: "front" | "bottom";
  onClose: () => void;
  C: T;
  actuals: Record<number, Record<number, number | null>>;
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
          {view === "front" ? <FrontDiagramSvg C={C} actuals={actuals} /> : <BottomDiagramSvg C={C} actuals={actuals} />}
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
}: {
  id?: string;
  x: number;
  y: number;
  label: string;
  high: string;
  low: string;
  value: string;
  C: T;
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
        stroke={C.svgCardBorder}
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
          fill={C.svgCardValue}

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
export default function Dashboard() {
  const { theme } = useTheme();
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
  const [pinSeed, setPinSeed] = useState(42);
  const [total, setTotal] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [ngCount, setNgCount] = useState(0);
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

        setActuals(data.actuals);
        setTotal(data.summary.total);
        setOkCount(data.summary.ok);
        setNgCount(data.summary.ng);
        setPinSeed(s => s + 1);
      } catch (error) {
        console.error("Inspection data refresh failed:", error);
      }
    };

    refresh();
    const iv = setInterval(refresh, 1800);
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
      {fullscreenView && <DiagramFullscreenModal view={fullscreenView} onClose={() => setFullscreenView(null)} C={C} actuals={actuals} />}

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
        {/* FRONT VIEW */}
        <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", borderBottom: `1px solid ${C.brd}`, minHeight: 0 }}>
          <div style={{ padding: `${sp.xs} ${sp.md}`, borderBottom: `1px solid ${C.brd}`, background: C.hdr, flexShrink: 0, display: "flex", alignItems: "center", gap: sp.sm }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.accent }} />
            <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.txtMid }}>Front View</span>
          </div>
          <div style={{ flex: 1, position: "relative", background: C.viewBg }}>
            <DiagramFullscreenButton label="Front View" onClick={() => setFullscreenView("front")} C={C} />

            <FrontDiagramSvg C={C} actuals={actuals} />
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

            <BottomDiagramSvg C={C} actuals={actuals} />
          </div>
        </div>

        {/* INSPECTION STATUS */}
        <div style={{ flex: "0 0 auto", minHeight: 0 }}>
          <div style={{ padding: `${sp.xs} ${sp.md}`, borderBottom: `1px solid ${C.brd}`, borderTop: `1px solid ${C.brd}`, background: C.hdr, display: "flex", alignItems: "center", gap: sp.sm }}>
            <Activity size={14} color={C.accent} strokeWidth={2.6} />
            <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.txtMid }}>Inspection Status</span>
          </div>
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
          <Station02Panel pinSeed={pinSeed} C={rightC} />
          <Station03Panel C={rightC} />
          <Station456Panel actuals={actuals} C={rightC} />
        </div>
      </div>
    </div>
  );
}
