/**
 * Web Audio Voice Activity Detection (VAD) and Audio Analysis Helper
 */
export class AudioActivityDetector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private dataArray: Uint8Array | null = null;
  private isDetecting = false;
  private animFrameId: number | null = null;

  constructor(
    private videoElement: HTMLVideoElement,
    private onSpeechDetected: (energy: number) => void
  ) {}

  public start(existingAudioCtx?: AudioContext): void {
    if (this.isDetecting) return;

    try {
      this.audioCtx = existingAudioCtx || new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;

      // Note: createMediaElementSource can only be called once per media element.
      // If already connected by gain node, we tap from the graph.
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.isDetecting = true;

      this.loop();
    } catch (e) {
      console.warn('[AudioActivityDetector] Could not initialize Web Audio VAD:', e);
    }
  }

  public connectSource(source: AudioNode): void {
    if (this.analyser) {
      try {
        source.connect(this.analyser);
      } catch (e) {
        console.warn('[AudioActivityDetector] Connect error:', e);
      }
    }
  }

  private loop = (): void => {
    if (!this.isDetecting || !this.analyser || !this.dataArray) return;

    (this.analyser as any).getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;
    const normalizedEnergy = average / 255;

    // Threshold for dialogue / voice energy
    if (normalizedEnergy > 0.04) {
      this.onSpeechDetected(normalizedEnergy);
    }

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  public stop(): void {
    this.isDetecting = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}
