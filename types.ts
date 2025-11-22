export interface ProcessingState {
  isProcessing: boolean;
  progress: number; // 0 to 100
  stage: 'idle' | 'recording' | 'transcoding' | 'completed' | 'error';
  errorMessage?: string;
}

export interface VideoConfig {
  textOverlay: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
}

export enum AspectRatio {
  NINE_SIXTEEN = '9:16',
}