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
const PORT = Number(process.env.INSPECTION_BACKEND_PORT || 4000);
const PLC_HOST = process.env.PLC_HOST || "192.168.3.39";
const PLC_PORT = Number(process.env.PLC_PORT || 502);
const POLL_MS = Number(process.env.PLC_POLL_MS || 5000);
const CONNECT_TIMEOUT_MS = Number(process.env.PLC_CONNECT_TIMEOUT_MS || 5000);
const COMPONENT_NUMBER = process.env.COMPONENT_NUMBER || "Co-6630865";
const MODEL_NUMBER = process.env.MODEL_NUMBER || "Shaft-6630865";
const SHAFT_NUMBER = process.env.SHAFT_NUMBER || "-";
const OPERATOR_ID = process.env.OPERATOR_ID || "-";

const DEVICE_CODES = {
  D: 0xa8,
};

const PIN_REGISTERS = Array.from({ length: 15 }, (_, index) => 102 + index * 2);
const VALID_STATUS = new Set([2, 4, 5]);

let cache = makeEmptySnapshot("PLC polling not started");

function makeEmptySnapshot(message) {
  const statuses = PIN_REGISTERS.map((register, index) => ({
    id: `15pin${index + 1}`,
    register: `D${register}`,
    address: register,
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
      connected,
      pollMs: POLL_MS,
      message,
      updatedAt: new Date().toISOString(),
    },
  };
}

function buildReadDWordsFrame(startAddress, wordCount) {
  const requestDataLength = 12;
  const buffer = Buffer.alloc(9 + requestDataLength);
  let offset = 0;

  buffer.writeUInt16LE(0x5000, offset); offset += 2; // 3E binary subheader
  buffer.writeUInt8(0x00, offset++); // network
  buffer.writeUInt8(0xff, offset++); // PC
  buffer.writeUInt16LE(0x03ff, offset); offset += 2; // request destination module I/O
  buffer.writeUInt8(0x00, offset++); // station
  buffer.writeUInt16LE(requestDataLength, offset); offset += 2;
  buffer.writeUInt16LE(0x0010, offset); offset += 2; // monitoring timer
  buffer.writeUInt16LE(0x0401, offset); offset += 2; // batch read
  buffer.writeUInt16LE(0x0000, offset); offset += 2; // word device
  buffer.writeUIntLE(startAddress, offset, 3); offset += 3;
  buffer.writeUInt8(DEVICE_CODES.D, offset++);
  buffer.writeUInt16LE(wordCount, offset);

  return buffer;
}

function parseReadWordsResponse(buffer, wordCount) {
  if (buffer.length < 11) throw new Error(`PLC response too short: ${buffer.length} bytes`);

  const endCode = buffer.readUInt16LE(9);
  if (endCode !== 0) throw new Error(`PLC end code 0x${endCode.toString(16)}`);

  const dataOffset = 11;
  const expectedLength = dataOffset + wordCount * 2;
  if (buffer.length < expectedLength) throw new Error(`PLC data too short: ${buffer.length}/${expectedLength} bytes`);

  return Array.from({ length: wordCount }, (_, index) => buffer.readUInt16LE(dataOffset + index * 2));
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

async function pollPlc() {
  const startAddress = PIN_REGISTERS[0];
  const wordCount = PIN_REGISTERS[PIN_REGISTERS.length - 1] - startAddress + 1;

  try {
    const words = await readDWords(startAddress, wordCount);
    const statuses = PIN_REGISTERS.map((register, index) => {
      const raw = words[register - startAddress];
      const status = normalizeStatus(raw);
      return {
        id: `15pin${index + 1}`,
        register: `D${register}`,
        address: register,
        raw,
        status,
        label: statusLabel(status),
        pass: status === 4 ? true : status === 5 ? false : null,
      };
    });

    cache = buildSnapshot(statuses, true, undefined);
  } catch (error) {
    cache = makeEmptySnapshot(error instanceof Error ? error.message : "PLC read failed");
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

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
  console.log(`Polling ${PLC_HOST}:${PLC_PORT} registers ${PIN_REGISTERS.map(register => `D${register}`).join(", ")} every ${POLL_MS}ms`);
  pollPlc();
  setInterval(pollPlc, POLL_MS);
});