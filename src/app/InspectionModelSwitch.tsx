"use client";

import { useEffect, useState } from "react";
import type { InspectionApiPayload } from "../lib/inspectionDataService";
import Inspection1 from "./inspection1/page";
import Inspection2 from "./inspection2/page";
import Inspection3 from "./inspection3/page";

const LIVE_REFRESH_MS = 1000;

function normalizeModelNo(modelNo: string | number | undefined | null) {
  return String(modelNo ?? "").replace(/\D/g, "");
}

function componentForModel(modelNo: string) {
  if (modelNo === "6630867") return Inspection2;
  if (modelNo === "6630862") return Inspection3;
  return Inspection1;
}

export default function InspectionModelSwitch() {
  const [modelNo, setModelNo] = useState("6630865");

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/inspection/current", { cache: "no-store" });
        if (!response.ok) throw new Error("Inspection API request failed");
        const data: InspectionApiPayload = await response.json();
        const nextModelNo = normalizeModelNo(data.modelNo || data.common?.modelNo);
        if (alive && nextModelNo) setModelNo(nextModelNo);
      } catch (error) {
        console.error("Inspection model refresh failed:", error);
      }
    };

    refresh();
    const interval = setInterval(refresh, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const ActiveInspection = componentForModel(modelNo);
  return <ActiveInspection />;
}
