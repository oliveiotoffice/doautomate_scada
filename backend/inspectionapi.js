const http = require("http");
const {
  AREA_START,
  STATION_OFFSETS,
  getWords,
  makeConfig,
  readWordsInChunks,
  wordsToDateTime,
  wordsToFloat,
  wordsToString,
  wordsToUInt32,
} = require("./plc-layout");

const PORT = Number(process.env.INSPECTION_BACKEND_PORT || 4000);
const MODEL_END = 10399;
const READ_COUNT = MODEL_END - AREA_START + 1;
const POLL_MS = Number(process.env.PLC_POLL_MS || process.env.MC_POLL_MS || 3000);
const ERROR_DELAY_MS = Number(process.env.PLC_ERROR_DELAY_MS || 10000);
const MODEL_NAMES = {
  6630865: "Shaft-6630865",
  6630867: "Shaft-6630867",
  6630862: "Shaft-6630862",
};
let cache = makeDisconnectedPayload("PLC polling not started");
let polling = false;

function stationBase(stationNo) {
  return AREA_START + STATION_OFFSETS[stationNo];
}

function boolStatus(value) {
  if (value === 1 || value === 4) return 4;
  if (value === 0 || value === 5) return 5;
  if (value === 2) return 2;
  return null;
}

function readBool(area, address) {
  return getWords(area, address, 1)[0] || 0;
}

function readFloatValue(area, address) {
  const words = getWords(area, address, 2);
  return wordsToFloat(words[0], words[1]);
}

function readFloatParameter(area, address) {
  const min = readFloatValue(area, address);
  const max = readFloatValue(area, address + 2);
  const actual = readFloatValue(area, address + 4);
  const pass = actual >= min && actual <= max;

  return {
    min,
    max,
    actual,
    pass,
    label: pass ? "OK" : "NG",
  };
}

function decodeCommon(area) {
  return {
    shift: getWords(area, 10000, 1)[0],
    operator: wordsToString(getWords(area, 10001, 10)),
    modelNo: wordsToUInt32(...getWords(area, 10011, 2)),
    componentNo: wordsToUInt32(...getWords(area, 10013, 2)),
    rtc: wordsToDateTime(getWords(area, 10020, 10)),
    total: getWords(area, 10030, 1)[0],
    ok: getWords(area, 10031, 1)[0],
    notOk: getWords(area, 10032, 1)[0],
  };
}

function decodeUniversal(area) {
  const station1 = stationBase(1);
  const station2 = stationBase(2);
  const station3 = stationBase(3);
  const station5 = stationBase(5);
  const station6 = stationBase(6);

  return {
    station1: {
      outerDiameterLeft: readFloatParameter(area, station1 + 0),
      outerDiameterRight: readFloatParameter(area, station1 + 6),
      overallLength: readFloatParameter(area, station1 + 12),
      dowelLength: readFloatParameter(area, station1 + 18),
      apg122Diameter: readFloatParameter(area, station1 + 24),
      presence3d: boolStatus(readBool(area, station1 + 30)),
      gaugeDowelToDowel: readFloatParameter(area, station1 + 31),
    },
    station2: {
      holes15: Array.from({ length: 15 }, (_, index) => boolStatus(readBool(area, station2 + index))),
      holes3: Array.from({ length: 3 }, (_, index) => boolStatus(readBool(area, station2 + 15 + index))),
      special: Array.from({ length: 3 }, (_, index) => boolStatus(readBool(area, station2 + 18 + index))),
    },
    station3: {
      marking2d: boolStatus(readBool(area, station3 + 0)),
      topEngraving: boolStatus(readBool(area, station3 + 1)),
      sideEngraving: boolStatus(readBool(area, station3 + 2)),
      qrVerifierValue: wordsToString(getWords(area, station3 + 10, 10)),
    },
    station5: {
      plugLeft: readFloatParameter(area, station5 + 0),
      plugRight: readFloatParameter(area, station5 + 6),
    },
    station6: {
      dowelLeft: readFloatParameter(area, station6 + 0),
      dowelRight: readFloatParameter(area, station6 + 6),
      ballLeft: readFloatParameter(area, station6 + 12),
      ballRight: readFloatParameter(area, station6 + 18),
    },
  };
}

function numberActual(reading) {
  if (typeof reading === "number") return reading;
  return reading && typeof reading.actual === "number" ? reading.actual : null;
}

function makePayload(area, config) {
  const common = decodeCommon(area);
  const decoded = decodeUniversal(area);
  const modelNo = String(common.modelNo || "");
  const modelNumber = MODEL_NAMES[common.modelNo] || (modelNo ? `Shaft-${modelNo}` : "-");
  const componentNo = common.componentNo ? String(common.componentNo) : "-";

  return {
    header: {
      shaftNumber: "-",
      operatorId: common.operator || "-",
      componentNo,
      modelNumber,
    },
    componentNo,
    modelNo,
    modelNumber,
    actuals: {
      1: {
        0: numberActual(decoded.station1.outerDiameterLeft),
        1: numberActual(decoded.station1.outerDiameterRight),
        2: numberActual(decoded.station1.overallLength),
        3: numberActual(decoded.station1.dowelLength),
        4: numberActual(decoded.station1.apg122Diameter),
        5: numberActual(decoded.station1.gaugeDowelToDowel),
      },
      2: {},
      3: {},
      5: {
        0: numberActual(decoded.station5.plugLeft),
        1: numberActual(decoded.station5.plugRight),
      },
      6: {
        0: numberActual(decoded.station6.dowelLeft),
        1: numberActual(decoded.station6.dowelRight),
        2: numberActual(decoded.station6.ballLeft),
        3: numberActual(decoded.station6.ballRight),
      },
    },
    pinStatuses: {
      holes15: decoded.station2.holes15,
      holes3: decoded.station2.holes3,
      special: decoded.station2.special,
    },
    station3: {
      marking2d: decoded.station3.marking2d,
      topEngraving: decoded.station3.topEngraving,
      sideEngraving: decoded.station3.sideEngraving,
      qrVerifierValue: decoded.station3.qrVerifierValue,
      qrGrade: decoded.station3.qrVerifierValue || null,
    },
    registerMap: {
      common: {
        shift: "D10000",
        operator: "D10001-D10010",
        modelNo: "D10011-D10012",
        componentNo: "D10013-D10014",
        rtc: "D10020-D10029",
        total: "D10030",
        ok: "D10031",
        notOk: "D10032",
      },
      stations: {
        1: "D10100-D10149",
        2: "D10150-D10199",
        3: "D10200-D10249",
        4: "D10250-D10299",
        5: "D10300-D10349",
        6: "D10350-D10399",
      },
      station3: {
        marking2d: "D10200",
        topEngraving: "D10201",
        sideEngraving: "D10202",
        qrVerifierValue: "D10210-D10219",
      },
    },
    summary: {
      total: common.total || 0,
      ok: common.ok || 0,
      ng: common.notOk || 0,
    },
    source: {
      backendUrl: `mc://${config.host}:${config.port}`,
      connected: true,
      updatedAt: new Date().toISOString(),
    },
    plc: {
      host: config.host,
      port: config.port,
      connected: true,
      updatedAt: new Date().toISOString(),
      readStartRegister: "D10000",
      readEndRegister: "D10399",
    },
    raw: {
      common,
      decoded,
    },
  };
}

function makeDisconnectedPayload(message) {
  const updatedAt = new Date().toISOString();
  return {
    header: {
      shaftNumber: "-",
      operatorId: "-",
      componentNo: "-",
      modelNumber: "-",
    },
    componentNo: "-",
    modelNo: "",
    modelNumber: "-",
    actuals: {},
    pinStatuses: {
      holes15: Array.from({ length: 15 }, () => null),
      holes3: Array.from({ length: 3 }, () => null),
      special: Array.from({ length: 3 }, () => null),
    },
    station3: {
      marking2d: null,
      topEngraving: null,
      sideEngraving: null,
      qrVerifierValue: "",
      qrGrade: null,
    },
    summary: { total: 0, ok: 0, ng: 0 },
    source: {
      backendUrl: "mc://unavailable",
      connected: false,
      message,
      updatedAt,
    },
    plc: {
      connected: false,
      message,
      updatedAt,
      readStartRegister: "D10000",
      readEndRegister: "D10399",
    },
  };
}

async function pollPlc() {
  if (polling) return;
  polling = true;

  try {
    const config = makeConfig();
    const words = await readWordsInChunks(config, AREA_START, READ_COUNT);
    cache = makePayload(words, config);
    console.log(`[${new Date().toISOString()}] PLC read ok model=${cache.modelNo || "-"} total=${cache.summary.total} ok=${cache.summary.ok} ng=${cache.summary.ng}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cache = makeDisconnectedPayload(message);
    console.error(`[${new Date().toISOString()}] PLC read failed: ${message}`);
  } finally {
    polling = false;
  }
}

function schedulePoll(delayMs) {
  setTimeout(async () => {
    const wasConnected = cache.source.connected;
    await pollPlc();
    schedulePoll(cache.source.connected || wasConnected ? POLL_MS : ERROR_DELAY_MS);
  }, delayMs);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/inspection/current" || url.pathname === "/api/inspection1/current") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify(cache));
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, source: cache.source, plc: cache.plc }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Inspection API listening on http://localhost:${PORT}`);
  console.log(`Reading universal PLC layout D10000-D10399 every ${POLL_MS}ms`);
  pollPlc().finally(() => schedulePoll(POLL_MS));
});
