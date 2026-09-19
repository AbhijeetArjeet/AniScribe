import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

export interface SidecarRequest {
  action: 'ping' | 'vad' | 'asr' | 'translate' | 'text_translate' | 'probe_hardware';
  id?: string;
  audio_path?: string;
  japanese_text?: string;
  text?: string;
  source_language?: string;
  target_language?: string;
  language?: string;
  tier?: 'balanced' | 'quality' | 'light';
  start_sec?: number;
  end_sec?: number;
  device?: 'cuda' | 'cpu';
}

export interface SidecarResponse<T = any> {
  id: string;
  success: boolean;
  result?: T;
  error?: string;
  is_oom?: boolean;
}

export class InferenceSidecarManager {
  private workerProcess: ChildProcess | null = null;
  private pendingRequests = new Map<string, {
    resolve: (res: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    req: SidecarRequest;
  }>();
  private isRestarting = false;
  private pythonPath: string;

  constructor() {
    this.pythonPath = this.detectPythonPath();
  }

  private detectPythonPath(): string {
    if (fs.existsSync('C:\\Python314\\python.exe')) {
      return 'C:\\Python314\\python.exe';
    }
    return 'python';
  }

  public ensureWorkerStarted(): void {
    if (this.workerProcess && !this.workerProcess.killed) {
      return;
    }

    // Check for compiled standalone binary first (no host Python required in production)
    const baseBinDir = (process as any).resourcesPath
      ? path.join((process as any).resourcesPath, 'bin')
      : path.join(process.cwd(), 'resources', 'bin');

    const onedirExe = path.join(baseBinDir, 'inferenceWorker', 'inferenceWorker.exe');
    const directExe = path.join(baseBinDir, 'inferenceWorker.exe');

    let standaloneExePath: string | null = null;
    if (fs.existsSync(onedirExe)) {
      standaloneExePath = onedirExe;
    } else if (fs.existsSync(directExe)) {
      standaloneExePath = directExe;
    }

    const hasStandaloneExe = standaloneExePath !== null;

    const workerScript = path.join(__dirname, 'inferenceWorker.py');
    const scriptPath = fs.existsSync(workerScript) 
      ? workerScript 
      : path.join(process.cwd(), 'src', 'main', 'ai', 'sidecar', 'inferenceWorker.py');

    if (!hasStandaloneExe && !fs.existsSync(scriptPath)) {
      return;
    }

    const spawnCmd = hasStandaloneExe ? standaloneExePath! : this.pythonPath;
    const spawnArgs = hasStandaloneExe ? [] : [scriptPath];

    this.workerProcess = spawn(spawnCmd, spawnArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_DATASETS_OFFLINE: '1',
        DISABLE_TELEMETRY: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    if (this.workerProcess.stdout) {
      const rl = readline.createInterface({ input: this.workerProcess.stdout });
      rl.on('line', (line) => {
        try {
          const res = JSON.parse(line) as SidecarResponse;
          const pending = this.pendingRequests.get(res.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(res.id);
            if (res.success) {
              pending.resolve(res.result);
            } else {
              const err = new Error(res.error || 'Sidecar execution failure');
              (err as any).isOom = res.is_oom;
              pending.reject(err);
            }
          }
        } catch {
          // Ignore invalid non-JSON log lines
        }
      });
    }

    this.workerProcess.on('exit', (code, signal) => {
      this.workerProcess = null;
      // Reject all in-flight pending requests with an informative error
      for (const [id, p] of this.pendingRequests.entries()) {
        clearTimeout(p.timer);
        p.reject(new Error(`Inference sidecar exited unexpectedly (code: ${code}, signal: ${signal})`));
      }
      this.pendingRequests.clear();
    });
  }

  /**
   * Dispatches a request to the isolated sidecar with automatic OOM retry and CPU fallback
   */
  public async executeWithOomRetry<T = any>(req: SidecarRequest, chunkDurationFloorSec = 4.0): Promise<T> {
    this.ensureWorkerStarted();

    if (!this.workerProcess || !this.workerProcess.stdin) {
      throw new Error('Inference sidecar is not available');
    }

    try {
      return await this.dispatch<T>(req);
    } catch (err: any) {
      // Check if OOM occurred
      if (err.isOom || (err.message && err.message.toLowerCase().includes('out of memory'))) {
        console.warn('[SidecarManager] OOM detected. Executing dynamic retry strategy...');
        
        // Attempt 1: If chunk is longer than floor, halve the chunk duration
        const curDuration = (req.end_sec ?? 0) - (req.start_sec ?? 0);
        if (curDuration > chunkDurationFloorSec * 1.5) {
          const halved = Math.max(chunkDurationFloorSec, curDuration / 2);
          console.warn(`[SidecarManager] Halving chunk size to ${halved.toFixed(1)}s (floor: ${chunkDurationFloorSec}s)`);
          return this.dispatch<T>({
            ...req,
            end_sec: (req.start_sec ?? 0) + halved,
          });
        }

        // Attempt 2: If at or below floor, dynamically fall back to CPU
        console.warn('[SidecarManager] Chunk at floor. Falling back stage to CPU...');
        return this.dispatch<T>({
          ...req,
          device: 'cpu',
        });
      }
      throw err;
    }
  }

  private dispatch<T = any>(req: SidecarRequest, timeoutMs = 30000): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = `sidecar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const payload: SidecarRequest = { ...req, id };

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Inference request ${id} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer, req });

      if (this.workerProcess && this.workerProcess.stdin) {
        this.workerProcess.stdin.write(JSON.stringify(payload) + '\n');
      } else {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(new Error('Inference sidecar stdin closed'));
      }
    });
  }

  public shutdown(): void {
    if (this.workerProcess) {
      this.workerProcess.kill('SIGTERM');
      this.workerProcess = null;
    }
  }
}
