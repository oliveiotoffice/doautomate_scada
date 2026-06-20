const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");

function loadEnvFile(fileName) {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const DEFAULTS = {
  host: "192.168.3.39",
  port: 502,
  device: "D",
  startAddress: 2100,
  count: 50,
  pollMs: 3000,
  timeoutMs: 5000,
  networkNo: 0x00,
  pcNo: 0xff,
  ioNo: 0x03ff,
  stationNo: 0x00,
  monitorTimer: 0x0010,
};

function envNumber(key, fallback) {
  return process.env[key] === undefined ? fallback : Number(process.env[key]);
}

function envNumberAny(keys, fallback) {
  for (const key of keys) {
    if (process.env[key] !== undefined && process.env[key] !== "") {
      return Number(process.env[key]);
    }
  }

  return fallback;
}

const PORT = Number(process.env.INSPECTION_BACKEND_PORT || 4000);
const PLC_HOST = process.env.PLC_HOST || DEFAULTS.host;
const PLC_PORT = envNumber("PLC_PORT", DEFAULTS.port);
const PLC_PROTOCOL = (process.env.PLC_PROTOCOL || "mc-3e").toLowerCase();
const PLC_DEVICE = (process.env.MC_DEVICE || process.env.PLC_DEVICE || DEFAULTS.device).toUpperCase();
const POLL_MS = envNumberAny(["MC_POLL_MS", "PLC_POLL_MS"], DEFAULTS.pollMs);
const CONNECT_TIMEOUT_MS = envNumberAny(["MC_TIMEOUT_MS", "PLC_CONNECT_TIMEOUT_MS"], DEFAULTS.timeoutMs);
const COMPONENT_NUMBER = process.env.COMPONENT_NUMBER || "Co-6630865";
const MODEL_NUMBER = process.env.MODEL_NUMBER || "Shaft-6630865";
const SHAFT_NUMBER = process.env.SHAFT_NUMBER || "-";
const OPERATOR_ID = process.env.OPERATOR_ID || "-";
const LOG_EVERY_POLL = String(process.env.PLC_LOG_EVERY_POLL || "").toLowerCase() === "true";
const READ_START_REGISTER = envNumberAny(["MC_START_ADDRESS", "PLC_READ_START_REGISTER"], DEFAULTS.startAddress);
const READ_COUNT = envNumberAny(["MC_COUNT", "PLC_READ_COUNT"], DEFAULTS.count);
const READ_END_REGISTER = READ_START_REGISTER + READ_COUNT - 1;
const READ_CHUNK_SIZE = Number(process.env.PLC_READ_CHUNK_SIZE || 10);
const NETWORK_NO = envNumberAny(["MC_NETWORK_NO", "PLC_NETWORK_NO"], DEFAULTS.networkNo);
const PC_NO = envNumberAny(["MC_PC_NO", "PLC_PC_NO"], DEFAULTS.pcNo);
const IO_NO = envNumberAny(["MC_IO_NO", "PLC_IO_NO"], DEFAULTS.ioNo);
const STATION_NO = envNumberAny(["MC_STATION_NO", "PLC_STATION_NO"], DEFAULTS.stationNo);
const MONITOR_TIMER = envNumberAny(["MC_MONITOR_TIMER", "PLC_MONITOR_TIMER"], DEFAULTS.monitorTimer);

const DEVICE_CODES = {
  X: 0x9c,
  Y: 0x9d,
  M: 0x90,
  L: 0x92,
  F: 0x93,
  V: 0x94,
  B: 0xa0,
  D: 0xa8,
  W: 0xb4,
  R: 0xaf,
  ZR: 0xb0,
};

const PIN_SOURCE_REGISTERS = Array.from({ length: 15 }, (_, index) => READ_START_REGISTER + 2 + index * 2);
const PIN_DISPLAY_REGISTERS = Array.from({ length: 15 }, (_, index) => 102 + index * 2);
const VALID_STATUS = new Set([2, 4, 5]);

let cache = makeEmptySnapshot("PLC polling not started");
let lastPollLogSignature = "";
let modbusTransactionId = 0;

function logInfo(message, details) {
  const suffix = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function logError(message, error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${new Date().toISOString()}] ${message}: ${errorMessage}`);
}

function formatRegisterValues(registerValues) {
  if (!registerValues) return undefined;
  return Object.entries(registerValues).map(([register, value]) => `${register}=${value}`).join(", ");
}

function snapshotLogSignature(snapshot) {
  const statuses = snapshot.pinStatuses.holes15.map(pin => `${pin.register}:${pin.label}`).join("|");
  return `${snapshot.plc.connected}|${snapshot.plc.message || ""}|${snapshot.summary.ok}|${snapshot.summary.ng}|${statuses}|${formatRegisterValues(snapshot.plc.registers) || ""}`;
}

function logSnapshotIfChanged(snapshot) {
  const signature = snapshotLogSignature(snapshot);
  if (!LOG_EVERY_POLL && signature === lastPollLogSignature) return;

  lastPollLogSignature = signature;
  logInfo("PLC poll result", {
    connected: snapshot.plc.connected,
    message: snapshot.plc.message || "ok",
    readRange: `${snapshot.plc.readStartRegister}-${snapshot.plc.readEndRegister}`,
    readChunkSize: snapshot.plc.readChunkSize,
    total: snapshot.summary.total,
    ok: snapshot.summary.ok,
    ng: snapshot.summary.ng,
    statuses: snapshot.pinStatuses.holes15.map(pin => `${pin.register}=${pin.label}`).join(", "),
    registers: formatRegisterValues(snapshot.plc.registers),
  });
}

function makeEmptySnapshot(message) {
  const statuses = PIN_DISPLAY_REGISTERS.map((register, index) => ({
    id: `15pin${index + 1}`,
    register: `${PLC_DEVICE}${register}`,
    sourceRegister: `${PLC_DEVICE}${PIN_SOURCE_REGISTERS[index]}`,
    address: register,
    sourceAddress: PIN_SOURCE_REGISTERS[index],
    status: null,
    label: statusLabel(null),
    pass: null,
  }));

  return buildSnapshot(statuses, false, message);
}

function statusLabel(status) {
  if (status === 2) return "LOADING";
  if (status === 4) return "OK";
  if (status === 5) return "NG";
  return "-";
}

function normalizeStatus(value) {
  return VALID_STATUS.has(value) ? value : null;
}

function buildSnapshot(statuses, connected, message) {
  const completed = statuses.filter(pin => pin.status !== null).length;
  const ok = statuses.filter(pin => pin.status === 4).length;
  const ng = statuses.filter(pin => pin.status === 5).length;

  return {
    header: {
      shaftNumber: SHAFT_NUMBER,
      operatorId: OPERATOR_ID,
      componentNumber: COMPONENT_NUMBER,
      modelNumber: MODEL_NUMBER,
    },
    modelNo: "6630865",
    pinStatuses: {
      holes15: statuses,
    },
    stations: {
      2: {
        holes15: statuses,
      },
    },
    summary: {
      total: completed,
      ok,
      ng,
    },
    plc: {
      host: PLC_HOST,
      port: PLC_PORT,
      protocol: PLC_PROTOCOL,
      connected,
      pollMs: POLL_MS,
      message,
      updatedAt: new Date().toISOString(),
    },
  };
}

function attachRegisterValues(snapshot, startAddress, words) {
  snapshot.plc.device = PLC_DEVICE;
  snapshot.plc.readStartRegister = `${PLC_DEVICE}${READ_START_REGISTER}`;
  snapshot.plc.readEndRegister = `${PLC_DEVICE}${READ_END_REGISTER}`;
  snapshot.plc.readChunkSize = READ_CHUNK_SIZE;

  if (Array.isArray(words)) {
    snapshot.plc.registers = Object.fromEntries(
      words.map((value, index) => [`${PLC_DEVICE}${startAddress + index}`, value])
    );
  }

  return snapshot;
}

function writeUInt24LE(buffer, value, offset) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}

function buildReadDWordsFrame(startAddress, wordCount) {
  const deviceCode = DEVICE_CODES[PLC_DEVICE];
  if (deviceCode === undefined) throw new Error(`Unsupported PLC device ${PLC_DEVICE}`);

  const requestDataLength = 12;
  const buffer = Buffer.alloc(9 + requestDataLength);
  let offset = 0;

  buffer.writeUInt16LE(0x0050, offset); offset += 2; // 3E binary request subheader
  buffer.writeUInt8(NETWORK_NO, offset++);
  buffer.writeUInt8(PC_NO, offset++);
  buffer.writeUInt16LE(IO_NO, offset);
  offset += 2;
  buffer.writeUInt8(STATION_NO, offset++);
  buffer.writeUInt16LE(requestDataLength, offset); offset += 2;
  buffer.writeUInt16LE(MONITOR_TIMER, offset); offset += 2;
  buffer.writeUInt16LE(0x0401, offset); offset += 2; // batch read
  buffer.writeUInt16LE(0x0000, offset); offset += 2; // word device
  writeUInt24LE(buffer, startAddress, offset);
  offset += 3;
  buffer.writeUInt8(deviceCode, offset++);
  buffer.writeUInt16LE(wordCount, offset);

  return buffer;
}

function parseReadWordsResponse(buffer, wordCount) {
  if (buffer.length < 11) throw new Error(`PLC response too short: ${buffer.length} bytes`);

  const subheader = buffer.readUInt16LE(0);
  if (subheader !== 0x00d0) throw new Error(`Unexpected MC response subheader: 0x${subheader.toString(16)}`);

  const dataLength = buffer.readUInt16LE(7);
  const endCode = buffer.readUInt16LE(9);
  if (endCode !== 0) throw new Error(`PLC end code 0x${endCode.toString(16)}`);

  const dataBytes = dataLength - 2;
  const expectedBytes = wordCount * 2;
  if (dataBytes < expectedBytes) throw new Error(`PLC returned ${dataBytes} data bytes, expected ${expectedBytes}`);

  const dataOffset = 11;
  const expectedLength = dataOffset + expectedBytes;
  if (buffer.length < expectedLength) throw new Error(`PLC data too short: ${buffer.length}/${expectedLength} bytes`);

  return Array.from({ length: wordCount }, (_, index) => buffer.readUInt16LE(dataOffset + index * 2));
}

function buildModbusReadHoldingRegistersFrame(startAddress, wordCount) {
  const buffer = Buffer.alloc(12);
  modbusTransactionId = (modbusTransactionId + 1) & 0xffff;

  buffer.writeUInt16BE(modbusTransactionId, 0); // transaction id
  buffer.writeUInt16BE(0, 2); // protocol id
  buffer.writeUInt16BE(6, 4); // remaining bytes
  buffer.writeUInt8(1, 6); // unit id
  buffer.writeUInt8(3, 7); // read holding registers
  buffer.writeUInt16BE(startAddress, 8);
  buffer.writeUInt16BE(wordCount, 10);

  return buffer;
}

function parseModbusReadHoldingRegistersResponse(buffer, wordCount) {
  if (buffer.length < 9) throw new Error(`Modbus response too short: ${buffer.length} bytes`);

  const protocolId = buffer.readUInt16BE(2);
  if (protocolId !== 0) throw new Error(`Modbus protocol id ${protocolId}`);

  const functionCode = buffer.readUInt8(7);
  if (functionCode & 0x80) {
    const exceptionCode = buffer.length > 8 ? buffer.readUInt8(8) : 0;
    throw new Error(`Modbus exception ${exceptionCode}`);
  }

  if (functionCode !== 3) throw new Error(`Modbus function code ${functionCode}`);

  const byteCount = buffer.readUInt8(8);
  const expectedByteCount = wordCount * 2;
  if (byteCount < expectedByteCount) throw new Error(`Modbus data too short: ${byteCount}/${expectedByteCount} bytes`);

  return Array.from({ length: wordCount }, (_, index) => buffer.readUInt16BE(9 + index * 2));
}

function readDWords(startAddress, wordCount) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let settled = false;

    const finish = (error, words) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(words);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("timeout", () => finish(new Error("PLC connection timeout")));
    socket.once("error", error => finish(error));
    socket.on("data", chunk => {
      chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data.length >= 9) {
        const responseDataLength = data.readUInt16LE(7);
        const fullLength = 9 + responseDataLength;
        if (data.length >= fullLength) {
          try {
            finish(null, parseReadWordsResponse(data, wordCount));
          } catch (error) {
            finish(error);
          }
        }
      }
    });

    socket.connect(PLC_PORT, PLC_HOST, () => {
      socket.write(buildReadDWordsFrame(startAddress, wordCount));
    });
  });
}

function readModbusHoldingRegisters(startAddress, wordCount) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let settled = false;

    const finish = (error, words) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(words);
    };

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("timeout", () => finish(new Error("PLC connection timeout")));
    socket.once("error", error => finish(error));
    socket.on("data", chunk => {
      chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data.length >= 6) {
        const fullLength = 6 + data.readUInt16BE(4);
        if (data.length >= fullLength) {
          try {
            finish(null, parseModbusReadHoldingRegistersResponse(data, wordCount));
          } catch (error) {
            finish(error);
          }
        }
      }
    });

    socket.connect(PLC_PORT, PLC_HOST, () => {
      socket.write(buildModbusReadHoldingRegistersFrame(startAddress, wordCount));
    });
  });
}

function readPlcWords(startAddress, wordCount) {
  if (PLC_PROTOCOL === "mc" || PLC_PROTOCOL === "mc-3e") {
    return readDWords(startAddress, wordCount);
  }

  if (PLC_PROTOCOL === "modbus" || PLC_PROTOCOL === "modbus-tcp") {
    return readModbusHoldingRegisters(startAddress, wordCount);
  }

  throw new Error(`Unsupported PLC protocol ${PLC_PROTOCOL}`);
}

async function readDWordsInChunks(startAddress, wordCount) {
  try {
    return await readPlcWords(startAddress, wordCount);
  } catch (error) {
    if (wordCount <= READ_CHUNK_SIZE) throw error;

    logError(`PLC batch read ${PLC_DEVICE}${startAddress}-${PLC_DEVICE}${startAddress + wordCount - 1} failed, retrying in ${READ_CHUNK_SIZE}-word chunks`, error);
  }

  const words = [];
  for (let offset = 0; offset < wordCount; offset += READ_CHUNK_SIZE) {
    const chunkStart = startAddress + offset;
    const chunkCount = Math.min(READ_CHUNK_SIZE, wordCount - offset);
    const chunkWords = await readPlcWords(chunkStart, chunkCount);
    words.push(...chunkWords);
  }

  return words;
}

async function pollPlc() {
  const startAddress = READ_START_REGISTER;
  const wordCount = READ_COUNT;

  try {
    const words = await readDWordsInChunks(startAddress, wordCount);
    const statuses = PIN_SOURCE_REGISTERS.map((sourceRegister, index) => {
      const register = PIN_DISPLAY_REGISTERS[index];
      const raw = words[sourceRegister - startAddress];
      const status = normalizeStatus(raw);
      return {
        id: `15pin${index + 1}`,
        register: `${PLC_DEVICE}${register}`,
        sourceRegister: `${PLC_DEVICE}${sourceRegister}`,
        address: register,
        sourceAddress: sourceRegister,
        raw,
        status,
        label: statusLabel(status),
        pass: status === 4 ? true : status === 5 ? false : null,
      };
    });

    cache = attachRegisterValues(buildSnapshot(statuses, true, undefined), startAddress, words);
    logSnapshotIfChanged(cache);
  } catch (error) {
    cache = attachRegisterValues(makeEmptySnapshot(error instanceof Error ? error.message : "PLC read failed"), startAddress);
    logSnapshotIfChanged(cache);
    logError("PLC poll failed", error);
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  logInfo("HTTP request", { method: request.method, path: url.pathname });

  if (url.pathname === "/api/inspection1/current") {
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
    response.end(JSON.stringify({ ok: true, plc: cache.plc }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Inspection PLC backend listening on http://localhost:${PORT}`);
  console.log(`Polling ${PLC_HOST}:${PLC_PORT} via ${PLC_PROTOCOL} registers ${PLC_DEVICE}${READ_START_REGISTER}-${PLC_DEVICE}${READ_END_REGISTER} every ${POLL_MS}ms`);
  console.log(`Mapping inspection pins ${PIN_DISPLAY_REGISTERS.map((register, index) => `${PLC_DEVICE}${register}<=${PLC_DEVICE}${PIN_SOURCE_REGISTERS[index]}`).join(", ")}`);
  pollPlc();
  setInterval(pollPlc, POLL_MS);
});
