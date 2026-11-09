import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { Hardware } from "../shared/mesh";

const exec = promisify(execFile);

function gb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
}

export async function readHardware(): Promise<Hardware> {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const hardware: Hardware = {
    ramPercent: total > 0 ? Math.round((used / total) * 100) : 0,
    ramUsedGb: gb(used),
    ramTotalGb: gb(total),
    vramUsedMb: null,
    vramTotalMb: null,
    gpuPercent: null,
  };
  try {
    const { stdout } = await exec("nvidia-smi", ["--query-gpu=memory.used,memory.total,utilization.gpu", "--format=csv,noheader,nounits"], {
      timeout: 1500,
    });
    const line = stdout.trim().split("\n")[0] ?? "";
    const [usedMb, totalMb, util] = line.split(",").map((part) => Number(part.trim()));
    if (Number.isFinite(usedMb) && Number.isFinite(totalMb)) {
      hardware.vramUsedMb = usedMb;
      hardware.vramTotalMb = totalMb;
      hardware.gpuPercent = Number.isFinite(util) ? util : null;
    }
  } catch {
    hardware.vramUsedMb = null;
  }
  return hardware;
}
