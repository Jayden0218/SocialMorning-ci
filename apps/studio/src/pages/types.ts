// Shared data shapes for episode rows and pages of episodes.
export type EpisodeRow = {
  id: string; title: string; publishedAt: string | null; plays: number; completionRate: number | null;
  comments: number; shares: number; saves: number; likes: number;
};
export type EpisodePage = { total: number; page: number; pageSize: number; items: EpisodeRow[] };
