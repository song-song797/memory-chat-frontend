import Icon from './Icons';

interface SearchIndicatorProps {
  status: 'searching' | 'results' | null;
  query?: string;
  urls?: string[];
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function SearchIndicator({ status, query, urls }: SearchIndicatorProps) {
  if (!status) return null;

  if (status === 'searching') {
    return (
      <div className="search-indicator">
        <span className="search-indicator-spinner" aria-hidden="true" />
        <span className="search-indicator-text">
          正在搜索: {query ?? '...'}
        </span>
      </div>
    );
  }

  if (status === 'results' && urls && urls.length > 0) {
    const displayUrls = urls.slice(0, 3);
    const remaining = urls.length - displayUrls.length;

    return (
      <div className="search-indicator">
        <Icon name="globe" />
        <span className="search-indicator-text">
          搜索完成:
          {displayUrls.map((url, i) => (
            <span key={i} className="search-indicator-domain">
              {extractDomain(url)}
            </span>
          ))}
          {remaining > 0 && (
            <span className="search-indicator-domain">+{remaining} 更多</span>
          )}
        </span>
      </div>
    );
  }

  return null;
}
