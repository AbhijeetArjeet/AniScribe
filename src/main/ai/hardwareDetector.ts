import os from 'os';
import { execSync } from 'child_process';
import { HardwareInfo, QualityTier } from '../../shared/types/offlineEngine';

export class HardwareDetector {
  private cachedInfo: HardwareInfo | null = null;

  public async getHardwareInfo(): Promise<HardwareInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo;
    }

    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
    const cpuCores = cpus.length;
    const totalRamMB = Math.round(os.totalmem() / (1024 * 1024));
    const availableRamMB = Math.round(os.freemem() / (1024 * 1024));

    let gpuName = 'Generic Display Adapter';
    let vramTotalMB = 0;
    let vramAvailableMB = 0;
    let cudaAvailable = false;
    let cudaVersion: string | undefined;

    // 1. Check nvidia-smi for NVIDIA GPUs (e.g. RTX 2050)
    try {
      const smiOutput = execSync('nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits', {
        timeout: 3000,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const parts = smiOutput.trim().split(',').map((p) => p.trim());
      if (parts.length >= 3) {
        gpuName = parts[0];
        vramTotalMB = parseInt(parts[1], 10) || 0;
        vramAvailableMB = parseInt(parts[2], 10) || 0;
        cudaAvailable = true;
        if (parts[3]) cudaVersion = parts[3];
      }
    } catch {
      // nvidia-smi not in PATH or not an NVIDIA card; try Windows CIM/WMI
      try {
        const psCommand = `powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json"`;
        const psOut = execSync(psCommand, {
          timeout: 4000,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        const parsed = JSON.parse(psOut);
        const controllers = Array.isArray(parsed) ? parsed : [parsed];
        // Prefer dedicated controller (highest AdapterRAM)
        controllers.sort((a, b) => (b.AdapterRAM || 0) - (a.AdapterRAM || 0));
        if (controllers.length > 0 && controllers[0].Name) {
          gpuName = controllers[0].Name;
          const ramBytes = controllers[0].AdapterRAM || 0;
          vramTotalMB = Math.round(ramBytes / (1024 * 1024));
          vramAvailableMB = Math.round(vramTotalMB * 0.75); // estimate
          if (gpuName.toLowerCase().includes('nvidia') || gpuName.toLowerCase().includes('geforce') || gpuName.toLowerCase().includes('rtx')) {
            cudaAvailable = true;
          }
        }
      } catch {
        // Fallback defaults
      }
    }

    // Determine recommendations based on measured hardware
    let recommendedTier: QualityTier = 'ultra_light';
    let recommendedDevice: 'cuda' | 'cpu' = 'cpu';
    let recommendedQuantization: 'none' | 'int8' | 'int4' | 'fp16' | 'fp32' = 'int8';

    if (cudaAvailable && vramTotalMB >= 3500) {
      // Perfect profile for RTX 2050 (4GB VRAM) / RTX 3050
      recommendedDevice = 'cuda';
      recommendedTier = vramTotalMB >= 6000 ? 'quality' : 'balanced';
      recommendedQuantization = vramTotalMB >= 6000 ? 'fp16' : 'int8';
    } else if (totalRamMB >= 15000 && cpuCores >= 8) {
      recommendedDevice = 'cpu';
      recommendedTier = 'balanced';
      recommendedQuantization = 'int8';
    } else {
      recommendedDevice = 'cpu';
      recommendedTier = 'ultra_light';
      recommendedQuantization = 'int8';
    }

    this.cachedInfo = {
      cpuModel,
      cpuCores,
      totalRamMB,
      availableRamMB,
      gpuName,
      vramTotalMB,
      vramAvailableMB,
      cudaAvailable,
      cudaVersion,
      recommendedTier,
      recommendedDevice,
      recommendedQuantization,
    };

    return this.cachedInfo;
  }
}
