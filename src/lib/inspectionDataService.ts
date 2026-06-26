export type InspectionValueMap = Record<number, Record<number, number | null>>;

export type InspectionModelNo = string;
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
    holes3?: PlcPinStatus[];
    special?: PlcPinStatus[];
  };
  station3?: {
    marking2d: PlcPinStatus;
    topEngraving: PlcPinStatus;
    sideEngraving: PlcPinStatus;
    qrVerifierValue?: string;
    qrGrade?: string | null;
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
const SMALL_PIN_COUNT = 3;
const DEFAULT_BACKEND_URL = "http://localhost:4000";
const EMPTY_PIN_STATUSES: PlcPinStatus[] = Array.from({ length: PIN_COUNT }, () => null);
const EMPTY_SMALL_PIN_STATUSES: PlcPinStatus[] = Array.from({ length: SMALL_PIN_COUNT }, () => null);
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

function mockStatus(index: number, seed: number): PlcPinStatus {
  const value = (seed * 17 + index * 29) % 19;
  if (value === 0) return 5;
  if (value === 1) return 2;
  return 4;
}

function mockStatuses(count: number, seed: number): PlcPinStatus[] {
  return Array.from({ length: count }, (_, index) => mockStatus(index, seed));
}

function mockActual(base: number, offset: number, decimals = 3) {
  const wobble = Math.sin(Date.now() / 9000 + offset) * 0.006;
  return Number((base + wobble).toFixed(decimals));
}

function boolSummary(statuses: PlcPinStatus[]) {
  return {
    total: statuses.filter(status => status !== null).length,
    ok: statuses.filter(status => status === 4).length,
    ng: statuses.filter(status => status === 5).length,
  };
}

function numericPass(value: number | null, req: number, tol: number) {
  return value !== null && value >= req - tol && value <= req + tol;
}

function makeMockInspectionData(modelNo: InspectionModelNo): InspectionApiPayload {
  const seed = Number(modelNo.replace(/\D/g, "").slice(-3)) || 865;
  const holes15 = mockStatuses(15, seed);
  const holes3 = mockStatuses(3, seed + 50);
  const special = mockStatuses(3, seed + 100);

  const actuals: InspectionValueMap = {
    1: {
      0: mockActual(35.012, 0),
      1: mockActual(35.016, 1),
      2: mockActual(466.050, 2),
      3: mockActual(26.902, 3),
      4: mockActual(26.908, 4),
      5: mockActual(12.214, 5),
    },
    2: {
      0: 3.001,
      1: 3.004,
      2: 3.006,
    },
    3: {},
    5: {
      0: mockActual(14.501, 6),
      1: mockActual(14.506, 7),
    },
    6: {
      0: mockActual(4.982, 8),
      1: mockActual(4.986, 9),
      2: mockActual(6.304, 10),
      3: mockActual(6.308, 11),
    },
  };

  const station1Results = [
    numericPass(actuals[1][0], 35, 0.025),
    numericPass(actuals[1][1], 35, 0.025),
    numericPass(actuals[1][2], 466, 0.1),
    numericPass(actuals[1][3], 26.9, 0.1),
    numericPass(actuals[1][4], 26.9, 0.1),
    numericPass(actuals[1][5], 12.2, 0.025),
    true,
  ];
  const station56Results = [
    numericPass(actuals[5][0], 14.5, 0.013),
    numericPass(actuals[5][1], 14.5, 0.013),
    numericPass(actuals[6][0], 4.98, 0.013),
    numericPass(actuals[6][1], 4.98, 0.013),
    numericPass(actuals[6][2], 6.3, 0.013),
    numericPass(actuals[6][3], 6.3, 0.013),
  ];
  const booleanCounts = boolSummary([...holes15, ...holes3, ...special, 4, 4, 4, 4]);
  const numericResults = [...station1Results, ...station56Results];
  const numericOk = numericResults.filter(Boolean).length;
  const numericNg = numericResults.length - numericOk;

  return {
    header: {
      shaftNumber: `SH-${modelNo}-${String(seed).padStart(3, "0")}`,
      operatorId: "MOCK-OP",
      componentNo: `Co-${modelNo}`,
      modelNumber: `Shaft-${modelNo}`,
    },
    componentNo: `Co-${modelNo}`,
    modelNo,
    modelNumber: `Shaft-${modelNo}`,
    actuals,
    pinStatuses: {
      holes15,
      holes3,
      special,
    },
    station3: {
      marking2d: 4,
      topEngraving: 4,
      sideEngraving: 4,
      qrVerifierValue: `QR${modelNo}`,
      qrGrade: "A",
    },
    summary: {
      total: booleanCounts.total + numericResults.length,
      ok: booleanCounts.ok + numericOk,
      ng: booleanCounts.ng + numericNg,
    },
    source: {
      backendUrl: "mock://inspection",
      connected: true,
      message: "Mock inspection data",
      updatedAt: new Date().toISOString(),
    },
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
    const response = await fetch(`${backendUrl}/api/inspection/current`, { cache: "no-store" });
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
      modelNo: textValue(asPayloadRecord(payload)?.modelNo),
      modelNumber: textValue(asPayloadRecord(payload)?.modelNumber),
      actuals: normalizeActuals(payload),
      holes3: normalizeStatusArray(payload, ["holes3"], SMALL_PIN_COUNT),
      special: normalizeStatusArray(payload, ["special"], SMALL_PIN_COUNT),
      station3: normalizeStation3(payload),
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
      modelNo: "-",
      modelNumber: "-",
      actuals: {},
      holes3: EMPTY_SMALL_PIN_STATUSES,
      special: EMPTY_SMALL_PIN_STATUSES,
      station3: emptyStation3(),
      message: error instanceof Error ? error.message : "Inspection backend unavailable",
    };
  }
}

function asPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
}

function normalizeActuals(payload: unknown): InspectionValueMap {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const actuals = root.actuals;
  if (!actuals || typeof actuals !== "object") return {};

  const output: InspectionValueMap = {};
  for (const [station, values] of Object.entries(actuals as Record<string, unknown>)) {
    if (!values || typeof values !== "object") continue;
    const stationNo = Number(station);
    if (!Number.isInteger(stationNo)) continue;
    output[stationNo] = {};
    for (const [index, value] of Object.entries(values as Record<string, unknown>)) {
      output[stationNo][Number(index)] = numberValue(value);
    }
  }

  return output;
}

function normalizeStatusArray(payload: unknown, keys: string[], count: number): PlcPinStatus[] {
  if (!payload || typeof payload !== "object") return Array.from({ length: count }, () => null);
  const root = payload as Record<string, unknown>;
  const pinStatuses = root.pinStatuses && typeof root.pinStatuses === "object"
    ? root.pinStatuses as Record<string, unknown>
    : null;

  for (const key of keys) {
    const raw = pinStatuses?.[key] ?? root[key];
    if (Array.isArray(raw)) {
      return Array.from({ length: count }, (_, index) => statusFromReading(raw[index]));
    }
  }

  return Array.from({ length: count }, () => null);
}

function emptyStation3() {
  return {
    marking2d: null,
    topEngraving: null,
    sideEngraving: null,
    qrVerifierValue: "",
    qrGrade: null,
  };
}

function normalizeStation3(payload: unknown) {
  const root = asPayloadRecord(payload);
  const station3 = root?.station3 && typeof root.station3 === "object"
    ? root.station3 as Record<string, unknown>
    : null;

  if (!station3) return emptyStation3();

  return {
    marking2d: statusFromReading(station3.marking2d),
    topEngraving: statusFromReading(station3.topEngraving),
    sideEngraving: statusFromReading(station3.sideEngraving),
    qrVerifierValue: textValue(station3.qrVerifierValue, ""),
    qrGrade: textValue(station3.qrGrade, "") || null,
  };
}

export async function getInspectionData(modelNo?: string | null): Promise<InspectionApiPayload> {
  const requestedModelNo = (modelNo ?? CURRENT_MODEL_NO).replace(/[^0-9]/g, "");
  const normalizedModelNo: InspectionModelNo = requestedModelNo || CURRENT_MODEL_NO;
  if ((process.env.INSPECTION_DATA_SOURCE || "plc").toLowerCase() !== "plc") {
    return makeMockInspectionData(normalizedModelNo);
  }

  const backend = await readFromBackend();
  const backendModelNo = backend.modelNo.replace(/[^0-9]/g, "") || normalizedModelNo;
  const backendModelNumber = backend.modelNumber !== "-" ? backend.modelNumber : `Shaft-${backendModelNo}`;

  return {
    header: backend.header,
    componentNo: backend.header.componentNo,
    modelNo: backendModelNo,
    modelNumber: backendModelNumber,
    actuals: backend.actuals,
    pinStatuses: {
      holes15: backend.statuses,
      holes3: backend.holes3,
      special: backend.special,
    },
    station3: backend.station3,
    summary: backend.summary,
    source: {
      backendUrl: backend.backendUrl,
      connected: backend.connected,
      message: backend.message,
      updatedAt: backend.updatedAt,
    },
  };
}
