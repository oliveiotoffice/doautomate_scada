const {
  AREA_START,
  STATION_OFFSETS,
  dateTimeToWords,
  floatToWords,
  makeConfig,
  setWords,
  stringToWords,
  uint32ToWords,
  writeWordsInChunks,
} = require("./plc-layout");

const MODEL_END = 10399;
const WRITE_COUNT = MODEL_END - AREA_START + 1;
const DEFAULT_WRITE_INTERVAL_MS = 3000;
const DEFAULT_ERROR_DELAY_MS = 10000;
const MODEL_NUMBERS = [6630865, 6630867, 6630862];
const PLUG_ACTUAL = 14.493;
const SPECS = {
  outerDiameter: { min: 34.975, max: 35.025 },
  overallLength: { min: 465.900, max: 466.100 },
  dowelLength: { min: 458.900, max: 459.100 },
  apg122Diameter: { min: 12.175, max: 12.225 },
  gaugeDowelToDowel: { min: 445.134, max: 445.135 },
  plug: { min: 14.285, max: 14.311 },
  dowel: { min: 4.967, max: 4.993 },
  ball: { min: 6.285, max: 6.310 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randBool() {
  return Math.random() >= 0.2 ? 1 : 0;
}

function randFloat(min, max, decimals = 3) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function stationBase(stationNo) {
  return AREA_START + STATION_OFFSETS[stationNo];
}

function writeCommonArea(area, modelNo) {
  const total = randInt(90, 140);
  const notOk = randInt(0, 12);

  setWords(area, 10000, [randInt(1, 3)]);
  setWords(area, 10001, stringToWords(`OP-${randInt(1000, 9999)}`, 10));
  setWords(area, 10011, uint32ToWords(modelNo));
  setWords(area, 10013, uint32ToWords(randInt(1000000, 9999999)));
  setWords(area, 10020, dateTimeToWords(new Date()));
  setWords(area, 10030, [total]);
  setWords(area, 10031, [total - notOk]);
  setWords(area, 10032, [notOk]);
}

function writeFloatValue(area, address, actual) {
  setWords(area, address, floatToWords(actual));
}

function writeFloatParameter(area, address, spec, actual) {
  writeFloatValue(area, address, spec.min);
  writeFloatValue(area, address + 2, spec.max);
  writeFloatValue(area, address + 4, actual);
}

function writeStation1(area, base) {
  writeFloatParameter(area, base + 0, SPECS.outerDiameter, randFloat(34.960, 35.040));
  writeFloatParameter(area, base + 6, SPECS.outerDiameter, randFloat(34.960, 35.040));
  writeFloatParameter(area, base + 12, SPECS.overallLength, randFloat(465.850, 466.150));
  writeFloatParameter(area, base + 18, SPECS.dowelLength, randFloat(458.850, 459.150));
  writeFloatParameter(area, base + 24, SPECS.apg122Diameter, randFloat(12.160, 12.240));
  setWords(area, base + 30, [randBool()]);
  writeFloatParameter(area, base + 31, SPECS.gaugeDowelToDowel, randFloat(SPECS.gaugeDowelToDowel.min, SPECS.gaugeDowelToDowel.max, 3));
}

function writeStation2(area, base) {
  for (let offset = 0; offset <= 20; offset += 1) {
    setWords(area, base + offset, [randBool()]);
  }
}

function writeStation3(area, base, modelNo) {
  setWords(area, base + 0, [randBool()]);
  setWords(area, base + 1, [randBool()]);
  setWords(area, base + 2, [randBool()]);
  setWords(area, base + 10, stringToWords(`QR${modelNo}-${randInt(100, 999)}`, 10));
}

function writeStation5(area, base) {
  writeFloatParameter(area, base + 0, SPECS.plug, PLUG_ACTUAL);
  writeFloatParameter(area, base + 6, SPECS.plug, PLUG_ACTUAL);
}

function writeStation6(area, base) {
  writeFloatParameter(area, base + 0, SPECS.dowel, randFloat(4.950, 5.010));
  writeFloatParameter(area, base + 6, SPECS.dowel, randFloat(4.950, 5.010));
  writeFloatParameter(area, base + 12, SPECS.ball, randFloat(SPECS.ball.min, SPECS.ball.max));
  writeFloatParameter(area, base + 18, SPECS.ball, randFloat(SPECS.ball.min, SPECS.ball.max));
}

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildRandomInspectionArea() {
  const modelNo = MODEL_NUMBERS[randInt(0, MODEL_NUMBERS.length - 1)];
  const area = Array.from({ length: WRITE_COUNT }, () => 0);

  writeCommonArea(area, modelNo);

  writeStation1(area, stationBase(1));
  writeStation2(area, stationBase(2));
  writeStation3(area, stationBase(3), modelNo);
  writeStation5(area, stationBase(5));
  writeStation6(area, stationBase(6));

  return area;
}

async function writeOnce(config, cycleNo, verbose) {
  const area = buildRandomInspectionArea();
  const startAddress = AREA_START;
  const endAddress = startAddress + area.length - 1;

  console.log(`[${new Date().toISOString()}] Cycle ${cycleNo}: writing ${config.device}${startAddress}-${config.device}${endAddress}`);

  await writeWordsInChunks(config, startAddress, area, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function main() {
  const config = makeConfig();
  const probeOnly = process.argv.includes("--probe");
  const once = process.argv.includes("--once") || probeOnly;
  const verbose = process.argv.includes("--verbose") || probeOnly;
  const intervalMs = envNumber("PLC_WRITE_INTERVAL_MS", DEFAULT_WRITE_INTERVAL_MS);
  const errorDelayMs = envNumber("PLC_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);

  console.log(`Writing random inspection data to ${config.host}:${config.port}`);
  console.log(`Protocol: MC 3E binary, device ${config.device}, universal layout, range ${config.device}${AREA_START}-${config.device}${MODEL_END}`);
  console.log(`Chunk size: ${config.chunkSize} registers, chunk delay: ${config.chunkDelayMs}ms, retries: ${config.chunkRetries}`);
  console.log(once ? "Mode: one write" : `Mode: continuous write every ${intervalMs}ms`);

  if (probeOnly) console.log("Probe mode: writing only SHIFT at D10000.");

  if (probeOnly) {
    await writeWordsInChunks(config, AREA_START, [randInt(1, 3)], (chunkStart, count) => {
      console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`);
    });
    console.log("Probe write complete.");
    return;
  }

  let cycleNo = 1;
  while (true) {
    try {
      await writeOnce(config, cycleNo, verbose);
      console.log(`[${new Date().toISOString()}] Cycle ${cycleNo}: write complete`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] Cycle ${cycleNo}: PLC write failed: ${message}`);
      if (once) throw error;
      console.error(`[${new Date().toISOString()}] Waiting ${errorDelayMs}ms before retry`);
      await sleep(errorDelayMs);
    }

    if (once) return;
    cycleNo += 1;
    await sleep(intervalMs);
  }
}

main().catch(error => {
  console.error("PLC write failed:", error.message);
  process.exitCode = 1;
});
