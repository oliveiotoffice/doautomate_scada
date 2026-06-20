export type InspectionValueMap = Record<number, Record<number, number | null>>;

export type InspectionModelNo = "6630865";
export type PlcPinStatus = 2 | 4 | 5 | null;

export type InspectionHeader = {
  shaftNumber: string;
  operatorId: string;
  componentNo: string;
  modelNumber: string;
};

export type InspectionApiPayload = {
  header: InspectionHeader;
  componentNo: string;
  modelNo: InspectionModelNo;
  modelNumber: string;
  actuals: InspectionValueMap;
  pinStatuses: {
    holes15: PlcPinStatus[];
  };
  summary: {
    total: number;
    ok: number;
    ng: number;
  };
  source: {
    backendUrl: string;
    connected: boolean;
    message?: string;
    updatedAt: string;
  };
};

const CURRENT_MODEL_NO: InspectionModelNo = "6630865";
const PIN_COUNT = 15;
const DEFAULT_BACKEND_URL = "http://localhost:4000";
const EMPTY_PIN_STATUSES: PlcPinStatus[] = Array.from({ length: PIN_COUNT }, () => null);
const EMPTY_HEADER: InspectionHeader = {
  shaftNumber: "-",
  operatorId: "-",
  componentNo: "-",
  modelNumber: "-",
};

function normalizeBackendUrl() {
  return (process.env.INSPECTION_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}

function normalizeStatus(value: unknown): PlcPinStatus {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (numeric === 2 || numeric === 4 || numeric === 5) return numeric;
  return null;
}

function statusFromReading(reading: unknown): PlcPinStatus {
  if (typeof reading === "number" || typeof reading === "string") return normalizeStatus(reading);
  if (!reading || typeof reading !== "object") return null;

  const record = reading as Record<string, unknown>;
  return normalizeStatus(record.status ?? record.value ?? record.result ?? record.code);
}

function normalizePinStatuses(payload: unknown): PlcPinStatus[] {
  if (!payload || typeof payload !== "object") return EMPTY_PIN_STATUSES;
  const root = payload as Record<string, unknown>;
  const pinStatuses = root.pinStatuses as Record<string, unknown> | undefined;
  const stations = root.stations as Record<string, unknown> | undefined;
  const station2 = stations?.["2"] as Record<string, unknown> | undefined;
  const rawPins = pinStatuses?.holes15 ?? station2?.holes15 ?? root.holes15;

  if (Array.isArray(rawPins)) {
    return Array.from({ length: PIN_COUNT }, (_, index) => statusFromReading(rawPins[index]));
  }

  if (rawPins && typeof rawPins === "object") {
    const record = rawPins as Record<string, unknown>;
    return Array.from({ length: PIN_COUNT }, (_, index) => {
      const pinNo = index + 1;
      return statusFromReading(record[`15pin${pinNo}`] ?? record[String(pinNo)] ?? record[String(index)]);
    });
  }

  return EMPTY_PIN_STATUSES;
}

function textValue(value: unknown, fallback = "-") {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeHeader(payload: unknown): InspectionHeader {
  if (!payload || typeof payload !== "object") return EMPTY_HEADER;
  const root = payload as Record<string, unknown>;
  const header = (root.header && typeof root.header === "object" ? root.header : root) as Record<string, unknown>;

  return {
    shaftNumber: textValue(header.shaftNumber ?? header.shaftNo ?? header.shaft),
    operatorId: textValue(header.operatorId ?? header.operatorID ?? header.operatorName ?? header.operator),
    componentNo: textValue(header.componentNo ?? header.componentNumber ?? header.component),
    modelNumber: textValue(header.modelNumber ?? header.modelNo ?? header.model),
  };
}

function summarizePins(statuses: PlcPinStatus[]) {
  const completed = statuses.filter(status => status !== null).length;
  return {
    total: completed,
    ok: statuses.filter(status => status === 4).length,
    ng: statuses.filter(status => status === 5).length,
  };
}



function backendPlcConnected(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as Record<string, unknown>;
  const plc = root.plc && typeof root.plc === "object" ? root.plc as Record<string, unknown> : null;
  return plc?.connected === true;
}
function normalizeBackendUpdatedAt(payload: unknown) {
  if (!payload || typeof payload !== "object") return new Date().toISOString();
  const root = payload as Record<string, unknown>;
  const plc = root.plc && typeof root.plc === "object" ? root.plc as Record<string, unknown> : null;
  return textValue(plc?.updatedAt ?? root.updatedAt ?? root.cpuTime, new Date().toISOString());
}
function normalizeSummary(payload: unknown, statuses: PlcPinStatus[]) {
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    const summary = root.summary && typeof root.summary === "object" ? root.summary as Record<string, unknown> : null;
    const total = numberValue(summary?.total);
    const ok = numberValue(summary?.ok);
    const ng = numberValue(summary?.ng);

    if (total !== null || ok !== null || ng !== null) {
      const fallback = summarizePins(statuses);
      return {
        total: total ?? fallback.total,
        ok: ok ?? fallback.ok,
        ng: ng ?? fallback.ng,
      };
    }
  }

  return summarizePins(statuses);
}

async function readFromBackend() {
  const backendUrl = normalizeBackendUrl();

  try {
    const response = await fetch(`${backendUrl}/api/inspection1/current`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Backend ${response.status}: ${response.statusText}`);

    const payload = await response.json();
    const plcConnected = backendPlcConnected(payload);
    const statuses = plcConnected ? normalizePinStatuses(payload) : EMPTY_PIN_STATUSES;
    return {
      backendUrl,
      connected: plcConnected,
      payload,
      header: normalizeHeader(payload),
      statuses,
      summary: plcConnected ? normalizeSummary(payload, statuses) : { total: 0, ok: 0, ng: 0 },
      updatedAt: normalizeBackendUpdatedAt(payload),
      message: undefined,
    };
  } catch (error) {
    return {
      backendUrl,
      connected: false,
      payload: null,
      header: EMPTY_HEADER,
      statuses: EMPTY_PIN_STATUSES,
      summary: { total: 0, ok: 0, ng: 0 },
      updatedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : "Inspection backend unavailable",
    };
  }
}

export async function getInspectionData(modelNo?: string | null): Promise<InspectionApiPayload> {
  const requestedModelNo = (modelNo ?? CURRENT_MODEL_NO).replace(/[^0-9]/g, "");
  const normalizedModelNo: InspectionModelNo = requestedModelNo === CURRENT_MODEL_NO ? CURRENT_MODEL_NO : CURRENT_MODEL_NO;
  const backend = await readFromBackend();

  return {
    header: backend.header,
    componentNo: backend.header.componentNo,
    modelNo: normalizedModelNo,
    modelNumber: backend.header.modelNumber,
    actuals: {},
    pinStatuses: {
      holes15: backend.statuses,
    },
    summary: backend.summary,
    source: {
      backendUrl: backend.backendUrl,
      connected: backend.connected,
      message: backend.message,
      updatedAt: backend.updatedAt,
    },
  };
}