import { getScoreColor, getScoreBg } from '../../lib/constants.js';

export function ScoreBadge({ score, size = 'md', thresholds }) {
  const sizes = {
    sm: 'text-base px-2 py-0.5',
    md: 'text-lg px-3 py-1',
    lg: 'text-2xl px-4 py-1.5',
    xl: 'text-5xl font-sans font-semibold',
  };
  return (
    <span className={`inline-block font-mono font-medium ${getScoreColor(score, thresholds)} ${sizes[size]}`}>
      {score?.toFixed(2) ?? '—'}
    </span>
  );
}

export function ScoreBar({ score, thresholds = { attention: 6.5, critical: 5.0 } }) {
  const percent = Math.min(100, (score / 10) * 100);
  return (
    <div className="w-full h-1.5 bg-slate-200 overflow-hidden rounded-full">
      <div
        className={`h-full ${getScoreBg(score, thresholds)} transition-all duration-500`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
