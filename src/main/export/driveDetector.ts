import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import { DriveInfo } from '../../shared/types/export';

const execAsync = util.promisify(exec);

export class DriveDetector {
  /**
   * Discovers available logical drives and classifies them as fixed or removable (USB, SD card, external drive).
   */
  static async getAvailableDrives(): Promise<DriveInfo[]> {
    if (process.platform === 'win32') {
      try {
        const cmd = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID, DriveType, VolumeName, Size, FreeSpace | ConvertTo-Json"';
        const { stdout } = await execAsync(cmd, { timeout: 3000 });
        if (!stdout || !stdout.trim()) return this.fallbackDrives();

        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];

        const results: DriveInfo[] = [];
        for (const item of list) {
          if (!item.DeviceID) continue;
          const mount = item.DeviceID.toUpperCase(); // e.g. "E:"
          const driveType = Number(item.DriveType); // 2 = Removable, 3 = Fixed, 4 = Network, 5 = Optical
          const isRemovable = driveType === 2;
          const label = item.VolumeName || (isRemovable ? 'Removable Drive' : 'Local Disk');

          results.push({
            mount,
            label: `${label} (${mount})`,
            isRemovable,
            freeBytes: item.FreeSpace ? Number(item.FreeSpace) : undefined,
            totalBytes: item.Size ? Number(item.Size) : undefined,
          });
        }
        return results;
      } catch (err) {
        console.warn('[DriveDetector] PowerShell disk query failed, using fallback detection:', err);
        return this.fallbackDrives();
      }
    } else {
      // Unix/macOS fallback
      return [
        {
          mount: '/',
          label: 'Root Drive (/)',
          isRemovable: false,
        },
      ];
    }
  }

  private static fallbackDrives(): DriveInfo[] {
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const found: DriveInfo[] = [];

    for (const letter of letters) {
      const driveRoot = `${letter}:\\`;
      try {
        if (fs.existsSync(driveRoot)) {
          found.push({
            mount: `${letter}:`,
            label: letter === 'C' ? 'System Drive (C:)' : `Drive (${letter}:)`,
            isRemovable: letter !== 'C',
          });
        }
      } catch {
        // Not mounted or inaccessible
      }
    }

    return found;
  }
}
