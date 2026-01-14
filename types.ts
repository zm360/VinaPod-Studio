
export enum AppStep {
  UPLOAD = 'UPLOAD',
  HOST_SETUP = 'HOST_SETUP',
  SERIES_PLAN = 'SERIES_PLAN',
  SCRIPT_EDITOR = 'SCRIPT_EDITOR',
  AUDIO_GENERATION = 'AUDIO_GENERATION'
}

export interface Host {
  name: string;
  personality: string;
  voice: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
}

export interface EpisodeOutline {
  id: number;
  title: string;
  summary: string;
  durationEstimate: string;
}

export interface ScriptLine {
  time: string;
  speaker: string;
  text: string;
  emotion: string;
}

export interface PodcastSeries {
  title: string;
  description: string;
  episodes: EpisodeOutline[];
}
